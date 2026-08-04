<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Services\ProductImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProductImportTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected ProductImportService $service;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['product.view', 'product.create', 'product.edit'] as $name) {
            Permission::firstOrCreate(['name' => $name]);
        }

        $role = Role::firstOrCreate(['name' => 'Admin']);
        $role->permissions()->sync(Permission::all()->pluck('id'));

        $this->admin = User::create([
            'name'     => 'Admin Import',
            'email'    => 'admin-import@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $role->id,
            'status'   => 'active',
        ]);

        $this->service = app(ProductImportService::class);
    }

    /** @return array<string, mixed> */
    private function row(array $override = []): array
    {
        return array_merge([
            'SKU'          => 'KRD-001',
            'Nama Produk'  => 'Kardus Polos 30x20x15',
            'Kategori'     => 'Kardus',
            'Brand'        => 'Tanpa Merek',
            'Warna'        => 'Coklat',
            'Kardus'       => 'Ya',
            'Panjang (cm)' => 30,
            'Lebar (cm)'   => 20,
            'Tinggi (cm)'  => 15,
            'Stok Awal'    => 100,
            'Status'       => 'Aktif',
            'Deskripsi'    => 'Single wall',
        ], $override);
    }

    public function test_import_creates_product_and_missing_category(): void
    {
        $result = $this->service->import([$this->row()], $this->admin->id);

        $this->assertSame(1, $result['created']);
        $this->assertSame(0, $result['failed']);

        $product = Product::where('sku', 'KRD-001')->firstOrFail();

        $this->assertSame('Kardus Polos 30x20x15', $product->name);
        $this->assertTrue($product->is_box);
        $this->assertEquals(15, (float) $product->height);
        $this->assertEquals(100, $product->stock);
        $this->assertSame('active', $product->status);
        $this->assertSame('Kardus', Category::find($product->category_id)->name);
    }

    /** SKU yang sama diperbarui, bukan digandakan. */
    public function test_import_updates_existing_sku_instead_of_duplicating(): void
    {
        $this->service->import([$this->row()], $this->admin->id);
        $result = $this->service->import([
            $this->row(['Nama Produk' => 'Kardus Polos Revisi', 'Stok Awal' => '']),
        ], $this->admin->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, $result['updated']);
        $this->assertSame(1, Product::where('sku', 'KRD-001')->count());

        $product = Product::where('sku', 'KRD-001')->firstOrFail();

        $this->assertSame('Kardus Polos Revisi', $product->name);
        // Stok dibiarkan apa adanya karena kolomnya dikosongkan.
        $this->assertEquals(100, $product->stock);
    }

    /** Produk non-kardus tidak menyimpan tinggi walau kolomnya diisi. */
    public function test_height_is_ignored_for_non_box_product(): void
    {
        $this->service->import([
            $this->row(['SKU' => 'PLS-001', 'Kardus' => 'Tidak', 'Tinggi (cm)' => 12]),
        ], $this->admin->id);

        $product = Product::where('sku', 'PLS-001')->firstOrFail();

        $this->assertFalse($product->is_box);
        $this->assertNull($product->height);
    }

    /** Baris tanpa SKU dilaporkan gagal, baris lain tetap masuk. */
    public function test_invalid_row_is_reported_without_blocking_others(): void
    {
        $result = $this->service->import([
            $this->row(['SKU' => '']),
            $this->row(['SKU' => 'KRD-002']),
        ], $this->admin->id);

        $this->assertSame(1, $result['created']);
        $this->assertSame(1, $result['failed']);
        $this->assertSame(2, $result['errors'][0]['row']);
        $this->assertTrue(Product::where('sku', 'KRD-002')->exists());
    }

    /** Angka desimal bergaya Indonesia ("30,5") tetap terbaca benar. */
    public function test_indonesian_number_format_is_parsed(): void
    {
        $this->service->import([
            $this->row(['SKU' => 'KRD-003', 'Panjang (cm)' => '30,5']),
        ], $this->admin->id);

        $product = Product::where('sku', 'KRD-003')->firstOrFail();

        $this->assertEquals(30.5, (float) $product->length);
    }

    public function test_import_endpoint_requires_create_permission(): void
    {
        $viewerRole = Role::firstOrCreate(['name' => 'Viewer']);
        $viewerRole->permissions()->sync(Permission::where('name', 'product.view')->pluck('id'));

        $viewer = User::create([
            'name'     => 'Viewer',
            'email'    => 'viewer-import@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $viewerRole->id,
            'status'   => 'active',
        ]);

        $this->actingAs($viewer)
            ->post('/products/import', ['rows' => [$this->row()]])
            ->assertForbidden();
    }
}
