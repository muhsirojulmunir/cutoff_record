<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\TiktokAccount;
use App\Models\TiktokProduct;
use App\Models\User;
use App\Services\TiktokSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TiktokProductSyncAndSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Http::preventStrayRequests();

        $role = Role::firstOrCreate(
            ['name' => 'Super Admin'],
            ['description' => 'Akses penuh sistem']
        );

        $this->superAdmin = User::create([
            'name'     => 'Super Admin',
            'email'    => 'admin@tiktok-test.local',
            'password' => Hash::make('password'),
            'role_id'  => $role->id,
            'status'   => 'active',
        ]);
    }

    public function test_sync_products_paginates_signs_body_passes_shop_cipher_and_removes_demo_catalog(): void
    {
        $account = TiktokAccount::create([
            'account_name'      => 'RecordShoesOfficial',
            'app_key'           => 'test_app_key',
            'app_secret'        => 'test_app_secret',
            'shop_id'           => '7494083438199277309',
            'shop_cipher'       => '', // Kosong agar memastikan fetchAuthorizedShops dipanggil otomatis
            'access_token'      => 'valid_access_token',
            'refresh_token'     => 'valid_refresh_token',
            'token_expires_at'  => now()->addHours(4),
            'status'            => 'active',
            'connection_status' => 'connected',
        ]);

        /** @var TiktokSyncService $service */
        $service = app(TiktokSyncService::class);
        $service->ensureProductSchema();
        // Simulasikan katalog contoh 46 SKU yang sebelumnya ter-seed sebelum terhubung
        $service->seedInitialProducts($account);
        $this->assertEquals(46, TiktokProduct::where('tiktok_account_id', $account->id)->count());

        Http::fake([
            '*/authorization/202309/shops*' => Http::response([
                'code'    => 0,
                'message' => 'Success',
                'data'    => [
                    'shops' => [[
                        'id'     => '7494083438199277309',
                        'cipher' => 'GCP_CIPHER_123',
                        'name'   => 'RecordShoesOfficial',
                    ]],
                ],
            ], 200),

            '*/product/202309/products/search*' => function (HttpClientRequest $request) use ($service) {
                $url = $request->url();
                $parts = parse_url($url);
                parse_str($parts['query'] ?? '', $query);

                $this->assertEquals('GCP_CIPHER_123', $query['shop_cipher'] ?? null);
                $this->assertEquals('100', $query['page_size'] ?? null);

                $expectedSign = $service->generateSignature(
                    '/product/202309/products/search',
                    $query,
                    'test_app_secret',
                    $request->body()
                );
                $this->assertEquals($expectedSign, $query['sign'] ?? null);

                if (($query['page_token'] ?? '') === 'PAGE_2_TOKEN') {
                    return Http::response([
                        'code'    => 0,
                        'message' => 'Success',
                        'data'    => [
                            'next_page_token' => '',
                            'products'        => [[
                                'id'     => '1729999999999999002',
                                'title'  => 'RECORD BLANCO SEPATU SEKOLAH HITAM POLOS 36-43',
                                'status' => 'ACTIVATE',
                                'skus'   => [
                                    [
                                        'id'               => '1729999999999999201',
                                        'seller_sku'       => 'RECORD-BLANCO-H-39_01246239',
                                        'price'            => ['sale_price' => '179000'],
                                        'inventory'        => [['warehouse_id' => 'wh1', 'quantity' => 14]],
                                        'sales_attributes' => [
                                            ['value_name' => 'Hitam'],
                                            ['value_name' => '39'],
                                        ],
                                    ],
                                    [
                                        'id'               => '1729999999999999202',
                                        'seller_sku'       => 'RECORD-BLANCO-H-40_01246240',
                                        'price'            => ['sale_price' => '179000'],
                                        'inventory'        => [['warehouse_id' => 'wh1', 'quantity' => 9]],
                                        'sales_attributes' => [
                                            ['value_name' => 'Hitam'],
                                            ['value_name' => '40'],
                                        ],
                                    ],
                                ],
                            ]],
                        ],
                    ], 200);
                }

                return Http::response([
                    'code'    => 0,
                    'message' => 'Success',
                    'data'    => [
                        'next_page_token' => 'PAGE_2_TOKEN',
                        'products'        => [[
                            'id'     => '1729999999999999001',
                            'title'  => 'RECORD ALPHA SEPATU RUNNING',
                            'status' => 'ACTIVATE',
                            // Sengaja tanpa sales_attributes untuk menguji fallback detail produk
                            'skus'   => [
                                ['id' => '1729999999999999101', 'seller_sku' => 'RECORD-ALPHA-H-38_01200038'],
                                ['id' => '1729999999999999102', 'seller_sku' => 'RECORD-ALPHA-H-39_01200039'],
                            ],
                        ]],
                    ],
                ], 200);
            },

            '*/product/202309/products/1729999999999999001*' => Http::response([
                'code'    => 0,
                'message' => 'Success',
                'data'    => [
                    'id'     => '1729999999999999001',
                    'title'  => 'RECORD ALPHA SEPATU RUNNING',
                    'status' => 'ACTIVATE',
                    'skus'   => [
                        [
                            'id'               => '1729999999999999101',
                            'seller_sku'       => 'RECORD-ALPHA-H-38_01200038',
                            'price'            => ['sale_price' => '199000'],
                            'inventory'        => [['quantity' => 5], ['quantity' => 3]],
                            'sales_attributes' => [['value_name' => 'Hitam'], ['value_name' => '38']],
                        ],
                        [
                            'id'               => '1729999999999999102',
                            'seller_sku'       => 'RECORD-ALPHA-H-39_01200039',
                            'price'            => ['sale_price' => '199000'],
                            'inventory'        => [['quantity' => 11]],
                            'sales_attributes' => [['value_name' => 'Hitam'], ['value_name' => '39']],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $result = $service->syncProductsFromTiktok($account);

        $this->assertEquals('success', $result['status']);
        $this->assertEquals(2, $result['total_items']);
        $this->assertEquals(4, $result['total_variants']);

        // Produk contoh demo 46 SKU harus terhapus, hanya tersisa 4 SKU asli dari API
        $this->assertEquals(4, TiktokProduct::where('tiktok_account_id', $account->id)->count());

        $blanco39 = TiktokProduct::where('sku', 'RECORD-BLANCO-H-39_01246239')->first();
        $this->assertNotNull($blanco39);
        $this->assertEquals('Hitam, 39', $blanco39->model_name);
        $this->assertEquals(14, $blanco39->stock);

        $alpha38 = TiktokProduct::where('sku', 'RECORD-ALPHA-H-38_01200038')->first();
        $this->assertNotNull($alpha38);
        $this->assertEquals('Hitam, 38', $alpha38->model_name);
        $this->assertEquals(8, $alpha38->stock);
    }

    public function test_search_variants_finds_blanco_and_multiword_queries(): void
    {
        $account = TiktokAccount::create([
            'account_name'      => 'RecordShoesOfficial',
            'status'            => 'active',
            'connection_status' => 'connected',
        ]);

        TiktokProduct::create([
            'tiktok_account_id' => $account->id,
            'item_id'           => '1729999999999999002',
            'model_id'          => '1729999999999999201',
            'item_name'         => 'RECORD BLANCO SEPATU SEKOLAH',
            'model_name'        => 'Hitam, 39',
            'sku'               => 'RECORD-BLANCO-H-39_01246239',
            'stock'             => 14,
            'item_status'       => 'ACTIVATE',
            'has_model'         => true,
        ]);

        TiktokProduct::create([
            'tiktok_account_id' => $account->id,
            'item_id'           => '1729999999999999002',
            'model_id'          => '1729999999999999202',
            'item_name'         => 'RECORD BLANCO SEPATU SEKOLAH',
            'model_name'        => 'Hitam, 40',
            'sku'               => 'RECORD-BLANCO-H-40_01246240',
            'stock'             => 9,
            'item_status'       => 'ACTIVATE',
            'has_model'         => true,
        ]);

        // Pencarian 1 kata: blanco
        $respSingle = $this->actingAs($this->superAdmin)
            ->getJson('/tiktok-products/search-variants?q=blanco');
        $respSingle->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonCount(2, 'data');

        // Pencarian multi-kata: blanco 39
        $respMulti = $this->actingAs($this->superAdmin)
            ->getJson('/tiktok-products/search-variants?q=blanco+39');
        $respMulti->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sku', 'RECORD-BLANCO-H-39_01246239');
    }
}
