<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Permission;
use App\Models\Product;
use App\Models\ProductHpp;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProductHppTest extends TestCase
{
    use RefreshDatabase;

    protected User $finance;
    protected User $admin;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['hpp.view', 'hpp.manage', 'product.view', 'product.create'] as $name) {
            Permission::firstOrCreate(['name' => $name]);
        }

        // Finance: boleh lihat & isi HPP.
        $financeRole = Role::firstOrCreate(['name' => 'Finance']);
        $financeRole->permissions()->sync(Permission::whereIn('name', ['hpp.view', 'hpp.manage', 'product.view'])->pluck('id'));

        // Admin: mengurus produk, tanpa akses HPP.
        $adminRole = Role::firstOrCreate(['name' => 'Admin']);
        $adminRole->permissions()->sync(Permission::whereIn('name', ['product.view', 'product.create'])->pluck('id'));

        $this->finance = User::create([
            'name' => 'Finance User', 'email' => 'finance-hpp@test.com',
            'password' => Hash::make('password'), 'role_id' => $financeRole->id, 'status' => 'active',
        ]);

        $this->admin = User::create([
            'name' => 'Admin User', 'email' => 'admin-hpp@test.com',
            'password' => Hash::make('password'), 'role_id' => $adminRole->id, 'status' => 'active',
        ]);

        $category = Category::create(['name' => 'Kardus', 'status' => 'active']);

        $this->product = Product::create([
            'sku' => 'KRD-001', 'name' => 'Kardus Polos', 'category_id' => $category->id,
            'status' => 'active', 'created_by' => $this->finance->id,
        ]);
    }

    public function test_finance_can_open_hpp_master(): void
    {
        $this->actingAs($this->finance)->get('/product-hpp')->assertOk();
    }

    /** Admin mengurus produk, tapi tidak boleh melihat angka HPP. */
    public function test_admin_cannot_open_hpp_master(): void
    {
        $this->actingAs($this->admin)->get('/product-hpp')->assertForbidden();
    }

    public function test_admin_cannot_save_hpp(): void
    {
        $this->actingAs($this->admin)->post("/product-hpp/{$this->product->id}", [
            'hpp'            => 5000,
            'effective_date' => '2026-08-01',
        ])->assertForbidden();

        $this->assertDatabaseCount('product_hpps', 0);
    }

    public function test_finance_can_save_and_update_hpp(): void
    {
        $this->actingAs($this->finance)->post("/product-hpp/{$this->product->id}", [
            'hpp'            => 5000,
            'effective_date' => '2026-08-01',
            'notes'          => 'Berdasarkan PO Juli',
        ])->assertRedirect();

        $this->assertDatabaseHas('product_hpps', [
            'product_id' => $this->product->id,
            'hpp'        => 5000,
            'updated_by' => $this->finance->id,
        ]);

        // Simpan ulang hanya memperbarui nilainya, tidak menambah baris baru.
        $this->actingAs($this->finance)->post("/product-hpp/{$this->product->id}", [
            'hpp'            => 6500,
            'effective_date' => '2026-08-05',
        ])->assertRedirect();

        $this->assertDatabaseCount('product_hpps', 1);
        $this->assertEquals(6500, (float) ProductHpp::first()->hpp);
    }

    public function test_hpp_must_be_a_non_negative_number(): void
    {
        $this->actingAs($this->finance)->post("/product-hpp/{$this->product->id}", [
            'hpp'            => -100,
            'effective_date' => '2026-08-01',
        ])->assertSessionHasErrors('hpp');
    }

    // ── Impor Excel ──────────────────────────────────────────────────────

    public function test_finance_can_import_hpp_from_excel_rows(): void
    {
        $second = Product::create([
            'sku'         => 'KRD-002',
            'name'        => 'Kardus Tebal',
            'category_id' => $this->product->category_id,
            'status'      => 'active',
            'created_by'  => $this->finance->id,
        ]);

        $this->actingAs($this->finance)->post('/product-hpp/import', ['rows' => [
            ['SKU' => 'KRD-001', 'HPP' => 5000, 'Tanggal Berlaku' => '2026-08-01'],
            // Angka bergaya Indonesia dan tanggal kosong tetap diterima.
            ['SKU' => 'KRD-002', 'HPP' => '12.500', 'Tanggal Berlaku' => '', 'Catatan' => 'Dari PO Juli'],
        ]])->assertRedirect();

        $this->assertDatabaseHas('product_hpps', ['product_id' => $this->product->id, 'hpp' => 5000]);
        $this->assertDatabaseHas('product_hpps', ['product_id' => $second->id, 'hpp' => 12500]);
    }

    /** Baris yang kolom HPP-nya kosong dilewati, bukan dianggap error. */
    public function test_import_skips_rows_without_hpp(): void
    {
        $this->actingAs($this->finance)->post('/product-hpp/import', ['rows' => [
            ['SKU' => 'KRD-001', 'HPP' => ''],
        ]])->assertRedirect();

        $this->assertDatabaseCount('product_hpps', 0);
    }

    public function test_import_reports_unknown_sku(): void
    {
        $response = $this->actingAs($this->finance)->post('/product-hpp/import', ['rows' => [
            ['SKU' => 'TIDAK-ADA', 'HPP' => 1000],
        ]]);

        $response->assertSessionHas('error');
        $this->assertDatabaseCount('product_hpps', 0);
    }

    public function test_admin_cannot_import_hpp(): void
    {
        $this->actingAs($this->admin)->post('/product-hpp/import', ['rows' => [
            ['SKU' => 'KRD-001', 'HPP' => 5000],
        ]])->assertForbidden();
    }

    public function test_admin_cannot_download_template(): void
    {
        $this->actingAs($this->admin)->getJson('/product-hpp/template')->assertForbidden();
    }

    public function test_template_lists_products_with_current_hpp(): void
    {
        $this->actingAs($this->finance)->post("/product-hpp/{$this->product->id}", [
            'hpp'            => 7500,
            'effective_date' => '2026-08-01',
        ]);

        $response = $this->actingAs($this->finance)->getJson('/product-hpp/template');

        $response->assertOk();
        $response->assertJsonPath('products.0.sku', 'KRD-001');
        $response->assertJsonPath('products.0.current_hpp', 7500);
    }
}
