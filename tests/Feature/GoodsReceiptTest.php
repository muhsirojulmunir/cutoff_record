<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\GoodsReceipt;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class GoodsReceiptTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Product $product;
    protected Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock.view', 'stock.adjust', 'stock.receipt.request', 'stock.receipt.approve'] as $name) {
            Permission::firstOrCreate(['name' => $name]);
        }

        $role = Role::firstOrCreate(['name' => 'Admin']);
        $role->permissions()->sync(Permission::all()->pluck('id'));

        $this->admin = User::create([
            'name' => 'Admin Gudang', 'email' => 'gudang@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id, 'status' => 'active',
        ]);

        $category = Category::create(['name' => 'Sepatu', 'status' => 'active']);

        $this->product = Product::create([
            'sku' => 'SPT-001', 'name' => 'Sepatu Sekolah', 'category_id' => $category->id,
            'stock' => 10, 'status' => 'active', 'created_by' => $this->admin->id,
        ]);

        $this->warehouse = Warehouse::create([
            'code' => 'GD-01', 'name' => 'Gudang Utama', 'status' => 'active',
            'created_by' => $this->admin->id,
        ]);
    }

    public function test_page_opens_for_authorised_user(): void
    {
        $this->actingAs($this->admin)->get('/barang-masuk')->assertOk();
    }

    /** Kirim pengajuan barang masuk dan kembalikan barisnya. */
    private function submitReceipt(int $quantity = 25): GoodsReceipt
    {
        $this->actingAs($this->admin)->post('/barang-masuk', [
            'product_id'   => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity'     => $quantity,
            'notes'        => 'Kiriman pabrik',
        ])->assertRedirect();

        return GoodsReceipt::latest('id')->firstOrFail();
    }

    /** Pengajuan saja belum boleh mengubah stok — harus menunggu PIC Gudang. */
    public function test_request_does_not_change_stock_yet(): void
    {
        $receipt = $this->submitReceipt();

        $this->assertEquals(GoodsReceipt::STATUS_PENDING, $receipt->status);
        $this->assertEquals(10, $this->product->fresh()->stock);
        $this->assertDatabaseMissing('stock_movements', [
            'product_id'    => $this->product->id,
            'movement_type' => 'in',
        ]);
    }

    public function test_approval_increases_product_stock(): void
    {
        $receipt = $this->submitReceipt();

        $this->actingAs($this->admin)
            ->post("/barang-masuk/{$receipt->id}/approve")
            ->assertRedirect();

        $this->assertEquals(GoodsReceipt::STATUS_APPROVED, $receipt->fresh()->status);
        $this->assertEquals(35, $this->product->fresh()->stock);
        $this->assertNotNull($receipt->fresh()->stock_movement_id);
        $this->assertDatabaseHas('stock_movements', [
            'product_id'    => $this->product->id,
            'movement_type' => 'in',
            'quantity'      => 25,
        ]);
    }

    /** Menyetujui dua kali tidak boleh menambah stok dua kali. */
    public function test_approval_cannot_be_applied_twice(): void
    {
        $receipt = $this->submitReceipt();

        $this->actingAs($this->admin)->post("/barang-masuk/{$receipt->id}/approve");
        $this->actingAs($this->admin)->post("/barang-masuk/{$receipt->id}/approve");

        $this->assertEquals(35, $this->product->fresh()->stock);
    }

    public function test_rejection_leaves_stock_untouched(): void
    {
        $receipt = $this->submitReceipt();

        $this->actingAs($this->admin)
            ->post("/barang-masuk/{$receipt->id}/reject", ['rejection_reason' => 'Jumlah tidak sesuai fisik'])
            ->assertRedirect();

        $this->assertEquals(GoodsReceipt::STATUS_REJECTED, $receipt->fresh()->status);
        $this->assertEquals(10, $this->product->fresh()->stock);
    }

    /** Tanpa hak approve, pengajuan tidak boleh diloloskan. */
    public function test_user_without_approve_permission_is_blocked(): void
    {
        $receipt = $this->submitReceipt();

        $role = Role::create(['name' => 'Staff Gudang']);
        $role->permissions()->sync(
            Permission::whereIn('name', ['stock.view', 'stock.receipt.request'])->pluck('id')
        );

        $staff = User::create([
            'name' => 'Staff', 'email' => 'staff@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id, 'status' => 'active',
        ]);

        $this->actingAs($staff)
            ->post("/barang-masuk/{$receipt->id}/approve")
            ->assertForbidden();

        $this->assertEquals(10, $this->product->fresh()->stock);
    }

    /**
     * Bentuk lama (satu produk langsung di akar payload) tetap didukung,
     * dan kuantitasnya dinormalkan menjadi satu baris items.
     */
    public function test_quantity_must_be_positive(): void
    {
        $this->actingAs($this->admin)->post('/barang-masuk', [
            'product_id'   => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity'     => 0,
            'notes'        => 'Percobaan',
        ])->assertSessionHasErrors('items.0.quantity');
    }

    /** Beberapa SKU boleh diajukan sekaligus dengan satu nomor PO. */
    public function test_multiple_skus_can_be_submitted_at_once(): void
    {
        $second = Product::create([
            'sku' => 'SPT-002', 'name' => 'Sepatu Olahraga',
            'category_id' => $this->product->category_id,
            'stock' => 4, 'status' => 'active', 'created_by' => $this->admin->id,
        ]);

        $this->actingAs($this->admin)->post('/barang-masuk', [
            'po_number'    => 'PO-202608-0001',
            'warehouse_id' => $this->warehouse->id,
            'notes'        => 'Kiriman pabrik',
            'items'        => [
                ['product_id' => $this->product->id, 'quantity' => 25],
                ['product_id' => $second->id,        'quantity' => 7],
            ],
        ])->assertRedirect();

        $this->assertEquals(2, GoodsReceipt::where('po_number', 'PO-202608-0001')->count());

        // Keduanya masih menunggu approval, jadi stok belum boleh berubah.
        $this->assertEquals(10, $this->product->fresh()->stock);
        $this->assertEquals(4, $second->fresh()->stock);
    }

    /** Bila satu SKU tidak valid, tidak ada pengajuan yang tersimpan. */
    public function test_invalid_sku_cancels_whole_submission(): void
    {
        $this->actingAs($this->admin)->post('/barang-masuk', [
            'notes' => 'Kiriman pabrik',
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 5],
                ['product_id' => 999999,             'quantity' => 3],
            ],
        ])->assertSessionHasErrors('items.1.product_id');

        $this->assertEquals(0, GoodsReceipt::count());
    }
}
