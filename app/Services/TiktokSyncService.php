<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\TiktokAccount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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

        $path      = '/order/202309/orders/search';
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

        $orders = $res['data']['orders'] ?? [];

        $createdCount = 0;
        $updatedCount = 0;

        foreach ($orders as $order) {
            $orderId = (string) ($order['id'] ?? '');
            if (empty($orderId)) continue;

            $lineItems = $order['line_items'] ?? [];
            $firstItem = $lineItems[0] ?? [];
            $totalQty  = 0;
            foreach ($lineItems as $item) {
                $totalQty += (int) ($item['quantity'] ?? 1);
            }
            if ($totalQty <= 0) $totalQty = 1;

            $statusRaw  = (string) ($order['status'] ?? '');
            $statusText = $this->mapOrderStatus($statusRaw);

            // Rumus ERP: (Harga Produk - Voucher/Diskon Toko) * 79%
            $payment        = $order['payment'] ?? [];
            $productPrice   = (float) ($payment['original_total_product_price'] ?? $payment['total_amount'] ?? 0);
            $sellerDiscount = (float) ($payment['seller_discount'] ?? 0);
            $netProduct     = max(0, $productPrice - $sellerDiscount);
            $calculatedNet  = $statusText === 'Batal' ? 0 : round($netProduct * 0.79);

            $createTime = $order['create_time'] ?? null;
            $orderDate  = $createTime ? date('Y-m-d H:i:s', (int) $createTime) : now()->toDateTimeString();

            $existing = CutOffOrder::where('order_number', $orderId)->first();

            $payload = [
                'order_date'             => $orderDate,
                'channel'                => 'TT',
                'order_number'           => $orderId,
                'buyer_username'         => $order['buyer_email'] ?? $order['buyer_uid'] ?? null,
                'shipping_courier'       => $order['shipping_provider'] ?? $order['delivery_option_name'] ?? null,
                'sku_utama'              => $firstItem['seller_sku'] ?? $firstItem['sku_id'] ?? null,
                'product_name'           => $firstItem['product_name'] ?? 'Produk TikTok Shop',
                'qty'                    => $totalQty,
                'package_count'          => count($lineItems) ?: 1,
                'order_status'           => $statusText,
                'est_net_income'         => $calculatedNet,
                'marketplace_net_payout' => $calculatedNet,
            ];

            if ($existing) {
                $existing->update([
                    'order_date'             => $orderDate,
                    'order_status'           => $statusText,
                    'shipping_courier'       => $payload['shipping_courier'] ?? $existing->shipping_courier,
                    'est_net_income'         => $calculatedNet,
                    'marketplace_net_payout' => $calculatedNet,
                ]);
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
            'total_fetched' => count($orders),
            'created'       => $createdCount,
            'updated'       => $updatedCount,
            'message'       => "Sinkronisasi TikTok berhasil! {$createdCount} pesanan baru ditambahkan, {$updatedCount} diperbarui.",
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

