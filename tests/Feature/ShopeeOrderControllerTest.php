<?php

namespace Tests\Feature;

use App\Models\CutOffOrder;
use App\Models\Role;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ShopeeOrderControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $staffUser;

    private ShopeeAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        $superAdminRole = Role::create([
            'name'        => 'Super Admin',
            'description' => 'Akses penuh sistem',
        ]);

        $staffRole = Role::create([
            'name'        => 'Staff Gudang',
            'description' => 'Akses operasional gudang',
        ]);

        $this->superAdmin = User::create([
            'name'     => 'Super Admin Shopee',
            'email'    => 'superadmin-shopee@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
            'status'   => 'active',
        ]);

        $this->staffUser = User::create([
            'name'     => 'Staff Gudang',
            'email'    => 'staff-gudang@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $staffRole->id,
            'status'   => 'active',
        ]);

        $this->account = ShopeeAccount::create([
            'account_name'      => 'Toko Shopee Official',
            'partner_id'        => '1001',
            'partner_key'       => 'test_partner_key',
            'shop_id'           => '999001',
            'access_token'      => 'mock_access_token',
            'refresh_token'     => 'mock_refresh_token',
            'token_expires_at'  => now()->addHours(2),
            'status'            => 'active',
            'connection_status' => 'connected',
            'created_by'        => $this->superAdmin->id,
        ]);
    }

    private function makeShopeeOrder(array $overrides = []): ShopeeOrder
    {
        $orderSn = (string) ($overrides['order_sn'] ?? ('261111TEST' . random_int(100, 999)));

        return ShopeeOrder::create(array_merge([
            'shopee_account_id'      => $this->account->id,
            'order_sn'               => $orderSn,
            'package_number'         => 'OFG-' . $orderSn,
            'order_status'           => 'READY_TO_SHIP',
            'logistics_status'       => 'LOGISTICS_REQUEST_CREATED',
            'shipping_carrier'       => 'SPX Standard',
            'tracking_number'        => null,
            'fulfillment_method'     => null,
            'buyer_user_id'          => 88001,
            'buyer_username'         => 'pembeli_uji',
            'buyer_note'             => 'Kirim cepat',
            'recipient_data'         => [
                'name'         => 'Budi Santoso',
                'phone'        => '081234567890',
                'full_address' => 'Jl. Sudirman No. 10, Jakarta Pusat',
                'city'         => 'Jakarta Pusat',
                'state'        => 'DKI Jakarta',
                'zipcode'      => '10220',
            ],
            'items_json'             => [
                [
                    'item_id'                  => 10001,
                    'item_name'                => 'Kaos Polos Cut Off',
                    'item_sku'                 => 'KAOS-001',
                    'model_id'                 => 20001,
                    'model_name'               => 'Hitam, L',
                    'model_sku'                => 'KAOS-001-HTM-L',
                    'sku'                      => 'KAOS-001-HTM-L',
                    'model_quantity_purchased' => 1,
                    'model_original_price'     => 100000,
                    'model_discounted_price'   => 100000,
                    'image_url'                => 'https://cf.shopee.co.id/file/sample-item.jpg',
                ],
            ],
            'package_list_json'      => [
                [
                    'package_number'   => 'OFG-' . $orderSn,
                    'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                    'shipping_carrier' => 'SPX Standard',
                ],
            ],
            'payment_method'         => 'ShopeePay',
            'is_cod'                 => false,
            'total_amount'           => 100000,
            'estimated_shipping_fee' => 12000,
            'order_created_at'       => now('Asia/Jakarta')->subHour(),
            'ship_by_date'           => now('Asia/Jakarta')->addDay(),
            'label_document_status'  => 'NONE',
            'label_print_count'      => 0,
            'last_synced_at'         => now('Asia/Jakarta'),
        ], $overrides));
    }

    private function makeCutOffOrder(string $orderSn, array $overrides = []): CutOffOrder
    {
        return CutOffOrder::create(array_merge([
            'order_date'             => now('Asia/Jakarta')->format('Y-m-d H:i:s'),
            'ship_by_date'           => now('Asia/Jakarta')->addDay()->format('Y-m-d H:i:s'),
            'channel'                => 'SH',
            'order_number'           => $orderSn,
            'buyer_username'         => 'pembeli_uji',
            'shipping_courier'       => 'SPX Standard',
            'payment_method'         => 'Non-COD (Lunas Online)',
            'sku_utama'              => 'KAOS-001-HTM-L',
            'product_name'           => 'Kaos Polos Cut Off',
            'variation_name'         => 'Hitam, L',
            'qty'                    => 1,
            'package_count'          => '1',
            'order_status'           => 'Perlu Dikirim',
            'est_net_income'         => 79000,
            'marketplace_net_payout' => 79000,
        ], $overrides));
    }

    public function test_non_super_admin_cannot_access_shopee_orders_or_actions(): void
    {
        $this->get('/shopee-orders')->assertRedirect('/login');

        $this->actingAs($this->staffUser)->get('/shopee-orders')->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/sync')->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/auto-sync')->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/sync-chunk', [
            'start_date' => '2026-11-10',
            'end_date'   => '2026-11-11',
        ])->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/261111TEST01/ship', ['method' => 'pickup'])->assertStatus(403);
        $this->actingAs($this->staffUser)->get('/shopee-orders/261111TEST01/waybill-a4')->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/mass-ship', ['order_sns' => ['261111TEST01']])->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/mass-waybill-a4', ['order_sns' => ['261111TEST01']])->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/261111TEST01/refresh')->assertStatus(403);
        $this->actingAs($this->staffUser)->get('/shopee-orders/261111TEST01/shipping-parameters')->assertStatus(403);
        $this->actingAs($this->staffUser)->post('/shopee-orders/261111TEST01/handle-cancel', ['operation' => 'ACCEPT'])->assertStatus(403);
    }

    public function test_super_admin_can_filter_tabs_subtabs_print_status_and_search(): void
    {
        $baseShipBy = now('Asia/Jakarta');

        $this->makeShopeeOrder([
            'order_sn'          => '261111UNPROC01',
            'order_status'      => 'READY_TO_SHIP',
            'label_print_count' => 0,
            'tracking_number'   => null,
            'ship_by_date'      => $baseShipBy->copy()->addHours(2),
            'raw_payload'       => '{"secret":"hidden"}',
            'items_json'        => [[
                'item_name' => 'Produk A',
                'sku'       => 'SKU-UNPROC-01',
                'image_url' => 'https://cf.shopee.co.id/file/a.jpg',
            ]],
        ]);

        $this->makeShopeeOrder([
            'order_sn'          => '261111RETRY02',
            'order_status'      => 'RETRY_SHIP',
            'label_print_count' => 0,
            'tracking_number'   => null,
            'ship_by_date'      => $baseShipBy->copy()->addHours(4),
            'items_json'        => [[
                'item_name' => 'Produk B',
                'sku'       => 'SKU-RETRY-02',
                'image_url' => 'https://cf.shopee.co.id/file/b.jpg',
            ]],
        ]);

        $this->makeShopeeOrder([
            'order_sn'          => '261111PROCUNP03',
            'order_status'      => 'PROCESSED',
            'label_print_count' => 0,
            'tracking_number'   => 'SPXID000333',
            'ship_by_date'      => $baseShipBy->copy()->addHours(6),
            'items_json'        => [[
                'item_name' => 'Produk C',
                'sku'       => 'SKU-PROC-UNP',
                'image_url' => 'https://cf.shopee.co.id/file/c.jpg',
            ]],
        ]);

        $this->makeShopeeOrder([
            'order_sn'              => '261111PROCPRT04',
            'order_status'          => 'PROCESSED',
            'label_print_count'     => 2,
            'label_document_status' => 'READY',
            'tracking_number'       => 'SPXID000444',
            'ship_by_date'          => $baseShipBy->copy()->addHours(8),
            'items_json'            => [[
                'item_name' => 'Produk D',
                'sku'       => 'SKU-PROC-PRT',
                'image_url' => 'https://cf.shopee.co.id/file/d.jpg',
            ]],
        ]);

        $this->makeShopeeOrder([
            'order_sn'              => '261111SHIP05',
            'order_status'          => 'SHIPPED',
            'label_print_count'     => 1,
            'label_document_status' => 'READY',
            'tracking_number'       => 'SPX-SEARCH-99',
            'ship_by_date'          => $baseShipBy->copy()->addHours(10),
            'items_json'            => [[
                'item_name' => 'Produk E',
                'sku'       => 'SKU-SHIP-05',
                'image_url' => 'https://cf.shopee.co.id/file/e.jpg',
            ]],
        ]);

        // Default membuka /shopee-orders tanpa query param -> tab=to_ship, sub_tab=unprocessed, order_type=all
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.tab', 'to_ship')
                ->where('filters.sub_tab', 'unprocessed')
                ->where('filters.order_type', 'all')
                ->where('orderTypeCounts.all', 2)
                ->where('orderTypeCounts.regular', 2)
                ->where('orderTypeCounts.instant', 0)
                ->where('orderTypeCounts.kilat', 0)
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261111UNPROC01')
                ->where('orders.data.1.order_sn', '261111RETRY02')
                ->missing('orders.data.0.raw_payload')
            );

        // Eksplisit tab=to_ship tanpa sub_tab tetap default ke sub_tab=unprocessed
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.tab', 'to_ship')
                ->where('filters.sub_tab', 'unprocessed')
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261111UNPROC01')
                ->where('orders.data.1.order_sn', '261111RETRY02')
            );

        // Eksplisit tab=to_ship&sub_tab=all menampilkan seluruh READY_TO_SHIP, RETRY_SHIP, dan PROCESSED
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=all')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.tab', 'to_ship')
                ->where('filters.sub_tab', 'all')
                ->where('orderTypeCounts.all', 4)
                ->has('orders.data', 4)
                ->where('orders.data.0.order_sn', '261111UNPROC01')
                ->where('orders.data.1.order_sn', '261111RETRY02')
                ->where('orders.data.2.order_sn', '261111PROCUNP03')
                ->where('orders.data.3.order_sn', '261111PROCPRT04')
            );

        // Tab Perlu Dikirim -> sub-tab Belum Diproses (READY_TO_SHIP + RETRY_SHIP)
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=unprocessed')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.tab', 'to_ship')
                ->where('filters.sub_tab', 'unprocessed')
                ->where('filters.order_type', 'all')
                ->where('tabCounts.all', 5)
                ->where('tabCounts.to_ship', 4)
                ->where('tabCounts.to_ship_unprocessed', 2)
                ->where('tabCounts.to_ship_processed', 2)
                ->where('tabCounts.shipped', 1)
                ->where('tabCounts.unprinted', 3)
                ->where('tabCounts.printed', 2)
                ->where('orderTypeCounts.all', 2)
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261111UNPROC01')
                ->where('orders.data.1.order_sn', '261111RETRY02')
                ->missing('orders.data.0.raw_payload')
            );

        // Tab Perlu Dikirim -> sub-tab Telah Diproses (PROCESSED)
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=processed')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.sub_tab', 'processed')
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261111PROCUNP03')
                ->where('orders.data.1.order_sn', '261111PROCPRT04')
            );

        // Filter print_status=unprinted pada sub_tab=processed
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=processed&print_status=unprinted')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.print_status', 'unprinted')
                ->has('orders.data', 1)
                ->where('orders.data.0.order_sn', '261111PROCUNP03')
            );

        // Filter print_status=printed pada tab=to_ship&sub_tab=all
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=all&print_status=printed')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.sub_tab', 'all')
                ->where('filters.print_status', 'printed')
                ->has('orders.data', 1)
                ->where('orders.data.0.order_sn', '261111PROCPRT04')
            );

        // Filter search berdasarkan No. Resi
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=all&search=SPX-SEARCH-99')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->has('orders.data', 1)
                ->where('orders.data.0.order_sn', '261111SHIP05')
            );

        // Filter search berdasarkan SKU di dalam items_json
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=all&search=SKU-PROC-UNP')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->has('orders.data', 1)
                ->where('orders.data.0.order_sn', '261111PROCUNP03')
            );
    }

    public function test_sync_persists_shopee_orders_and_upserts_cut_off_orders_with_79_percent_formula(): void
    {
        $nowTs = time();

        Http::fake([
            '*/api/v2/order/get_order_list*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'more'        => false,
                    'next_cursor' => '',
                    'order_list'  => [
                        ['order_sn' => '261111SYNC01'],
                        ['order_sn' => '261111SYNC02'],
                    ],
                ],
            ], 200),
            '*/api/v2/order/get_order_detail*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'order_list' => [
                        [
                            'order_sn'               => '261111SYNC01',
                            'order_status'           => 'PROCESSED',
                            'create_time'            => $nowTs - 3600,
                            'ship_by_date'           => $nowTs + 86400,
                            'shipping_carrier'       => 'SPX Standard',
                            'payment_method'         => 'ShopeePay',
                            'cod'                    => false,
                            'buyer_user_id'          => 55001,
                            'buyer_username'         => 'andi_buyer',
                            'message_to_seller'      => 'Tolong pakai bubble wrap ekstra',
                            'total_amount'           => 136380,
                            'estimated_shipping_fee' => 15000,
                            'recipient_address'      => [
                                'name'         => 'Andi Wijaya',
                                'phone'        => '081299990001',
                                'full_address' => 'Jl. Melati No. 12, Bandung',
                                'city'         => 'Kota Bandung',
                                'state'        => 'Jawa Barat',
                                'zipcode'      => '40111',
                            ],
                            'package_list'           => [
                                [
                                    'package_number'   => 'OFG-SYNC-01',
                                    'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                                    'shipping_carrier' => 'SPX Standard',
                                ],
                            ],
                            'item_list'              => [
                                [
                                    'item_id'                  => 7001,
                                    'item_name'                => 'Jaket Parka Canvas',
                                    'item_sku'                 => 'JKT-001',
                                    'model_id'                 => 70011,
                                    'model_name'               => 'Olive, XL',
                                    'model_sku'                => 'JKT-001-OLV-XL',
                                    'model_quantity_purchased' => 1,
                                    'model_original_price'     => 175000,
                                    'model_discounted_price'   => 156380,
                                    'image_info'               => [
                                        'image_url' => 'https://cf.shopee.co.id/file/jaket-olive-xl.jpg',
                                    ],
                                ],
                            ],
                        ],
                        [
                            'order_sn'               => '261111SYNC02',
                            'order_status'           => 'PROCESSED',
                            'create_time'            => $nowTs - 1800,
                            'ship_by_date'           => $nowTs + 86400,
                            'shipping_carrier'       => 'J&T Express',
                            'payment_method'         => 'Transfer Bank',
                            'cod'                    => false,
                            'buyer_user_id'          => 55002,
                            'buyer_username'         => 'siti_buyer',
                            'message_to_seller'      => '',
                            'note'                   => 'Kirim sore',
                            'total_amount'           => 200000,
                            'estimated_shipping_fee' => 14000,
                            'recipient_address'      => [
                                'name'         => 'Siti Rahma',
                                'phone'        => '081388880002',
                                'full_address' => 'Jl. Kenanga No. 5, Surabaya',
                                'city'         => 'Kota Surabaya',
                                'state'        => 'Jawa Timur',
                                'zipcode'      => '60111',
                            ],
                            'package_list'           => [
                                [
                                    'package_number'   => 'OFG-SYNC-02',
                                    'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                                    'shipping_carrier' => 'J&T Express',
                                ],
                            ],
                            'item_list'              => [
                                [
                                    'item_id'                  => 7002,
                                    'item_name'                => 'Celana Chino Slim',
                                    'item_sku'                 => 'CHN-002',
                                    'model_id'                 => 70022,
                                    'model_name'               => 'Khaki, 32',
                                    'model_sku'                => 'CHN-002-KHK-32',
                                    'model_quantity_purchased' => 2,
                                    'model_original_price'     => 100000,
                                    'model_discounted_price'   => 100000,
                                    'image_info'               => [
                                        'image_url' => 'https://cf.shopee.co.id/file/chino-khaki.jpg',
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
            '*/api/v2/payment/get_escrow_detail_batch*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'escrow_detail_list' => [
                        [
                            'order_sn'     => '261111SYNC01',
                            'order_income' => [
                                'voucher_from_seller' => 20000,
                                'escrow_amount'       => 107740,
                            ],
                        ],
                        [
                            'order_sn'     => '261111SYNC02',
                            'order_income' => [
                                'voucher_from_seller' => 0,
                                'escrow_amount'       => 158000,
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->from('/shopee-orders')
            ->post('/shopee-orders/sync', ['days' => 7]);

        $response->assertRedirect('/shopee-orders');
        $response->assertSessionHas('success');
        $response->assertSessionMissing('error');

        $order1 = ShopeeOrder::where('order_sn', '261111SYNC01')->firstOrFail();
        $this->assertSame('PROCESSED', $order1->order_status);
        $this->assertSame('OFG-SYNC-01', $order1->package_number);
        $this->assertSame('Tolong pakai bubble wrap ekstra', $order1->buyer_note);
        $this->assertSame('Andi Wijaya', $order1->recipient_data['name'] ?? null);
        $this->assertSame('Kota Bandung', $order1->recipient_data['city'] ?? null);
        $this->assertSame('https://cf.shopee.co.id/file/jaket-olive-xl.jpg', $order1->items_json[0]['image_url'] ?? null);
        $this->assertSame('JKT-001-OLV-XL', $order1->items_json[0]['sku'] ?? null);

        $order2 = ShopeeOrder::where('order_sn', '261111SYNC02')->firstOrFail();
        $this->assertSame('Kirim sore', $order2->buyer_note);
        $this->assertSame('https://cf.shopee.co.id/file/chino-khaki.jpg', $order2->items_json[0]['image_url'] ?? null);

        // Rumus: (156.380 - 20.000) * 0.79 = 107.740,2 -> 107.740
        $cutOff1 = CutOffOrder::where('channel', 'SH')->where('order_number', '261111SYNC01')->firstOrFail();
        $this->assertEquals(107740.0, (float) $cutOff1->est_net_income);
        $this->assertEquals(107740.0, (float) $cutOff1->marketplace_net_payout);
        $this->assertEquals(156380.0, (float) ($cutOff1->financial_breakdown['subtotal_order'] ?? 0));
        $this->assertEquals(20000.0, (float) ($cutOff1->financial_breakdown['seller_voucher'] ?? 0));

        // Rumus tanpa voucher: (200.000 - 0) * 0.79 = 158.000
        $cutOff2 = CutOffOrder::where('channel', 'SH')->where('order_number', '261111SYNC02')->firstOrFail();
        $this->assertEquals(158000.0, (float) $cutOff2->est_net_income);
        $this->assertEquals(2, $cutOff2->qty);

        $this->assertSame('success', $this->account->fresh()->last_sync_status);
    }

    public function test_ship_order_fetches_tracking_number_and_updates_both_tables(): void
    {
        $orderSn = '261111SHIP001';
        $this->makeShopeeOrder([
            'order_sn'       => $orderSn,
            'package_number' => 'OFG-SHIP-001',
            'order_status'   => 'READY_TO_SHIP',
        ]);

        Http::fake([
            '*/api/v2/logistics/ship_order*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [],
            ], 200),
            '*/api/v2/logistics/get_tracking_number*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'tracking_number' => 'SPXID261111001',
                ],
            ], 200),
            '*/api/v2/order/get_order_detail*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'order_list' => [[
                        'order_sn'         => $orderSn,
                        'order_status'     => 'PROCESSED',
                        'shipping_carrier' => 'SPX Standard',
                        'payment_method'   => 'ShopeePay',
                        'total_amount'     => 100000,
                        'package_list'     => [[
                            'package_number'   => 'OFG-SHIP-001',
                            'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                            'shipping_carrier' => 'SPX Standard',
                        ]],
                        'item_list'        => [[
                            'item_id'                  => 10001,
                            'item_name'                => 'Kaos Polos Cut Off',
                            'model_sku'                => 'KAOS-001-HTM-L',
                            'model_quantity_purchased' => 1,
                            'model_discounted_price'   => 100000,
                        ]],
                    ]],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/shopee-orders/{$orderSn}/ship", [
                'method'         => 'pickup',
                'address_id'     => 7701,
                'pickup_time_id' => 'SLOT_AM_10_12',
            ]);

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('order_sn', $orderSn)
            ->assertJsonPath('tracking_number', 'SPXID261111001')
            ->assertJsonPath('fulfillment_method', 'pickup')
            ->assertJsonPath('order_status', 'PROCESSED');

        $payload = $response->json();
        $this->assertArrayNotHasKey('raw_payload', $payload['order']);

        $freshOrder = ShopeeOrder::where('order_sn', $orderSn)->firstOrFail();
        $this->assertSame('PROCESSED', $freshOrder->order_status);
        $this->assertSame('SPXID261111001', $freshOrder->tracking_number);
        $this->assertSame('pickup', $freshOrder->fulfillment_method);
        $this->assertNotNull($freshOrder->shipping_arranged_at);

        $freshCutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $orderSn)->firstOrFail();
        $this->assertSame('Diproses', $freshCutOff->order_status);

        Http::assertSent(function (HttpClientRequest $req) use ($orderSn): bool {
            if (! str_contains($req->url(), '/api/v2/logistics/ship_order')) {
                return false;
            }
            $data = $req->data();

            return ($data['order_sn'] ?? null) === $orderSn
                && ($data['pickup']['address_id'] ?? null) === 7701
                && ($data['pickup']['pickup_time_id'] ?? null) === 'SLOT_AM_10_12';
        });
        Http::assertSent(fn (HttpClientRequest $req): bool => str_contains($req->url(), '/api/v2/logistics/get_tracking_number'));
        Http::assertSent(fn (HttpClientRequest $req): bool => str_contains($req->url(), '/api/v2/order/get_order_detail'));
    }

    public function test_mass_ship_reports_per_order_success_and_failure(): void
    {
        $okSn = '261111MASS01';
        $failSn = '261111MASS02';

        $this->makeShopeeOrder([
            'order_sn'       => $okSn,
            'package_number' => 'OFG-MASS-01',
            'order_status'   => 'READY_TO_SHIP',
        ]);
        $this->makeShopeeOrder([
            'order_sn'       => $failSn,
            'package_number' => 'OFG-MASS-02',
            'order_status'   => 'READY_TO_SHIP',
        ]);
        $this->makeCutOffOrder($okSn, ['order_status' => 'Perlu Dikirim']);
        $this->makeCutOffOrder($failSn, ['order_status' => 'Perlu Dikirim']);

        Http::fake([
            '*/api/v2/logistics/get_shipping_parameter*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'info_needed' => [
                        'pickup' => ['address_id', 'pickup_time_id'],
                    ],
                    'pickup'      => [
                        'address_list' => [[
                            'address_id'     => 1001,
                            'default'        => true,
                            'time_slot_list' => [['pickup_time_id' => 'SLOT_DEFAULT']],
                        ]],
                    ],
                ],
            ], 200),
            '*/api/v2/logistics/ship_order*' => function (HttpClientRequest $req) use ($failSn) {
                $body = $req->data();
                if (($body['order_sn'] ?? '') === $failSn) {
                    return Http::response([
                        'error'   => 'logistics.error_not_allow_ship',
                        'message' => 'Slot pickup sudah penuh',
                    ], 200);
                }

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => [],
                ], 200);
            },
            '*/api/v2/logistics/get_tracking_number*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => ['tracking_number' => 'SPXMASS001'],
            ], 200),
            '*/api/v2/order/get_order_detail*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'order_list' => [[
                        'order_sn'         => $okSn,
                        'order_status'     => 'PROCESSED',
                        'shipping_carrier' => 'SPX Standard',
                        'package_list'     => [[
                            'package_number'   => 'OFG-MASS-01',
                            'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                            'shipping_carrier' => 'SPX Standard',
                        ]],
                        'item_list'        => [[
                            'item_id'                  => 10001,
                            'item_name'                => 'Kaos Polos Cut Off',
                            'model_sku'                => 'KAOS-001-HTM-L',
                            'model_quantity_purchased' => 1,
                            'model_discounted_price'   => 100000,
                        ]],
                    ]],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/shopee-orders/mass-ship', [
                'order_sns'        => [$okSn, $failSn],
                'preferred_method' => 'auto',
            ]);

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('total', 2)
            ->assertJsonCount(1, 'succeeded')
            ->assertJsonCount(1, 'failed')
            ->assertJsonPath('succeeded.0.order_sn', $okSn)
            ->assertJsonPath('succeeded.0.tracking_number', 'SPXMASS001')
            ->assertJsonPath('failed.0.order_sn', $failSn);

        $this->assertStringContainsString('Slot pickup sudah penuh', (string) $response->json('failed.0.message'));

        $this->assertSame('PROCESSED', ShopeeOrder::where('order_sn', $okSn)->firstOrFail()->order_status);
        $this->assertSame('Diproses', CutOffOrder::where('order_number', $okSn)->firstOrFail()->order_status);
        $this->assertSame('READY_TO_SHIP', ShopeeOrder::where('order_sn', $failSn)->firstOrFail()->order_status);
        $this->assertSame('Perlu Dikirim', CutOffOrder::where('order_number', $failSn)->firstOrFail()->order_status);
    }

    public function test_print_and_mass_print_waybill_a4_streams_pdf_and_increments_print_count(): void
    {
        $sn1 = '261111WB01';
        $sn2 = '261111WB02';

        $this->makeShopeeOrder([
            'order_sn'          => $sn1,
            'package_number'    => 'OFG-WB-01',
            'order_status'      => 'PROCESSED',
            'tracking_number'   => 'SPXWB0001',
            'label_print_count' => 0,
        ]);
        $this->makeShopeeOrder([
            'order_sn'          => $sn2,
            'package_number'    => 'OFG-WB-02',
            'order_status'      => 'PROCESSED',
            'tracking_number'   => 'SPXWB0002',
            'label_print_count' => 0,
        ]);

        $pdfPayload = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";

        Http::fake([
            '*/api/v2/logistics/create_shipping_document*' => function (HttpClientRequest $req) {
                $orderList = $req->data()['order_list'] ?? [];
                $results = array_map(static fn (array $item): array => [
                    'order_sn' => $item['order_sn'],
                ], $orderList);

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => ['result_list' => $results],
                ], 200);
            },
            '*/api/v2/logistics/get_shipping_document_result*' => function (HttpClientRequest $req) {
                $orderList = $req->data()['order_list'] ?? [];
                $results = array_map(static fn (array $item): array => [
                    'order_sn' => $item['order_sn'],
                    'status'   => 'READY',
                ], $orderList);

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => ['result_list' => $results],
                ], 200);
            },
            '*/api/v2/logistics/download_shipping_document*' => Http::response(
                $pdfPayload,
                200,
                ['Content-Type' => 'application/pdf']
            ),
        ]);

        // 1. Single waybill Thermal 100x150
        $singleResponse = $this->actingAs($this->superAdmin)
            ->get("/shopee-orders/{$sn1}/waybill-a4");

        $singleResponse->assertOk();
        $singleResponse->assertHeader('Content-Type', 'application/pdf');
        $singleResponse->assertHeader('X-Shopee-Orders-Count', '1');
        $this->assertStringContainsString("resi-shopee-{$sn1}-thermal-100x150.pdf", (string) $singleResponse->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-1.4', $singleResponse->getContent());

        $wb1AfterSingle = ShopeeOrder::where('order_sn', $sn1)->firstOrFail();
        $wb2AfterSingle = ShopeeOrder::where('order_sn', $sn2)->firstOrFail();
        $this->assertSame(1, $wb1AfterSingle->label_print_count);
        $this->assertSame('READY', $wb1AfterSingle->label_document_status);
        $this->assertNotNull($wb1AfterSingle->label_printed_at);
        $this->assertSame(0, $wb2AfterSingle->label_print_count);

        // 2. Mass waybill Thermal 100x150 (batch 2 pesanan)
        $massResponse = $this->actingAs($this->superAdmin)
            ->post('/shopee-orders/mass-waybill-a4', [
                'order_sns' => [$sn1, $sn2],
            ]);

        $massResponse->assertOk();
        $massResponse->assertHeader('Content-Type', 'application/pdf');
        $massResponse->assertHeader('X-Shopee-Orders-Count', '2');
        $this->assertStringContainsString('resi-shopee-massal-2-pesanan-', (string) $massResponse->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-1.4', $massResponse->getContent());

        $this->assertSame(2, ShopeeOrder::where('order_sn', $sn1)->firstOrFail()->label_print_count);
        $this->assertSame(1, ShopeeOrder::where('order_sn', $sn2)->firstOrFail()->label_print_count);

        Http::assertSent(function (HttpClientRequest $req): bool {
            if (! str_contains($req->url(), '/api/v2/logistics/create_shipping_document')) {
                return false;
            }
            $orderList = $req->data()['order_list'] ?? [];

            return ! empty($orderList)
                && ($orderList[0]['shipping_document_type'] ?? null) === 'THERMAL_AIR_WAYBILL';
        });

        Http::assertSent(function (HttpClientRequest $req): bool {
            if (! str_contains($req->url(), '/api/v2/logistics/download_shipping_document')) {
                return false;
            }

            return ($req->data()['shipping_document_type'] ?? null) === 'THERMAL_AIR_WAYBILL';
        });
    }

    public function test_handle_buyer_cancellation_updates_shopee_and_cutoff_status(): void
    {
        $orderSn = '261111CANCEL01';
        $this->makeShopeeOrder([
            'order_sn'            => $orderSn,
            'order_status'        => 'IN_CANCEL',
            'buyer_cancel_reason' => 'Berubah pikiran',
        ]);
        $this->makeCutOffOrder($orderSn, [
            'order_status'           => 'Pengajuan Batal',
            'est_net_income'         => 79000,
            'marketplace_net_payout' => 79000,
        ]);

        Http::fake([
            '*/api/v2/order/handle_buyer_cancellation*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => ['update_time' => time()],
            ], 200),
            '*/api/v2/order/get_order_detail*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'order_list' => [[
                        'order_sn'            => $orderSn,
                        'order_status'        => 'CANCELLED',
                        'cancel_by'           => 'buyer',
                        'cancel_reason'       => 'Buyer requested cancellation',
                        'buyer_cancel_reason' => 'Berubah pikiran',
                        'shipping_carrier'    => 'SPX Standard',
                        'payment_method'      => 'ShopeePay',
                        'total_amount'        => 100000,
                        'item_list'           => [[
                            'item_id'                  => 10001,
                            'item_name'                => 'Kaos Polos Cut Off',
                            'model_sku'                => 'KAOS-001-HTM-L',
                            'model_quantity_purchased' => 1,
                            'model_discounted_price'   => 100000,
                        ]],
                    ]],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/shopee-orders/{$orderSn}/handle-cancel", [
                'operation' => 'ACCEPT',
            ]);

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('order_sn', $orderSn)
            ->assertJsonPath('operation', 'ACCEPT')
            ->assertJsonPath('order_status', 'CANCELLED');

        $freshOrder = ShopeeOrder::where('order_sn', $orderSn)->firstOrFail();
        $this->assertSame('CANCELLED', $freshOrder->order_status);
        $this->assertSame('Pembeli', $freshOrder->cancel_by);
        $this->assertSame('Buyer requested cancellation', $freshOrder->cancel_reason);

        // Pesanan yang dibatalkan tetap tercatat di Pesanan Saya (shopee_orders),
        // tetapi otomatis dikeluarkan (soft-delete) dari Pesanan Cut Off.
        $this->assertNull(
            CutOffOrder::where('channel', 'SH')->where('order_number', $orderSn)->first()
        );
        $trashedCutOff = CutOffOrder::withTrashed()->where('channel', 'SH')->where('order_number', $orderSn)->firstOrFail();
        $this->assertNotNull($trashedCutOff->deleted_at);
        $this->assertSame('Batal', $trashedCutOff->order_status);
        $this->assertEquals(0.0, (float) $trashedCutOff->marketplace_net_payout);
        $this->assertStringContainsString('Pembeli', (string) $trashedCutOff->keterangan_solutif);

        Http::assertSent(function (HttpClientRequest $req) use ($orderSn): bool {
            if (! str_contains($req->url(), '/api/v2/order/handle_buyer_cancellation')) {
                return false;
            }
            $data = $req->data();

            return ($data['order_sn'] ?? null) === $orderSn
                && ($data['operation'] ?? null) === 'ACCEPT';
        });
    }

    public function test_shopee_error_auth_returns_diagnostic_message(): void
    {
        $orderSn = '261111AUTH01';
        $this->makeShopeeOrder([
            'order_sn'     => $orderSn,
            'order_status' => 'READY_TO_SHIP',
        ]);

        Http::fake([
            '*/api/v2/logistics/*' => Http::response([
                'error'   => 'error_auth',
                'message' => 'Invalid access_token',
            ], 401),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/shopee-orders/{$orderSn}/shipping-parameters");

        $response->assertStatus(502)
            ->assertJsonPath('status', 'error');

        $message = (string) $response->json('message');
        $this->assertStringContainsString('Otorisasi Shopee ditolak (error_auth)', $message);
        $this->assertStringContainsString('Logistics & Order API', $message);
        $this->assertStringContainsString('Invalid access_token', $message);
    }

    public function test_logistics_status_filter_and_live_tracking_info_endpoint(): void
    {
        $pendingSn = '261112TRKPEND01';
        $handedSn = '261112TRKHAND02';

        $this->makeShopeeOrder([
            'order_sn'         => $pendingSn,
            'package_number'   => 'PKG-PEND-01',
            'order_status'     => 'PROCESSED',
            'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
            'tracking_number'  => 'SPXPEND01',
        ]);
        $this->makeShopeeOrder([
            'order_sn'         => $handedSn,
            'package_number'   => 'PKG-HAND-02',
            'order_status'     => 'SHIPPED',
            'logistics_status' => 'LOGISTICS_PICKUP_DONE',
            'tracking_number'  => 'SPXHAND02',
        ]);
        $this->makeCutOffOrder($pendingSn, ['order_status' => 'Diproses']);

        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=all&logistics_status=pending_pickup')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('filters.logistics_status', 'pending_pickup')
                ->where('tabCounts.logistics_pending_pickup', 1)
                ->where('tabCounts.logistics_handed_over', 1)
                ->has('orders.data', 1)
                ->where('orders.data.0.order_sn', $pendingSn)
            );

        $tsOld = now()->subHour()->timestamp;
        $tsNew = now()->subMinutes(5)->timestamp;

        Http::fake([
            '*/api/v2/logistics/get_tracking_info*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'order_sn'         => $pendingSn,
                    'package_number'   => 'PKG-PEND-01',
                    'logistics_status' => 'LOGISTICS_PICKUP_DONE',
                    'tracking_info'    => [
                        ['update_time' => $tsOld, 'description' => 'Menunggu kurir pickup'],
                        ['update_time' => $tsNew, 'description' => 'Paket sudah diterima pihak ekspedisi'],
                    ],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/shopee-orders/{$pendingSn}/tracking-info");

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('logistics_status', 'LOGISTICS_PICKUP_DONE')
            ->assertJsonPath('tracking_info.0.update_time', $tsNew)
            ->assertJsonPath('order.order_status', 'SHIPPED');

        $this->assertSame('LOGISTICS_PICKUP_DONE', ShopeeOrder::where('order_sn', $pendingSn)->value('logistics_status'));
        $this->assertSame('SHIPPED', ShopeeOrder::where('order_sn', $pendingSn)->value('order_status'));
        $this->assertSame('Dikirim', CutOffOrder::where('order_number', $pendingSn)->value('order_status'));
    }

    public function test_escrow_detail_endpoint_returns_live_order_income_and_cutoff_data(): void
    {
        $orderSn = '2611136UB88J62';
        $this->makeShopeeOrder([
            'order_sn'     => $orderSn,
            'order_status' => 'READY_TO_SHIP',
            'total_amount' => 159299,
        ]);
        $this->makeCutOffOrder($orderSn, [
            'order_status'           => 'Perlu Dikirim',
            'est_net_income'         => 129649,
            'marketplace_net_payout' => 129649,
            'financial_breakdown'    => [
                'seller_voucher' => 20000,
                'voucher_code'   => 'RECORD20',
            ],
        ]);

        Http::fake([
            '*/api/v2/payment/get_escrow_detail*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'order_sn'     => $orderSn,
                    'order_income' => [
                        'cost_of_goods_sold'   => 189999,
                        'voucher_from_seller'  => 20000,
                        'seller_voucher_code'  => ['RECORD20'],
                        'commission_fee'       => 17340,
                        'service_fee'          => 11050,
                        'seller_transaction_fee'=> 4310,
                        'final_product_vat_tax'=> 850,
                        'escrow_amount'        => 129649,
                    ],
                ],
            ], 200),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/shopee-orders/{$orderSn}/escrow-detail");

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('order_sn', $orderSn)
            ->assertJsonPath('order_income.escrow_amount', 129649)
            ->assertJsonPath('order_income.voucher_from_seller', 20000)
            ->assertJsonPath('cutoff.seller_voucher', 20000)
            ->assertJsonPath('cutoff.voucher_code', 'RECORD20');
    }
}
