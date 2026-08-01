<?php

namespace App\Services\Marketplace\TikTok;

use App\Models\MarketplaceAccount;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use RuntimeException;

class TikTokShopApiService
{
    private string $host;
    private string $appKey;
    private string $appSecret;

    public function __construct()
    {
        $this->host      = config('services.tiktok.host', 'https://open-api.tiktokglobalshop.com');
        $this->appKey    = config('services.tiktok.app_key', '68123456789');
        $this->appSecret = config('services.tiktok.app_secret', 'tiktok_app_secret_key');
    }

    /**
     * Generate TikTok Shop OAuth authorization URL.
     */
    public function getAuthorizationUrl(int $accountId, string $redirectUrl): string
    {
        return sprintf(
            'https://services.tiktokshops.com/open/authorize?app_key=%s&state=%s',
            $this->appKey,
            $accountId
        );
    }

    /**
     * Exchange auth code for access_token and refresh_token.
     */
    public function exchangeAuthorizationCode(MarketplaceAccount $account, string $authCode): MarketplaceAccount
    {
        $url = 'https://auth.tiktok-shops.com/api/v2/token/get';

        $response = Http::timeout(10)->get($url, [
            'app_key'    => $this->appKey,
            'app_secret' => $this->appSecret,
            'auth_code'  => $authCode,
            'grant_type' => 'authorized_code',
        ]);

        if ($response->failed()) {
            $account->update(['connection_status' => 'error', 'last_sync_error' => 'Gagal menukar auth code TikTok Shop.']);
            throw new RuntimeException("Gagal menukar auth code TikTok Shop (HTTP " . $response->status() . ").");
        }

        $data = $response->json();
        if (($data['code'] ?? 0) !== 0) {
            throw new RuntimeException("TikTok Shop Token Error: " . ($data['message'] ?? 'Unknown Error'));
        }

        $tokenData = $data['data'] ?? [];
        $expiresIn = $tokenData['access_token_expire_in'] ?? 86400;

        $credentials = [
            'access_token'  => $tokenData['access_token'] ?? null,
            'refresh_token' => $tokenData['refresh_token'] ?? null,
            'open_id'       => $tokenData['open_id'] ?? null,
            'seller_name'   => $tokenData['seller_name'] ?? null,
        ];

        $account->update([
            'shop_id'           => $tokenData['open_id'] ?? $account->shop_id,
            'shop_name'         => $tokenData['seller_name'] ?? $account->shop_name,
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
        $lockKey = "tiktok_token_refresh_lock_{$account->id}";

        return Cache::lock($lockKey, 10)->block(5, function () use ($account) {
            $credentials  = $account->credentials ?? [];
            $refreshToken = $credentials['refresh_token'] ?? null;

            if (! $refreshToken) {
                $account->update([
                    'connection_status' => 'expired',
                    'credentials_status'=> 'expired',
                    'last_sync_error'   => 'Refresh token TikTok Shop tidak ditemukan.',
                ]);
                throw new InvalidArgumentException('Refresh token TikTok Shop tidak ditemukan.');
            }

            $url = 'https://auth.tiktok-shops.com/api/v2/token/refresh';

            $response = Http::timeout(10)->get($url, [
                'app_key'       => $this->appKey,
                'app_secret'    => $this->appSecret,
                'refresh_token' => $refreshToken,
                'grant_type'    => 'refresh_token',
            ]);

            if ($response->failed()) {
                $account->update([
                    'connection_status' => 'expired',
                    'credentials_status'=> 'expired',
                    'last_sync_error'   => 'Gagal refresh token TikTok Shop.',
                ]);
                throw new RuntimeException('Gagal refresh token TikTok Shop (HTTP ' . $response->status() . ').');
            }

            $data = $response->json();
            if (($data['code'] ?? 0) !== 0) {
                $account->update(['connection_status' => 'error', 'last_sync_error' => $data['message'] ?? 'Error']);
                throw new RuntimeException("TikTok Shop Refresh Error: " . ($data['message'] ?? 'Unknown'));
            }

            $tokenData  = $data['data'] ?? [];
            $expiresIn  = $tokenData['access_token_expire_in'] ?? 86400;
            $updatedCred = array_merge($credentials, [
                'access_token'  => $tokenData['access_token'] ?? null,
                'refresh_token' => $tokenData['refresh_token'] ?? $refreshToken,
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
     * Get order list from TikTok Shop API.
     */
    public function getOrderList(MarketplaceAccount $account, string $timeFrom, string $timeTo, int $pageSize = 50): array
    {
        return $this->executeWithAutoRefresh($account, function ($acc) use ($timeFrom, $timeTo, $pageSize) {
            $path        = '/order/202309/orders/search';
            $timestamp   = time();
            $credentials = $acc->credentials ?? [];
            $accessToken = $credentials['access_token'] ?? '';

            $sign = $this->generateSign($path, $timestamp);

            $url = sprintf(
                '%s%s?app_key=%s&timestamp=%s&sign=%s',
                $this->host, $path, $this->appKey, $timestamp, $sign
            );

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $accessToken,
                    'Content-Type'       => 'application/json',
                ])
                ->post($url, [
                    'create_time_ge' => strtotime($timeFrom),
                    'create_time_lt' => strtotime($timeTo),
                    'page_size'      => $pageSize,
                ]);

            if ($response->status() === 401) {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            if ($response->failed()) {
                throw new RuntimeException('TikTok Shop API getOrderList failed HTTP ' . $response->status());
            }

            $data = $response->json();
            if (($data['code'] ?? 0) === 105001 || ($data['code'] ?? 0) === 105002) {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            return $data['data']['orders'] ?? [];
        });
    }

    /**
     * Get order detail from TikTok Shop API.
     */
    public function getOrderDetail(MarketplaceAccount $account, array $orderIds): array
    {
        if (empty($orderIds)) {
            return [];
        }

        return $this->executeWithAutoRefresh($account, function ($acc) use ($orderIds) {
            $path        = '/order/202309/orders';
            $timestamp   = time();
            $credentials = $acc->credentials ?? [];
            $accessToken = $credentials['access_token'] ?? '';

            $sign = $this->generateSign($path, $timestamp);

            $url = sprintf(
                '%s%s?app_key=%s&timestamp=%s&sign=%s&ids=%s',
                $this->host, $path, $this->appKey, $timestamp, $sign, implode(',', $orderIds)
            );

            $response = Http::timeout(15)
                ->withHeaders(['x-tts-access-token' => $accessToken])
                ->get($url);

            if ($response->status() === 401) {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            if ($response->failed()) {
                throw new RuntimeException('TikTok Shop API getOrderDetail failed HTTP ' . $response->status());
            }

            $data = $response->json();
            if (($data['code'] ?? 0) === 105001 || ($data['code'] ?? 0) === 105002) {
                throw new RuntimeException('UNAUTHORIZED_TOKEN');
            }

            return $data['data']['orders'] ?? [];
        });
    }

    /**
     * Test connection to TikTok Shop API.
     */
    public function testConnection(MarketplaceAccount $account): bool
    {
        try {
            $this->getOrderList($account, date('Y-m-d H:i:s', strtotime('-1 day')), date('Y-m-d H:i:s'), 1);
            $account->update(['connection_status' => 'connected', 'last_sync_error' => null]);
            return true;
        } catch (\Exception $e) {
            $sanitized = preg_replace('/access-token=[^&]+/', 'access-token=***', $e->getMessage());
            $account->update(['connection_status' => 'error', 'last_sync_error' => $sanitized]);
            return false;
        }
    }

    private function generateSign(string $path, int $timestamp): string
    {
        $baseStr = sprintf('%s%s%s%s', $this->appSecret, $path, $timestamp, $this->appKey);
        return hash_hmac('sha256', $baseStr, $this->appSecret);
    }

    private function executeWithAutoRefresh(MarketplaceAccount $account, callable $callback, int $maxRetries = 2)
    {
        $attempt = 0;
        while ($attempt < $maxRetries) {
            try {
                return $callback($account);
            } catch (RuntimeException $e) {
                if ($e->getMessage() === 'UNAUTHORIZED_TOKEN') {
                    Log::info("TikTok Shop Token Expired for Account #{$account->id}, attempting refresh.");
                    $account = $this->refreshAccessToken($account);
                    $attempt++;
                    continue;
                }
                throw $e;
            }
        }
        throw new RuntimeException("Maximum retry attempts reached for TikTok Shop API call.");
    }
}
