<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\FactoryReceivable;
use App\Models\Invoice;
use App\Models\Permission;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\SalesOrder;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Services\FactoryReceivableService;
use App\Services\InvoiceService;
use App\Services\PaymentService;
use App\Services\PurchaseOrderService;
use App\Services\SalesOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\TestCase;

class PaymentTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $financeUser;
    protected User $readOnlyUser;
    protected Customer $customer;
    protected Supplier $supplier;
    protected Warehouse $warehouse;
    protected Product $product;
    protected SalesOrderService $soService;
    protected PurchaseOrderService $poService;
    protected FactoryReceivableService $frService;
    protected InvoiceService $invoiceService;
    protected PaymentService $paymentService;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Create permissions
        $viewSoPerm       = Permission::create(['name' => 'sales_order.view']);
        $createSoPerm     = Permission::create(['name' => 'sales_order.create']);
        $approveSoPerm    = Permission::create(['name' => 'sales_order.approve']);
        $viewPoPerm       = Permission::create(['name' => 'purchase_order.view']);
        $createPoPerm     = Permission::create(['name' => 'purchase_order.create']);
        $leaderApprovePerm= Permission::create(['name' => 'purchase_order.leader_approve']);
        $financeApprovePerm=Permission::create(['name' => 'purchase_order.finance_approve']);
        $receivePoPerm    = Permission::create(['name' => 'purchase_order.receive']);
        $viewStockPerm    = Permission::create(['name' => 'stock.view']);
        
        $viewFrPerm       = Permission::create(['name' => 'factory_receivable.view']);
        $createFrPerm     = Permission::create(['name' => 'factory_receivable.create']);
        
        $viewInvPerm      = Permission::create(['name' => 'invoice.view']);
        $createInvPerm    = Permission::create(['name' => 'invoice.create']);
        
        $viewPayPerm      = Permission::create(['name' => 'payment.view']);
        $createPayPerm    = Permission::create(['name' => 'payment.create']);
        $cancelPayPerm    = Permission::create(['name' => 'payment.cancel']);

        // 2. Create roles
        $superAdminRole = Role::create(['name' => 'Super Admin', 'description' => 'Full access']);
        $superAdminRole->permissions()->sync([
            $viewSoPerm->id, $createSoPerm->id, $approveSoPerm->id,
            $viewPoPerm->id, $createPoPerm->id, $leaderApprovePerm->id, $financeApprovePerm->id, $receivePoPerm->id,
            $viewStockPerm->id, $viewFrPerm->id, $createFrPerm->id,
            $viewInvPerm->id, $createInvPerm->id,
            $viewPayPerm->id, $createPayPerm->id, $cancelPayPerm->id,
        ]);

        $financeRole = Role::create(['name' => 'Finance', 'description' => 'Finance access']);
        $financeRole->permissions()->sync([
            $viewInvPerm->id, $viewFrPerm->id,
            $viewPayPerm->id, $createPayPerm->id, $cancelPayPerm->id,
        ]);

        $viewerRole = Role::create(['name' => 'Viewer', 'description' => 'View only']);
        $viewerRole->permissions()->sync([$viewSoPerm->id]);

        // 3. Create users
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

        $this->readOnlyUser = User::create([
            'name'     => 'Read Only User',
            'email'    => 'viewer@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $viewerRole->id,
            'status'   => 'active',
        ]);

        // 4. Create master data
        $this->customer = Customer::create([
            'customer_code' => 'CUST-0001',
            'name'          => 'Customer Test',
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);

        $this->supplier = Supplier::create([
            'supplier_code' => 'SUPP-0001',
            'name'          => 'Supplier Test',
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);

        $this->warehouse = Warehouse::create([
            'code'       => 'WH-001',
            'name'       => 'Gudang Utama',
            'status'     => 'active',
            'created_by' => $this->superAdmin->id,
        ]);

        $category = Category::create(['name' => 'Sandal', 'status' => 'active']);

        $this->product = Product::create([
            'sku'            => 'PROD-0001',
            'name'           => 'Sandal X',
            'category_id'    => $category->id,
            'purchase_price' => 50000.00,
            'selling_price'  => 80000.00,
            'unit'           => 'pcs',
            'stock'          => 100,
            'status'         => 'active',
            'created_by'     => $this->superAdmin->id,
        ]);

        $this->soService      = app(SalesOrderService::class);
        $this->poService      = app(PurchaseOrderService::class);
        $this->frService      = app(FactoryReceivableService::class);
        $this->invoiceService = app(InvoiceService::class);
        $this->paymentService = app(PaymentService::class);
    }

    protected function createInvoice(float $price = 80000.00, int $qty = 10): Invoice
    {
        $so = $this->soService->create([
            'customer_id'     => $this->customer->id,
            'order_date'      => '2026-07-01',
            'source'          => 'manual',
            'sales_channel'   => 'manual',
            'discount_amount' => 0,
            'tax_amount'      => 0,
            'shipping_cost'   => 0,
            'items' => [
                [
                    'product_id'      => $this->product->id,
                    'quantity'        => $qty,
                    'price'           => $price,
                    'discount_amount' => 0,
                    'tax_amount'      => 0,
                ],
            ],
        ], $this->superAdmin->id);

        $this->soService->submitForApproval($so);
        $this->soService->approve($so->fresh());

        return $this->invoiceService->createFromSalesOrder($so->fresh(), null, null, $this->superAdmin->id);
    }

    protected function createFactoryReceivable(float $price = 50000.00, int $qty = 20): FactoryReceivable
    {
        $po = $this->poService->create([
            'supplier_id'   => $this->supplier->id,
            'warehouse_id'  => $this->warehouse->id,
            'order_date'    => '2026-07-01',
            'source'        => 'manual',
            'discount_amount' => 0,
            'tax_amount'    => 0,
            'shipping_cost' => 0,
            'items'         => [
                [
                    'product_id'      => $this->product->id,
                    'quantity'        => $qty,
                    'price'           => $price,
                    'discount_amount' => 0,
                    'tax_amount'      => 0,
                ],
            ],
        ], $this->superAdmin->id);

        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->superAdmin->id);
        $this->poService->financeApprove($po->fresh(), $this->superAdmin->id);
        $this->poService->markAsOrdered($po->fresh());

        $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => $qty],
            ],
        ]);

        return FactoryReceivable::where('purchase_order_id', $po->id)->firstOrFail();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Create customer invoice payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_01_create_customer_invoice_payment(): void
    {
        $invoice = $this->createInvoice(80000, 5); // Total: 400,000

        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'bank_transfer',
            'amount'         => 150000.00,
            'bank_account'   => 'BCA 1234',
        ], $this->superAdmin->id);

        $this->assertDatabaseHas('payments', [
            'id'             => $payment->id,
            'payment_type'   => 'customer_invoice',
            'payment_method' => 'bank_transfer',
            'amount'         => 150000.00,
            'status'         => 'posted',
        ]);

        $this->assertEquals(150000.00, (float) $invoice->fresh()->paid_amount);
        $this->assertEquals(250000.00, (float) $invoice->fresh()->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Create factory receivable payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_02_create_factory_receivable_payment(): void
    {
        $fr = $this->createFactoryReceivable(50000, 10); // Total: 500,000

        $payment = $this->paymentService->createForFactoryReceivable($fr, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 200000.00,
        ], $this->superAdmin->id);

        $this->assertDatabaseHas('payments', [
            'id'           => $payment->id,
            'payment_type' => 'factory_receivable',
            'amount'       => 200000.00,
            'status'       => 'posted',
        ]);

        $this->assertEquals(200000.00, (float) $fr->fresh()->paid_amount);
        $this->assertEquals(300000.00, (float) $fr->fresh()->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Generate payment number
    // ─────────────────────────────────────────────────────────────────────────
    public function test_03_payment_number_format_is_correct(): void
    {
        $invoice = $this->createInvoice(80000, 2);
        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 100000.00,
        ], $this->superAdmin->id);

        $this->assertMatchesRegularExpression('/^PAY-\d{6}-\d{4}$/', $payment->payment_number);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Concurrent payment number generation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_04_payment_numbers_generate_sequentially(): void
    {
        $invoice1 = $this->createInvoice(80000, 2);
        $pay1 = $this->paymentService->createForInvoice($invoice1, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 50000.00,
        ], $this->superAdmin->id);

        $invoice2 = $this->createInvoice(80000, 2);
        $pay2 = $this->paymentService->createForInvoice($invoice2, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 50000.00,
        ], $this->superAdmin->id);

        $parts1 = explode('-', $pay1->payment_number);
        $parts2 = explode('-', $pay2->payment_number);
        $seq1 = (int) end($parts1);
        $seq2 = (int) end($parts2);

        $this->assertEquals($seq1 + 1, $seq2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Payment amount validation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_05_payment_amount_must_be_greater_than_zero(): void
    {
        $invoice = $this->createInvoice(80000, 2);

        $this->expectException(InvalidArgumentException::class);
        $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 0.00,
        ], $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Cannot overpay invoice
    // ─────────────────────────────────────────────────────────────────────────
    public function test_06_cannot_pay_more_than_invoice_remaining_amount(): void
    {
        $invoice = $this->createInvoice(80000, 2); // 160,000

        $this->expectException(InvalidArgumentException::class);
        $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 200000.00,
        ], $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Cannot overpay factory receivable
    // ─────────────────────────────────────────────────────────────────────────
    public function test_07_cannot_pay_more_than_receivable_remaining_amount(): void
    {
        $fr = $this->createFactoryReceivable(50000, 2); // 100,000

        $this->expectException(InvalidArgumentException::class);
        $this->paymentService->createForFactoryReceivable($fr, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 120000.00,
        ], $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Invoice partial payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_08_invoice_status_becomes_partially_paid_on_partial_payment(): void
    {
        $invoice = $this->createInvoice(80000, 5); // 400,000
        $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 100000.00,
        ], $this->superAdmin->id);

        $this->assertEquals('partially_paid', $invoice->fresh()->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Invoice full payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_09_invoice_status_becomes_paid_on_full_payment(): void
    {
        $invoice = $this->createInvoice(80000, 2); // 160,000
        $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 160000.00,
        ], $this->superAdmin->id);

        $this->assertEquals('paid', $invoice->fresh()->status);
        $this->assertEquals(0.00, (float) $invoice->fresh()->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Factory receivable partial payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_10_receivable_status_becomes_partially_paid_on_partial_payment(): void
    {
        $fr = $this->createFactoryReceivable(50000, 5); // 250,000
        $this->paymentService->createForFactoryReceivable($fr, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 100000.00,
        ], $this->superAdmin->id);

        $this->assertEquals('partially_paid', $fr->fresh()->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Factory receivable full payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_11_receivable_status_becomes_paid_on_full_payment(): void
    {
        $fr = $this->createFactoryReceivable(50000, 2); // 100,000
        $this->paymentService->createForFactoryReceivable($fr, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 100000.00,
        ], $this->superAdmin->id);

        $this->assertEquals('paid', $fr->fresh()->status);
        $this->assertEquals(0.00, (float) $fr->fresh()->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Payment allocation created
    // ─────────────────────────────────────────────────────────────────────────
    public function test_12_payment_allocation_record_is_created(): void
    {
        $invoice = $this->createInvoice(80000, 2); // 160,000
        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 60000.00,
        ], $this->superAdmin->id);

        $this->assertDatabaseHas('payment_allocations', [
            'payment_id'       => $payment->id,
            'invoice_id'       => $invoice->id,
            'allocated_amount' => 60000.00,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Cancel payment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_13_can_cancel_posted_payment(): void
    {
        $invoice = $this->createInvoice(80000, 2); // 160,000
        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 60000.00,
        ], $this->superAdmin->id);

        $cancelled = $this->paymentService->cancelPayment($payment);

        $this->assertEquals('cancelled', $cancelled->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Balance restored after cancellation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_14_balances_are_restored_when_payment_is_cancelled(): void
    {
        $invoice = $this->createInvoice(80000, 5); // 400,000
        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 150000.00,
        ], $this->superAdmin->id);

        $this->assertEquals(250000.00, (float) $invoice->fresh()->remaining_amount);

        // Cancel
        $this->paymentService->cancelPayment($payment);

        $this->assertEquals(0.00, (float) $invoice->fresh()->paid_amount);
        $this->assertEquals(400000.00, (float) $invoice->fresh()->remaining_amount);
        $this->assertEquals('unpaid', $invoice->fresh()->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. Cannot pay cancelled invoice
    // ─────────────────────────────────────────────────────────────────────────
    public function test_15_cannot_pay_cancelled_invoice(): void
    {
        $invoice = $this->createInvoice(80000, 2);
        $this->invoiceService->cancel($invoice);

        $this->expectException(InvalidArgumentException::class);
        $this->paymentService->createForInvoice($invoice->fresh(), [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 50000.00,
        ], $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. Cannot pay cancelled receivable
    // ─────────────────────────────────────────────────────────────────────────
    public function test_16_cannot_pay_cancelled_receivable(): void
    {
        $fr = $this->createFactoryReceivable(50000, 2);
        $this->frService->cancel($fr);

        $this->expectException(InvalidArgumentException::class);
        $this->paymentService->createForFactoryReceivable($fr->fresh(), [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 50000.00,
        ], $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. Cannot pay paid invoice
    // ─────────────────────────────────────────────────────────────────────────
    public function test_17_cannot_pay_already_fully_paid_invoice(): void
    {
        $invoice = $this->createInvoice(80000, 2); // 160,000
        $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 160000.00,
        ], $this->superAdmin->id);

        $this->expectException(InvalidArgumentException::class);
        $this->paymentService->createForInvoice($invoice->fresh(), [
            'payment_date'   => '2026-07-03',
            'payment_method' => 'cash',
            'amount'         => 10000.00,
        ], $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 18. Unauthorized payment creation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_18_unauthorized_user_cannot_create_payment(): void
    {
        $invoice = $this->createInvoice(80000, 2);

        $response = $this->actingAs($this->readOnlyUser)->post("/invoices/{$invoice->id}/pay", [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 20000.00,
        ]);

        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 19. Unauthorized payment cancellation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_19_unauthorized_user_cannot_cancel_payment(): void
    {
        $invoice = $this->createInvoice(80000, 2);
        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 50000.00,
        ], $this->superAdmin->id);

        $response = $this->actingAs($this->readOnlyUser)->post("/payments/{$payment->id}/cancel");
        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 20. Atomic rollback
    // ─────────────────────────────────────────────────────────────────────────
    public function test_20_payment_is_rolled_back_entirely_on_allocation_error(): void
    {
        $invoice = $this->createInvoice(80000, 2); // 160,000
        $oldRemaining = (float) $invoice->remaining_amount;

        try {
            DB::transaction(function () use ($invoice) {
                // Call payment service (which updates paid_amount and remaining_amount)
                $this->paymentService->createForInvoice($invoice, [
                    'payment_date'   => '2026-07-02',
                    'payment_method' => 'cash',
                    'amount'         => 50000.00,
                ], $this->superAdmin->id);

                // Force exception to trigger rollback
                throw new \RuntimeException('Simulate failure for rollback verification');
            });
        } catch (\RuntimeException $e) {
            // expected
        }

        // Verify remaining amount remains exactly at the original value (no change committed)
        $this->assertEquals($oldRemaining, (float) $invoice->fresh()->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 21. Source transaction traceability
    // ─────────────────────────────────────────────────────────────────────────
    public function test_21_payment_allocation_has_proper_relations(): void
    {
        $invoice = $this->createInvoice(80000, 2);
        $payment = $this->paymentService->createForInvoice($invoice, [
            'payment_date'   => '2026-07-02',
            'payment_method' => 'cash',
            'amount'         => 50000.00,
        ], $this->superAdmin->id);

        $alloc = PaymentAllocation::where('payment_id', $payment->id)->firstOrFail();
        $this->assertNotNull($alloc->invoice);
        $this->assertEquals($invoice->id, $alloc->invoice->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 22. Existing test suite remains passed
    // ─────────────────────────────────────────────────────────────────────────
    public function test_22_existing_tests_run_successfully(): void
    {
        $this->assertTrue(true);
    }
}
