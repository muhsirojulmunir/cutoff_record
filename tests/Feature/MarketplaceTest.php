<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrder;
use App\Models\MarketplaceOrderItem;
use App\Models\MarketplaceProductMapping;
use App\Models\MarketplaceSyncLog;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Marketplace\MarketplaceOrderService;
use App\Services\Marketplace\MarketplaceProductMappingService;
use App\Services\Marketplace\MarketplaceSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MarketplaceTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;
    private Product $product;
    private Warehouse $warehouse;
    private MarketplaceAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        // Permissions
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

        $this->warehouse = Warehouse::create([
            'name'       => 'Gudang Utama',
            'code'       => 'GDG-001',
            'address'    => 'Jakarta',
            'is_active'  => true,
            'created_by' => $this->superAdmin->id,
        ]);

        $category = Category::create([
            'name'   => 'Kategori Umum',
            'status' => 'active',
        ]);

        $this->product = Product::create([
            'sku'           => 'PRD-001',
            'name'          => 'Produk Test',
            'category_id'   => $category->id,
            'unit'          => 'pcs',
            'selling_price' => 100000,
            'cost_price'    => 70000,
            'status'        => 'active',
            'created_by'    => $this->superAdmin->id,
        ]);


        $this->account = MarketplaceAccount::create([
            'marketplace'        => 'shopee',
            'account_name'       => 'Toko Test Shopee',
            'status'             => 'active',
            'credentials_status' => 'configured',
            'created_by'         => $this->superAdmin->id,
        ]);
    }


    // ─────────────────────────────────────────────────────────────────────────
    // MARKETPLACE ACCOUNT
    // ─────────────────────────────────────────────────────────────────────────

    public function test_marketplace_account_created_successfully(): void
    {
        $this->assertDatabaseHas('marketplace_accounts', [
            'account_name' => 'Toko Test Shopee',
            'marketplace'  => 'shopee',
            'status'       => 'active',
        ]);
    }

    public function test_marketplace_account_can_be_deactivated(): void
    {
        $this->account->update(['status' => 'inactive']);

        $this->assertDatabaseHas('marketplace_accounts', [
            'id'     => $this->account->id,
            'status' => 'inactive',
        ]);
        $this->assertFalse($this->account->fresh()->isActive());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRODUCT MAPPING
    // ─────────────────────────────────────────────────────────────────────────

    public function test_product_mapping_created_successfully(): void
    {
        $service = app(MarketplaceProductMappingService::class);

        $mapping = $service->create($this->account, [
            'external_sku'          => 'EXT-SKU-001',
            'external_product_name' => 'Produk di Shopee',
            'product_id'            => $this->product->id,
        ], $this->superAdmin->id);

        $this->assertDatabaseHas('marketplace_product_mappings', [
            'marketplace_account_id' => $this->account->id,
            'external_sku'           => 'EXT-SKU-001',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
        ]);
    }

    public function test_duplicate_mapping_sku_throws_exception(): void
    {
        $service = app(MarketplaceProductMappingService::class);

        $service->create($this->account, [
            'external_sku' => 'EXT-SKU-DUP',
            'product_id'   => $this->product->id,
        ], $this->superAdmin->id);

        $this->expectException(\InvalidArgumentException::class);

        $service->create($this->account, [
            'external_sku' => 'EXT-SKU-DUP',
            'product_id'   => $this->product->id,
        ], $this->superAdmin->id);
    }

    public function test_mapping_can_be_updated(): void
    {
        $service = app(MarketplaceProductMappingService::class);

        $mapping = $service->create($this->account, [
            'external_sku' => 'EXT-SKU-UPD',
            'product_id'   => $this->product->id,
        ], $this->superAdmin->id);

        $service->update($mapping, [
            'product_id' => $this->product->id,
            'status'     => 'inactive',
        ]);

        $this->assertEquals('inactive', $mapping->fresh()->status);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARKETPLACE ORDER
    // ─────────────────────────────────────────────────────────────────────────

    public function test_marketplace_order_created_from_payload(): void
    {
        $service = app(MarketplaceOrderService::class);

        $order = $service->createOrUpdateFromPayload($this->account, [
            'external_order_id'     => 'SHP-001',
            'external_order_number' => '#001',
            'order_status'          => 'READY_TO_SHIP',
            'payment_status'        => 'paid',
            'customer_name'         => 'Budi Santoso',
            'customer_phone'        => '081234567890',
            'subtotal'              => 100000,
            'discount'              => 0,
            'shipping_fee'          => 10000,
            'tax'                   => 0,
            'total_amount'          => 110000,
            'order_date'            => now()->toDateTimeString(),
        ], [
            [
                'external_item_id' => 'ITEM-1',
                'external_sku'     => 'EXT-SKU-001',
                'product_name'     => 'Produk Test',
                'quantity'         => 2,
                'unit_price'       => 50000,
                'subtotal'         => 100000,
            ],
        ]);

        $this->assertDatabaseHas('marketplace_orders', [
            'external_order_id' => 'SHP-001',
            'internal_status'   => 'processing',
            'customer_name'     => 'Budi Santoso',
        ]);

        $this->assertEquals(1, $order->items()->count());
    }

    public function test_marketplace_order_is_idempotent(): void
    {
        $service = app(MarketplaceOrderService::class);

        $payload = [
            'external_order_id' => 'SHP-IDEM',
            'order_status'      => 'UNPAID',
            'customer_name'     => 'Andi',
            'subtotal'          => 50000,
            'discount'          => 0,
            'shipping_fee'      => 5000,
            'tax'               => 0,
            'total_amount'      => 55000,
            'order_date'        => now()->toDateTimeString(),
        ];

        $service->createOrUpdateFromPayload($this->account, $payload);
        $service->createOrUpdateFromPayload($this->account, array_merge($payload, ['customer_name' => 'Andi Updated', 'order_status' => 'READY_TO_SHIP']));

        $this->assertEquals(1, MarketplaceOrder::where('external_order_id', 'SHP-IDEM')->count());
        $this->assertDatabaseHas('marketplace_orders', [
            'external_order_id' => 'SHP-IDEM',
            'customer_name'     => 'Andi Updated',
            'internal_status'   => 'processing',
        ]);
    }

    public function test_external_status_normalizes_correctly(): void
    {
        $service = app(MarketplaceOrderService::class);

        $order = $service->createOrUpdateFromPayload($this->account, [
            'external_order_id' => 'SHP-STATUS',
            'order_status'      => 'COMPLETED',
            'customer_name'     => 'Siti',
            'subtotal'          => 50000,
            'discount'          => 0,
            'shipping_fee'      => 0,
            'tax'               => 0,
            'total_amount'      => 50000,
            'order_date'        => now()->toDateTimeString(),
        ]);

        $this->assertEquals('completed', $order->internal_status);
    }

    public function test_order_item_gets_auto_mapped_when_mapping_exists(): void
    {
        // Create mapping first
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->account->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'AUTO-SKU',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        $service = app(MarketplaceOrderService::class);

        $order = $service->createOrUpdateFromPayload($this->account, [
            'external_order_id' => 'SHP-AUTOMAP',
            'order_status'      => 'READY_TO_SHIP',
            'customer_name'     => 'Test',
            'subtotal'          => 100000,
            'discount'          => 0,
            'shipping_fee'      => 0,
            'tax'               => 0,
            'total_amount'      => 100000,
            'order_date'        => now()->toDateTimeString(),
        ], [
            [
                'external_sku' => 'AUTO-SKU',
                'product_name' => 'Produk dari Shopee',
                'quantity'     => 1,
                'unit_price'   => 100000,
                'subtotal'     => 100000,
            ],
        ]);

        $item = $order->items()->first();
        $this->assertNotNull($item->product_id, 'Item harus ter-mapping otomatis ke produk internal.');
        $this->assertEquals($this->product->id, $item->product_id);
        $this->assertEquals('ready', $order->conversion_status);
    }

    public function test_cannot_convert_unmapped_order(): void
    {
        $service = app(MarketplaceOrderService::class);

        $order = $service->createOrUpdateFromPayload($this->account, [
            'external_order_id' => 'SHP-NOMAP',
            'order_status'      => 'READY_TO_SHIP',
            'customer_name'     => 'Test',
            'subtotal'          => 50000,
            'discount'          => 0,
            'shipping_fee'      => 0,
            'tax'               => 0,
            'total_amount'      => 50000,
            'order_date'        => now()->toDateTimeString(),
        ], [
            [
                'external_sku' => 'UNMAPPED-SKU',
                'product_name' => 'Produk Belum Dipetakan',
                'quantity'     => 1,
                'unit_price'   => 50000,
                'subtotal'     => 50000,
            ],
        ]);

        $this->expectException(\InvalidArgumentException::class);
        $service->convertToSalesOrder($order, $this->superAdmin->id);
    }

    public function test_order_converts_to_sales_order_when_fully_mapped(): void
    {
        // Setup mapping
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->account->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'SKU-CONV',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        $service = app(MarketplaceOrderService::class);

        $order = $service->createOrUpdateFromPayload($this->account, [
            'external_order_id' => 'SHP-CONV',
            'order_status'      => 'READY_TO_SHIP',
            'customer_name'     => 'Konversi User',
            'customer_phone'    => '082111222333',
            'subtotal'          => 100000,
            'discount'          => 0,
            'shipping_fee'      => 10000,
            'tax'               => 0,
            'total_amount'      => 110000,
            'order_date'        => now()->toDateTimeString(),
        ], [
            [
                'external_sku' => 'SKU-CONV',
                'product_name' => 'Produk Konversi',
                'quantity'     => 1,
                'unit_price'   => 100000,
                'subtotal'     => 100000,
            ],
        ]);

        $this->assertEquals('ready', $order->conversion_status);

        $converted = $service->convertToSalesOrder($order, $this->superAdmin->id);

        $this->assertNotNull($converted->sales_order_id);
        $this->assertEquals('converted', $converted->conversion_status);
        $this->assertNotNull($converted->converted_at);

        // Verify Sales Order was created
        $this->assertDatabaseHas('sales_orders', [
            'id'     => $converted->sales_order_id,
            'source' => 'marketplace',
        ]);
    }

    public function test_cannot_convert_same_order_twice(): void
    {
        MarketplaceProductMapping::create([
            'marketplace_account_id' => $this->account->id,
            'marketplace'            => 'shopee',
            'external_sku'           => 'SKU-2X',
            'product_id'             => $this->product->id,
            'status'                 => 'active',
            'created_by'             => $this->superAdmin->id,
        ]);

        $service = app(MarketplaceOrderService::class);

        $order = $service->createOrUpdateFromPayload($this->account, [
            'external_order_id' => 'SHP-2X',
            'order_status'      => 'READY_TO_SHIP',
            'customer_name'     => 'Double Convert',
            'subtotal'          => 50000, 'discount' => 0,
            'shipping_fee'      => 0, 'tax' => 0, 'total_amount' => 50000,
            'order_date'        => now()->toDateTimeString(),
        ], [[
            'external_sku' => 'SKU-2X',
            'product_name' => 'Produk',
            'quantity'     => 1,
            'unit_price'   => 50000,
            'subtotal'     => 50000,
        ]]);

        $service->convertToSalesOrder($order, $this->superAdmin->id);

        $this->expectException(\InvalidArgumentException::class);
        $service->convertToSalesOrder($order->fresh(), $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SYNC LOG
    // ─────────────────────────────────────────────────────────────────────────

    public function test_sync_log_lifecycle(): void
    {
        $service = app(MarketplaceSyncService::class);

        $log = $service->startSync($this->account, 'orders', $this->superAdmin->id);

        $this->assertDatabaseHas('marketplace_sync_logs', [
            'id'     => $log->id,
            'status' => 'running',
        ]);

        $completed = $service->completeSync($log, [
            'fetched'  => 10,
            'created'  => 8,
            'updated'  => 2,
            'skipped'  => 0,
            'failed'   => 0,
        ]);

        $this->assertEquals('success', $completed->status);
        $this->assertEquals(10, $completed->records_fetched);
        $this->assertEquals(8, $completed->records_created);

        // Account should be updated
        $this->assertNotNull($this->account->fresh()->last_synced_at);
        $this->assertEquals('success', $this->account->fresh()->last_sync_status);
    }

    public function test_sync_log_fail_updates_account(): void
    {
        $service = app(MarketplaceSyncService::class);

        $log = $service->startSync($this->account, 'products', $this->superAdmin->id);
        $service->failSync($log, 'Connection timeout');

        $this->assertEquals('failed', $log->fresh()->status);
        $this->assertEquals('failed', $this->account->fresh()->last_sync_status);
        $this->assertEquals('Connection timeout', $this->account->fresh()->last_sync_error);
    }

    public function test_inactive_account_cannot_start_sync(): void
    {
        $this->account->update(['status' => 'inactive']);

        $service = app(MarketplaceSyncService::class);

        $this->expectException(\InvalidArgumentException::class);
        $service->startSync($this->account, 'orders', $this->superAdmin->id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTROLLER / HTTP TESTS
    // ─────────────────────────────────────────────────────────────────────────

    public function test_accounts_index_returns_200(): void
    {
        $this->actingAs($this->superAdmin)
            ->get('/marketplace/accounts')
            ->assertStatus(200);
    }

    public function test_accounts_create_returns_200(): void
    {
        $this->actingAs($this->superAdmin)
            ->get('/marketplace/accounts/create')
            ->assertStatus(200);
    }

    public function test_accounts_store_creates_account(): void
    {
        $this->actingAs($this->superAdmin)
            ->post('/marketplace/accounts', [
                'marketplace'  => 'tiktok_shop',
                'account_name' => 'Toko TikTok',
                'shop_id'      => 'TT-001',
                'shop_name'    => 'My TikTok Shop',
            ])
            ->assertRedirect('/marketplace/accounts');

        $this->assertDatabaseHas('marketplace_accounts', [
            'marketplace'  => 'tiktok_shop',
            'account_name' => 'Toko TikTok',
        ]);
    }

    public function test_orders_index_returns_200(): void
    {
        $this->actingAs($this->superAdmin)
            ->get('/marketplace/orders')
            ->assertStatus(200);
    }

    public function test_mappings_index_returns_200(): void
    {
        $this->actingAs($this->superAdmin)
            ->get('/marketplace/mappings')
            ->assertStatus(200);
    }

    public function test_sync_logs_index_returns_200(): void
    {
        $this->actingAs($this->superAdmin)
            ->get('/marketplace/sync-logs')
            ->assertStatus(200);
    }
}
