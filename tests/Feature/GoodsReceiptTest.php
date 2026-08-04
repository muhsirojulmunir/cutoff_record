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

class GoodsReceiptTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Product $product;
    protected Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock.view', 'stock.adjust'] as $name) {
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

    public function test_stock_in_increases_product_stock(): void
    {
        $this->actingAs($this->admin)->post('/barang-masuk', [
            'product_id'   => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity'     => 25,
            'notes'        => 'Kiriman pabrik',
        ])->assertRedirect();

        $this->assertEquals(35, $this->product->fresh()->stock);
        $this->assertDatabaseHas('stock_movements', [
            'product_id'    => $this->product->id,
            'movement_type' => 'in',
            'quantity'      => 25,
        ]);
    }

    public function test_quantity_must_be_positive(): void
    {
        $this->actingAs($this->admin)->post('/barang-masuk', [
            'product_id'   => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'quantity'     => 0,
            'notes'        => 'Percobaan',
        ])->assertSessionHasErrors('quantity');
    }
}
