<?php

namespace App\Http\Controllers;

use App\Models\MasterStock;
use App\Models\TiktokAccount;
use App\Models\TiktokProduct;
use App\Models\TiktokStockZeroBatch;
use App\Models\TiktokStockZeroItem;
use App\Models\User;
use App\Services\ProductStockMatcher;
use App\Services\TiktokSyncService;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TiktokProductController extends Controller
{
    public function __construct(private readonly TiktokSyncService $syncService) {}

    /**
     * Clear cached reconciliation, summary stats, and file-based notification queue.
     */
    public static function clearAuditCache(?int $accountId = null): void
    {
        try {
            $store = Cache::store('file');
            $store->forget('tiktok_stock_alert_queue');
            $store->forget('tiktok_products_light_cols_v1');
            $store->forget('master_stock_wh_stats_v2');
            $store->forget('master_stock_wh_summary_v3');
            $store->forget('tiktok_zero_summary_' . ($accountId ?? 'all'));
            $store->forget('tiktok_zero_summary_all');
            if ($accountId) {
                $store->forget("tiktok_summary_stats_{$accountId}");
                $store->forget("tiktok_summary_stats_v3_{$accountId}");
            }
            $store->forget('tiktok_summary_stats_all');
            $store->forget('tiktok_summary_stats_v3_all');

            // Naikkan versi cache untuk menginvalidasi seluruh kalkulasi hash rekonsiliasi seketika
            $currentVer = (int) $store->get('tiktok_audit_cache_ver', 1);
            $store->put('tiktok_audit_cache_ver', $currentVer + 1, 86400 * 30);
        } catch (\Throwable $e) {
            // Safe fallback if file cache is unavailable
        }
    }

    /**
     * Ambil daftar kolom tiktok_products tanpa raw_data agar query ringan dan tidak menarik JSON besar.
     *
     * @return array<int, string>
     */
    private function getLightProductColumns(): array
    {
        if (! app()->runningUnitTests()) {
            try {
                $cached = Cache::store('file')->get('tiktok_products_light_cols_v1');
                if (is_array($cached) && ! empty($cached)) {
                    return $cached;
                }
            } catch (\Throwable) {
                // Lanjutkan baca skema langsung
            }
        }

        try {
            $cols = array_values(array_diff(\Illuminate\Support\Facades\Schema::getColumnListing('tiktok_products'), ['raw_data']));
            if (! empty($cols)) {
                if (! app()->runningUnitTests()) {
                    try {
                        Cache::store('file')->put('tiktok_products_light_cols_v1', $cols, 3600);
                    } catch (\Throwable) {
                        // Abaikan error tulis file cache
                    }
                }

                return $cols;
            }
        } catch (\Throwable) {
            // Fallback aman bila schema listing gagal
        }

        return ['*'];
    }

    /**
     * Bangun struktur notifikasi topbar untuk peringatan SKU kritis & selisih stok TikTok.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, critical: int}
     */
    public static function buildStockWorkQueue(int $criticalOosCount, int $discrepancyCount, int $campaignUnlockedCount = 0): array
    {
        $items = [];

        if ($criticalOosCount > 0 || $campaignUnlockedCount > 0) {
            $desc = number_format($criticalOosCount, 0, ',', '.') . ' SKU stok gudang 0 pcs tetapi masih dijual di TikTok.';
            if ($campaignUnlockedCount > 0) {
                $desc .= ' Termasuk ' . number_format($campaignUnlockedCount, 0, ',', '.') . ' SKU promo terbuka.';
            }

            $items[] = [
                'key'         => 'tiktok_critical_oos',
                'type'        => 'stock',
                'title'       => 'SKU Habis di Gudang (TikTok)',
                'description' => $desc,
                'count'       => $criticalOosCount,
                'amount'      => null,
                'href'        => '/tiktok-products?stock_status=oos_critical',
                'severity'    => 'critical',
            ];
        }

        if ($discrepancyCount > 0) {
            $items[] = [
                'key'         => 'tiktok_stock_discrepancy',
                'type'        => 'stock',
                'title'       => 'SKU Selisih Stok (Gudang ≠ TikTok)',
                'description' => number_format($discrepancyCount, 0, ',', '.') . ' SKU memiliki selisih stok antara TikTok dan Gudang A + G.',
                'count'       => $discrepancyCount,
                'amount'      => null,
                'href'        => '/tiktok-products?stock_status=discrepancy',
                'severity'    => 'warning',
            ];
        }

        return [
            'items'    => $items,
            'total'    => count($items),
            'critical' => ($criticalOosCount > 0 || $campaignUnlockedCount > 0) ? 1 : 0,
        ];
    }

    /**
     * Ambil ringkasan notifikasi stok TikTok untuk topbar (khusus Super Admin).
     * Menggunakan file cache agar aman tanpa ketergantungan tabel database cache.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, critical: int}
     */
    public function getStockAlertWorkQueue(bool $allowHeavyScan = false): array
    {
        $empty = ['items' => [], 'total' => 0, 'critical' => 0];

        try {
            $cached = Cache::store('file')->get('tiktok_stock_alert_queue');
            if (is_array($cached) && isset($cached['items'])) {
                return $cached;
            }
        } catch (\Throwable $e) {
            // Lanjutkan evaluasi langsung bila file cache gagal dibaca
        }

        // Cegah scan berat synchronous yang memblokir request pengguna jika cache dingin / dari middleware
        if (! $allowHeavyScan) {
            return $empty;
        }

        try {
            $tablesReady = false;
            if (! app()->runningUnitTests()) {
                $tablesReady = Cache::store('file')->get('tiktok_workqueue_tables_ready_v1') === true;
            }

            if (! $tablesReady) {
                $tablesReady = \Illuminate\Support\Facades\Schema::hasTable('master_stocks')
                    && \Illuminate\Support\Facades\Schema::hasTable('tiktok_products')
                    && \Illuminate\Support\Facades\Schema::hasTable('tiktok_accounts');

                if (! $tablesReady) {
                    return $empty;
                }

                if (! app()->runningUnitTests()) {
                    try {
                        Cache::store('file')->put('tiktok_workqueue_tables_ready_v1', true, 3600);
                    } catch (\Throwable) {
                        // Abaikan error tulis file cache
                    }
                }
            }

            $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();
            if (! $account) {
                return $empty;
            }

            $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs', 'raw_qty', 'unit')->get();
            if ($masterStocks->isEmpty()) {
                return $empty;
            }

            $maps     = ProductStockMatcher::buildMasterStockMaps($masterStocks);
            $allProds = TiktokProduct::select($this->getLightProductColumns())
                ->where('tiktok_account_id', $account->id)
                ->get();

            $variantCounts = ProductStockMatcher::countDistinctSizesPerItem($allProds);

            $criticalOosCount      = 0;
            $campaignUnlockedCount = 0;
            $discrepancyCount      = 0;

            foreach ($allProds as $p) {
                $info = ProductStockMatcher::resolveStockInfo(
                    $p,
                    $maps,
                    'ALL',
                    $variantCounts[$p->item_id] ?? 6
                );

                if ($info['is_critical_oos']) {
                    $criticalOosCount++;
                } elseif ($info['is_campaign_unlocked']) {
                    $campaignUnlockedCount++;
                }

                if (! empty($info['matched_code']) && $info['diff'] !== 0) {
                    $discrepancyCount++;
                }
            }

            $queue = self::buildStockWorkQueue($criticalOosCount, $discrepancyCount, $campaignUnlockedCount);

            try {
                Cache::store('file')->put('tiktok_stock_alert_queue', $queue, 900);
            } catch (\Throwable $e) {
                // Abaikan jika tidak bisa menulis file cache
            }

            return $queue;
        } catch (\Throwable $e) {
            return $empty;
        }
    }

    /**
     * Display page list of TikTok Products, SKU, and Stock.
     */
    public function index(Request $request): \Inertia\Response
    {
        try {
            $schemaVerified = ! app()->runningUnitTests()
                && Cache::store('file')->get('tiktok_product_schema_verified_v1') === true;

            if (! $schemaVerified) {
                $this->syncService->ensureProductSchema();
                if (! app()->runningUnitTests()) {
                    Cache::store('file')->put('tiktok_product_schema_verified_v1', true, 86400);
                }
            }
        } catch (\Throwable $e) {
            // Abaikan jika tidak punya akses alter table di database
        }

        $search      = trim((string) $request->input('search', ''));
        $stockStatus = (string) $request->input('stock_status', 'all');
        $sort        = (string) $request->input('sort', 'stock_desc');
        $warehouse   = strtoupper(trim((string) $request->input('warehouse', 'ALL')));
        if (! in_array($warehouse, ['ALL', 'G', 'A'], true)) {
            $warehouse = 'ALL';
        }
        $todayStr    = now('Asia/Jakarta')->toDateString();

        $dateFrom = $request->has('date_from') ? (string) $request->input('date_from') : $todayStr;
        $dateTo   = $request->has('date_to') ? (string) $request->input('date_to') : $todayStr;

        $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();

        if (! \Illuminate\Support\Facades\Schema::hasTable('tiktok_products')) {
            return Inertia::render('Tiktok/Products', [
                'products' => [
                    'data'         => [],
                    'current_page' => 1,
                    'last_page'    => 1,
                    'per_page'     => 50,
                    'total'        => 0,
                    'links'        => [],
                ],
                'filters'  => [
                    'search'       => $search,
                    'stock_status' => $stockStatus,
                    'sort'         => $sort,
                    'date_from'    => $dateFrom,
                    'date_to'      => $dateTo,
                ],
                'summary'  => [
                    'total_skus'        => 0,
                    'total_stock'       => 0,
                    'in_stock_skus'     => 0,
                    'out_of_stock_skus' => 0,
                    'last_synced_at'    => null,
                ],
                'account'  => $account ? [
                    'id'           => $account->id,
                    'account_name' => $account->account_name,
                    'shop_id'      => $account->shop_id,
                    'is_connected' => $account->isConnected() && ! empty($account->access_token),
                ] : null,
            ]);
        }

        // 1. Ringkasan Master Stok Gudang
        $hasMasterTable = \Illuminate\Support\Facades\Schema::hasTable('master_stocks');
        $masterStockSummary = [
            'total_g_items'    => 0,
            'total_g_pcs'      => 0,
            'last_imported_g'  => null,
            'total_a_items'    => 0,
            'total_a_pcs'      => 0,
            'last_imported_a'  => null,
            'has_master_stock' => false,
        ];

        if ($hasMasterTable) {
            try {
                $masterStockSummary = Cache::store('file')->remember('master_stock_wh_summary_v3', 300, function () {
                    $whStats = MasterStock::selectRaw('warehouse, COUNT(*) as total_items, COALESCE(SUM(qty_pcs), 0) as total_pcs, MAX(last_imported_at) as last_imported')
                        ->groupBy('warehouse')
                        ->get()
                        ->keyBy('warehouse');

                    $g = $whStats->get('G');
                    $a = $whStats->get('A');

                    return [
                        'total_g_items'    => (int) ($g?->total_items ?? 0),
                        'total_g_pcs'      => (int) ($g?->total_pcs ?? 0),
                        'last_imported_g'  => $g?->last_imported,
                        'total_a_items'    => (int) ($a?->total_items ?? 0),
                        'total_a_pcs'      => (int) ($a?->total_pcs ?? 0),
                        'last_imported_a'  => $a?->last_imported,
                        'has_master_stock' => ($whStats->count() > 0),
                    ];
                });
            } catch (\Throwable $e) {
                // Fallback
            }
        }

        // 2. Evaluasi Rekonsiliasi Master Stok (Instan di memori via Cache)
        $criticalOosIds      = [];
        $campaignLockedIds   = [];
        $campaignUnlockedIds = [];
        $gudangReadyIds      = [];
        $discrepancyIds      = [];
        $matchedIds          = [];
        $stockInfoById       = [];

        if ($masterStockSummary['has_master_stock'] && $account) {
            $cacheVer     = (int) Cache::store('file')->get('tiktok_audit_cache_ver', 1);
            $lastImportG  = (string) ($masterStockSummary['last_imported_g'] ?? '');
            $lastImportA  = (string) ($masterStockSummary['last_imported_a'] ?? '');
            $verHash      = md5("{$account->id}_{$warehouse}_{$lastImportG}_{$lastImportA}_{$cacheVer}");
            $evalCacheKey = "tiktok_stock_audit_eval_v5_{$verHash}";

            $evalData = Cache::store('file')->remember($evalCacheKey, 300, function () use ($account, $warehouse) {
                $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs', 'raw_qty', 'unit')->get();
                if ($masterStocks->isEmpty()) {
                    return null;
                }

                $maps = ProductStockMatcher::buildMasterStockMaps($masterStocks);

                $allProds = TiktokProduct::select($this->getLightProductColumns())
                    ->where('tiktok_account_id', $account->id)
                    ->get();

                $variantCounts = ProductStockMatcher::countDistinctSizesPerItem($allProds);

                $critIds      = [];
                $campLocked   = [];
                $campUnlocked = [];
                $gReady       = [];
                $discrep      = [];
                $matched      = [];
                $infoById     = [];

                foreach ($allProds as $p) {
                    $info = ProductStockMatcher::resolveStockInfo(
                        $p,
                        $maps,
                        $warehouse,
                        $variantCounts[$p->item_id] ?? 6
                    );

                    if ($info['is_critical_oos']) {
                        $critIds[] = $p->id;
                    } elseif ($info['is_campaign_unlocked']) {
                        $campUnlocked[] = $p->id;
                    } elseif ($info['is_campaign_locked']) {
                        $campLocked[] = $p->id;
                    }

                    if ($info['warehouse_stock'] > 0 && $p->stock <= 0) {
                        $gReady[] = $p->id;
                    }

                    if (! empty($info['matched_code'])) {
                        if ($info['diff'] !== 0) {
                            $discrep[] = $p->id;
                        } else {
                            $matched[] = $p->id;
                        }
                    }

                    $infoById[$p->id] = $info;
                }

                return [
                    'criticalOosIds'      => $critIds,
                    'campaignLockedIds'   => $campLocked,
                    'campaignUnlockedIds' => $campUnlocked,
                    'gudangReadyIds'      => $gReady,
                    'discrepancyIds'      => $discrep,
                    'matchedIds'          => $matched,
                    'stockInfoById'       => $infoById,
                ];
            });

            if (is_array($evalData)) {
                $criticalOosIds      = $evalData['criticalOosIds'] ?? [];
                $campaignLockedIds   = $evalData['campaignLockedIds'] ?? [];
                $campaignUnlockedIds = $evalData['campaignUnlockedIds'] ?? [];
                $gudangReadyIds      = $evalData['gudangReadyIds'] ?? [];
                $discrepancyIds      = $evalData['discrepancyIds'] ?? [];
                $matchedIds          = $evalData['matchedIds'] ?? [];
                $stockInfoById       = $evalData['stockInfoById'] ?? [];
            }
        }

        // 3. Ringkasan Global Statistik
        $summaryStats = Cache::store('file')->remember(
            'tiktok_summary_stats_v3_' . ($account ? $account->id : 'all'),
            60,
            function () use ($account) {
                $qStats = TiktokProduct::query();
                if ($account) {
                    $qStats->where('tiktok_account_id', $account->id);
                }
                $row = $qStats->selectRaw('
                    COUNT(*) as total_skus,
                    COALESCE(SUM(stock), 0) as total_stock,
                    COALESCE(SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END), 0) as in_stock_skus,
                    COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock_skus,
                    COALESCE(SUM(CASE WHEN sales > 0 THEN 1 ELSE 0 END), 0) as has_sales_skus,
                    COALESCE(SUM(sales), 0) as total_sales,
                    MAX(last_synced_at) as last_synced_at
                ')->first();

                return [
                    'total_skus'        => (int) ($row?->total_skus ?? 0),
                    'total_stock'       => (int) ($row?->total_stock ?? 0),
                    'in_stock_skus'     => (int) ($row?->in_stock_skus ?? 0),
                    'out_of_stock_skus' => (int) ($row?->out_of_stock_skus ?? 0),
                    'has_sales_skus'    => (int) ($row?->has_sales_skus ?? 0),
                    'total_sales'       => (int) ($row?->total_sales ?? 0),
                    'last_synced_at'    => $row?->last_synced_at ? (string) $row->last_synced_at : null,
                ];
            }
        );

        $totalSkus      = (int) ($summaryStats['total_skus'] ?? 0);
        $totalStock     = (int) ($summaryStats['total_stock'] ?? 0);
        $inStockSkus    = (int) ($summaryStats['in_stock_skus'] ?? 0);
        $outOfStockSkus = (int) ($summaryStats['out_of_stock_skus'] ?? 0);
        $hasSalesSkus   = (int) ($summaryStats['has_sales_skus'] ?? 0);
        $totalSales     = (int) ($summaryStats['total_sales'] ?? 0);
        $lastSyncedAt   = $summaryStats['last_synced_at'] ?? null;

        // 4. Query Paginasi 50 Item
        $query = TiktokProduct::query();
        if ($account) {
            $query->where('tiktok_products.tiktok_account_id', $account->id);
        }

        $lightCols = $this->getLightProductColumns();
        $lightSelectCols = $lightCols === ['*']
            ? ['tiktok_products.*']
            : array_map(static fn (string $col): string => 'tiktok_products.' . $col, $lightCols);

        $query->select($lightSelectCols);

        // Apply Search
        if (! empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('tiktok_products.sku', 'like', "%{$search}%")
                  ->orWhere('tiktok_products.item_name', 'like', "%{$search}%")
                  ->orWhere('tiktok_products.model_name', 'like', "%{$search}%")
                  ->orWhere('tiktok_products.item_id', 'like', "%{$search}%");
            });
        }

        // Apply Stock & Sales Filter
        if ($stockStatus === 'in_stock') {
            $query->where('tiktok_products.stock', '>', 0);
        } elseif ($stockStatus === 'out_of_stock') {
            $query->where('tiktok_products.stock', '<=', 0);
        } elseif ($stockStatus === 'has_sales') {
            $query->where('tiktok_products.sales', '>', 0);
        } elseif ($stockStatus === 'no_sales') {
            $query->where(function ($q) {
                $q->whereNull('tiktok_products.sales')->orWhere('tiktok_products.sales', '<=', 0);
            });
        } elseif ($stockStatus === 'discrepancy') {
            $query->whereIn('tiktok_products.id', ! empty($discrepancyIds) ? $discrepancyIds : [-1]);
        } elseif ($stockStatus === 'matched') {
            $query->whereIn('tiktok_products.id', ! empty($matchedIds) ? $matchedIds : [-1]);
        } elseif ($stockStatus === 'oos_critical') {
            $query->whereIn('tiktok_products.id', ! empty($criticalOosIds) ? $criticalOosIds : [-1]);
        } elseif ($stockStatus === 'gudang_ready') {
            $query->whereIn('tiktok_products.id', ! empty($gudangReadyIds) ? $gudangReadyIds : [-1]);
        } elseif ($stockStatus === 'campaign_unlocked') {
            $query->whereIn('tiktok_products.id', ! empty($campaignUnlockedIds) ? $campaignUnlockedIds : [-1]);
        } elseif ($stockStatus === 'campaign_locked') {
            $query->whereIn('tiktok_products.id', ! empty($campaignLockedIds) ? $campaignLockedIds : [-1]);
        }

        // Apply Sorting
        switch ($sort) {
            case 'sales_desc':
                $query->orderBy('tiktok_products.sales', 'DESC')->orderBy('tiktok_products.stock', 'DESC');
                break;
            case 'sales_asc':
                $query->orderBy('tiktok_products.sales', 'ASC')->orderBy('tiktok_products.stock', 'ASC');
                break;
            case 'stock_asc':
                $query->orderBy('tiktok_products.stock', 'ASC');
                break;
            case 'name_asc':
                $query->orderBy('tiktok_products.item_name', 'ASC');
                break;
            case 'name_desc':
                $query->orderBy('tiktok_products.item_name', 'DESC');
                break;
            case 'price_desc':
                $query->orderBy('tiktok_products.price', 'DESC');
                break;
            case 'price_asc':
                $query->orderBy('tiktok_products.price', 'ASC');
                break;
            case 'stock_desc':
            default:
                $query->orderBy('tiktok_products.stock', 'DESC')->orderBy('tiktok_products.item_name', 'ASC');
                break;
        }

        $products = $query->paginate(50)->withQueryString();

        // 5. Append Warehouse & Reconciliation metadata
        $products->getCollection()->transform(function ($p) use ($stockInfoById) {
            if (isset($stockInfoById[$p->id])) {
                $info = $stockInfoById[$p->id];
                $p->warehouse_stock      = $info['warehouse_stock'];
                $p->stock_g              = $info['stock_g'];
                $p->stock_a              = $info['stock_a'];
                $p->stock_diff           = $info['diff'];
                $p->stock_audit_status   = $info['status'];
                $p->matched_code         = $info['matched_code'];
                $p->match_type           = $info['match_type'];
                $p->is_critical_oos      = $info['is_critical_oos'];
                $p->is_campaign_locked   = $info['is_campaign_locked'];
                $p->is_campaign_unlocked = $info['is_campaign_unlocked'];
                $p->suggested_code       = $info['suggested_code'];
                $p->suggested_name       = $info['suggested_name'];
                $p->warning_message      = $info['warning_message'];
                $p->is_safe_to_zero      = $info['is_safe_to_zero'];
            }
            return $p;
        });

        $stockWorkQueue = self::buildStockWorkQueue(
            count($criticalOosIds),
            count($discrepancyIds),
            count($campaignUnlockedIds)
        );
        try {
            Cache::store('file')->put('tiktok_stock_alert_queue', $stockWorkQueue, 900);
        } catch (\Throwable) {
        }

        $isSuperAdmin = $this->isSuperAdmin($request->user());

        $shopeeQueue = app(\App\Http\Controllers\ShopeeProductController::class)->getStockAlertWorkQueue(false);
        $combinedQueue = [
            'items'    => array_values(array_merge($shopeeQueue['items'] ?? [], $stockWorkQueue['items'] ?? [])),
            'total'    => count($shopeeQueue['items'] ?? []) + count($stockWorkQueue['items'] ?? []),
            'critical' => (($shopeeQueue['critical'] ?? 0) > 0 || ($stockWorkQueue['critical'] ?? 0) > 0) ? 1 : 0,
        ];

        return Inertia::render('Tiktok/Products', [
            'products' => $products,
            'filters'  => [
                'search'       => $search,
                'stock_status' => $stockStatus,
                'sort'         => $sort,
                'date_from'    => $dateFrom,
                'date_to'      => $dateTo,
            ],
            'summary'  => [
                'total_skus'              => $totalSkus,
                'total_stock'             => $totalStock,
                'in_stock_skus'           => $inStockSkus,
                'out_of_stock_skus'       => $outOfStockSkus,
                'has_sales_count'         => $hasSalesSkus,
                'total_sales'             => $totalSales,
                'total_period_sales'      => $totalSales,
                'period_sales_count'      => $hasSalesSkus,
                'critical_oos_count'      => count($criticalOosIds),
                'campaign_locked_count'   => count($campaignLockedIds),
                'campaign_unlocked_count' => count($campaignUnlockedIds),
                'gudang_ready_count'      => count($gudangReadyIds),
                'discrepancy_count'       => count($discrepancyIds),
                'matched_count'           => count($matchedIds),
                'critical_oos_ids'        => $criticalOosIds,
                'campaign_unlocked_ids'   => $campaignUnlockedIds,
                'last_synced_at'          => $lastSyncedAt,
            ],
            'master_stock_summary' => $masterStockSummary,
            'workQueue'            => $isSuperAdmin ? $combinedQueue : ['items' => [], 'total' => 0, 'critical' => 0],
            'zeroRestoreSummary'   => $isSuperAdmin ? $this->buildZeroRestoreSummary($account?->id) : null,
            'account'              => $account ? [
                'id'           => $account->id,
                'account_name' => $account->account_name,
                'shop_id'      => $account->shop_id,
                'is_connected' => $account->isConnected() && ! empty($account->access_token),
            ] : null,
        ]);
    }

    /**
     * Trigger manual sync of TikTok Products from API (or catalog refresh).
     */
    public function sync(Request $request): \Illuminate\Http\RedirectResponse
    {
        try {
            $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();
            if (! $account) {
                return back()->with('error', 'Akun TikTok belum tersedia di sistem.');
            }

            $result = $this->syncService->syncProductsFromTiktok($account);
            self::clearAuditCache($account->id);
            return back()->with('success', $result['message']);
        } catch (\Throwable $e) {
            return back()->with('error', 'Gagal menyinkronkan produk TikTok: ' . $e->getMessage());
        }
    }

    /**
     * Export daftar produk & stok TikTok ke format Excel / CSV.
     */
    public function export(Request $request): StreamedResponse
    {
        $search      = trim((string) $request->input('search', ''));
        $stockStatus = (string) $request->input('stock_status', 'all');
        $sort        = (string) $request->input('sort', 'stock_desc');

        $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();

        $query = TiktokProduct::query();
        if ($account) {
            $query->where('tiktok_account_id', $account->id);
        }

        if (! empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('sku', 'like', "%{$search}%")
                  ->orWhere('item_name', 'like', "%{$search}%")
                  ->orWhere('model_name', 'like', "%{$search}%")
                  ->orWhere('item_id', 'like', "%{$search}%");
            });
        }

        if ($stockStatus === 'in_stock') {
            $query->where('stock', '>', 0);
        } elseif ($stockStatus === 'out_of_stock') {
            $query->where('stock', '<=', 0);
        }

        switch ($sort) {
            case 'stock_asc':
                $query->orderBy('stock', 'ASC');
                break;
            case 'name_asc':
                $query->orderBy('item_name', 'ASC');
                break;
            case 'name_desc':
                $query->orderBy('item_name', 'DESC');
                break;
            case 'stock_desc':
            default:
                $query->orderBy('stock', 'DESC');
                break;
        }

        $filename = 'stok_produk_tiktok_' . now('Asia/Jakarta')->format('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF)); // UTF-8 BOM

            fputcsv($handle, [
                'Product ID',
                'Model ID',
                'Nama Produk',
                'Variasi / Ukuran',
                'Seller SKU',
                'Stok Tersedia',
                'Stok Terkunci Promo',
                'Harga (Rp)',
                'Total Terjual',
                'Status',
                'Terakhir Sync',
            ]);

            $query->chunk(500, function ($products) use ($handle) {
                foreach ($products as $p) {
                    fputcsv($handle, [
                        $p->item_id,
                        $p->model_id,
                        $p->item_name,
                        $p->model_name ?: '-',
                        $p->sku ?: '-',
                        $p->stock,
                        $p->locked_campaign_qty,
                        $p->price,
                        $p->sales,
                        $p->item_status,
                        $p->last_synced_at ? $p->last_synced_at->timezone('Asia/Jakarta')->format('Y-m-d H:i:s') : '-',
                    ]);
                }
            });

            fclose($handle);
        }, $filename, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * Map manual item code to TikTok Product SKU.
     */
    public function mapProduct(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => 'required|integer',
            'item_code'  => 'required|string|max:50',
        ]);

        $product = TiktokProduct::findOrFail($validated['product_id']);
        $product->update([
            'manual_item_code' => strtoupper(trim($validated['item_code'])),
        ]);

        self::clearAuditCache($product->tiktok_account_id);

        return response()->json([
            'status'  => 'success',
            'message' => "SKU berhasil dipetakan ke kode master '{$product->manual_item_code}'.",
        ]);
    }

    /**
     * Pencarian cepat varian produk TikTok untuk modal Ubah Kode Barang Massal.
     */
    public function searchVariants(Request $request): JsonResponse
    {
        $q = trim((string) $request->input('q', ''));
        if ($q === '') {
            return response()->json(['status' => 'success', 'data' => []]);
        }

        $term = strtoupper($q);
        $products = TiktokProduct::query()
            ->where(function ($query) use ($q, $term) {
                $query->where('sku', 'like', "%{$q}%")
                    ->orWhere('sku', 'like', "%{$term}%")
                    ->orWhere('item_name', 'like', "%{$q}%")
                    ->orWhere('model_name', 'like', "%{$q}%")
                    ->orWhere('manual_item_code', 'like', "%{$term}%");
            })
            ->select('id', 'tiktok_account_id', 'item_id', 'model_id', 'item_name', 'model_name', 'sku', 'manual_item_code', 'stock')
            ->orderBy('item_name', 'asc')
            ->orderBy('sku', 'asc')
            ->limit(100)
            ->get();

        return response()->json([
            'status' => 'success',
            'data'   => $products,
        ]);
    }

    /**
     * Update massal kode barang (manual_item_code) pada sekumpulan produk TikTok.
     */
    public function bulkMap(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_ids'   => 'required|array|min:1',
            'product_ids.*' => 'required|integer',
            'item_code'     => 'required|string|max:50',
        ]);

        $this->syncService->ensureProductSchema();

        $itemCode = strtoupper(trim($validated['item_code']));
        $productIds = $validated['product_ids'];

        $products = TiktokProduct::whereIn('id', $productIds)->get();
        if ($products->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Tidak ada produk valid yang ditemukan untuk diperbarui.',
            ], 422);
        }

        TiktokProduct::whereIn('id', $productIds)->update([
            'manual_item_code' => $itemCode,
        ]);

        // Bersihkan cache audit untuk semua akun TikTok terkait
        $accountIds = $products->pluck('tiktok_account_id')->filter()->unique();
        foreach ($accountIds as $accId) {
            self::clearAuditCache($accId);
        }

        $updatedCount = $products->count();

        return response()->json([
            'status'        => 'success',
            'updated_count' => $updatedCount,
            'message'       => "Berhasil memperbarui {$updatedCount} varian ke Kode Barang '{$itemCode}'.",
        ]);
    }

    /**
     * Search MasterStock for mapping modal.
     */
    public function searchMasterStock(Request $request): JsonResponse
    {
        $q = trim((string) $request->input('q', ''));
        if (strlen($q) < 2) {
            return response()->json(['items' => []]);
        }

        $items = MasterStock::where('item_code', 'like', "%{$q}%")
            ->orWhere('item_name', 'like', "%{$q}%")
            ->limit(20)
            ->get(['item_code', 'item_name', 'qty_pcs', 'warehouse']);

        return response()->json(['items' => $items]);
    }

    /**
     * Zero out stock for selected products (bulk or selective).
     */
    public function zeroOut(Request $request): JsonResponse
    {
        $user = $this->ensureSuperAdminUser($request);
        $this->syncService->ensureProductSchema();

        $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();

        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko TikTok belum terhubung di sistem ERP.',
            ], 422);
        }

        $productIds = $request->input('product_ids', []);
        if (empty($productIds) || ! is_array($productIds)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Pilih setidaknya 1 produk untuk dikosongkan.',
            ], 422);
        }

        $validProducts = TiktokProduct::where('tiktok_account_id', $account->id)
            ->whereIn('id', array_unique(array_map('intval', $productIds)))
            ->get();

        if ($validProducts->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Produk yang dipilih tidak ditemukan di database.',
            ], 422);
        }

        $rawSource = (string) $request->input('source', 'bulk');
        $source = in_array($rawSource, ['notification_critical', 'audit_bulk', 'single', 'bulk'], true) ? $rawSource : 'bulk';

        $safeIds = $validProducts->pluck('id')->map(fn ($id) => (int) $id)->all();
        $now = now();
        $batchCode = 'ZOB-TT-' . $now->copy()->timezone('Asia/Jakarta')->format('Ymd-His') . '-' . strtoupper(Str::random(4));

        $batch = DB::transaction(function () use ($account, $batchCode, $source, $validProducts, $safeIds, $user, $now) {
            $batch = TiktokStockZeroBatch::create([
                'tiktok_account_id' => $account->id,
                'batch_code'        => $batchCode,
                'source'            => $source,
                'note'              => count($safeIds) . ' variasi SKU TikTok dikosongkan melalui ERP.',
                'total_requested'   => count($safeIds),
                'zeroed_count'      => 0,
                'failed_count'      => 0,
                'restored_count'    => 0,
                'status'            => 'zeroed',
                'zeroed_by'         => $user->id,
                'zeroed_by_name'    => $user->name ?? 'Super Admin',
                'zeroed_at'         => $now,
            ]);

            foreach ($validProducts as $product) {
                TiktokStockZeroItem::create([
                    'batch_id'                     => $batch->id,
                    'tiktok_account_id'            => $account->id,
                    'tiktok_product_id'            => $product->id,
                    'item_id'                      => $product->item_id,
                    'model_id'                     => $product->model_id,
                    'item_name'                    => $product->item_name,
                    'model_name'                   => $product->model_name,
                    'sku'                          => $product->sku,
                    'previous_stock'               => (int) $product->stock,
                    'previous_reserved_stock'      => (int) $product->reserved_stock,
                    'previous_locked_campaign_qty' => (int) $product->locked_campaign_qty,
                    'previous_was_campaign_locked' => (bool) $product->was_campaign_locked,
                    'zeroed_stock'                 => 0,
                    'status'                       => 'zeroed',
                ]);

                // Update stock to 0
                $this->syncService->updateProductStock($account, $product, 0);
            }

            $batch->update([
                'zeroed_count' => count($safeIds),
                'status'       => 'zeroed',
            ]);

            return $batch;
        });

        self::clearAuditCache($account->id);

        return response()->json([
            'status'       => 'success',
            'batch_id'     => $batch->id,
            'batch_code'   => $batch->batch_code,
            'zeroed_count' => count($safeIds),
            'message'      => count($safeIds) . ' SKU variasi produk TikTok berhasil dikosongkan (stok menjadi 0 pcs).',
        ]);
    }

    /**
     * Get zero history for restore modal.
     */
    public function zeroHistory(Request $request): JsonResponse
    {
        $this->ensureSuperAdminUser($request);
        $this->syncService->ensureProductSchema();

        $batches = TiktokStockZeroBatch::with(['items' => function ($q) {
            $q->orderBy('id', 'ASC');
        }])->orderBy('id', 'DESC')->limit(20)->get();

        return response()->json([
            'status'  => 'success',
            'batches' => $batches,
        ]);
    }

    /**
     * Restore a zero-out batch.
     */
    public function restoreZeroBatch(Request $request): JsonResponse
    {
        $user = $this->ensureSuperAdminUser($request);
        $this->syncService->ensureProductSchema();

        $batchId = (int) $request->input('batch_id');
        $batch = TiktokStockZeroBatch::with('items')->findOrFail($batchId);
        $account = TiktokAccount::find($batch->tiktok_account_id) ?? TiktokAccount::first();

        $restoredCount = 0;
        foreach ($batch->items as $item) {
            if ($item->status !== 'restored') {
                $product = TiktokProduct::find($item->tiktok_product_id);
                if ($product && $account) {
                    $this->syncService->updateProductStock($account, $product, $item->previous_stock);
                    $item->update([
                        'status'           => 'restored',
                        'restored_by'      => $user->id,
                        'restored_by_name' => $user->name ?? 'Super Admin',
                        'restored_at'      => now(),
                    ]);
                    $restoredCount++;
                }
            }
        }

        $batch->update([
            'restored_count'   => $batch->restored_count + $restoredCount,
            'status'           => 'restored',
            'restored_by'      => $user->id,
            'restored_by_name' => $user->name ?? 'Super Admin',
            'restored_at'      => now(),
        ]);

        self::clearAuditCache($account?->id);

        return response()->json([
            'status'         => 'success',
            'restored_count' => $restoredCount,
            'message'        => "Batch {$batch->batch_code} berhasil dipulihkan ({$restoredCount} SKU dikembalikan ke stok semula).",
        ]);
    }

    /**
     * Get product variants for quick restock/edit modal.
     */
    public function getProductVariants(Request $request): JsonResponse
    {
        $itemId = trim((string) $request->input('item_id', ''));
        if (empty($itemId)) {
            return response()->json(['status' => 'error', 'message' => 'Item ID tidak valid.'], 422);
        }

        $variants = TiktokProduct::where('item_id', $itemId)
            ->orderBy('id', 'ASC')
            ->get();

        return response()->json([
            'status'   => 'success',
            'variants' => $variants,
        ]);
    }

    /**
     * Quick stock update for variant(s).
     */
    public function updateStock(Request $request): JsonResponse
    {
        $this->ensureSuperAdminUser($request);

        $validated = $request->validate([
            'product_id' => 'required|integer',
            'stock'      => 'required|integer|min:0',
        ]);

        $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();
        $product = TiktokProduct::findOrFail($validated['product_id']);

        if (! $account) {
            return response()->json(['status' => 'error', 'message' => 'Akun TikTok tidak ditemukan.'], 422);
        }

        $res = $this->syncService->updateProductStock($account, $product, (int) $validated['stock']);

        return response()->json($res);
    }

    /**
     * Build zero restore summary for UI cards.
     */
    private function buildZeroRestoreSummary(?int $accountId): ?array
    {
        $cacheKey = 'tiktok_zero_summary_' . ($accountId ?? 'all');
        return Cache::store('file')->remember($cacheKey, 300, function () {
            try {
                $totalBatches = TiktokStockZeroBatch::count();
                if ($totalBatches === 0) {
                    return null;
                }

                $restorableBatches = TiktokStockZeroBatch::where('status', 'zeroed')->count();
                $restorableItems = TiktokStockZeroItem::where('status', 'zeroed')->count();
                $restoredItems = TiktokStockZeroItem::where('status', 'restored')->count();
                $latest = TiktokStockZeroBatch::where('status', 'zeroed')->orderBy('id', 'DESC')->first();

                return [
                    'total_batches'            => $totalBatches,
                    'restorable_batches_count' => $restorableBatches,
                    'restorable_items_count'   => $restorableItems,
                    'restored_items_count'     => $restoredItems,
                    'latest_restorable_batch'  => $latest ? [
                        'id'               => $latest->id,
                        'batch_code'       => $latest->batch_code,
                        'source'           => $latest->source,
                        'source_label'     => ucfirst($latest->source),
                        'note'             => $latest->note,
                        'zeroed_by_name'   => $latest->zeroed_by_name,
                        'zeroed_at_label'  => $latest->zeroed_at ? $latest->zeroed_at->diffForHumans() : null,
                        'total_requested'  => $latest->total_requested,
                        'zeroed_count'     => $latest->zeroed_count,
                        'restored_count'   => $latest->restored_count,
                        'restorable_count' => $latest->zeroed_count - $latest->restored_count,
                    ] : null,
                ];
            } catch (\Throwable) {
                return null;
            }
        });
    }

    /**
     * Compare internal warehouse stock (uploaded from Excel) against TikTok products stock.
     */
    public function compareStock(Request $request): JsonResponse
    {
        $this->syncService->ensureProductSchema();

        $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();
        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko TikTok belum terhubung di sistem ERP.',
            ], 422);
        }

        $items = $request->input('items', []);
        if (empty($items) || ! is_array($items)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Data baris Excel tidak ditemukan atau kosong.',
            ], 422);
        }

        $tiktokProducts = TiktokProduct::where('tiktok_account_id', $account->id)->get();

        $productMap = [];
        $codeMap    = [];

        foreach ($tiktokProducts as $p) {
            if (! empty($p->sku)) {
                $norm = strtoupper(trim($p->sku));
                $productMap[$norm] = $p;

                if (preg_match('/_(\d{6,8})(?:\D|$)/i', $norm, $m)) {
                    $codeMap[$m[1]] = $p;
                    $codeMap[ltrim($m[1], '0')] = $p;
                }
                if (preg_match('/(?:\D|^)(\d{7,8})(?:\D|$)/', $norm, $m)) {
                    $codeMap[$m[1]] = $p;
                    $codeMap[ltrim($m[1], '0')] = $p;
                }
            }
        }

        $comparisonList   = [];
        $criticalCount    = 0;
        $lowStockCount    = 0;
        $discrepancyCount = 0;
        $matchedCount     = 0;
        $unmatchedCount   = 0;

        foreach ($items as $row) {
            $rawSku = trim((string) ($row['sku'] ?? ''));
            if ($rawSku === '') {
                continue;
            }

            $warehouseStock = max(0, (int) ($row['warehouse_stock'] ?? $row['stock'] ?? 0));
            $normSku        = strtoupper($rawSku);

            $matchedProduct = $productMap[$normSku]
                ?? $codeMap[$normSku]
                ?? ($codeMap[ltrim($normSku, '0')] ?? null)
                ?? null;

            if (! $matchedProduct && preg_match('/(?:\D|^)(\d{7,8})(?:\D|$)/', $normSku, $m)) {
                $matchedProduct = $codeMap[$m[1]] ?? ($codeMap[ltrim($m[1], '0')] ?? null);
            }

            if ($matchedProduct) {
                $tiktokStock   = (int) $matchedProduct->stock;
                $reservedStock = (int) $matchedProduct->reserved_stock;
                $diff          = $warehouseStock - $tiktokStock;

                if ($warehouseStock <= 0 && $tiktokStock > 0) {
                    $status = 'CRITICAL';
                    $criticalCount++;
                } elseif ($warehouseStock > 0 && $warehouseStock <= 3) {
                    $status = 'LOW_STOCK';
                    $lowStockCount++;
                } elseif ($diff !== 0) {
                    $status = 'DISCREPANCY';
                    $discrepancyCount++;
                } else {
                    $status = 'MATCHED';
                    $matchedCount++;
                }

                $comparisonList[] = [
                    'id'               => $matchedProduct->id,
                    'sku'              => $matchedProduct->sku ?: $rawSku,
                    'item_id'          => $matchedProduct->item_id,
                    'model_id'         => $matchedProduct->model_id,
                    'item_name'        => $matchedProduct->item_name,
                    'model_name'       => $matchedProduct->model_name,
                    'warehouse_stock'  => $warehouseStock,
                    'tiktok_stock'     => $tiktokStock,
                    'shopee_stock'     => $tiktokStock,
                    'reserved_stock'   => $reservedStock,
                    'diff'             => $diff,
                    'status'           => $status,
                    'is_matched'       => true,
                ];
            } else {
                $unmatchedCount++;
                $comparisonList[] = [
                    'id'               => null,
                    'sku'              => $rawSku,
                    'item_id'          => null,
                    'model_id'         => null,
                    'item_name'        => $row['item_name'] ?? $rawSku,
                    'model_name'       => null,
                    'warehouse_stock'  => $warehouseStock,
                    'tiktok_stock'     => 0,
                    'shopee_stock'     => 0,
                    'reserved_stock'   => 0,
                    'diff'             => $warehouseStock,
                    'status'           => 'UNMATCHED',
                    'is_matched'       => false,
                ];
            }
        }

        return response()->json([
            'status'    => 'success',
            'summary'   => [
                'total_rows'        => count($comparisonList),
                'critical_count'    => $criticalCount,
                'low_stock_count'   => $lowStockCount,
                'discrepancy_count' => $discrepancyCount,
                'matched_count'     => $matchedCount,
                'unmatched_count'   => $unmatchedCount,
            ],
            'items'     => $comparisonList,
            'source'    => 'EXCEL_UPLOAD',
        ]);
    }

    /**
     * Audit perbandingan stok fisik Master Stock internal ERP vs katalog produk TikTok.
     */
    public function compareWithMaster(Request $request): JsonResponse
    {
        $this->syncService->ensureProductSchema();

        $account = TiktokAccount::where('status', 'active')->first() ?? TiktokAccount::first();
        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko TikTok belum terhubung di sistem ERP.',
            ], 422);
        }

        $warehouse = strtoupper(trim((string) $request->input('warehouse', 'ALL')));

        if (! \Illuminate\Support\Facades\Schema::hasTable('master_stocks')) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Belum ada data Master Stok di database. Silakan upload laporan stok di menu Master Stok terlebih dahulu.',
            ], 422);
        }

        $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs', 'raw_qty', 'unit')->get();

        if ($masterStocks->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Belum ada data Master Stok di database. Silakan upload laporan stok di menu Master Stok terlebih dahulu.',
            ], 422);
        }

        $maps = ProductStockMatcher::buildMasterStockMaps($masterStocks);
        $tiktokProducts = TiktokProduct::where('tiktok_account_id', $account->id)->get();
        $variantCounts = ProductStockMatcher::countDistinctSizesPerItem($tiktokProducts);

        $comparisonList   = [];
        $criticalCount    = 0;
        $lowStockCount    = 0;
        $discrepancyCount = 0;
        $matchedCount     = 0;
        $unmatchedCount   = 0;

        foreach ($tiktokProducts as $p) {
            $info = ProductStockMatcher::resolveStockInfo(
                $p,
                $maps,
                $warehouse,
                $variantCounts[$p->item_id] ?? 6
            );

            if ($info['status'] === 'UNMATCHED') {
                $unmatchedCount++;
            } elseif ($info['status'] === 'CRITICAL') {
                $criticalCount++;
            } elseif ($info['status'] === 'LOW_STOCK') {
                $lowStockCount++;
            } elseif ($info['status'] === 'DISCREPANCY') {
                $discrepancyCount++;
            } else {
                $matchedCount++;
            }

            $comparisonList[] = [
                'id'                   => $p->id,
                'item_id'              => $p->item_id,
                'model_id'             => $p->model_id,
                'sku'                  => $p->sku ?: '—',
                'manual_item_code'     => $p->manual_item_code,
                'item_name'            => $p->item_name,
                'model_name'           => $p->model_name,
                'warehouse_stock'      => $info['warehouse_stock'],
                'stock_g'              => $info['stock_g'],
                'stock_a'              => $info['stock_a'],
                'tiktok_stock'         => $info['tiktok_stock'] ?? (int) $p->stock,
                'shopee_stock'         => $info['tiktok_stock'] ?? (int) $p->stock,
                'reserved_stock'       => $info['reserved_stock'] ?? (int) $p->reserved_stock,
                'diff'                 => $info['diff'],
                'status'               => $info['status'],
                'match_type'           => $info['match_type'],
                'matched_code'         => $info['matched_code'],
                'suggested_code'       => $info['suggested_code'],
                'suggested_name'       => $info['suggested_name'],
                'warning_message'      => $info['warning_message'],
                'is_safe_to_zero'      => $info['is_safe_to_zero'],
                'is_critical_oos'      => $info['is_critical_oos'],
                'is_campaign_locked'   => $info['is_campaign_locked'],
                'is_campaign_unlocked' => $info['is_campaign_unlocked'],
                'is_tiktok_found'      => true,
            ];
        }

        $priorityOrder = [
            'UNMATCHED'   => 1,
            'CRITICAL'    => 2,
            'LOW_STOCK'   => 3,
            'DISCREPANCY' => 4,
            'MATCHED'     => 5,
        ];

        usort($comparisonList, function ($a, $b) use ($priorityOrder) {
            $pA = $priorityOrder[$a['status']] ?? 99;
            $pB = $priorityOrder[$b['status']] ?? 99;
            if ($pA !== $pB) {
                return $pA <=> $pB;
            }
            return strcmp((string) $a['sku'], (string) $b['sku']);
        });

        return response()->json([
            'status'    => 'success',
            'summary'   => [
                'total_rows'        => count($comparisonList),
                'critical_count'    => $criticalCount,
                'low_stock_count'   => $lowStockCount,
                'discrepancy_count' => $discrepancyCount,
                'matched_count'     => $matchedCount,
                'unmatched_count'   => $unmatchedCount,
            ],
            'items'     => $comparisonList,
            'source'    => 'MASTER_STOCK',
            'warehouse' => $warehouse,
        ]);
    }

    /**
     * Build indexed lookup maps for Master Stocks via ProductStockMatcher.
     */
    public function buildMasterStockMaps($masterStocks): array
    {
        return ProductStockMatcher::buildMasterStockMaps($masterStocks);
    }

    /**
     * Fast O(1) resolution of stock info using pre-indexed smart dictionary and lusin allocation.
     */
    public function resolveProductStockInfoFast(
        TiktokProduct $p,
        array &$masterByCode,
        array &$gMap,
        array &$aMap,
        array &$aPrefixMap,
        array &$smartIndex,
        string $warehouse = 'ALL',
        ?array $aSerianItems = null,
        ?int $variantCount = null
    ): array {
        $serian = $aSerianItems ?? [];
        $maps = [
            'masterByCode' => &$masterByCode,
            'gMap'         => &$gMap,
            'aMap'         => &$aMap,
            'aPrefixMap'   => &$aPrefixMap,
            'smartIndex'   => &$smartIndex,
            'aSerianItems' => &$serian,
        ];

        return ProductStockMatcher::resolveStockInfo($p, $maps, $warehouse, $variantCount);
    }

    private function isSuperAdmin(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if (method_exists($user, 'isSuperAdmin')) {
            return $user->isSuperAdmin();
        }

        return $user->roles->contains('name', 'Super Admin')
            || ($user->role && $user->role->name === 'Super Admin');
    }

    private function ensureSuperAdminUser(Request $request): User
    {
        $user = $request->user();
        if (! $user || ! $this->isSuperAdmin($user)) {
            abort(403, 'Aksi ini hanya dapat dilakukan oleh Super Admin.');
        }

        return $user;
    }
}
