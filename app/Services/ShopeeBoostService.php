<?php

namespace App\Services;

use App\Models\ShopeeAccount;
use App\Models\ShopeeProduct;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class ShopeeBoostService
{
    private string $host;

    public function __construct()
    {
        $this->host = config('services.shopee.host', 'https://partner.shopeemobile.com');
    }

    /**
     * Ambil 5 slot status produk yang sedang dinaikkan (get_boosted_list).
     *
     * @return array{
     *     slots: array<int, array<string, mixed>>,
     *     active_count: int,
     *     available_count: int,
     *     raw_items: array<int, mixed>
     * }
     */
    public function getBoostedStatus(ShopeeAccount $account): array
    {
        $path        = '/api/v2/product/get_boosted_list';
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
        $response = Http::timeout(20)->get($url);
        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $msg = $data['message'] ?? $data['error'] ?? 'Gagal mengambil status produk dinaikkan dari Shopee.';
            Log::warning('Shopee get_boosted_list error: ' . $msg, ['data' => $data]);
            throw new RuntimeException($msg);
        }

        $boostedItems = $data['response']['item_id_list'] ?? [];
        $activeItemIds = [];
        $cooldownMap   = [];

        foreach ($boostedItems as $item) {
            $itemId = (int) ($item['item_id'] ?? 0);
            $cooldown = (int) ($item['cool_down_second'] ?? 0);
            if ($itemId > 0) {
                $activeItemIds[] = $itemId;
                $cooldownMap[$itemId] = $cooldown;
            }
        }

        // Ambil data produk lokal dari database untuk menampilkan foto, judul, harga, dan SKU
        $localProducts = [];
        if (! empty($activeItemIds)) {
            $localProducts = ShopeeProduct::where('shopee_account_id', $account->id)
                ->whereIn('item_id', $activeItemIds)
                ->get()
                ->keyBy('item_id');
        }

        $slots = [];
        for ($i = 0; $i < 5; $i++) {
            if (isset($activeItemIds[$i])) {
                $itemId = $activeItemIds[$i];
                $cooldown = $cooldownMap[$itemId] ?? 0;
                $local = $localProducts->get($itemId);

                $imageUrl = null;
                if ($local && ! empty($local->raw_data['image']['image_url_list'][0])) {
                    $imageUrl = $local->raw_data['image']['image_url_list'][0];
                }

                $endsAt = Carbon::now('Asia/Jakarta')->addSeconds($cooldown)->toIso8601String();

                $slots[] = [
                    'slot_number'      => $i + 1,
                    'status'           => 'active',
                    'item_id'          => $itemId,
                    'item_name'        => $local?->item_name ?? "Produk Shopee #{$itemId}",
                    'sku'              => $local?->sku,
                    'price'            => $local?->price ? (float) $local->price : null,
                    'image_url'        => $imageUrl,
                    'cool_down_second' => $cooldown,
                    'ends_at'          => $endsAt,
                ];
            } else {
                $slots[] = [
                    'slot_number' => $i + 1,
                    'status'      => 'empty',
                    'item_id'     => null,
                ];
            }
        }

        $activeCount = count($activeItemIds);

        return [
            'slots'           => $slots,
            'active_count'    => $activeCount,
            'available_count' => max(0, 5 - $activeCount),
            'raw_items'       => $boostedItems,
        ];
    }

    /**
     * Naikkan 1 atau beberapa produk ke urutan teratas (boost_item).
     *
     * @param  array<int, int>  $itemIds
     * @return array{success: bool, boosted_ids: array<int, int>, failure_list: array<int, mixed>, message: string}
     */
    public function boostProducts(ShopeeAccount $account, array $itemIds): array
    {
        $itemIds = array_values(array_unique(array_filter(array_map('intval', $itemIds))));
        if (empty($itemIds)) {
            throw new RuntimeException('Pilih setidaknya 1 produk untuk dinaikkan.');
        }

        if (count($itemIds) > 5) {
            throw new RuntimeException('Shopee membatasi maksimal 5 produk sekaligus yang dapat dinaikkan.');
        }

        $path        = '/api/v2/product/boost_item';
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
        $response = Http::timeout(25)->post($url, [
            'item_id_list' => $itemIds,
        ]);

        $data = $response->json();

        if ($response->failed() || ! empty($data['error'])) {
            $msg = $data['message'] ?? $data['error'] ?? 'Gagal menaikkan produk di Shopee.';
            Log::warning('Shopee boost_item error: ' . $msg, ['data' => $data]);
            throw new RuntimeException($msg);
        }

        $failureList = $data['response']['failure_list'] ?? [];
        $failedIds = array_column($failureList, 'item_id');
        $successfulIds = array_values(array_diff($itemIds, $failedIds));

        $countSuccess = count($successfulIds);
        $countFailed = count($failureList);

        $msg = "{$countSuccess} produk berhasil dinaikkan ke urutan teratas Shopee selama 4 jam.";
        if ($countFailed > 0) {
            $reasons = implode(', ', array_map(fn ($f) => ($f['failed_reason'] ?? 'Masih cooldown'), $failureList));
            $msg .= " ({$countFailed} produk dilewati: {$reasons}).";
        }

        return [
            'success'       => $countSuccess > 0,
            'boosted_ids'   => $successfulIds,
            'failure_list'  => $failureList,
            'message'       => $msg,
        ];
    }

    /**
     * Cari produk Shopee dari database lokal untuk dipilih admin.
     *
     * @param  array<int, int>  $excludeItemIds
     * @return array<int, array<string, mixed>>
     */
    public function searchProducts(ShopeeAccount $account, string $keyword = '', array $excludeItemIds = [], int $limit = 30): array
    {
        $query = ShopeeProduct::where('shopee_account_id', $account->id)
            ->where('item_status', 'NORMAL');

        if (! empty($excludeItemIds)) {
            $query->whereNotIn('item_id', $excludeItemIds);
        }

        $term = trim($keyword);
        if ($term !== '') {
            $query->where(function ($q) use ($term) {
                $q->where('item_name', 'like', "%{$term}%")
                  ->orWhere('sku', 'like', "%{$term}%")
                  ->orWhere('item_id', 'like', "%{$term}%");
            });
        }

        $products = $query->orderByDesc('sales')
            ->orderBy('item_name')
            ->limit($limit)
            ->get();

        // Unique by item_id (agar tidak duplikat variasi model)
        $unique = [];
        $seen = [];
        foreach ($products as $p) {
            if (isset($seen[$p->item_id])) {
                continue;
            }
            $seen[$p->item_id] = true;

            $imageUrl = null;
            if (! empty($p->raw_data['image']['image_url_list'][0])) {
                $imageUrl = $p->raw_data['image']['image_url_list'][0];
            }

            $unique[] = [
                'item_id'   => $p->item_id,
                'item_name' => $p->item_name,
                'sku'       => $p->sku,
                'price'     => $p->price ? (float) $p->price : null,
                'stock'     => (int) $p->stock,
                'sales'     => (int) ($p->sales ?? 0),
                'image_url' => $imageUrl,
            ];
        }

        return $unique;
    }
}
