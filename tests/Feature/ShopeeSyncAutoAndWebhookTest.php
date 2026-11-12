<?php

namespace Tests\Feature;

use App\Models\CutOffOrder;
use App\Models\Role;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Models\User;
use App\Services\ShopeeOrderRecorder;
use App\Services\ShopeeOrderService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ShopeeSyncAutoAndWebhookTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $staffUser;

    private ShopeeAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Http::preventStrayRequests();
        app(ShopeeOrderService::class)->resetSchemaCache();
        app(ShopeeOrderRecorder::class)->resetSchemaCache();

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
            'email'    => 'superadmin-sync@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
            'status'   => 'active',
        ]);

        $this->staffUser = User::create([
            'name'     => 'Staff Gudang',
            'email'    => 'staff-sync@test.local',
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
            'token_expires_at'  => now()->addHours(4),
            'status'            => 'active',
            'connection_status' => 'connected',
            'created_by'        => $this->superAdmin->id,
        ]);
    }

    private function makeShopeeOrder(array $overrides = []): ShopeeOrder
    {
        $orderSn = (string) ($overrides['order_sn'] ?? ('261112TEST' . random_int(100, 999)));

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
            'items_json'             => [[
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
            ]],
            'package_list_json'      => [[
                'package_number'   => 'OFG-' . $orderSn,
                'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                'shipping_carrier' => 'SPX Standard',
            ]],
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

    /**
     * @return array<string, mixed>
     */
    private function buildShopeeDetailPayload(string $orderSn, array $overrides = []): array
    {
        $nowTs = time();
        $price = (float) ($overrides['unit_price'] ?? 100000);
        $qty = (int) ($overrides['qty'] ?? 1);
        $carrier = (string) ($overrides['shipping_carrier'] ?? 'SPX Standard');
        $trackingNumber = (string) ($overrides['tracking_number'] ?? '');
        $packageNumber = (string) ($overrides['package_number'] ?? ('OFG-' . $orderSn));

        $packageItem = [
            'package_number'   => $packageNumber,
            'logistics_status' => (string) ($overrides['logistics_status'] ?? 'LOGISTICS_REQUEST_CREATED'),
            'shipping_carrier' => $carrier,
        ];
        if ($trackingNumber !== '') {
            $packageItem['tracking_number'] = $trackingNumber;
        }

        $payload = [
            'order_sn'               => $orderSn,
            'order_status'           => (string) ($overrides['order_status'] ?? 'READY_TO_SHIP'),
            'create_time'            => (int) ($overrides['create_time'] ?? ($nowTs - 3600)),
            'update_time'            => (int) ($overrides['update_time'] ?? ($nowTs - 300)),
            'ship_by_date'           => (int) ($overrides['ship_by_date'] ?? ($nowTs + 86400)),
            'shipping_carrier'       => $carrier,
            'payment_method'         => (string) ($overrides['payment_method'] ?? 'ShopeePay'),
            'cod'                    => (bool) ($overrides['cod'] ?? false),
            'buyer_user_id'          => 55001,
            'buyer_username'         => (string) ($overrides['buyer_username'] ?? 'buyer_' . strtolower($orderSn)),
            'message_to_seller'      => (string) ($overrides['message_to_seller'] ?? ''),
            'total_amount'           => (float) ($overrides['total_amount'] ?? ($price * $qty)),
            'estimated_shipping_fee' => 14000,
            'recipient_address'      => [
                'name'         => 'Andi Wijaya',
                'phone'        => '081299990001',
                'full_address' => 'Jl. Melati No. 12, Bandung',
                'city'         => 'Kota Bandung',
                'state'        => 'Jawa Barat',
                'zipcode'      => '40111',
            ],
            'package_list'           => [$packageItem],
            'item_list'              => [[
                'item_id'                  => 7001,
                'item_name'                => (string) ($overrides['item_name'] ?? 'Jaket Parka Canvas'),
                'item_sku'                 => 'JKT-001',
                'model_id'                 => 70011,
                'model_name'               => 'Olive, XL',
                'model_sku'                => 'JKT-001-OLV-XL',
                'model_quantity_purchased' => $qty,
                'model_original_price'     => $price,
                'model_discounted_price'   => $price,
                'image_info'               => [
                    'image_url' => 'https://cf.shopee.co.id/file/jaket-olive-xl.jpg',
                ],
            ]],
        ];

        if ($trackingNumber !== '') {
            $payload['tracking_number'] = $trackingNumber;
        }

        return $payload;
    }

    /**
     * @param  array<string, array<string, mixed>>  $detailsBySn
     * @param  array<string, array{voucher_from_seller?: float, escrow_amount?: float}>  $escrowBySn
     * @param  array<string, string>  $trackingBySn
     */
    private function fakeReadOnlyShopeeEndpoints(
        array $detailsBySn,
        array $escrowBySn = [],
        array $trackingBySn = [],
        ?callable $orderListResolver = null
    ): void {
        Http::fake([
            '*/api/v2/order/get_order_list*' => function (HttpClientRequest $req) use ($detailsBySn, $orderListResolver) {
                parse_str((string) parse_url($req->url(), PHP_URL_QUERY), $query);
                $sns = $orderListResolver !== null
                    ? $orderListResolver($query)
                    : array_keys($detailsBySn);

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => [
                        'more'        => false,
                        'next_cursor' => '',
                        'order_list'  => array_map(
                            static fn (string $sn): array => ['order_sn' => $sn],
                            array_values($sns)
                        ),
                    ],
                ], 200);
            },
            '*/api/v2/order/get_order_detail*' => function (HttpClientRequest $req) use ($detailsBySn) {
                parse_str((string) parse_url($req->url(), PHP_URL_QUERY), $query);
                $requestedSns = array_values(array_filter(array_map(
                    'trim',
                    explode(',', (string) ($query['order_sn_list'] ?? ''))
                )));

                $orderList = [];
                foreach ($requestedSns as $sn) {
                    if (isset($detailsBySn[$sn])) {
                        $orderList[] = $detailsBySn[$sn];
                    }
                }

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => ['order_list' => $orderList],
                ], 200);
            },
            '*/api/v2/payment/get_escrow_detail_batch*' => function (HttpClientRequest $req) use ($escrowBySn) {
                $requestedSns = (array) ($req->data()['order_sn_list'] ?? []);
                $escrowList = [];
                foreach ($requestedSns as $sn) {
                    $snStr = (string) $sn;
                    $row = $escrowBySn[$snStr] ?? [];
                    $escrowList[] = [
                        'order_sn'     => $snStr,
                        'order_income' => [
                            'voucher_from_seller' => (float) ($row['voucher_from_seller'] ?? 0),
                            'escrow_amount'       => (float) ($row['escrow_amount'] ?? 0),
                        ],
                    ];
                }

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => ['escrow_detail_list' => $escrowList],
                ], 200);
            },
            '*/api/v2/payment/get_escrow_detail*' => function (HttpClientRequest $req) use ($escrowBySn) {
                parse_str((string) parse_url($req->url(), PHP_URL_QUERY), $query);
                $sn = (string) ($query['order_sn'] ?? '');
                $row = $escrowBySn[$sn] ?? [];

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => [
                        'order_sn'     => $sn,
                        'order_income' => [
                            'voucher_from_seller' => (float) ($row['voucher_from_seller'] ?? 0),
                            'escrow_amount'       => (float) ($row['escrow_amount'] ?? 0),
                        ],
                    ],
                ], 200);
            },
            '*/api/v2/logistics/get_tracking_number*' => function (HttpClientRequest $req) use ($trackingBySn) {
                parse_str((string) parse_url($req->url(), PHP_URL_QUERY), $query);
                $sn = (string) ($query['order_sn'] ?? '');

                return Http::response([
                    'error'    => '',
                    'message'  => '',
                    'response' => [
                        'tracking_number' => (string) ($trackingBySn[$sn] ?? ''),
                    ],
                ], 200);
            },
            '*/api/v2/returns/get_return_list*' => Http::response([
                'error'    => '',
                'message'  => '',
                'response' => [
                    'more'   => false,
                    'return' => [],
                ],
            ], 200),
        ]);
    }

    private function assertNoShopeeMutationRequests(): void
    {
        $forbiddenEndpoints = [
            '/api/v2/logistics/ship_order',
            '/api/v2/order/handle_buyer_cancellation',
            '/api/v2/logistics/create_shipping_document',
            '/api/v2/logistics/download_shipping_document',
            '/api/v2/logistics/get_shipping_document_result',
            '/api/v2/product/update_stock',
            '/api/v2/product/update_price',
            '/api/v2/product/unlist_item',
            '/api/v2/auth/access_token/get',
        ];

        foreach ($forbiddenEndpoints as $endpoint) {
            Http::assertNotSent(static fn (HttpClientRequest $req): bool => str_contains($req->url(), $endpoint));
        }

        $allowedReadOnlyPaths = [
            '/api/v2/order/get_order_list',
            '/api/v2/order/get_order_detail',
            '/api/v2/payment/get_escrow_detail_batch',
            '/api/v2/payment/get_escrow_detail',
            '/api/v2/logistics/get_tracking_number',
            '/api/v2/returns/get_return_list',
        ];

        foreach (Http::recorded() as [$request, $response]) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $this->assertContains(
                $path,
                $allowedReadOnlyPaths,
                "Endpoint non-read-only tidak diizinkan saat sinkronisasi otomatis: {$path}"
            );
        }
    }

    public function test_cutoff_sync_command_populates_both_cutoff_and_shopee_orders_and_tracks_shopee_updates(): void
    {
        $oldOrderSn = '261108OLD01';
        $newOrderSn = '261112NEW02';

        $fourDaysAgo = now('Asia/Jakarta')->subDays(4);
        $updateTs = now('Asia/Jakarta')->subMinutes(15)->timestamp;
        $newCreateTs = now('Asia/Jakarta')->subHours(2)->timestamp;

        $this->makeShopeeOrder([
            'order_sn'             => $oldOrderSn,
            'order_status'         => 'READY_TO_SHIP',
            'tracking_number'      => null,
            'shipping_arranged_at' => null,
            'order_created_at'     => $fourDaysAgo,
            'last_synced_at'       => $fourDaysAgo,
        ]);

        $this->makeCutOffOrder($oldOrderSn, [
            'order_date'             => $fourDaysAgo->format('Y-m-d H:i:s'),
            'order_status'           => 'Perlu Dikirim',
            'est_net_income'         => 79000,
            'marketplace_net_payout' => 79000,
            'info_gudang'            => 'PACKING-PRIORITAS',
            'sku_pengganti'          => 'ALT-SKU-008',
            'dpp_number'             => 'DPP-2026-0042',
            'sheet_dpp'              => 'NOV-2026',
            'jl_number'              => 'JL-2026-0099',
            'recheck_qty'            => 3,
        ]);

        $detailsBySn = [
            $oldOrderSn => $this->buildShopeeDetailPayload($oldOrderSn, [
                'order_status'     => 'PROCESSED',
                'create_time'      => $fourDaysAgo->timestamp,
                'update_time'      => $updateTs,
                'tracking_number'  => 'SPXID261108999',
                'unit_price'       => 100000,
                'qty'              => 1,
                'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
            ]),
            $newOrderSn => $this->buildShopeeDetailPayload($newOrderSn, [
                'order_status' => 'READY_TO_SHIP',
                'create_time'  => $newCreateTs,
                'update_time'  => $newCreateTs,
                'unit_price'   => 156380,
                'qty'          => 1,
            ]),
        ];

        $escrowBySn = [
            $oldOrderSn => ['voucher_from_seller' => 0, 'escrow_amount' => 79000],
            $newOrderSn => ['voucher_from_seller' => 20000, 'escrow_amount' => 107740],
        ];

        $this->fakeReadOnlyShopeeEndpoints(
            $detailsBySn,
            $escrowBySn,
            [],
            static function (array $query) use ($oldOrderSn, $newOrderSn): array {
                return ($query['time_range_field'] ?? 'create_time') === 'update_time'
                    ? [$oldOrderSn]
                    : [$newOrderSn];
            }
        );

        $this->artisan('cutoff:sync', ['--days' => 2])->assertExitCode(0);

        $oldShopee = ShopeeOrder::where('order_sn', $oldOrderSn)->firstOrFail();
        $this->assertSame('PROCESSED', $oldShopee->order_status);
        $this->assertSame('SPXID261108999', $oldShopee->tracking_number);
        $this->assertNotNull($oldShopee->shipping_arranged_at);
        $this->assertSame(
            Carbon::createFromTimestamp($updateTs, 'Asia/Jakarta')->format('Y-m-d H:i:s'),
            $oldShopee->shipping_arranged_at->format('Y-m-d H:i:s')
        );

        $newShopee = ShopeeOrder::where('order_sn', $newOrderSn)->firstOrFail();
        $this->assertSame('READY_TO_SHIP', $newShopee->order_status);

        // Verifikasi update status Cut Off + proteksi kolom gudang & pajak
        $oldCutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $oldOrderSn)->firstOrFail();
        $this->assertSame('Diproses', $oldCutOff->order_status);
        $this->assertEquals(79000.0, (float) $oldCutOff->est_net_income);
        $this->assertSame('PACKING-PRIORITAS', $oldCutOff->info_gudang);
        $this->assertSame('ALT-SKU-008', $oldCutOff->sku_pengganti);
        $this->assertSame('DPP-2026-0042', $oldCutOff->dpp_number);
        $this->assertSame('NOV-2026', $oldCutOff->sheet_dpp);
        $this->assertSame('JL-2026-0099', $oldCutOff->jl_number);
        $this->assertSame(3, $oldCutOff->recheck_qty);

        // Pesanan READY_TO_SHIP tetap tersimpan di shopee_orders ("Pesanan Saya"),
        // namun BELUM masuk ke cut_off_orders ("Pesanan Cut Off") sebelum status Diproses.
        $this->assertNull(
            CutOffOrder::where('channel', 'SH')->where('order_number', $newOrderSn)->first()
        );

        Http::assertSent(static fn (HttpClientRequest $req): bool => str_contains($req->url(), 'time_range_field=create_time'));
        Http::assertSent(static fn (HttpClientRequest $req): bool => str_contains($req->url(), 'time_range_field=update_time'));
        $this->assertNoShopeeMutationRequests();
    }

    public function test_auto_sync_endpoint_enforces_super_admin_and_cooldown_and_stays_strictly_read_only(): void
    {
        $this->postJson('/shopee-orders/auto-sync')->assertRedirect('/login');
        $this->actingAs($this->staffUser)->postJson('/shopee-orders/auto-sync')->assertStatus(403);

        $localSn = '261110LOCAL01';
        $autoSn = '261112AUTO01';

        $this->makeShopeeOrder([
            'order_sn'       => $localSn,
            'order_status'   => 'READY_TO_SHIP',
            'last_synced_at' => now('Asia/Jakarta')->subHours(2),
        ]);
        $this->makeCutOffOrder($localSn, [
            'order_status'           => 'Perlu Dikirim',
            'est_net_income'         => 79000,
            'marketplace_net_payout' => 79000,
        ]);

        $detailsBySn = [
            $autoSn => $this->buildShopeeDetailPayload($autoSn, [
                'order_status'    => 'PROCESSED',
                'tracking_number' => '', // Kosong agar di-backfill oleh get_tracking_number pool
                'unit_price'      => 120000,
                'qty'             => 1,
            ]),
            $localSn => $this->buildShopeeDetailPayload($localSn, [
                'order_status'    => 'PROCESSED',
                'tracking_number' => 'SPXLOCAL002',
                'unit_price'      => 100000,
                'qty'             => 1,
            ]),
        ];

        $escrowBySn = [
            $autoSn  => ['voucher_from_seller' => 20000, 'escrow_amount' => 79000],
            $localSn => ['voucher_from_seller' => 0, 'escrow_amount' => 79000],
        ];

        $this->fakeReadOnlyShopeeEndpoints(
            $detailsBySn,
            $escrowBySn,
            [$autoSn => 'SPXAUTO001'],
            static fn (array $query): array => [$autoSn]
        );

        // Panggilan 1: sukses menyinkronkan order baru + order aktif lokal + backfill resi
        $firstRes = $this->actingAs($this->superAdmin)->postJson('/shopee-orders/auto-sync');
        $firstRes->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('skipped', false)
            ->assertJsonPath('reason', null)
            ->assertJsonPath('synced_orders', 2)
            ->assertJsonPath('cutoff_created', 1)
            ->assertJsonPath('cutoff_updated', 1);

        $autoShopee = ShopeeOrder::where('order_sn', $autoSn)->firstOrFail();
        $this->assertSame('PROCESSED', $autoShopee->order_status);
        $this->assertSame('SPXAUTO001', $autoShopee->tracking_number);

        $autoCutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $autoSn)->firstOrFail();
        $this->assertSame('Diproses', $autoCutOff->order_status);
        $this->assertEquals(79000.0, (float) $autoCutOff->est_net_income); // (120.000 - 20.000) * 79%

        $localCutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $localSn)->firstOrFail();
        $this->assertSame('Diproses', $localCutOff->order_status);

        $httpCallsAfterFirst = count(Http::recorded());

        // Panggilan 2 segera setelahnya: ditahan oleh cooldown 20 detik tanpa HTTP call tambahan
        $cooldownRes = $this->actingAs($this->superAdmin)->postJson('/shopee-orders/auto-sync');
        $cooldownRes->assertOk()
            ->assertJsonPath('status', 'skipped')
            ->assertJsonPath('skipped', true)
            ->assertJsonPath('reason', 'cooldown');

        $this->assertCount($httpCallsAfterFirst, Http::recorded());

        // Panggilan 3 dengan force=true melewati cooldown
        $forcedRes = $this->actingAs($this->superAdmin)->postJson('/shopee-orders/auto-sync', ['force' => true]);
        $forcedRes->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('skipped', false);

        $this->assertNoShopeeMutationRequests();
    }

    public function test_sync_chunk_validates_date_window_and_syncs_in_parallel(): void
    {
        $startDate = now('Asia/Jakarta')->subDays(2)->toDateString();
        $endDate = now('Asia/Jakarta')->subDay()->toDateString();

        $this->actingAs($this->staffUser)
            ->postJson('/shopee-orders/sync-chunk', [
                'start_date' => $startDate,
                'end_date'   => $endDate,
            ])
            ->assertStatus(403);

        // Siapkan 52 pesanan agar memicu 2 chunk paralel (50 + 2) dalam Http::pool
        $detailsBySn = [];
        $escrowBySn = [];
        $baseCreateTs = now('Asia/Jakarta')->subDays(2)->addHours(4)->timestamp;
        for ($i = 1; $i <= 52; $i++) {
            $sn = sprintf('261110CHK%03d', $i);
            $detailsBySn[$sn] = $this->buildShopeeDetailPayload($sn, [
                'order_status' => 'PROCESSED',
                'create_time'  => $baseCreateTs + $i,
                'update_time'  => $baseCreateTs + $i,
                'unit_price'   => 100000,
                'qty'          => 1,
            ]);
            $escrowBySn[$sn] = [
                'voucher_from_seller' => 10000,
                'escrow_amount'       => 71100,
            ];
        }

        $this->fakeReadOnlyShopeeEndpoints(
            $detailsBySn,
            $escrowBySn,
            [],
            static function (array $query) use ($detailsBySn): array {
                return ($query['time_range_field'] ?? 'create_time') === 'create_time'
                    ? array_keys($detailsBySn)
                    : [];
            }
        );

        // Rentang > 2 hari ditolak 422 tanpa menembak Shopee API
        $tooWideRes = $this->actingAs($this->superAdmin)
            ->postJson('/shopee-orders/sync-chunk', [
                'start_date' => now('Asia/Jakarta')->subDays(5)->toDateString(),
                'end_date'   => $endDate,
            ]);

        $tooWideRes->assertStatus(422)
            ->assertJsonPath('status', 'error');
        $this->assertStringContainsString('Maksimal 2 hari', (string) $tooWideRes->json('message'));
        Http::assertNothingSent();

        $chunkRes = $this->actingAs($this->superAdmin)
            ->postJson('/shopee-orders/sync-chunk', [
                'start_date' => $startDate,
                'end_date'   => $endDate,
            ]);

        $chunkRes->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('total_fetched', 52)
            ->assertJsonPath('synced_orders', 52)
            ->assertJsonPath('cutoff_created', 52);

        $this->assertSame(52, ShopeeOrder::where('shopee_account_id', $this->account->id)->count());
        $this->assertSame(52, CutOffOrder::where('channel', 'SH')->count());

        $sampleCutOff = CutOffOrder::where('order_number', '261110CHK001')->firstOrFail();
        $this->assertEquals(71100.0, (float) $sampleCutOff->est_net_income); // (100.000 - 10.000) * 79%

        $detailBatchSizes = [];
        foreach (Http::recorded() as [$req, $res]) {
            if (str_contains($req->url(), '/api/v2/order/get_order_detail')) {
                parse_str((string) parse_url($req->url(), PHP_URL_QUERY), $q);
                $detailBatchSizes[] = count(array_filter(explode(',', (string) ($q['order_sn_list'] ?? ''))));
            }
        }
        sort($detailBatchSizes);
        $this->assertSame([2, 50], $detailBatchSizes);
        $this->assertNoShopeeMutationRequests();
    }

    public function test_order_type_filtering_and_counts_match_shopee_tiers(): void
    {
        $baseShipBy = now('Asia/Jakarta');

        $this->makeShopeeOrder([
            'order_sn'         => '261112REG01',
            'order_status'     => 'READY_TO_SHIP',
            'shipping_carrier' => 'SPX Standard',
            'ship_by_date'     => $baseShipBy->copy()->addHours(1),
        ]);
        $this->makeShopeeOrder([
            'order_sn'         => '261112REG02',
            'order_status'     => 'RETRY_SHIP',
            'shipping_carrier' => 'J&T Express',
            'ship_by_date'     => $baseShipBy->copy()->addHours(2),
        ]);
        $this->makeShopeeOrder([
            'order_sn'         => '261112INS01',
            'order_status'     => 'READY_TO_SHIP',
            'shipping_carrier' => 'Shopee Xpress Instant',
            'ship_by_date'     => $baseShipBy->copy()->addHours(3),
        ]);
        $this->makeShopeeOrder([
            'order_sn'         => '261112INS02',
            'order_status'     => 'READY_TO_SHIP',
            'shipping_carrier' => 'GrabExpress Sameday',
            'ship_by_date'     => $baseShipBy->copy()->addHours(4),
        ]);
        $this->makeShopeeOrder([
            'order_sn'         => '261112KIL01',
            'order_status'     => 'READY_TO_SHIP',
            'shipping_carrier' => 'SiCepat BEST',
            'ship_by_date'     => $baseShipBy->copy()->addHours(5),
        ]);
        $this->makeShopeeOrder([
            'order_sn'         => '261112KIL02',
            'order_status'     => 'READY_TO_SHIP',
            'shipping_carrier' => 'JNE YES Next Day',
            'ship_by_date'     => $baseShipBy->copy()->addHours(6),
        ]);
        // Pesanan PROCESSED tidak masuk sub_tab=unprocessed default, tetapi masuk saat sub_tab=all
        $this->makeShopeeOrder([
            'order_sn'         => '261112PROCINS03',
            'order_status'     => 'PROCESSED',
            'shipping_carrier' => 'Gosend Instant',
            'ship_by_date'     => $baseShipBy->copy()->addHours(7),
        ]);

        // Default GET /shopee-orders -> tab=to_ship, sub_tab=unprocessed, order_type=all
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.tab', 'to_ship')
                ->where('filters.sub_tab', 'unprocessed')
                ->where('filters.order_type', 'all')
                ->where('orderTypeCounts.all', 6)
                ->where('orderTypeCounts.regular', 2)
                ->where('orderTypeCounts.instant', 2)
                ->where('orderTypeCounts.kilat', 2)
                ->has('orders.data', 6)
            );

        // Filter order_type=regular
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=unprocessed&order_type=regular')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.order_type', 'regular')
                ->where('orderTypeCounts.all', 6)
                ->where('orderTypeCounts.regular', 2)
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261112REG01')
                ->where('orders.data.1.order_sn', '261112REG02')
            );

        // Filter order_type=instant
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=unprocessed&order_type=instant')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.order_type', 'instant')
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261112INS01')
                ->where('orders.data.1.order_sn', '261112INS02')
            );

        // Filter order_type=kilat
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=unprocessed&order_type=kilat')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.order_type', 'kilat')
                ->has('orders.data', 2)
                ->where('orders.data.0.order_sn', '261112KIL01')
                ->where('orders.data.1.order_sn', '261112KIL02')
            );

        // Sub-tab all + order_type=instant menyertakan PROCESSED
        $this->actingAs($this->superAdmin)
            ->get('/shopee-orders?tab=to_ship&sub_tab=all&order_type=instant')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Shopee/Orders', false)
                ->where('filters.sub_tab', 'all')
                ->where('filters.order_type', 'instant')
                ->where('orderTypeCounts.all', 7)
                ->where('orderTypeCounts.instant', 3)
                ->has('orders.data', 3)
                ->where('orders.data.2.order_sn', '261112PROCINS03')
            );
    }

    public function test_shopee_webhook_verifies_hmac_signature_and_refreshes_order_read_only(): void
    {
        $orderSn = '261112HOOK01';
        $previousSyncTime = now()->subMinutes(10);
        $this->account->update([
            'last_synced_at'   => $previousSyncTime,
            'last_sync_status' => 'success',
        ]);

        $this->makeShopeeOrder([
            'order_sn'        => $orderSn,
            'order_status'    => 'READY_TO_SHIP',
            'tracking_number' => null,
        ]);

        $this->makeCutOffOrder($orderSn, [
            'order_status'           => 'Perlu Dikirim',
            'est_net_income'         => 110600,
            'marketplace_net_payout' => 110600,
            'info_gudang'            => 'CEK-OK',
            'dpp_number'             => 'DPP-2026-0777',
            'jl_number'              => 'JL-2026-0777',
            'recheck_qty'            => 1,
        ]);

        $this->fakeReadOnlyShopeeEndpoints(
            [
                $orderSn => $this->buildShopeeDetailPayload($orderSn, [
                    'order_status'    => 'PROCESSED',
                    'tracking_number' => '',
                    'unit_price'      => 150000,
                    'qty'             => 1,
                ]),
            ],
            [
                $orderSn => ['voucher_from_seller' => 10000, 'escrow_amount' => 110600],
            ],
            [
                $orderSn => 'SPXHOOK888',
            ]
        );

        $webhookUrl = url('/api/shopee/webhook');
        $rawBody = json_encode([
            'shop_id'   => (int) $this->account->shop_id,
            'code'      => 3,
            'timestamp' => time(),
            'data'      => [
                'ordersn' => $orderSn,
                'status'  => 'PROCESSED',
            ],
        ], JSON_THROW_ON_ERROR);

        $signature = hash_hmac('sha256', $webhookUrl . '|' . $rawBody, 'test_partner_key');

        $response = $this->call(
            'POST',
            '/api/shopee/webhook',
            [],
            [],
            [],
            [
                'HTTP_AUTHORIZATION' => $signature,
                'CONTENT_TYPE'       => 'application/json',
                'HTTP_ACCEPT'        => 'application/json',
            ],
            $rawBody
        );

        $response->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('order_sn', $orderSn)
            ->assertJsonPath('refreshed', true)
            ->assertJsonPath('stats.synced_orders', 1);

        $freshShopee = ShopeeOrder::where('order_sn', $orderSn)->firstOrFail();
        $this->assertSame('PROCESSED', $freshShopee->order_status);
        $this->assertSame('SPXHOOK888', $freshShopee->tracking_number);
        $this->assertNotNull($freshShopee->shipping_arranged_at);

        $freshCutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $orderSn)->firstOrFail();
        $this->assertSame('Diproses', $freshCutOff->order_status);
        $this->assertEquals(110600.0, (float) $freshCutOff->est_net_income); // (150.000 - 10.000) * 79%
        $this->assertSame('CEK-OK', $freshCutOff->info_gudang);
        $this->assertSame('DPP-2026-0777', $freshCutOff->dpp_number);
        $this->assertSame('JL-2026-0777', $freshCutOff->jl_number);
        $this->assertSame(1, $freshCutOff->recheck_qty);

        // Cooldown auto-sync tidak tertimpa oleh webhook push per-order
        $this->assertSame(
            $previousSyncTime->format('Y-m-d H:i:s'),
            $this->account->fresh()->last_synced_at?->format('Y-m-d H:i:s')
        );

        // Ping webhook code=0 valid juga diakui tanpa memanggil Shopee API
        $pingBody = json_encode(['shop_id' => 0, 'code' => 0, 'timestamp' => time()], JSON_THROW_ON_ERROR);
        $pingSig = hash_hmac('sha256', $webhookUrl . '|' . $pingBody, 'test_partner_key');
        $this->call(
            'POST',
            '/api/shopee/webhook',
            [],
            [],
            [],
            [
                'HTTP_AUTHORIZATION' => $pingSig,
                'CONTENT_TYPE'       => 'application/json',
                'HTTP_ACCEPT'        => 'application/json',
            ],
            $pingBody
        )->assertOk()->assertJsonPath('status', 'ok')->assertJsonPath('code', 0);

        $this->assertNoShopeeMutationRequests();
    }

    public function test_shopee_webhook_rejects_invalid_signature_with_401(): void
    {
        $orderSn = '261112REJECT01';
        $this->makeShopeeOrder([
            'order_sn'     => $orderSn,
            'order_status' => 'READY_TO_SHIP',
        ]);

        Http::fake();

        $rawBody = json_encode([
            'shop_id'   => (int) $this->account->shop_id,
            'code'      => 3,
            'timestamp' => time(),
            'data'      => [
                'ordersn' => $orderSn,
                'status'  => 'CANCELLED',
            ],
        ], JSON_THROW_ON_ERROR);

        // 1. Tanpa header Authorization
        $this->call(
            'POST',
            '/api/shopee/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT'  => 'application/json',
            ],
            $rawBody
        )->assertStatus(401)->assertJsonPath('status', 'error');

        // 2. Signature HMAC salah / ditandatangani partner_key lain
        $wrongSig = hash_hmac('sha256', url('/api/shopee/webhook') . '|' . $rawBody, 'wrong_partner_key');
        $this->call(
            'POST',
            '/api/shopee/webhook',
            [],
            [],
            [],
            [
                'HTTP_AUTHORIZATION' => $wrongSig,
                'CONTENT_TYPE'       => 'application/json',
                'HTTP_ACCEPT'        => 'application/json',
            ],
            $rawBody
        )->assertStatus(401)
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('message', 'Signature webhook Shopee tidak valid.');

        Http::assertNothingSent();
        $this->assertSame('READY_TO_SHIP', ShopeeOrder::where('order_sn', $orderSn)->firstOrFail()->order_status);
    }
}
