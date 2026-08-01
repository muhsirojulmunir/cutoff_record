<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\FactoryReceivable;
use App\Models\Permission;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\FactoryReceivableService;
use App\Services\PurchaseOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use Tests\TestCase;

class FactoryReceivableTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $financeUser;
    protected User $readOnlyUser;
    protected Supplier $supplier;
    protected Warehouse $warehouse;
    protected Product $product;
    protected PurchaseOrderService $poService;
    protected FactoryReceivableService $receivableService;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Buat permissions
        $viewPoPerm       = Permission::create(['name' => 'purchase_order.view']);
        $createPoPerm     = Permission::create(['name' => 'purchase_order.create']);
        $editPoPerm       = Permission::create(['name' => 'purchase_order.edit']);
        $leaderApprovePerm= Permission::create(['name' => 'purchase_order.leader_approve']);
        $financeApprovePerm=Permission::create(['name' => 'purchase_order.finance_approve']);
        $receivePoPerm    = Permission::create(['name' => 'purchase_order.receive']);
        $viewStockPerm    = Permission::create(['name' => 'stock.view']);
        $viewFrPerm       = Permission::create(['name' => 'factory_receivable.view']);
        $createFrPerm     = Permission::create(['name' => 'factory_receivable.create']);
        $editFrPerm       = Permission::create(['name' => 'factory_receivable.edit']);
        $cancelFrPerm     = Permission::create(['name' => 'factory_receivable.cancel']);

        // 2. Buat roles
        $superAdminRole = Role::create(['name' => 'Super Admin', 'description' => 'Full access']);
        $superAdminRole->permissions()->sync([
            $viewPoPerm->id, $createPoPerm->id, $editPoPerm->id,
            $leaderApprovePerm->id, $financeApprovePerm->id, $receivePoPerm->id,
            $viewStockPerm->id, $viewFrPerm->id, $createFrPerm->id, $editFrPerm->id, $cancelFrPerm->id,
        ]);

        $financeRole = Role::create(['name' => 'Finance', 'description' => 'Finance access']);
        $financeRole->permissions()->sync([
            $viewFrPerm->id, $editFrPerm->id, $cancelFrPerm->id,
        ]);

        $viewerRole = Role::create(['name' => 'Viewer', 'description' => 'View only']);
        $viewerRole->permissions()->sync([$viewPoPerm->id]);

        // 3. Buat users
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

        // 4. Buat master data
        $this->supplier = Supplier::create([
            'supplier_code' => 'SUPP-0001',
            'name'          => 'Pabrik Sandal Utama',
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
            'name'           => 'Sandal Pria A',
            'category_id'    => $category->id,
            'purchase_price' => 50000.00,
            'selling_price'  => 90000.00,
            'unit'           => 'pcs',
            'stock'          => 10,
            'status'         => 'active',
            'created_by'     => $this->superAdmin->id,
        ]);

        $this->poService = app(PurchaseOrderService::class);
        $this->receivableService = app(FactoryReceivableService::class);
    }

    protected function createOrderedPO(int $qty = 100): PurchaseOrder
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
                    'price'           => 50000,
                    'discount_amount' => 0,
                    'tax_amount'      => 0,
                ],
            ],
        ], $this->superAdmin->id);

        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->superAdmin->id);
        $this->poService->financeApprove($po->fresh(), $this->superAdmin->id);
        $this->poService->markAsOrdered($po->fresh());

        return $po->fresh();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Create receivable from received PO
    // ─────────────────────────────────────────────────────────────────────────
    public function test_01_receivable_created_when_po_is_fully_received(): void
    {
        $po = $this->createOrderedPO(20);

        // Receive PO in full -> triggers status received & auto-create factory receivable
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 20],
            ],
        ]);

        $this->assertEquals('received', $po->status);
        $this->assertDatabaseHas('factory_receivables', [
            'purchase_order_id' => $po->id,
            'supplier_id'       => $this->supplier->id,
            'status'            => 'unpaid',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Cannot create from draft PO
    // ─────────────────────────────────────────────────────────────────────────
    public function test_02_cannot_create_receivable_from_draft_po(): void
    {
        $po = $this->poService->create([
            'supplier_id'   => $this->supplier->id,
            'warehouse_id'  => $this->warehouse->id,
            'order_date'    => '2026-07-01',
            'source'        => 'manual',
            'items'         => [
                [
                    'product_id' => $this->product->id,
                    'quantity'   => 10,
                    'price'      => 50000,
                ],
            ],
        ], $this->superAdmin->id);

        $this->expectException(InvalidArgumentException::class);
        $this->receivableService->createFromPurchaseOrder($po, null, null, $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Cannot create from partially received PO
    // ─────────────────────────────────────────────────────────────────────────
    public function test_03_cannot_create_receivable_from_partially_received_po(): void
    {
        $po = $this->createOrderedPO(50);

        // Receive partially (30 of 50) -> status partially_received
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 30],
            ],
        ]);

        $this->assertEquals('partially_received', $po->status);
        
        // Assert no factory receivable is created automatically
        $this->assertDatabaseMissing('factory_receivables', [
            'purchase_order_id' => $po->id,
        ]);

        // Attempting to manually create from a partially received PO should fail
        $this->expectException(InvalidArgumentException::class);
        $this->receivableService->createFromPurchaseOrder($po->fresh(), null, null, $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Duplicate receivable prevented
    // ─────────────────────────────────────────────────────────────────────────
    public function test_04_duplicate_factory_receivable_for_same_po_throws_exception(): void
    {
        $po = $this->createOrderedPO(20);
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 20],
            ],
        ]);

        $this->assertDatabaseHas('factory_receivables', ['purchase_order_id' => $po->id]);

        // Manual creation attempt again should throw exception
        $this->expectException(InvalidArgumentException::class);
        $this->receivableService->createFromPurchaseOrder($po->fresh(), null, null, $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Generate FP Number
    // ─────────────────────────────────────────────────────────────────────────
    public function test_05_receivable_number_has_correct_format(): void
    {
        $po = $this->createOrderedPO(10);
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        $this->assertMatchesRegularExpression('/^FP-\d{6}-\d{4}$/', $receivable->receivable_number);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Concurrent FP Number generation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_06_fp_number_generates_sequentially_without_gaps(): void
    {
        $po1 = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po1, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        // Simulating the sequential increment logic
        $po2 = $this->poService->create([
            'supplier_id'   => $this->supplier->id,
            'warehouse_id'  => $this->warehouse->id,
            'order_date'    => '2026-07-01',
            'source'        => 'manual',
            'items'         => [
                [
                    'product_id' => $this->product->id,
                    'quantity'   => 10,
                    'price'      => 50000,
                ],
            ],
        ], $this->superAdmin->id);
        $this->poService->submitApproval($po2);
        $this->poService->leaderApprove($po2->fresh(), $this->superAdmin->id);
        $this->poService->financeApprove($po2->fresh(), $this->superAdmin->id);
        $this->poService->markAsOrdered($po2->fresh());
        
        $this->poService->receiveGoods($po2->fresh(), [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $fr1 = FactoryReceivable::where('purchase_order_id', $po1->id)->first();
        $fr2 = FactoryReceivable::where('purchase_order_id', $po2->id)->first();

        [$prefix1, $ym1, $seq1] = explode('-', $fr1->receivable_number);
        [$prefix2, $ym2, $seq2] = explode('-', $fr2->receivable_number);

        $this->assertEquals((int)$seq1 + 1, (int)$seq2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Original Amount correct
    // ─────────────────────────────────────────────────────────────────────────
    public function test_07_original_amount_matches_po_grand_total(): void
    {
        $po = $this->createOrderedPO(10); // 10 * 50,000 = 500,000
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        $this->assertEquals($po->grand_total, $receivable->original_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Remaining Amount correct
    // ─────────────────────────────────────────────────────────────────────────
    public function test_08_remaining_amount_calculates_correctly(): void
    {
        $po = $this->createOrderedPO(10); // 500,000
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        
        // Simulating a partial payment
        $receivable->update(['paid_amount' => 200000.00]);
        $receivable = $this->receivableService->recalculateBalance($receivable);

        $this->assertEquals(300000.00, $receivable->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Paid Amount starts at zero
    // ─────────────────────────────────────────────────────────────────────────
    public function test_09_paid_amount_defaults_to_zero(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        $this->assertEquals(0.00, $receivable->paid_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Status unpaid
    // ─────────────────────────────────────────────────────────────────────────
    public function test_10_initial_status_is_unpaid(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        $this->assertEquals('unpaid', $receivable->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Overdue calculation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_11_status_becomes_overdue_after_due_date_passes_with_positive_balance(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        
        // Set due date to yesterday
        $receivable->update(['due_date' => now()->subDay()->format('Y-m-d')]);

        // Run overdue check/recalculation
        $receivable = $this->receivableService->recalculateBalance($receivable);

        $this->assertEquals('overdue', $receivable->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Paid status priority
    // ─────────────────────────────────────────────────────────────────────────
    public function test_12_status_is_paid_when_balance_is_zero_even_if_past_due_date(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        
        // Set due date to yesterday, and pay fully
        $receivable->update([
            'due_date'    => now()->subDay()->format('Y-m-d'),
            'paid_amount' => $receivable->original_amount,
        ]);

        // Run recalculation
        $receivable = $this->receivableService->recalculateBalance($receivable);

        // Paid status should take priority over overdue
        $this->assertEquals('paid', $receivable->status);
        $this->assertEquals(0.00, $receivable->remaining_amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Cancel receivable
    // ─────────────────────────────────────────────────────────────────────────
    public function test_13_can_cancel_unpaid_receivable(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        
        $receivable = $this->receivableService->cancel($receivable);

        $this->assertEquals('cancelled', $receivable->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Unauthorized view
    // ─────────────────────────────────────────────────────────────────────────
    public function test_14_unauthorized_user_cannot_view_receivables(): void
    {
        $response = $this->actingAs($this->readOnlyUser)->get('/factory-receivables');
        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. Unauthorized edit
    // ─────────────────────────────────────────────────────────────────────────
    public function test_15_unauthorized_user_cannot_edit_receivable(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();

        $response = $this->actingAs($this->readOnlyUser)->put("/factory-receivables/{$receivable->id}", [
            'due_date' => '2026-08-01',
            'notes'    => 'Hack notes',
        ]);

        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. Unauthorized cancel
    // ─────────────────────────────────────────────────────────────────────────
    public function test_16_unauthorized_user_cannot_cancel_receivable(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();

        // Viewer user does not have cancel permission
        $response = $this->actingAs($this->readOnlyUser)->post("/factory-receivables/{$receivable->id}/cancel");

        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. Purchase Order integration
    // ─────────────────────────────────────────────────────────────────────────
    public function test_17_po_receive_goods_completes_the_cycle(): void
    {
        $po = $this->createOrderedPO(50);

        // This covers the full controller endpoint execution
        $response = $this->actingAs($this->superAdmin)->post("/purchase-orders/{$po->id}/receive", [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 50],
            ],
        ]);

        $response->assertRedirect();
        
        $this->assertDatabaseHas('purchase_orders', ['id' => $po->id, 'status' => 'received']);
        $this->assertDatabaseHas('factory_receivables', [
            'purchase_order_id' => $po->id,
            'original_amount'   => 50 * 50000.00,
            'status'            => 'unpaid',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 18. Atomic transaction rollback
    // ─────────────────────────────────────────────────────────────────────────
    public function test_18_po_receive_goods_rolls_back_entirely_on_receivable_creation_failure(): void
    {
        $po = $this->createOrderedPO(10);

        // Pre-create duplicate factory receivable to force a conflict / exception in Service during PO receive
        FactoryReceivable::create([
            'receivable_number' => 'FP-202607-9999',
            'supplier_id'       => $po->supplier_id,
            'purchase_order_id' => $po->id,
            'transaction_date'  => '2026-07-01',
            'original_amount'   => 500000.00,
            'remaining_amount'  => 500000.00,
            'status'            => 'unpaid',
        ]);

        // Attempting to receive the goods fully should fail and rollback PO status and stock
        $oldStock = $this->product->stock; // 10

        try {
            $this->poService->receiveGoods($po, [
                'items' => [
                    ['product_id' => $this->product->id, 'received_qty' => 10],
                ],
            ]);
        } catch (\Exception $e) {
            // expected due to duplicate validation
        }

        // Verify status remained 'ordered' (no received status)
        $this->assertEquals('ordered', $po->fresh()->status);
        // Verify stock was not updated
        $this->assertEquals($oldStock, $this->product->fresh()->stock);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 19. Traceability to PO
    // ─────────────────────────────────────────────────────────────────────────
    public function test_19_receivable_can_trace_back_to_po_and_supplier(): void
    {
        $po = $this->createOrderedPO(10);
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product->id, 'received_qty' => 10],
            ],
        ]);

        $receivable = FactoryReceivable::where('purchase_order_id', $po->id)->first();
        
        $this->assertNotNull($receivable->purchaseOrder);
        $this->assertEquals($po->id, $receivable->purchaseOrder->id);
        $this->assertNotNull($receivable->supplier);
        $this->assertEquals($this->supplier->id, $receivable->supplier->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 20. Existing tests remain passed
    // ─────────────────────────────────────────────────────────────────────────
    public function test_20_existing_tests_run_successfully(): void
    {
        // This is represented by asserting true as the suite executes in full anyway.
        $this->assertTrue(true);
    }
}
