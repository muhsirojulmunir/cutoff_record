<?php

namespace Tests\Feature;

use App\Models\ExpenseCategory;
use App\Models\Permission;
use App\Models\PettyCashTransaction;
use App\Models\Role;
use App\Models\User;
use App\Services\PettyCashService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PettyCashTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $leaderUser;
    protected User $financeUser;
    protected User $managementUser;
    protected User $unauthorizedUser;
    protected ExpenseCategory $category;
    protected PettyCashService $service;

    protected function setUp(): void
    {
        parent::setUp();

        // Create Permissions
        $viewPerm          = Permission::firstOrCreate(['name' => 'petty_cash.view']);
        $createPerm        = Permission::firstOrCreate(['name' => 'petty_cash.create']);
        $editPerm          = Permission::firstOrCreate(['name' => 'petty_cash.edit']);
        $submitPerm        = Permission::firstOrCreate(['name' => 'petty_cash.submit']);
        $leaderApprovePerm = Permission::firstOrCreate(['name' => 'petty_cash.leader_approve']);
        $financeApprovePerm= Permission::firstOrCreate(['name' => 'petty_cash.finance_approve']);
        $rejectPerm        = Permission::firstOrCreate(['name' => 'petty_cash.reject']);
        $cancelPerm        = Permission::firstOrCreate(['name' => 'petty_cash.cancel']);
        $dashPerm          = Permission::firstOrCreate(['name' => 'dashboard.view']);

        // Create Roles
        $superAdminRole = Role::firstOrCreate(['name' => 'Super Admin']);
        $superAdminRole->permissions()->sync(Permission::all()->pluck('id'));

        // Leader: bisa create/submit/leader_approve/reject
        $leaderRole = Role::firstOrCreate(['name' => 'Leader']);
        $leaderRole->permissions()->sync([
            $viewPerm->id, $createPerm->id, $editPerm->id, $submitPerm->id,
            $leaderApprovePerm->id, $rejectPerm->id, $cancelPerm->id,
        ]);

        // Finance: bisa create/submit/finance_approve/reject
        $financeRole = Role::firstOrCreate(['name' => 'Finance']);
        $financeRole->permissions()->sync([
            $viewPerm->id, $createPerm->id, $editPerm->id, $submitPerm->id,
            $financeApprovePerm->id, $rejectPerm->id, $cancelPerm->id,
        ]);

        $managementRole = Role::firstOrCreate(['name' => 'Management']);
        $managementRole->permissions()->sync([$viewPerm->id]);

        $unauthorizedRole = Role::firstOrCreate(['name' => 'Staff']);

        // Create Users
        $this->superAdmin = User::create([
            'name'     => 'Super Admin',
            'email'    => 'superadmin@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
            'status'   => 'active',
        ]);

        $this->leaderUser = User::create([
            'name'     => 'Leader User',
            'email'    => 'leader@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $leaderRole->id,
            'status'   => 'active',
        ]);

        $this->financeUser = User::create([
            'name'     => 'Finance User',
            'email'    => 'finance@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $financeRole->id,
            'status'   => 'active',
        ]);

        $this->managementUser = User::create([
            'name'     => 'Management User',
            'email'    => 'management@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $managementRole->id,
            'status'   => 'active',
        ]);

        $this->unauthorizedUser = User::create([
            'name'     => 'Staff User',
            'email'    => 'staff@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $unauthorizedRole->id,
            'status'   => 'active',
        ]);

        // Create Category
        $this->category = ExpenseCategory::create([
            'code'        => 'ATK',
            'name'        => 'Alat Tulis Kantor',
            'description' => 'Keperluan ATK',
            'status'      => 'active',
            'created_by'  => $this->superAdmin->id,
        ]);

        $this->service = app(PettyCashService::class);
    }

    // 1. Create petty cash
    public function test_create_petty_cash(): void
    {
        $this->actingAs($this->financeUser);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 150000.00,
            'description'         => 'Pembelian kertas HVS A4',
            'vendor_name'         => 'Toko Buku Sejahtera',
            'reference_number'    => 'INV-12345',
        ];

        $response = $this->post(route('petty-cash.store'), $payload);

        $transaction = PettyCashTransaction::first();
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $this->assertDatabaseHas('petty_cash_transactions', [
            'amount'      => 150000.00,
            'description' => 'Pembelian kertas HVS A4',
            'status'      => 'draft',
            'created_by'  => $this->financeUser->id,
        ]);
    }

    // 2. Generate PC number
    public function test_generate_pc_number(): void
    {
        $this->actingAs($this->financeUser);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 1000.00,
            'description'         => 'Test PC number generation',
        ];

        $this->post(route('petty-cash.store'), $payload);
        $transaction = PettyCashTransaction::orderBy('id', 'desc')->first();

        $expectedNumber = 'PC-' . now()->format('Ym') . '-0001';
        $this->assertEquals($expectedNumber, $transaction->transaction_number);
    }

    // 3. Concurrent PC number generation (Multiple sequential inserts)
    public function test_concurrent_pc_number_generation(): void
    {
        $this->actingAs($this->financeUser);

        $payload1 = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 1000.00,
            'description'         => 'PC 1',
        ];

        $payload2 = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 2000.00,
            'description'         => 'PC 2',
        ];

        $this->post(route('petty-cash.store'), $payload1);
        $this->post(route('petty-cash.store'), $payload2);

        $transactions = PettyCashTransaction::orderBy('id', 'asc')->get();

        $prefix = 'PC-' . now()->format('Ym') . '-';
        $this->assertEquals($prefix . '0001', $transactions[0]->transaction_number);
        $this->assertEquals($prefix . '0002', $transactions[1]->transaction_number);
    }

    // 4. Amount validation
    public function test_amount_validation(): void
    {
        $this->actingAs($this->financeUser);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 0, // Invalid: must be > 0
            'description'         => 'Invalid amount',
        ];

        $response = $this->post(route('petty-cash.store'), $payload);
        $response->assertSessionHasErrors(['amount']);
        $this->assertEquals(0, PettyCashTransaction::count());
    }

    // 5. Draft status
    public function test_draft_status(): void
    {
        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Draft test',
        ], $this->financeUser->id);

        $this->assertEquals('draft', $transaction->status);
    }

    // 6. Edit draft
    public function test_edit_draft(): void
    {
        $this->actingAs($this->financeUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Original description',
        ], $this->financeUser->id);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'bank_transfer',
            'amount'              => 75000.00,
            'description'         => 'Updated description',
        ];

        $response = $this->put(route('petty-cash.update', $transaction), $payload);
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $transaction->refresh();
        $this->assertEquals('Updated description', $transaction->description);
        $this->assertEquals(75000.00, $transaction->amount);
        $this->assertEquals('bank_transfer', $transaction->payment_method);
    }

    // 7. Submit approval
    public function test_submit_approval(): void
    {
        $this->actingAs($this->financeUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To submit',
        ], $this->financeUser->id);

        $response = $this->post(route('petty-cash.submit', $transaction));
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $transaction->refresh();
        $this->assertEquals('pending_leader_approval', $transaction->status);
        $this->assertEquals($this->financeUser->id, $transaction->submitted_by);
        $this->assertNotNull($transaction->submitted_at);
    }

    // 8. Cannot edit pending approval
    public function test_cannot_edit_pending_approval(): void
    {
        $this->actingAs($this->financeUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Original description',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 99999.00,
            'description'         => 'Updated description',
        ];

        // HTTP request should return 403 Forbidden
        $response = $this->put(route('petty-cash.update', $transaction), $payload);
        $response->assertStatus(403);

        // Direct Service execution should throw InvalidArgumentException
        $this->expectException(\InvalidArgumentException::class);
        $this->service->update($transaction, $payload);
    }

    // 9. Leader approve transaction
    public function test_approve_transaction(): void
    {
        $this->actingAs($this->leaderUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To approve',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);

        $response = $this->post(route('petty-cash.leader-approve', $transaction));
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $transaction->refresh();
        $this->assertEquals('pending_finance_approval', $transaction->status);
        $this->assertEquals($this->leaderUser->id, $transaction->leader_approved_by);
        $this->assertNotNull($transaction->leader_approved_at);
    }

    // 9b. Finance approve transaction
    public function test_finance_approve_transaction(): void
    {
        $this->actingAs($this->financeUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To finance approve',
        ], $this->superAdmin->id);

        $this->service->submitForApproval($transaction, $this->superAdmin->id);
        $this->service->leaderApprove($transaction->fresh(), $this->leaderUser->id);

        $response = $this->post(route('petty-cash.finance-approve', $transaction));
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $transaction->refresh();
        $this->assertEquals('approved', $transaction->status);
        $this->assertEquals($this->financeUser->id, $transaction->finance_approved_by);
        $this->assertNotNull($transaction->finance_approved_at);
    }

    // 10. Cannot edit approved transaction
    public function test_cannot_edit_approved_transaction(): void
    {
        $this->actingAs($this->financeUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Approved item',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);
        $this->service->leaderApprove($transaction->fresh(), $this->leaderUser->id);
        $this->service->financeApprove($transaction->fresh(), $this->financeUser->id);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 99999.00,
            'description'         => 'Try to edit',
        ];

        // HTTP request should return 403
        $response = $this->put(route('petty-cash.update', $transaction), $payload);
        $response->assertStatus(403);

        // Direct Service execution should throw InvalidArgumentException
        $this->expectException(\InvalidArgumentException::class);
        $this->service->update($transaction, $payload);
    }

    // 11. Reject transaction
    public function test_reject_transaction(): void
    {
        $this->actingAs($this->leaderUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To reject',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);

        $response = $this->post(route('petty-cash.reject', $transaction), [
            'rejection_reason' => 'Kuitansi tidak terbaca jelas'
        ]);
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $transaction->refresh();
        $this->assertEquals('rejected', $transaction->status);
        $this->assertEquals($this->leaderUser->id, $transaction->rejected_by);
        $this->assertNotNull($transaction->rejected_at);
        $this->assertEquals('Kuitansi tidak terbaca jelas', $transaction->rejection_reason);
    }

    // 12. Rejection reason required
    public function test_rejection_reason_required(): void
    {
        $this->actingAs($this->leaderUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Reason test',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);

        $response = $this->post(route('petty-cash.reject', $transaction), [
            'rejection_reason' => ''
        ]);
        $response->assertSessionHasErrors(['rejection_reason']);

        // Direct service execution
        $this->expectException(\InvalidArgumentException::class);
        $this->service->reject($transaction->fresh(), $this->leaderUser->id, '');
    }

    // 13. Cancel transaction
    public function test_cancel_transaction(): void
    {
        $this->actingAs($this->superAdmin);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To cancel',
        ], $this->financeUser->id);

        $response = $this->post(route('petty-cash.cancel', $transaction), [
            'cancellation_reason' => 'Salah input nominal'
        ]);
        $response->assertRedirect(route('petty-cash.show', $transaction));

        $transaction->refresh();
        $this->assertEquals('cancelled', $transaction->status);
        $this->assertEquals($this->superAdmin->id, $transaction->cancelled_by);
        $this->assertNotNull($transaction->cancelled_at);
        $this->assertEquals('Salah input nominal', $transaction->cancellation_reason);
    }

    // 14. Cancellation reason required
    public function test_cancellation_reason_required(): void
    {
        $this->actingAs($this->superAdmin);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Cancel reason test',
        ], $this->financeUser->id);

        $response = $this->post(route('petty-cash.cancel', $transaction), [
            'cancellation_reason' => ''
        ]);
        $response->assertSessionHasErrors(['cancellation_reason']);

        // Direct service execution
        $this->expectException(\InvalidArgumentException::class);
        $this->service->cancel($transaction, $this->superAdmin->id, '');
    }

    // 15. Unauthorized create
    public function test_unauthorized_create(): void
    {
        $this->actingAs($this->unauthorizedUser);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'No permission',
        ];

        $response = $this->post(route('petty-cash.store'), $payload);
        $response->assertStatus(403);
    }

    // 16. Unauthorized edit
    public function test_unauthorized_edit(): void
    {
        $this->actingAs($this->unauthorizedUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Some draft',
        ], $this->financeUser->id);

        $payload = [
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 60000.00,
            'description'         => 'Try edit draft',
        ];

        $response = $this->put(route('petty-cash.update', $transaction), $payload);
        $response->assertStatus(403);
    }

    // 17. Unauthorized submit
    public function test_unauthorized_submit(): void
    {
        $this->actingAs($this->unauthorizedUser);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To submit',
        ], $this->financeUser->id);

        $response = $this->post(route('petty-cash.submit', $transaction));
        $response->assertStatus(403);
    }

    // 18. Unauthorized leader-approve (Finance user cannot leader-approve)
    public function test_unauthorized_approve(): void
    {
        $this->actingAs($this->managementUser); // Management has no leader_approve permission

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To approve',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);

        $response = $this->post(route('petty-cash.leader-approve', $transaction));
        $response->assertStatus(403);
    }

    // 19. Unauthorized reject
    public function test_unauthorized_reject(): void
    {
        $this->actingAs($this->managementUser); // Management has no reject permission

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To reject',
        ], $this->financeUser->id);

        $this->service->submitForApproval($transaction, $this->financeUser->id);

        $response = $this->post(route('petty-cash.reject', $transaction), [
            'rejection_reason' => 'Invalid document'
        ]);
        $response->assertStatus(403);
    }

    // 20. Unauthorized cancel
    public function test_unauthorized_cancel(): void
    {
        $this->actingAs($this->unauthorizedUser); // Unauthorized user

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'To cancel',
        ], $this->financeUser->id);

        $response = $this->post(route('petty-cash.cancel', $transaction), [
            'cancellation_reason' => 'Abort it'
        ]);
        $response->assertStatus(403);
    }

    // 21. Separation of duties (creator cannot leader-approve their own transaction)
    public function test_separation_of_duties(): void
    {
        $this->actingAs($this->superAdmin);

        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Duties test',
        ], $this->superAdmin->id);

        $this->service->submitForApproval($transaction, $this->superAdmin->id);

        // Super Admin tries to leader-approve their own created transaction
        $response = $this->post(route('petty-cash.leader-approve', $transaction));
        $response->assertSessionHasErrors(['status']);

        // Direct Service call should throw InvalidArgumentException
        $this->expectException(\InvalidArgumentException::class);
        $this->service->leaderApprove($transaction->fresh(), $this->superAdmin->id);
    }

    // 22. Invalid status transition
    public function test_invalid_status_transition(): void
    {
        $transaction = $this->service->create([
            'transaction_date'    => '2026-07-27',
            'fund_type'           => 'petty_cash',
            'expense_category_id' => $this->category->id,
            'coa_code'            => '5101',
            'payment_method'      => 'cash',
            'amount'              => 50000.00,
            'description'         => 'Transition test',
        ], $this->financeUser->id);

        // Draft directly to finance-approved (Illegal)
        $this->expectException(\InvalidArgumentException::class);
        $this->service->financeApprove($transaction->fresh(), $this->financeUser->id);
    }
}
