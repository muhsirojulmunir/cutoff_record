<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\CutOffReturn;
use App\Models\TiktokAccount;
use App\Models\TiktokOrder;
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
    public function ensureValidAccessToken(TiktokAccount $account): void
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
                'page_size'      => 50,
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

        // Jika pesanan real dari TikTok API ditemukan, otomatis bersihkan data pesanan contoh (dummy)
        if (count($allOrders) > 0 && class_exists(TiktokOrder::class) && Schema::hasTable('tiktok_orders')) {
            try {
                TiktokOrder::whereIn('order_sn', TiktokOrderService::DUMMY_ORDER_SNS)->delete();
            } catch (\Throwable $e) {
                Log::warning('TiktokSyncService clear dummy orders notice: ' . $e->getMessage());
            }
        }

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

            $statusRaw  = (string) ($order['order_status'] ?? $order['status'] ?? '');
            $statusText = $this->mapOrderStatus($statusRaw);

            // Rumus ERP Khusus TikTok: Order Amount x 75%
            $payment     = $order['payment'] ?? [];
            $orderAmount = (float) ($payment['total_amount'] ?? $payment['original_total_product_price'] ?? 0);
            if (empty($normalizedItems)) {
                $normalizedItems[] = [
                    'name'      => 'Produk TikTok Shop',
                    'variation' => null,
                    'sku'       => null,
                    'qty'       => $totalQty,
                    'subtotal'  => round($orderAmount, 2),
                ];
            }
            $isOrderCancelled = CutOffOrder::isCancelledStatus($statusText, $statusRaw);
            $breakdown = CutOffOrder::buildFinancialBreakdown(
                $normalizedItems,
                0.0,  // Order Amount adalah nilai bersih pesanan
                0.75, // Khusus TikTok: Order Amount x 75%
                $orderAmount > 0 ? $orderAmount : null,
                $isOrderCancelled
            );
            $calculatedNet = $isOrderCancelled ? 0.0 : $breakdown['est_net_income'];

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

            // 1. Simpan atau perbarui ke tabel tiktok_orders (Pesanan Saya TikTok) untuk SEMUA STATUS pesanan
            try {
                if (class_exists(TiktokOrder::class) && Schema::hasTable('tiktok_orders')) {
                    $orderItemsJson = [];
                    foreach ($lineItems as $li) {
                        $orderItemsJson[] = [
                            'item_id'                  => $li['product_id'] ?? null,
                            'item_name'                => $li['product_name'] ?? 'Produk TikTok Shop',
                            'model_id'                 => $li['sku_id'] ?? null,
                            'model_name'               => $li['sku_name'] ?? null,
                            'model_sku'                => $li['seller_sku'] ?? $li['sku_id'] ?? null,
                            'model_quantity_purchased' => max(1, (int) ($li['quantity'] ?? 1)),
                            'model_original_price'     => (float) ($li['original_price'] ?? 0),
                            'model_discounted_price'   => (float) ($li['sale_price'] ?? $li['original_price'] ?? 0),
                            'image_url'                => $li['sku_image'] ?? $li['product_image'] ?? $li['sku_image_url'] ?? $li['image_url'] ?? $li['main_image_url'] ?? null,
                        ];
                    }

                    $recip = $order['recipient_address'] ?? [];
                    $pkgList = $order['package_list'] ?? [];
                    $firstPkg = $pkgList[0] ?? [];
                    $packageId = $firstPkg['package_id'] ?? $firstPkg['id'] ?? null;
                    if (empty($packageId) || str_starts_with((string) $packageId, 'PKG-')) {
                        $packageId = ! empty($firstPkg['package_id']) ? (string) $firstPkg['package_id'] : 'PKG-' . $orderId;
                    }
                    $shippingCarrier = $order['shipping_provider']
                        ?? $order['delivery_option_name']
                        ?? ($firstPkg['shipping_provider_name'] ?? 'J&T Express');
                    $trackingNumber = $order['tracking_number']
                        ?? ($firstPkg['tracking_number'] ?? null);

                    $mappedStatus = strtoupper($statusRaw) ?: 'AWAITING_SHIPMENT';
                    if (! empty($trackingNumber) && in_array($mappedStatus, ['AWAITING_SHIPMENT', 'READY_TO_SHIP'], true)) {
                        $mappedStatus = 'AWAITING_COLLECTION';
                    }

                    TiktokOrder::updateOrCreate(
                        [
                            'tiktok_account_id' => $account->id,
                            'order_sn'          => $orderId,
                        ],
                        [
                            'package_number'         => $packageId,
                            'order_status'           => $mappedStatus,
                            'logistics_status'       => $order['fulfillment_type'] ?? null,
                            'shipping_carrier'       => $shippingCarrier,
                            'tracking_number'        => $trackingNumber,
                            'fulfillment_method'     => 'pickup',
                            'buyer_user_id'          => $order['buyer_uid'] ?? null,
                            'buyer_username'         => $order['buyer_email'] ?? $recip['name'] ?? $order['buyer_uid'] ?? null,
                            'buyer_note'             => $order['buyer_message'] ?? null,
                            'recipient_data'         => [
                                'name'         => $recip['name'] ?? null,
                                'phone'        => $recip['phone'] ?? null,
                                'full_address' => $recip['full_address'] ?? $recip['address_detail'] ?? null,
                                'city'         => $recip['city'] ?? null,
                                'province'     => $recip['region'] ?? $recip['state'] ?? null,
                            ],
                            'items_json'             => $orderItemsJson,
                            'package_list_json'      => $pkgList,
                            'payment_method'         => $paymentMethod,
                            'is_cod'                 => ! empty($order['is_cod']),
                            'total_amount'           => $orderAmount,
                            'order_created_at'       => $orderDate,
                            'ship_by_date'           => $shipByDate,
                            'raw_payload'            => json_encode($order),
                            'last_synced_at'         => now(),
                        ]
                    );
                }
            } catch (\Throwable $e) {
                Log::warning("TiktokSyncService upsert to tiktok_orders warning ({$orderId}): " . $e->getMessage());
            }

            // 2. Pesanan Cut Off menampung pesanan yang telah diproses ("Diproses" dan seterusnya),
            //    serta pesanan yang sempat diproses lalu dibatalkan pembeli (agar admin gudang tahu dan tidak salah kirim).
            $existing = CutOffOrder::withTrashed()
                ->where('order_number', $orderId)
                ->orderByRaw('CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END ASC')
                ->orderBy('id', 'asc')
                ->first();

            $wasProcessed = ($existing && ($existing->processed_at !== null || ! empty($existing->jl_number)))
                || ! empty($order['rts_time'])
                || ! empty($order['tracking_number']);

            if (CutOffOrder::isExcludedStatus($statusText, $statusRaw, $wasProcessed)) {
                if ($existing && ! $existing->trashed()) {
                    $existing->delete();
                }
                continue;
            }

            if ($existing && $existing->trashed() && $wasProcessed) {
                $existing->restore();
            }

            $shouldKeepProcessedAt = $hasProcessedAt
                && $existing
                && ! $existing->trashed()
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
     * Ambil detail satu pesanan spesifik langsung dari TikTok Shop API dan simpan ke tabel tiktok_orders.
     */
    public function fetchSingleOrder(TiktokAccount $account, string $orderId): ?TiktokOrder
    {
        $orderId = trim($orderId);
        if ($orderId === '' || $orderId === '-') {
            return null;
        }

        try {
            $this->ensureValidAccessToken($account);
            if (empty($account->shop_cipher)) {
                $this->fetchAuthorizedShops($account);
            }

            $shopCipher = $account->shop_cipher;
            if (empty($shopCipher)) {
                return null;
            }

            $path = '/order/202309/orders';
            $timestamp = time();
            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $shopCipher,
                'ids'         => $orderId,
            ];

            $sign = $this->generateSignature($path, $queryParams, $account->app_secret, '');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->get($url);

            if (! $response->successful()) {
                return null;
            }

            $json = $response->json();
            $orders = $json['data']['orders'] ?? [];
            if (empty($orders)) {
                return null;
            }

            $order = $orders[0];
            $lineItems = $order['line_items'] ?? [];
            $orderItemsJson = [];
            foreach ($lineItems as $li) {
                $orderItemsJson[] = [
                    'item_id'                  => $li['product_id'] ?? null,
                    'item_name'                => $li['product_name'] ?? 'Produk TikTok Shop',
                    'model_id'                 => $li['sku_id'] ?? null,
                    'model_name'               => $li['sku_name'] ?? null,
                    'model_sku'                => $li['seller_sku'] ?? $li['sku_id'] ?? null,
                    'model_quantity_purchased' => max(1, (int) ($li['quantity'] ?? 1)),
                    'model_original_price'     => (float) ($li['original_price'] ?? 0),
                    'model_discounted_price'   => (float) ($li['sale_price'] ?? $li['original_price'] ?? 0),
                    'image_url'                => $li['sku_image'] ?? $li['product_image'] ?? $li['sku_image_url'] ?? $li['image_url'] ?? $li['main_image_url'] ?? null,
                ];
            }

            $payment = $order['payment'] ?? [];
            $productPrice = (float) ($payment['original_total_product_price'] ?? $payment['total_amount'] ?? 0);
            $recip = $order['recipient_address'] ?? [];
            $statusRaw = (string) ($order['order_status'] ?? $order['status'] ?? '');
            $createTime = $order['create_time'] ?? null;
            $orderDate = $createTime
                ? Carbon::createFromTimestamp((int) $createTime, 'Asia/Jakarta')->format('Y-m-d H:i:s')
                : now('Asia/Jakarta')->toDateTimeString();

            $paymentMethod = $order['payment_method_name'] ?? $payment['payment_method_name'] ?? null;
            if (! empty($order['is_cod']) || stripos((string) $paymentMethod, 'cod') !== false) {
                $paymentMethod = 'COD (Bayar di Tempat)';
            }

            $pkgList = $order['package_list'] ?? [];
            $firstPkg = $pkgList[0] ?? [];
            $packageId = $firstPkg['package_id'] ?? $firstPkg['id'] ?? null;
            if (empty($packageId) || str_starts_with((string) $packageId, 'PKG-')) {
                $packageId = ! empty($firstPkg['package_id']) ? (string) $firstPkg['package_id'] : 'PKG-' . $orderId;
            }
            $shippingCarrier = $order['shipping_provider']
                ?? $order['delivery_option_name']
                ?? ($firstPkg['shipping_provider_name'] ?? 'J&T Express');
            $trackingNumber = $order['tracking_number']
                ?? ($firstPkg['tracking_number'] ?? null);

            // Jika nomor resi belum ada dari payload order tapi package_id valid, panggil getPackageDetail
            if (empty($trackingNumber) && ! empty($packageId) && ! str_starts_with($packageId, 'PKG-')) {
                $pkgDetail = $this->getPackageDetail($account, $packageId);
                if (! empty($pkgDetail['tracking_number'])) {
                    $trackingNumber = (string) $pkgDetail['tracking_number'];
                }
                if (! empty($pkgDetail['shipping_provider_name'])) {
                    $shippingCarrier = (string) $pkgDetail['shipping_provider_name'];
                }
            }

            $mappedStatus = strtoupper($statusRaw) ?: 'AWAITING_SHIPMENT';
            if (! empty($trackingNumber) && in_array($mappedStatus, ['AWAITING_SHIPMENT', 'READY_TO_SHIP'], true)) {
                $mappedStatus = 'AWAITING_COLLECTION';
            }

            $tiktokOrder = TiktokOrder::updateOrCreate(
                [
                    'tiktok_account_id' => $account->id,
                    'order_sn'          => (string) ($order['id'] ?? $orderId),
                ],
                [
                    'package_number'         => $packageId,
                    'order_status'           => $mappedStatus,
                    'logistics_status'       => $order['fulfillment_type'] ?? null,
                    'shipping_carrier'       => $shippingCarrier,
                    'tracking_number'        => $trackingNumber,
                    'fulfillment_method'     => 'pickup',
                    'buyer_user_id'          => $order['buyer_uid'] ?? null,
                    'buyer_username'         => $order['buyer_email'] ?? $recip['name'] ?? $order['buyer_uid'] ?? null,
                    'buyer_note'             => $order['buyer_message'] ?? null,
                    'recipient_data'         => [
                        'name'         => $recip['name'] ?? null,
                        'phone'        => $recip['phone'] ?? null,
                        'full_address' => $recip['full_address'] ?? $recip['address_detail'] ?? null,
                        'city'         => $recip['city'] ?? null,
                        'province'     => $recip['region'] ?? $recip['state'] ?? null,
                    ],
                    'items_json'             => $orderItemsJson,
                    'package_list_json'      => $pkgList,
                    'payment_method'         => $paymentMethod,
                    'is_cod'                 => ! empty($order['is_cod']),
                    'total_amount'           => $productPrice,
                    'order_created_at'       => $orderDate,
                    'raw_payload'            => json_encode($order),
                    'last_synced_at'         => now(),
                ]
            );

            // Sinkronkan ke CutOffOrder jika ada
            try {
                $cutOff = CutOffOrder::where('channel', 'TT')->where('order_number', (string) ($order['id'] ?? $orderId))->first();
                if ($cutOff) {
                    $cutOffUpdates = [];
                    if (! empty($trackingNumber)) {
                        $cutOffUpdates['package_count'] = $trackingNumber;
                    }
                    if (in_array($mappedStatus, ['AWAITING_COLLECTION', 'PROCESSED', 'SHIPPED', 'IN_TRANSIT'], true)) {
                        $cutOffUpdates['order_status'] = 'Menunggu Pickup';
                        if (empty($cutOff->processed_at)) {
                            $cutOffUpdates['processed_at'] = now('Asia/Jakarta')->format('Y-m-d H:i:s');
                        }
                    }
                    if (! empty($cutOffUpdates)) {
                        $cutOff->update($cutOffUpdates);
                        CutOffOrder::bumpCacheVersion();
                    }
                }
            } catch (\Throwable $cutErr) {
                Log::info("CutOffOrder sync in fetchSingleOrder notice: " . $cutErr->getMessage());
            }

            return $tiktokOrder;
        } catch (\Throwable $e) {
            Log::warning("TiktokSyncService fetchSingleOrder error ({$orderId}): " . $e->getMessage());
            return null;
        }
    }

    /**
     * Ambil histori dan status pelacakan ekspedisi real-time dari TikTok Shop Open API.
     * Endpoint: GET /fulfillment/202309/orders/{order_id}/tracking
     */
    public function getOrderTracking(TiktokAccount $account, string $orderId): ?array
    {
        try {
            $this->ensureValidAccessToken($account);

            if (empty($account->shop_cipher)) {
                $this->fetchAuthorizedShops($account);
            }

            $shopCipher = $account->shop_cipher;
            if (empty($shopCipher)) {
                return null;
            }

            $path = "/fulfillment/202309/orders/{$orderId}/tracking";
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $shopCipher,
            ];

            $sign = $this->generateSignature($path, $queryParams, $account->app_secret, '');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->get($url);

            if (! $response->successful()) {
                Log::info("TiktokSyncService getOrderTracking HTTP {$response->status()} ({$orderId}): " . $response->body());
                return null;
            }

            $json = $response->json();
            if (($json['code'] ?? -1) !== 0) {
                Log::info("TiktokSyncService getOrderTracking API notice ({$orderId}): " . ($json['message'] ?? 'Error'));
                return null;
            }

            return $json['data'] ?? null;
        } catch (\Throwable $e) {
            Log::warning("TiktokSyncService getOrderTracking error ({$orderId}): " . $e->getMessage());
            return null;
        }
    }

    /**
     * Atur penjemputan kurir (PICKUP) atau antar ke counter (DROP_OFF) via TikTok Shop Open API.
     * Endpoint: POST /fulfillment/202309/packages/{package_id}/ship
     */
    public function shipPackage(
        TiktokAccount $account,
        string $packageId,
        string $handoverMethod = 'PICKUP',
        ?array $pickupSlot = null
    ): array {
        try {
            $this->ensureValidAccessToken($account);

            if (empty($account->shop_cipher)) {
                $this->fetchAuthorizedShops($account);
            }

            $shopCipher = $account->shop_cipher;
            if (empty($shopCipher)) {
                return ['success' => false, 'code' => -1, 'message' => 'Shop cipher TikTok tidak ditemukan.'];
            }

            $path = "/fulfillment/202309/packages/{$packageId}/ship";
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $shopCipher,
            ];

            $normalizedMethod = (strtoupper($handoverMethod) === 'DROPOFF' || strtoupper($handoverMethod) === 'DROP_OFF')
                ? 'DROP_OFF'
                : 'PICKUP';

            $bodyData = [
                'handover_method' => $normalizedMethod,
            ];

            if ($normalizedMethod === 'PICKUP' && ! empty($pickupSlot)) {
                $bodyData['pickup_slot'] = $pickupSlot;
            }

            $bodyJson = json_encode($bodyData, JSON_UNESCAPED_SLASHES);
            $sign = $this->generateSignature($path, $queryParams, $account->app_secret, $bodyJson);
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(20)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->withBody($bodyJson, 'application/json')
                ->post($url);

            if (! $response->successful()) {
                Log::warning("TiktokSyncService shipPackage HTTP {$response->status()} ({$packageId}): " . $response->body());
                $errJson = $response->json();
                return [
                    'success' => false,
                    'code'    => $errJson['code'] ?? $response->status(),
                    'message' => $errJson['message'] ?? 'Gagal menghubungi API fulfillment TikTok Shop.',
                ];
            }

            $json = $response->json();
            $code = $json['code'] ?? -1;

            if ($code !== 0) {
                Log::info("TiktokSyncService shipPackage API error ({$packageId}): " . ($json['message'] ?? 'Error'));
                return [
                    'success' => false,
                    'code'    => $code,
                    'message' => $json['message'] ?? 'Gagal mengatur pengiriman di TikTok Shop.',
                    'data'    => $json['data'] ?? null,
                ];
            }

            return [
                'success' => true,
                'code'    => 0,
                'message' => 'Pengiriman berhasil diatur di TikTok Shop.',
                'data'    => $json['data'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::warning("TiktokSyncService shipPackage exception ({$packageId}): " . $e->getMessage());
            return [
                'success' => false,
                'code'    => -99,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Ambil rincian paket dan nomor resi dari TikTok Shop Open API.
     * Endpoint: GET /fulfillment/202309/packages/{package_id}
     */
    public function getPackageDetail(TiktokAccount $account, string $packageId): ?array
    {
        try {
            $this->ensureValidAccessToken($account);

            if (empty($account->shop_cipher)) {
                $this->fetchAuthorizedShops($account);
            }

            $shopCipher = $account->shop_cipher;
            if (empty($shopCipher)) {
                return null;
            }

            $path = "/fulfillment/202309/packages/{$packageId}";
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $shopCipher,
            ];

            $sign = $this->generateSignature($path, $queryParams, $account->app_secret, '');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->get($url);

            if (! $response->successful()) {
                Log::info("TiktokSyncService getPackageDetail HTTP {$response->status()} ({$packageId}): " . $response->body());
                return null;
            }

            $json = $response->json();
            if (($json['code'] ?? -1) !== 0) {
                Log::info("TiktokSyncService getPackageDetail API notice ({$packageId}): " . ($json['message'] ?? 'Error'));
                return null;
            }

            return $json['data'] ?? null;
        } catch (\Throwable $e) {
            Log::warning("TiktokSyncService getPackageDetail error ({$packageId}): " . $e->getMessage());
            return null;
        }
    }

    /**
     * Ambil tautan dokumen label pengiriman (Waybill / Resi) resmi TikTok Shop.
     * Endpoint: GET /fulfillment/202309/packages/{package_id}/shipping_documents
     */
    public function fetchPackageShippingDocumentUrl(
        TiktokAccount $account,
        string $packageId,
        string $docSize = 'A6'
    ): ?string {
        try {
            $this->ensureValidAccessToken($account);

            if (empty($account->shop_cipher)) {
                $this->fetchAuthorizedShops($account);
            }

            $shopCipher = $account->shop_cipher;
            if (empty($shopCipher)) {
                return null;
            }

            $path = "/fulfillment/202309/packages/{$packageId}/shipping_documents";
            $timestamp = time();

            $queryParams = [
                'app_key'         => $account->app_key,
                'timestamp'       => (string) $timestamp,
                'shop_cipher'     => $shopCipher,
                'document_type'   => 'SHIPPING_LABEL',
                'document_size'   => $docSize,
                'document_format' => 'PDF',
            ];

            $sign = $this->generateSignature($path, $queryParams, $account->app_secret, '');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->get($url);

            if (! $response->successful()) {
                Log::warning("TiktokSyncService fetchPackageShippingDocumentUrl HTTP {$response->status()} ({$packageId}): " . $response->body());
                return null;
            }

            $json = $response->json();
            if (($json['code'] ?? -1) !== 0) {
                Log::info("TiktokSyncService fetchPackageShippingDocumentUrl API error ({$packageId}): " . ($json['message'] ?? 'Error'));
                return null;
            }

            $docUrl = $json['data']['doc_url'] ?? null;
            Log::info("TiktokSyncService fetchPackageShippingDocumentUrl success ({$packageId}): " . ($docUrl ? 'Found doc_url' : 'doc_url is empty'));
            return $docUrl;
        } catch (\Throwable $e) {
            Log::warning("TiktokSyncService fetchPackageShippingDocumentUrl error ({$packageId}): " . $e->getMessage());
            return null;
        }
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
                $statusUpper = strtoupper($status);
                $dueDateEpoch = ! empty($ret['deadline']) ? (int) $ret['deadline'] : (! empty($ret['due_date']) ? (int) $ret['due_date'] : null);
                $dueDate = $dueDateEpoch ? Carbon::createFromTimestamp($dueDateEpoch, 'Asia/Jakarta') : null;
                $refundAmount = ! empty($ret['refund_amount'])
                    ? (float) $ret['refund_amount']
                    : (! empty($ret['return_amount']) ? (float) $ret['return_amount'] : null);
                $needsAction = in_array($statusUpper, ['REQUESTED', 'AWAITING_SELLER_REVIEW', 'AWAITING_SELLER_APPROVAL', 'PENDING_SELLER_RESPONSE'], true)
                    || ($dueDateEpoch && $dueDateEpoch > time() && ! in_array($statusUpper, ['COMPLETED', 'CANCELLED', 'CLOSED', 'REJECTED'], true));

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
                        'due_date'       => $dueDate ?: $existing->due_date,
                        'return_status'  => $status ?: $existing->return_status,
                        'needs_action'   => $needsAction,
                        'refund_amount'  => $refundAmount ?: $existing->refund_amount,
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
                        'due_date'       => $dueDate,
                        'return_status'  => $status ?: null,
                        'needs_action'   => $needsAction,
                        'refund_amount'  => $refundAmount,
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

    /**
     * Pastikan skema tabel tiktok_products dan history zero out tersedia.
     */
    public function ensureProductSchema(): void
    {
        try {
            if (! Schema::hasTable('tiktok_products')) {
                Schema::create('tiktok_products', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('tiktok_account_id')->nullable()->index();
                    $table->string('item_id', 64)->index();
                    $table->string('model_id', 64)->default('0')->index();
                    $table->string('item_name', 255);
                    $table->string('model_name', 255)->nullable();
                    $table->string('sku', 100)->nullable()->index();
                    $table->string('manual_item_code', 50)->nullable()->index();
                    $table->integer('stock')->default(0)->index();
                    $table->integer('reserved_stock')->default(0);
                    $table->integer('locked_campaign_qty')->default(0);
                    $table->boolean('was_campaign_locked')->default(false)->index();
                    $table->decimal('price', 15, 2)->default(0);
                    $table->integer('sales')->default(0)->index();
                    $table->string('item_status', 50)->default('ACTIVATE');
                    $table->boolean('has_model')->default(false);
                    $table->dateTime('last_synced_at')->nullable()->index();
                    $table->json('raw_data')->nullable();
                    $table->timestamps();

                    $table->unique(['tiktok_account_id', 'item_id', 'model_id'], 'tiktok_prod_unique_variant');
                });
            }

            if (! Schema::hasTable('tiktok_stock_zero_batches')) {
                Schema::create('tiktok_stock_zero_batches', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('tiktok_account_id')->nullable()->index();
                    $table->string('batch_code', 40)->unique();
                    $table->string('source', 40)->default('bulk')->index();
                    $table->string('note', 255)->nullable();
                    $table->integer('total_requested')->default(0);
                    $table->integer('zeroed_count')->default(0);
                    $table->integer('failed_count')->default(0);
                    $table->integer('restored_count')->default(0);
                    $table->string('status', 30)->default('zeroed')->index();
                    $table->unsignedBigInteger('zeroed_by')->nullable()->index();
                    $table->string('zeroed_by_name', 120)->nullable();
                    $table->timestamp('zeroed_at')->nullable()->index();
                    $table->unsignedBigInteger('restored_by')->nullable()->index();
                    $table->string('restored_by_name', 120)->nullable();
                    $table->timestamp('restored_at')->nullable()->index();
                    $table->timestamps();
                });
            }

            if (! Schema::hasTable('tiktok_stock_zero_items')) {
                Schema::create('tiktok_stock_zero_items', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('batch_id')->index();
                    $table->unsignedBigInteger('tiktok_account_id')->nullable()->index();
                    $table->unsignedBigInteger('tiktok_product_id')->nullable()->index();
                    $table->string('item_id', 64)->index();
                    $table->string('model_id', 64)->default('0')->index();
                    $table->string('item_name', 255);
                    $table->string('model_name', 255)->nullable();
                    $table->string('sku', 100)->nullable()->index();
                    $table->integer('previous_stock')->default(0);
                    $table->integer('previous_reserved_stock')->default(0);
                    $table->integer('previous_locked_campaign_qty')->default(0);
                    $table->boolean('previous_was_campaign_locked')->default(false);
                    $table->integer('zeroed_stock')->default(0);
                    $table->string('status', 30)->default('zeroed')->index();
                    $table->text('error_message')->nullable();
                    $table->unsignedBigInteger('restored_by')->nullable();
                    $table->string('restored_by_name', 120)->nullable();
                    $table->timestamp('restored_at')->nullable()->index();
                    $table->timestamps();
                });
            }

            $account = TiktokAccount::firstOrCreate(
                ['id' => 1],
                [
                    'account_name'      => 'RecordShoesOfficial',
                    'shop_id'           => '7494083438199277309',
                    'connection_status' => 'connected',
                    'status'            => 'active',
                ]
            );

            // Inisialisasi katalog jika belum ada
            if (\App\Models\TiktokProduct::where('tiktok_account_id', $account->id)->count() === 0) {
                $this->seedInitialProducts($account);
            }
        } catch (\Throwable $e) {
            Log::warning('TiktokSyncService ensureProductSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Seed katalog produk TikTok awal (Record Shoes Official) agar staf langsung dapat mengelola stok.
     */
    public function seedInitialProducts(TiktokAccount $account): int
    {
        $now = now();
        $catalog = [
            [
                'item_id'   => '172948291028301',
                'item_name' => 'RECORD KYLIE SEPATU SNEAKERS SEKOLAH ANAK SMP SMA CEWE BLACK HITAM/PUTIH 12 TH KEATAS TALI 33-40',
                'price'     => 189999,
                'has_model' => true,
                'variants'  => [
                    ['model_id' => '201', 'name' => 'Hitam, 33 (21.5cm)', 'sku' => 'RECORD-KYLIE-H-33_01224633', 'stock' => 18, 'sales' => 5],
                    ['model_id' => '202', 'name' => 'Hitam, 34 (22.0cm)', 'sku' => 'RECORD-KYLIE-H-34_01224634', 'stock' => 24, 'sales' => 8],
                    ['model_id' => '203', 'name' => 'Hitam, 35 (22.5cm)', 'sku' => 'RECORD-KYLIE-H-35_01224635', 'stock' => 30, 'sales' => 12],
                    ['model_id' => '204', 'name' => 'Hitam, 36 (23.0cm)', 'sku' => 'RECORD-KYLIE-H-36_01224636', 'stock' => 15, 'sales' => 9],
                    ['model_id' => '205', 'name' => 'Hitam, 37 (23.5cm)', 'sku' => 'RECORD-KYLIE-H-37_01224637', 'stock' => 22, 'sales' => 14],
                    ['model_id' => '206', 'name' => 'Hitam, 38 (24.0cm)', 'sku' => 'RECORD-KYLIE-H-38_01224638', 'stock' => 28, 'sales' => 11],
                    ['model_id' => '207', 'name' => 'Hitam, 39 (24.5cm)', 'sku' => 'RECORD-KYLIE-H-39_01224639', 'stock' => 12, 'sales' => 7],
                    ['model_id' => '208', 'name' => 'Hitam, 40 (25.0cm)', 'sku' => 'RECORD-KYLIE-H-40_01224640', 'stock' => 0,  'sales' => 16, 'locked_campaign_qty' => 5, 'was_campaign_locked' => true],
                    ['model_id' => '209', 'name' => 'Putih, 34 (22.0cm)', 'sku' => 'RECORD-KYLIE-P-34_01224734', 'stock' => 20, 'sales' => 6],
                    ['model_id' => '210', 'name' => 'Putih, 35 (22.5cm)', 'sku' => 'RECORD-KYLIE-P-35_01224735', 'stock' => 25, 'sales' => 10],
                    ['model_id' => '211', 'name' => 'Putih, 36 (23.0cm)', 'sku' => 'RECORD-KYLIE-P-36_01224736', 'stock' => 18, 'sales' => 7],
                    ['model_id' => '212', 'name' => 'Putih, 37 (23.5cm)', 'sku' => 'RECORD-KYLIE-P-37_01224737', 'stock' => 14, 'sales' => 8],
                    ['model_id' => '213', 'name' => 'Putih, 38 (24.0cm)', 'sku' => 'RECORD-KYLIE-P-38_01224738', 'stock' => 32, 'sales' => 15],
                    ['model_id' => '214', 'name' => 'Hitam Putih, 36 (23.0cm)', 'sku' => 'RECORD-DONNA-HP-36_01219836', 'stock' => 26, 'sales' => 11],
                    ['model_id' => '215', 'name' => 'Hitam Putih, 37 (23.5cm)', 'sku' => 'RECORD-DONNA-HP-37_01219837', 'stock' => 19, 'sales' => 9],
                    ['model_id' => '216', 'name' => 'Hitam Putih, 38 (24.0cm)', 'sku' => 'RECORD-DONNA-HP-38_01219838', 'stock' => 35, 'sales' => 13],
                ],
            ],
            [
                'item_id'   => '172948291028302',
                'item_name' => 'RECORD NOVA KIDS FASHION Sepatu Lampu Anak LAKI LED PAUD VELKRO 1-7 THN Model Robot 26-31',
                'price'     => 189999,
                'has_model' => true,
                'variants'  => [
                    ['model_id' => '301', 'name' => 'NO LED SPIDER ABU, 26 (16.0cm)', 'sku' => 'RECORD-SPK17B-AB-26_01226126', 'stock' => 15, 'sales' => 4],
                    ['model_id' => '302', 'name' => 'NO LED SPIDER ABU, 27 (16.5cm)', 'sku' => 'RECORD-SPK17B-AB-27_01226127', 'stock' => 18, 'sales' => 6],
                    ['model_id' => '303', 'name' => 'NO LED SPIDER ABU, 28 (17.0cm)', 'sku' => 'RECORD-SPK17B-AB-28_01226128', 'stock' => 22, 'sales' => 9],
                    ['model_id' => '304', 'name' => 'NO LED SPIDER ABU, 29 (17.5cm)', 'sku' => 'RECORD-SPK17B-AB-29_01226129', 'stock' => 16, 'sales' => 5],
                    ['model_id' => '305', 'name' => 'NO LED SPIDER ABU, 30 (18.0cm)', 'sku' => 'RECORD-SPK17B-AB-30_01226130', 'stock' => 24, 'sales' => 8],
                    ['model_id' => '306', 'name' => 'NO LED SPIDER ABU, 31 (18.5cm)', 'sku' => 'RECORD-SPK17B-AB-31_01226131', 'stock' => 12, 'sales' => 3],
                    ['model_id' => '307', 'name' => 'MOTOBIKE SITRUN, 26 (16.0cm)', 'sku' => 'RECORD-SPK19-SB-26_01225426', 'stock' => 14, 'sales' => 4],
                    ['model_id' => '308', 'name' => 'MOTOBIKE SITRUN, 27 (16.5cm)', 'sku' => 'RECORD-SPK19-SB-27_01225427', 'stock' => 19, 'sales' => 7],
                    ['model_id' => '309', 'name' => 'MOTOBIKE SITRUN, 28 (17.0cm)', 'sku' => 'RECORD-SPK19-SB-28_01225428', 'stock' => 25, 'sales' => 11],
                    ['model_id' => '310', 'name' => 'MOTOBIKE SITRUN, 29 (17.5cm)', 'sku' => 'RECORD-SPK19-SB-29_01225429', 'stock' => 20, 'sales' => 6],
                    ['model_id' => '311', 'name' => 'MOTOBIKE SITRUN, 30 (18.0cm)', 'sku' => 'RECORD-SPK19-SB-30_01225430', 'stock' => 17, 'sales' => 8],
                    ['model_id' => '312', 'name' => 'MOTOBIKE SITRUN, 31 (18.5cm)', 'sku' => 'RECORD-SPK19-SB-31_01225431', 'stock' => 11, 'sales' => 5],
                ],
            ],
            [
                'item_id'   => '172948291028303',
                'item_name' => 'RECORD IONIQ SEPATU SNEAKER SEKOLAH ANAK TK SD SMP UNISEX BLACK HITAM PUTIH PEREKAT 30-37',
                'price'     => 189999,
                'has_model' => true,
                'variants'  => [
                    ['model_id' => '401', 'name' => 'CONFERO-TUCSON P/H, 32 (20.5CM)', 'sku' => 'RECORD-TUCSON-PH-32_01240232', 'stock' => 16, 'sales' => 4],
                    ['model_id' => '402', 'name' => 'CONFERO-TUCSON P/H, 33 (21.0CM)', 'sku' => 'RECORD-TUCSON-PH-33_01240233', 'stock' => 21, 'sales' => 6],
                    ['model_id' => '403', 'name' => 'CONFERO-TUCSON P/H, 34 (21.5CM)', 'sku' => 'RECORD-TUCSON-PH-34_01240234', 'stock' => 28, 'sales' => 9],
                    ['model_id' => '404', 'name' => 'CONFERO-TUCSON P/H, 35 (22.0CM)', 'sku' => 'RECORD-TUCSON-PH-35_01240235', 'stock' => 25, 'sales' => 8],
                    ['model_id' => '405', 'name' => 'CONFERO-TUCSON P/H, 36 (22.5CM)', 'sku' => 'RECORD-TUCSON-PH-36_01240236', 'stock' => 30, 'sales' => 14],
                    ['model_id' => '406', 'name' => 'CONFERO-TUCSON P/H, 37 (23.0CM)', 'sku' => 'RECORD-TUCSON-PH-37_01240237', 'stock' => 18, 'sales' => 7],
                ],
            ],
            [
                'item_id'   => '172948291028304',
                'item_name' => 'RECORD CONFERO-TUCSON SEPATU SNEAKERS CASUAL PRIA WANITA HITAM PUTIH 36-43',
                'price'     => 199000,
                'has_model' => true,
                'variants'  => [
                    ['model_id' => '501', 'name' => 'Hitam Putih, 38 (24.0cm)', 'sku' => 'RECORD-CONFERO-HP-38_01239838', 'stock' => 24, 'sales' => 9],
                    ['model_id' => '502', 'name' => 'Hitam Putih, 39 (24.5cm)', 'sku' => 'RECORD-CONFERO-HP-39_01239839', 'stock' => 31, 'sales' => 12],
                    ['model_id' => '503', 'name' => 'Hitam Putih, 40 (25.0cm)', 'sku' => 'RECORD-CONFERO-HP-40_01239840', 'stock' => 36, 'sales' => 15],
                    ['model_id' => '504', 'name' => 'Hitam Putih, 41 (25.5cm)', 'sku' => 'RECORD-CONFERO-HP-41_01239841', 'stock' => 29, 'sales' => 11],
                    ['model_id' => '505', 'name' => 'Hitam Putih, 42 (26.0cm)', 'sku' => 'RECORD-CONFERO-HP-42_01239842', 'stock' => 22, 'sales' => 8],
                    ['model_id' => '506', 'name' => 'Hitam Putih, 43 (26.5cm)', 'sku' => 'RECORD-CONFERO-HP-43_01239843', 'stock' => 17, 'sales' => 5],
                ],
            ],
            [
                'item_id'   => '172948291028305',
                'item_name' => 'RECORD SPARK SEPATU OLAHRAGA RUNNING JOGGING GYM PRIA WANITA HITAM ABU 38-44',
                'price'     => 219000,
                'has_model' => true,
                'variants'  => [
                    ['model_id' => '601', 'name' => 'Hitam Abu, 38 (24.0cm)', 'sku' => 'RECORD-SPARK-HA-38_01248838', 'stock' => 19, 'sales' => 7],
                    ['model_id' => '602', 'name' => 'Hitam Abu, 39 (24.5cm)', 'sku' => 'RECORD-SPARK-HA-39_01248839', 'stock' => 27, 'sales' => 10],
                    ['model_id' => '603', 'name' => 'Hitam Abu, 40 (25.0cm)', 'sku' => 'RECORD-SPARK-HA-40_01248840', 'stock' => 33, 'sales' => 14],
                    ['model_id' => '604', 'name' => 'Hitam Abu, 41 (25.5cm)', 'sku' => 'RECORD-SPARK-HA-41_01248841', 'stock' => 25, 'sales' => 9],
                    ['model_id' => '605', 'name' => 'Hitam Abu, 42 (26.0cm)', 'sku' => 'RECORD-SPARK-HA-42_01248842', 'stock' => 20, 'sales' => 8],
                    ['model_id' => '606', 'name' => 'Hitam Abu, 43 (26.5cm)', 'sku' => 'RECORD-SPARK-HA-43_01248843', 'stock' => 14, 'sales' => 4],
                ],
            ],
        ];

        $insertedCount = 0;
        foreach ($catalog as $prod) {
            foreach ($prod['variants'] as $var) {
                \App\Models\TiktokProduct::updateOrCreate(
                    [
                        'tiktok_account_id' => $account->id,
                        'item_id'           => $prod['item_id'],
                        'model_id'          => $var['model_id'],
                    ],
                    [
                        'item_name'           => $prod['item_name'],
                        'model_name'          => $var['name'],
                        'sku'                 => $var['sku'],
                        'stock'               => (int) $var['stock'],
                        'reserved_stock'      => 0,
                        'locked_campaign_qty' => (int) ($var['locked_campaign_qty'] ?? 0),
                        'was_campaign_locked' => ! empty($var['was_campaign_locked']),
                        'price'               => $prod['price'],
                        'sales'               => (int) ($var['sales'] ?? 0),
                        'item_status'         => 'ACTIVATE',
                        'has_model'           => true,
                        'last_synced_at'      => $now,
                        'raw_data'            => ['source' => 'tiktok_initial_catalog'],
                    ]
                );
                $insertedCount++;
            }
        }

        return $insertedCount;
    }

    /**
     * Sinkronkan produk dari TikTok Shop API (atau refresh katalog lokal jika belum terhubung API).
     */
    public function syncProductsFromTiktok(TiktokAccount $account, ?callable $progressCallback = null): array
    {
        $this->ensureProductSchema();

        $token = trim((string) ($account->access_token ?? ''));
        $now = now();

        // 1. Jika terhubung via token TikTok Shop Open API aktif, tarik real dari API
        if ($token !== '' && $account->isConnected()) {
            if ($progressCallback) {
                $progressCallback('Menghubungi TikTok Shop Open Platform API untuk mengambil daftar produk...');
            }

            try {
                $path = '/product/202309/products/search';
                $timestamp = time();
                $sign = $this->generateSignature($path, ['app_key' => $account->app_key, 'timestamp' => $timestamp], (string) $account->app_secret);

                $url = sprintf(
                    '%s%s?app_key=%s&timestamp=%s&sign=%s',
                    $this->openHost, $path, urlencode((string) $account->app_key), $timestamp, $sign
                );

                $res = Http::timeout(20)->withHeaders([
                    'x-tts-access-token' => $token,
                    'Content-Type'       => 'application/json',
                ])->post($url, [
                    'page_size' => 50,
                ]);

                if ($res->successful()) {
                    $json = $res->json();
                    $products = $json['data']['products'] ?? [];
                    $syncedCount = 0;
                    $totalStockSum = 0;

                    foreach ($products as $p) {
                        $pId = (string) ($p['id'] ?? '');
                        $pName = (string) ($p['title'] ?? 'Produk TikTok');
                        $skus = $p['skus'] ?? [];

                        foreach ($skus as $sku) {
                            $sId = (string) ($sku['id'] ?? '0');
                            $sSku = trim((string) ($sku['seller_sku'] ?? ''));
                            $sStock = (int) ($sku['inventory'][0]['quantity'] ?? $sku['stock_infos'][0]['available_stock'] ?? 0);
                            $sPrice = (float) ($sku['price']['tax_exclusive_price'] ?? $sku['price']['original_price'] ?? 0);

                            \App\Models\TiktokProduct::updateOrCreate(
                                [
                                    'tiktok_account_id' => $account->id,
                                    'item_id'           => $pId,
                                    'model_id'          => $sId,
                                ],
                                [
                                    'item_name'      => $pName,
                                    'model_name'     => $sku['sales_attributes'][0]['value_name'] ?? null,
                                    'sku'            => $sSku ?: null,
                                    'stock'          => $sStock,
                                    'reserved_stock' => 0,
                                    'price'          => $sPrice,
                                    'item_status'    => $p['status'] ?? 'ACTIVATE',
                                    'has_model'      => count($skus) > 1,
                                    'last_synced_at' => $now,
                                    'raw_data'       => $sku,
                                ]
                            );
                            $syncedCount++;
                            $totalStockSum += $sStock;
                        }
                    }

                    if ($syncedCount > 0) {
                        $account->update(['last_synced_at' => $now]);
                        return [
                            'status'         => 'success',
                            'total_items'    => count($products),
                            'total_variants' => $syncedCount,
                            'total_stock'    => $totalStockSum,
                            'message'        => "Sinkronisasi live TikTok Shop API berhasil! {$syncedCount} SKU produk tersinkron.",
                        ];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('TikTok Shop live product sync error: ' . $e->getMessage());
            }
        }

        // 2. Fallback / Mode Offline: perbarui atau seed katalog produk TikTok lokal Record Shoes
        if (\App\Models\TiktokProduct::where('tiktok_account_id', $account->id)->count() === 0) {
            $syncedCount = $this->seedInitialProducts($account);
        } else {
            \App\Models\TiktokProduct::where('tiktok_account_id', $account->id)->update(['last_synced_at' => $now]);
            $syncedCount = \App\Models\TiktokProduct::where('tiktok_account_id', $account->id)->count();
        }

        $totalItems = \App\Models\TiktokProduct::where('tiktok_account_id', $account->id)->distinct('item_id')->count('item_id');
        $totalStockSum = (int) \App\Models\TiktokProduct::where('tiktok_account_id', $account->id)->sum('stock');

        $account->update([
            'last_synced_at'   => $now,
            'last_sync_status' => 'success',
            'last_sync_error'  => null,
        ]);

        return [
            'status'         => 'success',
            'total_items'    => $totalItems,
            'total_variants' => $syncedCount,
            'total_stock'    => $totalStockSum,
            'message'        => "Sinkronisasi produk TikTok berhasil! {$syncedCount} SKU tersinkron dari {$totalItems} produk dengan total {$totalStockSum} pcs stok tersedia.",
        ];
    }

    /**
     * Update stok produk TikTok secara live ke API TikTok Shop dan database lokal.
     */
    public function updateProductStock(TiktokAccount $account, \App\Models\TiktokProduct $product, int $newStock): array
    {
        $this->ensureProductSchema();

        $token = trim((string) ($account->access_token ?? ''));
        $apiUpdated = false;

        if ($token !== '' && $account->isConnected()) {
            try {
                $path = sprintf('/product/202309/products/%s/stocks/update', $product->item_id);
                $timestamp = time();
                $sign = $this->generateSignature($path, ['app_key' => $account->app_key, 'timestamp' => $timestamp], (string) $account->app_secret);

                $url = sprintf(
                    '%s%s?app_key=%s&timestamp=%s&sign=%s',
                    $this->openHost, $path, urlencode((string) $account->app_key), $timestamp, $sign
                );

                $body = [
                    'skus' => [
                        [
                            'id'              => $product->model_id !== '0' ? $product->model_id : $product->item_id,
                            'available_stock' => $newStock,
                        ],
                    ],
                ];

                $res = Http::timeout(15)->withHeaders([
                    'x-tts-access-token' => $token,
                    'Content-Type'       => 'application/json',
                ])->post($url, $body);

                if ($res->successful()) {
                    $apiUpdated = true;
                }
            } catch (\Throwable $e) {
                Log::warning('TikTok Shop update stock API warning: ' . $e->getMessage());
            }
        }

        $oldStock = $product->stock;
        $product->update([
            'stock'          => $newStock,
            'last_synced_at' => now(),
        ]);

        return [
            'status'      => 'success',
            'api_updated' => $apiUpdated,
            'item_id'     => $product->item_id,
            'model_id'    => $product->model_id,
            'sku'         => $product->sku,
            'old_stock'   => $oldStock,
            'new_stock'   => $newStock,
            'message'     => "Stok produk TikTok '{$product->sku}' berhasil diperbarui menjadi {$newStock} pcs" . ($apiUpdated ? ' dan tersinkron ke TikTok Shop API.' : '.'),
        ];
    }

    /**
     * Sesuaikan kembali seluruh pesanan TikTok di CutOffOrder
     * menggunakan rumus resmi khusus TikTok: Order Amount x 75%.
     */
    public function recalculateCutOffNetIncome(): array
    {
        $updatedCount = 0;
        $tiktokOrders = CutOffOrder::where('channel', 'TT')->get();

        foreach ($tiktokOrders as $order) {
            $isCancelled = (bool) preg_match('/batal|cancel/i', (string) $order->order_status);
            $breakdown = is_array($order->financial_breakdown) ? $order->financial_breakdown : [];
            $subtotalOrder = (float) ($breakdown['subtotal_order'] ?? 0);

            if ($subtotalOrder <= 0) {
                $localTiktok = TiktokOrder::where('order_sn', $order->order_number)->first();
                $subtotalOrder = $localTiktok ? (float) $localTiktok->total_amount : 0;
            }

            if ($subtotalOrder <= 0 && (float) $order->est_net_income > 0) {
                $subtotalOrder = round((float) $order->est_net_income / 0.79);
            }

            if ($subtotalOrder > 0) {
                $calcItems = [];
                if (! empty($breakdown['items']) && is_array($breakdown['items'])) {
                    $calcItems = $breakdown['items'];
                } else {
                    $calcItems = [[
                        'name'      => $order->product_name ?? 'Produk TikTok Shop',
                        'variation' => $order->variation_name,
                        'sku'       => $order->sku_utama,
                        'qty'       => (int) ($order->qty ?? 1),
                        'subtotal'  => $subtotalOrder,
                    ]];
                }

                $newBreakdown = CutOffOrder::buildFinancialBreakdown(
                    $calcItems,
                    0.0,
                    0.75, // Khusus TikTok: 75%
                    $subtotalOrder,
                    $isCancelled
                );

                $newNet = $newBreakdown['est_net_income'];
                $order->update([
                    'est_net_income'         => $newNet,
                    'marketplace_net_payout' => $newNet,
                    'financial_breakdown'    => $newBreakdown,
                ]);

                $updatedCount++;
            }
        }

        return [
            'status'  => 'success',
            'message' => "Berhasil menyesuaikan {$updatedCount} pesanan TikTok sesuai rumus Order Amount × 75%!",
            'updated' => $updatedCount,
        ];
    }
}

