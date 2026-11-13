<?php

namespace App\Services;

use App\Models\TiktokAccount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TiktokChatService
{
    private string $openHost = 'https://open-api.tiktokglobalshop.com';

    public function __construct(
        private readonly TiktokSyncService $syncService,
    ) {}

    /**
     * Ambil daftar percakapan chat pembeli dari TikTok Shop Partner API.
     */
    public function getConversationList(TiktokAccount $account, int $pageSize = 20, ?string $pageToken = null): array
    {
        try {
            $this->syncService->ensureValidAccessToken($account);
            if (empty($account->shop_cipher)) {
                $this->syncService->fetchAuthorizedShops($account);
            }

            $path = '/customer_service/202309/conversations';
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $account->shop_cipher,
                'page_size'   => (string) $pageSize,
            ];
            if (! empty($pageToken)) {
                $queryParams['page_token'] = $pageToken;
            }

            $sign = $this->syncService->generateSignature($path, $queryParams, $account->app_secret, '');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->get($url);

            $res = $response->json();

            if (! $response->successful() || ($res['code'] ?? -1) !== 0) {
                $errMsg = $res['message'] ?? 'Gagal mengambil percakapan TikTok CS.';
                Log::warning('TiktokChatService getConversationList notice: ' . $errMsg);
                return [
                    'success'       => false,
                    'error'         => (string) ($res['code'] ?? 'HTTP_' . $response->status()),
                    'message'       => $errMsg,
                    'conversations' => [],
                ];
            }

            return [
                'success'       => true,
                'conversations' => $res['data']['conversations'] ?? [],
                'next_cursor'   => $res['data']['next_page_token'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::warning('TiktokChatService getConversationList exception: ' . $e->getMessage());
            return [
                'success'       => false,
                'error'         => 'EXCEPTION',
                'message'       => $e->getMessage(),
                'conversations' => [],
            ];
        }
    }

    /**
     * Ambil riwayat pesan dalam satu percakapan chat TikTok.
     */
    public function getMessages(TiktokAccount $account, string $conversationId, int $pageSize = 25, ?string $pageToken = null): array
    {
        try {
            $this->syncService->ensureValidAccessToken($account);
            if (empty($account->shop_cipher)) {
                $this->syncService->fetchAuthorizedShops($account);
            }

            $path = "/customer_service/202309/conversations/{$conversationId}/messages";
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $account->shop_cipher,
                'page_size'   => (string) $pageSize,
            ];
            if (! empty($pageToken)) {
                $queryParams['page_token'] = $pageToken;
            }

            $sign = $this->syncService->generateSignature($path, $queryParams, $account->app_secret, '');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->get($url);

            $res = $response->json();

            if (! $response->successful() || ($res['code'] ?? -1) !== 0) {
                $errMsg = $res['message'] ?? 'Gagal mengambil pesan TikTok CS.';
                Log::warning('TiktokChatService getMessages notice: ' . $errMsg);
                return [
                    'success'  => false,
                    'error'    => (string) ($res['code'] ?? 'HTTP_' . $response->status()),
                    'message'  => $errMsg,
                    'messages' => [],
                ];
            }

            return [
                'success'     => true,
                'messages'    => $res['data']['messages'] ?? [],
                'next_cursor' => $res['data']['next_page_token'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::warning('TiktokChatService getMessages exception: ' . $e->getMessage());
            return [
                'success'  => false,
                'error'    => 'EXCEPTION',
                'message'  => $e->getMessage(),
                'messages' => [],
            ];
        }
    }

    /**
     * Kirim pesan teks ke pembeli TikTok Shop.
     */
    public function sendMessage(TiktokAccount $account, string $conversationId, string $text): array
    {
        try {
            $this->syncService->ensureValidAccessToken($account);
            if (empty($account->shop_cipher)) {
                $this->syncService->fetchAuthorizedShops($account);
            }

            $path = "/customer_service/202309/conversations/{$conversationId}/messages";
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $account->shop_cipher,
            ];

            $bodyPayload = [
                'type'    => 'TEXT',
                'content' => json_encode(['text' => trim($text)]),
            ];
            $bodyJson = json_encode($bodyPayload);

            $sign = $this->syncService->generateSignature($path, $queryParams, $account->app_secret, $bodyJson);
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(20)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->withBody($bodyJson, 'application/json')
                ->post($url);

            $res = $response->json();

            if (! $response->successful() || ($res['code'] ?? -1) !== 0) {
                $errMsg = $res['message'] ?? 'Gagal mengirim pesan ke pembeli TikTok Shop.';
                Log::warning('TiktokChatService sendMessage notice: ' . $errMsg);
                return [
                    'success' => false,
                    'error'   => (string) ($res['code'] ?? 'HTTP_' . $response->status()),
                    'message' => $errMsg,
                ];
            }

            return [
                'success'    => true,
                'message_id' => $res['data']['message_id'] ?? null,
                'message'    => 'Pesan berhasil terkirim ke pembeli TikTok Shop.',
            ];
        } catch (\Throwable $e) {
            Log::warning('TiktokChatService sendMessage exception: ' . $e->getMessage());
            return [
                'success' => false,
                'error'   => 'EXCEPTION',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Tandai pesan TikTok sebagai terbaca.
     */
    public function readConversation(TiktokAccount $account, string $conversationId): array
    {
        try {
            $this->syncService->ensureValidAccessToken($account);
            if (empty($account->shop_cipher)) {
                $this->syncService->fetchAuthorizedShops($account);
            }

            $path = "/customer_service/202309/conversations/{$conversationId}/messages/read";
            $timestamp = time();

            $queryParams = [
                'app_key'     => $account->app_key,
                'timestamp'   => (string) $timestamp,
                'shop_cipher' => $account->shop_cipher,
            ];

            $sign = $this->syncService->generateSignature($path, $queryParams, $account->app_secret, '{}');
            $queryParams['sign'] = $sign;

            $url = $this->openHost . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(10)
                ->withHeaders([
                    'x-tts-access-token' => $account->access_token,
                    'Content-Type'       => 'application/json',
                ])
                ->post($url);

            return [
                'success' => $response->successful(),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error'   => $e->getMessage(),
            ];
        }
    }
}

