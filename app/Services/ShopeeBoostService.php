<?php

namespace App\Services;

use App\Models\ShopeeAccount;
use App\Models\ShopeeAutoBoostConfig;
use App\Models\ShopeeOrder;
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
            throw new RuntimeException(self::humanizeShopeeError($msg));
        }

        Log::info('Shopee get_boosted_list raw response: ', ['response' => $data['response'] ?? $data]);

        // Shopee Open API v2 mengembalikan array pada key item_list (atau item_id_list)
        $boostedItems = $data['response']['item_list']
            ?? $data['response']['item_id_list']
            ?? [];
        $activeItemIds = [];
        $cooldownMap   = [];

        foreach ($boostedItems as $item) {
            if (is_numeric($item)) {
                $itemId = (int) $item;
                $cooldown = 14400;
            } elseif (is_array($item)) {
                $itemId = (int) ($item['item_id'] ?? $item['id'] ?? 0);
                $cooldown = (int) ($item['cool_down_second'] ?? 0);
            } else {
                continue;
            }

            if ($itemId > 0) {
                $activeItemIds[] = $itemId;
                $cooldownMap[$itemId] = $cooldown;
            }
        }

        // Ambil data produk lokal dari database untuk menampilkan detail judul, harga, dan SKU
        $localProducts = [];
        $imageMap = [];
        if (! empty($activeItemIds)) {
            $localProducts = ShopeeProduct::where('shopee_account_id', $account->id)
                ->whereIn('item_id', $activeItemIds)
                ->get()
                ->keyBy('item_id');

            $imageMap = $this->resolveImagesForItems($account, $activeItemIds);
        }

        $slots = [];
        for ($i = 0; $i < 5; $i++) {
            if (isset($activeItemIds[$i])) {
                $itemId = $activeItemIds[$i];
                $cooldown = $cooldownMap[$itemId] ?? 0;
                $local = $localProducts->get($itemId);
                $imageUrl = $imageMap[$itemId] ?? null;

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
            $rawMsg = (string) ($data['message'] ?? $data['error'] ?? 'Gagal menaikkan produk di Shopee.');
            Log::warning('Shopee boost_item error: ' . $rawMsg, ['data' => $data]);
            throw new RuntimeException(self::humanizeShopeeError($rawMsg));
        }

        $failureList = $data['response']['failure_list'] ?? [];
        $failedIds = array_column($failureList, 'item_id');
        $successfulIds = array_values(array_diff($itemIds, $failedIds));

        $countSuccess = count($successfulIds);
        $countFailed = count($failureList);

        $msg = "{$countSuccess} produk berhasil dinaikkan ke urutan teratas Shopee selama 4 jam.";
        if ($countFailed > 0) {
            $reasons = implode(', ', array_map(fn ($f) => self::humanizeShopeeError($f['failed_reason'] ?? 'Masih cooldown'), $failureList));
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
     * Ambil konfigurasi dan antrean target Auto-Boost untuk akun Shopee.
     *
     * @return array{
     *     is_enabled: bool,
     *     target_item_ids: array<int, int>,
     *     target_items: array<int, array<string, mixed>>,
     *     last_run_at: ?string,
     *     last_run_status: ?string,
     *     last_run_message: ?string
     * }
     */
    public function getAutoBoostConfig(ShopeeAccount $account): array
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $config = ShopeeAutoBoostConfig::firstOrCreate(
            ['shopee_account_id' => $account->id],
            [
                'is_enabled'         => false,
                'target_item_ids'    => [],
                'last_boosted_index' => 0,
                'last_run_message'   => 'Auto-boost siap diaktifkan.',
            ]
        );

        $targetIds = array_values(array_filter(array_map('intval', (array) ($config->target_item_ids ?? []))));

        // Ambil data produk target (nama, foto, sku, harga, stok, terjual)
        $targetItems = [];
        if (! empty($targetIds)) {
            $imageMap = $this->resolveImagesForItems($account, $targetIds);
            $prods = ShopeeProduct::where('shopee_account_id', $account->id)
                ->whereIn('item_id', $targetIds)
                ->get()
                ->keyBy('item_id');

            foreach ($targetIds as $id) {
                $p = $prods->get($id);
                $targetItems[] = [
                    'item_id'   => $id,
                    'item_name' => $p?->item_name ?? "Produk Shopee #{$id}",
                    'sku'       => $p?->sku ?? '-',
                    'price'     => $p?->price ? (float) $p->price : null,
                    'stock'     => (int) ($p?->stock ?? 0),
                    'sales'     => (int) ($p?->sales ?? 0),
                    'image_url' => $imageMap[$id] ?? null,
                ];
            }
        }

        return [
            'is_enabled'       => (bool) $config->is_enabled,
            'target_item_ids'  => $targetIds,
            'target_items'     => $targetItems,
            'last_run_at'      => $config->last_run_at?->toIso8601String(),
            'last_run_status'  => $config->last_run_status,
            'last_run_message' => $config->last_run_message,
        ];
    }

    /**
     * Aktifkan / Nonaktifkan Auto-Boost.
     */
    public function toggleAutoBoost(ShopeeAccount $account, bool $enable): array
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $config = ShopeeAutoBoostConfig::firstOrCreate(
            ['shopee_account_id' => $account->id],
            ['target_item_ids' => []]
        );

        $config->update([
            'is_enabled'       => $enable,
            'last_run_message' => $enable ? 'Auto-boost diaktifkan. Sistem akan menjaga produk selalu aktif.' : 'Auto-boost dinonaktifkan.',
        ]);

        if ($enable) {
            $this->runAutoBoostCycle($account);
        }

        return $this->getAutoBoostConfig($account);
    }

    /**
     * Tambahkan 1 item ke antrean Auto-Boost.
     */
    public function addAutoBoostItem(ShopeeAccount $account, int $itemId): array
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $config = ShopeeAutoBoostConfig::firstOrCreate(
            ['shopee_account_id' => $account->id],
            ['target_item_ids' => []]
        );

        $current = array_values(array_filter(array_map('intval', (array) ($config->target_item_ids ?? []))));
        if (! in_array($itemId, $current, true)) {
            $current[] = $itemId;
            $config->update(['target_item_ids' => $current]);

            if ($config->is_enabled) {
                $this->runAutoBoostCycle($account);
            }
        }

        return $this->getAutoBoostConfig($account);
    }

    /**
     * Hapus 1 item dari antrean Auto-Boost.
     */
    public function removeAutoBoostItem(ShopeeAccount $account, int $itemId): array
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $config = ShopeeAutoBoostConfig::firstOrCreate(
            ['shopee_account_id' => $account->id],
            ['target_item_ids' => []]
        );

        $current = array_values(array_filter(array_map('intval', (array) ($config->target_item_ids ?? []))));
        $next = array_values(array_filter($current, fn ($id) => $id !== $itemId));
        $config->update(['target_item_ids' => $next]);

        return $this->getAutoBoostConfig($account);
    }

    /**
     * Simpan seluruh daftar target antrean Auto-Boost sekaligus.
     *
     * @param array<int, int> $targetIds
     */
    public function saveAutoBoostTargets(ShopeeAccount $account, array $targetIds): array
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $config = ShopeeAutoBoostConfig::firstOrCreate(
            ['shopee_account_id' => $account->id],
            ['target_item_ids' => []]
        );

        $cleanIds = array_values(array_unique(array_filter(array_map('intval', $targetIds))));
        $config->update(['target_item_ids' => $cleanIds]);

        if ($config->is_enabled && ! empty($cleanIds)) {
            $this->runAutoBoostCycle($account);
        }

        return $this->getAutoBoostConfig($account);
    }

    /**
     * Eksekusi 1 siklus pemeriksaan & auto-boost di Shopee.
     *
     * @return array{status: string, message: string, data?: mixed}
     */
    public function runAutoBoostCycle(ShopeeAccount $account): array
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $config = ShopeeAutoBoostConfig::where('shopee_account_id', $account->id)->first();
        if (! $config || ! $config->is_enabled) {
            return [
                'status'  => 'idle',
                'message' => 'Auto-boost tidak aktif.',
            ];
        }

        $targetIds = array_values(array_filter(array_map('intval', (array) ($config->target_item_ids ?? []))));
        if (empty($targetIds)) {
            $msg = 'Antrean target auto-boost kosong. Tambahkan produk ke jadwal terlebih dahulu.';
            $config->update([
                'last_run_at'      => now(),
                'last_run_status'  => 'empty',
                'last_run_message' => $msg,
            ]);
            return ['status' => 'empty', 'message' => $msg];
        }

        // Cek status 5 slot Shopee saat ini
        try {
            $status = $this->getBoostedStatus($account);
        } catch (\Throwable $e) {
            $errMsg = 'Gagal memeriksa slot Shopee: ' . $e->getMessage();
            $config->update([
                'last_run_at'      => now(),
                'last_run_status'  => 'error',
                'last_run_message' => $errMsg,
            ]);
            return ['status' => 'error', 'message' => $errMsg];
        }

        $availableCount = $status['available_count'] ?? 0;
        $boostedItems = $status['raw_items'] ?? [];
        $activeBoostedIds = [];
        foreach ($boostedItems as $it) {
            $id = is_numeric($it) ? (int) $it : (int) ($it['item_id'] ?? $it['id'] ?? 0);
            if ($id > 0) {
                $activeBoostedIds[] = $id;
            }
        }

        if ($availableCount <= 0) {
            $msg = 'Semua 5 slot Shopee saat ini sedang aktif terisi penuh. Menunggu giliran slot berikutnya.';
            $config->update([
                'last_run_at'      => now(),
                'last_run_status'  => 'full',
                'last_run_message' => $msg,
            ]);
            return ['status' => 'full', 'message' => $msg];
        }

        // Filter produk target yang belum sedang aktif dinaikkan
        $candidates = array_values(array_diff($targetIds, $activeBoostedIds));
        if (empty($candidates)) {
            $msg = 'Semua produk target yang dipilih saat ini sudah sedang aktif dinaikkan di Shopee.';
            $config->update([
                'last_run_at'      => now(),
                'last_run_status'  => 'all_boosted',
                'last_run_message' => $msg,
            ]);
            return ['status' => 'all_boosted', 'message' => $msg];
        }

        // Ambil sejumlah slot yang kosong (maksimal sejumlah slot yang tersedia)
        $itemsToBoost = array_slice($candidates, 0, $availableCount);

        try {
            $result = $this->boostProducts($account, $itemsToBoost);
            $countSuccess = count($result['boosted_ids'] ?? []);
            $msg = "Auto-Boost berhasil menaikkan {$countSuccess} produk ke Shopee: " . implode(', ', $itemsToBoost);

            $config->update([
                'last_run_at'      => now(),
                'last_run_status'  => 'success',
                'last_run_message' => $msg,
            ]);

            return [
                'status'  => 'success',
                'message' => $msg,
                'data'    => $result,
            ];
        } catch (\Throwable $e) {
            $errMsg = 'Auto-Boost kendala saat menaikkan: ' . $e->getMessage();
            $config->update([
                'last_run_at'      => now(),
                'last_run_status'  => 'error',
                'last_run_message' => $errMsg,
            ]);
            return ['status' => 'error', 'message' => $errMsg];
        }
    }

    /**
     * Cari produk Shopee dari database lokal untuk modal pemilihan produk.
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
            ->limit($limit * 3)
            ->get();

        // Unique by item_id (agar tidak duplikat variasi model)
        $unique = [];
        $seen = [];
        $itemIdsToResolve = [];

        foreach ($products as $p) {
            if (isset($seen[$p->item_id])) {
                continue;
            }
            $seen[$p->item_id] = true;
            $itemIdsToResolve[] = (int) $p->item_id;

            $unique[] = [
                'item_id'   => $p->item_id,
                'item_name' => $p->item_name,
                'sku'       => $p->sku,
                'price'     => $p->price ? (float) $p->price : null,
                'stock'     => (int) $p->stock,
                'sales'     => (int) ($p->sales ?? 0),
                'image_url' => null,
            ];

            if (count($unique) >= $limit) {
                break;
            }
        }

        // Resolusi foto produk Shopee
        $imageMap = $this->resolveImagesForItems($account, $itemIdsToResolve);
        foreach ($unique as &$u) {
            $u['image_url'] = $imageMap[$u['item_id']] ?? null;
        }
        unset($u);

        return $unique;
    }

    /**
     * Ambil katalog daftar produk toko Shopee untuk tabel pemantauan dan aksi di halaman utama.
     *
     * @param array{keyword?: string, filter?: string, page?: int, per_page?: int} $params
     * @return array{
     *     items: array<int, array<string, mixed>>,
     *     total: int,
     *     per_page: int,
     *     current_page: int,
     *     last_page: int,
     *     counts: array{all: int, boosted: int, available: int}
     * }
     */
    public function getProductCatalog(ShopeeAccount $account, array $params = []): array
    {
        $keyword  = trim((string) ($params['keyword'] ?? ''));
        $filter   = (string) ($params['filter'] ?? 'all'); // 'all', 'boosted', 'available'
        $page     = max(1, (int) ($params['page'] ?? 1));
        $perPage  = min(50, max(5, (int) ($params['per_page'] ?? 15)));

        // 1. Ambil data boosted item saat ini dari Shopee API (atau fallback cache singkat)
        $boostedItems = [];
        $cooldownMap = [];
        try {
            $boostStatus = $this->getBoostedStatus($account);
            $boostedItems = $boostStatus['raw_items'] ?? [];
            foreach ($boostedItems as $it) {
                if (is_numeric($it)) {
                    $id = (int) $it;
                    $cooldown = 14400;
                } else {
                    $id = (int) ($it['item_id'] ?? $it['id'] ?? 0);
                    $cooldown = (int) ($it['cool_down_second'] ?? 0);
                }
                if ($id > 0) {
                    $cooldownMap[$id] = $cooldown;
                }
            }
        } catch (\Throwable $e) {
            Log::info('ShopeeBoostService getProductCatalog boosted fetch: ' . $e->getMessage());
        }

        $boostedItemIds = array_keys($cooldownMap);

        // 2. Query distinct item_id dari shopee_products
        $distinctQuery = ShopeeProduct::where('shopee_account_id', $account->id)
            ->where('item_status', 'NORMAL');

        $totalAll = (clone $distinctQuery)->distinct('item_id')->count('item_id');
        $totalBoosted = count($boostedItemIds);
        $totalAvailable = max(0, $totalAll - $totalBoosted);

        if ($filter === 'boosted') {
            if (empty($boostedItemIds)) {
                return [
                    'items'        => [],
                    'total'        => 0,
                    'per_page'     => $perPage,
                    'current_page' => 1,
                    'last_page'    => 1,
                    'counts'       => [
                        'all'       => $totalAll,
                        'boosted'   => $totalBoosted,
                        'available' => $totalAvailable,
                    ],
                ];
            }
            $distinctQuery->whereIn('item_id', $boostedItemIds);
        } elseif ($filter === 'available') {
            if (! empty($boostedItemIds)) {
                $distinctQuery->whereNotIn('item_id', $boostedItemIds);
            }
        }

        if ($keyword !== '') {
            $distinctQuery->where(function ($q) use ($keyword) {
                $q->where('item_name', 'like', "%{$keyword}%")
                  ->orWhere('sku', 'like', "%{$keyword}%")
                  ->orWhere('item_id', 'like', "%{$keyword}%");
            });
        }

        // Group by item_id
        $distinctQuery->selectRaw('item_id, MAX(id) as max_id, MAX(item_name) as item_name, MAX(sku) as sku, MAX(price) as price, SUM(stock) as total_stock, MAX(sales) as total_sales')
            ->groupBy('item_id');

        // Order: jika ada yang boosted ditaruh di atas, lalu sales tertinggi
        if (! empty($boostedItemIds)) {
            $idsListStr = implode(',', $boostedItemIds);
            $distinctQuery->orderByRaw("FIELD(item_id, {$idsListStr}) DESC");
        }
        $distinctQuery->orderByDesc('total_sales')->orderBy('item_name');

        $paginator = $distinctQuery->paginate($perPage, ['*'], 'page', $page);

        $pageItemIds = [];
        $rows = [];
        foreach ($paginator->items() as $item) {
            $itemId = (int) $item->item_id;
            $pageItemIds[] = $itemId;
            $isBoosted = isset($cooldownMap[$itemId]);
            $cooldown = $cooldownMap[$itemId] ?? 0;
            $endsAt = $isBoosted ? Carbon::now('Asia/Jakarta')->addSeconds($cooldown)->toIso8601String() : null;

            $rows[] = [
                'item_id'          => $itemId,
                'item_name'        => (string) ($item->item_name ?? "Produk Shopee #{$itemId}"),
                'sku'              => (string) ($item->sku ?? '-'),
                'price'            => $item->price ? (float) $item->price : null,
                'stock'            => (int) ($item->total_stock ?? 0),
                'sales'            => (int) ($item->total_sales ?? 0),
                'is_boosted'       => $isBoosted,
                'cool_down_second' => $cooldown,
                'ends_at'          => $endsAt,
                'image_url'        => null,
            ];
        }

        // Resolusi foto produk Shopee untuk halaman yang aktif
        $imageMap = $this->resolveImagesForItems($account, $pageItemIds);
        foreach ($rows as &$r) {
            $r['image_url'] = $imageMap[$r['item_id']] ?? null;
        }
        unset($r);

        return [
            'items'        => $rows,
            'total'        => $paginator->total(),
            'per_page'     => $paginator->perPage(),
            'current_page' => $paginator->currentPage(),
            'last_page'    => $paginator->lastPage(),
            'counts'       => [
                'all'       => $totalAll,
                'boosted'   => $totalBoosted,
                'available' => $totalAvailable,
            ],
        ];
    }

    /**
     * Resolusi URL foto produk Shopee secara otomatis & bertingkat:
     * 1. Cek dari kolom raw_data produk lokal (cached_image_url / image.image_url_list)
     * 2. Cek dari items_json riwayat shopee_orders lokal
     * 3. Jika belum ditemukan, panggil API Shopee get_item_base_info & simpan permanen ke raw_data
     *
     * @param array<int, int> $itemIds
     * @return array<int, string> [item_id => image_url]
     */
    public function resolveImagesForItems(ShopeeAccount $account, array $itemIds): array
    {
        $itemIds = array_values(array_unique(array_filter(array_map('intval', $itemIds))));
        if (empty($itemIds)) {
            return [];
        }

        $imageMap = [];
        $missingIds = [];

        // 1. Cek dari shopee_products local database
        $prods = ShopeeProduct::where('shopee_account_id', $account->id)
            ->whereIn('item_id', $itemIds)
            ->get();

        foreach ($prods as $p) {
            $itemId = (int) $p->item_id;
            if (isset($imageMap[$itemId])) {
                continue;
            }
            $url = self::extractImageUrlFromRawData($p->raw_data);
            if (! empty($url)) {
                $imageMap[$itemId] = $url;
            }
        }

        foreach ($itemIds as $id) {
            if (! isset($imageMap[$id])) {
                $missingIds[] = $id;
            }
        }

        // 2. Cek dari riwayat shopee_orders lokal
        if (! empty($missingIds)) {
            $orders = ShopeeOrder::where('shopee_account_id', $account->id)
                ->where(function ($q) use ($missingIds) {
                    foreach (array_slice($missingIds, 0, 10) as $mid) {
                        $q->orWhere('items_json', 'like', "%\"item_id\":{$mid}%");
                    }
                })
                ->limit(25)
                ->get();

            foreach ($orders as $order) {
                $items = is_array($order->items_json) ? $order->items_json : [];
                foreach ($items as $it) {
                    $itId = (int) ($it['item_id'] ?? 0);
                    $img  = (string) ($it['image_url'] ?? '');
                    if ($itId > 0 && ! empty($img) && in_array($itId, $missingIds, true) && ! isset($imageMap[$itId])) {
                        $imageMap[$itId] = $img;
                    }
                }
            }

            $missingIds = array_values(array_diff($missingIds, array_keys($imageMap)));
        }

        // 3. Jika masih ada yang belum memiliki URL foto dan token Shopee tersedia, ambil dari API get_item_base_info
        if (! empty($missingIds) && ! empty($account->access_token)) {
            try {
                $path        = '/api/v2/product/get_item_base_info';
                $timestamp   = time();
                $accessToken = (string) ($account->access_token ?? '');
                $shopId      = (int) $account->shop_id;
                $partnerId   = (int) $account->partner_id;
                $partnerKey  = (string) $account->partner_key;

                $targetBatch = array_slice($missingIds, 0, 50);
                $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
                $sign    = hash_hmac('sha256', $baseStr, $partnerKey);

                $queryParams = [
                    'partner_id'   => $partnerId,
                    'timestamp'    => $timestamp,
                    'sign'         => $sign,
                    'access_token' => $accessToken,
                    'shop_id'      => $shopId,
                    'item_id_list' => implode(',', $targetBatch),
                ];

                $url = $this->host . $path . '?' . http_build_query($queryParams);
                $response = Http::timeout(15)->get($url);
                $data = $response->json();

                $baseItems = $data['response']['item_list'] ?? [];
                foreach ($baseItems as $baseItem) {
                    $bId = (int) ($baseItem['item_id'] ?? 0);
                    $img = self::extractImageUrlFromRawData($baseItem);
                    if ($bId > 0 && ! empty($img)) {
                        $imageMap[$bId] = $img;

                        // Simpan permanen ke raw_data produk lokal agar request selanjutnya cepat
                        $pRows = ShopeeProduct::where('shopee_account_id', $account->id)->where('item_id', $bId)->get();
                        foreach ($pRows as $pRow) {
                            $raw = is_array($pRow->raw_data) ? $pRow->raw_data : [];
                            $raw['cached_image_url'] = $img;
                            $raw['image'] = $baseItem['image'] ?? null;
                            $pRow->update(['raw_data' => $raw]);
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::info('ShopeeBoostService get_item_base_info image resolve notice: ' . $e->getMessage());
            }
        }

        return $imageMap;
    }

    /**
     * Ekstrak URL foto dari berbagai kemungkinan struktur data Shopee.
     */
    public static function extractImageUrlFromRawData(mixed $raw): ?string
    {
        if (! is_array($raw)) {
            return null;
        }

        if (! empty($raw['cached_image_url'])) {
            return (string) $raw['cached_image_url'];
        }

        if (! empty($raw['image']['image_url_list'][0])) {
            return (string) $raw['image']['image_url_list'][0];
        }

        if (! empty($raw['image']['image_id_list'][0])) {
            return 'https://down-id.img.susercontent.com/file/' . $raw['image']['image_id_list'][0];
        }

        if (! empty($raw['image_info']['image_url'])) {
            return (string) $raw['image_info']['image_url'];
        }

        if (! empty($raw['item_image'])) {
            return (string) $raw['item_image'];
        }

        if (! empty($raw['image_url'])) {
            return (string) $raw['image_url'];
        }

        return null;
    }

    /**
     * Terjemahkan kode / pesan error mentah dari Shopee Open API menjadi penjelasan bahasa Indonesia yang ramah & jelas.
     */
    public static function humanizeShopeeError(string $raw): string
    {
        $lower = strtolower($raw);

        if (str_contains($lower, "reached shop's bump slot limit") || str_contains($lower, 'bump slot limit') || str_contains($lower, 'slot limit')) {
            return 'Batas maksimal 5 slot Naikkan Produk Shopee saat ini sedang penuh. Setiap produk yang dinaikkan aktif selama 4 jam. Harap tunggu hingga salah satu slot selesai sebelum menaikkan produk berikutnya.';
        }

        if (str_contains($lower, 'cool down') || str_contains($lower, 'cooldown')) {
            return 'Produk ini masih dalam masa jeda (cooldown) di Shopee. Harap tunggu hingga masa jeda berakhir sebelum menaikkannya kembali.';
        }

        if (str_contains($lower, 'frequency') || str_contains($lower, 'too frequent')) {
            return 'Permintaan terlalu sering ke Shopee. Harap tunggu beberapa saat sebelum mencoba kembali.';
        }

        if (str_contains($lower, 'item not found') || str_contains($lower, 'invalid item')) {
            return 'Produk tidak ditemukan atau sudah tidak aktif di toko Shopee.';
        }

        return $raw;
    }
}
