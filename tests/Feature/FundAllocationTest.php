<?php

namespace Tests\Feature;

use App\Models\CashBankAccount;
use App\Models\ExpenseCategory;
use App\Models\FundAllocation;
use App\Models\Permission;
use App\Models\PettyCashTransaction;
use App\Models\Role;
use App\Models\User;
use App\Services\FundAllocationService;
use App\Support\WeekPeriod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class FundAllocationTest extends TestCase
{
    use RefreshDatabase;

    protected User $finance;
    protected User $viewer;
    protected ExpenseCategory $category;
    protected FundAllocationService $service;

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'fund_allocation.view', 'fund_allocation.create',
            'petty_cash.view', 'petty_cash.create',
        ] as $name) {
            Permission::firstOrCreate(['name' => $name]);
        }

        $financeRole = Role::firstOrCreate(['name' => 'Finance']);
        $financeRole->permissions()->sync(Permission::all()->pluck('id'));

        $viewerRole = Role::firstOrCreate(['name' => 'Management']);
        $viewerRole->permissions()->sync(
            Permission::where('name', 'fund_allocation.view')->pluck('id')
        );

        $this->finance = User::create([
            'name'     => 'Finance User',
            'email'    => 'finance-fund@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $financeRole->id,
            'status'   => 'active',
        ]);

        $this->viewer = User::create([
            'name'     => 'Management User',
            'email'    => 'management-fund@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $viewerRole->id,
            'status'   => 'active',
        ]);

        $this->category = ExpenseCategory::create([
            'code'       => 'KNS',
            'name'       => 'Konsumsi',
            'status'     => 'active',
            'created_by' => $this->finance->id,
        ]);

        $this->service = app(FundAllocationService::class);
    }

    /** Tanggal berapa pun dibulatkan ke minggu Senin–Minggu. */
    public function test_period_is_normalised_to_monday_of_that_week(): void
    {
        $this->actingAs($this->finance)->post('/fund-allocations', [
            'fund_type'    => 'petty_cash',
            'period_start' => '2026-08-06', // Kamis
            'amount'       => 1000000,
        ])->assertRedirect();

        $allocation = FundAllocation::first();

        $this->assertSame('2026-08-03', $allocation->period_start->format('Y-m-d'));
        $this->assertSame('2026-08-09', $allocation->period_end->format('Y-m-d'));
    }

    /** Sisa dana = pengisian minggu itu dikurangi pengeluaran yang berjalan. */
    public function test_summary_counts_only_transactions_of_the_same_fund_and_week(): void
    {
        $period = WeekPeriod::containing('2026-08-05');

        $this->service->create([
            'fund_type'    => 'petty_cash',
            'period_start' => $period->startDate(),
            'amount'       => 1000000,
        ], $this->finance->id);

        $this->makeTransaction('petty_cash', '2026-08-05', 250000);
        // Jenis dana berbeda — tidak boleh ikut mengurangi petty cash.
        $this->makeTransaction('dana_kelola', '2026-08-05', 400000);
        // Minggu berikutnya — juga tidak ikut.
        $this->makeTransaction('petty_cash', '2026-08-12', 300000);

        $summary = $this->service->summary('petty_cash', '2026-08-05');

        $this->assertEquals(1000000, $summary['allocated']);
        $this->assertEquals(250000, $summary['used']);
        $this->assertEquals(750000, $summary['remaining']);
        $this->assertFalse($summary['over_budget']);
    }

    public function test_summary_flags_over_budget_week(): void
    {
        $period = WeekPeriod::containing('2026-08-05');

        $this->service->create([
            'fund_type'    => 'petty_cash',
            'period_start' => $period->startDate(),
            'amount'       => 200000,
        ], $this->finance->id);

        $this->makeTransaction('petty_cash', '2026-08-06', 350000);

        $summary = $this->service->summary('petty_cash', '2026-08-05');

        $this->assertTrue($summary['over_budget']);
        $this->assertEquals(-150000, $summary['remaining']);
    }

    /** Dana yang diserahkan ke Finance memotong saldo rekening sumber. */
    public function test_allocation_deducts_source_account_balance(): void
    {
        $account = CashBankAccount::create([
            'account_code'    => '101-FUND',
            'account_name'    => 'Kas Operasional',
            'account_type'    => 'cash',
            'current_balance' => 5000000,
            'status'          => 'active',
            'created_by'      => $this->finance->id,
        ]);

        $this->service->create([
            'fund_type'            => 'petty_cash',
            'period_start'         => '2026-08-03',
            'amount'               => 1500000,
            'cash_bank_account_id' => $account->id,
        ], $this->finance->id);

        $this->assertEquals(3500000, (float) $account->fresh()->current_balance);
    }

    public function test_allocation_cannot_be_deleted_after_money_is_spent(): void
    {
        $allocation = $this->service->create([
            'fund_type'    => 'petty_cash',
            'period_start' => '2026-08-03',
            'amount'       => 500000,
        ], $this->finance->id);

        $this->makeTransaction('petty_cash', '2026-08-04', 100000);

        $this->expectException(\InvalidArgumentException::class);
        $this->service->delete($allocation);
    }

    public function test_user_without_create_permission_cannot_record_allocation(): void
    {
        $this->actingAs($this->viewer)->post('/fund-allocations', [
            'fund_type'    => 'petty_cash',
            'period_start' => '2026-08-03',
            'amount'       => 100000,
        ])->assertForbidden();
    }

    private function makeTransaction(string $fundType, string $date, float $amount): PettyCashTransaction
    {
        return PettyCashTransaction::create([
            'transaction_number'  => 'PC-' . $fundType . '-' . str_replace('-', '', $date) . '-' . $amount,
            'transaction_date'    => $date,
            'fund_type'           => $fundType,
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => $amount,
            'description'         => 'Pengeluaran uji coba',
            'status'              => 'approved',
            'created_by'          => $this->finance->id,
        ]);
    }
}
