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
        // Stok tidak ikut diimpor — penambahannya lewat menu Barang Masuk.
        $this->assertEquals(0, $product->stock);
        $this->assertSame('active', $product->status);
        $this->assertSame('Kardus', Category::find($product->category_id)->name);
    }

    /** SKU kosong dibuatkan otomatis dari nama produk. */
    public function test_sku_is_derived_from_name_when_left_empty(): void
    {
        $result = $this->service->import([
            $this->row(['SKU' => '', 'Nama Produk' => 'Kardus Tanpa Kode']),
        ], $this->admin->id);

        $this->assertSame(1, $result['created']);
        $this->assertTrue(Product::where('sku', 'KARDUS-TANPA-KODE')->exists());
    }

    /** Baris yang SKU dan namanya sama-sama kosong tidak bisa diproses. */
    public function test_row_without_sku_and_name_is_rejected(): void
    {
        $result = $this->service->import([
            $this->row(['SKU' => '', 'Nama Produk' => '']),
        ], $this->admin->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, $result['failed']);
    }

    /** SKU yang sama diperbarui, bukan digandakan. */
    public function test_import_updates_existing_sku_instead_of_duplicating(): void
    {
        $created = $this->service->import([$this->row()], $this->admin->id);
        $this->assertSame(1, $created['created']);

        // Stok berjalan diisi lewat Barang Masuk, lalu impor ulang dijalankan.
        Product::where('sku', 'KRD-001')->update(['stock' => 40]);

        $result = $this->service->import([
            $this->row(['Nama Produk' => 'Kardus Polos Revisi']),
        ], $this->admin->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, $result['updated']);
        $this->assertSame(1, Product::where('sku', 'KRD-001')->count());

        $product = Product::where('sku', 'KRD-001')->firstOrFail();

        $this->assertSame('Kardus Polos Revisi', $product->name);
        // Impor tidak boleh menyentuh stok berjalan.
        $this->assertEquals(40, $product->stock);
    }

    /**
     * Satu baris bermasalah membatalkan seluruh impor, supaya data tidak
     * masuk setengah-setengah dan admin bisa memperbaiki filenya sekaligus.
     */
    public function test_invalid_row_cancels_the_whole_import(): void
    {
        $result = $this->service->import([
            $this->row(['SKU' => 'KRD-002']),
            $this->row(['SKU' => '', 'Nama Produk' => '']),
        ], $this->admin->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, $result['failed']);
        // Baris pertama sah, tapi ikut dibatalkan karena ada baris bermasalah.
        $this->assertFalse(Product::where('sku', 'KRD-002')->exists());
    }

    /** SKU ganda di dalam satu file dilaporkan, bukan menimpa diam-diam. */
    public function test_duplicate_sku_inside_one_file_is_reported(): void
    {
        $result = $this->service->import([
            $this->row(['SKU' => 'KRD-010']),
            $this->row(['SKU' => 'KRD-010']),
        ], $this->admin->id);

        $this->assertSame(1, $result['failed']);
        $this->assertStringContainsString('ganda', $result['errors'][0]['message']);
    }

    /** Payload persis seperti hasil baca template, termasuk kolom kosong. */
    public function test_import_endpoint_accepts_template_shaped_payload(): void
    {
        $response = $this->actingAs($this->admin)->post('/products/import', [
            'rows' => [
                [
                    'SKU' => 'KRD-777', 'Nama Produk' => 'Kardus Uji', 'Kategori' => 'Kardus',
                    'Brand' => '', 'Warna' => '', 'Kardus' => 'Ya',
                    'Panjang (cm)' => 30, 'Lebar (cm)' => 20, 'Tinggi (cm)' => 15,
                    'Status' => 'Aktif', 'Deskripsi' => '',
                ],
                // Nama & kategori kosong — harus tetap lolos lewat nilai cadangan.
                [
                    'SKU' => 'KRD-778', 'Nama Produk' => '', 'Kategori' => '',
                    'Brand' => '', 'Warna' => '', 'Kardus' => '',
                    'Panjang (cm)' => '', 'Lebar (cm)' => '', 'Tinggi (cm)' => '',
                    'Status' => '', 'Deskripsi' => '',
                ],
            ],
        ]);

        $response->assertRedirect();
        $response->assertSessionMissing('error');

        $this->assertTrue(Product::where('sku', 'KRD-777')->exists());
        $this->assertTrue(Product::where('sku', 'KRD-778')->exists());
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

    /** Pratinjau memanggil endpoint ini untuk menandai SKU yang sudah ada. */
    public function test_check_skus_reports_existing_products(): void
    {
        $this->service->import([$this->row(['SKU' => 'KRD-500'])], $this->admin->id);

        $response = $this->actingAs($this->admin)->postJson('/products/check-skus', [
            'skus' => ['KRD-500', 'KRD-501'],
        ]);

        $response->assertOk();
        $response->assertJson(['existing' => ['KRD-500']]);
    }

    public function test_check_skus_requires_create_permission(): void
    {
        $viewerRole = Role::firstOrCreate(['name' => 'Viewer Cek']);
        $viewerRole->permissions()->sync(Permission::where('name', 'product.view')->pluck('id'));

        $viewer = User::create([
            'name' => 'Viewer Cek', 'email' => 'viewer-cek@test.com',
            'password' => Hash::make('password'), 'role_id' => $viewerRole->id, 'status' => 'active',
        ]);

        $this->actingAs($viewer)->postJson('/products/check-skus', ['skus' => ['KRD-001']])
            ->assertForbidden();
    }
}
