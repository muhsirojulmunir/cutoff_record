<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Services\ShopeeOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ShopeeWebhookController extends Controller
{
    public function __construct(
        private readonly ShopeeOrderService $orderService,
    ) {}

    /**
     * Terima push notification Shopee Open Platform v2 (verifikasi HMAC-SHA256 + refresh read-only).
     */
    public function handle(Request $request): JsonResponse
    {
        $rawBody = (string) $request->getContent();
        $signature = trim((string) $request->header('Authorization', ''));

        if ($signature === '') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Header Authorization webhook Shopee tidak ditemukan.',
            ], 401);
        }

        $decoded = $rawBody !== '' ? json_decode($rawBody, true) : null;
        $payload = is_array($decoded) ? $decoded : $request->all();

        $code = isset($payload['code']) ? (int) $payload['code'] : -1;
        $shopId = isset($payload['shop_id']) ? trim((string) $payload['shop_id']) : '';

        $candidates = $this->resolveCandidateAccounts($shopId, $code);
        $candidateUrls = $this->buildCandidateUrls($request);

        $verifiedAccount = $this->findVerifiedAccount($candidates, $signature, $rawBody, $candidateUrls);
        if (! $verifiedAccount) {
            Log::warning('ShopeeWebhookController invalid signature', [
                'shop_id' => $shopId !== '' ? $shopId : null,
                'code'    => $code,
            ]);

            return response()->json([
                'status'  => 'error',
                'message' => 'Signature webhook Shopee tidak valid.',
            ], 401);
        }

        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $orderSn = trim((string) ($data['ordersn'] ?? $data['order_sn'] ?? ''));

        if ($code === 0 || $orderSn === '') {
            return response()->json([
                'status'  => 'ok',
                'code'    => $code,
                'message' => $code === 0
                    ? 'Shopee webhook ping acknowledged.'
                    : 'Shopee webhook event acknowledged.',
            ], 200);
        }

        $lock = Cache::lock("shopee_webhook_{$verifiedAccount->id}_{$orderSn}", 10);
        if (! $lock->get()) {
            return response()->json([
                'status'    => 'accepted',
                'debounced' => true,
                'order_sn'  => $orderSn,
                'code'      => $code,
                'message'   => 'Webhook order sedang diproses dalam jeda debounce.',
            ], 200);
        }

        try {
            $stats = $this->orderService->refreshOrderBySnList($verifiedAccount, [$orderSn], true);

            return response()->json([
                'status'    => 'ok',
                'order_sn'  => $orderSn,
                'code'      => $code,
                'refreshed' => true,
                'stats'     => $stats,
                'message'   => "Pesanan {$orderSn} berhasil disegarkan secara read-only.",
            ], 200);
        } catch (\Throwable $e) {
            Log::warning("ShopeeWebhookController refresh failed ({$orderSn}): " . $e->getMessage(), [
                'account_id' => $verifiedAccount->id,
                'code'       => $code,
            ]);

            return response()->json([
                'status'    => 'accepted',
                'order_sn'  => $orderSn,
                'code'      => $code,
                'refreshed' => false,
                'message'   => 'Webhook diterima; sinkronisasi tertunda karena kendala sementara.',
            ], 200);
        } finally {
            $lock->release();
        }
    }

    /**
     * @return Collection<int, ShopeeAccount>
     */
    private function resolveCandidateAccounts(string $shopId, int $code): Collection
    {
        try {
            if (! Schema::hasTable('shopee_accounts')) {
                return collect();
            }

            $baseQuery = ShopeeAccount::query()->whereNotNull('partner_key');

            if ($shopId !== '' && $shopId !== '0') {
                $matched = (clone $baseQuery)->where('shop_id', $shopId)->get();
                if ($matched->isNotEmpty() || $code !== 0) {
                    return $matched;
                }
            } elseif ($code !== 0) {
                return collect();
            }

            $active = (clone $baseQuery)->where('status', 'active')->get();

            return $active->isNotEmpty() ? $active : $baseQuery->get();
        } catch (\Throwable $e) {
            Log::warning('ShopeeWebhookController resolveCandidateAccounts notice: ' . $e->getMessage());

            return collect();
        }
    }

    /**
     * @return array<int, string>
     */
    private function buildCandidateUrls(Request $request): array
    {
        $urls = [];

        $configured = trim((string) config('services.shopee.webhook_url', ''));
        if ($configured !== '') {
            $urls[] = $configured;
        }

        $fullUrl = $request->fullUrl();
        $baseUrl = $request->url();

        foreach ([$fullUrl, $baseUrl] as $candidate) {
            if ($candidate !== '') {
                $urls[] = $candidate;
                if (str_starts_with($candidate, 'http://')) {
                    $urls[] = 'https://' . substr($candidate, 7);
                }
            }
        }

        return array_values(array_unique($urls));
    }

    /**
     * @param  Collection<int, ShopeeAccount>  $candidates
     * @param  array<int, string>  $candidateUrls
     */
    private function findVerifiedAccount(
        Collection $candidates,
        string $signature,
        string $rawBody,
        array $candidateUrls
    ): ?ShopeeAccount {
        $normalizedSig = strtolower(trim($signature));

        foreach ($candidates as $account) {
            try {
                $partnerKey = trim((string) ($account->partner_key ?? ''));
            } catch (\Throwable) {
                continue;
            }

            if ($partnerKey === '') {
                continue;
            }

            foreach ($candidateUrls as $url) {
                $expected = hash_hmac('sha256', $url . '|' . $rawBody, $partnerKey);
                if (hash_equals($expected, $normalizedSig)) {
                    return $account;
                }
            }
        }

        return null;
    }
}
