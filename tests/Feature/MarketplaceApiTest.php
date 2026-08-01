<?php

namespace Tests\Feature;

use App\DTOs\Marketplace\NormalizedMarketplaceOrder;
use App\Models\Category;
use App\Models\Customer;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrder;
use App\Models\MarketplaceProductMapping;
use App\Models\MarketplaceSyncLog;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Marketplace\MarketplaceOrderService;
use App\Services\Marketplace\MarketplaceSyncService;
use App\Services\Marketplace\Shopee\ShopeeApiService;
use App\Services\Marketplace\Shopee\ShopeeOrderNormalizer;
use App\Services\Marketplace\TikTok\TikTokOrderNormalizer;
use App\Services\Marketplace\TikTok\TikTokShopApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MarketplaceApiTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;
    private Product $product;
    private MarketplaceAccount $shopeeAccount;
    private MarketplaceAccount $tikTokAccount;

    protected function setUp(): void
    {
        parent::setUp();

        $permNames = [
            'marketplace.view', 'marketplace.account.create', 'marketplace.account.edit',
            'marketplace.account.deactivate', 'marketplace.order.view', 'marketplace.order.convert',
            'marketplace.mapping.view', 'marketplace.mapping.create', 'marketplace.mapping.edit',
            'marketplace.mapping.delete', 'marketplace.sync.view', 'marketplace.payload.view',
        ];
        foreach ($permNames as $p) {
            Permission::create(['name' => $p]);
        }

        $superAdminRole = Role::create(['name' => 'Super Admin']);
        $superAdminRole->permissions()->sync(Permission::all()->pluck('id'));

        $this->superAdmin = User::create([
            'name'     => 'Super Admin',
            'email'    => 'superadmin@test.com',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
            'status'   => 'active',
        ]);

        $category = Category::create(['name' => 'Pakaian', 'status' => 'active']);

        $this->product = Product::create([
            'sku'           => 'SHIRT-001',
            'name'          => 'Kemeja Formal',
            'category_id'   => $category->id,
            'unit'          => 'pcs',
            'selling_price' => 150000,
            'cost_price'    => 100000,
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);

        $this->shopeeAccount = MarketplaceAccount::create([
            'marketplace'        => 'shopee',
            'account_name'       => 'Shopee Store Official',
            'shop_id'            => '1234567',
            'status'             => 'active',
            'credentials_status' => 'configured',
            'connection_status'  => 'connected',
            'credentials'        => [
                'access_token'  => 'shopee_secret_access_token_123',
                'refresh_token' => 'shopee_secret_refresh_token_123',
            ],
            'created_by'         => $this->superAdmin->id,
        ]);

        $this->tikTokAccount = MarketplaceAccount::create([
            'marketplace'        => 'tiktok_shop',
            'account_name'       => 'TikTok Store Official',
            'shop_id'            => 'TT-9988',
            'status'             => 'active',
            'credentials_status' => 'configured',
            'connection_status'  => 'connected',
            'credentials'        => [
                'access_token'  => 'tiktok_secret_access_token_456',
                'refresh_token' => 'tiktok_secret_refresh_token_456',
            ],
            'created_by'         => $this->superAdmin->id,
        ]);
    }

    // 1. Account credential encryption
    public function test_account_credentials_are_encrypted(): void
    {
        $rawDb = \DB::table('marketplace_accounts')->where('id', $this->shopeeAccount->id)->first();
        $this->assertStringNotContainsString('shopee_secret_access_token_123', $rawDb->credentials);
        $this->assertEquals('shopee_secret_access_token_123', $this->shopeeAccount->fresh()->credentials['access_token']);
    }

    // 2. Access token hidden from frontend serialization
    public function test_access_token_hidden_from_frontend_json(): void
    {
        $array = $this->shopeeAccount->toSafeArray();
        $this->assertArrayNotHasKey('credentials', $array);
        $this->assertTrue($array['has_credentials']);
    }

    // 3. Shopee API signature & auth url
    public function test_shopee_auth_url_generation(): void
    {
        $service = app(ShopeeApiService::class);
        $url = $service->getAuthorizationUrl($this->shopeeAccount->id, 'https://example.com/callback');
        $this->assertStringContainsString('partner_id=', $url);
        $this->assertStringContainsString('sign=', $url);
    }

    // 4. TikTok API auth url
    public function test_tiktok_auth_url_generation(): void
    {
        $service = app(TikTokShopApiService::class);
        $url = $service->getAuthorizationUrl($this->tikTokAccount->id, 'https://example.com/callback');
        $this->assertStringContainsString('app_key=', $url);
    }

    // 5. Token refresh flow with Http::fake
    public function test_shopee_auto_token_refresh_on_401(): void
    {
        Http::fake([
            '*/api/v2/order/get_order_list*' => Http::sequence()
                ->push(['error' => 'error_auth', 'message' => 'Token expired'], 200)
                ->push(['response' => ['order_list' => [['order_sn' => 'SHP-REFRESHED-01']]]], 200),
            '*/api/v2/auth/access_token/get*' => Http::response([
                'access_token'  => 'new_shopee_access_token_789',
                'refresh_token' => 'new_shopee_refresh_token_789',
                'expires_in'    => 14400,
            ], 200),
        ]);

        $service = app(ShopeeApiService::class);
        $orders = $service->getOrderList($this->shopeeAccount, '2026-07-01 00:00:00', '2026-07-27 23:59:59');

        $this->assertCount(1, $orders);
        $this->assertEquals('new_shopee_access_token_789', $this->shopeeAccount->fresh()->credentials['access_token']);
    }

    // 6. Unauthorized API response handling
    public function test_unauthorized_api_response_updates_account_status(): void
    {
        Http::fake([
            '*/api/v2/order/get_order_list*' => Http::response(['error' => 'error_auth', 'message' => 'Token invalid'], 200),
            '*/api/v2/auth/access_token/get*' => Http::response(['error' => 'invalid_grant', 'message' => 'Refresh token expired'], 400),
        ]);

        $service = app(ShopeeApiService::class);

        $this->expectException(\RuntimeException::class);
        $service->getOrderList($this->shopeeAccount, '2026-07-01 00:00:00', '2026-07-27 23:59:59');

        $this->assertEquals('expired', $this->shopeeAccount->fresh()->connection_status);
    }

    // 7. API Timeout handling
    public function test_api_timeout_handling(): void
    {
        Http::fake([
            '*' => Http::response([], 504),
        ]);

        $service = app(ShopeeApiService::class);

        $this->expectException(\RuntimeException::class);
        $service->getOrderList($this->shopeeAccount, '2026-07-01 00:00:00', '2026-07-27 23:59:59');
    }

    // 8. API Retry limit
    public function test_api_retry_limit_reached(): void
    {
        Http::fake([
            '*/api/v2/order/get_order_list*' => Http::response(['error' => 'error_auth'], 200),
            '*/api/v2/auth/access_token/get*' => Http::response([
                'access_token'  => 'token_1',
                'refresh_token' => 'ref_1',
            ], 200),
        ]);

        $service = app(ShopeeApiService::class);

        $this->expectException(\RuntimeException::class);
        $service->getOrderList($this->shopeeAccount, '2026-07-01 00:00:00', '2026-07-27 23:59:59');
    }

    // 9. Shopee Order List & Detail Normalization
    public function test_shopee_order_normalization(): void
    {
        $normalizer = new ShopeeOrderNormalizer();

        $rawShopeeOrder = [
            'order_sn'             => 'SHP-20260727-99',
            'order_status'         => 'READY_TO_SHIP',
            'create_time'          => 1785052800,
            'total_amount'         => 150000,
            'seller_discount'      => 10000,
            'actual_shipping_fee'  => 12000,
            'service_fee'          => 2000,
            'tracking_number'      => 'SPX123456789',
            'shipping_carrier'     => 'Shopee Express',
            'recipient_address'    => [
                'name'         => 'Ahmad',
                'phone'        => '081299998888',
                'full_address' => 'Jl. Merdeka No. 45',
                'city'         => 'Jakarta Selatan',
                'state'        => 'DKI Jakarta',
                'zipcode'      => '12110',
            ],
            'item_list' => [
                [
                    'item_id'                 => '1001',
                    'item_sku'                => 'SHIRT-001',
                    'item_name'               => 'Kemeja Formal Navy',
                    'model_quantity_purchased'=> 1,
                    'model_discounted_price'  => 140000,
                ],
            ],
        ];

        $dto = $normalizer->normalize($this->shopeeAccount, $rawShopeeOrder);

        $this->assertEquals('shopee', $dto->platform);
        $this->assertEquals('SHP-20260727-99', $dto->externalOrderId);
        $this->assertEquals('processing', $dto->internalStatus);
        $this->assertEquals('Ahmad', $dto->customerName);
        $this->assertEquals('SPX123456789', $dto->trackingNumber);
        $this->assertEquals('Shopee Express', $dto->courierName);
        $this->assertEquals('SHIRT-001', $dto->items[0]['external_sku']);
    }

    // 10. TikTok Order Normalization
    public function test_tiktok_order_normalization(): void
    {
        $normalizer = new TikTokOrderNormalizer();

        $rawTikTokOrder = [
            'id'             => 'TT-5544332211',
            'status'         => 'IN_TRANSIT',
            'create_time'    => 1785052800,
            'tracking_number'=> 'JNT99887766',
            'shipping_provider' => 'J&T Express',
            'recipient_address' => [
                'name'           => 'Budi TikTok',
                'phone_number'   => '085711223344',
                'address_detail' => 'Komp. Melati Blok C2',
                'city'           => 'Bandung',
                'state'          => 'Jawa Barat',
                'zipcode'        => '40111',
            ],
            'payment' => [
                'subtotal'     => 150000,
                'shipping_fee' => 15000,
                'total_amount' => 165000,
            ],
            'item_list' => [
                [
                    'id'             => 'ITEM-TT-1',
                    'seller_sku'     => 'SHIRT-001',
                    'product_name'   => 'Kemeja Formal Merah',
                    'quantity'       => 1,
                    'sku_sale_price' => 150000,
                ],
            ],
        ];

        $dto = $normalizer->normalize($this->tikTokAccount, $rawTikTokOrder);

        $this->assertEquals('tiktok_shop', $dto->platform);
        $this->assertEquals('TT-5544332211', $dto->externalOrderId);
        $this->assertEquals('shipped', $dto->internalStatus);
        $this->assertEquals('JNT99887766', $dto->trackingNumber);
        $this->assertEquals('J&T Express', $dto->courierName);
    }

    // 11. External order ID stored & searchable
    public function test_external_order_id_and_tracking_number_stored_and_searchable(): void
    {
        $orderService = app(MarketplaceOrderService::class);
        $normalizer   = new ShopeeOrderNormalizer();

        $dto = $normalizer->normalize($this->shopeeAccount, [
            'order_sn'        => 'SHP-SEARCH-88',
            'order_status'    => 'COMPLETED',
            'tracking_number' => 'RESI-SEARCH-123',
            'total_amount'    => 150000,
        ]);

        $orderService->createOrUpdateFromNormalized($dto);

        $this->assertDatabaseHas('marketplace_orders', [
            'external_order_id' => 'SHP-SEARCH-88',
            'tracking_number'   => 'RESI-SEARCH-123',
        ]);

        // Search HTTP test
        $this->actingAs($this->superAdmin)
            ->get('/marketplace/orders?search=RESI-SEARCH-123')
            ->assertStatus(200)
            ->assertSee('SHP-SEARCH-88');
    }

    // 12. Idempotency test (no duplicates on sync)
    public function test_sync_is_idempotent_no_duplicate_orders(): void
    {
        $orderService = app(MarketplaceOrderService::class);
        $normalizer   = new ShopeeOrderNormalizer();

        $payload = [
            'order_sn'     => 'SHP-IDEMPOTENT-001',
            'order_status' => 'UNPAID',
            'total_amount' => 100000,
        ];

        $dto1 = $normalizer->normalize($this->shopeeAccount, $payload);
        $orderService->createOrUpdateFromNormalized($dto1);

        $dto2 = $normalizer->normalize($this->shopeeAccount, array_merge($payload, ['order_status' => 'READY_TO_SHIP']));
        $orderService->createOrUpdateFromNormalized($dto2);

        $this->assertEquals(1, MarketplaceOrder::where('external_order_id', 'SHP-IDEMPOTENT-001')->count());
        $this->assertDatabaseHas('marketplace_orders', [
            'external_order_id' => 'SHP-IDEMPOTENT-001',
            'internal_status'   => 'processing',
        ]);
    }

    // 13. Automatic SKU mapping on ingestion
    public function test_automatic_sku_mapping_on_order_ingestion(): void
    {
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->shopeeAccount->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'SHIRT-001',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        $orderService = app(MarketplaceOrderService::class);
        $normalizer   = new ShopeeOrderNormalizer();

        $dto = $normalizer->normalize($this->shopeeAccount, [
            'order_sn'     => 'SHP-AUTOMAP-100',
            'order_status' => 'READY_TO_SHIP',
            'total_amount' => 150000,
            'item_list'    => [
                [
                    'item_id'                 => '88',
                    'item_sku'                => 'SHIRT-001',
                    'item_name'               => 'Kemeja Formal',
                    'model_quantity_purchased'=> 1,
                    'model_discounted_price'  => 150000,
                ],
            ],
        ]);

        $order = $orderService->createOrUpdateFromNormalized($dto);

        $this->assertEquals('ready', $order->conversion_status);
        $this->assertEquals($this->product->id, $order->items->first()->product_id);
    }

    // 14. Unmapped SKU becomes not_converted / pending_mapping
    public function test_unmapped_sku_sets_conversion_status_to_not_converted(): void
    {
        $orderService = app(MarketplaceOrderService::class);
        $normalizer   = new ShopeeOrderNormalizer();

        $dto = $normalizer->normalize($this->shopeeAccount, [
            'order_sn'     => 'SHP-UNMAPPED-200',
            'order_status' => 'READY_TO_SHIP',
            'total_amount' => 150000,
            'item_list'    => [
                [
                    'item_id'                 => '99',
                    'item_sku'                => 'UNKNOWN-SKU-99',
                    'item_name'               => 'Barang Mistik',
                    'model_quantity_purchased'=> 1,
                    'model_discounted_price'  => 150000,
                ],
            ],
        ]);

        $order = $orderService->createOrUpdateFromNormalized($dto);

        $this->assertEquals('not_converted', $order->conversion_status);
        $this->assertNull($order->items->first()->product_id);
    }

    // 15. Multiple marketplace accounts do not clash
    public function test_multiple_accounts_with_same_external_order_id_isolated(): void
    {
        $orderService = app(MarketplaceOrderService::class);

        $dto1 = (new ShopeeOrderNormalizer())->normalize($this->shopeeAccount, ['order_sn' => 'ORD-SAME-ID', 'total_amount' => 100000]);
        $dto2 = (new TikTokOrderNormalizer())->normalize($this->tikTokAccount, ['id' => 'ORD-SAME-ID', 'total_amount' => 200000]);

        $orderService->createOrUpdateFromNormalized($dto1);
        $orderService->createOrUpdateFromNormalized($dto2);

        $this->assertEquals(2, MarketplaceOrder::where('external_order_id', 'ORD-SAME-ID')->count());
    }

    // 16. Sales Order Conversion
    public function test_sales_order_conversion(): void
    {
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->shopeeAccount->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'SHIRT-001',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        $orderService = app(MarketplaceOrderService::class);
        $dto = (new ShopeeOrderNormalizer())->normalize($this->shopeeAccount, [
            'order_sn'     => 'SHP-CONV-300',
            'order_status' => 'READY_TO_SHIP',
            'total_amount' => 150000,
            'item_list'    => [
                ['item_id' => '1', 'item_sku' => 'SHIRT-001', 'item_name' => 'Kemeja', 'model_quantity_purchased' => 1, 'model_discounted_price' => 150000],
            ],
        ]);

        $order = $orderService->createOrUpdateFromNormalized($dto);
        $converted = $orderService->convertToSalesOrder($order, $this->superAdmin->id);

        $this->assertEquals('converted', $converted->conversion_status);
        $this->assertNotNull($converted->sales_order_id);
    }

    // 17. Conversion fails if unmapped SKU exists
    public function test_conversion_fails_if_unmapped_sku_exists(): void
    {
        $orderService = app(MarketplaceOrderService::class);
        $dto = (new ShopeeOrderNormalizer())->normalize($this->shopeeAccount, [
            'order_sn'     => 'SHP-FAIL-400',
            'order_status' => 'READY_TO_SHIP',
            'total_amount' => 150000,
            'item_list'    => [
                ['item_id' => '1', 'item_sku' => 'NO-SKU-MAP', 'item_name' => 'Kemeja', 'model_quantity_purchased' => 1, 'model_discounted_price' => 150000],
            ],
        ]);

        $order = $orderService->createOrUpdateFromNormalized($dto);

        $this->expectException(\InvalidArgumentException::class);
        $orderService->convertToSalesOrder($order, $this->superAdmin->id);
    }

    // 18. Atomic rollback on conversion error
    public function test_atomic_rollback_on_conversion_failure(): void
    {
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->shopeeAccount->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'SHIRT-001',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        $orderService = app(MarketplaceOrderService::class);
        $dto = (new ShopeeOrderNormalizer())->normalize($this->shopeeAccount, [
            'order_sn'     => 'SHP-ROLLBACK-500',
            'order_status' => 'READY_TO_SHIP',
            'total_amount' => 150000,
            'item_list'    => [
                ['item_id' => '1', 'item_sku' => 'SHIRT-001', 'item_name' => 'Kemeja', 'model_quantity_purchased' => 1, 'model_discounted_price' => 150000],
            ],
        ]);

        $order = $orderService->createOrUpdateFromNormalized($dto);

        // Delete product to trigger exception in SalesOrderService
        $this->product->delete();

        try {
            $orderService->convertToSalesOrder($order, $this->superAdmin->id);
        } catch (\Exception $e) {
            // Expected
        }

        $this->assertEquals('ready', $order->fresh()->conversion_status);
        $this->assertNull($order->fresh()->sales_order_id);
    }

    // 19. Sync log lifecycle
    public function test_sync_log_lifecycle_recording(): void
    {
        Http::fake([
            '*/api/v2/order/get_order_list*' => Http::response(['response' => ['order_list' => [['order_sn' => 'SHP-SYNC-LOG-1']]]], 200),
            '*/api/v2/order/get_order_detail*' => Http::response(['response' => ['order_list' => [[
                'order_sn'     => 'SHP-SYNC-LOG-1',
                'order_status' => 'READY_TO_SHIP',
                'total_amount' => 100000,
            ]]]], 200),
        ]);

        $syncService = app(MarketplaceSyncService::class);
        $log = $syncService->syncOrders($this->shopeeAccount, '2026-07-01', '2026-07-27', $this->superAdmin->id);

        $this->assertEquals('success', $log->status);
        $this->assertEquals(1, $log->records_fetched);
        $this->assertEquals(1, $log->records_created);
    }

    // 20. Authorization permissions test
    public function test_authorization_permission_enforcement(): void
    {
        $unauthorizedUser = User::create([
            'name'     => 'Staff',
            'email'    => 'staff@test.com',
            'password' => Hash::make('password'),
            'status'   => 'active',
        ]);

        $this->actingAs($unauthorizedUser)
            ->get('/marketplace/accounts')
            ->assertStatus(403);
    }

    // 21. API credentials sanitized in error logs
    public function test_credentials_sanitized_in_sync_errors(): void
    {
        Http::fake([
            '*' => Http::response(['error' => 'access_token=secret123_invalid'], 500),
        ]);

        $syncService = app(MarketplaceSyncService::class);
        $log = $syncService->syncOrders($this->shopeeAccount, '2026-07-01', '2026-07-27', $this->superAdmin->id);

        $this->assertStringNotContainsString('secret123', $log->error_message ?? '');
    }

    // 22. End to End flow: Fetch -> Normalize -> Stage -> Convert
    public function test_end_to_end_marketplace_sync_and_conversion(): void
    {
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->shopeeAccount->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'SHIRT-001',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        Http::fake([
            '*/api/v2/order/get_order_list*' => Http::response(['response' => ['order_list' => [['order_sn' => 'SHP-E2E-999']]]], 200),
            '*/api/v2/order/get_order_detail*' => Http::response(['response' => ['order_list' => [[
                'order_sn'             => 'SHP-E2E-999',
                'order_status'         => 'READY_TO_SHIP',
                'total_amount'         => 150000,
                'tracking_number'      => 'SPX999888',
                'shipping_carrier'     => 'Shopee Express',
                'recipient_address'    => ['name' => 'E2E Buyer', 'phone' => '0811223344'],
                'item_list'            => [['item_id' => '1', 'item_sku' => 'SHIRT-001', 'item_name' => 'Kemeja', 'model_quantity_purchased' => 1, 'model_discounted_price' => 150000]],
            ]]]], 200),
        ]);

        // 1. Sync
        $syncService = app(MarketplaceSyncService::class);
        $log = $syncService->syncOrders($this->shopeeAccount, '2026-07-01', '2026-07-27', $this->superAdmin->id);
        $this->assertEquals('success', $log->status);

        // 2. Verify Staged Order
        $staged = MarketplaceOrder::where('external_order_id', 'SHP-E2E-999')->firstOrFail();
        $this->assertEquals('ready', $staged->conversion_status);
        $this->assertEquals('SPX999888', $staged->tracking_number);

        // 3. Convert to Sales Order
        $orderService = app(MarketplaceOrderService::class);
        $converted = $orderService->convertToSalesOrder($staged, $this->superAdmin->id);

        $this->assertEquals('converted', $converted->conversion_status);
        $this->assertDatabaseHas('sales_orders', [
            'id'     => $converted->sales_order_id,
            'source' => 'marketplace',
        ]);
    }
}
