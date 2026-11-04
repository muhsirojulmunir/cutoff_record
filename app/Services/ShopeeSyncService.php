<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\CutOffReturn;
use App\Models\ShopeeAccount;
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

    public function __construct()
    {
        $this->host = config('services.shopee.host', 'https://partner.shopeemobile.com');
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
     * Synchronize Shopee orders directly into CutOffOrder table.
     */
    public function syncOrdersToCutOff(ShopeeAccount $account, ?int $timeFrom = null, ?int $timeTo = null): array
    {
        $timeTo = $timeTo ?: time();
        $timeFrom = $timeFrom ?: ($timeTo - (14 * 86400)); // Default last 14 days

        $account = $this->ensureValidToken($account);

        // 1. Fetch Order List in 14-day chunks to respect Shopee's 15-day range limit
        $maxWindow   = 14 * 86400;
        $allOrderSns = [];
        $currentTo   = $timeTo;

        while ($currentTo > $timeFrom) {
            $currentFrom = max($timeFrom, $currentTo - $maxWindow);
            $chunkList   = $this->fetchOrderListRaw($account, $currentFrom, $currentTo, 100);

            foreach ($chunkList as $ord) {
                if (! empty($ord['order_sn'])) {
                    $allOrderSns[$ord['order_sn']] = true;
                }
            }

            $currentTo = $currentFrom;
        }

        $orderSns = array_keys($allOrderSns);

        if (empty($orderSns)) {
            $account->update([
                'last_synced_at'   => now(),
                'last_sync_status' => 'success',
                'last_sync_error'  => null,
            ]);

            return [
                'total_fetched' => 0,
                'created'       => 0,
                'updated'       => 0,
                'message'       => 'Tidak ada pesanan Shopee pada rentang waktu tersebut.',
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
                    $reqs["escrow_{$idx}"] = $pool->as("escrow_{$idx}")->timeout(20)->post($escrowUrl, [
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
                        if (! empty($data['response']['escrow_detail_list'])) {
                            foreach ($data['response']['escrow_detail_list'] as $escrow) {
                                $sn = $escrow['order_sn'] ?? null;
                                if ($sn) {
                                    $escrowMap[$sn] = $escrow['order_income'] ?? [];
                                }
                            }
                        }
                    }
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
                $escrowMap = array_merge($escrowMap, $escrows);
            }
        }

        // 3. Ingest into CutOffOrder table (Optimized: 1 Single Preload Query + DB Transaction)
        $this->ensureSchema();
        $hasCancelBy     = Schema::hasColumn('cut_off_orders', 'cancel_by');
        $hasCancelReason = Schema::hasColumn('cut_off_orders', 'cancel_reason');

        $allOrderSnsToSave = [];
        foreach ($detailedOrders as $o) {
            if (! empty($o['order_sn'])) {
                $allOrderSnsToSave[] = $o['order_sn'];
            }
        }

        $existingOrders = CutOffOrder::whereIn('order_number', $allOrderSnsToSave)
            ->get()
            ->keyBy('order_number');

        $createdCount = 0;
        $updatedCount = 0;

        \Illuminate\Support\Facades\DB::transaction(function () use (
            $detailedOrders, $existingOrders, $escrowMap, $hasCancelBy, $hasCancelReason,
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
                if (empty($escrowIncome) && count($detailedOrders) <= 5) {
                    $escrowIncome = $this->fetchSingleEscrowDetail($account, $orderSn);
                    if (! empty($escrowIncome)) {
                        $escrowMap[$orderSn] = $escrowIncome;
                    }
                }

                $calc          = $this->calculateNetIncome($order, $escrowIncome);
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

                $rawCancelBy = (string) ($order['cancel_by'] ?? '');
                $cancelByLabel = match (strtolower($rawCancelBy)) {
                    'buyer'            => 'Pembeli',
                    'seller'           => 'Penjual',
                    'shopee', 'system' => 'Sistem Shopee',
                    default            => $rawCancelBy ? ucfirst($rawCancelBy) : null,
                };
                $cancelReason = ! empty($order['cancel_reason']) ? trim((string) $order['cancel_reason']) : null;

                // Status mapping: JANGAN ubah jika status resmi Shopee sudah 'CANCELLED' (Batal)
                if ($rawStatus !== 'CANCELLED' && $statusText !== 'Batal' && ! empty($order['package_list'])) {
                    foreach ($order['package_list'] as $pkg) {
                        $logStatus = strtoupper((string) ($pkg['logistics_status'] ?? ''));
                        if (in_array($logStatus, ['LOGISTICS_DELIVERED'], true)) {
                            $statusText = 'Selesai';
                            break;
                        } elseif (in_array($logStatus, ['LOGISTICS_PICKUP_DONE'], true)) {
                            if (str_contains($statusText, 'Perlu Dikirim') || $statusText === 'Diproses' || empty($statusText)) {
                                $statusText = 'Dikirim';
                            }
                            break;
                        }
                    }
                }

                // If status is Batal, net income is 0 and fill cancel details
                $keteranganSolutif = null;
                if ($statusText === 'Batal') {
                    $calculatedNet = 0; // Cancelled orders yield Rp 0 payout
                    if ($cancelReason) {
                        $keteranganSolutif = $cancelByLabel ? "[{$cancelByLabel}] {$cancelReason}" : $cancelReason;
                    } elseif ($cancelByLabel) {
                        $keteranganSolutif = "Dibatalkan oleh {$cancelByLabel}";
                    } else {
                        $keteranganSolutif = 'Pesanan Dibatalkan';
                    }
                }

                $orderDate = ! empty($order['create_time'])
                    ? \Carbon\Carbon::createFromTimestamp((int) $order['create_time'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                    : now('Asia/Jakarta')->format('Y-m-d H:i:s');
                $shipByDate = ! empty($order['ship_by_date'])
                    ? \Carbon\Carbon::createFromTimestamp((int) $order['ship_by_date'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                    : null;

                $existing = $existingOrders->get($orderSn);

                $payload = [
                    'order_date'             => $orderDate,
                    'ship_by_date'           => $shipByDate,
                    'channel'                => 'SH',
                    'order_number'           => $orderSn,
                    'buyer_username'         => $order['buyer_username'] ?? $order['buyer_user_id'] ?? null,
                    'shipping_courier'       => $shippingCourier,
                    'payment_method'         => $paymentMethod,
                    'sku_utama'              => $firstItem['model_sku'] ?? $firstItem['item_sku'] ?? null,
                    'product_name'           => $firstItem['item_name'] ?? 'Produk Shopee',
                    'qty'                    => $totalQty,
                    'package_count'          => count($items) ?: 1,
                    'order_status'           => $statusText,
                    'keterangan_solutif'     => $keteranganSolutif,
                    'est_net_income'         => $calculatedNet,
                    'marketplace_net_payout' => $calculatedNet,
                ];

                if ($hasCancelBy) {
                    $payload['cancel_by'] = $cancelByLabel;
                }
                if ($hasCancelReason) {
                    $payload['cancel_reason'] = $cancelReason;
                }

                if ($existing) {
                    // Update existing record (including exact order_date with time)
                    $updateData = [
                        'order_date'             => $orderDate,
                        'order_status'           => $statusText,
                        'shipping_courier'       => $shippingCourier ?: $existing->shipping_courier,
                        'payment_method'         => $paymentMethod,
                        'est_net_income'         => $calculatedNet,
                        'marketplace_net_payout' => $calculatedNet,
                        'keterangan_solutif'     => $keteranganSolutif ?: $existing->keterangan_solutif,
                        'sku_utama'              => $payload['sku_utama'] ?: $existing->sku_utama,
                        'product_name'           => $payload['product_name'] ?: $existing->product_name,
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

                    $existing->update($updateData);
                    $updatedCount++;
                } else {
                    CutOffOrder::create($payload);
                    $createdCount++;
                }
            }
        });

        $account->update([
            'last_synced_at'   => now(),
            'last_sync_status' => 'success',
            'last_sync_error'  => null,
        ]);

        return [
            'total_fetched' => count($detailedOrders),
            'created'       => $createdCount,
            'updated'       => $updatedCount,
            'message'       => "Sinkronisasi berhasil! {$createdCount} pesanan baru ditambahkan, {$updatedCount} diperbarui.",
        ];
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
    private function fetchOrderListRaw(ShopeeAccount $account, int $timeFrom, int $timeTo, int $pageSize = 100): array
    {
        $path        = '/api/v2/order/get_order_list';
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

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
                'time_range_field' => 'create_time',
                'time_from'        => $timeFrom,
                'time_to'          => $timeTo,
                'page_size'        => $pageSize,
            ];

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
    public function buildOrderDetailUrl(ShopeeAccount $account, array $orderSns): string
    {
        $path        = '/api/v2/order/get_order_detail';
        $timestamp   = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId      = (int) $account->shop_id;
        $partnerId   = (int) $account->partner_id;
        $partnerKey  = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $queryParams = [
            'partner_id'               => $partnerId,
            'timestamp'                => $timestamp,
            'sign'                     => $sign,
            'access_token'             => $accessToken,
            'shop_id'                  => $shopId,
            'order_sn_list'            => implode(',', $orderSns),
            'response_optional_fields' => 'buyer_user_id,buyer_username,item_list,package_list,shipping_carrier,total_amount,cancel_by,cancel_reason,payment_info,payment_method,ship_by_date',
        ];

        return $this->host . $path . '?' . http_build_query($queryParams);
    }

    /**
     * Fetch raw order details in batch from Shopee API v2.
     */
    private function fetchOrderDetailRaw(ShopeeAccount $account, array $orderSns): array
    {
        if (empty($orderSns)) return [];

        $url = $this->buildOrderDetailUrl($account, $orderSns);

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
            $response = Http::timeout(25)->post($url, [
                'order_sn_list' => array_values($orderSns),
            ]);

            $data = $response->json();
            if ($response->failed() || ! empty($data['error'])) {
                Log::warning('Shopee Escrow Batch Warning: ' . ($data['message'] ?? $data['error'] ?? 'Unknown error'));
                return [];
            }

            $escrowList = $data['response']['escrow_detail_list'] ?? [];
            $mapped = [];
            foreach ($escrowList as $item) {
                $sn = $item['order_sn'] ?? null;
                if ($sn) {
                    $mapped[$sn] = $item['order_income'] ?? [];
                }
            }
            return $mapped;
        } catch (\Throwable $e) {
            Log::warning('Shopee fetchEscrowDetailBatch Exception: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Fetch single order escrow detail from Shopee API v2.
     */
    public function fetchSingleEscrowDetail(ShopeeAccount $account, string $orderSn): array
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

        $url = $this->host . $path . '?' . http_build_query($queryParams);

        try {
            $response = Http::timeout(15)->get($url);
            $data = $response->json();
            return $data['response']['order_income'] ?? [];
        } catch (\Throwable $e) {
            return [];
        }
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
     * Jika Status = 'Batal', Est. Bersih = 0
     */
    public function calculateNetIncome(array $order, array $escrowIncome = []): array
    {
        $items = $order['item_list'] ?? [];

        // 1. Hitung Subtotal Pesanan (Harga produk yang dibeli sebelum voucher)
        $subtotalOrder = 0.0;
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
            $itemQty = (int) ($it['model_quantity_purchased'] ?? $it['quantity_purchased'] ?? $it['model_quantity'] ?? 1);
            if ($itemQty <= 0) $itemQty = 1;

            $subtotalOrder += ($itemPrice * $itemQty);
        }

        // 2. Hitung Voucher Ditanggung Penjual
        $paymentInfo = $order['payment_info'] ?? [];
        $itemVouchers = 0.0;
        foreach ($items as $it) {
            if (! empty($it['discount_from_voucher_seller'])) {
                $itemVouchers += (float) $it['discount_from_voucher_seller'];
            }
        }

        $sellerVoucher = 0.0;
        if (! empty($paymentInfo['voucher_from_seller']) && (float) $paymentInfo['voucher_from_seller'] > 0) {
            $sellerVoucher = (float) $paymentInfo['voucher_from_seller'];
        } elseif (! empty($paymentInfo['seller_voucher_discount']) && (float) $paymentInfo['seller_voucher_discount'] > 0) {
            $sellerVoucher = (float) $paymentInfo['seller_voucher_discount'];
        } elseif ($itemVouchers > 0) {
            $sellerVoucher = $itemVouchers;
        } elseif (! empty($escrowIncome['voucher_from_seller']) && (float) $escrowIncome['voucher_from_seller'] > 0) {
            $sellerVoucher = (float) $escrowIncome['voucher_from_seller'];
        } elseif (! empty($escrowIncome['seller_voucher_discount']) && (float) $escrowIncome['seller_voucher_discount'] > 0) {
            $sellerVoucher = (float) $escrowIncome['seller_voucher_discount'];
        } elseif (! empty($order['voucher_from_seller']) && (float) $order['voucher_from_seller'] > 0) {
            $sellerVoucher = (float) $order['voucher_from_seller'];
        }

        if ($sellerVoucher < 0) {
            $sellerVoucher = 0.0;
        }

        // Fallback / Koreksi dengan total_amount aktual dari Shopee
        $rawTotal = (float) ($order['total_amount'] ?? 0);
        if ($rawTotal > 0 && ($subtotalOrder <= 0 || $rawTotal < $subtotalOrder)) {
            // Gunakan nilai transaksi aktual dari Shopee Seller Centre jika model_original_price katalog lebih tinggi
            $subtotalOrder = $rawTotal;
        } elseif ($subtotalOrder <= 0) {
            $cogs     = (float) ($escrowIncome['cost_of_goods_sold'] ?? 0);
            $origCogs = (float) ($escrowIncome['original_cost_of_goods_sold'] ?? 0);
            $sellerDisc = (float) ($escrowIncome['seller_discount'] ?? 0);

            if ($origCogs > 0) {
                $subtotalOrder = max(0, $origCogs - $sellerDisc);
            } elseif ($cogs > 0) {
                $subtotalOrder = $cogs;
            } elseif ($rawTotal > 0) {
                $subtotalOrder = $rawTotal;
            }
        }

        // 3. Terapkan Rumus: Est. Bersih = (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
        // Jika Voucher Ditanggung Penjual = 0, maka (Subtotal Pesanan - 0) * 79%
        $netBase = max(0, $subtotalOrder - $sellerVoucher);
        $estBersih = (float) round($netBase * 0.79);

        return [
            'subtotal_order' => $subtotalOrder,
            'seller_voucher' => $sellerVoucher,
            'est_net_income' => $estBersih,
        ];
    }

    /**
     * Hitung ulang Est. Bersih untuk seluruh pesanan Cut Off di database
     * menggunakan rumus resmi: (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
     * Jika Voucher Ditanggung Penjual = 0, maka (Subtotal Pesanan - 0) * 79%
     */
    public function recalculateAllOrders(?ShopeeAccount $account = null): array
    {
        if (! $account) {
            $account = ShopeeAccount::where('status', 'active')
                ->whereNotNull('access_token')
                ->first();
        }

        // 1. Semua pesanan berstatus Batal otomatis Est. Bersih = 0
        CutOffOrder::where('order_status', 'Batal')
            ->update([
                'est_net_income'         => 0,
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

        $updatedCount = 0;

        // 2. Ambil data pesanan langsung dari Shopee Open API v2 dalam batch 50 pesanan
        if ($account && ! empty($account->access_token)) {
            $account = $this->ensureValidToken($account);
            $orderSns = $orders->pluck('order_number')->filter()->unique()->values()->toArray();

            $chunks = array_chunk($orderSns, 50);
            foreach ($chunks as $chunk) {
                try {
                    $detailedOrders = $this->fetchOrderDetailRaw($account, $chunk);
                    foreach ($detailedOrders as $shopeeOrder) {
                        $sn = $shopeeOrder['order_sn'] ?? null;
                        if (! $sn) continue;

                        $rawStatus  = (string) ($shopeeOrder['order_status'] ?? '');
                        $statusText = $this->mapOrderStatus($rawStatus);

                        if ($statusText === 'Batal' || $rawStatus === 'CANCELLED') {
                            $calculatedNet = 0;
                        } else {
                            $calc = $this->calculateNetIncome($shopeeOrder);
                            $calculatedNet = $calc['est_net_income'];
                        }

                        CutOffOrder::where('order_number', $sn)->update([
                            'est_net_income'         => $calculatedNet,
                            'marketplace_net_payout' => $calculatedNet,
                        ]);

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
            $baseItems = $this->fetchItemBaseInfoRaw($account, $chunkItemIds);

            foreach ($baseItems as $item) {
                $itemId   = (int) ($item['item_id'] ?? 0);
                $itemName = (string) ($item['item_name'] ?? 'Produk Shopee');
                $hasModel = ! empty($item['has_model']);
                $itemStatus = (string) ($item['item_status'] ?? 'NORMAL');

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
                                    'sku'               => $modelSku ?: null,
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
                            'sku'               => $itemSku ?: null,
                            'stock'             => $stock,
                            'reserved_stock'    => $reservedStock,
                            'price'             => $price,
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
}
