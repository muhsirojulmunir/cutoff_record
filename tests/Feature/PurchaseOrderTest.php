<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Permission;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\PurchaseOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;
use Tests\TestCase;

class PurchaseOrderTest extends TestCase
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

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Buat permissions
        $viewPerm          = Permission::firstOrCreate(['name' => 'purchase_order.view']);
        $createPerm        = Permission::firstOrCreate(['name' => 'purchase_order.create']);
        $editPerm          = Permission::firstOrCreate(['name' => 'purchase_order.edit']);
        $deletePerm        = Permission::firstOrCreate(['name' => 'purchase_order.delete']);
        $leaderApprovePerm = Permission::firstOrCreate(['name' => 'purchase_order.leader_approve']);
        $financeApprovePerm= Permission::firstOrCreate(['name' => 'purchase_order.finance_approve']);
        $receivePerm       = Permission::firstOrCreate(['name' => 'purchase_order.receive']);
        $dashPerm          = Permission::firstOrCreate(['name' => 'dashboard.view']);

        // 2. Buat roles
        $superAdminRole = Role::firstOrCreate(['name' => 'Super Admin'], ['description' => 'Full access']);
        $superAdminRole->permissions()->sync([
            $viewPerm->id, $createPerm->id, $editPerm->id, $deletePerm->id,
            $leaderApprovePerm->id, $financeApprovePerm->id, $receivePerm->id, $dashPerm->id,
        ]);

        $leaderRole = Role::firstOrCreate(['name' => 'Leader'], ['description' => 'Leader approval']);
        $leaderRole->permissions()->sync([
            $viewPerm->id, $createPerm->id, $editPerm->id, $leaderApprovePerm->id,
        ]);

        $financeRole = Role::firstOrCreate(['name' => 'Finance'], ['description' => 'Finance approval']);
        $financeRole->permissions()->sync([
            $viewPerm->id, $financeApprovePerm->id,
        ]);

        $viewerRole = Role::firstOrCreate(['name' => 'Viewer'], ['description' => 'View only']);
        $viewerRole->permissions()->sync([$viewPerm->id]);

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
            'status'         => 'active',
            'created_by'     => $this->superAdmin->id,
        ]);

        $this->poService = app(PurchaseOrderService::class);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper untuk membuat PO secara langsung via service
    // ─────────────────────────────────────────────────────────────────────────

    protected function makePOData(array $override = []): array
    {
        return array_merge([
            'supplier_id'   => $this->supplier->id,
            'warehouse_id'  => $this->warehouse->id,
            'order_date'    => '2026-07-01',
            'source'        => 'manual',
            'discount_amount' => 0,
            'tax_amount'    => 0,
            'shipping_cost' => 0,
            'notes'         => 'Test PO',
            'items'         => [
                [
                    'product_id'      => $this->product1->id,
                    'quantity'        => 10,
                    'price'           => 80000,
                    'discount_amount' => 0,
                    'tax_amount'      => 0,
                ],
            ],
        ], $override);
    }

    protected function createDraftPO(): PurchaseOrder
    {
        return $this->poService->create($this->makePOData(), $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-01: Buat PO berhasil (halaman Create dapat diakses)
    // ─────────────────────────────────────────────────────────────────────────

    public function test_01_create_page_can_be_accessed_by_authorized_user(): void
    {
        $response = $this->actingAs($this->superAdmin)->get('/purchase-orders/create');
        $response->assertStatus(200);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-02: User tanpa izin create tidak bisa buka halaman Create
    // ─────────────────────────────────────────────────────────────────────────

    public function test_02_create_page_forbidden_for_viewer_user(): void
    {
        $response = $this->actingAs($this->readOnlyUser)->get('/purchase-orders/create');
        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-03: POST store PO berhasil dengan data valid
    // ─────────────────────────────────────────────────────────────────────────

    public function test_03_store_purchase_order_with_valid_data(): void
    {
        $response = $this->actingAs($this->superAdmin)->post('/purchase-orders', $this->makePOData());

        $response->assertRedirectContains('/purchase-orders/');
        $this->assertDatabaseHas('purchase_orders', [
            'supplier_id' => $this->supplier->id,
            'status'      => 'draft',
        ]);
        $this->assertDatabaseHas('purchase_order_items', [
            'product_id' => $this->product1->id,
            'quantity'   => 10,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-04: Nomor PO otomatis diformat PO-YYYYMM-XXXX
    // ─────────────────────────────────────────────────────────────────────────

    public function test_04_po_number_is_auto_generated_with_correct_format(): void
    {
        $po = $this->createDraftPO();

        $this->assertMatchesRegularExpression('/^PO-\d{6}-\d{4}$/', $po->po_number);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-05: PO kedua memiliki nomor urut yang lebih besar
    // ─────────────────────────────────────────────────────────────────────────

    public function test_05_po_number_increments_sequentially(): void
    {
        $po1 = $this->poService->create($this->makePOData(['order_date' => '2026-07-01']), $this->superAdmin->id);
        $po2 = $this->poService->create($this->makePOData(['order_date' => '2026-07-01']), $this->superAdmin->id);

        [$prefix1, $year1, $seq1] = explode('-', $po1->po_number);
        [$prefix2, $year2, $seq2] = explode('-', $po2->po_number);

        $this->assertEquals((int)$seq1 + 1, (int)$seq2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-06: Grand total dihitung dengan benar (Subtotal - Disc + Tax + Shipping)
    // ─────────────────────────────────────────────────────────────────────────

    public function test_06_grand_total_is_calculated_correctly(): void
    {
        $data = $this->makePOData([
            'discount_amount' => 5000,
            'tax_amount'      => 8000,
            'shipping_cost'   => 15000,
            'items'           => [
                [
                    'product_id'      => $this->product1->id,
                    'quantity'        => 5,
                    'price'           => 80000,
                    'discount_amount' => 0,
                    'tax_amount'      => 0,
                ],
            ],
        ]);

        $po = $this->poService->create($data, $this->superAdmin->id);

        // subtotal = (80000 * 5) = 400000
        // grand_total = 400000 - 5000 + 8000 + 15000 = 418000
        $this->assertEquals('400000.00', $po->subtotal);
        $this->assertEquals('418000.00', $po->grand_total);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-07: Validasi gagal jika supplier_id tidak diisi
    // ─────────────────────────────────────────────────────────────────────────

    public function test_07_store_fails_validation_without_supplier_id(): void
    {
        $data = $this->makePOData(['supplier_id' => '']);

        $response = $this->actingAs($this->superAdmin)->post('/purchase-orders', $data);
        $response->assertSessionHasErrors('supplier_id');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-08: Validasi gagal jika items kosong
    // ─────────────────────────────────────────────────────────────────────────

    public function test_08_store_fails_validation_without_items(): void
    {
        $data = $this->makePOData(['items' => []]);

        $response = $this->actingAs($this->superAdmin)->post('/purchase-orders', $data);
        $response->assertSessionHasErrors('items');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-09: Submit approval mengubah status draft -> pending_leader_approval
    // ─────────────────────────────────────────────────────────────────────────

    public function test_09_submit_approval_changes_status_to_pending(): void
    {
        $po = $this->createDraftPO();

        $response = $this->actingAs($this->superAdmin)
            ->post("/purchase-orders/{$po->id}/submit-approval");

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'     => $po->id,
            'status' => 'pending_leader_approval',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-10: Submit approval gagal jika PO sudah bukan draft
    // ─────────────────────────────────────────────────────────────────────────

    public function test_10_submit_approval_fails_if_not_draft(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);

        $this->expectException(InvalidArgumentException::class);
        $this->poService->submitApproval($po->fresh());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-11: Leader Approve PO: pending_leader_approval -> pending_finance_approval
    // ─────────────────────────────────────────────────────────────────────────

    public function test_11_leader_approve_changes_status_to_pending_finance(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);

        $response = $this->actingAs($this->leaderUser)
            ->post("/purchase-orders/{$po->id}/leader-approve");

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'                 => $po->id,
            'status'             => 'pending_finance_approval',
            'leader_approved_by' => $this->leaderUser->id,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-11b: Finance Approve PO: pending_finance_approval -> approved
    // ─────────────────────────────────────────────────────────────────────────

    public function test_11b_finance_approve_changes_status_to_approved(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);

        $response = $this->actingAs($this->financeUser)
            ->post("/purchase-orders/{$po->id}/finance-approve");

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'                  => $po->id,
            'status'              => 'approved',
            'finance_approved_by' => $this->financeUser->id,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-12: User tanpa permission leader_approve tidak bisa leader-approve PO
    // ─────────────────────────────────────────────────────────────────────────

    public function test_12_leader_approve_forbidden_for_user_without_permission(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);

        $response = $this->actingAs($this->readOnlyUser)
            ->post("/purchase-orders/{$po->id}/leader-approve");

        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-13: Mark as Ordered mengubah status approved -> ordered
    // ─────────────────────────────────────────────────────────────────────────

    public function test_13_mark_ordered_changes_status_to_ordered(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);

        $response = $this->actingAs($this->superAdmin)
            ->post("/purchase-orders/{$po->id}/mark-ordered");

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'     => $po->id,
            'status' => 'ordered',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-14: Receive Goods (partial) mengubah status -> partially_received
    // ─────────────────────────────────────────────────────────────────────────

    public function test_14_receive_goods_partial_changes_status_to_partially_received(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());

        // PO memiliki 10 unit product1 — receive 5 (partial)
        $response = $this->actingAs($this->superAdmin)->post("/purchase-orders/{$po->id}/receive", [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 5],
            ],
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'     => $po->id,
            'status' => 'partially_received',
        ]);
        $this->assertDatabaseHas('purchase_order_items', [
            'purchase_order_id' => $po->id,
            'product_id'        => $this->product1->id,
            'received_quantity' => 5,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-15: Receive Goods (full) mengubah status -> received
    // ─────────────────────────────────────────────────────────────────────────

    public function test_15_receive_goods_full_changes_status_to_received(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());

        // Receive semua 10 unit
        $response = $this->actingAs($this->superAdmin)->post("/purchase-orders/{$po->id}/receive", [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 10],
            ],
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'     => $po->id,
            'status' => 'received',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-16: Receive Goods melebihi ordered quantity harus gagal
    // ─────────────────────────────────────────────────────────────────────────

    public function test_16_receive_goods_over_quantity_throws_exception(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());

        $this->expectException(InvalidArgumentException::class);

        $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 15], // Melebihi qty = 10
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-17: User tanpa permission receive tidak bisa receive goods
    // ─────────────────────────────────────────────────────────────────────────

    public function test_17_receive_forbidden_for_viewer_user(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());

        $response = $this->actingAs($this->readOnlyUser)->post("/purchase-orders/{$po->id}/receive", [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 5],
            ],
        ]);

        $response->assertStatus(403);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-18: Cancel PO dari status draft berhasil
    // ─────────────────────────────────────────────────────────────────────────

    public function test_18_cancel_po_from_draft_status(): void
    {
        $po = $this->createDraftPO();

        $response = $this->actingAs($this->superAdmin)
            ->post("/purchase-orders/{$po->id}/cancel");

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'     => $po->id,
            'status' => 'cancelled',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-19: PO yang sudah received tidak bisa di-cancel
    // ─────────────────────────────────────────────────────────────────────────

    public function test_19_cancel_po_fails_if_already_received(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());
        $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 10],
            ],
        ]);

        $this->expectException(InvalidArgumentException::class);
        $this->poService->cancel($po->fresh());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-20: Delete PO draft berhasil dihapus (soft delete)
    // ─────────────────────────────────────────────────────────────────────────

    public function test_20_delete_po_draft_soft_deletes_successfully(): void
    {
        $po = $this->createDraftPO();

        $response = $this->actingAs($this->superAdmin)
            ->delete("/purchase-orders/{$po->id}");

        $response->assertRedirect('/purchase-orders');
        $this->assertSoftDeleted('purchase_orders', ['id' => $po->id]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-21: Pay Down Payment untuk PO approved mencatat kas keluar & DP amount
    // ─────────────────────────────────────────────────────────────────────────

    public function test_21_pay_down_payment_deducts_cash_and_sets_dp_fields(): void
    {
        $account = \App\Models\CashBankAccount::create([
            'account_code'    => '101-DPTEST',
            'account_name'    => 'Kas DP Test',
            'account_type'    => 'cash',
            'current_balance' => 10000000.00,
            'status'          => 'active',
            'created_by'      => $this->superAdmin->id,
        ]);

        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);

        $response = $this->actingAs($this->financeUser)->post("/purchase-orders/{$po->id}/pay-dp", [
            'dp_amount'            => 200000.00,
            'cash_bank_account_id' => $account->id,
            'payment_terms'        => 'tempo_1_week',
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'            => $po->id,
            'dp_amount'     => 200000.00,
            'payment_terms' => 'tempo_1_week',
        ]);

        // Saldo terpotong: 10,000,000 - 200,000 = 9,800,000
        $this->assertEquals(9800000.00, (float) $account->fresh()->current_balance);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-22: Finance Validate Received Items menghitung tagihan akhir
    // ─────────────────────────────────────────────────────────────────────────

    public function test_22_finance_validate_received_items_calculates_final_bill(): void
    {
        $po = $this->createDraftPO();
        $this->poService->submitApproval($po);
        $this->poService->leaderApprove($po->fresh(), $this->leaderUser->id);
        $this->poService->financeApprove($po->fresh(), $this->financeUser->id);
        $this->poService->markAsOrdered($po->fresh());
        $this->poService->receiveGoods($po->fresh(), [
            'items' => [
                ['product_id' => $this->product1->id, 'received_qty' => 10],
            ],
        ]);

        $item = $po->fresh()->items->first();

        $response = $this->actingAs($this->financeUser)->post("/purchase-orders/{$po->id}/validate-receiving", [
            'items' => [
                [
                    'item_id'              => $item->id,
                    'action'               => 'accepted',
                    'accepted_quantity'    => 10,
                    'rejected_quantity'    => 0,
                    'validated_unit_price' => 50000.00,
                ],
            ],
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('purchase_orders', [
            'id'                   => $po->id,
            'status'               => 'finance_validated',
            'is_finance_validated' => true,
            'validated_grand_total'=> 500000.00,
            'final_bill_amount'    => 500000.00,
        ]);
    }
}
