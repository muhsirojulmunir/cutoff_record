<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\ShopeeAccount;
use App\Models\ShopeeProduct;
use App\Models\TiktokAccount;
use App\Models\TiktokProduct;
use App\Models\User;
use App\Services\ShopeeSyncService;
use App\Services\TiktokSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarketplaceProductSyncIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private ShopeeAccount $shopeeAccount;

    private TiktokAccount $tiktokAccount;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Http::preventStrayRequests();

        $role = Role::firstOrCreate(
            ['name' => 'Super Admin'],
            ['description' => 'Full Access']
        );

        $this->superAdmin = User::create([
            'name'     => 'Super Admin Test',
            'email'    => 'admin-marketplace-sync@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $role->id,
            'status'   => 'active',
        ]);

        $this->shopeeAccount = ShopeeAccount::create([
            'account_name'      => 'Shopee Test Store',
            'partner_id'        => '2001',
            'partner_key'       => 'shopee_partner_secret',
            'shop_id'           => '888001',
            'access_token'      => 'shopee_access_token',
            'refresh_token'     => 'shopee_refresh_token',
            'token_expires_at'  => now()->addHours(4),
            'status'            => 'active',
            'connection_status' => 'connected',
            'created_by'        => $this->superAdmin->id,
        ]);

        $this->tiktokAccount = TiktokAccount::create([
            'account_name'      => 'TikTok Test Store',
            'app_key'           => 'tiktok_app_key',
            'app_secret'        => 'tiktok_app_secret',
            'shop_id'           => '777001',
            'shop_cipher'       => 'TTCIPHER123',
            'access_token'      => 'tiktok_access_token',
            'refresh_token'     => 'tiktok_refresh_token',
            'token_expires_at'  => now()->addHours(4),
            'status'            => 'active',
            'connection_status' => 'connected',
            'created_by'        => $this->superAdmin->id,
        ]);
    }

    public function test_shopee_sync_pulls_normal_and_unlist_retries_models_sums_warehouses_and_prunes_deleted(): void
    {
        // Produk & varian lama yang sudah dihapus di Shopee harus ikut terhapus lokal saat scan penuh bersih
        ShopeeProduct::create([
            'shopee_account_id' => $this->shopeeAccount->id,
            'item_id'           => 99999,
            'model_id'          => 0,
            'item_name'         => 'Produk Lama Dihapus',
            'sku'               => 'OLD-DELETED',
            'stock'             => 5,
            'price'             => 100000,
            'item_status'       => 'NORMAL',
            'has_model'         => false,
        ]);

        ShopeeProduct::create([
            'shopee_account_id' => $this->shopeeAccount->id,
            'item_id'           => 1001,
            'model_id'          => 9001,
            'item_name'         => 'Sepatu Record Alpha',
            'model_name'        => 'Merah, 40',
            'sku'               => 'REC-ALPHA-MRH-40',
            'stock'             => 3,
            'price'             => 199000,
            'item_status'       => 'NORMAL',
            'has_model'         => true,
        ]);

        $modelAttempts = 0;

        Http::fake(function (HttpClientRequest $request) use (&$modelAttempts) {
            $url = $request->url();
            $query = [];
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

            if (str_contains($url, '/api/v2/product/get_item_list')) {
                $status = strtoupper((string) ($query['item_status'] ?? 'NORMAL'));
                if ($status === 'NORMAL') {
                    return Http::response([
                        'error'    => '',
                        'response' => [
                            'item'         => [['item_id' => 1001, 'item_status' => 'NORMAL']],
                            'total_count'  => 1,
                            'has_next_page'=> false,
                            'next_offset'  => 0,
                        ],
                    ]);
                }

                return Http::response([
                    'error'    => '',
                    'response' => [
                        'item'         => [['item_id' => 1002, 'item_status' => 'UNLIST']],
                        'total_count'  => 1,
                        'has_next_page'=> false,
                        'next_offset'  => 0,
                    ],
                ]);
            }

            if (str_contains($url, '/api/v2/product/get_item_base_info')) {
                return Http::response([
                    'error'    => '',
                    'response' => [
                        'item_list' => [
                            [
                                'item_id'     => 1001,
                                'item_name'   => 'Sepatu Record Alpha',
                                'item_sku'    => 'REC-ALPHA',
                                'item_status' => 'NORMAL',
                                'has_model'   => true,
                            ],
                            [
                                'item_id'        => 1002,
                                'item_name'      => 'Sepatu Unlist Arsip',
                                'item_sku'       => 'REC-UNLIST',
                                'item_status'    => 'UNLIST',
                                'has_model'      => false,
                                'price_info'     => [['current_price' => 150000]],
                                'stock_info_v2'  => [
                                    'seller_stock' => [
                                        ['location_id' => 'WH_G', 'stock' => 4],
                                        ['location_id' => 'WH_A', 'stock' => 6],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ]);
            }

            if (str_contains($url, '/api/v2/product/get_item_extra_info')) {
                return Http::response([
                    'error'    => '',
                    'response' => ['item_list' => [['item_id' => 1001, 'sale' => 12]]],
                ]);
            }

            if (str_contains($url, '/api/v2/product/get_model_list')) {
                $modelAttempts++;
                if ($modelAttempts === 1) {
                    return Http::response(['error' => 'server_error', 'message' => 'Temporary glitch'], 500);
                }

                return Http::response([
                    'error'    => '',
                    'response' => [
                        'tier_variation' => [
                            ['name' => 'Warna', 'option_list' => [['option' => 'Hitam']]],
                            ['name' => 'Ukuran', 'option_list' => [['option' => '41'], ['option' => '42']]],
                        ],
                        'model' => [
                            [
                                'model_id'      => 501,
                                'model_sku'     => '', // Fallback ke item_sku
                                'tier_index'    => [0, 0],
                                'price_info'    => [['current_price' => 199000]],
                                'stock_info_v2' => [
                                    'seller_stock' => [
                                        ['location_id' => 'WH1', 'stock' => 7],
                                        ['location_id' => 'WH2', 'stock' => 5],
                                    ],
                                ],
                            ],
                            [
                                'model_id'      => 502,
                                'model_sku'     => 'REC-ALPHA-HTM-42',
                                'tier_index'    => [0, 1],
                                'price_info'    => [['current_price' => 199000]],
                                'stock_info_v2' => [
                                    'summary_info' => ['total_available_stock' => 9, 'total_reserved_stock' => 1],
                                ],
                            ],
                        ],
                    ],
                ]);
            }

            return Http::response([], 404);
        });

        $result = app(ShopeeSyncService::class)->syncProductsFromShopee($this->shopeeAccount);

        $this->assertSame('success', $result['status']);
        $this->assertGreaterThanOrEqual(2, $modelAttempts);
        $this->assertSame(1, $result['pruned_items']);
        $this->assertSame(1, $result['pruned_variants']);

        // Produk terhapus (99999) dan varian terhapus (9001) sudah bersih
        $this->assertDatabaseMissing('shopee_products', ['item_id' => 99999]);
        $this->assertDatabaseMissing('shopee_products', ['item_id' => 1001, 'model_id' => 9001]);

        // Produk UNLIST tetap masuk dan multi-warehouse dijumlahkan (4 + 6 = 10)
        $unlistRow = ShopeeProduct::where('item_id', 1002)->first();
        $this->assertNotNull($unlistRow);
        $this->assertSame('UNLIST', $unlistRow->item_status);
        $this->assertSame(10, (int) $unlistRow->stock);

        // Varian hasil retry tersimpan; empty model_sku fallback ke item_sku & multi-warehouse (7 + 5 = 12)
        $m501 = ShopeeProduct::where('item_id', 1001)->where('model_id', 501)->first();
        $this->assertNotNull($m501);
        $this->assertSame('REC-ALPHA', $m501->sku);
        $this->assertSame(12, (int) $m501->stock);

        $m502 = ShopeeProduct::where('item_id', 1001)->where('model_id', 502)->first();
        $this->assertNotNull($m502);
        $this->assertSame('REC-ALPHA-HTM-42', $m502->sku);
        $this->assertSame(9, (int) $m502->stock);
    }

    public function test_shopee_webhook_item_event_updates_and_prunes_deleted_item(): void
    {
        ShopeeProduct::create([
            'shopee_account_id' => $this->shopeeAccount->id,
            'item_id'           => 2001,
            'model_id'          => 0,
            'item_name'         => 'Produk Webhook',
            'sku'               => 'WH-2001',
            'stock'             => 15,
            'price'             => 125000,
            'item_status'       => 'NORMAL',
            'has_model'         => false,
        ]);

        Http::fake(function (HttpClientRequest $request) {
            if (str_contains($request->url(), '/api/v2/product/get_item_base_info')) {
                return Http::response([
                    'error'    => '',
                    'response' => [
                        'item_list' => [
                            [
                                'item_id'     => 2001,
                                'item_name'   => 'Produk Webhook Dihapus',
                                'item_status' => 'SELLER_DELETE',
                            ],
                        ],
                    ],
                ]);
            }

            return Http::response([], 404);
        });

        $payload = [
            'shop_id'   => (int) $this->shopeeAccount->shop_id,
            'code'      => 22,
            'timestamp' => time(),
            'data'      => ['item_id' => 2001],
        ];
        $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
        $url = route('api.shopee.webhook');
        $sig = hash_hmac('sha256', $url . '|' . $rawBody, 'shopee_partner_secret');

        $response = $this->call(
            'POST',
            $url,
            [],
            [],
            [],
            ['HTTP_AUTHORIZATION' => $sig, 'CONTENT_TYPE' => 'application/json'],
            $rawBody
        );

        $response->assertOk()->assertJsonPath('refreshed', true)->assertJsonPath('stats.pruned', 1);
        $this->assertDatabaseMissing('shopee_products', ['item_id' => 2001]);
    }

    public function test_tiktok_sync_fetches_missing_inventory_detail_and_prunes_deleted_variants_and_products(): void
    {
        TiktokProduct::create([
            'tiktok_account_id' => $this->tiktokAccount->id,
            'item_id'           => 'TT_OLD_ITEM',
            'model_id'          => '0',
            'item_name'         => 'Produk TikTok Dihapus',
            'sku'               => 'TT-DEL',
            'stock'             => 4,
            'price'             => 150000,
            'item_status'       => 'ACTIVATE',
            'has_model'         => false,
        ]);

        TiktokProduct::create([
            'tiktok_account_id' => $this->tiktokAccount->id,
            'item_id'           => 'TT_ITEM_1',
            'model_id'          => 'SKU_OLD',
            'item_name'         => 'Sepatu TikTok 1',
            'model_name'        => 'Lama',
            'sku'               => 'TT-SKU-OLD',
            'stock'             => 2,
            'price'             => 180000,
            'item_status'       => 'ACTIVATE',
            'has_model'         => true,
        ]);

        Http::fake(function (HttpClientRequest $request) {
            $url = $request->url();

            if (str_contains($url, '/product/202309/products/search')) {
                return Http::response([
                    'code'    => 0,
                    'message' => 'Success',
                    'data'    => [
                        'products' => [
                            [
                                'id'     => 'TT_ITEM_1',
                                'title'  => 'Sepatu TikTok 1',
                                'status' => 'ACTIVATE',
                                // Search tidak mengembalikan inventory detail -> harus trigger detail fetch
                                'skus'   => [
                                    [
                                        'id'         => 'SKU_1',
                                        'seller_sku' => 'TT-1-39',
                                    ],
                                ],
                            ],
                        ],
                        'next_page_token' => '',
                    ],
                ]);
            }

            if (str_contains($url, '/product/202309/products/TT_ITEM_1')) {
                return Http::response([
                    'code'    => 0,
                    'message' => 'Success',
                    'data'    => [
                        'id'     => 'TT_ITEM_1',
                        'title'  => 'Sepatu TikTok 1',
                        'status' => 'ACTIVATE',
                        'skus'   => [
                            [
                                'id'               => 'SKU_1',
                                'seller_sku'       => 'TT-1-39',
                                'sales_attributes' => [['value_name' => 'Hitam'], ['value_name' => '39']],
                                'price'            => ['tax_exclusive_price' => '180000'],
                                'inventory'        => [
                                    ['warehouse_id' => 'WH_TT_1', 'quantity' => 11],
                                    ['warehouse_id' => 'WH_TT_2', 'quantity' => 4],
                                ],
                            ],
                        ],
                    ],
                ]);
            }

            return Http::response([], 404);
        });

        $result = app(TiktokSyncService::class)->syncProductsFromTiktok($this->tiktokAccount);

        $this->assertSame('success', $result['status']);
        $this->assertSame(1, $result['pruned_items']);
        $this->assertSame(1, $result['pruned_variants']);

        $this->assertDatabaseMissing('tiktok_products', ['item_id' => 'TT_OLD_ITEM']);
        $this->assertDatabaseMissing('tiktok_products', ['item_id' => 'TT_ITEM_1', 'model_id' => 'SKU_OLD']);

        $synced = TiktokProduct::where('item_id', 'TT_ITEM_1')->where('model_id', 'SKU_1')->first();
        $this->assertNotNull($synced);
        $this->assertSame(15, (int) $synced->stock);
        $this->assertSame('Hitam, 39', $synced->model_name);
    }

    public function test_tiktok_update_stock_accepts_batch_updates_and_sends_warehouse_and_shop_cipher(): void
    {
        $product = TiktokProduct::create([
            'tiktok_account_id' => $this->tiktokAccount->id,
            'item_id'           => '7410001',
            'model_id'          => '7420001',
            'item_name'         => 'Sepatu TikTok Batch',
            'model_name'        => 'Putih, 40',
            'sku'               => 'TT-BATCH-40',
            'stock'             => 2,
            'price'             => 210000,
            'item_status'       => 'ACTIVATE',
            'has_model'         => true,
            'raw_data'          => [
                'inventory' => [['warehouse_id' => 'WH_MAIN_01', 'quantity' => 2]],
            ],
        ]);

        $capturedPayload = null;
        $capturedUrl = null;

        Http::fake(function (HttpClientRequest $request) use (&$capturedPayload, &$capturedUrl) {
            if (str_contains($request->url(), '/product/202309/products/7410001/inventory/update')) {
                $capturedUrl = $request->url();
                $capturedPayload = json_decode($request->body(), true);

                return Http::response([
                    'code'    => 0,
                    'message' => 'Success',
                    'data'    => ['errors' => []],
                ]);
            }

            return Http::response([], 404);
        });

        $response = $this->actingAs($this->superAdmin)->postJson('/tiktok-products/update-stock', [
            'updates' => [
                ['product_id' => $product->id, 'stock' => 25],
            ],
        ]);

        $response->assertOk()->assertJsonPath('success', true)->assertJsonPath('updated_count', 1);
        $this->assertNotNull($capturedUrl);
        $this->assertStringContainsString('shop_cipher=TTCIPHER123', $capturedUrl);
        $this->assertSame([
            'skus' => [
                [
                    'id'        => '7420001',
                    'inventory' => [
                        ['warehouse_id' => 'WH_MAIN_01', 'quantity' => 25],
                    ],
                ],
            ],
        ], $capturedPayload);

        $this->assertSame(25, (int) $product->fresh()->stock);
    }

    public function test_auto_sync_endpoints_enforce_cooldown_after_running(): void
    {
        Http::fake(function (HttpClientRequest $request) {
            $url = $request->url();
            if (str_contains($url, '/api/v2/product/get_item_list')) {
                return Http::response([
                    'error'    => '',
                    'response' => ['item' => [], 'total_count' => 0, 'has_next_page' => false, 'next_offset' => 0],
                ]);
            }
            if (str_contains($url, '/product/202309/products/search')) {
                return Http::response([
                    'code' => 0,
                    'data' => ['products' => [], 'next_page_token' => ''],
                ]);
            }

            return Http::response([], 404);
        });

        // Shopee auto-sync: pertama jalan, kedua kena cooldown
        $firstShopee = $this->actingAs($this->superAdmin)->postJson('/shopee-products/auto-sync');
        $firstShopee->assertOk()->assertJsonPath('synced', true);

        $secondShopee = $this->actingAs($this->superAdmin)->postJson('/shopee-products/auto-sync');
        $secondShopee->assertOk()->assertJsonPath('synced', false)->assertJsonPath('reason', 'cooldown');

        // TikTok auto-sync: pertama jalan, kedua kena cooldown
        $firstTiktok = $this->actingAs($this->superAdmin)->postJson('/tiktok-products/auto-sync');
        $firstTiktok->assertOk()->assertJsonPath('synced', true);

        $secondTiktok = $this->actingAs($this->superAdmin)->postJson('/tiktok-products/auto-sync');
        $secondTiktok->assertOk()->assertJsonPath('synced', false)->assertJsonPath('reason', 'cooldown');
    }

    public function test_shopee_and_tiktok_web_endpoints_only_display_active_products(): void
    {
        // Shopee: hanya NORMAL yang boleh muncul, UNLIST/BANNED/SELLER_DELETE harus disembunyikan
        $shopeeActive = ShopeeProduct::create([
            'shopee_account_id' => $this->shopeeAccount->id,
            'item_id'           => 3001,
            'model_id'          => 3101,
            'item_name'         => 'Sepatu Aktif Shopee',
            'model_name'        => 'Hitam, 40',
            'sku'               => 'SH-AKTIF-40',
            'stock'             => 10,
            'price'             => 200000,
            'item_status'       => 'NORMAL',
            'has_model'         => true,
        ]);

        ShopeeProduct::create([
            'shopee_account_id' => $this->shopeeAccount->id,
            'item_id'           => 3002,
            'model_id'          => 3102,
            'item_name'         => 'Sepatu Arsip Shopee',
            'model_name'        => 'Putih, 40',
            'sku'               => 'SH-ARSIP-40',
            'stock'             => 99,
            'price'             => 200000,
            'item_status'       => 'UNLIST',
            'has_model'         => true,
        ]);

        ShopeeProduct::create([
            'shopee_account_id' => $this->shopeeAccount->id,
            'item_id'           => 3003,
            'model_id'          => 0,
            'item_name'         => 'Sepatu Diblokir Shopee',
            'sku'               => 'SH-BANNED',
            'stock'             => 50,
            'price'             => 200000,
            'item_status'       => 'BANNED',
            'has_model'         => false,
        ]);

        // TikTok: hanya ACTIVATE yang boleh muncul, SELLER_DEACTIVATED/PLATFORM_DEACTIVATED harus disembunyikan
        $tiktokActive = TiktokProduct::create([
            'tiktok_account_id' => $this->tiktokAccount->id,
            'item_id'           => 'TT_ACT_1',
            'model_id'          => 'TT_MOD_1',
            'item_name'         => 'Sepatu Aktif TikTok',
            'model_name'        => 'Coklat, 41',
            'sku'               => 'TT-AKTIF-41',
            'stock'             => 8,
            'price'             => 220000,
            'item_status'       => 'ACTIVATE',
            'has_model'         => true,
        ]);

        TiktokProduct::create([
            'tiktok_account_id' => $this->tiktokAccount->id,
            'item_id'           => 'TT_DEACT_1',
            'model_id'          => 'TT_MOD_2',
            'item_name'         => 'Sepatu Arsip TikTok',
            'model_name'        => 'Putih, 41',
            'sku'               => 'TT-ARSIP-41',
            'stock'             => 77,
            'price'             => 220000,
            'item_status'       => 'SELLER_DEACTIVATED',
            'has_model'         => true,
        ]);

        // Verifikasi halaman index Shopee + search-variants + variants
        $shopeeIndex = $this->actingAs($this->superAdmin)->get('/shopee-products');
        $shopeeIndex->assertOk();
        $shopeePage = $shopeeIndex->viewData('page')['props'] ?? [];
        $this->assertSame(1, $shopeePage['summary']['total_skus'] ?? null);
        $this->assertSame(10, $shopeePage['summary']['total_stock'] ?? null);
        $this->assertCount(1, $shopeePage['products']['data'] ?? []);
        $this->assertSame($shopeeActive->id, $shopeePage['products']['data'][0]['id'] ?? null);

        $shopeeSearch = $this->actingAs($this->superAdmin)->getJson('/shopee-products/search-variants?q=Sepatu');
        $shopeeSearch->assertOk();
        $shopeeIds = collect($shopeeSearch->json('data'))->pluck('id')->all();
        $this->assertSame([$shopeeActive->id], $shopeeIds);

        // Verifikasi halaman index TikTok + search-variants
        $tiktokIndex = $this->actingAs($this->superAdmin)->get('/tiktok-products');
        $tiktokIndex->assertOk();
        $tiktokPage = $tiktokIndex->viewData('page')['props'] ?? [];
        $this->assertSame(1, $tiktokPage['summary']['total_skus'] ?? null);
        $this->assertSame(8, $tiktokPage['summary']['total_stock'] ?? null);
        $this->assertCount(1, $tiktokPage['products']['data'] ?? []);
        $this->assertSame($tiktokActive->id, $tiktokPage['products']['data'][0]['id'] ?? null);

        $tiktokSearch = $this->actingAs($this->superAdmin)->getJson('/tiktok-products/search-variants?q=Sepatu');
        $tiktokSearch->assertOk();
        $tiktokIds = collect($tiktokSearch->json('data'))->pluck('id')->all();
        $this->assertSame([$tiktokActive->id], $tiktokIds);
    }
}
