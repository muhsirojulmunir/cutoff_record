<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\ShopeeAccount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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
            $now = time();
            $from = $now - 86400; // 1 day
            $orders = $this->fetchOrderListRaw($account, $from, $now, 1);
            $account->update(['connection_status' => 'connected', 'last_sync_error' => null]);
            return ['success' => true, 'message' => 'Koneksi ke Shopee API berhasil! Akun toko terhubung normal.'];
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

        // 1. Fetch Order List
        $orderList = $this->fetchOrderListRaw($account, $timeFrom, $timeTo, 100);
        $orderSns = array_column($orderList, 'order_sn');

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

        // 2. Fetch Order Details in batches of up to 50
        $chunks = array_chunk($orderSns, 50);
        $detailedOrders = [];

        foreach ($chunks as $chunk) {
            $details = $this->fetchOrderDetailRaw($account, $chunk);
            $detailedOrders = array_merge($detailedOrders, $details);
        }

        // 3. Ingest into CutOffOrder table
        $createdCount = 0;
        $updatedCount = 0;

        foreach ($detailedOrders as $order) {
            $orderSn = $order['order_sn'] ?? null;
            if (! $orderSn) continue;

            $items = $order['item_list'] ?? [];
            $firstItem = $items[0] ?? [];
            $totalQty = array_sum(array_column($items, 'model_quantity_purchased')) ?: 1;

            $totalAmount = (float) ($order['total_amount'] ?? 0);
            $statusText  = $this->mapOrderStatus($order['order_status'] ?? '');
            $orderDate   = ! empty($order['create_time']) ? date('Y-m-d', $order['create_time']) : now()->toDateString();

            $existing = CutOffOrder::where('order_number', $orderSn)->first();

            $payload = [
                'order_date'             => $orderDate,
                'channel'                => 'SH',
                'order_number'           => $orderSn,
                'buyer_username'         => $order['buyer_username'] ?? $order['buyer_user_id'] ?? null,
                'shipping_courier'       => $order['shipping_carrier'] ?? null,
                'sku_utama'              => $firstItem['model_sku'] ?? $firstItem['item_sku'] ?? null,
                'product_name'           => $firstItem['item_name'] ?? 'Produk Shopee',
                'qty'                    => $totalQty,
                'package_count'          => count($items) ?: 1,
                'order_status'           => $statusText,
                'est_net_income'         => $totalAmount,
                'marketplace_net_payout' => $totalAmount,
            ];

            if ($existing) {
                // Update existing record
                $existing->update([
                    'order_status'           => $statusText,
                    'shipping_courier'       => $payload['shipping_courier'] ?? $existing->shipping_courier,
                    'est_net_income'         => $totalAmount ?: $existing->est_net_income,
                    'marketplace_net_payout' => $totalAmount ?: $existing->marketplace_net_payout,
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
     * Fetch raw order list from Shopee API v2.
     */
    private function fetchOrderListRaw(ShopeeAccount $account, int $timeFrom, int $timeTo, int $pageSize = 50): array
    {
        $path        = '/api/v2/order/get_order_list';
        $timestamp   = time();
        $accessToken = $account->access_token ?? '';
        $shopId      = $account->shop_id;
        $partnerId   = $account->partner_id;
        $partnerKey  = $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $url = sprintf(
            '%s%s?partner_id=%s&timestamp=%s&sign=%s&access_token=%s&shop_id=%s',
            $this->host, $path, $partnerId, $timestamp, $sign, $accessToken, $shopId
        );

        $response = Http::timeout(20)->get($url, [
            'time_range_field' => 'create_time',
            'time_from'        => $timeFrom,
            'time_to'          => $timeTo,
            'page_size'        => $pageSize,
        ]);

        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            throw new RuntimeException('Shopee API Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil order list'));
        }

        return $data['response']['order_list'] ?? [];
    }

    /**
     * Fetch raw order details in batch from Shopee API v2.
     */
    private function fetchOrderDetailRaw(ShopeeAccount $account, array $orderSns): array
    {
        if (empty($orderSns)) return [];

        $path        = '/api/v2/order/get_order_detail';
        $timestamp   = time();
        $accessToken = $account->access_token ?? '';
        $shopId      = $account->shop_id;
        $partnerId   = $account->partner_id;
        $partnerKey  = $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

        $url = sprintf(
            '%s%s?partner_id=%s&timestamp=%s&sign=%s&access_token=%s&shop_id=%s',
            $this->host, $path, $partnerId, $timestamp, $sign, $accessToken, $shopId
        );

        $response = Http::timeout(25)->get($url, [
            'order_sn_list'            => implode(',', $orderSns),
            'response_optional_fields' => 'buyer_user_id,buyer_username,item_list,total_amount,shipping_carrier,order_status',
        ]);

        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            throw new RuntimeException('Shopee Detail Error: ' . ($data['message'] ?? $data['error'] ?? 'Gagal mengambil detail order'));
        }

        return $data['response']['order_list'] ?? [];
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
}
