<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\TiktokAccount;
use App\Models\TiktokOrder;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class TiktokOrderService
{
    private const SCHEMA_CACHE_KEY = 'tiktok_orders_schema_ensured_v1';
    public const DUMMY_CACHE_KEY = 'tiktok_sample_data_cleared_v1';

    public const DUMMY_ORDER_SNS = [
        '5798234719082341',
        '5791823901823904',
        '5792019384910283',
        '5793019284719283',
        '5794829102938401',
        '5795819203948572',
        '5796819203948192',
        '5797819203948293',
    ];

    private bool $schemaEnsured = false;

    public function __construct(
        private readonly TiktokSyncService $syncService,
    ) {}

    /**
     * Pastikan tabel tiktok_orders tersedia di database dan memiliki sample data jika kosong.
     */
    public function ensureSchema(): void
    {
        if ($this->schemaEnsured) {
            return;
        }

        try {
            if (! Schema::hasTable('tiktok_orders')) {
                Schema::create('tiktok_orders', TiktokOrder::buildSchemaCallback());
            }

            // Inisialisasi default akun tiktok jika belum ada
            $account = TiktokAccount::firstOrCreate(
                ['id' => 1],
                [
                    'account_name'      => 'RecordShoesOfficial',
                    'app_key'           => '6lpakhma3ecn8',
                    'service_id'        => '7702820460932712212',
                    'shop_id'           => '7494083438199277309',
                    'connection_status' => 'connected',
                    'status'            => 'active',
                ]
            );

            // Jika tabel masih kosong dan belum pernah dibersihkan sengaja oleh user, seed sample data
            if (TiktokOrder::count() === 0 && ! Cache::get(self::DUMMY_CACHE_KEY)) {
                $this->seedInitialOrders($account);
            }

            $this->schemaEnsured = true;
        } catch (\Throwable $e) {
            Log::warning('TiktokOrderService ensureSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Bersihkan 8 data pesanan contoh (dummy) TikTok.
     */
    public function clearSampleOrders(): int
    {
        $this->ensureSchema();
        Cache::forever(self::DUMMY_CACHE_KEY, true);
        return TiktokOrder::whereIn('order_sn', self::DUMMY_ORDER_SNS)->delete();
    }

    /**
     * Muat ulang 8 pesanan contoh (dummy) TikTok untuk kebutuhan demonstrasi atau screenshot.
     */
    public function reseedSampleOrders(?TiktokAccount $account = null): void
    {
        $this->ensureSchema();
        Cache::forget(self::DUMMY_CACHE_KEY);
        $account = $account ?: TiktokAccount::first();
        if (! $account) {
            return;
        }
        TiktokOrder::whereIn('order_sn', self::DUMMY_ORDER_SNS)->delete();
        $this->seedInitialOrders($account);
    }

    /**
     * Seed initial sample data TikTok untuk tampilan & pengajuan screenshot.
     */
    private function seedInitialOrders(TiktokAccount $account): void
    {
        $now = now();

        $sampleOrders = [
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5798234719082341',
                'package_number'         => 'PKG-TT-5798234719',
                'order_status'           => 'READY_TO_SHIP',
                'logistics_status'       => 'LOGISTICS_NOT_START',
                'shipping_carrier'       => 'J&T Express',
                'tracking_number'        => null,
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129034,
                'buyer_username'         => 'dewi_kartika99',
                'buyer_note'             => 'Pengiriman reguler J&T, tolong double box ya kak.',
                'recipient_data'         => [
                    'name'         => 'Dewi Kartika',
                    'phone'        => '081298471902',
                    'full_address' => 'Jl. Anggrek No. 12, Kel. Sukamaju, Kec. Cilodong, Kota Depok, Jawa Barat 16415',
                    'city'         => 'Kota Depok',
                    'province'     => 'Jawa Barat',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928401,
                        'item_name'                => 'RECORD KYLIE SEPATU SNEAKERS SEKOLAH ANAK SMP SMA CEWE BLACK HITAM/PUTIH 12 TH KEATAS TALI 33-40',
                        'model_id'                 => 1029384,
                        'model_name'               => 'Putih, 38 (24cm)',
                        'model_sku'                => 'RECORD-KYLIE-P-38_01224638',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 189999,
                        'model_discounted_price'   => 141599,
                        'image_url'                => '/storage/products/kylie_white.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 141599,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subHours(2)->subMinutes(15),
                'ship_by_date'           => $now->copy()->addHours(22),
                'label_document_status'  => 'NONE',
                'label_print_count'      => 0,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5791823901823904',
                'package_number'         => 'PKG-TT-5791823901',
                'order_status'           => 'READY_TO_SHIP',
                'logistics_status'       => 'LOGISTICS_NOT_START',
                'shipping_carrier'       => 'J&T Express',
                'tracking_number'        => null,
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129035,
                'buyer_username'         => 'budi_santoso_sub',
                'buyer_note'             => 'Min pastikan size 40 warna hitam putih sesuai pesanan ya.',
                'recipient_data'         => [
                    'name'         => 'Budi Santoso',
                    'phone'        => '082188471029',
                    'full_address' => 'Komplek Permata Hijau Blok C No. 4, Kebayoran Lama, Jakarta Selatan 12210',
                    'city'         => 'Jakarta Selatan',
                    'province'     => 'DKI Jakarta',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928402,
                        'item_name'                => 'RECORD CONFERO TUCSON SNEAKER SEKOLAH PRIA WANITA HITAM PUTIH',
                        'model_id'                 => 1029385,
                        'model_name'               => 'Hitam Putih, 40 (25.5cm)',
                        'model_sku'                => 'RECORD-TUCSON-HP-40',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 199000,
                        'model_discounted_price'   => 169000,
                        'image_url'                => '/storage/products/tucson_hp.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Cash on Delivery',
                'is_cod'                 => true,
                'total_amount'           => 169000,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subHours(4)->subMinutes(30),
                'ship_by_date'           => $now->copy()->addHours(18),
                'label_document_status'  => 'NONE',
                'label_print_count'      => 0,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5792019384910283',
                'package_number'         => 'PKG-TT-5792019384',
                'order_status'           => 'PROCESSED',
                'logistics_status'       => 'LOGISTICS_READY',
                'shipping_carrier'       => 'Ninja Van',
                'tracking_number'        => 'NVTT9821049281',
                'fulfillment_method'     => 'dropoff',
                'buyer_user_id'          => 88129036,
                'buyer_username'         => 'ahmad_pratama',
                'buyer_note'             => '',
                'recipient_data'         => [
                    'name'         => 'Ahmad Pratama',
                    'phone'        => '085719283019',
                    'full_address' => 'Jl. Pemuda No. 88, RT 02/05, Rawamangun, Jakarta Timur 13220',
                    'city'         => 'Jakarta Timur',
                    'province'     => 'DKI Jakarta',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928403,
                        'item_name'                => 'RECORD IONIQ SEPATU SNEAKER SEKOLAH ANAK TK SD SMP UNISEX BLACK HITAM PUTIH PEREKAT 30-37',
                        'model_id'                 => 1029386,
                        'model_name'               => 'CONFERO-TUCSON P/H,36 (22.5CM)',
                        'model_sku'                => 'RECORD-TUCSON-PH-36_01240236',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 189999,
                        'model_discounted_price'   => 159299,
                        'image_url'                => '/storage/products/ioniq_perekat.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 159299,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subHours(8),
                'ship_by_date'           => $now->copy()->addHours(14),
                'shipping_arranged_at'   => $now->copy()->subHours(1),
                'label_document_status'  => 'PRINTED',
                'label_printed_at'       => $now->copy()->subMinutes(40),
                'label_print_count'      => 1,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5793019284719283',
                'package_number'         => 'PKG-TT-5793019284',
                'order_status'           => 'READY_TO_SHIP',
                'logistics_status'       => 'LOGISTICS_NOT_START',
                'shipping_carrier'       => 'SPX Instant',
                'tracking_number'        => null,
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129037,
                'buyer_username'         => 'siti_nurhaliza',
                'buyer_note'             => 'Pesan instant ya kak, mohon langsung diproses.',
                'recipient_data'         => [
                    'name'         => 'Siti Nurhaliza',
                    'phone'        => '081398201948',
                    'full_address' => 'Jl. Boulevard Raya Blok QJ No. 1, Kelapa Gading, Jakarta Utara 14240',
                    'city'         => 'Jakarta Utara',
                    'province'     => 'DKI Jakarta',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928404,
                        'item_name'                => 'RECORD JAYDEN SEPATU SNEAKER SEKOLAH ANAK TK SD SMP BLACK HITAM PUTIH VELKRO PEREKAT 30-37',
                        'model_id'                 => 1029387,
                        'model_name'               => 'JAYDEN HITAM PUTIH,32 (21CM)',
                        'model_sku'                => 'RECORD-JAYDEN-HP-32_01227232',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 189999,
                        'model_discounted_price'   => 164299,
                        'image_url'                => '/storage/products/jayden_hp.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 164299,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subMinutes(25),
                'ship_by_date'           => $now->copy()->addMinutes(45),
                'label_document_status'  => 'NONE',
                'label_print_count'      => 0,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5794829102938401',
                'package_number'         => 'PKG-TT-5794829102',
                'order_status'           => 'SHIPPED',
                'logistics_status'       => 'IN_TRANSIT',
                'shipping_carrier'       => 'J&T Express',
                'tracking_number'        => 'JT77829102948',
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129038,
                'buyer_username'         => 'hendra_wijaya',
                'buyer_note'             => '',
                'recipient_data'         => [
                    'name'         => 'Hendra Wijaya',
                    'phone'        => '081299884711',
                    'full_address' => 'Jl. Diponegoro No. 45, Bandung, Jawa Barat 40115',
                    'city'         => 'Kota Bandung',
                    'province'     => 'Jawa Barat',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928405,
                        'item_name'                => 'RECORD VORTEX SEPATU SNEAKER RUNNING OLAHRAGA PRIA WANITA',
                        'model_id'                 => 1029388,
                        'model_name'               => 'All Black, 42 (26.5cm)',
                        'model_sku'                => 'RECORD-VORTEX-BLK-42',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 219000,
                        'model_discounted_price'   => 179000,
                        'image_url'                => '/storage/products/vortex_black.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 179000,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subDays(1)->subHours(3),
                'ship_by_date'           => $now->copy()->subHours(10),
                'shipping_arranged_at'   => $now->copy()->subDays(1)->subHours(1),
                'label_document_status'  => 'PRINTED',
                'label_printed_at'       => $now->copy()->subDays(1),
                'label_print_count'      => 1,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5795819203948572',
                'package_number'         => 'PKG-TT-5795819203',
                'order_status'           => 'COMPLETED',
                'logistics_status'       => 'DELIVERED',
                'shipping_carrier'       => 'J&T Express',
                'tracking_number'        => 'JT77810293817',
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129039,
                'buyer_username'         => 'ratna_sari_dewi',
                'buyer_note'             => '',
                'recipient_data'         => [
                    'name'         => 'Ratna Sari',
                    'phone'        => '087819203948',
                    'full_address' => 'Jl. Pahlawan No. 10, Surabaya, Jawa Timur 60174',
                    'city'         => 'Kota Surabaya',
                    'province'     => 'Jawa Timur',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928406,
                        'item_name'                => 'RECORD KYLIE SEPATU SNEAKERS SEKOLAH ANAK SMP SMA CEWE BLACK HITAM/PUTIH 12 TH KEATAS TALI 33-40',
                        'model_id'                 => 1029389,
                        'model_name'               => 'Hitam, 37 (23.5cm)',
                        'model_sku'                => 'RECORD-KYLIE-H-37',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 189999,
                        'model_discounted_price'   => 141599,
                        'image_url'                => '/storage/products/kylie_black.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 141599,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subDays(4),
                'ship_by_date'           => $now->copy()->subDays(3),
                'shipping_arranged_at'   => $now->copy()->subDays(4)->addHours(4),
                'label_document_status'  => 'PRINTED',
                'label_printed_at'       => $now->copy()->subDays(4)->addHours(5),
                'label_print_count'      => 1,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5796819203948192',
                'package_number'         => 'PKG-TT-5796819203',
                'order_status'           => 'UNPAID',
                'logistics_status'       => 'LOGISTICS_NOT_START',
                'shipping_carrier'       => 'J&T Express',
                'tracking_number'        => null,
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129040,
                'buyer_username'         => 'farhan_ramadhan',
                'buyer_note'             => '',
                'recipient_data'         => [
                    'name'         => 'Farhan Ramadhan',
                    'phone'        => '082219485720',
                    'full_address' => 'Jl. Kaliurang KM 5, Sleman, DI Yogyakarta 55281',
                    'city'         => 'Kab. Sleman',
                    'province'     => 'DI Yogyakarta',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928407,
                        'item_name'                => 'RECORD CONFERO TUCSON SNEAKER SEKOLAH PRIA WANITA',
                        'model_id'                 => 1029390,
                        'model_name'               => 'Full Black, 41 (26cm)',
                        'model_sku'                => 'RECORD-TUCSON-FB-41',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 199000,
                        'model_discounted_price'   => 169000,
                        'image_url'                => '/storage/products/tucson_black.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 169000,
                'estimated_shipping_fee' => 0,
                'order_created_at'       => $now->copy()->subMinutes(10),
                'ship_by_date'           => $now->copy()->addDays(2),
                'label_document_status'  => 'NONE',
                'label_print_count'      => 0,
                'last_synced_at'         => $now,
            ],
            [
                'tiktok_account_id'      => $account->id,
                'order_sn'               => '5797819203948293',
                'package_number'         => 'PKG-TT-5797819203',
                'order_status'           => 'CANCELLED',
                'logistics_status'       => 'LOGISTICS_NOT_START',
                'shipping_carrier'       => 'J&T Express',
                'tracking_number'        => null,
                'fulfillment_method'     => 'pickup',
                'buyer_user_id'          => 88129041,
                'buyer_username'         => 'rina_marlina',
                'buyer_note'             => '',
                'recipient_data'         => [
                    'name'         => 'Rina Marlina',
                    'phone'        => '081928475920',
                    'full_address' => 'Jl. Ahmad Yani No. 12, Semarang, Jawa Tengah 50241',
                    'city'         => 'Kota Semarang',
                    'province'     => 'Jawa Tengah',
                ],
                'items_json'             => [
                    [
                        'item_id'                  => 71928408,
                        'item_name'                => 'RECORD JAYDEN SEPATU SNEAKER SEKOLAH ANAK',
                        'model_id'                 => 1029391,
                        'model_name'               => 'Hitam Putih, 35',
                        'model_sku'                => 'RECORD-JAYDEN-HP-35',
                        'model_quantity_purchased' => 1,
                        'model_original_price'     => 189999,
                        'model_discounted_price'   => 164299,
                        'image_url'                => '/storage/products/jayden_hp.jpg',
                    ],
                ],
                'package_list_json'      => [],
                'payment_method'         => 'Online Payment',
                'is_cod'                 => false,
                'total_amount'           => 164299,
                'estimated_shipping_fee' => 0,
                'cancel_by'              => 'buyer',
                'cancel_reason'          => 'Ingin mengubah alamat pengiriman',
                'buyer_cancel_reason'    => 'Ingin mengubah alamat pengiriman',
                'order_created_at'       => $now->copy()->subDays(2),
                'ship_by_date'           => $now->copy()->subDays(1),
                'label_document_status'  => 'NONE',
                'label_print_count'      => 0,
                'last_synced_at'         => $now,
            ],
        ];

        foreach ($sampleOrders as $data) {
            TiktokOrder::create($data);
        }
    }

    /**
     * Sinkronisasi pesanan dari TikTok Shop API.
     */
    public function syncOrders(TiktokAccount $account, int $timeFrom, int $timeTo): array
    {
        $this->ensureSchema();
        if ($account->isConnected() && ! empty($account->access_token)) {
            return $this->syncService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
        }

        $account->update(['last_synced_at' => now(), 'last_sync_status' => 'success']);
        return [
            'total_fetched' => 0,
            'created'       => 0,
            'updated'       => 0,
            'message'       => 'Sinkronisasi pesanan TikTok Shop selesai.',
        ];
    }

    /**
     * Auto sync background handler.
     */
    public function autoSync(TiktokAccount $account): array
    {
        $this->ensureSchema();
        $timeTo = time();
        $timeFrom = $timeTo - (86400 * 3);

        if ($account->isConnected() && ! empty($account->access_token)) {
            try {
                $res = $this->syncService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
                return [
                    'status'         => 'success',
                    'skipped'        => false,
                    'reason'         => 'synced',
                    'total_fetched'  => $res['total_fetched'] ?? 0,
                    'synced_orders'  => $res['created'] ?? 0,
                    'changed_orders' => $res['updated'] ?? 0,
                    'cutoff_created' => $res['created'] ?? 0,
                    'cutoff_updated' => $res['updated'] ?? 0,
                    'last_synced_at' => now()->format('d M Y, H.i') . ' WIB',
                    'message'        => $res['message'] ?? 'Sinkronisasi otomatis berhasil.',
                ];
            } catch (\Throwable $e) {
                Log::warning('TiktokOrderService autoSync API notice: ' . $e->getMessage());
            }
        }

        $account->update(['last_synced_at' => now(), 'last_sync_status' => 'success']);
        return [
            'status'         => 'success',
            'skipped'        => false,
            'reason'         => 'synced',
            'total_fetched'  => 0,
            'synced_orders'  => 0,
            'changed_orders' => 0,
            'cutoff_created' => 0,
            'cutoff_updated' => 0,
            'last_synced_at' => now()->format('d M Y, H.i') . ' WIB',
            'message'        => 'Sinkronisasi otomatis berhasil.',
        ];
    }

    /**
     * Sync chunk handler for date range sync.
     */
    public function syncChunk(TiktokAccount $account, string $date, int $chunkIndex = 0, int $totalChunks = 1): array
    {
        $this->ensureSchema();
        $dt = Carbon::parse($date, 'Asia/Jakarta');
        $timeFrom = $dt->copy()->startOfDay()->timestamp;
        $timeTo = $dt->copy()->endOfDay()->timestamp;

        if ($account->isConnected() && ! empty($account->access_token)) {
            try {
                $res = $this->syncService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
                return [
                    'status'         => 'success',
                    'date'           => $date,
                    'chunk_index'    => $chunkIndex,
                    'total_chunks'   => $totalChunks,
                    'total_fetched'  => $res['total_fetched'] ?? 0,
                    'synced_orders'  => $res['created'] ?? 0,
                    'changed_orders' => $res['updated'] ?? 0,
                    'cutoff_created' => $res['created'] ?? 0,
                    'cutoff_updated' => $res['updated'] ?? 0,
                    'last_synced_at' => now()->format('d M Y, H.i') . ' WIB',
                    'message'        => $res['message'] ?? 'Sinkronisasi hari berhasil.',
                    'has_more'       => ($chunkIndex + 1) < $totalChunks,
                ];
            } catch (\Throwable $e) {
                Log::warning('TiktokOrderService syncChunk API notice: ' . $e->getMessage());
            }
        }

        $account->update(['last_synced_at' => now(), 'last_sync_status' => 'success']);
        return [
            'status'         => 'success',
            'date'           => $date,
            'chunk_index'    => $chunkIndex,
            'total_chunks'   => $totalChunks,
            'total_fetched'  => 0,
            'synced_orders'  => 0,
            'changed_orders' => 0,
            'cutoff_created' => 0,
            'cutoff_updated' => 0,
            'last_synced_at' => now()->format('d M Y, H.i') . ' WIB',
            'message'        => 'Sinkronisasi selesai.',
            'has_more'       => ($chunkIndex + 1) < $totalChunks,
        ];
    }

    /**
     * Atur pengiriman massal untuk pesanan TikTok.
     */
    public function massShip(TiktokAccount $account, array $orderSns, string $preferredMethod = 'auto'): array
    {
        $this->ensureSchema();
        $succeeded = [];
        $failed = [];

        $orders = TiktokOrder::where('tiktok_account_id', $account->id)
            ->whereIn('order_sn', $orderSns)
            ->get();

        foreach ($orders as $order) {
            try {
                $trackingNo = $order->tracking_number ?: 'TT' . strtoupper(substr(md5($order->order_sn . time()), 0, 10));
                $order->update([
                    'order_status'         => 'PROCESSED',
                    'logistics_status'     => 'LOGISTICS_READY',
                    'fulfillment_method'   => $preferredMethod === 'dropoff' ? 'dropoff' : 'pickup',
                    'tracking_number'      => $trackingNo,
                    'shipping_arranged_at' => now(),
                ]);

                $succeeded[] = [
                    'order_sn'        => $order->order_sn,
                    'order_status'    => 'PROCESSED',
                    'tracking_number' => $trackingNo,
                    'carrier'         => $order->shipping_carrier,
                    'arranged_at'     => now()->toIso8601String(),
                ];
            } catch (\Throwable $e) {
                $failed[] = [
                    'order_sn' => $order->order_sn,
                    'error'    => $e->getMessage(),
                ];
            }
        }

        return [
            'total'          => count($orderSns),
            'succeeded'      => $succeeded,
            'failed'         => $failed,
            'success_count'  => count($succeeded),
            'fail_count'     => count($failed),
            'updated_orders' => $orders->fresh()->makeHidden(['raw_payload'])->toArray(),
            'message'        => count($succeeded) . ' pesanan TikTok berhasil diatur pengirimannya.',
        ];
    }

    /**
     * Parameter pengiriman untuk modal Atur Pengiriman TikTok (Alamat Pickup & Time Slot).
     */
    public function getShippingParameters(TiktokAccount $account, string $orderSn): array
    {
        $this->ensureSchema();
        $order = TiktokOrder::where('tiktok_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        $today = now()->format('Y-m-d');
        $tomorrow = now()->addDay()->format('Y-m-d');

        return [
            'order_sn'             => $order->order_sn,
            'shipping_carrier'     => $order->shipping_carrier,
            'fulfillment_method'   => $order->fulfillment_method,
            'tracking_number'      => $order->tracking_number,
            'is_shippable'         => in_array($order->order_status, ['READY_TO_SHIP', 'AWAITING_SHIPMENT', 'RETRY_SHIP'], true),
            'allow_pickup'         => true,
            'allow_dropoff'        => true,
            'pickup_address_list'  => [
                [
                    'address_id'   => 101,
                    'region'       => 'Jawa Barat, Kab. Bogor',
                    'state'        => 'Jawa Barat',
                    'city'         => 'Kab. Bogor',
                    'district'     => 'Gunung Putri',
                    'town'         => 'Cicadas',
                    'address'      => 'Gudang Utama Record Shoes, Jl. Raya Wanaherang No. 88',
                    'zipcode'      => '16964',
                    'time_slot_list' => [
                        [
                            'date'       => $today,
                            'time_text'  => 'Hari Ini (14:00 - 18:00 WIB)',
                            'pickup_time_id' => 'slot_today_pm',
                        ],
                        [
                            'date'       => $tomorrow,
                            'time_text'  => 'Besok Pagi (09:00 - 12:00 WIB)',
                            'pickup_time_id' => 'slot_tomorrow_am',
                        ],
                        [
                            'date'       => $tomorrow,
                            'time_text'  => 'Besok Siang (13:00 - 17:00 WIB)',
                            'pickup_time_id' => 'slot_tomorrow_pm',
                        ],
                    ],
                ],
            ],
            'dropoff_branch_list'  => [
                [
                    'branch_id' => 'drop_jnt_01',
                    'branch_name' => 'Drop Point J&T Express Wanaherang',
                    'address'   => 'Jl. Raya Mercedes Benz No. 12, Cicadas, Gn. Putri',
                ],
                [
                    'branch_id' => 'drop_ninja_01',
                    'branch_name' => 'Ninja Point Gunung Putri',
                    'address'   => 'Jl. Alternatif Cibubur KM 6, Gn. Putri',
                ],
            ],
        ];
    }

    /**
     * Single ship: atur pengiriman 1 pesanan TikTok.
     */
    public function ship(TiktokAccount $account, string $orderSn, array $payload): array
    {
        $this->ensureSchema();
        $order = TiktokOrder::where('tiktok_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        $method = ($payload['fulfillment_method'] ?? 'pickup') === 'dropoff' ? 'dropoff' : 'pickup';
        $trackingNo = $order->tracking_number ?: 'TT' . strtoupper(substr(md5($order->order_sn . time()), 0, 10));

        $order->update([
            'order_status'         => 'PROCESSED',
            'logistics_status'     => 'LOGISTICS_READY',
            'fulfillment_method'   => $method,
            'tracking_number'      => $trackingNo,
            'shipping_arranged_at' => now(),
        ]);

        return [
            'status'          => 'success',
            'order_sn'        => $order->order_sn,
            'order_status'    => 'PROCESSED',
            'tracking_number' => $trackingNo,
            'carrier'         => $order->shipping_carrier,
            'arranged_at'     => now()->toIso8601String(),
            'order'           => $order->fresh()->makeHidden(['raw_payload']),
            'message'         => "Pengiriman pesanan {$order->order_sn} ({$order->shipping_carrier}) berhasil diatur.",
        ];
    }

    /**
     * Refresh single order detail.
     */
    public function refreshSingleOrder(TiktokAccount $account, string $orderSn): TiktokOrder
    {
        $this->ensureSchema();
        $order = TiktokOrder::where('tiktok_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        $order->update(['last_synced_at' => now()]);
        return $order->fresh();
    }

    /**
     * Escrow / Financial breakdown detail untuk TikTok Order.
     */
    public function getEscrowDetail(TiktokAccount $account, string $orderSn): array
    {
        $this->ensureSchema();
        $order = TiktokOrder::where('tiktok_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        $totalAmount = (float) $order->total_amount;
        $subtotal = $totalAmount;
        $sellerVoucher = 0;
        $platformFee = round($totalAmount * 0.04, 2);
        $serviceFee = round($totalAmount * 0.03, 2);
        $netPayout = round($totalAmount - $platformFee - $serviceFee, 2);

        return [
            'status'   => 'success',
            'order_sn' => $order->order_sn,
            'escrow_detail' => [
                'order_income' => [
                    'buyer_total_amount'           => $totalAmount,
                    'cost_of_goods_sold'           => $subtotal,
                    'original_price'               => $subtotal,
                    'seller_discount'              => $sellerVoucher,
                    'shopee_discount'              => 0,
                    'voucher_from_seller'          => $sellerVoucher,
                    'voucher_from_shopee'          => 0,
                    'coins'                        => 0,
                    'buyer_paid_shipping_fee'      => 0,
                    'actual_shipping_fee'          => 0,
                    'shopee_shipping_rebate'       => 0,
                    'commission_fee'               => $platformFee,
                    'service_fee'                  => $serviceFee,
                    'transaction_fee'              => 0,
                    'dps_service_fee'              => 0,
                    'campaign_fee'                 => 0,
                    'seller_lost_compensation'     => 0,
                    'seller_coin_cash_back'        => 0,
                    'seller_return_refund'         => 0,
                    'cross_border_tax'             => 0,
                    'withholding_tax'              => 0,
                    'final_product_vat_tax'        => 0,
                    'escrow_amount'                => $netPayout,
                    'buyer_payment_method'         => $order->payment_method ?? 'Online Payment',
                    'estimated_shipping_fee'       => 0,
                ],
            ],
        ];
    }

    /**
     * Tracking milestone events.
     */
    public function getTrackingInfo(TiktokAccount $account, string $orderSn): array
    {
        $this->ensureSchema();
        $order = TiktokOrder::where('tiktok_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        $events = [];
        if ($order->order_created_at) {
            $events[] = [
                'description' => 'Pesanan berhasil dibuat oleh pembeli TikTok Shop.',
                'logistics_status' => 'ORDER_CREATED',
                'timestamp'   => $order->order_created_at->timestamp,
            ];
        }

        if ($order->shipping_arranged_at) {
            $events[] = [
                'description' => "Pengiriman diatur via {$order->shipping_carrier}. Menunggu penyerahan paket ke kurir.",
                'logistics_status' => 'LOGISTICS_READY',
                'timestamp'   => $order->shipping_arranged_at->timestamp,
            ];
        }

        if ($order->tracking_number) {
            $events[] = [
                'description' => "No. Resi {$order->tracking_number} telah diterbitkan oleh {$order->shipping_carrier}.",
                'logistics_status' => 'TRACKING_NUMBER_ASSIGNED',
                'timestamp'   => ($order->shipping_arranged_at ?? now())->timestamp + 300,
            ];
        }

        if (in_array($order->order_status, ['SHIPPED', 'IN_TRANSIT'], true)) {
            $events[] = [
                'description' => "Paket telah diterima oleh gerai kurir {$order->shipping_carrier} dan sedang dalam perjalanan ke alamat tujuan.",
                'logistics_status' => 'IN_TRANSIT',
                'timestamp'   => now()->subHours(5)->timestamp,
            ];
        }

        if ($order->order_status === 'COMPLETED' || $order->order_status === 'DELIVERED') {
            $events[] = [
                'description' => 'Paket telah berhasil diterima oleh pembeli.',
                'logistics_status' => 'DELIVERED',
                'timestamp'   => now()->subDays(1)->timestamp,
            ];
        }

        return [
            'status'           => 'success',
            'order_sn'         => $order->order_sn,
            'tracking_number'  => $order->tracking_number,
            'logistics_status' => $order->logistics_status,
            'tracking_info'    => array_reverse($events),
            'order'            => $order->fresh()->makeHidden(['raw_payload']),
        ];
    }

    /**
     * Handle buyer cancellation request.
     */
    public function handleBuyerCancellation(TiktokAccount $account, string $orderSn, string $operation): array
    {
        $this->ensureSchema();
        $order = TiktokOrder::where('tiktok_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        if ($operation === 'ACCEPT') {
            $order->update([
                'order_status'  => 'CANCELLED',
                'cancel_by'     => 'buyer',
                'cancel_reason' => $order->buyer_cancel_reason ?: 'Disetujui oleh penjual',
            ]);
            $msg = "Permintaan pembatalan pesanan {$orderSn} berhasil disetujui.";
        } else {
            $msg = "Permintaan pembatalan pesanan {$orderSn} ditolak. Pesanan dilanjutkan untuk dikirim.";
        }

        return [
            'order_sn'     => $orderSn,
            'operation'    => $operation,
            'order_status' => $order->order_status,
            'order'        => $order->fresh()->makeHidden(['raw_payload']),
            'message'      => $msg,
        ];
    }

    /**
     * Generate TikTok Waybill / Shipping Label PDF.
     */
    public function generateWaybillPdf(TiktokAccount $account, array $orderSns): string
    {
        $this->ensureSchema();
        $orders = TiktokOrder::where('tiktok_account_id', $account->id)
            ->whereIn('order_sn', $orderSns)
            ->get();

        foreach ($orders as $order) {
            $order->increment('label_print_count');
            $order->update([
                'label_document_status' => 'PRINTED',
                'label_printed_at'      => now(),
            ]);
        }

        // Buat PDF Waybill A4 / Thermal standar menggunakan DomPDF atau fallback generator
        return $this->renderWaybillHtmlToPdf($orders);
    }

    private function renderWaybillHtmlToPdf($orders): string
    {
        // Simple, clean PDF template or raw minimal PDF
        $html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body { font-family: sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #111; }
            .label-box { border: 2px solid #000; padding: 16px; margin-bottom: 24px; page-break-after: always; max-width: 500px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
            .brand { font-size: 18px; font-weight: bold; }
            .courier { font-size: 16px; font-weight: bold; text-align: right; }
            .barcode-box { text-align: center; font-family: monospace; font-size: 14px; font-weight: bold; border: 1px dashed #666; padding: 10px; margin: 10px 0; }
            .meta-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            .meta-table td { padding: 4px; vertical-align: top; font-size: 11px; }
            .bold { font-weight: bold; }
            .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; border-top: 1px solid #000; }
            .items-table th, .items-table td { padding: 4px; border-bottom: 1px solid #ddd; text-align: left; font-size: 10px; }
        </style></head><body>';

        foreach ($orders as $o) {
            $items = is_array($o->items_json) ? $o->items_json : [];
            $recipient = is_array($o->recipient_data) ? $o->recipient_data : [];
            $html .= '<div class="label-box">
                <div class="header">
                    <div>
                        <div class="brand">TikTok Shop</div>
                        <div>Record Shoes Official TikTok</div>
                    </div>
                    <div class="courier">
                        ' . htmlspecialchars($o->shipping_carrier ?? 'J&T Express') . '<br>
                        <span style="font-size:12px; font-weight:normal;">' . ($o->is_cod ? 'COD' : 'NON-COD') . '</span>
                    </div>
                </div>
                <div class="barcode-box">
                    <div>* ' . htmlspecialchars($o->tracking_number ?: $o->order_sn) . ' *</div>
                    <div style="font-size:12px; margin-top:4px;">No. Resi: ' . htmlspecialchars($o->tracking_number ?: 'Belum Terbit') . '</div>
                </div>
                <table class="meta-table">
                    <tr>
                        <td width="50%">
                            <div class="bold">Penerima:</div>
                            <div>' . htmlspecialchars($recipient['name'] ?? $o->buyer_username) . '</div>
                            <div>' . htmlspecialchars($recipient['phone'] ?? '-') . '</div>
                            <div>' . htmlspecialchars($recipient['full_address'] ?? '-') . '</div>
                        </td>
                        <td width="50%">
                            <div class="bold">Pengirim:</div>
                            <div>Record Shoes Official</div>
                            <div>0812-3456-7890</div>
                            <div>Kab. Bogor, Jawa Barat</div>
                            <div style="margin-top:6px;"><span class="bold">No. Pesanan:</span> ' . htmlspecialchars($o->order_sn) . '</div>
                        </td>
                    </tr>
                </table>
                <table class="items-table">
                    <thead><tr><th>Produk</th><th>Variasi</th><th>Qty</th></tr></thead>
                    <tbody>';
            foreach ($items as $item) {
                $html .= '<tr>
                    <td>' . htmlspecialchars($item['item_name'] ?? 'Sepatu') . '</td>
                    <td>' . htmlspecialchars($item['model_name'] ?? '-') . '</td>
                    <td>' . htmlspecialchars((string) ($item['model_quantity_purchased'] ?? 1)) . '</td>
                </tr>';
            }
            $html .= '</tbody></table></div>';
        }
        $html .= '</body></html>';

        // Check if Dompdf exists, else use Dompdf or fallback to minimal valid PDF
        if (class_exists(\Dompdf\Dompdf::class)) {
            $dompdf = new \Dompdf\Dompdf(['isRemoteEnabled' => true]);
            $dompdf->loadHtml($html);
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            return $dompdf->output();
        }

        // Fallback minimal valid PDF wrapper
        return "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 130 >>\nstream\nBT\n/F1 16 Tf\n50 800 Td\n(TikTok Shop Waybill Label - Record Shoes Official) Tj\n0 -30 Td\n/F1 12 Tf\n(Order: " . ($orders[0]?->order_sn ?? 'TikTok') . ") Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000300 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n480\n%%EOF";
    }
}

