<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\CutOffReturn;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Models\ShopeeProduct;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class ShopeeSyncService
{
    private string $host;

    /** @var array<string, bool> */
    private array $cutOffColumnCache = [];

    public function __construct()
    {
        $this->host = config('services.shopee.host', 'https://partner.shopeemobile.com');
    }

    private function hasCutOffColumn(string $column): bool
    {
        return $this->cutOffColumnCache[$column] ??= Schema::hasColumn('cut_off_orders', $column);
    }

    /**
     * Normalisasi SKU agar tidak menyimpan placeholder seperti '0', '-', '@', 'null', dll.
     */
    public static function normalizeSku(?string $sku): ?string
    {
        if ($sku === null) {
            return null;
        }
        $trimmed = trim($sku);
        if ($trimmed === '' || $trimmed === '0' || $trimmed === '-' || $trimmed === '--' || $trimmed === '---' || $trimmed === '@' || $trimmed === '.') {
            return null;
        }
        $lower = strtolower($trimmed);
        if (in_array($lower, ['null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku', 'tanpa_sku'], true)) {
            return null;
        }
        return $trimmed;
    }

    /**
     * Generate Shopee OAuth authorization URL.
     */
    public function getAuthorizationUrl(ShopeeAccount $account, string $redirectUrl): string
    {
        $partnerId  = $account->partner_id;
        $partnerKey = $account->partner_key;

        if (empty($partnerId) || empty($partnerKey)) {
            throw new RuntimeException('Partner ID dan Partner Key belum diisi.');
        }

        $path      = '/api/v2/shop/auth_partner';
        $timestamp = time();
        $baseStr   = sprintf('%s%s%s', $partnerId, $path, $timestamp);
        $sign      = hash_hmac('sha256', $baseStr, $partnerKey);

        return sprintf(
            '%s%s?partner_id=%s&timestamp=%s&sign=%s&redirect=%s',
            $this->host,
            $path,
            $partnerId,
            $timestamp,
            $sign,
            urlencode($redirectUrl)
        );
    }

    /**
     * Exchange auth code for access_token and refresh_token.
     */
    public function exchangeCode(ShopeeAccount $account, string $code, string $shopId): ShopeeAccount
    {
        $partnerId  = $account->partner_id;
        $partnerKey = $account->partner_key;

        $path      = '/api/v2/auth/token/get';
        $timestamp = time();
        $baseStr   = sprintf('%s%s%s', $partnerId, $path, $timestamp);
        $sign      = hash_hmac('sha256', $baseStr, $partnerKey);

        $url = sprintf(
            '%s%s?partner_id=%s&timestamp=%s&sign=%s',
            $this->host,
            $path,
            $partnerId,
            $timestamp,
            $sign
        );

        $response = Http::timeout(15)->post($url, [
            'code'       => $code,
            'partner_id' => (int) $partnerId,
            'shop_id'    => (int) $shopId,
        ]);

        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $err = $data['message'] ?? ($data['error'] ?? 'Gagal menukar kode otorisasi');
            $account->update([
                'connection_status' => 'error',
                'last_sync_error'   => $err,
            ]);
            throw new RuntimeException("Shopee Auth Error: {$err}");
        }

        $expiresIn = $data['expires_in'] ?? 14400;

        $account->update([
            'shop_id'           => $shopId,
            'access_token'      => $data['access_token'] ?? null,
            'refresh_token'     => $data['refresh_token'] ?? null,
            'token_expires_at'  => now()->addSeconds($expiresIn),
            'connection_status' => 'connected',
            'last_sync_error'   => null,
        ]);

        return $account->fresh();
    }

    /**
     * Refresh access token using refresh_token.
     */
    public function refreshAccessToken(ShopeeAccount $account): ShopeeAccount
    {
        $partnerId    = $account->partner_id;
        $partnerKey   = $account->partner_key;
        $refreshToken = $account->refresh_token;
        $shopId       = $account->shop_id;

        if (empty($refreshToken) || empty($shopId)) {
            $account->update(['connection_status' => 'expired']);
            throw new RuntimeException('Refresh token atau Shop ID tidak tersedia.');
        }

        $path      = '/api/v2/auth/access_token/get';
        $timestamp = time();
        $baseStr   = sprintf('%s%s%s', $partnerId, $path, $timestamp);
        $sign      = hash_hmac('sha256', $baseStr, $partnerKey);

        $url = sprintf(
            '%s%s?partner_id=%s&timestamp=%s&sign=%s',
            $this->host,
            $path,
            $partnerId,
            $timestamp,
            $sign
        );

        $response = Http::timeout(15)->post($url, [
            'refresh_token' => $refreshToken,
            'partner_id'    => (int) $partnerId,
            'shop_id'       => (int) $shopId,
        ]);

        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $err = $data['message'] ?? ($data['error'] ?? 'Gagal me-refresh token Shopee');
            $account->update([
                'connection_status' => 'error',
                'last_sync_error'   => $err,
            ]);
            throw new RuntimeException("Shopee Token Refresh Error: {$err}");
        }

        $expiresIn = $data['expires_in'] ?? 14400;

        $account->update([
            'access_token'      => $data['access_token'] ?? $account->access_token,
            'refresh_token'     => $data['refresh_token'] ?? $refreshToken,
            'token_expires_at'  => now()->addSeconds($expiresIn),
            'connection_status' => 'connected',
            'last_sync_error'   => null,
        ]);

        return $account->fresh();
    }

    /**
     * Get Shop Info from Shopee API v2 to verify credentials and shop status.
     */
    public function getShopInfo(ShopeeAccount $account): array
    {
        $path        = '/api/v2/shop/get_shop_info';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);

        $response = Http::timeout(15)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $err = $data['message'] ?? ($data['error'] ?? 'Gagal mengambil informasi toko Shopee');
            throw new RuntimeException("Shopee API Error: {$err}");
        }

        $shopData = $data['response'] ?? [];

        if (! empty($shopData['shop_name'])) {
            $account->update(['account_name' => $shopData['shop_name']]);
        }

        return $shopData;
    }

    /**
     * Test connection to Shopee API.
     */
    public function testConnection(ShopeeAccount $account): array
    {
        if (empty($account->partner_id) || empty($account->partner_key)) {
            return ['success' => false, 'message' => 'Partner ID atau Partner Key belum diisi.'];
        }

        if (empty($account->access_token)) {
            return ['success' => false, 'message' => 'Toko belum dihubungkan (Access Token kosong). Silakan klik tombol "Hubungkan Toko Shopee" terlebih dahulu.'];
        }

        try {
            $shopInfo = $this->getShopInfo($account);
            $shopName = $shopInfo['shop_name'] ?? $account->account_name ?? 'Toko Shopee';
            $shopId   = $account->shop_id ?: '-';

            $account->update(['connection_status' => 'connected', 'last_sync_error' => null]);
            return ['success' => true, 'message' => "Koneksi ke Shopee API berhasil! Toko '{$shopName}' (ID: {$shopId}) terhubung normal."];
        } catch (\Exception $e) {
            $account->update(['connection_status' => 'error', 'last_sync_error' => $e->getMessage()]);
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Synchronize Shopee orders directly into CutOffOrder and shopee_orders tables.
     */
    public function syncOrdersToCutOff(
        ShopeeAccount $account,
        ?int $timeFrom = null,
        ?int $timeTo = null,
        bool $includeUpdateWindow = false
    ): array {
        $timeTo = $timeTo ?: time();
        $timeFrom = $timeFrom ?: ($timeTo - (14 * 86400)); // Default last 14 days
        if ($timeTo < $timeFrom) {
            [$timeFrom, $timeTo] = [$timeTo, $timeFrom];
        }

        $account = $this->ensureValidToken($account);

        // 1. Fetch Order List in 14-day chunks to respect Shopee's 15-day range limit
        $maxWindow   = 14 * 86400;
        $allOrderSns = [];
        $currentTo   = $timeTo;

        while ($currentTo > $timeFrom) {
            $currentFrom = max($timeFrom, $currentTo - $maxWindow);
            $chunkList   = $this->fetchOrderListRaw($account, $currentFrom, $currentTo, 100, null, 'create_time');

            foreach ($chunkList as $ord) {
                if (! empty($ord['order_sn'])) {
                    $allOrderSns[(string) $ord['order_sn']] = true;
                }
            }

            $currentTo = $currentFrom;
        }

        if ($includeUpdateWindow) {
            // 1b. Fetch Order List by update_time to capture status changes on older orders
            $updateTo = $timeTo;
            while ($updateTo > $timeFrom) {
                $updateFrom      = max($timeFrom, $updateTo - $maxWindow);
                $updateChunkList = $this->fetchOrderListRaw($account, $updateFrom, $updateTo, 100, null, 'update_time');

                foreach ($updateChunkList as $ord) {
                    if (! empty($ord['order_sn'])) {
                        $allOrderSns[(string) $ord['order_sn']] = true;
                    }
                }

                $updateTo = $updateFrom;
            }

            // 1c. Monitor active local orders (max 50 oldest-synced)
            if (Schema::hasTable('shopee_orders')) {
                $activeLocalSns = ShopeeOrder::where('shopee_account_id', $account->id)
                    ->whereIn('order_status', ['UNPAID', 'READY_TO_SHIP', 'RETRY_SHIP', 'PROCESSED', 'IN_CANCEL'])
                    ->orderByRaw('CASE WHEN last_synced_at IS NULL THEN 0 ELSE 1 END ASC, last_synced_at ASC')
                    ->limit(50)
                    ->pluck('order_sn');

                foreach ($activeLocalSns as $activeSn) {
                    $snStr = trim((string) $activeSn);
                    if ($snStr !== '') {
                        $allOrderSns[$snStr] = true;
                    }
                }
            }
        }

        $orderSns = array_keys($allOrderSns);

        if (empty($orderSns)) {
            $account->update([
                'last_synced_at'   => now(),
                'last_sync_status' => 'success',
                'last_sync_error'  => null,
            ]);

            return [
                'total_fetched'  => 0,
                'created'        => 0,
                'updated'        => 0,
                'shopee_synced'  => 0,
                'shopee_changed' => 0,
                'message'        => 'Tidak ada pesanan Shopee pada rentang waktu tersebut.',
            ];
        }

        // 2. Fetch Order Details and Escrow Details in concurrent batches (50 orders per chunk)
        $chunks = array_chunk($orderSns, 50);
        $detailedOrders = [];
        $escrowMap = [];

        $poolBatches = array_chunk($chunks, 6);
        foreach ($poolBatches as $batchGroup) {
            $escrowUrl = $this->buildEscrowUrl($account);
            $responses = Http::pool(function (Pool $pool) use ($account, $batchGroup, $escrowUrl) {
                $reqs = [];
                foreach ($batchGroup as $idx => $chunk) {
                    $orderUrl  = $this->buildOrderDetailUrl($account, $chunk);
                    $reqs["order_{$idx}"]  = $pool->as("order_{$idx}")->timeout(20)->get($orderUrl);
                    $reqs["escrow_{$idx}"] = $pool->as("escrow_{$idx}")->timeout(20)->asJson()->post($escrowUrl, [
                        'order_sn_list' => array_values($chunk),
                    ]);
                }
                return $reqs;
            });

            foreach ($responses as $key => $response) {
                if ($response instanceof Response && $response->successful()) {
                    $data = $response->json();
                    if (str_starts_with((string) $key, 'order_')) {
                        if (! empty($data['response']['order_list'])) {
                            $detailedOrders = array_merge($detailedOrders, $data['response']['order_list']);
                        }
                    } elseif (str_starts_with((string) $key, 'escrow_')) {
                        if (! empty($data['error'])) {
                            Log::warning('Shopee Escrow Pool Error: ' . ($data['message'] ?? $data['error']));
                        }
                        if (is_array($data)) {
                            $escrowMap = array_replace($escrowMap, $this->parseEscrowBatchResponse($data));
                        }
                    }
                } elseif ($response instanceof Response && $response->failed()) {
                    Log::warning("Shopee pool {$key} HTTP {$response->status()}: " . substr((string) $response->body(), 0, 200));
                }
            }
        }

        // Fallback jika Http::pool order gagal: panggil berurutan
        if (empty($detailedOrders) && ! empty($orderSns)) {
            foreach ($chunks as $chunk) {
                $details = $this->fetchOrderDetailRaw($account, $chunk);
                $detailedOrders = array_merge($detailedOrders, $details);
            }
        }

        // Fallback jika Http::pool escrow gagal: panggil berurutan
        if (empty($escrowMap) && ! empty($orderSns)) {
            Log::info('Shopee escrowMap kosong dari Http::pool, mencoba fetchEscrowDetailBatch berurutan...');
            foreach ($chunks as $chunk) {
                $escrows = $this->fetchEscrowDetailBatch($account, $chunk);
                $escrowMap = array_replace($escrowMap, $escrows);
            }
        }

        if (empty($detailedOrders)) {
            $account->update([
                'last_synced_at'   => now(),
                'last_sync_status' => 'success',
                'last_sync_error'  => null,
            ]);

            return [
                'total_fetched'  => 0,
                'created'        => 0,
                'updated'        => 0,
                'shopee_synced'  => 0,
                'shopee_changed' => 0,
                'message'        => 'Tidak ada pesanan Shopee pada rentang waktu tersebut.',
            ];
        }

        return $this->ingestDetailedOrdersToCutOff($account, $detailedOrders, $escrowMap, true);
    }

    /**
     * Simpan/perbarui daftar detailed order Shopee ke tabel cut_off_orders dan shopee_orders
     * dengan tetap menerapkan rumus Est. Bersih (Subtotal - Voucher Penjual) * 79%.
     *
     * @param  array<int, array<string, mixed>>  $detailedOrders
     * @param  array<string, array<string, mixed>>  $escrowMap
     * @return array{total_fetched: int, created: int, updated: int, shopee_synced: int, shopee_changed: int, message: string}
     */
    public function ingestDetailedOrdersToCutOff(
        ShopeeAccount $account,
        array $detailedOrders,
        array $escrowMap = [],
        bool $fetchMissingEscrow = true
    ): array {
        $allOrderSnsToSave = [];
        foreach ($detailedOrders as $o) {
            if (! empty($o['order_sn'])) {
                $allOrderSnsToSave[] = $o['order_sn'];
            }
        }

        if (empty($allOrderSnsToSave)) {
            $account->update([
                'last_synced_at'   => now(),
                'last_sync_status' => 'success',
                'last_sync_error'  => null,
            ]);

            return [
                'total_fetched'  => count($detailedOrders),
                'created'        => 0,
                'updated'        => 0,
                'shopee_synced'  => 0,
                'shopee_changed' => 0,
                'message'        => 'Tidak ada pesanan Shopee untuk disinkronkan.',
            ];
        }

        // Ambil rincian escrow secara paralel (Http::pool) untuk pesanan yang belum terambil di escrowMap
        // Chunk kecil (5) agar tidak terkena rate limit QPS Shopee pada endpoint get_escrow_detail
        if ($fetchMissingEscrow) {
            $missingEscrowSns = array_values(array_diff($allOrderSnsToSave, array_keys($escrowMap)));
            if (! empty($missingEscrowSns)) {
                $chunksMissing = array_chunk($missingEscrowSns, 5);
                foreach ($chunksMissing as $snBatch) {
                    try {
                        $poolResponses = Http::pool(function (Pool $pool) use ($account, $snBatch) {
                            $reqs = [];
                            foreach ($snBatch as $sn) {
                                $url = $this->buildSingleEscrowUrl($account, (string) $sn);
                                $reqs[$sn] = $pool->as((string) $sn)->timeout(15)->get($url);
                            }
                            return $reqs;
                        });

                        foreach ($poolResponses as $sn => $res) {
                            if ($res instanceof Response && $res->successful()) {
                                $data = $res->json();
                                if (! empty($data['error'])) {
                                    Log::warning("Shopee single escrow error ({$sn}): " . ($data['message'] ?? $data['error']));
                                    continue;
                                }
                                $parsed = $this->parseSingleEscrowResponse(is_array($data) ? $data : []);
                                if (! empty($parsed)) {
                                    $escrowMap[$sn] = $parsed;
                                }
                            } elseif ($res instanceof Response) {
                                Log::warning("Shopee single escrow HTTP {$res->status()} ({$sn})");
                            }
                        }
                    } catch (\Throwable $e) {
                        Log::warning('Shopee parallel single escrow pool warning: ' . $e->getMessage());
                    }
                }
            }
        }

        // 3. Ingest into CutOffOrder table (Optimized: 1 Single Preload Query + DB Transaction)
        $this->ensureSchema();
        $this->cutOffColumnCache = [];
        $hasCancelBy             = $this->hasCutOffColumn('cancel_by');
        $hasCancelReason         = $this->hasCutOffColumn('cancel_reason');
        $hasFinancialBreakdown   = $this->hasCutOffColumn('financial_breakdown');

        $existingOrders = CutOffOrder::whereIn('order_number', $allOrderSnsToSave)
            ->get()
            ->keyBy('order_number');

        $createdCount = 0;
        $updatedCount = 0;
        $orderRecorder = app(ShopeeOrderRecorder::class);

        \Illuminate\Support\Facades\DB::transaction(function () use (
            $account, $detailedOrders, $existingOrders, &$escrowMap, $fetchMissingEscrow,
            $hasCancelBy, $hasCancelReason, $hasFinancialBreakdown, $orderRecorder,
            &$createdCount, &$updatedCount
        ) {
            foreach ($detailedOrders as $order) {
                $orderSn = $order['order_sn'] ?? null;
                if (! $orderSn) continue;

                // 1. Extract item list from root or package_list
                $items = $order['item_list'] ?? [];
                if (empty($items) && ! empty($order['package_list'])) {
                    foreach ($order['package_list'] as $pkg) {
                        if (! empty($pkg['item_list'])) {
                            $items = array_merge($items, $pkg['item_list']);
                        }
                    }
                }
                $firstItem = $items[0] ?? [];

                // 2. Extract total quantity
                $totalQty = 0;
                foreach ($items as $it) {
                    $totalQty += (int) ($it['model_quantity_purchased'] ?? $it['quantity_purchased'] ?? $it['model_quantity'] ?? 1);
                }
                if ($totalQty <= 0) $totalQty = 1;

                // 3. Extract shipping courier from root or package_list
                $shippingCourier = $order['shipping_carrier'] ?? null;
                if (empty($shippingCourier) && ! empty($order['package_list'])) {
                    foreach ($order['package_list'] as $pkg) {
                        if (! empty($pkg['shipping_carrier'])) {
                            $shippingCourier = $pkg['shipping_carrier'];
                            break;
                        }
                    }
                }

                // 4. Calculate total amount / net income
                // Rumus ERP: Est. Bersih = (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
                // Jika Voucher Ditanggung Penjual = 0, maka (Subtotal Pesanan - 0) * 79%
                $escrowIncome = $escrowMap[$orderSn] ?? [];
                if ($fetchMissingEscrow && empty($escrowIncome)) {
                    /** @var \App\Models\ShopeeAccount $account */
                    $escrowIncome = $this->fetchSingleEscrowDetail($account, $orderSn);
                    if (! empty($escrowIncome)) {
                        $escrowMap[$orderSn] = $escrowIncome;
                    }
                }

                $orderForCalc = $order;
                if (empty($orderForCalc['item_list']) && ! empty($items)) {
                    $orderForCalc['item_list'] = $items;
                }
                $calc          = $this->calculateNetIncome($orderForCalc, $escrowIncome);
                $calculatedNet = $calc['est_net_income'];

                // 5. Determine order status, payment method, and cancellation details
                $rawStatus  = (string) ($order['order_status'] ?? '');
                $statusText = $this->mapOrderStatus($rawStatus);

                // Deteksi metode pembayaran & status COD
                $rawPayment = (string) ($order['payment_method'] ?? '');
                $isCod = ! empty($order['cod'])
                    || stripos($rawPayment, 'cash on delivery') !== false
                    || stripos($rawPayment, 'cod') !== false;

                if ($isCod) {
                    $paymentMethod = 'COD (Bayar di Tempat)';
                    if ($statusText === 'Belum Bayar' || $rawStatus === 'UNPAID') {
                        $statusText = 'Perlu Dikirim [COD]';
                    } elseif ($statusText === 'Perlu Dikirim') {
                        $statusText = 'Perlu Dikirim [COD]';
                    }
                } else {
                    $paymentMethod = $rawPayment ?: 'Non-COD (Lunas Online)';
                }

                $cancelByLabel = $orderRecorder->formatCancelByLabel(isset($order['cancel_by']) ? (string) $order['cancel_by'] : null);
                $cancelReason = ! empty($order['cancel_reason']) ? trim((string) $order['cancel_reason']) : null;

                // Status mapping: JANGAN ubah jika status resmi Shopee sudah 'CANCELLED' (Batal)
                $statusText = $this->applyPackageLogisticsStatus(
                    $rawStatus,
                    $statusText,
                    is_array($order['package_list'] ?? null) ? $order['package_list'] : null
                );

                // Hitung Keuangan:
                // est_net_income: SELALU menyimpan nilai rumus resmi (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79% (sama persis dengan spreadsheet admin)
                // marketplace_net_payout: pencairan aktual (0 jika Batal, atau nilai escrow riil jika sudah ada)
                $keteranganSolutif = null;
                $estNet            = $calculatedNet;
                $netPayout         = $calculatedNet;

                if ($statusText === 'Batal') {
                    $netPayout = 0; // Pesanan batal pencairan riil marketplace adalah 0
                    if ($cancelReason) {
                        $keteranganSolutif = $cancelByLabel ? "[{$cancelByLabel}] {$cancelReason}" : $cancelReason;
                    } elseif ($cancelByLabel) {
                        $keteranganSolutif = "Dibatalkan oleh {$cancelByLabel}";
                    } else {
                        $keteranganSolutif = 'Pesanan Dibatalkan';
                    }
                } elseif (! empty($escrowIncome['escrow_amount'])) {
                    $netPayout = (float) $escrowIncome['escrow_amount'];
                }

                $orderDate = ! empty($order['create_time'])
                    ? \Carbon\Carbon::createFromTimestamp((int) $order['create_time'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                    : now('Asia/Jakarta')->format('Y-m-d H:i:s');
                $shipByDate = ! empty($order['ship_by_date'])
                    ? \Carbon\Carbon::createFromTimestamp((int) $order['ship_by_date'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                    : null;

                $existing = $existingOrders->get($orderSn);

                $variationName = ! empty($firstItem['model_name']) ? trim((string) $firstItem['model_name']) : null;
                if (count($items) > 1 && $variationName) {
                    $variationName .= ' (+' . (count($items) - 1) . ' item)';
                }

                $payload = [
                    'order_date'             => $orderDate,
                    'ship_by_date'           => $shipByDate,
                    'channel'                => 'SH',
                    'order_number'           => $orderSn,
                    'buyer_username'         => $order['buyer_username'] ?? $order['buyer_user_id'] ?? null,
                    'shipping_courier'       => $shippingCourier,
                    'payment_method'         => $paymentMethod,
                    'sku_utama'              => self::normalizeSku(isset($firstItem['model_sku']) ? (string) $firstItem['model_sku'] : null)
                        ?? self::normalizeSku(isset($firstItem['item_sku']) ? (string) $firstItem['item_sku'] : null),
                    'product_name'           => $firstItem['item_name'] ?? 'Produk Shopee',
                    'variation_name'         => $variationName,
                    'qty'                    => $totalQty,
                    'package_count'          => count($items) ?: 1,
                    'order_status'           => $statusText,
                    'keterangan_solutif'     => $keteranganSolutif,
                    'est_net_income'         => $estNet,
                    'marketplace_net_payout' => $netPayout,
                ];

                if ($hasCancelBy) {
                    $payload['cancel_by'] = $cancelByLabel;
                }
                if ($hasCancelReason) {
                    $payload['cancel_reason'] = $cancelReason;
                }
                if ($hasFinancialBreakdown) {
                    $payload['financial_breakdown'] = $calc['breakdown'];
                }

                if ($existing) {
                    // Update existing record (including exact order_date with time, qty, package_count, financial_breakdown)
                    $updateData = [
                        'order_date'             => $orderDate,
                        'order_status'           => $statusText,
                        'shipping_courier'       => $shippingCourier ?: $existing->shipping_courier,
                        'payment_method'         => $paymentMethod,
                        'est_net_income'         => $estNet,
                        'marketplace_net_payout' => $netPayout,
                        'keterangan_solutif'     => $keteranganSolutif ?: $existing->keterangan_solutif,
                        'sku_utama'              => $payload['sku_utama'] ?: self::normalizeSku($existing->sku_utama),
                        'product_name'           => $payload['product_name'] ?: $existing->product_name,
                        'variation_name'         => $payload['variation_name'] ?: $existing->variation_name,
                        'qty'                    => $totalQty,
                        'package_count'          => $payload['package_count'],
                    ];

                    if ($shipByDate) {
                        $updateData['ship_by_date'] = $shipByDate;
                    }

                    if ($hasCancelBy) {
                        $updateData['cancel_by'] = $cancelByLabel ?: $existing->cancel_by;
                    }
                    if ($hasCancelReason) {
                        $updateData['cancel_reason'] = $cancelReason ?: $existing->cancel_reason;
                    }
                    if ($hasFinancialBreakdown) {
                        $updateData['financial_breakdown'] = $calc['breakdown'];
                    }

                    $existing->update($updateData);
                    $updatedCount++;
                } else {
                    CutOffOrder::create($payload);
                    $createdCount++;
                }
            }
        });

        $shopeeStats = $orderRecorder->upsertFromDetails($account, $detailedOrders);

        $account->update([
            'last_synced_at'   => now(),
            'last_sync_status' => 'success',
            'last_sync_error'  => null,
        ]);

        return [
            'total_fetched'  => count($detailedOrders),
            'created'        => $createdCount,
            'updated'        => $updatedCount,
            'shopee_synced'  => $shopeeStats['synced'],
            'shopee_changed' => $shopeeStats['changed'],
            'message'        => "Sinkronisasi berhasil! {$createdCount} pesanan baru ditambahkan, {$updatedCount} diperbarui.",
        ];
    }

    /**
     * Sinkronkan perubahan status & kurir 1 pesanan Shopee dari Pesanan Saya ke cut_off_orders.
     */
    public function syncOrderStatusToCutOff(
        string $orderSn,
        string $rawStatus,
        ?string $shippingCourier = null,
        ?array $packageList = null,
        ?string $cancelBy = null,
        ?string $cancelReason = null
    ): void {
        $existing = CutOffOrder::where('channel', 'SH')
            ->where('order_number', $orderSn)
            ->first();

        if (! $existing) {
            return;
        }

        $statusText = $this->mapOrderStatus($rawStatus);

        $existingPayment = (string) $existing->payment_method;
        $isExplicitNonCod = stripos($existingPayment, 'non-cod') !== false
            || stripos($existingPayment, 'non cod') !== false;
        $isCod = ! $isExplicitNonCod && (
            stripos($existingPayment, 'cod') !== false
            || stripos($existingPayment, 'cash on delivery') !== false
            || ($existingPayment === '' && str_contains((string) $existing->order_status, '[COD]'))
        );

        if ($isCod && ($statusText === 'Perlu Dikirim' || $statusText === 'Belum Bayar' || strtoupper($rawStatus) === 'UNPAID')) {
            $statusText = 'Perlu Dikirim [COD]';
        }

        $statusText = $this->applyPackageLogisticsStatus($rawStatus, $statusText, $packageList);

        $updates = [
            'order_status' => $statusText,
        ];

        if (! empty($shippingCourier)) {
            $updates['shipping_courier'] = $shippingCourier;
        }

        if ($statusText === 'Batal') {
            $cancelBy = app(ShopeeOrderRecorder::class)->formatCancelByLabel($cancelBy);
            $cancelReason = $cancelReason !== null && trim($cancelReason) !== '' ? trim($cancelReason) : null;
            $updates['marketplace_net_payout'] = 0;
            if (! empty($cancelReason)) {
                $updates['keterangan_solutif'] = $cancelBy ? "[{$cancelBy}] {$cancelReason}" : $cancelReason;
            } elseif (! empty($cancelBy)) {
                $updates['keterangan_solutif'] = "Dibatalkan oleh {$cancelBy}";
            } elseif (empty($existing->keterangan_solutif)) {
                $updates['keterangan_solutif'] = 'Pesanan Dibatalkan';
            }
            if ($this->hasCutOffColumn('cancel_by') && $cancelBy) {
                $updates['cancel_by'] = $cancelBy;
            }
            if ($this->hasCutOffColumn('cancel_reason') && $cancelReason) {
                $updates['cancel_reason'] = $cancelReason;
            }
        }

        $existing->update($updates);
    }

    /**
     * Terapkan pembaruan status dari logistics_status pada package_list jika pesanan tidak dibatalkan.
     */
    private function applyPackageLogisticsStatus(string $rawStatus, string $statusText, ?array $packageList): string
    {
        if (strtoupper($rawStatus) === 'CANCELLED' || $statusText === 'Batal' || empty($packageList)) {
            return $statusText;
        }

        foreach ($packageList as $pkg) {
            $logStatus = strtoupper((string) ($pkg['logistics_status'] ?? ''));
            if ($logStatus === 'LOGISTICS_DELIVERED') {
                return 'Selesai';
            }
            if ($logStatus === 'LOGISTICS_PICKUP_DONE') {
                if (str_contains($statusText, 'Perlu Dikirim') || $statusText === 'Diproses' || empty($statusText)) {
                    return 'Dikirim';
                }
                return $statusText;
            }
        }

        return $statusText;
    }

    /**
     * Map Shopee status code to clean user-friendly text.
     */
    private function mapOrderStatus(string $shopeeStatus): string
    {
        return match (strtoupper($shopeeStatus)) {
            'UNPAID'              => 'Belum Bayar',
            'READY_TO_SHIP'       => 'Perlu Dikirim',
            'PROCESSED'           => 'Diproses',
            'RETRY_SHIP'          => 'Kirim Ulang',
            'SHIPPED'             => 'Dikirim',
            'TO_CONFIRM_RECEIVE'  => 'Tiba di Tujuan',
            'COMPLETED'           => 'Selesai',
            'IN_CANCEL'           => 'Pengajuan Batal',
            'CANCELLED'           => 'Batal',
            'TO_RETURN'           => 'RJ (Retur)',
            default               => $shopeeStatus ?: 'Normal',
        };
    }

    /**
     * Fetch raw order list from Shopee API v2 (supports cursor pagination).
     */
    public function fetchOrderListRaw(
        ShopeeAccount $account,
        int $timeFrom,
        int $timeTo,
        int $pageSize = 100,
        ?string $orderStatus = null,
        string $timeRangeField = 'create_time'
    ): array {
        $path              = '/api/v2/order/get_order_list';
        $accessToken       = (string) ($account->access_token ?? '');
        $shopId            = (int) $account->shop_id;
        $partnerId         = (int) $account->partner_id;
        $partnerKey        = (string) $account->partner_key;
        $resolvedTimeField = in_array($timeRangeField, ['create_time', 'update_time'], true) ? $timeRangeField : 'create_time';

        $allOrders = [];
        $cursor    = '';

        do {
            $timestamp = time();
            $baseStr   = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
            $sign      = hash_hmac('sha256', $baseStr, $partnerKey);

            $queryParams = [
                'partner_id'       => $partnerId,
                'timestamp'        => $timestamp,
                'sign'             => $sign,
                'access_token'     => $accessToken,
                'shop_id'          => $shopId,
                'time_range_field' => $resolvedTimeField,
                'time_from'        => $timeFrom,
                'time_to'          => $timeTo,
                'page_size'        => $pageSize,
            ];

            if (! empty($orderStatus)) {
                $queryParams['order_status'] = $orderStatus;
            }

            if (! empty($cursor)) {
                $queryParams['cursor'] = $cursor;
            }

            $url = $this->host . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(25)->get($url);
            $data = $response->json();

            if ($response->failed() || ! empty($data['error'])) {
                throw new RuntimeException('Shopee API Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil order list'));
            }

            $resList = $data['response']['order_list'] ?? [];
            foreach ($resList as $item) {
                $allOrders[] = $item;
            }

            $hasMore = ! empty($data['response']['more']);
            $cursor  = (string) ($data['response']['next_cursor'] ?? '');
        } while ($hasMore && ! empty($cursor));

        return $allOrders;
    }

    /**
     * Build signed URL for get_order_detail.
     */
    public function buildOrderDetailUrl(ShopeeAccount $account, array $orderSns, ?string $optionalFields = null): string
    {
        $path        = '/api/v2/order/get_order_detail';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $defaultOptionalFields = 'buyer_user_id,buyer_username,recipient_address,item_list,package_list,shipping_carrier,total_amount,cancel_by,cancel_reason,buyer_cancel_reason,payment_info,payment_method,ship_by_date,message_to_seller,note,estimated_shipping_fee,cod';

        $queryParams = [
            'partner_id'               => $partnerId,
            'timestamp'                => $timestamp,
            'sign'                     => $sign,
            'access_token'             => $accessToken,
            'shop_id'                  => $shopId,
            'order_sn_list'            => implode(',', $orderSns),
            'response_optional_fields' => ! empty($optionalFields) ? $optionalFields : $defaultOptionalFields,
        ];

        return $this->host . $path . '?' . http_build_query($queryParams);
    }

    /**
     * Fetch raw order details in batch from Shopee API v2.
     */
    public function fetchOrderDetailRaw(ShopeeAccount $account, array $orderSns, ?string $optionalFields = null): array
    {
        if (empty($orderSns)) return [];

        $url = $this->buildOrderDetailUrl($account, $orderSns, $optionalFields);

        $response = Http::timeout(25)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            throw new RuntimeException('Shopee Detail Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil detail order'));
        }

        return $data['response']['order_list'] ?? [];
    }

    /**
     * Build signed URL for get_escrow_detail_batch (POST request).
     */
    public function buildEscrowUrl(ShopeeAccount $account): string
    {
        $path        = '/api/v2/payment/get_escrow_detail_batch';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
        ];

        return $this->host . $path . '?' . http_build_query($queryParams);
    }

    /**
     * Fetch escrow details in batch from Shopee API v2 to retrieve seller voucher & payout data.
     */
    public function fetchEscrowDetailBatch(ShopeeAccount $account, array $orderSns): array
    {
        if (empty($orderSns)) {
            return [];
        }

        $url = $this->buildEscrowUrl($account);

        try {
            $response = Http::timeout(25)->asJson()->post($url, [
                'order_sn_list' => array_values($orderSns),
            ]);

            $data = $response->json();
            if ($response->failed() || ! empty($data['error'])) {
                Log::warning('Shopee Escrow Batch Warning: ' . ($data['message'] ?? $data['error'] ?? ('HTTP ' . $response->status())));
                return [];
            }

            return $this->parseEscrowBatchResponse(is_array($data) ? $data : []);
        } catch (\Throwable $e) {
            Log::warning('Shopee fetchEscrowDetailBatch Exception: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Parse response dari get_escrow_detail_batch baik format `response.escrow_detail_list`
     * maupun format list langsung pada `response`.
     */
    private function parseEscrowBatchResponse(array $data): array
    {
        $resp = $data['response'] ?? [];
        if (! is_array($resp)) {
            return [];
        }

        $escrowList = [];
        if (! empty($resp['escrow_detail_list']) && is_array($resp['escrow_detail_list'])) {
            $escrowList = $resp['escrow_detail_list'];
        } elseif (! empty($resp['escrow_list']) && is_array($resp['escrow_list'])) {
            $escrowList = $resp['escrow_list'];
        } elseif (array_is_list($resp)) {
            $escrowList = $resp;
        } elseif (! empty($resp['order_sn'])) {
            $escrowList = [$resp];
        }

        $mapped = [];
        foreach ($escrowList as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $sn = (string) ($entry['order_sn'] ?? '');
            if ($sn === '') {
                continue;
            }

            $income = is_array($entry['order_income'] ?? null) ? $entry['order_income'] : [];
            if (empty($income['items'])) {
                if (! empty($entry['items']) && is_array($entry['items'])) {
                    $income['items'] = $entry['items'];
                } elseif (! empty($entry['item_list']) && is_array($entry['item_list'])) {
                    $income['items'] = $entry['item_list'];
                }
            }

            foreach (['voucher_from_seller', 'seller_voucher_discount', 'seller_discount', 'seller_promo', 'original_cost_of_goods_sold', 'cost_of_goods_sold', 'escrow_amount'] as $key) {
                if (! isset($income[$key]) && isset($entry[$key])) {
                    $income[$key] = $entry[$key];
                }
            }

            $mapped[$sn] = $income;
        }

        return $mapped;
    }

    /**
     * Parse response tunggal dari endpoint get_escrow_detail.
     */
    private function parseSingleEscrowResponse(array $data): array
    {
        $resp = $data['response'] ?? [];
        if (! is_array($resp)) {
            return [];
        }

        $income = is_array($resp['order_income'] ?? null) ? $resp['order_income'] : [];
        if (empty($income['items']) && ! empty($resp['items']) && is_array($resp['items'])) {
            $income['items'] = $resp['items'];
        }

        return $income;
    }

    /**
     * Build signed URL for get_escrow_detail (single order GET).
     */
    public function buildSingleEscrowUrl(ShopeeAccount $account, string $orderSn): string
    {
        $path        = '/api/v2/payment/get_escrow_detail';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'order_sn'     => $orderSn,
        ];

        return $this->host . $path . '?' . http_build_query($queryParams);
    }

    /**
     * Fetch single order escrow detail from Shopee API v2.
     */
    public function fetchSingleEscrowDetail(ShopeeAccount $account, string $orderSn): array
    {
        $url = $this->buildSingleEscrowUrl($account, $orderSn);

        try {
            $response = Http::timeout(15)->get($url);
            $data = $response->json();
            if ($response->failed() || ! empty($data['error'])) {
                Log::warning("Shopee fetchSingleEscrowDetail warning ({$orderSn}): " . ($data['message'] ?? $data['error'] ?? ('HTTP ' . $response->status())));
                return [];
            }

            return $this->parseSingleEscrowResponse(is_array($data) ? $data : []);
        } catch (\Throwable $e) {
            Log::warning("Shopee fetchSingleEscrowDetail exception ({$orderSn}): " . $e->getMessage());
            return [];
        }
    }

    /**
     * Kembalikan akun Shopee dengan token yang masih valid (auto-refresh bila kedaluwarsa).
     */
    public function getValidTokenAccount(ShopeeAccount $account): ShopeeAccount
    {
        return $this->ensureValidToken($account);
    }

    /**
     * Automatically refresh token if it's expired or about to expire.
     */
    private function ensureValidToken(ShopeeAccount $account): ShopeeAccount
    {
        if ($account->token_expires_at && $account->token_expires_at->isPast()) {
            return $this->refreshAccessToken($account);
        }
        return $account;
    }

    /**
     * Hitung Subtotal Pesanan & Voucher Penjual, lalu terapkan rumus ERP:
     * Est. Bersih = (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
     * Jika Voucher Ditanggung Penjual = 0, maka (Subtotal Pesanan - 0) * 79%
     */
    public function calculateNetIncome(array $order, array $escrowIncome = []): array
    {
        $items = $order['item_list'] ?? [];
        if (empty($items) && ! empty($order['package_list'])) {
            foreach ($order['package_list'] as $pkg) {
                if (! empty($pkg['item_list'])) {
                    $items = array_merge($items, $pkg['item_list']);
                }
            }
        }
        if (empty($items) && ! empty($escrowIncome['items']) && is_array($escrowIncome['items'])) {
            $items = $escrowIncome['items'];
        }

        // 1. Hitung Subtotal Pesanan & susun daftar produk untuk breakdown rincian per item
        $subtotalOrder     = 0.0;
        $sumOriginalPrices = 0.0;
        $itemVouchers      = 0.0;
        $normalizedItems   = [];

        foreach ($items as $it) {
            $itemPrice = (float) ($it['model_discounted_price'] ?? 0);
            if ($itemPrice <= 0) {
                $itemPrice = (float) ($it['discounted_price'] ?? 0);
            }
            if ($itemPrice <= 0) {
                $itemPrice = (float) ($it['model_original_price'] ?? 0);
            }
            if ($itemPrice <= 0) {
                $itemPrice = (float) ($it['original_price'] ?? 0);
            }
            $origUnitPrice = (float) ($it['model_original_price'] ?? $it['original_price'] ?? $itemPrice);
            if ($origUnitPrice < $itemPrice) {
                $origUnitPrice = $itemPrice;
            }

            $itemQty = (int) ($it['model_quantity_purchased'] ?? $it['quantity_purchased'] ?? $it['model_quantity'] ?? 1);
            if ($itemQty <= 0) {
                $itemQty = 1;
            }

            $lineSubtotal       = round($itemPrice * $itemQty, 2);
            $subtotalOrder     += $lineSubtotal;
            $sumOriginalPrices += round($origUnitPrice * $itemQty, 2);

            $itemVouchers += (float) ($it['discount_from_voucher_seller'] ?? $it['voucher_from_seller'] ?? $it['seller_voucher_discount'] ?? 0);

            $normalizedItems[] = [
                'name'      => $it['item_name'] ?? 'Produk Shopee',
                'variation' => ! empty($it['model_name']) ? trim((string) $it['model_name']) : null,
                'sku'       => self::normalizeSku($it['model_sku'] ?? $it['item_sku'] ?? null),
                'qty'       => $itemQty,
                'subtotal'  => $lineSubtotal,
            ];
        }

        // Sesuaikan jika ada bundle deal / seller_discount level keranjang yang belum memotong model_discounted_price
        $origCogs             = (float) ($escrowIncome['original_cost_of_goods_sold'] ?? 0);
        $escrowSellerDiscount = max(0.0, (float) ($escrowIncome['seller_discount'] ?? 0));
        $catalogDiscount      = max(0.0, $sumOriginalPrices - $subtotalOrder);
        $unappliedDiscount    = max(0.0, round($escrowSellerDiscount - $catalogDiscount, 2));

        $adjustedSubtotal = $subtotalOrder;
        if ($subtotalOrder > 0 && $origCogs > 0 && $origCogs < $subtotalOrder) {
            $adjustedSubtotal = round($origCogs, 2);
        } elseif ($subtotalOrder > 0 && $unappliedDiscount > 0 && $unappliedDiscount < $subtotalOrder) {
            $adjustedSubtotal = round($subtotalOrder - $unappliedDiscount, 2);
        }

        if ($subtotalOrder > 0 && abs($adjustedSubtotal - $subtotalOrder) > 0.01 && ! empty($normalizedItems)) {
            $ratio = $adjustedSubtotal / $subtotalOrder;
            foreach ($normalizedItems as &$ni) {
                $ni['subtotal'] = round($ni['subtotal'] * $ratio, 2);
            }
            unset($ni);
            $subtotalOrder = $adjustedSubtotal;
        }

        // 2. Hitung Voucher Ditanggung Penjual (Kolom AC di Excel Shopee)
        // PENTING: Jangan pernah fallback ke seller_discount / seller_promo karena itu diskon produk/harga coret (bukan voucher)
        $paymentInfo        = $order['payment_info'] ?? [];
        $escrowItemVouchers = 0.0;
        if (! empty($escrowIncome['items']) && is_array($escrowIncome['items'])) {
            foreach ($escrowIncome['items'] as $ei) {
                $escrowItemVouchers += (float) ($ei['discount_from_voucher_seller'] ?? $ei['voucher_from_seller'] ?? $ei['seller_voucher_discount'] ?? 0);
            }
        }

        $paymentVoucher = (float) (
            $paymentInfo['voucher_from_seller']
            ?? $paymentInfo['seller_voucher_discount']
            ?? ($paymentInfo['voucher_info']['discount_by_shop_voucher'] ?? 0)
        );

        $sellerVoucher = 0.0;
        if (! empty($escrowIncome['voucher_from_seller']) && (float) $escrowIncome['voucher_from_seller'] > 0) {
            $sellerVoucher = (float) $escrowIncome['voucher_from_seller'];
        } elseif (! empty($escrowIncome['seller_voucher_discount']) && (float) $escrowIncome['seller_voucher_discount'] > 0) {
            $sellerVoucher = (float) $escrowIncome['seller_voucher_discount'];
        } elseif ($escrowItemVouchers > 0) {
            $sellerVoucher = $escrowItemVouchers;
        } elseif ($paymentVoucher > 0) {
            $sellerVoucher = $paymentVoucher;
        } elseif ($itemVouchers > 0) {
            $sellerVoucher = $itemVouchers;
        } elseif (! empty($order['voucher_from_seller']) && (float) $order['voucher_from_seller'] > 0) {
            $sellerVoucher = (float) $order['voucher_from_seller'];
        }

        if ($sellerVoucher < 0) {
            $sellerVoucher = 0.0;
        }

        if ($subtotalOrder <= 0) {
            $cogs = (float) ($escrowIncome['cost_of_goods_sold'] ?? 0);

            if ($origCogs > 0) {
                $subtotalOrder = $origCogs;
            } elseif ($cogs > 0) {
                $subtotalOrder = $cogs;
            } elseif (! empty($order['total_amount']) && (float) $order['total_amount'] > 0) {
                $subtotalOrder = (float) $order['total_amount'];
            }
        }

        if (empty($normalizedItems)) {
            $normalizedItems[] = [
                'name'      => 'Produk Shopee',
                'variation' => null,
                'sku'       => null,
                'qty'       => 1,
                'subtotal'  => round($subtotalOrder, 2),
            ];
        }

        // 3. Rumus Resmi + Breakdown per Produk (Voucher dibagi rata)
        $breakdown = CutOffOrder::buildFinancialBreakdown($normalizedItems, $sellerVoucher, 0.79, $subtotalOrder);

        return [
            'subtotal_order' => $breakdown['subtotal_order'],
            'seller_voucher' => $breakdown['seller_voucher'],
            'est_net_income' => $breakdown['est_net_income'],
            'breakdown'      => $breakdown,
        ];
    }

    /**
     * Hitung ulang Est. Bersih untuk seluruh pesanan Cut Off di database
     * menggunakan rumus resmi: (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
     * Jika Voucher Ditanggung Penjual = 0, maka (Subtotal Pesanan - 0) * 79%
     */
    public function recalculateAllOrders(?ShopeeAccount $account = null): array
    {
        $this->ensureSchema();
        $hasFinancialBreakdown = Schema::hasColumn('cut_off_orders', 'financial_breakdown');

        if (! $account) {
            $account = ShopeeAccount::where('status', 'active')
                ->whereNotNull('access_token')
                ->first();
        }

        // Pesanan batal pencairan riil marketplace adalah 0
        CutOffOrder::where('order_status', 'Batal')
            ->update([
                'marketplace_net_payout' => 0,
            ]);

        $orders = CutOffOrder::where('channel', 'SH')->get();
        if ($orders->isEmpty()) {
            return [
                'status'  => 'success',
                'message' => 'Tidak ada pesanan Shopee di tabel Cut Off untuk dihitung ulang.',
                'updated' => 0,
            ];
        }

        $ordersBySn   = $orders->groupBy('order_number');
        $updatedCount = 0;

        // 2. Ambil data pesanan langsung dari Shopee Open API v2 dalam batch 50 pesanan
        if ($account && ! empty($account->access_token)) {
            $account = $this->ensureValidToken($account);
            $orderSns = $orders->pluck('order_number')->filter()->unique()->values()->toArray();

            $chunks = array_chunk($orderSns, 50);
            foreach ($chunks as $chunk) {
                try {
                    $detailedOrders = $this->fetchOrderDetailRaw($account, $chunk);
                    $escrows = $this->fetchEscrowDetailBatch($account, $chunk);

                    // Ambil escrow tunggal secara paralel jika ada order yang belum masuk di batch
                    $missingInChunk = array_values(array_diff($chunk, array_keys($escrows)));
                    if (! empty($missingInChunk)) {
                        foreach (array_chunk($missingInChunk, 5) as $miniBatch) {
                            try {
                                $poolResponses = Http::pool(function (Pool $pool) use ($account, $miniBatch) {
                                    $reqs = [];
                                    foreach ($miniBatch as $sn) {
                                        $url = $this->buildSingleEscrowUrl($account, (string) $sn);
                                        $reqs[$sn] = $pool->as((string) $sn)->timeout(15)->get($url);
                                    }
                                    return $reqs;
                                });

                                foreach ($poolResponses as $sn => $res) {
                                    if ($res instanceof Response && $res->successful()) {
                                        $data = $res->json();
                                        if (! empty($data['error'])) {
                                            Log::warning("Shopee recalculate single escrow error ({$sn}): " . ($data['message'] ?? $data['error']));
                                            continue;
                                        }
                                        $parsed = $this->parseSingleEscrowResponse(is_array($data) ? $data : []);
                                        if (! empty($parsed)) {
                                            $escrows[$sn] = $parsed;
                                        }
                                    }
                                }
                            } catch (\Throwable $pe) {
                                Log::warning('Shopee recalculate single escrow pool notice: ' . $pe->getMessage());
                            }
                        }
                    }

                    foreach ($detailedOrders as $shopeeOrder) {
                        $sn = $shopeeOrder['order_sn'] ?? null;
                        if (! $sn) continue;

                        $items = $shopeeOrder['item_list'] ?? [];
                        if (empty($items) && ! empty($shopeeOrder['package_list'])) {
                            foreach ($shopeeOrder['package_list'] as $pkg) {
                                if (! empty($pkg['item_list'])) {
                                    $items = array_merge($items, $pkg['item_list']);
                                }
                            }
                            if (! empty($items)) {
                                $shopeeOrder['item_list'] = $items;
                            }
                        }

                        $totalQty = 0;
                        foreach ($items as $it) {
                            $totalQty += (int) ($it['model_quantity_purchased'] ?? $it['quantity_purchased'] ?? $it['model_quantity'] ?? 1);
                        }
                        if ($totalQty <= 0) $totalQty = 1;

                        $firstItem = $items[0] ?? [];
                        $variationName = ! empty($firstItem['model_name']) ? trim((string) $firstItem['model_name']) : null;
                        if (count($items) > 1 && $variationName) {
                            $variationName .= ' (+' . (count($items) - 1) . ' item)';
                        }

                        $rawStatus  = (string) ($shopeeOrder['order_status'] ?? '');
                        $statusText = $this->mapOrderStatus($rawStatus);

                        $escrowIncome = $escrows[$sn] ?? [];
                        $calc         = $this->calculateNetIncome($shopeeOrder, $escrowIncome);
                        $estNet       = $calc['est_net_income'];
                        $netPayout    = ($statusText === 'Batal' || $rawStatus === 'CANCELLED') ? 0 : $estNet;

                        $updatePayload = [
                            'est_net_income'         => $estNet,
                            'marketplace_net_payout' => $netPayout,
                            'qty'                    => $totalQty,
                            'package_count'          => count($items) ?: 1,
                        ];
                        if ($variationName) {
                            $updatePayload['variation_name'] = $variationName;
                        }
                        if ($hasFinancialBreakdown) {
                            $updatePayload['financial_breakdown'] = $calc['breakdown'];
                        }

                        foreach ($ordersBySn->get($sn, collect()) as $orderModel) {
                            $orderModel->update($updatePayload);
                        }

                        $updatedCount++;
                    }
                } catch (\Throwable $e) {
                    Log::warning("Shopee recalculateAllOrders chunk error: " . $e->getMessage());
                }
            }
        }

        return [
            'status'  => 'success',
            'message' => "Berhasil menyesuaikan {$updatedCount} pesanan sesuai rumus (Subtotal Pesanan - Voucher Ditanggung Penjual) × 79%!",
            'updated' => $updatedCount,
        ];
    }

    /**
     * Pastikan skema tabel cut_off_orders memiliki kolom cancel_by dan cancel_reason.
     * Jika belum ada di production MySQL (karena deploy FTP tanpa shell), tambahkan otomatis.
     */
    public function ensureSchema(): void
    {
        try {
            \Illuminate\Support\Facades\DB::statement("ALTER TABLE cut_off_orders MODIFY order_date DATETIME NULL");
        } catch (\Throwable $e) {
            // Ignore if already datetime or not supported
        }

        try {
            if (! Schema::hasColumn('cut_off_orders', 'cancel_by')) {
                Schema::table('cut_off_orders', function (Blueprint $table) {
                    if (! Schema::hasColumn('cut_off_orders', 'cancel_by')) {
                        $table->string('cancel_by')->nullable()->after('keterangan_solutif');
                    }
                    if (! Schema::hasColumn('cut_off_orders', 'cancel_reason')) {
                        $table->text('cancel_reason')->nullable()->after('cancel_by');
                    }
                });
            }

            if (! Schema::hasColumn('cut_off_orders', 'payment_method')) {
                Schema::table('cut_off_orders', function (Blueprint $table) {
                    $table->string('payment_method')->nullable()->after('shipping_courier');
                });
            }

            if (! Schema::hasColumn('cut_off_orders', 'ship_by_date')) {
                Schema::table('cut_off_orders', function (Blueprint $table) {
                    $table->dateTime('ship_by_date')->nullable()->after('order_date');
                });
            }

            if (! Schema::hasColumn('cut_off_orders', 'variation_name')) {
                Schema::table('cut_off_orders', function (Blueprint $table) {
                    $table->string('variation_name', 255)->nullable()->after('product_name');
                });
            }

            if (! Schema::hasColumn('cut_off_orders', 'financial_breakdown')) {
                try {
                    Schema::table('cut_off_orders', function (Blueprint $table) {
                        $table->json('financial_breakdown')->nullable()->after('variation_name');
                    });
                } catch (\Throwable $jsonErr) {
                    Schema::table('cut_off_orders', function (Blueprint $table) {
                        $table->longText('financial_breakdown')->nullable()->after('variation_name');
                    });
                }
            }

            // Koreksi otomatis pesanan Shopee 3 Nov yang jamnya sempat tersimpan dalam UTC (+7 jam ke WIB)
            DB::table('cut_off_orders')
                ->where('channel', 'SH')
                ->whereDate('order_date', '2026-11-03')
                ->whereTime('order_date', '<', '10:00:00')
                ->where('order_number', 'like', '261103%')
                ->update([
                    'order_date' => DB::raw("DATE_ADD(order_date, INTERVAL 7 HOUR)")
                ]);
            // Panggil juga pembuatan tabel produk Shopee secara otomatis jika belum ada
            $this->ensureProductSchema();
        } catch (\Throwable $e) {
            Log::warning('ShopeeSyncService ensureSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Memastikan tabel shopee_products sudah dibuat di database.
     * Mencegah crash Error 500 jika user belum sempat menjalankan artisan migrate di server/cPanel.
     */
    public function ensureProductSchema(): void
    {
        try {
            if (! Schema::hasTable('shopee_products')) {
                Schema::create('shopee_products', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('shopee_account_id')->nullable()->index();
                    $table->unsignedBigInteger('item_id')->index();
                    $table->unsignedBigInteger('model_id')->default(0)->index();
                    $table->string('item_name', 255);
                    $table->string('model_name', 255)->nullable();
                    $table->string('sku', 100)->nullable()->index();
                    $table->integer('stock')->default(0)->index();
                    $table->integer('reserved_stock')->default(0);
                    $table->decimal('price', 15, 2)->default(0);
                    $table->string('item_status', 50)->default('NORMAL');
                    $table->boolean('has_model')->default(false);
                    $table->dateTime('last_synced_at')->nullable()->index();
                    $table->json('raw_data')->nullable();
                    $table->timestamps();

                    $table->unique(['shopee_account_id', 'item_id', 'model_id'], 'shopee_prod_unique_variant');
                });
            }

            if (Schema::hasTable('shopee_products')) {
                if (! Schema::hasColumn('shopee_products', 'manual_item_code')) {
                    Schema::table('shopee_products', function (Blueprint $table) {
                        $table->string('manual_item_code', 50)->nullable()->after('sku')->index();
                    });
                }
                if (! Schema::hasColumn('shopee_products', 'locked_campaign_qty')) {
                    Schema::table('shopee_products', function (Blueprint $table) {
                        $table->integer('locked_campaign_qty')->default(0)->after('reserved_stock');
                    });
                }
                if (! Schema::hasColumn('shopee_products', 'was_campaign_locked')) {
                    Schema::table('shopee_products', function (Blueprint $table) {
                        $table->boolean('was_campaign_locked')->default(false)->after('locked_campaign_qty')->index();
                    });
                }
                if (! Schema::hasColumn('shopee_products', 'sales')) {
                    Schema::table('shopee_products', function (Blueprint $table) {
                        $table->integer('sales')->default(0)->after('price')->index();
                    });
                }

                // Bersihkan SKU placeholder ('0', '-', '@', dll) dan reset sales-nya agar tidak salah agregasi penjualan
                try {
                    \Illuminate\Support\Facades\DB::statement("
                        UPDATE shopee_products 
                        SET sku = NULL, sales = 0 
                        WHERE sku IS NOT NULL 
                          AND (TRIM(sku) = '' OR TRIM(sku) = '0' OR TRIM(sku) = '-' OR TRIM(sku) = '--' OR TRIM(sku) = '---' OR TRIM(sku) = '@' OR TRIM(sku) = '.' OR LOWER(TRIM(sku)) IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku'))
                    ");
                } catch (\Throwable $e) {}
            }

            if (Schema::hasTable('cut_off_orders')) {
                try {
                    \Illuminate\Support\Facades\DB::statement("
                        UPDATE cut_off_orders 
                        SET sku_utama = NULL 
                        WHERE sku_utama IS NOT NULL 
                          AND (TRIM(sku_utama) = '' OR TRIM(sku_utama) = '0' OR TRIM(sku_utama) = '-' OR TRIM(sku_utama) = '--' OR TRIM(sku_utama) = '---' OR TRIM(sku_utama) = '@' OR TRIM(sku_utama) = '.' OR LOWER(TRIM(sku_utama)) IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku'))
                    ");
                } catch (\Throwable $e) {}
            }
        } catch (\Throwable $e) {
            Log::warning('ShopeeSyncService ensureProductSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Fetch raw return list from Shopee API v2.
     * Endpoint: /api/v2/returns/get_return_list
     */
    public function fetchReturnListRaw(ShopeeAccount $account, int $timeFrom, int $timeTo, int $pageNo = 0, int $pageSize = 40): array
    {
        $path        = '/api/v2/returns/get_return_list';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'       => $partnerId,
            'timestamp'        => $timestamp,
            'sign'             => $sign,
            'access_token'     => $accessToken,
            'shop_id'          => $shopId,
            'page_no'          => $pageNo,
            'page_size'        => min($pageSize, 50),
            'create_time_from' => $timeFrom,
            'create_time_to'   => $timeTo,
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);

        $response = Http::timeout(25)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $err = $data['message'] ?? ($data['error'] ?? 'Gagal mengambil daftar retur Shopee');
            Log::warning("Shopee Return List Error: {$err}");
            throw new RuntimeException("Shopee Return List Error: {$err}");
        }

        return $data['response'] ?? [];
    }

    /**
     * Fetch return detail from Shopee API v2.
     * Endpoint: /api/v2/returns/get_return_detail
     */
    public function fetchReturnDetailRaw(ShopeeAccount $account, string $returnSn): array
    {
        $path        = '/api/v2/returns/get_return_detail';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'return_sn'    => $returnSn,
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);

        $response = Http::timeout(20)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            return [];
        }

        return $data['response'] ?? [];
    }

    /**
     * Synchronize Shopee returns into cut_off_returns and update matching cut_off_orders.
     */
    public function syncReturnsToCutOff(ShopeeAccount $account, ?int $timeFrom = null, ?int $timeTo = null): array
    {
        $timeTo = $timeTo ?: time();
        $timeFrom = $timeFrom ?: ($timeTo - (14 * 86400)); // Default 14 hari

        $account = $this->ensureValidToken($account);

        $maxWindow = 14 * 86400; // Limit Shopee 15 hari
        $allReturns = [];
        $currentTo = $timeTo;

        while ($currentTo > $timeFrom) {
            $currentFrom = max($timeFrom, $currentTo - $maxWindow);

            $pageNo = 0;
            $hasMore = true;

            while ($hasMore && $pageNo < 30) {
                $rawRes = $this->fetchReturnListRaw($account, $currentFrom, $currentTo, $pageNo, 40);
                $returns = $rawRes['return'] ?? $rawRes['return_list'] ?? [];

                foreach ($returns as $ret) {
                    $returnSn = $ret['return_sn'] ?? null;
                    if ($returnSn) {
                        $allReturns[$returnSn] = $ret;
                    }
                }

                $hasMore = ! empty($rawRes['more']);
                $pageNo++;
            }

            $currentTo = $currentFrom;
        }

        if (empty($allReturns)) {
            return [
                'total_fetched' => 0,
                'created'       => 0,
                'updated'       => 0,
                'orders_linked' => 0,
                'message'       => 'Tidak ditemukan data pengajuan retur Shopee pada rentang waktu tersebut.',
            ];
        }

        $createdCount = 0;
        $updatedCount = 0;
        $ordersLinkedCount = 0;

        \Illuminate\Support\Facades\DB::transaction(function () use (
            $allReturns, &$createdCount, &$updatedCount, &$ordersLinkedCount
        ) {
            $lastNoUrut = (int) (CutOffReturn::max('no_urut') ?? 0);

            foreach ($allReturns as $returnSn => $ret) {
                $orderSn    = trim((string) ($ret['order_sn'] ?? ''));
                $createTime = ! empty($ret['create_time']) ? (int) $ret['create_time'] : time();
                $returnDate = \Carbon\Carbon::createFromTimestamp($createTime, 'Asia/Jakarta')->format('Y-m-d');

                // Ekstraksi produk
                $items = $ret['item'] ?? [];
                $firstItem = $items[0] ?? [];
                $totalQty = 0;
                foreach ($items as $it) {
                    $totalQty += (int) ($it['amount'] ?? 1);
                }
                if ($totalQty <= 0) {
                    $totalQty = 1;
                }

                $itemName = (string) ($firstItem['name'] ?? $firstItem['item_sku'] ?? 'Produk Shopee');
                if (count($items) > 1) {
                    $itemName .= ' (+' . (count($items) - 1) . ' item lainnya)';
                }

                $reason = trim((string) ($ret['text_reason'] ?? $ret['reason'] ?? ''));
                $status = trim((string) ($ret['status'] ?? ''));
                $keteranganParts = [];
                if (! empty($status)) {
                    $keteranganParts[] = "[{$status}]";
                }
                if (! empty($reason)) {
                    $keteranganParts[] = $reason;
                }
                $keterangan = implode(' ', $keteranganParts);

                $trackingNumber = $ret['tracking_number'] ?? null;

                // Cek apakah data retur sudah ada
                $existing = CutOffReturn::where('marketplace', 'SH')
                    ->where(function ($q) use ($returnSn, $orderSn) {
                        $q->where('no_retur', $returnSn);
                        if (! empty($orderSn)) {
                            $q->orWhere('no_invoice_mp', $orderSn);
                        }
                    })
                    ->first();

                if ($existing) {
                    $existing->update([
                        'nama_barang_mp' => $itemName,
                        'jml_produk_mp'  => $totalQty,
                        'keterangan'     => $keterangan ?: $existing->keterangan,
                        'barcode'        => $trackingNumber ?: $existing->barcode,
                        'no_retur'       => $returnSn ?: $existing->no_retur,
                        'no_invoice_mp'  => $orderSn ?: $existing->no_invoice_mp,
                    ]);
                    $updatedCount++;
                } else {
                    $lastNoUrut++;
                    CutOffReturn::create([
                        'no_urut'        => $lastNoUrut,
                        'marketplace'    => 'SH',
                        'tgl_input_mp'   => $returnDate,
                        'nama_barang_mp' => $itemName,
                        'jml_produk_mp'  => $totalQty,
                        'no_invoice_mp'  => $orderSn,
                        'no_retur'       => $returnSn,
                        'tgl_rj'         => $returnDate,
                        'keterangan'     => $keterangan,
                        'barcode'        => $trackingNumber,
                    ]);
                    $createdCount++;
                }

                // Sinkronkan ke Pesanan Cut Off jika ada pesanan dengan order_number tersebut
                if (! empty($orderSn)) {
                    $cutOffOrder = CutOffOrder::where('order_number', $orderSn)
                        ->where('channel', 'SH')
                        ->first();

                    if ($cutOffOrder) {
                        $cutOffOrder->update([
                            'order_status'  => 'RJ (Retur)',
                            'cancel_by'     => 'buyer',
                            'cancel_reason' => $reason ?: "Retur Shopee ({$status})",
                        ]);
                        $ordersLinkedCount++;
                    }
                }
            }
        });

        return [
            'total_fetched' => count($allReturns),
            'created'       => $createdCount,
            'updated'       => $updatedCount,
            'orders_linked' => $ordersLinkedCount,
            'message'       => "Sinkronisasi Retur Shopee sukses! {$createdCount} retur baru ditambahkan, {$updatedCount} diperbarui, dan {$ordersLinkedCount} pesanan di Pesanan Cut Off otomatis disinkronkan ke status 'RJ (Retur)'.",
        ];
    }

    /**
     * Fetch list of item IDs from Shopee Open API v2.
     * Path: /api/v2/product/get_item_list
     */
    public function fetchItemListRaw(ShopeeAccount $account, int $offset = 0, int $pageSize = 50, string $status = 'NORMAL'): array
    {
        $path        = '/api/v2/product/get_item_list';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'offset'       => $offset,
            'page_size'    => $pageSize,
            'item_status'  => $status,
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);
        $response = Http::timeout(25)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            throw new RuntimeException('Shopee Get Item List Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil daftar produk'));
        }

        return $data['response'] ?? [];
    }

    /**
     * Fetch basic info for batch of item IDs (up to 50 items).
     * Path: /api/v2/product/get_item_base_info
     */
    public function fetchItemBaseInfoRaw(ShopeeAccount $account, array $itemIds): array
    {
        if (empty($itemIds)) {
            return [];
        }

        $path        = '/api/v2/product/get_item_base_info';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'item_id_list' => implode(',', array_slice($itemIds, 0, 50)),
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);
        $response = Http::timeout(25)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            throw new RuntimeException('Shopee Get Item Base Info Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil detail dasar produk'));
        }

        return $data['response']['item_list'] ?? [];
    }

    /**
     * Fetch extra performance metrics (historical sales/sold count, views, likes) for products.
     * Path: /api/v2/product/get_item_extra_info
     */
    public function fetchItemExtraInfoRaw(ShopeeAccount $account, array $itemIds): array
    {
        if (empty($itemIds)) {
            return [];
        }

        $path        = '/api/v2/product/get_item_extra_info';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'item_id_list' => implode(',', array_slice($itemIds, 0, 50)),
        ];

        try {
            $url = $this->host . $path . '?' . http_build_query($queryParams);
            $response = Http::timeout(25)->get($url);
            $data = $response->json();

            if ($response->failed() || ! empty($data['error'])) {
                Log::warning('Shopee Get Item Extra Info Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil extra info produk'));
                return [];
            }

            return $data['response']['item_list'] ?? [];
        } catch (\Throwable $e) {
            Log::warning('Shopee Get Item Extra Info exception: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Refresh shopee_products.sales directly from cut_off_orders for accurate SKU-level sales tracking.
     */
    public function refreshSalesFromCutOffOrders(?int $shopeeAccountId = null): int
    {
        if (! Schema::hasTable('shopee_products') || ! Schema::hasTable('cut_off_orders')) {
            return 0;
        }

        try {
            $this->ensureProductSchema();

            $accountClause = $shopeeAccountId ? "AND sp.shopee_account_id = " . (int) $shopeeAccountId : "";
            $accountResetClause = $shopeeAccountId ? "AND shopee_account_id = " . (int) $shopeeAccountId : "";

            // 1. Reset penjualan untuk produk yang tidak memiliki SKU valid
            DB::statement("
                UPDATE shopee_products 
                SET sales = 0 
                WHERE (sku IS NULL 
                   OR TRIM(sku) = '' 
                   OR TRIM(sku) = '0' 
                   OR TRIM(sku) = '-' 
                   OR TRIM(sku) = '--' 
                   OR TRIM(sku) = '---' 
                   OR TRIM(sku) = '@' 
                   OR TRIM(sku) = '.' 
                   OR LOWER(TRIM(sku)) IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku'))
                   {$accountResetClause}
            ");

            // 2. Hubungkan hanya SKU valid & tidak ambigu
            $affected = DB::update("
                UPDATE shopee_products sp
                JOIN (
                    SELECT sku_utama, CAST(SUM(qty) AS UNSIGNED) as total_sold
                    FROM cut_off_orders
                    WHERE (channel = 'SH' OR channel LIKE 'SH%')
                      AND (order_status IS NULL OR (order_status NOT LIKE '%Batal%' AND order_status NOT LIKE '%RJ%' AND order_status NOT LIKE '%Retur%'))
                      AND sku_utama IS NOT NULL 
                      AND TRIM(sku_utama) != '' 
                      AND TRIM(sku_utama) != '0' 
                      AND TRIM(sku_utama) != '-' 
                      AND TRIM(sku_utama) != '--' 
                      AND TRIM(sku_utama) != '---' 
                      AND TRIM(sku_utama) != '@' 
                      AND TRIM(sku_utama) != '.' 
                      AND LOWER(TRIM(sku_utama)) NOT IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku')
                    GROUP BY sku_utama
                ) co ON sp.sku = co.sku_utama
                SET sp.sales = co.total_sold
                WHERE sp.sku IS NOT NULL 
                  AND TRIM(sp.sku) != '' 
                  AND TRIM(sp.sku) != '0' 
                  AND TRIM(sp.sku) != '-' 
                  AND TRIM(sp.sku) != '--' 
                  AND TRIM(sp.sku) != '---' 
                  AND TRIM(sp.sku) != '@' 
                  AND TRIM(sp.sku) != '.' 
                  AND LOWER(TRIM(sp.sku)) NOT IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku')
                  {$accountClause}
            ");

            return (int) $affected;
        } catch (\Throwable $e) {
            Log::warning('[ShopeeSyncService] refreshSalesFromCutOffOrders error: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * Fetch model/variation list for an item.
     * Path: /api/v2/product/get_model_list
     */
    public function fetchModelListRaw(ShopeeAccount $account, int|string $itemId): array
    {
        $path        = '/api/v2/product/get_model_list';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
            'item_id'      => (int) $itemId,
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);
        $response = Http::timeout(25)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            throw new RuntimeException('Shopee Get Model List Error: ' . ($data['message'] ?? $data['error'] ?? "Gagal mengambil variasi produk ID {$itemId}"));
        }

        return $data['response']['model'] ?? [];
    }

    /**
     * Synchronize all Shopee products, variations, SKU, and Stock.
     * Extracts exact SKU & available stock into shopee_products table.
     */
    public function syncProductsFromShopee(ShopeeAccount $account, ?callable $progressCallback = null): array
    {
        if (empty($account->access_token)) {
            throw new RuntimeException('Toko Shopee belum terhubung (access_token kosong). Silakan hubungkan toko terlebih dahulu.');
        }

        // Auto refresh token jika kadaluarsa
        if ($account->token_expires_at && $account->token_expires_at->isPast()) {
            $account = $this->refreshAccessToken($account);
        }

        $allItemIds = [];
        $offset = 0;
        $pageSize = 50;
        $hasNextPage = true;

        // 1. Ambil seluruh item_id produk berstatus NORMAL (aktif)
        while ($hasNextPage) {
            $res = $this->fetchItemListRaw($account, $offset, $pageSize, 'NORMAL');
            $items = $res['item'] ?? [];
            foreach ($items as $it) {
                if (! empty($it['item_id'])) {
                    $allItemIds[] = (int) $it['item_id'];
                }
            }

            $hasNextPage = ! empty($res['has_next_page']);
            $nextOffset = $res['next_offset'] ?? null;
            if ($nextOffset !== null && (int) $nextOffset > $offset) {
                $offset = (int) $nextOffset;
            } else {
                $offset += $pageSize;
            }

            if (empty($items)) {
                break;
            }
        }

        $totalItems = count($allItemIds);
        if ($progressCallback) {
            $progressCallback("Ditemukan {$totalItems} produk di Shopee. Mulai mengambil rincian SKU dan Stok...");
        }

        $savedCount = 0;
        $totalStockSum = 0;
        $now = now();

        // 2. Ambil detail dasar produk dalam batch 50 item
        $chunks = array_chunk($allItemIds, 50);
        foreach ($chunks as $chunkIdx => $chunkItemIds) {
            $baseItems  = $this->fetchItemBaseInfoRaw($account, $chunkItemIds);
            $extraItems = $this->fetchItemExtraInfoRaw($account, $chunkItemIds);
            $extraMap   = collect($extraItems)->keyBy('item_id');

            foreach ($baseItems as $item) {
                $itemId     = (int) ($item['item_id'] ?? 0);
                $itemName   = (string) ($item['item_name'] ?? 'Produk Shopee');
                $hasModel   = ! empty($item['has_model']);
                $itemStatus = (string) ($item['item_status'] ?? 'NORMAL');
                $itemSale   = (int) ($extraMap[$itemId]['sale'] ?? 0);

                if ($hasModel) {
                    // Produk memiliki variasi (Model/Size/Warna): ambil daftar model
                    try {
                        $models = $this->fetchModelListRaw($account, $itemId);
                        foreach ($models as $model) {
                            $modelId   = (int) ($model['model_id'] ?? 0);
                            $modelSku  = trim((string) ($model['model_sku'] ?? $item['item_sku'] ?? ''));
                            $modelName = trim((string) ($model['model_name'] ?? ''));

                            // Ambil stok dari stock_info_v2
                            $stock = (int) (
                                $model['stock_info_v2']['summary_info']['total_available_stock']
                                ?? $model['stock_info_v2']['seller_stock'][0]['stock']
                                ?? $model['normal_stock']
                                ?? 0
                            );
                            $reservedStock = (int) (
                                $model['stock_info_v2']['summary_info']['total_reserved_stock']
                                ?? 0
                            );

                            $price = (float) (
                                $model['price_info'][0]['current_price']
                                ?? $model['price_info'][0]['original_price']
                                ?? 0
                            );

                            ShopeeProduct::updateOrCreate(
                                [
                                    'shopee_account_id' => $account->id,
                                    'item_id'           => $itemId,
                                    'model_id'          => $modelId,
                                ],
                                [
                                    'item_name'         => $itemName,
                                    'model_name'        => $modelName,
                                    'sku'               => self::normalizeSku($modelSku),
                                    'stock'             => $stock,
                                    'reserved_stock'    => $reservedStock,
                                    'price'             => $price,
                                    'item_status'       => $itemStatus,
                                    'has_model'         => true,
                                    'last_synced_at'    => $now,
                                    'raw_data'          => $model,
                                ]
                            );

                            $savedCount++;
                            $totalStockSum += $stock;
                        }
                    } catch (\Throwable $e) {
                        Log::warning("[ShopeeSyncProduct] Gagal mengambil variasi item {$itemId}: " . $e->getMessage());
                    }
                } else {
                    // Produk tunggal tanpa variasi
                    $itemSku = trim((string) ($item['item_sku'] ?? ''));
                    $stock = (int) (
                        $item['stock_info_v2']['summary_info']['total_available_stock']
                        ?? $item['stock_info_v2']['seller_stock'][0]['stock']
                        ?? $item['normal_stock']
                        ?? 0
                    );
                    $reservedStock = (int) (
                        $item['stock_info_v2']['summary_info']['total_reserved_stock']
                        ?? 0
                    );
                    $price = (float) (
                        $item['price_info'][0]['current_price']
                        ?? $item['price_info'][0]['original_price']
                        ?? 0
                    );

                    ShopeeProduct::updateOrCreate(
                        [
                            'shopee_account_id' => $account->id,
                            'item_id'           => $itemId,
                            'model_id'          => 0,
                        ],
                        [
                            'item_name'         => $itemName,
                            'model_name'        => null,
                            'sku'               => self::normalizeSku($itemSku),
                            'stock'             => $stock,
                            'reserved_stock'    => $reservedStock,
                            'price'             => $price,
                            'sales'             => $itemSale,
                            'item_status'       => $itemStatus,
                            'has_model'         => false,
                            'last_synced_at'    => $now,
                            'raw_data'          => $item,
                        ]
                    );

                    $savedCount++;
                    $totalStockSum += $stock;
                }
            }

            if ($progressCallback) {
                $processedCount = min($totalItems, ($chunkIdx + 1) * 50);
                $progressCallback("Diproses {$processedCount}/{$totalItems} produk ({$savedCount} SKU variasi tersimpan)...");
            }
        }

        // 3. Sinkronkan rincian penjualan per-SKU varian dari tabel Cut Off Orders
        $this->refreshSalesFromCutOffOrders($account->id);

        $account->update([
            'last_synced_at'   => $now,
            'last_sync_status' => 'success',
            'last_sync_error'  => null,
        ]);

        return [
            'status'         => 'success',
            'total_items'    => $totalItems,
            'total_variants' => $savedCount,
            'total_stock'    => $totalStockSum,
            'message'        => "Sinkronisasi produk Shopee berhasil! {$savedCount} SKU tersinkron dari {$totalItems} produk dengan total {$totalStockSum} pcs stok tersedia.",
        ];
    }

    /**
     * Send update_stock request to Shopee Open API v2.
     * Updates seller stock for a single item_id and its specified model_ids.
     *
     * @param ShopeeAccount $account
     * @param int $itemId
     * @param array $stockList Array of ['model_id' => int, 'stock' => int, 'location_id' => ?string]
     * @return array
     */
    public function updateStockRaw(ShopeeAccount $account, int $itemId, array $stockList): array
    {
        $path        = '/api/v2/product/update_stock';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
        ];

        $url = $this->host . $path . '?' . http_build_query($queryParams);

        $formattedStockList = [];
        foreach ($stockList as $entry) {
            $sellerStock = [
                'stock' => (int) ($entry['stock'] ?? 0),
            ];
            if (! empty($entry['location_id'])) {
                $sellerStock['location_id'] = (string) $entry['location_id'];
            }

            $modelId = (int) ($entry['model_id'] ?? 0);
            $itemPayload = [
                'seller_stock' => [$sellerStock],
            ];
            if ($modelId > 0) {
                $itemPayload['model_id'] = $modelId;
            } else {
                $itemPayload['model_id'] = 0;
            }

            $formattedStockList[] = $itemPayload;
        }

        $payload = [
            'item_id'    => (int) $itemId,
            'stock_list' => $formattedStockList,
        ];

        $response = Http::timeout(25)->post($url, $payload);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $msg = $data['message'] ?? $data['error'] ?? 'Gagal mengubah stok di Shopee';
            throw new RuntimeException("Shopee Update Stock API Error: {$msg}");
        }

        return $data['response'] ?? [];
    }

    /**
     * Zero out stock on Shopee for given ShopeeProduct IDs.
     * Groups by item_id and sends update_stock calls.
     * Updates local ShopeeProduct records upon success.
     *
     * @param ShopeeAccount $account
     * @param array $productIds
     * @return array
     */
    public function zeroOutShopeeProducts(ShopeeAccount $account, array $productIds): array
    {
        if (empty($account->access_token)) {
            throw new RuntimeException('Toko Shopee belum terhubung (access_token kosong).');
        }

        if ($account->token_expires_at && $account->token_expires_at->isPast()) {
            $account = $this->refreshAccessToken($account);
        }

        $products = ShopeeProduct::where('shopee_account_id', $account->id)
            ->whereIn('id', $productIds)
            ->get();

        if ($products->isEmpty()) {
            return [
                'success'       => false,
                'message'       => 'Tidak ada produk Shopee yang ditemukan untuk dikosongkan.',
                'updated_count' => 0,
                'failures'      => [],
            ];
        }

        // Group by item_id
        $grouped = $products->groupBy('item_id');
        $successCount = 0;
        $failures = [];
        $now = now();

        foreach ($grouped as $itemId => $items) {
            $stockList = [];
            foreach ($items as $product) {
                $stockList[] = [
                    'model_id' => (int) ($product->model_id ?? 0),
                    'stock'    => 0,
                ];
            }

            try {
                $apiRes = $this->updateStockRaw($account, (int) $itemId, $stockList);

                // Cek jika Shopee mengembalikan failure_list untuk model tertentu
                $apiFailures = $apiRes['failure_list'] ?? [];
                $failedModelIds = [];
                $campaignRetryList = [];

                foreach ($apiFailures as $fail) {
                    $mId = (int) ($fail['model_id'] ?? 0);
                    $reason = (string) ($fail['failed_reason'] ?? '');

                    $matchingProd = $items->first(fn ($p) => (int) ($p->model_id ?? 0) === $mId);
                    $reserved = $matchingProd ? (int) ($matchingProd->reserved_stock ?? 0) : 0;

                    // Jika gagal karena proteksi promosi/campaign dan ada kuota promo, mentokkan ke kuota promo
                    if ($reserved > 0 && (stripos($reason, 'campaign') !== false || stripos($reason, 'promot') !== false || stripos($reason, 'reserved') !== false || stripos($reason, 'promo') !== false)) {
                        $campaignRetryList[] = [
                            'model_id' => $mId,
                            'stock'    => $reserved,
                        ];
                    } else {
                        $failedModelIds[] = $mId;
                        $failures[] = [
                            'item_id'  => $itemId,
                            'model_id' => $mId,
                            'reason'   => $reason ?: 'Gagal update stok di Shopee',
                        ];
                    }
                }

                // Lakukan retry untuk variasi yang terkunci campaign (mentokkan kuota)
                if (! empty($campaignRetryList)) {
                    try {
                        $retryRes = $this->updateStockRaw($account, (int) $itemId, $campaignRetryList);
                        $retryFailures = $retryRes['failure_list'] ?? [];
                        foreach ($retryFailures as $rf) {
                            $rfmId = (int) ($rf['model_id'] ?? 0);
                            $failedModelIds[] = $rfmId;
                            $failures[] = [
                                'item_id'  => $itemId,
                                'model_id' => $rfmId,
                                'reason'   => $rf['failed_reason'] ?? 'Gagal mentokkan kuota campaign',
                            ];
                        }
                    } catch (\Throwable $re) {
                        foreach ($campaignRetryList as $cEntry) {
                            $failedModelIds[] = $cEntry['model_id'];
                            $failures[] = [
                                'item_id'  => $itemId,
                                'model_id' => $cEntry['model_id'],
                                'reason'   => 'Gagal mentokkan kuota campaign: ' . $re->getMessage(),
                            ];
                        }
                    }
                }

                // Update lokal untuk produk yang berhasil
                foreach ($items as $product) {
                    $mId = (int) ($product->model_id ?? 0);
                    if (! in_array($mId, $failedModelIds, true)) {
                        $reserved = (int) ($product->reserved_stock ?? 0);
                        $product->update([
                            'stock'               => 0,
                            'locked_campaign_qty' => $reserved,
                            'was_campaign_locked' => $reserved > 0,
                            'last_synced_at'      => $now,
                        ]);
                        $successCount++;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning("[ShopeeZeroOut] Gagal update stok item_id {$itemId}: " . $e->getMessage());
                $failures[] = [
                    'item_id' => $itemId,
                    'sku'     => $items->pluck('sku')->filter()->implode(', '),
                    'reason'  => $e->getMessage(),
                ];
            }
        }

        return [
            'success'       => $successCount > 0,
            'updated_count' => $successCount,
            'failures'      => $failures,
            'message'       => $successCount > 0
                ? "Berhasil mengosongkan stok {$successCount} SKU variasi di Shopee!"
                : "Gagal mengosongkan stok di Shopee. " . ($failures[0]['reason'] ?? 'Silakan periksa log.'),
        ];
    }

    /**
     * Update/Restock stock on Shopee for given array of updates:
     * [
     *    ['product_id' => 123, 'stock' => 10],
     *    ...
     * ]
     *
     * @param ShopeeAccount $account
     * @param array $updates Array of ['product_id' => int, 'stock' => int]
     * @return array
     */
    public function updateShopeeProductsStock(ShopeeAccount $account, array $updates): array
    {
        if (empty($account->access_token)) {
            throw new RuntimeException('Toko Shopee belum terhubung (access_token kosong).');
        }

        if ($account->token_expires_at && $account->token_expires_at->isPast()) {
            $account = $this->refreshAccessToken($account);
        }

        $productIds = array_column($updates, 'product_id');
        $stocksByProdId = [];
        foreach ($updates as $u) {
            $stocksByProdId[(int) $u['product_id']] = max(0, (int) $u['stock']);
        }

        $products = ShopeeProduct::where('shopee_account_id', $account->id)
            ->whereIn('id', $productIds)
            ->get();

        if ($products->isEmpty()) {
            return [
                'success'       => false,
                'message'       => 'Tidak ada produk Shopee yang ditemukan untuk diubah stoknya.',
                'updated_count' => 0,
                'failures'      => [],
            ];
        }

        $grouped = $products->groupBy('item_id');
        $successCount = 0;
        $failures = [];
        $now = now();
        $hasCampaignCol = \Illuminate\Support\Facades\Schema::hasColumn('shopee_products', 'was_campaign_locked');

        foreach ($grouped as $itemId => $items) {
            $stockList = [];
            foreach ($items as $product) {
                $targetStock = $stocksByProdId[$product->id] ?? 0;
                $stockList[] = [
                    'model_id' => (int) ($product->model_id ?? 0),
                    'stock'    => $targetStock,
                ];
            }

            try {
                $apiRes = $this->updateStockRaw($account, (int) $itemId, $stockList);
                $apiFailures = $apiRes['failure_list'] ?? [];
                $failedModelIds = [];

                foreach ($apiFailures as $fail) {
                    $mId = (int) ($fail['model_id'] ?? 0);
                    $failedModelIds[] = $mId;
                    $failures[] = [
                        'item_id'  => $itemId,
                        'model_id' => $mId,
                        'reason'   => $fail['failed_reason'] ?? 'Gagal update stok di Shopee',
                    ];
                }

                // Update database lokal untuk variasi yang sukses
                foreach ($items as $product) {
                    $mId = (int) ($product->model_id ?? 0);
                    if (! in_array($mId, $failedModelIds, true)) {
                        $targetStock = $stocksByProdId[$product->id] ?? 0;
                        $updateData = [
                            'stock'          => $targetStock,
                            'last_synced_at' => $now,
                        ];
                        if ($hasCampaignCol && $targetStock > 0) {
                            $updateData['was_campaign_locked'] = false;
                        }
                        $product->update($updateData);
                        $successCount++;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning("[ShopeeUpdateStock] Gagal update stok item_id {$itemId}: " . $e->getMessage());
                foreach ($items as $product) {
                    $failures[] = [
                        'item_id'  => $itemId,
                        'model_id' => (int) ($product->model_id ?? 0),
                        'sku'      => $product->sku,
                        'reason'   => $e->getMessage(),
                    ];
                }
            }
        }

        return [
            'success'       => $successCount > 0,
            'updated_count' => $successCount,
            'failures'      => $failures,
            'message'       => $successCount > 0
                ? "Berhasil memperbarui stok {$successCount} variasi di Shopee!" . (! empty($failures) ? " (" . count($failures) . " variasi gagal)" : "")
                : "Gagal memperbarui stok di Shopee. " . ($failures[0]['reason'] ?? 'Silakan periksa koneksi token Shopee.'),
        ];
    }
}
