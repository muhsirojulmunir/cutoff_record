<?php

namespace App\Services;

use App\Models\ShopeeAccount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class ShopeeChatService
{
    private string $host = 'https://partner.shopeemobile.com';

    public function __construct(
        private readonly ShopeeSyncService $syncService,
    ) {}

    /**
     * Generate standard Shopee V2 signature for Shop APIs.
     */
    public function generateSign(int $partnerId, string $path, int $timestamp, string $accessToken, int $shopId, string $partnerKey): string
    {
        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        return hash_hmac('sha256', $baseStr, $partnerKey);
    }

    /**
     * Ambil daftar percakapan chat pembeli dari Shopee Seller Chat Open API.
     *
     * @return array{success: bool, conversations: array, next_cursor?: string, error?: string, message?: string}
     */
    public function getConversationList(ShopeeAccount $account, string $type = 'all', int $pageSize = 20, ?string $cursor = null): array
    {
        try {
            $account = $this->syncService->getValidTokenAccount($account);
            $path = '/api/v2/sellerchat/get_conversation_list';
            $timestamp = time();

            $partnerId = (int) $account->partner_id;
            $shopId = (int) $account->shop_id;
            $accessToken = (string) $account->access_token;
            $partnerKey = (string) $account->partner_key;

            $sign = $this->generateSign($partnerId, $path, $timestamp, $accessToken, $shopId, $partnerKey);

            $queryParams = [
                'partner_id'   => $partnerId,
                'timestamp'    => $timestamp,
                'sign'         => $sign,
                'access_token' => $accessToken,
                'shop_id'      => $shopId,
                'page_size'    => $pageSize,
                'direction'    => 'latest',
                'type'         => in_array($type, ['all', 'unread', 'pinned'], true) ? $type : 'all',
            ];
            if (! empty($cursor)) {
                $queryParams['next_cursor_scroll_id'] = $cursor;
            }

            $url = $this->host . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->get($url);

            $res = $response->json();

            if (! $response->successful() || ! empty($res['error'])) {
                $errMsg = $res['message'] ?? $res['error'] ?? 'Gagal mengambil percakapan Shopee Chat.';
                Log::warning('ShopeeChatService getConversationList notice: ' . $errMsg);
                return [
                    'success'       => false,
                    'error'         => $res['error'] ?? 'HTTP_' . $response->status(),
                    'message'       => $errMsg,
                    'conversations' => [],
                ];
            }

            $conversations = $res['response']['conversations'] ?? [];
            $nextCursor = $res['response']['page_result']['next_cursor_scroll_id'] ?? null;

            return [
                'success'       => true,
                'conversations' => $conversations,
                'next_cursor'   => $nextCursor,
            ];
        } catch (\Throwable $e) {
            Log::warning('ShopeeChatService getConversationList exception: ' . $e->getMessage());
            return [
                'success'       => false,
                'error'         => 'EXCEPTION',
                'message'       => $e->getMessage(),
                'conversations' => [],
            ];
        }
    }

    /**
     * Ambil riwayat pesan dalam satu percakapan chat Shopee.
     *
     * @return array{success: bool, messages: array, next_cursor?: string, error?: string, message?: string}
     */
    public function getMessages(ShopeeAccount $account, string $conversationId, int $pageSize = 25, ?string $cursor = null): array
    {
        try {
            $account = $this->syncService->getValidTokenAccount($account);
            $path = '/api/v2/sellerchat/get_message';
            $timestamp = time();

            $partnerId = (int) $account->partner_id;
            $shopId = (int) $account->shop_id;
            $accessToken = (string) $account->access_token;
            $partnerKey = (string) $account->partner_key;

            $sign = $this->generateSign($partnerId, $path, $timestamp, $accessToken, $shopId, $partnerKey);

            $queryParams = [
                'partner_id'      => $partnerId,
                'timestamp'       => $timestamp,
                'sign'            => $sign,
                'access_token'    => $accessToken,
                'shop_id'         => $shopId,
                'conversation_id' => $conversationId,
                'page_size'       => $pageSize,
            ];
            if (! empty($cursor)) {
                $queryParams['offset_scroll_id'] = $cursor;
            }

            $url = $this->host . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(15)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->get($url);

            $res = $response->json();

            if (! $response->successful() || ! empty($res['error'])) {
                $errMsg = $res['message'] ?? $res['error'] ?? 'Gagal mengambil pesan Shopee.';
                Log::warning('ShopeeChatService getMessages notice: ' . $errMsg);
                return [
                    'success'  => false,
                    'error'    => $res['error'] ?? 'HTTP_' . $response->status(),
                    'message'  => $errMsg,
                    'messages' => [],
                ];
            }

            $messages = $res['response']['messages'] ?? [];
            $nextCursor = $res['response']['page_result']['next_scroll_id'] ?? null;

            return [
                'success'     => true,
                'messages'    => $messages,
                'next_cursor' => $nextCursor,
            ];
        } catch (\Throwable $e) {
            Log::warning('ShopeeChatService getMessages exception: ' . $e->getMessage());
            return [
                'success'  => false,
                'error'    => 'EXCEPTION',
                'message'  => $e->getMessage(),
                'messages' => [],
            ];
        }
    }

    /**
     * Kirim pesan teks ke pembeli Shopee via Seller Chat API.
     *
     * @return array{success: bool, message_id?: string, error?: string, message?: string}
     */
    public function sendMessage(ShopeeAccount $account, int|string $toId, string $text): array
    {
        try {
            $account = $this->syncService->getValidTokenAccount($account);
            $path = '/api/v2/sellerchat/send_message';
            $timestamp = time();

            $partnerId = (int) $account->partner_id;
            $shopId = (int) $account->shop_id;
            $accessToken = (string) $account->access_token;
            $partnerKey = (string) $account->partner_key;

            $sign = $this->generateSign($partnerId, $path, $timestamp, $accessToken, $shopId, $partnerKey);

            $queryParams = [
                'partner_id'   => $partnerId,
                'timestamp'    => $timestamp,
                'sign'         => $sign,
                'access_token' => $accessToken,
                'shop_id'      => $shopId,
            ];

            $bodyPayload = [
                'to_id'        => (int) $toId,
                'message_type' => 'text',
                'content'      => [
                    'text' => trim($text),
                ],
            ];

            $url = $this->host . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(20)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post($url, $bodyPayload);

            $res = $response->json();

            if (! $response->successful() || ! empty($res['error'])) {
                $errMsg = $res['message'] ?? $res['error'] ?? 'Gagal mengirim pesan chat ke Shopee.';
                Log::warning('ShopeeChatService sendMessage notice: ' . $errMsg);
                return [
                    'success' => false,
                    'error'   => $res['error'] ?? 'HTTP_' . $response->status(),
                    'message' => $errMsg,
                ];
            }

            $messageId = $res['response']['message_id'] ?? null;

            return [
                'success'    => true,
                'message_id' => $messageId,
                'message'    => 'Pesan berhasil terkirim ke pembeli Shopee.',
            ];
        } catch (\Throwable $e) {
            Log::warning('ShopeeChatService sendMessage exception: ' . $e->getMessage());
            return [
                'success' => false,
                'error'   => 'EXCEPTION',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Tandai percakapan Shopee sebagai terbaca.
     */
    public function readConversation(ShopeeAccount $account, string $conversationId, ?string $lastReadMessageId = null): array
    {
        try {
            $account = $this->syncService->getValidTokenAccount($account);
            $path = '/api/v2/sellerchat/read_conversation';
            $timestamp = time();

            $partnerId = (int) $account->partner_id;
            $shopId = (int) $account->shop_id;
            $accessToken = (string) $account->access_token;
            $partnerKey = (string) $account->partner_key;

            $sign = $this->generateSign($partnerId, $path, $timestamp, $accessToken, $shopId, $partnerKey);

            $queryParams = [
                'partner_id'   => $partnerId,
                'timestamp'    => $timestamp,
                'sign'         => $sign,
                'access_token' => $accessToken,
                'shop_id'      => $shopId,
            ];

            $bodyPayload = [
                'conversation_id' => $conversationId,
            ];
            if (! empty($lastReadMessageId)) {
                $bodyPayload['last_read_message_id'] = $lastReadMessageId;
            }

            $url = $this->host . $path . '?' . http_build_query($queryParams);

            $response = Http::timeout(10)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post($url, $bodyPayload);

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

    /**
     * Hitung total percakapan yang belum dibaca dari Shopee.
     */
    public function getUnreadConversationCount(ShopeeAccount $account): int
    {
        try {
            $account = $this->syncService->getValidTokenAccount($account);
            $path = '/api/v2/sellerchat/get_unread_conversation_count';
            $timestamp = time();

            $partnerId = (int) $account->partner_id;
            $shopId = (int) $account->shop_id;
            $accessToken = (string) $account->access_token;
            $partnerKey = (string) $account->partner_key;

            $sign = $this->generateSign($partnerId, $path, $timestamp, $accessToken, $shopId, $partnerKey);

            $queryParams = [
                'partner_id'   => $partnerId,
                'timestamp'    => $timestamp,
                'sign'         => $sign,
                'access_token' => $accessToken,
                'shop_id'      => $shopId,
            ];

            $url = $this->host . $path . '?' . http_build_query($queryParams);
            $response = Http::timeout(10)->get($url);
            $res = $response->json();

            return (int) ($res['response']['unread_conversation_count'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }
}

