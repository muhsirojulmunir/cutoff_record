<?php

namespace Tests\Feature;

use App\Models\CutOffOrder;
use App\Models\Role;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Models\User;
use App\Services\ShopeeOrderRecorder;
use App\Services\ShopeeSyncService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CutOffDailyProcessedAtTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private ShopeeAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Http::preventStrayRequests();
        app(ShopeeOrderRecorder::class)->resetSchemaCache();

        $role = Role::create([
            'name'        => 'Super Admin',
            'description' => 'Akses penuh sistem',
        ]);

        $this->superAdmin = User::create([
            'name'     => 'Admin Cut Off',
            'email'    => 'admin-daily@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $role->id,
            'status'   => 'active',
        ]);

        $this->account = ShopeeAccount::create([
            'account_name'      => 'Toko Resmi Cut Off',
            'partner_id'        => '1002',
            'partner_key'       => 'partner_key_test',
            'shop_id'           => '888001',
            'access_token'      => 'token_test',
            'refresh_token'     => 'refresh_test',
            'token_expires_at'  => now()->addHours(4),
            'status'            => 'active',
            'connection_status' => 'connected',
            'created_by'        => $this->superAdmin->id,
        ]);
    }

    private function detailPayload(string $orderSn, array $overrides = []): array
    {
        $nowTs = now('Asia/Jakarta')->timestamp;
        $qty = (int) ($overrides['qty'] ?? 1);
        $price = (float) ($overrides['unit_price'] ?? 150000);

        return array_merge([
            'order_sn'          => $orderSn,
            'order_status'      => 'PROCESSED',
            'create_time'       => $nowTs - 3600,
            'update_time'       => $nowTs,
            'ship_by_date'      => $nowTs + 86400,
            'shipping_carrier'  => 'SPX Standard',
            'payment_method'    => 'ShopeePay',
            'cod'               => false,
            'total_amount'      => $price * $qty,
            'buyer_user_id'     => 555001,
            'buyer_username'    => 'pembeli_harian',
            'tracking_number'   => 'SPXID001',
            'recipient_address' => [
                'name' => 'Budi',
            ],
            'item_list'         => [[
                'item_id'                  => 11001,
                'item_name'                => 'Sepatu Sekolah Hitam',
                'model_id'                 => 22001,
                'model_name'               => '38',
                'model_sku'                => 'REC-38',
                'model_quantity_purchased' => $qty,
                'model_original_price'     => $price,
                'model_discounted_price'   => $price,
            ]],
            'package_list'      => [[
                'package_number'   => 'PKG-' . $orderSn,
                'logistics_status' => 'LOGISTICS_REQUEST_CREATED',
                'shipping_carrier' => 'SPX Standard',
            ]],
        ], $overrides);
    }

    public function test_historical_shipped_or_completed_orders_do_not_use_completion_update_time_as_processed_at(): void
    {
        $today = now('Asia/Jakarta');
        $yesterdayMidnight = $today->copy()->subDay()->setTime(23, 55, 0);
        $fiveDaysAgo = $today->copy()->subDays(5)->setTime(14, 20, 0);
        $processedAtToday = $today->copy()->setTime(0, 10, 0);
        $completedUpdateToday = $today->copy()->setTime(13, 0, 0);

        $details = [
            // 1. Pesanan lama yang baru COMPLETED hari ini (tidak pernah tercatat saat PROCESSED)
            $this->detailPayload('ORD-OLD-COMPLETED', [
                'order_status' => 'COMPLETED',
                'create_time'  => $fiveDaysAgo->timestamp,
                'update_time'  => $completedUpdateToday->timestamp,
                'qty'          => 2,
            ]),
            // 2. Pesanan kemarin yang sudah SHIPPED dan transit hub ter-update hari ini (tidak pernah tercatat saat PROCESSED)
            $this->detailPayload('ORD-OLD-SHIPPED', [
                'order_status' => 'SHIPPED',
                'create_time'  => $yesterdayMidnight->timestamp,
                'update_time'  => $completedUpdateToday->timestamp,
                'qty'          => 1,
            ]),
            // 3. Pesanan checkout kemarin jam 23:55 tapi diproses hari ini jam 00:10
            $this->detailPayload('ORD-PROC-TODAY', [
                'order_status' => 'PROCESSED',
                'create_time'  => $yesterdayMidnight->timestamp,
                'update_time'  => $processedAtToday->timestamp,
                'qty'          => 2,
            ]),
        ];

        $escrow = [
            'ORD-OLD-COMPLETED' => ['voucher_from_seller' => 0, 'escrow_amount' => 237000],
            'ORD-OLD-SHIPPED'   => ['voucher_from_seller' => 0, 'escrow_amount' => 118500],
            'ORD-PROC-TODAY'    => ['voucher_from_seller' => 0, 'escrow_amount' => 237000],
        ];

        app(ShopeeSyncService::class)->ingestDetailedOrdersToCutOff($this->account, $details, $escrow);

        $oldCompletedShopee = ShopeeOrder::where('order_sn', 'ORD-OLD-COMPLETED')->firstOrFail();
        $this->assertNull($oldCompletedShopee->shipping_arranged_at);

        $oldShippedShopee = ShopeeOrder::where('order_sn', 'ORD-OLD-SHIPPED')->firstOrFail();
        $this->assertNull($oldShippedShopee->shipping_arranged_at);

        $procTodayShopee = ShopeeOrder::where('order_sn', 'ORD-PROC-TODAY')->firstOrFail();
        $this->assertSame($processedAtToday->format('Y-m-d H:i:s'), $procTodayShopee->shipping_arranged_at?->format('Y-m-d H:i:s'));

        $oldCompletedCutOff = CutOffOrder::where('order_number', 'ORD-OLD-COMPLETED')->firstOrFail();
        $this->assertSame($fiveDaysAgo->format('Y-m-d H:i:s'), $oldCompletedCutOff->processed_at?->format('Y-m-d H:i:s'));

        $oldShippedCutOff = CutOffOrder::where('order_number', 'ORD-OLD-SHIPPED')->firstOrFail();
        $this->assertSame($yesterdayMidnight->format('Y-m-d H:i:s'), $oldShippedCutOff->processed_at?->format('Y-m-d H:i:s'));

        $procTodayCutOff = CutOffOrder::where('order_number', 'ORD-PROC-TODAY')->firstOrFail();
        $this->assertSame($processedAtToday->format('Y-m-d H:i:s'), $procTodayCutOff->processed_at?->format('Y-m-d H:i:s'));

        // Sekarang ORD-PROC-TODAY lanjut ke SHIPPED pada hari berikutnya — processed_at harus tetap 12 Nov (hari diproses)
        $shippedLaterTs = $today->copy()->setTime(17, 0, 0)->timestamp;
        app(ShopeeSyncService::class)->ingestDetailedOrdersToCutOff($this->account, [
            $this->detailPayload('ORD-PROC-TODAY', [
                'order_status' => 'SHIPPED',
                'create_time'  => $yesterdayMidnight->timestamp,
                'update_time'  => $shippedLaterTs,
                'qty'          => 2,
            ]),
        ], [
            'ORD-PROC-TODAY' => ['voucher_from_seller' => 0, 'escrow_amount' => 237000],
        ]);

        $this->assertSame(
            $processedAtToday->format('Y-m-d H:i:s'),
            $procTodayCutOff->fresh()->processed_at?->format('Y-m-d H:i:s')
        );
    }

    public function test_cleanup_historical_processed_at_fixes_poisoned_rows_while_preserving_valid_ones(): void
    {
        $today = now('Asia/Jakarta');
        $todayAt10 = $today->copy()->setTime(10, 0, 0)->format('Y-m-d H:i:s');
        $todayAt01 = $today->copy()->setTime(0, 15, 0)->format('Y-m-d H:i:s');
        $yesterdayNight = $today->copy()->subDay()->setTime(23, 50, 0)->format('Y-m-d H:i:s');
        $fourDaysAgo = $today->copy()->subDays(4)->setTime(11, 30, 0)->format('Y-m-d H:i:s');

        // 1. Poisoned COMPLETED order from 4 days ago without ERP fulfillment
        ShopeeOrder::create([
            'shopee_account_id'    => $this->account->id,
            'order_sn'             => 'ORD-POISON-COMPLETED',
            'order_status'         => 'COMPLETED',
            'shipping_arranged_at' => $todayAt10,
            'fulfillment_method'   => null,
            'order_created_at'     => $fourDaysAgo,
            'items_json'           => [],
        ]);
        CutOffOrder::create([
            'order_date'   => $fourDaysAgo,
            'processed_at' => $todayAt10,
            'channel'      => 'SH',
            'order_number' => 'ORD-POISON-COMPLETED',
            'order_status' => 'Selesai',
            'qty'          => 1,
        ]);

        // 2. Poisoned SHIPPED order from 4 days ago without ERP fulfillment
        ShopeeOrder::create([
            'shopee_account_id'    => $this->account->id,
            'order_sn'             => 'ORD-POISON-SHIPPED',
            'order_status'         => 'SHIPPED',
            'shipping_arranged_at' => $todayAt10,
            'fulfillment_method'   => null,
            'order_created_at'     => $fourDaysAgo,
            'items_json'           => [],
        ]);
        CutOffOrder::create([
            'order_date'   => $fourDaysAgo,
            'processed_at' => $todayAt10,
            'channel'      => 'SH',
            'order_number' => 'ORD-POISON-SHIPPED',
            'order_status' => 'Dikirim',
            'qty'          => 1,
        ]);

        // 3. Valid PROCESSED order checked out yesterday 23:50, processed today 00:15
        ShopeeOrder::create([
            'shopee_account_id'    => $this->account->id,
            'order_sn'             => 'ORD-VALID-PROCESSED',
            'order_status'         => 'PROCESSED',
            'shipping_arranged_at' => $todayAt01,
            'fulfillment_method'   => null,
            'order_created_at'     => $yesterdayNight,
            'items_json'           => [],
        ]);
        CutOffOrder::create([
            'order_date'   => $yesterdayNight,
            'processed_at' => $todayAt01,
            'channel'      => 'SH',
            'order_number' => 'ORD-VALID-PROCESSED',
            'order_status' => 'Diproses',
            'qty'          => 3,
        ]);

        // 4. Valid SHIPPED order fulfilled inside ERP (`fulfillment_method = pickup`)
        ShopeeOrder::create([
            'shopee_account_id'    => $this->account->id,
            'order_sn'             => 'ORD-VALID-ERP-SHIPPED',
            'order_status'         => 'SHIPPED',
            'shipping_arranged_at' => $todayAt01,
            'fulfillment_method'   => 'pickup',
            'order_created_at'     => $yesterdayNight,
            'items_json'           => [],
        ]);
        CutOffOrder::create([
            'order_date'   => $yesterdayNight,
            'processed_at' => $todayAt01,
            'channel'      => 'SH',
            'order_number' => 'ORD-VALID-ERP-SHIPPED',
            'order_status' => 'Dikirim',
            'qty'          => 2,
        ]);

        CutOffOrder::cleanupHistoricalProcessedAt();

        $this->assertNull(ShopeeOrder::where('order_sn', 'ORD-POISON-COMPLETED')->firstOrFail()->shipping_arranged_at);
        $this->assertNull(ShopeeOrder::where('order_sn', 'ORD-POISON-SHIPPED')->firstOrFail()->shipping_arranged_at);
        $this->assertSame($fourDaysAgo, CutOffOrder::where('order_number', 'ORD-POISON-COMPLETED')->firstOrFail()->processed_at?->format('Y-m-d H:i:s'));
        $this->assertSame($fourDaysAgo, CutOffOrder::where('order_number', 'ORD-POISON-SHIPPED')->firstOrFail()->processed_at?->format('Y-m-d H:i:s'));

        $this->assertSame($todayAt01, CutOffOrder::where('order_number', 'ORD-VALID-PROCESSED')->firstOrFail()->processed_at?->format('Y-m-d H:i:s'));
        $this->assertSame($todayAt01, CutOffOrder::where('order_number', 'ORD-VALID-ERP-SHIPPED')->firstOrFail()->processed_at?->format('Y-m-d H:i:s'));
        $this->assertSame($todayAt01, ShopeeOrder::where('order_sn', 'ORD-VALID-ERP-SHIPPED')->firstOrFail()->shipping_arranged_at?->format('Y-m-d H:i:s'));
    }
}

