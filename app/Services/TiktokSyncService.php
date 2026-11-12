<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\CutOffReturn;
use App\Models\TiktokAccount;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class TiktokSyncService
{
    private string $authHost;
    private string $openHost;
    private string $authUrl;

    public function __construct()
    {
        $this->authHost = config('services.tiktok.auth_host', 'https://auth.tiktok-shops.com');
        $this->openHost = config('services.tiktok.open_host', 'https://open-api.tiktokglobalshop.com');
        $this->authUrl  = config('services.tiktok.auth_url', 'https://services.tiktokshop.com/open/authorize');
    }

    /**
     * Generate TikTok Shop OAuth authorization URL.
     */
    public function getAuthorizationUrl(TiktokAccount $account, string $redirectUrl, ?string $state = null): string
    {
        $serviceId = $account->service_id ?: $account->app_key;

        if (empty($serviceId)) {
            throw new RuntimeException('App Key atau Service ID belum diisi.');
        }

        $state = $state ?: bin2hex(random_bytes(8));

        return sprintf(
            '%s?service_id=%s&state=%s',
            $this->authUrl,
            urlencode($serviceId),
            urlencode($state)
        );
    }

    /**
     * Exchange auth code for access_token and refresh_token.
     */
    public function exchangeCode(TiktokAccount $account, string $code): TiktokAccount
    {
        $appKey    = $account->app_key;
        $appSecret = $account->app_secret;

        if (empty($appKey) || empty($appSecret)) {
            throw new RuntimeException('App Key dan App Secret belum dikonfigurasi.');
        }

        $url = sprintf(
            '%s/api/v2/token/get?app_key=%s&app_secret=%s&auth_code=%s&grant_type=authorized_code',
            $this->authHost,
            urlencode($appKey),
            urlencode($appSecret),
            urlencode($code)
        );

        $response = Http::timeout(15)->get($url);

        if (! $response->successful()) {
            throw new RuntimeException("Gagal menghubungi TikTok Auth API: HTTP {$response->status()}");
        }

        $data = $response->json();

        if (($data['code'] ?? -1) !== 0) {
            $msg = $data['message'] ?? 'Unknown error';
            throw new RuntimeException("TikTok Auth API error ({$data['code']}): {$msg}");
        }

        $tokenData = $data['data'] ?? [];
        $accessToken  = $tokenData['access_token'] ?? null;
        $refreshToken = $tokenData['refresh_token'] ?? null;
        $expireIn     = (int) ($tokenData['access_token_expire_in'] ?? 86400);
        $refreshExpireIn = (int) ($tokenData['refresh_token_expire_in'] ?? 31536000);
        $sellerName   = $tokenData['seller_name'] ?? null;

        if (! $accessToken) {
            throw new RuntimeException('Tidak ada access_token dalam respon TikTok.');
        }

        $updateData = [
            'access_token'       => $accessToken,
            'refresh_token'      => $refreshToken,
            'token_expires_at'   => now()->addSeconds($expireIn),
            'refresh_expires_at' => now()->addSeconds($refreshExpireIn),
            'connection_status'  => 'connected',
            'last_sync_error'    => null,
        ];

        if (! empty($sellerName)) {
            $updateData['account_name'] = $sellerName;
        }

        $account->update($updateData);

        // Fetch authorized shops immediately to get shop_id and shop_cipher
        try {
            $this->fetchAuthorizedShops($account);
        } catch (\Exception $e) {
            Log::warning('TikTok fetchAuthorizedShops error right after OAuth: ' . $e->getMessage());
        }

        return $account->fresh();
    }

    /**
     * Refresh an expired access_token using refresh_token.
     */
    public function refreshToken(TiktokAccount $account): TiktokAccount
    {
        $appKey       = $account->app_key;
        $appSecret    = $account->app_secret;
        $refreshToken = $account->refresh_token;

        if (empty($appKey) || empty($appSecret) || empty($refreshToken)) {
            throw new RuntimeException('Kredensial atau Refresh Token TikTok tidak tersedia.');
        }

        $url = sprintf(
            '%s/api/v2/token/refresh?app_key=%s&app_secret=%s&refresh_token=%s&grant_type=refresh_token',
            $this->authHost,
            urlencode($appKey),
            urlencode($appSecret),
            urlencode($refreshToken)
        );

        $response = Http::timeout(15)->get($url);

        if (! $response->successful()) {
            throw new RuntimeException("Gagal merefresh token TikTok: HTTP {$response->status()}");
        }

        $data = $response->json();

        if (($data['code'] ?? -1) !== 0) {
            $msg = $data['message'] ?? 'Unknown error';
            $account->update([
                'connection_status' => 'expired',
                'last_sync_error'   => "Gagal merefresh token: {$msg}",
            ]);
            throw new RuntimeException("TikTok Token Refresh error ({$data['code']}): {$msg}");
        }

        $tokenData = $data['data'] ?? [];
        $newAccess  = $tokenData['access_token'] ?? null;
        $newRefresh = $tokenData['refresh_token'] ?? $refreshToken;
        $expireIn   = (int) ($tokenData['access_token_expire_in'] ?? 86400);
        $refreshExpireIn = (int) ($tokenData['refresh_token_expire_in'] ?? 31536000);

        $account->update([
            'access_token'       => $newAccess,
            'refresh_token'      => $newRefresh,
            'token_expires_at'   => now()->addSeconds($expireIn),
            'refresh_expires_at' => now()->addSeconds($refreshExpireIn),
            'connection_status'  => 'connected',
            'last_sync_error'    => null,
        ]);

        return $account->fresh();
    }

    /**
     * Generate HMAC-SHA256 signature for TikTok Shop Open API request.
     * Official specification: app_secret + path + sorted_params + body + app_secret
     */
    public function generateSignature(string $path, array $params, string $appSecret, string $body = ''): string
    {
        unset($params['sign'], $params['access_token']);

        ksort($params);

        $paramString = '';
        foreach ($params as $k => $v) {
            $paramString .= (string) $k . (string) $v;
        }

        $stringToSign = $appSecret . $path . $paramString . $body . $appSecret;

        return hash_hmac('sha256', $stringToSign, $appSecret);
    }

    /**
     * Fetch authorized shops list and update shop_id and shop_cipher.
     */
    public function fetchAuthorizedShops(TiktokAccount $account): array
    {
        $this->ensureValidAccessToken($account);

        $path      = '/authorization/202309/shops';
        $timestamp = time();

        $params = [
            'app_key'   => $account->app_key,
            'timestamp' => (string) $timestamp,
        ];

        $sign = $this->generateSignature($path, $params, $account->app_secret);
        $params['sign'] = $sign;

        $url = $this->openHost . $path . '?' . http_build_query($params);

        $response = Http::timeout(15)
            ->withHeaders([
                'Content-Type'       => 'application/json',
                'x-tts-access-token' => $account->access_token,
            ])
            ->get($url);

        if (! $response->successful()) {
            $errData = $response->json();
            $detail  = $errData['message'] ?? $response->body();
            throw new RuntimeException("Gagal mengambil info toko TikTok: HTTP {$response->status()} - {$detail}");
        }

        $res = $response->json();

        if (($res['code'] ?? -1) !== 0) {
            $msg = $res['message'] ?? 'Gagal query toko';
            throw new RuntimeException("TikTok API error ({$res['code']}): {$msg}");
        }

        $shops = $res['data']['shops'] ?? [];

        if (! empty($shops)) {
            $firstShop = $shops[0];
            $account->update([
                'shop_id'     => (string) ($firstShop['id'] ?? $account->shop_id),
                'shop_cipher' => (string) ($firstShop['cipher'] ?? $account->shop_cipher),
                'account_name'=> (string) ($firstShop['name'] ?? $account->account_name),
            ]);
        }

        return $shops;
    }

    /**
     * Test TikTok API connection.
     */
    public function testConnection(TiktokAccount $account): array
    {
        if (empty($account->app_key) || empty($account->app_secret)) {
            return [
                'success' => false,
                'message' => 'App Key dan App Secret belum dikonfigurasi.',
            ];
        }

        if (empty($account->access_token)) {
            return [
                'success' => false,
                'message' => 'Akun belum diotorisasi via OAuth. Silakan klik Hubungkan Toko TikTok terlebih dahulu.',
            ];
        }

        try {
            $shops = $this->fetchAuthorizedShops($account);
            $shopName = $account->account_name ?: 'Toko TikTok';
            $shopId   = $account->shop_id ?: '-';

            return [
                'success' => true,
                'message' => "Koneksi ke TikTok Shop ({$shopName} - ID: {$shopId}) aktif dan valid!",
            ];
        } catch (\Exception $e) {
            return [
                'success' => false,
                'message' => 'Gagal verifikasi koneksi TikTok: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Ensure access token is still fresh, refresh automatically if close to expiration.
     */
    private function ensureValidAccessToken(TiktokAccount $account): void
    {
        if (! $account->token_expires_at || $account->token_expires_at->isPast() || $account->token_expires_at->diffInMinutes(now()) < 30) {
            if (! empty($account->refresh_token)) {
                $this->refreshToken($account);
            }
        }
    }

    /**
     * Sync orders from TikTok Shop API directly into CutOffOrder table.
     */
    public function syncOrdersToCutOff(TiktokAccount $account, int $timeFrom, int $timeTo): array
    {
        $this->ensureValidAccessToken($account);

        if (empty($account->shop_cipher)) {
            $this->fetchAuthorizedShops($account);
        }

        $shopCipher = $account->shop_cipher;
        if (empty($shopCipher)) {
            throw new RuntimeException('Shop Cipher TikTok tidak ditemukan. Pastikan toko sudah terhubung dengan benar.');
        }

        $path = '/order/202309/orders/search';
        $allOrders = [];
        $pageToken = null;
        $maxPages  = 10;
        $pageCount = 0;

        do {
            $pageCount++;
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $shopCipher,
                'page_size'   => '50',
            ];

            $bodyPayload = [
                'create_time_ge' => $timeFrom,
                'create_time_lt' => $timeTo,
            ];
            if (! empty($pageToken)) {
                $bodyPayload['page_token'] = $pageToken;
            }
            $bodyJson = json_encode($bodyPayload);

            $sign = $this->generateSignature($path, $queryParams, $account->app_secret, $bodyJson);
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(25)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->withBody($bodyJson, 'application/json')
                ->send('POST', $url);

            if (! $response->successful()) {
                $errData = $response->json();
                $detail  = $errData['message'] ?? $response->body();
                throw new RuntimeException("Gagal mengambil pesanan TikTok: HTTP {$response->status()} - {$detail}");
            }

            $res = $response->json();

            if (($res['code'] ?? -1) !== 0) {
                $msg = $res['message'] ?? 'Gagal query pesanan TikTok';
                $account->update([
                    'last_sync_status' => 'failed',
                    'last_sync_error'  => $msg,
                ]);
                throw new RuntimeException("TikTok Order API error ({$res['code']}): {$msg}");
            }

            $pageOrders = $res['data']['orders'] ?? [];
            if (! empty($pageOrders)) {
                $allOrders = array_merge($allOrders, $pageOrders);
            }

            $pageToken = $res['data']['next_page_token'] ?? null;
        } while (! empty($pageToken) && $pageCount < $maxPages);

        app(ShopeeSyncService::class)->ensureSchema();
        $hasCancelBy           = Schema::hasColumn('cut_off_orders', 'cancel_by');
        $hasCancelReason       = Schema::hasColumn('cut_off_orders', 'cancel_reason');
        $hasFinancialBreakdown = Schema::hasColumn('cut_off_orders', 'financial_breakdown');
        $hasProcessedAt        = Schema::hasColumn('cut_off_orders', 'processed_at');

        $createdCount = 0;
        $updatedCount = 0;

        foreach ($allOrders as $order) {
            $orderId = (string) ($order['id'] ?? '');
            if (empty($orderId)) continue;

            $lineItems = $order['line_items'] ?? [];
            $firstItem = $lineItems[0] ?? [];
            $totalQty  = 0;
            $normalizedItems = [];
            foreach ($lineItems as $item) {
                $itemQty = max(1, (int) ($item['quantity'] ?? 1));
                $totalQty += $itemQty;
                $unitPrice = (float) ($item['sale_price'] ?? $item['original_price'] ?? 0);
                $normalizedItems[] = [
                    'name'      => $item['product_name'] ?? 'Produk TikTok Shop',
                    'variation' => ! empty($item['sku_name']) ? trim((string) $item['sku_name']) : null,
                    'sku'       => $item['seller_sku'] ?? $item['sku_id'] ?? null,
                    'qty'       => $itemQty,
                    'subtotal'  => round($unitPrice * $itemQty, 2),
                ];
            }
            if ($totalQty <= 0) $totalQty = 1;

            $statusRaw  = (string) ($order['status'] ?? '');
            $statusText = $this->mapOrderStatus($statusRaw);

            // Pesanan Cut Off hanya menampung pesanan yang telah diproses ("Diproses" dan seterusnya).
            if (CutOffOrder::isExcludedStatus($statusText, $statusRaw)) {
                $existing = CutOffOrder::withTrashed()
                    ->where('order_number', $orderId)
                    ->orderByRaw('CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END ASC')
                    ->orderBy('id', 'asc')
                    ->first();
                if ($existing && ! $existing->trashed()) {
                    $existing->delete();
                }
                continue;
            }

            // Rumus ERP: (Harga Produk - Voucher/Diskon Toko) * 79%
            $payment        = $order['payment'] ?? [];
            $productPrice   = (float) ($payment['original_total_product_price'] ?? $payment['total_amount'] ?? 0);
            $sellerDiscount = (float) ($payment['seller_discount'] ?? 0);
            if (empty($normalizedItems)) {
                $normalizedItems[] = [
                    'name'      => 'Produk TikTok Shop',
                    'variation' => null,
                    'sku'       => null,
                    'qty'       => $totalQty,
                    'subtotal'  => round($productPrice, 2),
                ];
            }
            $breakdown     = CutOffOrder::buildFinancialBreakdown(
                $normalizedItems,
                $sellerDiscount,
                0.79,
                $productPrice > 0 ? $productPrice : null,
                $statusText === 'Batal'
            );
            $calculatedNet = $breakdown['est_net_income'];

            $variationName = ! empty($firstItem['sku_name']) ? trim((string) $firstItem['sku_name']) : null;
            if (count($lineItems) > 1 && $variationName) {
                $variationName .= ' (+' . (count($lineItems) - 1) . ' item)';
            }

            // Format tanggal tepat WIB (Asia/Jakarta)
            $createTime = $order['create_time'] ?? null;
            $orderDate  = $createTime 
                ? Carbon::createFromTimestamp((int) $createTime, 'Asia/Jakarta')->format('Y-m-d H:i:s')
                : now('Asia/Jakarta')->toDateTimeString();

            // Batas kirim (ship by date) WIB jika tersedia
            $shipDueTime = $order['shipping_due_time'] ?? $order['rts_time'] ?? null;
            $shipByDate  = $shipDueTime 
                ? Carbon::createFromTimestamp((int) $shipDueTime, 'Asia/Jakarta')->format('Y-m-d H:i:s')
                : null;

            // Metode pembayaran & deteksi COD
            $paymentMethod = $order['payment_method_name'] ?? $payment['payment_method_name'] ?? null;
            if (! empty($order['is_cod']) || stripos((string) $paymentMethod, 'cod') !== false || stripos((string) $paymentMethod, 'cash on delivery') !== false) {
                $paymentMethod = 'COD (Bayar di Tempat)';
            }

            // Alasan & pembatalan
            $cancelReason = $order['cancel_reason'] ?? $order['cancellation']['cancel_reason'] ?? null;
            $cancelBy     = ! empty($order['cancel_user']) ? ucfirst(strtolower($order['cancel_user'])) : null;

            $existing = CutOffOrder::withTrashed()
                ->where('order_number', $orderId)
                ->orderByRaw('CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END ASC')
                ->orderBy('id', 'asc')
                ->first();

            $shouldKeepProcessedAt = $hasProcessedAt
                && $existing
                && ! $existing->trashed()
                && ! CutOffOrder::isExcludedStatus($existing->order_status)
                && $existing->processed_at !== null;

            $processedAt = null;
            if ($hasProcessedAt) {
                if ($shouldKeepProcessedAt) {
                    $processedAt = $existing->processed_at->format('Y-m-d H:i:s');
                } else {
                    $isProcessedStatus = strtoupper($statusRaw) === 'AWAITING_COLLECTION'
                        || stripos($statusText, 'menunggu pickup') !== false
                        || stripos($statusText, 'diproses') !== false;
                    if (! empty($order['rts_time'])) {
                        $processedAt = Carbon::createFromTimestamp((int) $order['rts_time'], 'Asia/Jakarta')->format('Y-m-d H:i:s');
                    } elseif ($isProcessedStatus) {
                        $procTs = $order['update_time'] ?? null;
                        $processedAt = ! empty($procTs)
                            ? Carbon::createFromTimestamp((int) $procTs, 'Asia/Jakarta')->format('Y-m-d H:i:s')
                            : now('Asia/Jakarta')->format('Y-m-d H:i:s');
                    } else {
                        $processedAt = $orderDate;
                    }
                }
            }

            $payload = [
                'order_date'             => $orderDate,
                'channel'                => 'TT',
                'order_number'           => $orderId,
                'buyer_username'         => $order['buyer_email'] ?? $order['recipient_address']['name'] ?? $order['buyer_uid'] ?? null,
                'shipping_courier'       => $order['shipping_provider'] ?? $order['delivery_option_name'] ?? null,
                'payment_method'         => $paymentMethod,
                'sku_utama'              => $firstItem['seller_sku'] ?? $firstItem['sku_id'] ?? null,
                'product_name'           => $firstItem['product_name'] ?? 'Produk TikTok Shop',
                'variation_name'         => $variationName,
                'qty'                    => $totalQty,
                'package_count'          => count($lineItems) ?: 1,
                'order_status'           => $statusText,
                'est_net_income'         => $calculatedNet,
                'marketplace_net_payout' => $calculatedNet,
            ];

            if ($shipByDate) {
                $payload['ship_by_date'] = $shipByDate;
            }
            if ($hasCancelBy && $cancelBy) {
                $payload['cancel_by'] = $cancelBy;
            }
            if ($hasCancelReason && $cancelReason) {
                $payload['cancel_reason'] = $cancelReason;
            }
            if ($hasFinancialBreakdown) {
                $payload['financial_breakdown'] = $breakdown;
            }
            if ($hasProcessedAt) {
                $payload['processed_at'] = $processedAt;
            }

            if ($existing) {
                $updateFields = [
                    'order_date'             => $orderDate,
                    'order_status'           => $statusText,
                    'shipping_courier'       => $payload['shipping_courier'] ?? $existing->shipping_courier,
                    'variation_name'         => $payload['variation_name'] ?? $existing->variation_name,
                    'qty'                    => $totalQty,
                    'package_count'          => $payload['package_count'],
                    'est_net_income'         => $calculatedNet,
                    'marketplace_net_payout' => $calculatedNet,
                ];

                if ($hasProcessedAt && ! $shouldKeepProcessedAt) {
                    $updateFields['processed_at'] = $processedAt;
                }

                if ($shipByDate && empty($existing->ship_by_date)) {
                    $updateFields['ship_by_date'] = $shipByDate;
                }
                if ($paymentMethod && empty($existing->payment_method)) {
                    $updateFields['payment_method'] = $paymentMethod;
                }
                if ($hasCancelBy && $cancelBy) {
                    $updateFields['cancel_by'] = $cancelBy;
                }
                if ($hasCancelReason && $cancelReason) {
                    $updateFields['cancel_reason'] = $cancelReason;
                }
                if ($hasFinancialBreakdown) {
                    $updateFields['financial_breakdown'] = $breakdown;
                }

                if ($existing->trashed()) {
                    $existing->restore();
                }
                $existing->update($updateFields);
                $updatedCount++;
            } else {
                CutOffOrder::create($payload);
                $createdCount++;
            }
        }

        $account->update([
            'last_synced_at'   => now(),
            'last_sync_status' => 'success',
            'last_sync_error'  => null,
        ]);

        return [
            'total_fetched' => count($allOrders),
            'created'       => $createdCount,
            'updated'       => $updatedCount,
            'message'       => "Sinkronisasi TikTok berhasil! {$createdCount} pesanan baru ditambahkan, {$updatedCount} diperbarui.",
        ];
    }

    /**
     * Synchronize TikTok Shop returns into cut_off_returns and update matching cut_off_orders.
     */
    public function syncReturnsToCutOff(TiktokAccount $account, ?int $timeFrom = null, ?int $timeTo = null): array
    {
        $timeTo = $timeTo ?: time();
        $timeFrom = $timeFrom ?: ($timeTo - (14 * 86400));

        $this->ensureValidAccessToken($account);

        if (empty($account->shop_cipher)) {
            $this->fetchAuthorizedShops($account);
        }

        $shopCipher = $account->shop_cipher;
        if (empty($shopCipher)) {
            throw new RuntimeException('Shop Cipher TikTok tidak ditemukan. Pastikan toko sudah terhubung dengan benar.');
        }

        $allReturns = [];
        $path = '/return_refund/202309/returns/search';
        $pageToken = null;
        $maxPages = 10;
        $pageCount = 0;

        try {
            do {
                $pageCount++;
                $timestamp = time();

                $queryParams = [
                    'app_key'     => $account->app_key,
                    'timestamp'   => (string) $timestamp,
                    'shop_cipher' => $shopCipher,
                    'page_size'   => '50',
                ];

                $bodyPayload = [
                    'create_time_ge' => $timeFrom,
                    'create_time_lt' => $timeTo,
                ];
                if (! empty($pageToken)) {
                    $bodyPayload['page_token'] = $pageToken;
                }
                $bodyJson = json_encode($bodyPayload);

                $sign = $this->generateSignature($path, $queryParams, $account->app_secret, $bodyJson);
                $queryParams['sign'] = $sign;

                $url = $this->openHost . $path . '?' . http_build_query($queryParams);

                $response = Http::timeout(25)
                    ->withHeaders([
                        'x-tts-access-token' => $account->access_token,
                        'Content-Type'       => 'application/json',
                    ])
                    ->withBody($bodyJson, 'application/json')
                    ->send('POST', $url);

                if ($response->successful()) {
                    $res = $response->json();
                    if (($res['code'] ?? -1) === 0) {
                        $pageReturns = $res['data']['returns'] ?? [];
                        if (! empty($pageReturns)) {
                            foreach ($pageReturns as $ret) {
                                $retId = (string) ($ret['return_id'] ?? $ret['id'] ?? '');
                                if (! empty($retId)) {
                                    $allReturns[$retId] = $ret;
                                }
                            }
                        }
                        $pageToken = $res['data']['next_page_token'] ?? null;
                    } else {
                        Log::warning('TikTok Returns API returned non-zero code: ' . ($res['message'] ?? 'Unknown'));
                        break;
                    }
                } else {
                    Log::warning('TikTok Returns API request failed: HTTP ' . $response->status() . ' - ' . $response->body());
                    break;
                }
            } while (! empty($pageToken) && $pageCount < $maxPages);
        } catch (\Throwable $e) {
            Log::warning('TikTok Returns API search exception: ' . $e->getMessage());
        }

        $createdCount = 0;
        $updatedCount = 0;
        $ordersLinkedCount = 0;

        DB::transaction(function () use (
            $allReturns, $timeFrom, $timeTo,
            &$createdCount, &$updatedCount, &$ordersLinkedCount
        ) {
            $lastNoUrut = (int) (CutOffReturn::max('no_urut') ?? 0);

            // 1. Proses retur resmi dari endpoint TikTok Returns API jika berhasil
            foreach ($allReturns as $returnId => $ret) {
                $orderId    = trim((string) ($ret['order_id'] ?? ''));
                $createTime = ! empty($ret['create_time']) ? (int) $ret['create_time'] : time();
                $returnDate = Carbon::createFromTimestamp($createTime, 'Asia/Jakarta')->format('Y-m-d');

                $items = $ret['items'] ?? $ret['line_items'] ?? [];
                $firstItem = $items[0] ?? [];
                $totalQty = 0;
                foreach ($items as $it) {
                    $totalQty += (int) ($it['quantity'] ?? $it['amount'] ?? 1);
                }
                if ($totalQty <= 0) $totalQty = 1;

                $itemName = (string) ($firstItem['sku_name'] ?? $firstItem['product_name'] ?? 'Produk TikTok Shop');
                if (count($items) > 1) {
                    $itemName .= ' (+' . (count($items) - 1) . ' item lainnya)';
                }

                $reason = trim((string) ($ret['return_reason'] ?? $ret['reason'] ?? ''));
                $status = trim((string) ($ret['return_status'] ?? $ret['status'] ?? ''));
                $keteranganParts = [];
                if (! empty($status)) $keteranganParts[] = "[{$status}]";
                if (! empty($reason)) $keteranganParts[] = $reason;
                $keterangan = implode(' ', $keteranganParts);

                $trackingNumber = $ret['tracking_number'] ?? $ret['return_tracking_number'] ?? null;

                $existing = CutOffReturn::where('marketplace', 'TT')
                    ->where(function ($q) use ($returnId, $orderId) {
                        $q->where('no_retur', $returnId);
                        if (! empty($orderId)) {
                            $q->orWhere('no_invoice_mp', $orderId);
                        }
                    })
                    ->first();

                if ($existing) {
                    $existing->update([
                        'nama_barang_mp' => $itemName ?: $existing->nama_barang_mp,
                        'jml_produk_mp'  => $totalQty ?: $existing->jml_produk_mp,
                        'keterangan'     => $keterangan ?: $existing->keterangan,
                        'barcode'        => $trackingNumber ?: $existing->barcode,
                        'no_retur'       => $returnId ?: $existing->no_retur,
                        'no_invoice_mp'  => $orderId ?: $existing->no_invoice_mp,
                    ]);
                    $updatedCount++;
                } else {
                    $lastNoUrut++;
                    CutOffReturn::create([
                        'no_urut'        => $lastNoUrut,
                        'marketplace'    => 'TT',
                        'tgl_input_mp'   => $returnDate,
                        'nama_barang_mp' => $itemName,
                        'jml_produk_mp'  => $totalQty,
                        'no_invoice_mp'  => $orderId,
                        'no_retur'       => $returnId,
                        'tgl_rj'         => $returnDate,
                        'keterangan'     => $keterangan,
                        'barcode'        => $trackingNumber,
                    ]);
                    $createdCount++;
                }

                if (! empty($orderId)) {
                    $cutOffOrder = CutOffOrder::where('order_number', $orderId)
                        ->where('channel', 'TT')
                        ->first();

                    if ($cutOffOrder) {
                        $cutOffOrder->update([
                            'order_status'  => 'RJ (Retur)',
                            'cancel_by'     => 'buyer',
                            'cancel_reason' => $reason ?: "Retur TikTok ({$status})",
                        ]);
                        $ordersLinkedCount++;
                    }
                }
            }

            // 2. Proteksi Tambahan: Sinkronkan pesanan TikTok yang berstatus retur dari cut_off_orders
            $startDateStr = Carbon::createFromTimestamp($timeFrom, 'Asia/Jakarta')->startOfDay()->toDateTimeString();
            $endDateStr   = Carbon::createFromTimestamp($timeTo, 'Asia/Jakarta')->endOfDay()->toDateTimeString();

            $returnedOrders = CutOffOrder::where('channel', 'TT')
                ->where(function ($q) {
                    $q->where('order_status', 'like', '%RJ%')
                      ->orWhere('order_status', 'like', '%Retur%')
                      ->orWhereNotNull('cancel_reason');
                })
                ->whereBetween('order_date', [$startDateStr, $endDateStr])
                ->get();

            foreach ($returnedOrders as $order) {
                $orderNum = $order->order_number;
                $existing = CutOffReturn::where('marketplace', 'TT')
                    ->where('no_invoice_mp', $orderNum)
                    ->first();

                if (! $existing) {
                    $lastNoUrut++;
                    $orderDate = $order->order_date ? $order->order_date->format('Y-m-d') : now()->format('Y-m-d');
                    CutOffReturn::create([
                        'no_urut'        => $lastNoUrut,
                        'marketplace'    => 'TT',
                        'tgl_input_mp'   => $orderDate,
                        'nama_barang_mp' => $order->product_name ?? 'Produk TikTok Shop',
                        'jml_produk_mp'  => $order->qty ?: 1,
                        'no_invoice_mp'  => $orderNum,
                        'no_retur'       => 'RET-TT-' . $orderNum,
                        'tgl_rj'         => $orderDate,
                        'keterangan'     => "[{$order->order_status}] " . ($order->cancel_reason ?? 'Pengajuan retur TikTok'),
                        'barcode'        => $order->shipping_courier,
                    ]);
                    $createdCount++;
                }
            }
        });

        return [
            'total_fetched' => count($allReturns),
            'created'       => $createdCount,
            'updated'       => $updatedCount,
            'orders_linked' => $ordersLinkedCount,
            'message'       => "Sinkronisasi Retur TikTok sukses! {$createdCount} retur baru ditambahkan, {$updatedCount} diperbarui, dan {$ordersLinkedCount} pesanan di Pesanan Cut Off otomatis disinkronkan ke status 'RJ (Retur)'.",
        ];
    }

    /**
     * Map TikTok Shop status to clean user-friendly text.
     */
    private function mapOrderStatus(string $raw): string
    {
        return match (strtoupper($raw)) {
            'UNPAID'             => 'Belum Bayar',
            'ON_HOLD'            => 'Tertahan',
            'AWAITING_SHIPMENT'  => 'Perlu Dikirim',
            'AWAITING_COLLECTION'=> 'Menunggu Pickup',
            'IN_TRANSIT'         => 'Dikirim',
            'DELIVERED'          => 'Tiba di Tujuan',
            'COMPLETED'          => 'Selesai',
            'CANCELLED'          => 'Batal',
            'REFUND_REQUESTED'   => 'RJ (Pengajuan Retur)',
            'REFUNDED'           => 'RJ (Retur Selesai)',
            default              => ! empty($raw) ? ucfirst(strtolower(str_replace('_', ' ', $raw))) : 'Diproses',
        };
    }
}

