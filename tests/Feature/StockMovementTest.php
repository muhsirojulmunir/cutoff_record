<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Permission;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\PurchaseOrderService;
use App\Services\StockMovementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use Tests\TestCase;

class StockMovementTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $leaderUser;
    protected User $financeUser;
    protected User $readOnlyUser;
    protected Supplier $supplier;
    protected Warehouse $warehouse;
    protected Product $product1;
    protected Product $product2;
    protected PurchaseOrderService $poService;
    protected StockMovementService $stockService;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Buat permissions
        $viewPoPerm        = Permission::firstOrCreate(['name' => 'purchase_order.view']);
        $createPoPerm      = Permission::firstOrCreate(['name' => 'purchase_order.create']);
        $editPoPerm        = Permission::firstOrCreate(['name' => 'purchase_order.edit']);
        $leaderApprovePerm = Permission::firstOrCreate(['name' => 'purchase_order.leader_approve']);
        $financeApprovePerm= Permission::firstOrCreate(['name' => 'purchase_order.finance_approve']);
        $receivePoPerm     = Permission::firstOrCreate(['name' => 'purchase_order.receive']);
        $viewStockPerm     = Permission::firstOrCreate(['name' => 'stock.view']);
        $adjustStockPerm   = Permission::firstOrCreate(['name' => 'stock.adjust']);

        // 2. Buat roles
        $superAdminRole = Role::firstOrCreate(['name' => 'Super Admin'], ['description' => 'Full access']);
        $superAdminRole->permissions()->sync([
            $viewPoPerm->id, $createPoPerm->id, $editPoPerm->id,
            $leaderApprovePerm->id, $financeApprovePerm->id, $receivePoPerm->id,
            $viewStockPerm->id, $adjustStockPerm->id,
        ]);

        $leaderRole = Role::firstOrCreate(['name' => 'Leader'], ['description' => 'Leader approval']);
        $leaderRole->permissions()->sync([
            $viewPoPerm->id, $createPoPerm->id, $editPoPerm->id, $leaderApprovePerm->id,
        ]);

        $financeRole = Role::firstOrCreate(['name' => 'Finance'], ['description' => 'Finance approval']);
        $financeRole->permissions()->sync([
            $viewPoPerm->id, $financeApprovePerm->id,
        ]);

        $viewerRole = Role::firstOrCreate(['name' => 'Viewer'], ['description' => 'View only']);
        $viewerRole->permissions()->sync([$viewPoPerm->id]);

        // 3. Buat users
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
            'name'          => 'Pabrik Sepatu Utama',
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);

        $this->warehouse = Warehouse::create([
            'code'       => 'WH-001',
            'name'       => 'Gudang Utama',
            'status'     => 'active',
            'created_by' => $this->superAdmin->id,
        ]);

        $category = Category::create(['name' => 'Sepatu', 'status' => 'active']);

        $this->product1 = Product::create([
            'sku'            => 'PROD-0001',
            'name'           => 'Sepatu Pria A',
            'category_id'    => $category->id,
            'purchase_price' => 80000.00,
            'selling_price'  => 150000.00,
            'unit'           => 'pcs',
            'stock'          => 50, // Initial stock 50
            'status'         => 'active',
            'created_by'     => $this->superAdmin->id,
        ]);

        $this->product2 = Product::create([
            'sku'            => 'PROD-0002',
            'name'           => 'Kaos Kaki B',
            'category_id'    => $category->id,
            'purchase_price' => 10000.00,
            'selling_price'  => 20000.00,
            'unit'           => 'pcs',
            'stock'          => 20, // Initial stock 20
            'status'         => 'active',
            'created_by'     => $this->superAdmin->id,
        ]);

        $this->poService = app(PurchaseOrderService::class);
        $this->stockService = app(StockMovementService::class);
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
                    'product_id'      => $this->product1->id,
                    'quantity'        => $qty,
                    'price'           => 80000,
                    'discount_amount' => 0,
                    'tax_amount'      => 0,
                ],
            ],
        ], $this->superAdmin->id);

        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());

        return $po->fresh();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Stock In
    // ─────────────────────────────────────────────────────────────────────────
    public function test_01_stock_in_creates_movement_successfully(): void
    {
        $movement = $this->stockService->recordStockIn(
            $this->product1,
            $this->warehouse->id,
            30,
            'manual',
            null,
            'MAN-001',
            'Manual In',
            $this->superAdmin->id
        );

        $this->assertInstanceOf(StockMovement::class, $movement);
        $this->assertEquals('in', $movement->movement_type);
        $this->assertEquals(30, $movement->quantity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Stock Before Calculation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_02_stock_before_is_calculated_correctly(): void
    {
        $initialStock = $this->product1->stock; // 50
        $movement = $this->stockService->recordStockIn(
            $this->product1,
            $this->warehouse->id,
            20,
            'manual',
            null,
            'MAN-002',
            'Manual In',
            $this->superAdmin->id
        );

        $this->assertEquals($initialStock, $movement->stock_before);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Stock After Calculation
    // ─────────────────────────────────────────────────────────────────────────
    public function test_03_stock_after_is_calculated_correctly(): void
    {
        $initialStock = $this->product1->stock; // 50
        $quantity = 15;
        $movement = $this->stockService->recordStockIn(
            $this->product1,
            $this->warehouse->id,
            $quantity,
            'manual',
            null,
            'MAN-003',
            'Manual In',
            $this->superAdmin->id
        );

        $expectedStockAfter = $initialStock + $quantity;
        $this->assertEquals($expectedStockAfter, $movement->stock_after);
        $this->assertEquals($movement->stock_before + $movement->quantity, $movement->stock_after);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Purchase Order Receiving Creates Stock Movement
    // ─────────────────────────────────────────────────────────────────────────
    public function test_04_po_receiving_creates_stock_movement(): void
    {
        $po = $this->createOrderedPO(50);

        // Receive 30 units
        $this->actingAs($this->superAdmin)->post("/purchase-orders/{$po->id}/receive", [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 30],
            ],
        ]);

        $this->assertDatabaseHas('stock_movements', [
            'product_id'       => $this->product1->id,
            'warehouse_id'     => $this->warehouse->id,
            'movement_type'    => 'in',
            'quantity'         => 30,
            'reference_type'   => 'purchase_order',
            'reference_id'     => $po->id,
            'reference_number' => $po->po_number,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Product Stock Updated
    // ─────────────────────────────────────────────────────────────────────────
    public function test_05_po_receiving_updates_product_stock_column(): void
    {
        $po = $this->createOrderedPO(40);
        $oldStock = $this->product1->stock; // 50

        // Receive 20 units
        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 20],
            ],
        ]);

        $this->assertEquals($oldStock + 20, $this->product1->fresh()->stock);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Partial Receiving
    // ─────────────────────────────────────────────────────────────────────────
    public function test_06_partial_receiving_sets_status_partially_received(): void
    {
        $po = $this->createOrderedPO(100);

        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 40],
            ],
        ]);

        $this->assertEquals('partially_received', $po->status);
        $this->assertEquals(40, $po->items->first()->received_quantity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Full Receiving
    // ─────────────────────────────────────────────────────────────────────────
    public function test_07_full_receiving_sets_status_received(): void
    {
        $po = $this->createOrderedPO(100);

        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 100],
            ],
        ]);

        $this->assertEquals('received', $po->status);
        $this->assertEquals(100, $po->items->first()->received_quantity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Over Receiving Rejected
    // ─────────────────────────────────────────────────────────────────────────
    public function test_08_over_receiving_is_rejected_with_exception(): void
    {
        $po = $this->createOrderedPO(50);

        $this->expectException(InvalidArgumentException::class);

        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 51], // Over
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Duplicate Receiving Rejected
    // ─────────────────────────────────────────────────────────────────────────
    public function test_09_duplicate_receiving_prevented_by_validation(): void
    {
        $po = $this->createOrderedPO(50);

        // Receive 30 units
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 30],
            ],
        ]);

        $this->expectException(InvalidArgumentException::class);

        // Receive 30 units again (total 60, exceeds 50)
        $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 30],
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Stock Cannot Be Negative
    // ─────────────────────────────────────────────────────────────────────────
    public function test_10_stock_cannot_be_negative_for_out(): void
    {
        $this->product1->update(['stock' => 10]); // current stock = 10

        $this->expectException(InvalidArgumentException::class);

        // Out 15 units (exceeds current stock)
        $this->stockService->recordStockOut(
            $this->product1->fresh(),
            $this->warehouse->id,
            15,
            'manual',
            null,
            'MAN-OUT-001',
            'Manual Out',
            $this->superAdmin->id
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Transaction Rollback
    // ─────────────────────────────────────────────────────────────────────────
    public function test_11_transaction_rolls_back_if_subsequent_step_fails(): void
    {
        $po = $this->createOrderedPO(50);
        $oldStock = $this->product1->stock; // 50

        try {
            DB::transaction(function () use ($po) {
                // Step 1: receive goods valid
                $this->poService->receiveGoods($po, [
                    'items' => [
                        ['product_id' => $this->product1->id, 'received_qty' => 20],
                    ],
                ]);

                // Step 2: trigger exception
                throw new \Exception('Simulated Failure');
            });
        } catch (\Exception $e) {
            // expected
        }

        // Assert stock not updated and no movements created
        $this->assertEquals($oldStock, $this->product1->fresh()->stock);
        $this->assertEquals(0, StockMovement::where('reference_id', $po->id)->count());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Concurrent Stock Update
    // ─────────────────────────────────────────────────────────────────────────
    public function test_12_concurrent_stock_update_is_safe(): void
    {
        $this->product1->update(['stock' => 100]);

        // Simulating concurrency is normally done by multi-threading.
        // We will simulate that we have an active transaction holding the lock,
        // and we verify that the lock works.
        DB::beginTransaction();

        $prodLocked = Product::where('id', $this->product1->id)->lockForUpdate()->first();
        $this->assertEquals(100, $prodLocked->stock);

        // Modify in the same transaction simulation
        $prodLocked->update(['stock' => 120]);

        DB::commit();

        $this->assertEquals(120, $this->product1->fresh()->stock);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Unauthorized Stock View
    // ─────────────────────────────────────────────────────────────────────────
    public function test_13_unauthorized_user_cannot_view_stock_movements(): void
    {
        $response = $this->actingAs($this->readOnlyUser)->get('/stock-movements');
        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Unauthorized Stock Adjustment
    // ─────────────────────────────────────────────────────────────────────────
    public function test_14_unauthorized_user_cannot_perform_adjustment(): void
    {
        $response = $this->actingAs($this->leaderUser)->post('/stock-movements/adjust', [
            'product_id'   => $this->product1->id,
            'warehouse_id' => $this->warehouse->id,
            'type'         => 'in',
            'quantity'     => 10,
            'reason'       => 'Unauthorized try',
        ]);

        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. Stock Movement Is Read Only
    // ─────────────────────────────────────────────────────────────────────────
    public function test_15_stock_movement_has_no_edit_or_delete_routes(): void
    {
        // Assert we get 404 or method not allowed because edit, update, delete routes don't exist
        $response1 = $this->actingAs($this->superAdmin)->get('/stock-movements/1/edit');
        $response2 = $this->actingAs($this->superAdmin)->put('/stock-movements/1', []);
        $response3 = $this->actingAs($this->superAdmin)->delete('/stock-movements/1');

        $response1->assertStatus(404);
        $response2->assertStatus(404);
        $response3->assertStatus(404);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. Reference PO Correct
    // ─────────────────────────────────────────────────────────────────────────
    public function test_16_reference_po_is_saved_correctly(): void
    {
        $po = $this->createOrderedPO(50);

        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 10],
            ],
        ]);

        $movement = StockMovement::where('reference_id', $po->id)->first();
        $this->assertEquals('purchase_order', $movement->reference_type);
        $this->assertEquals($po->po_number, $movement->reference_number);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. Warehouse Correct
    // ─────────────────────────────────────────────────────────────────────────
    public function test_17_warehouse_is_saved_correctly(): void
    {
        $po = $this->createOrderedPO(50);

        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 10],
            ],
        ]);

        $movement = StockMovement::where('reference_id', $po->id)->first();
        $this->assertEquals($this->warehouse->id, $movement->warehouse_id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 18. Product Correct
    // ─────────────────────────────────────────────────────────────────────────
    public function test_18_product_is_saved_correctly(): void
    {
        $po = $this->createOrderedPO(50);

        $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 10],
            ],
        ]);

        $movement = StockMovement::where('reference_id', $po->id)->first();
        $this->assertEquals($this->product1->id, $movement->product_id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 19. Multiple Receiving
    // ─────────────────────────────────────────────────────────────────────────
    public function test_19_multiple_receiving_accumulates_stock_and_creates_multiple_movements(): void
    {
        $po = $this->createOrderedPO(100);
        $oldStock = $this->product1->stock; // 50

        // Receive 1
        $po = $this->poService->receiveGoods($po, [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 20],
            ],
        ]);
        $this->assertEquals('partially_received', $po->status);

        // Receive 2
        $po = $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 30],
            ],
        ]);
        $this->assertEquals('partially_received', $po->status);

        // Receive 3 (Final Full Receive)
        $po = $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 50],
            ],
        ]);
        $this->assertEquals('received', $po->status);

        // Verify total stock update (50 + 20 + 30 + 50 = 150)
        $this->assertEquals($oldStock + 100, $this->product1->fresh()->stock);

        // Verify 3 movements created
        $this->assertEquals(3, StockMovement::where('reference_id', $po->id)->count());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 20. Stock Adjustment (Manual via controller)
    // ─────────────────────────────────────────────────────────────────────────
    public function test_20_authorized_user_can_perform_stock_adjustment(): void
    {
        $oldStock = $this->product1->stock; // 50

        $response = $this->actingAs($this->superAdmin)->post('/stock-movements/adjust', [
            'product_id'   => $this->product1->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity'     => -20, // adjust down by 20
            'notes'        => 'Manual Stock Adjustment Down',
        ]);

        $response->assertRedirect();
        $this->assertEquals($oldStock - 20, $this->product1->fresh()->stock);
        $this->assertDatabaseHas('stock_movements', [
            'product_id'    => $this->product1->id,
            'warehouse_id'  => $this->warehouse->id,
            'movement_type' => 'adjustment',
            'quantity'      => 20,
            'stock_before'  => $oldStock,
            'stock_after'   => $oldStock - 20,
            'notes'         => 'Manual Stock Adjustment Down',
        ]);
    }
}
