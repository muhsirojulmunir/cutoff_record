<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SalesOrderTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $salesUser;
    protected Customer $customer;
    protected Product $product1;
    protected Product $product2;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Buat permission dan role
        $viewPerm   = Permission::create(['name' => 'sales_order.view']);
        $createPerm = Permission::create(['name' => 'sales_order.create']);
        $editPerm   = Permission::create(['name' => 'sales_order.edit']);
        $deletePerm = Permission::create(['name' => 'sales_order.delete']);
        $approvePerm = Permission::create(['name' => 'sales_order.approve']);

        $superAdminRole = Role::create([
            'name'        => 'Super Admin',
            'description' => 'Super Admin Access',
        ]);
        $superAdminRole->permissions()->sync([
            $viewPerm->id, $createPerm->id, $editPerm->id, $deletePerm->id, $approvePerm->id,
        ]);

        $salesRole = Role::create([
            'name'        => 'Sales',
            'description' => 'Sales Access',
        ]);
        $salesRole->permissions()->sync([
            $viewPerm->id, $createPerm->id, $editPerm->id,
        ]);

        // 2. Buat users
        $this->superAdmin = User::create([
            'name'     => 'Super Admin User',
            'email'    => 'superadmin@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
            'status'   => 'active',
        ]);

        $this->salesUser = User::create([
            'name'     => 'Sales User',
            'email'    => 'sales@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $salesRole->id,
            'status'   => 'active',
        ]);

        // 3. Buat master data pendukung
        $this->customer = Customer::create([
            'customer_code' => 'CUST-0001',
            'name'          => 'Customer Test',
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);

        $category = Category::create([
            'name'   => 'Sepatu',
            'status' => 'active',
        ]);

        $this->product1 = Product::create([
            'sku'           => 'PROD-0001',
            'name'          => 'Sepatu Sekolah A',
            'category_id'   => $category->id,
            'selling_price' => 150000.00,
            'unit'          => 'pcs',
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);

        $this->product2 = Product::create([
            'sku'           => 'PROD-0002',
            'name'          => 'Kaos Kaki B',
            'category_id'   => $category->id,
            'selling_price' => 20000.00,
            'unit'          => 'pcs',
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);
    }

    /**
     * Test pembuatan Sales Order berhasil beserta validasi perhitungan grand total.
     */
    public function test_create_sales_order_success(): void
    {
        $payload = [
            'customer_id'     => $this->customer->id,
            'order_date'      => now()->format('Y-m-d'),
            'source'          => 'manual',
            'sales_channel'   => 'manual',
            'notes'           => 'Test Sales Order',
            'discount_amount' => 10000,
            'tax_amount'      => 5000,
            'shipping_cost'   => 15000,
            'items' => [
                [
                    'product_id'      => $this->product1->id,
                    'quantity'        => 2,
                    'price'           => 150000,
                    'discount_amount' => 5000,
                    'tax_amount'      => 0,
                ],
                [
                    'product_id'      => $this->product2->id,
                    'quantity'        => 3,
                    'price'           => 20000,
                    'discount_amount' => 0,
                    'tax_amount'      => 2000,
                ],
            ],
        ];

        $response = $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post('/sales-orders', $payload);

        $response->assertRedirect('/sales-orders');
        $this->assertDatabaseHas('sales_orders', [
            'customer_id'    => $this->customer->id,
            'source'         => 'manual',
            'status'         => 'draft',
            'payment_status' => 'unpaid',
        ]);

        $so = SalesOrder::first();
        // Item 1: (150k * 2) - 5k = 295k
        // Item 2: (20k * 3) + 2k = 62k
        // Subtotal = 295k + 62k = 357k
        // Grand Total = 357k - 10k (Header Disc) + 5k (Header Tax) + 15k (Header Shipping) = 367k
        $this->assertEquals(357000.00, (float) $so->subtotal);
        $this->assertEquals(367000.00, (float) $so->grand_total);

        // Verifikasi snapshot pada items
        $this->assertDatabaseHas('sales_order_items', [
            'sales_order_id' => $so->id,
            'product_id'     => $this->product1->id,
            'product_name'   => 'Sepatu Sekolah A',
            'sku'            => 'PROD-0001',
            'quantity'       => 2,
        ]);
    }

    /**
     * Test auto-generate SO Number berurutan dan unik.
     */
    public function test_generate_unique_so_number(): void
    {
        $payloadTemplate = [
            'order_date'    => '2026-07-26',
            'source'        => 'manual',
            'sales_channel' => 'manual',
            'items'         => [
                [
                    'product_id' => $this->product1->id,
                    'quantity'   => 1,
                    'price'      => 150000,
                ],
            ],
        ];

        // Buat SO pertama
        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post('/sales-orders', $payloadTemplate);

        // Buat SO kedua
        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post('/sales-orders', $payloadTemplate);

        $so1 = SalesOrder::orderBy('id', 'asc')->first();
        $so2 = SalesOrder::orderBy('id', 'desc')->first();

        $this->assertEquals('SO-202607-0001', $so1->so_number);
        $this->assertEquals('SO-202607-0002', $so2->so_number);
    }

    /**
     * Test validasi input: minimal 1 item wajib.
     */
    public function test_create_sales_order_validation_minimum_items(): void
    {
        $payload = [
            'order_date'    => now()->format('Y-m-d'),
            'source'        => 'manual',
            'sales_channel' => 'manual',
            'items'         => [], // Kosong
        ];

        $response = $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post('/sales-orders', $payload);

        $response->assertSessionHasErrors(['items']);
    }

    /**
     * Test alur workflow: Draft -> Pending Approval -> Approved.
     */
    public function test_sales_order_approval_workflow(): void
    {
        // 1. Buat Sales Order (status default Draft)
        $so = SalesOrder::create([
            'so_number'      => 'SO-202607-0001',
            'customer_id'    => $this->customer->id,
            'order_date'     => '2026-07-26',
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'draft',
            'payment_status' => 'unpaid',
            'subtotal'       => 150000,
            'grand_total'    => 150000,
            'created_by'     => $this->superAdmin->id,
        ]);

        // 2. Ajukan persetujuan (Submit for Approval)
        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/submit-approval");

        $this->assertEquals('pending_approval', $so->fresh()->status);

        // 3. Setujui (Approve)
        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/approve");

        $this->assertEquals('approved', $so->fresh()->status);
    }

    /**
     * Test pembatalan (Cancel) Sales Order.
     */
    public function test_cancel_sales_order(): void
    {
        $so = SalesOrder::create([
            'so_number'      => 'SO-202607-0001',
            'customer_id'    => $this->customer->id,
            'order_date'     => '2026-07-26',
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'pending_approval',
            'payment_status' => 'unpaid',
            'subtotal'       => 150000,
            'grand_total'    => 150000,
            'created_by'     => $this->superAdmin->id,
        ]);

        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/cancel");

        $this->assertEquals('cancelled', $so->fresh()->status);
    }

    /**
     * Test otorisasi: user tanpa permission approve tidak bisa menyetujui.
     */
    public function test_unauthorized_user_cannot_approve_sales_order(): void
    {
        $so = SalesOrder::create([
            'so_number'      => 'SO-202607-0001',
            'customer_id'    => $this->customer->id,
            'order_date'     => '2026-07-26',
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'pending_approval',
            'payment_status' => 'unpaid',
            'subtotal'       => 150000,
            'grand_total'    => 150000,
            'created_by'     => $this->superAdmin->id,
        ]);

        // salesUser tidak memiliki permission sales_order.approve
        $response = $this->actingAs($this->salesUser)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/approve");

        $response->assertStatus(403);
        $this->assertEquals('pending_approval', $so->fresh()->status); // Tetap pending
    }

    /**
     * Test integritas: Approved SO tidak boleh diedit.
     */
    public function test_cannot_edit_approved_sales_order(): void
    {
        $so = SalesOrder::create([
            'so_number'      => 'SO-202607-0001',
            'customer_id'    => $this->customer->id,
            'order_date'     => '2026-07-26',
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'approved', // Status Approved
            'payment_status' => 'unpaid',
            'subtotal'       => 150000,
            'grand_total'    => 150000,
            'created_by'     => $this->superAdmin->id,
        ]);

        $payload = [
            'order_date'    => '2026-07-26',
            'source'        => 'website',
            'sales_channel' => 'website',
            'items'         => [
                [
                    'product_id' => $this->product1->id,
                    'quantity'   => 5,
                    'price'      => 150000,
                ],
            ],
        ];

        // Percobaan edit SO yang statusnya approved harus ditolak dengan 403
        $response = $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->put("/sales-orders/{$so->id}", $payload);

        $response->assertStatus(403);
    }

    /** Buat SO berstatus pending_approval berisi satu item siap disetujui. */
    private function makePendingOrder(int $quantity = 20): SalesOrder
    {
        $so = SalesOrder::create([
            'so_number'      => 'SO-202607-9001',
            'customer_id'    => $this->customer->id,
            'order_date'     => '2026-07-26',
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'pending_approval',
            'payment_status' => 'unpaid',
            'subtotal'       => 150000,
            'grand_total'    => 150000,
            'created_by'     => $this->superAdmin->id,
        ]);

        $so->items()->create([
            'product_id'   => $this->product1->id,
            'sku'          => $this->product1->sku,
            'product_name' => $this->product1->name,
            'quantity'     => $quantity,
            'unit'         => 'pcs',
            'price'        => 150000,
            'subtotal'     => 150000 * $quantity,
        ]);

        return $so;
    }

    private function approve(SalesOrder $so): void
    {
        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/approve");
    }

    /**
     * Stok fisik harus berkurang saat Sales Order disetujui — sebelumnya
     * penjualan sama sekali tidak menyentuh stok.
     */
    public function test_stock_is_deducted_when_sales_order_approved(): void
    {
        $this->product1->update(['stock' => 100]);
        $so = $this->makePendingOrder(20);

        $this->approve($so);

        $this->assertEquals('approved', $so->fresh()->status);
        $this->assertEquals(80, $this->product1->fresh()->stock);
        $this->assertNotNull($so->fresh()->stock_deducted_at);

        $this->assertDatabaseHas('stock_movements', [
            'product_id'     => $this->product1->id,
            'movement_type'  => 'out',
            'quantity'       => 20,
            'reference_type' => 'sales_order',
            'reference_id'   => $so->id,
        ]);
    }

    /** Stok kurang harus menggagalkan persetujuan, bukan membuat stok minus. */
    public function test_approval_is_blocked_when_stock_is_insufficient(): void
    {
        $this->product1->update(['stock' => 5]);
        $so = $this->makePendingOrder(20);

        $this->approve($so);

        $this->assertEquals('pending_approval', $so->fresh()->status);
        $this->assertEquals(5, $this->product1->fresh()->stock);
        $this->assertNull($so->fresh()->stock_deducted_at);
    }

    /** Pembatalan mengembalikan stok yang sempat dipotong. */
    public function test_stock_is_restored_when_approved_order_is_cancelled(): void
    {
        $this->product1->update(['stock' => 100]);
        $so = $this->makePendingOrder(20);

        $this->approve($so);
        $this->assertEquals(80, $this->product1->fresh()->stock);

        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/cancel");

        $this->assertEquals('cancelled', $so->fresh()->status);
        $this->assertEquals(100, $this->product1->fresh()->stock);
        $this->assertNull($so->fresh()->stock_deducted_at);
    }

    /** Membatalkan SO yang belum disetujui tidak boleh menambah stok. */
    public function test_cancelling_draft_order_does_not_add_stock(): void
    {
        $this->product1->update(['stock' => 100]);
        $so = $this->makePendingOrder(20);

        $this->actingAs($this->superAdmin)
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)
            ->post("/sales-orders/{$so->id}/cancel");

        $this->assertEquals('cancelled', $so->fresh()->status);
        $this->assertEquals(100, $this->product1->fresh()->stock);
    }

    /**
     * Order marketplace memotong stok lewat reservasi saat fulfillment,
     * jadi persetujuan SO-nya tidak boleh ikut memotong (dobel).
     */
    public function test_marketplace_order_stock_is_not_deducted_twice(): void
    {
        $this->product1->update(['stock' => 100]);
        $so = $this->makePendingOrder(20);
        $so->update(['source' => 'marketplace', 'sales_channel' => 'shopee']);

        $this->approve($so);

        $this->assertEquals('approved', $so->fresh()->status);
        $this->assertEquals(100, $this->product1->fresh()->stock);
        $this->assertNull($so->fresh()->stock_deducted_at);
    }
}
