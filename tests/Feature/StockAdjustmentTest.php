<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StockAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    protected User $leader;
    protected Product $product;
    protected Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock.view', 'stock.adjustment.manage'] as $name) {
            Permission::firstOrCreate(['name' => $name]);
        }

        $role = Role::firstOrCreate(['name' => 'Leader']);
        $role->permissions()->sync(Permission::all()->pluck('id'));

        $this->leader = User::create([
            'name' => 'Leader Uji', 'email' => 'leader@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id, 'status' => 'active',
        ]);

        $category = Category::create(['name' => 'Sepatu', 'status' => 'active']);

        $this->product = Product::create([
            'sku' => 'SPT-001', 'name' => 'Sepatu Sekolah', 'category_id' => $category->id,
            'stock' => 50, 'status' => 'active', 'created_by' => $this->leader->id,
        ]);

        $this->warehouse = Warehouse::create([
            'code' => 'GD-01', 'name' => 'Gudang Utama', 'status' => 'active',
            'created_by' => $this->leader->id,
        ]);
    }

    public function test_page_opens_for_leader(): void
    {
        $this->actingAs($this->leader)->get('/adjustment-stok')->assertOk();
    }

    public function test_leader_can_reduce_stock(): void
    {
        $this->actingAs($this->leader)->post('/adjustment-stok', [
            'product_id'   => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity'     => -3,
            'notes'        => 'Hasil stock opname Agustus',
        ])->assertRedirect();

        $this->assertEquals(47, $this->product->fresh()->stock);

        // Ledger menyimpan kuantitas sebagai nilai mutlak; arah koreksi
        // terbaca dari stok sebelum dan sesudah.
        $this->assertDatabaseHas('stock_movements', [
            'product_id'    => $this->product->id,
            'movement_type' => 'adjustment',
            'quantity'      => 3,
            'stock_before'  => 50,
            'stock_after'   => 47,
        ]);
    }

    public function test_leader_can_add_stock(): void
    {
        $this->actingAs($this->leader)->post('/adjustment-stok', [
            'product_id' => $this->product->id,
            'quantity'   => 10,
            'notes'      => 'Koreksi tambah hasil opname',
        ])->assertRedirect();

        $this->assertEquals(60, $this->product->fresh()->stock);
    }

    /** Koreksi nol tidak bermakna dan harus ditolak. */
    public function test_zero_quantity_is_rejected(): void
    {
        $this->actingAs($this->leader)->post('/adjustment-stok', [
            'product_id' => $this->product->id,
            'quantity'   => 0,
            'notes'      => 'Percobaan koreksi kosong',
        ])->assertSessionHasErrors('quantity');

        $this->assertEquals(50, $this->product->fresh()->stock);
    }

    /** Alasan wajib diisi agar setiap koreksi bisa ditelusuri. */
    public function test_reason_is_required(): void
    {
        $this->actingAs($this->leader)->post('/adjustment-stok', [
            'product_id' => $this->product->id,
            'quantity'   => 5,
            'notes'      => '',
        ])->assertSessionHasErrors('notes');

        $this->assertEquals(50, $this->product->fresh()->stock);
    }

    /** Role tanpa hak khusus tidak boleh membuka maupun menyimpan koreksi. */
    public function test_other_roles_are_blocked(): void
    {
        $role = Role::firstOrCreate(['name' => 'Admin Tanpa Adjustment']);
        $role->permissions()->sync(Permission::where('name', 'stock.view')->pluck('id'));

        $admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id, 'status' => 'active',
        ]);

        $this->actingAs($admin)->get('/adjustment-stok')->assertForbidden();

        $this->actingAs($admin)->post('/adjustment-stok', [
            'product_id' => $this->product->id,
            'quantity'   => 5,
            'notes'      => 'Percobaan tanpa hak',
        ])->assertForbidden();

        $this->assertEquals(50, $this->product->fresh()->stock);
    }
}
