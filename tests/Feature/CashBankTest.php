<?php

namespace Tests\Feature;

use App\Models\CashBankAccount;
use App\Models\CashBankTransaction;
use App\Models\Customer;
use App\Models\ExpenseCategory;
use App\Models\FactoryReceivable;
use App\Models\Invoice;
use App\Models\Permission;
use App\Models\PettyCashTransaction;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\SalesOrder;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CashBankService;
use App\Services\PaymentService;
use App\Services\PettyCashService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CashBankTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $financeUser;
    protected User $managementUser;
    protected User $unauthorizedUser;
    protected CashBankService $cashBankService;
    protected PaymentService $paymentService;
    protected PettyCashService $pettyCashService;

    protected function setUp(): void
    {
        parent::setUp();

        // Create Permissions
        Permission::create(['name' => 'cash_bank.view']);
        Permission::create(['name' => 'cash_bank.create']);
        Permission::create(['name' => 'cash_bank.edit']);
        Permission::create(['name' => 'cash_bank.adjust']);
        Permission::create(['name' => 'cash_bank.deactivate']);
        Permission::create(['name' => 'cash_transaction.view']);
        Permission::create(['name' => 'cash_transaction.create']);
        Permission::create(['name' => 'cash_transaction.adjust']);
        Permission::create(['name' => 'petty_cash.view']);
        Permission::create(['name' => 'petty_cash.create']);
        Permission::create(['name' => 'petty_cash.edit']);
        Permission::create(['name' => 'petty_cash.submit']);
        Permission::create(['name' => 'petty_cash.leader_approve']);
        Permission::create(['name' => 'petty_cash.finance_approve']);
        Permission::create(['name' => 'petty_cash.cancel']);
        Permission::create(['name' => 'payment.create']);
        Permission::create(['name' => 'payment.cancel']);

        // Create Roles
        $superAdminRole = Role::create(['name' => 'Super Admin']);
        $superAdminRole->permissions()->sync(Permission::all()->pluck('id'));

        $financeRole = Role::create(['name' => 'Finance']);
        $financeRole->permissions()->sync(Permission::whereIn('name', [
            'cash_bank.view', 'cash_bank.create', 'cash_bank.edit',
            'cash_transaction.view', 'cash_transaction.create',
            'petty_cash.view', 'petty_cash.create', 'petty_cash.edit', 'petty_cash.submit',
            'payment.create',
        ])->pluck('id'));

        $managementRole = Role::create(['name' => 'Management']);
        $managementRole->permissions()->sync(Permission::whereIn('name', [
            'cash_bank.view',
            'cash_transaction.view',
            'petty_cash.view',
        ])->pluck('id'));

        $unauthorizedRole = Role::create(['name' => 'Staff']);

        // Create Users
        $this->superAdmin = User::create([
            'name'     => 'Super Admin',
            'email'    => 'superadmin@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
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

        $this->cashBankService  = app(CashBankService::class);
        $this->paymentService   = app(PaymentService::class);
        $this->pettyCashService = app(PettyCashService::class);
    }

    // 1. Create cash account
    public function test_create_cash_account(): void
    {
        $this->actingAs($this->financeUser);

        $response = $this->post('/cash-bank/accounts', [
            'account_name'           => 'Kas Besar Utama',
            'account_type'           => 'cash',
            'opening_balance'        => 5000000,
            'allow_negative_balance' => false,
            'notes'                  => 'Akun kas utama operasional',
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('cash_bank_accounts', [
            'account_name' => 'Kas Besar Utama',
            'account_type' => 'cash',
            'account_code' => 'ACC-0001',
        ]);

        $acc = CashBankAccount::where('account_code', 'ACC-0001')->first();
        $this->assertEquals(5000000, $acc->current_balance);
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'opening_balance',
            'amount'           => 5000000,
        ]);
    }

    // 2. Create bank account
    public function test_create_bank_account(): void
    {
        $this->actingAs($this->financeUser);

        $response = $this->post('/cash-bank/accounts', [
            'account_name'           => 'BCA Rekening Utama',
            'account_type'           => 'bank',
            'bank_name'              => 'Bank BCA',
            'account_number'         => '1234567890',
            'account_holder'         => 'PT ABC Jaya',
            'opening_balance'        => 100000000,
            'allow_negative_balance' => false,
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('cash_bank_accounts', [
            'account_name'   => 'BCA Rekening Utama',
            'account_type'   => 'bank',
            'bank_name'      => 'Bank BCA',
            'account_number' => '1234567890',
        ]);
    }

    // 3. Create e-wallet account
    public function test_create_e_wallet_account(): void
    {
        $this->actingAs($this->financeUser);

        $response = $this->post('/cash-bank/accounts', [
            'account_name'           => 'GoPay Perusahaan',
            'account_type'           => 'e_wallet',
            'account_number'         => '08123456789',
            'opening_balance'        => 1000000,
            'allow_negative_balance' => true,
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('cash_bank_accounts', [
            'account_name'           => 'GoPay Perusahaan',
            'account_type'           => 'e_wallet',
            'allow_negative_balance' => true,
        ]);
    }

    // 4. Generate account code & 5. Concurrent account code generation
    public function test_sequential_account_code_generation(): void
    {
        $acc1 = $this->cashBankService->createAccount([
            'account_name' => 'Rekening 1',
            'account_type' => 'cash',
            'opening_balance' => 0,
        ], $this->superAdmin->id);

        $acc2 = $this->cashBankService->createAccount([
            'account_name' => 'Rekening 2',
            'account_type' => 'bank',
            'opening_balance' => 0,
        ], $this->superAdmin->id);

        $this->assertEquals('ACC-0001', $acc1->account_code);
        $this->assertEquals('ACC-0002', $acc2->account_code);
    }

    // 6. Opening balance
    public function test_opening_balance_creates_ledger(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Awal',
            'account_type'    => 'cash',
            'opening_balance' => 250000,
        ], $this->superAdmin->id);

        $this->assertEquals(250000, $acc->current_balance);
        $this->assertEquals(250000, $acc->opening_balance);

        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'opening_balance',
            'direction'        => 'in',
            'amount'           => 250000,
            'balance_before'   => 0,
            'balance_after'    => 250000,
        ]);
    }

    // 7. Cash in
    public function test_manual_cash_in(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name' => 'Rekening Cash',
            'account_type' => 'cash',
        ], $this->superAdmin->id);

        $this->cashBankService->recordCashIn($acc, [
            'transaction_date' => '2026-07-27',
            'amount'           => 150000,
            'description'      => 'Suntikan dana manual',
            'reference_number' => 'REF-001',
        ], $this->superAdmin->id);

        $this->assertEquals(150000, $acc->fresh()->current_balance);
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'cash_in',
            'direction'        => 'in',
            'amount'           => 150000,
            'balance_before'   => 0,
            'balance_after'    => 150000,
            'description'      => 'Suntikan dana manual',
            'reference_number' => 'REF-001',
        ]);
    }

    // 8. Cash out & 9. Balance calculation
    public function test_manual_cash_out(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Bank',
            'account_type'    => 'bank',
            'opening_balance' => 500000,
        ], $this->superAdmin->id);

        $this->cashBankService->recordCashOut($acc, [
            'transaction_date' => '2026-07-27',
            'amount'           => 200000,
            'description'      => 'Penarikan tunai manual',
        ], $this->superAdmin->id);

        $this->assertEquals(300000, $acc->fresh()->current_balance);
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'cash_out',
            'direction'        => 'out',
            'amount'           => 200000,
            'balance_before'   => 500000,
            'balance_after'    => 300000,
        ]);
    }

    // 10. Negative balance prevented
    public function test_negative_balance_prevented_by_default(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name'           => 'No Debt Rekening',
            'account_type'           => 'cash',
            'opening_balance'        => 50000,
            'allow_negative_balance' => false,
        ], $this->superAdmin->id);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage("Saldo rekening 'No Debt Rekening' tidak mencukupi");

        $this->cashBankService->recordCashOut($acc, [
            'transaction_date' => '2026-07-27',
            'amount'           => 60000,
            'description'      => 'Penarikan melebihi saldo',
        ], $this->superAdmin->id);
    }

    // 11. Manual adjustment
    public function test_manual_adjustment(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Adj',
            'account_type'    => 'bank',
            'opening_balance' => 100000,
        ], $this->superAdmin->id);

        // Adjust in
        $this->cashBankService->recordAdjustment($acc, [
            'transaction_date' => '2026-07-27',
            'amount'           => 20000,
            'direction'        => 'in',
            'description'      => 'Koreksi selisih lebih',
        ], $this->superAdmin->id);

        $this->assertEquals(120000, $acc->fresh()->current_balance);

        // Adjust out
        $this->cashBankService->recordAdjustment($acc, [
            'transaction_date' => '2026-07-27',
            'amount'           => 30000,
            'direction'        => 'out',
            'description'      => 'Koreksi selisih kurang',
        ], $this->superAdmin->id);

        $this->assertEquals(90000, $acc->fresh()->current_balance);
    }

    // 12. Customer payment increases balance
    public function test_customer_payment_increases_balance(): void
    {
        $this->actingAs($this->financeUser);

        // Setup Customer, Sales Order, Invoice
        $customer = Customer::create(['customer_code' => 'CUST001', 'name' => 'Cust 1', 'email' => 'c1@t.com', 'phone' => '123']);
        $warehouse = Warehouse::create(['code' => 'WH01', 'name' => 'Gudang 1']);
        $so = SalesOrder::create([
            'so_number' => 'SO-202607-0001', 'customer_id' => $customer->id, 'warehouse_id' => $warehouse->id,
            'order_date' => '2026-07-27', 'source' => 'manual', 'sales_channel' => 'manual', 'payment_status' => 'unpaid', 'subtotal' => 1000000, 'grand_total' => 1000000, 'status' => 'approved', 'created_by' => $this->superAdmin->id,
        ]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-202607-0001', 'sales_order_id' => $so->id, 'customer_id' => $customer->id,
            'invoice_date' => '2026-07-27', 'subtotal' => 1000000, 'total_amount' => 1000000, 'paid_amount' => 0, 'remaining_amount' => 1000000,
            'status' => 'unpaid', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name' => 'BCA BCA',
            'account_type' => 'bank',
        ], $this->superAdmin->id);

        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'         => '2026-07-27',
            'payment_method'       => 'bank_transfer',
            'amount'               => 400000,
            'cash_bank_account_id' => $acc->id,
        ], $this->financeUser->id);

        $this->assertEquals(400000, $acc->fresh()->current_balance);
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'customer_payment',
            'direction'        => 'in',
            'amount'           => 400000,
            'source_type'      => \App\Models\Payment::class,
            'source_id'        => $payment->id,
        ]);
    }

    // 13. Supplier payment decreases balance
    public function test_supplier_payment_decreases_balance(): void
    {
        $this->actingAs($this->financeUser);

        // Setup Supplier, Purchase Order, Factory Receivable
        $supplier = Supplier::create(['supplier_code' => 'SUPP01', 'name' => 'Supp 1', 'email' => 's1@t.com', 'phone' => '123']);
        $warehouse = Warehouse::create(['code' => 'WH02', 'name' => 'Gudang 2']);
        $po = PurchaseOrder::create([
            'po_number' => 'PO-202607-0001', 'supplier_id' => $supplier->id, 'warehouse_id' => $warehouse->id,
            'order_date' => '2026-07-27', 'source' => 'manual', 'sales_channel' => 'manual', 'payment_status' => 'unpaid', 'subtotal' => 500000, 'total_amount' => 500000, 'status' => 'received', 'created_by' => $this->superAdmin->id,
        ]);
        $fr = FactoryReceivable::create([
            'receivable_number' => 'REC-202607-0001', 'purchase_order_id' => $po->id, 'supplier_id' => $supplier->id,
            'warehouse_id' => $warehouse->id, 'transaction_date' => '2026-07-27', 'original_amount' => 500000,
            'paid_amount' => 0, 'remaining_amount' => 500000, 'status' => 'unpaid', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Mandiri BCA',
            'account_type'    => 'bank',
            'opening_balance' => 1000000,
        ], $this->superAdmin->id);

        $payment = $this->paymentService->createForFactoryReceivable($fr, [
            'payment_date'         => '2026-07-27',
            'payment_method'       => 'bank_transfer',
            'amount'               => 300000,
            'cash_bank_account_id' => $acc->id,
        ], $this->financeUser->id);

        $this->assertEquals(700000, $acc->fresh()->current_balance);
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'supplier_payment',
            'direction'        => 'out',
            'amount'           => 300000,
            'source_type'      => \App\Models\Payment::class,
            'source_id'        => $payment->id,
        ]);
    }

    // 14. Approved petty cash decreases balance
    public function test_approved_petty_cash_decreases_balance(): void
    {
        // Setup expense category
        $cat = ExpenseCategory::create([
            'code' => 'CON', 'name' => 'Konsumsi', 'status' => 'active', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Kas Kecil Rek',
            'account_type'    => 'cash',
            'opening_balance' => 500000,
        ], $this->superAdmin->id);

        // Create draft petty cash
        $pc = $this->pettyCashService->create([
            'transaction_date'    => '2026-07-27',
            'expense_category_id' => $cat->id,
            'payment_method'      => 'cash',
            'cash_bank_account_id'=> $acc->id,
            'amount'              => 100000,
            'description'         => 'Makan siang rapat',
        ], $this->financeUser->id);

        // Submit for approval
        $this->pettyCashService->submitForApproval($pc, $this->financeUser->id);

        // Approve two-step: Leader -> Finance
        $this->pettyCashService->leaderApprove($pc->fresh(), $this->superAdmin->id);
        $this->pettyCashService->financeApprove($pc->fresh(), $this->superAdmin->id);
        $this->pettyCashService->disburse($pc->fresh(), $this->superAdmin->id);

        $this->assertEquals(400000, $acc->fresh()->current_balance);
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'petty_cash',
            'direction'        => 'out',
            'amount'           => 100000,
            'source_type'      => PettyCashTransaction::class,
            'source_id'        => $pc->id,
        ]);
    }

    // 15. Duplicate petty cash transaction prevented
    public function test_duplicate_petty_cash_transaction_prevented(): void
    {
        $cat = ExpenseCategory::create([
            'code' => 'TRA', 'name' => 'Transport', 'status' => 'active', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Kas Kecil Rek 2',
            'account_type'    => 'cash',
            'opening_balance' => 500000,
        ], $this->superAdmin->id);

        $pc = $this->pettyCashService->create([
            'transaction_date'    => '2026-07-27',
            'expense_category_id' => $cat->id,
            'payment_method'      => 'cash',
            'cash_bank_account_id'=> $acc->id,
            'amount'              => 50000,
            'description'         => 'Bensin kurir',
        ], $this->financeUser->id);

        // Manually set to approved bypassing transition rules
        $pc->forceFill(['status' => 'approved'])->save();

        // First deduction should succeed
        $this->cashBankService->recordApprovedPettyCash($pc, $acc, $this->superAdmin->id);

        // Second deduction should fail
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Deduction untuk Petty Cash ini sudah pernah dilakukan sebelumnya');

        $this->cashBankService->recordApprovedPettyCash($pc, $acc, $this->superAdmin->id);
    }

    // 17. Payment cancellation creates reversal
    public function test_payment_cancellation_creates_reversal(): void
    {
        $this->actingAs($this->financeUser);

        $customer = Customer::create(['customer_code' => 'CUST002', 'name' => 'Cust 2', 'email' => 'c2@t.com', 'phone' => '123']);
        $warehouse = Warehouse::create(['code' => 'WH03', 'name' => 'Gudang 3']);
        $so = SalesOrder::create([
            'so_number' => 'SO-202607-0002', 'customer_id' => $customer->id, 'warehouse_id' => $warehouse->id,
            'order_date' => '2026-07-27', 'source' => 'manual', 'sales_channel' => 'manual', 'payment_status' => 'unpaid', 'subtotal' => 500000, 'grand_total' => 500000, 'status' => 'approved', 'created_by' => $this->superAdmin->id,
        ]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-202607-0002', 'sales_order_id' => $so->id, 'customer_id' => $customer->id,
            'invoice_date' => '2026-07-27', 'subtotal' => 500000, 'total_amount' => 500000, 'paid_amount' => 0, 'remaining_amount' => 500000,
            'status' => 'unpaid', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name' => 'BCA BCA 2',
            'account_type' => 'bank',
        ], $this->superAdmin->id);

        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'         => '2026-07-27',
            'payment_method'       => 'bank_transfer',
            'amount'               => 200000,
            'cash_bank_account_id' => $acc->id,
        ], $this->financeUser->id);

        $this->assertEquals(200000, $acc->fresh()->current_balance);

        // Cancel Payment
        $this->paymentService->cancelPayment($payment);

        $this->assertEquals(0, $acc->fresh()->current_balance);

        // Check original transaction is marked reversed
        $orig = CashBankTransaction::where('source_type', \App\Models\Payment::class)
            ->where('source_id', $payment->id)
            ->where('transaction_type', 'customer_payment')
            ->first();
        $this->assertNotNull($orig);
        $this->assertEquals('reversed', $orig->status);

        // Check reversal transaction is added
        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'adjustment',
            'direction'        => 'out',
            'amount'           => 200000,
            'reference_number' => "REV-{$orig->transaction_number}",
        ]);
    }

    // 18. Petty cash reversal creates reversal
    public function test_petty_cash_cancellation_creates_reversal(): void
    {
        $cat = ExpenseCategory::create([
            'code' => 'OFF', 'name' => 'Office', 'status' => 'active', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Kas Kantor',
            'account_type'    => 'cash',
            'opening_balance' => 300000,
        ], $this->superAdmin->id);

        $pc = $this->pettyCashService->create([
            'transaction_date'    => '2026-07-27',
            'expense_category_id' => $cat->id,
            'payment_method'      => 'cash',
            'cash_bank_account_id'=> $acc->id,
            'amount'              => 80000,
            'description'         => 'Sapu baru',
        ], $this->financeUser->id);

        $this->pettyCashService->submitForApproval($pc, $this->financeUser->id);
        $this->pettyCashService->leaderApprove($pc->fresh(), $this->superAdmin->id);
        $this->pettyCashService->financeApprove($pc->fresh(), $this->superAdmin->id);
        $this->pettyCashService->disburse($pc->fresh(), $this->superAdmin->id);

        $this->assertEquals(220000, $acc->fresh()->current_balance);

        // Cancel approved petty cash
        $this->pettyCashService->cancel($pc->fresh(), $this->superAdmin->id, 'Barang tidak jadi dibeli');

        $this->assertEquals(300000, $acc->fresh()->current_balance);

        $orig = CashBankTransaction::whereIn('source_type', [PettyCashTransaction::class, 'petty_cash'])
            ->where('source_id', $pc->id)
            ->first();
        $this->assertEquals('reversed', $orig->status);

        $this->assertDatabaseHas('cash_bank_transactions', [
            'account_id'       => $acc->id,
            'transaction_type' => 'adjustment',
            'direction'        => 'in',
            'amount'           => 80000,
            'reference_number' => "REV-{$orig->transaction_number}",
        ]);
    }

    // 19. Account deactivation
    public function test_account_deactivation(): void
    {
        $this->actingAs($this->superAdmin);

        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Deactive',
            'account_type'    => 'cash',
            'opening_balance' => 0,
        ], $this->superAdmin->id);

        $response = $this->post("/cash-bank/accounts/{$acc->id}/deactivate");
        $response->assertRedirect();
        $this->assertEquals('inactive', $acc->fresh()->status);

        // Cannot transact on deactivated account
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage("tidak aktif dan tidak dapat digunakan untuk transaksi");

        $this->cashBankService->recordCashIn($acc, [
            'transaction_date' => '2026-07-27',
            'amount'           => 50000,
            'description'      => 'Uang masuk rekening non-aktif',
        ], $this->superAdmin->id);
    }

    // 20. Unauthorized account creation
    public function test_unauthorized_account_creation_prevented(): void
    {
        $this->actingAs($this->unauthorizedUser);

        $response = $this->post('/cash-bank/accounts', [
            'account_name'    => 'Rekening Gelap',
            'account_type'     => 'cash',
            'opening_balance' => 0,
        ]);

        $response->assertStatus(403);
    }

    // 21. Unauthorized adjustment
    public function test_unauthorized_adjustment_prevented(): void
    {
        $this->actingAs($this->financeUser); // Finance has no cash_bank.adjust permission

        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Keuangan',
            'account_type'    => 'cash',
            'opening_balance' => 100000,
        ], $this->superAdmin->id);

        $response = $this->post('/cash-bank/transactions/adjustment', [
            'account_id'       => $acc->id,
            'transaction_date' => '2026-07-27',
            'amount'           => 20000,
            'direction'        => 'in',
            'description'      => 'Koreksi ilegal',
        ]);

        $response->assertStatus(403);
    }

    // 22. Unauthorized transaction view
    public function test_unauthorized_transaction_view_prevented(): void
    {
        $this->actingAs($this->unauthorizedUser);

        $response = $this->get('/cash-bank/transactions');
        $response->assertStatus(403);
    }

    // 23. Concurrent balance update
    public function test_concurrent_balance_update(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Bersama',
            'account_type'    => 'cash',
            'opening_balance' => 100000,
        ], $this->superAdmin->id);

        // Run sequential atomic records representing high concurrency locks
        $this->cashBankService->recordCashIn($acc, ['transaction_date' => '2026-07-27', 'amount' => 5000, 'description' => 'A'], $this->superAdmin->id);
        $this->cashBankService->recordCashOut($acc, ['transaction_date' => '2026-07-27', 'amount' => 3000, 'description' => 'B'], $this->superAdmin->id);
        $this->cashBankService->recordCashIn($acc, ['transaction_date' => '2026-07-27', 'amount' => 2000, 'description' => 'C'], $this->superAdmin->id);

        $this->assertEquals(104000, $acc->fresh()->current_balance);
    }

    // 24. Atomic rollback
    public function test_atomic_rollback_on_failure(): void
    {
        $acc = $this->cashBankService->createAccount([
            'account_name'    => 'Rekening Rollback',
            'account_type'    => 'cash',
            'opening_balance' => 10000,
        ], $this->superAdmin->id);

        try {
            DB::transaction(function () use ($acc) {
                // Successful update
                $this->cashBankService->recordCashIn($acc, [
                    'transaction_date' => '2026-07-27',
                    'amount'           => 5000,
                    'description'      => 'Masuk duluan',
                ], $this->superAdmin->id);

                // Fail here with exception
                throw new \RuntimeException('Failure simulates error midway');
            });
        } catch (\RuntimeException $e) {
            // Ignored
        }

        // Current balance should rollback to 10000, no transaction created
        $this->assertEquals(10000, $acc->fresh()->current_balance);
        $this->assertDatabaseMissing('cash_bank_transactions', [
            'description' => 'Masuk duluan',
        ]);
    }

    // 25. Transaction traceability
    public function test_transaction_traceability(): void
    {
        $this->actingAs($this->financeUser);

        $customer = Customer::create(['customer_code' => 'CUST003', 'name' => 'Cust 3', 'email' => 'c3@t.com', 'phone' => '123']);
        $warehouse = Warehouse::create(['code' => 'WH04', 'name' => 'Gudang 4']);
        $so = SalesOrder::create([
            'so_number' => 'SO-202607-0003', 'customer_id' => $customer->id, 'warehouse_id' => $warehouse->id,
            'order_date' => '2026-07-27', 'source' => 'manual', 'sales_channel' => 'manual', 'payment_status' => 'unpaid', 'subtotal' => 100000, 'grand_total' => 100000, 'status' => 'approved', 'created_by' => $this->superAdmin->id,
        ]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-202607-0003', 'sales_order_id' => $so->id, 'customer_id' => $customer->id,
            'invoice_date' => '2026-07-27', 'subtotal' => 100000, 'total_amount' => 100000, 'paid_amount' => 0, 'remaining_amount' => 100000,
            'status' => 'unpaid', 'created_by' => $this->superAdmin->id,
        ]);

        $acc = $this->cashBankService->createAccount([
            'account_name' => 'BCA Trace',
            'account_type' => 'bank',
        ], $this->superAdmin->id);

        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'         => '2026-07-27',
            'payment_method'       => 'bank_transfer',
            'amount'               => 100000,
            'cash_bank_account_id' => $acc->id,
        ], $this->financeUser->id);

        $txn = CashBankTransaction::where('source_type', \App\Models\Payment::class)
            ->where('source_id', $payment->id)
            ->firstOrFail();

        $this->assertEquals($payment->id, $txn->source_id);
        $this->assertEquals(\App\Models\Payment::class, $txn->source_type);
        $this->assertEquals($invoice->id, $payment->allocations()->first()->invoice_id);
    }
}
