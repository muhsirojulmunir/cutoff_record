<?php

namespace App\Services\Marketplace\Shopee;

use App\Models\MarketplaceAccount;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use RuntimeException;

class ShopeeApiService
{
    private string $host;
    private string $partnerId;
    private string $partnerKey;

    public function __construct()
    {
        $this->host       = config('services.shopee.host', 'https://partner.shopeemobile.com');
        $this->partnerId  = config('services.shopee.partner_id', '123456');
        $this->partnerKey = config('services.shopee.partner_key', 'shopee_partner_secret_key');
    }

    /**
     * Generate Shopee OAuth authorization URL.
     */
    public function getAuthorizationUrl(int $accountId, string $redirectUrl): string
    {
        $path      = '/api/v2/shop/auth_partner';
        $timestamp = time();
        $baseStr   = sprintf('%s%s%s', $this->partnerId, $path, $timestamp);
        $sign      = hash_hmac('sha256', $baseStr, $this->partnerKey);

        return sprintf(
            '%s%s?partner_id=%s&timestamp=%s&sign=%s&redirect=%s&state=%s',
            $this->host,
            $path,
            $this->partnerId,
            $timestamp,
            $sign,
            urlencode($redirectUrl),
            $accountId
        );
    }

    /**
     * Exchange auth code for access_token and refresh_token.
     */
    public function exchangeAuthorizationCode(MarketplaceAccount $account, string $code, string $shopId): MarketplaceAccount
    {
        $path      = '/api/v2/auth/token/get';
        $timestamp = time();
        $baseStr   = sprintf('%s%s%s', $this->partnerId, $path, $timestamp);
        $sign      = hash_hmac('sha256', $baseStr, $this->partnerKey);

        $url = sprintf('%s%s?partner_id=%s&timestamp=%s&sign=%s', $this->host, $path, $this->partnerId, $timestamp, $sign);

        $response = Http::timeout(10)
            ->post($url, [
                'code'       => $code,
                'partner_id' => (int) $this->partnerId,
                'shop_id'    => (int) $shopId,
            ]);

        if ($response->failed()) {
            $this->handleApiFailure($account, 'Gagal menukar authorization code Shopee', $response->status());
        }

        $data = $response->json();
        if (! empty($data['error'])) {
            throw new RuntimeException("Shopee API Error: " . ($data['message'] ?? $data['error']));
        }

        $expiresIn = $data['expires_in'] ?? 14400; // default 4 hours

        $credentials = [
            'access_token'  => $data['access_token'] ?? null,
            'refresh_token' => $data['refresh_token'] ?? null,
            'partner_id'    => $this->partnerId,
            'shop_id'       => $shopId,
        ];

        $account->update([
            'shop_id'           => $shopId,
            'credentials'       => $credentials,
            'credentials_status'=> 'configured',
            'connection_status' => 'connected',
            'token_expires_at'  => now()->addSeconds($expiresIn),
            'last_connected_at' => now(),
            'last_sync_error'   => null,
        ]);

        return $account->fresh();
    }

    /**
     * Refresh Access Token with concurrency lock.
     */
    public function refreshAccessToken(MarketplaceAccount $account): MarketplaceAccount
    {
        $lockKey = "shopee_token_refresh_lock_{$account->id}";

        return Cache::lock($lockKey, 10)->block(5, function () use ($account) {
            $credentials  = $account->credentials ?? [];
            $refreshToken = $credentials['refresh_token'] ?? null;
            $shopId       = $account->shop_id;

            if (! $refreshToken) {
                $account->update([
                    'connection_status' => 'expired',
                    'credentials_status'=> 'expired',
                    'last_sync_error'   => 'Refresh token Shopee tidak ditemukan.',
                ]);
                throw new InvalidArgumentException('Refresh token Shopee tidak ditemukan. Silakan hubungkan kembali akun.');
            }

            $path      = '/api/v2/auth/access_token/get';
            $timestamp = time();
            $baseStr   = sprintf('%s%s%s', $this->partnerId, $path, $timestamp);
            $sign      = hash_hmac('sha256', $baseStr, $this->partnerKey);

            $url = sprintf('%s%s?partner_id=%s&timestamp=%s&sign=%s', $this->host, $path, $this->partnerId, $timestamp, $sign);

            $response = Http::timeout(10)->post($url, [
                'refresh_token' => $refreshToken,
                'partner_id'    => (int) $this->partnerId,
                'shop_id'       => (int) $shopId,
            ]);

            if ($response->failed()) {
                $account->update([
                    'connection_status' => 'expired',
                    'credentials_status'=> 'expired',
                    'last_sync_error'   => 'Token refresh failed.',
                ]);
                throw new RuntimeException('Gagal melakukan refresh token Shopee (HTTP ' . $response->status() . ').');
            }

            $data = $response->json();
            if (! empty($data['error'])) {
                $account->update([
                    'connection_status' => 'error',
                    'last_sync_error'   => $data['message'] ?? $data['error'],
                ]);
                throw new RuntimeException("Shopee Token Refresh Error: " . ($data['message'] ?? $data['error']));
            }

            $expiresIn   = $data['expires_in'] ?? 14400;
            $updatedCred = array_merge($credentials, [
                'access_token'  => $data['access_token'] ?? null,
                'refresh_token' => $data['refresh_token'] ?? $refreshToken,
            ]);

            $account->update([
                'credentials'       => $updatedCred,
                'connection_status' => 'connected',
                'credentials_status'=> 'configured',
                'token_expires_at'  => now()->addSeconds($expiresIn),
                'last_connected_at' => now(),
                'last_sync_error'   => null,
            ]);

            return $account->fresh();
        });
    }

    /**
     * Get order list from Shopee API with auto token refresh retry.
     */
    public function getOrderList(MarketplaceAccount $account, string $timeFrom, string $timeTo, int $pageSize = 50): array
    {
        return $this->executeWithAutoRefresh($account, function ($acc) use ($timeFrom, $timeTo, $pageSize) {
            $path        = '/api/v2/order/get_order_list';
            $timestamp   = time();
            $credentials = $acc->credentials ?? [];
            $accessToken = $credentials['access_token'] ?? '';
            $shopId      = $acc->shop_id;

            $timeFromTs  = strtotime($timeFrom);
            $timeToTs    = strtotime($timeTo);

            $baseStr = sprintf('%s%s%s%s%s', $this->partnerId, $path, $timestamp, $accessToken, $shopId);
            $sign    = hash_hmac('sha256', $baseStr, $this->partnerKey);

            $url = sprintf(
                '%s%s?partner_id=%s&timestamp=%s&sign=%s&access_token=%s&shop_id=%s',
                $this->host, $path, $this->partnerId, $timestamp, $sign, $accessToken, $shopId
            );

            $response = Http::timeout(15)->get($url, [
                'time_range_field' => 'create_time',
                'time_from'        => $timeFromTs,
                'time_to'          => $timeToTs,
                'page_size'        => $pageSize,
            ]);

            if ($response->status() === 401) {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            if ($response->failed()) {
                throw new RuntimeException('Shopee API order list fetch failed with HTTP ' . $response->status());
            }

            $data = $response->json();
            if (($data['error'] ?? '') === 'error_auth' || ($data['error'] ?? '') === 'error_token') {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            return $data['response']['order_list'] ?? [];
        });
    }

    /**
     * Get order detail from Shopee API with auto token refresh retry.
     */
    public function getOrderDetail(MarketplaceAccount $account, array $orderSns): array
    {
        if (empty($orderSns)) {
            return [];
        }

        return $this->executeWithAutoRefresh($account, function ($acc) use ($orderSns) {
            $path        = '/api/v2/order/get_order_detail';
            $timestamp   = time();
            $credentials = $acc->credentials ?? [];
            $accessToken = $credentials['access_token'] ?? '';
            $shopId      = $acc->shop_id;

            $baseStr = sprintf('%s%s%s%s%s', $this->partnerId, $path, $timestamp, $accessToken, $shopId);
            $sign    = hash_hmac('sha256', $baseStr, $this->partnerKey);

            $url = sprintf(
                '%s%s?partner_id=%s&timestamp=%s&sign=%s&access_token=%s&shop_id=%s',
                $this->host, $path, $this->partnerId, $timestamp, $sign, $accessToken, $shopId
            );

            $response = Http::timeout(15)->get($url, [
                'order_sn_list'                      => implode(',', $orderSns),
                'response_optional_fields'           => 'buyer_user_id,recipient_address,item_list,pay_time,total_amount,actual_shipping_fee,seller_discount,service_fee,tracking_number,shipping_carrier',
            ]);

            if ($response->status() === 401) {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            if ($response->failed()) {
                throw new RuntimeException('Shopee API order detail fetch failed with HTTP ' . $response->status());
            }

            $data = $response->json();
            if (($data['error'] ?? '') === 'error_auth' || ($data['error'] ?? '') === 'error_token') {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            return $data['response']['order_list'] ?? [];
        });
    }

    /**
     * Test connection to Shopee API.
     */
    public function testConnection(MarketplaceAccount $account): bool
    {
        try {
            $this->getOrderList($account, date('Y-m-d H:i:s', strtotime('-1 day')), date('Y-m-d H:i:s'), 1);
            $account->update(['connection_status' => 'connected', 'last_sync_error' => null]);
            return true;
        } catch (\Exception $e) {
            $sanitized = preg_replace('/access_token=[^&]+/', 'access_token=***', $e->getMessage());
            $account->update(['connection_status' => 'error', 'last_sync_error' => $sanitized]);
            return false;
        }
    }

    /**
     * Execute callback with auto token refresh retry logic.
     */
    private function executeWithAutoRefresh(MarketplaceAccount $account, callable $callback, int $maxRetries = 2)
    {
        $attempt = 0;
        while ($attempt < $maxRetries) {
            try {
                return $callback($account);
            } catch (RuntimeException $e) {
                if ($e->getMessage() === 'UNAUTHORIZED_TOKEN') {
                    Log::info("Shopee Token Expired for Account #{$account->id}, attempting refresh.");
                    $account = $this->refreshAccessToken($account);
                    $attempt++;
                    continue;
                }
                throw $e;
            }
        }
        throw new RuntimeException("Maximum retry attempts reached for Shopee API call.");
    }

    private function handleApiFailure(MarketplaceAccount $account, string $message, int $statusCode): void
    {
        $account->update([
            'connection_status' => 'error',
            'last_sync_error'   => "{$message} (HTTP Status {$statusCode})",
        ]);
        throw new RuntimeException("{$message} (HTTP Status {$statusCode})");
    }
}
