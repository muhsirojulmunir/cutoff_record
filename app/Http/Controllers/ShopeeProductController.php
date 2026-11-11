<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Models\ShopeeProduct;
use App\Models\MasterStock;
use App\Services\ShopeeSyncService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ShopeeProductController extends Controller
{
    public function __construct(private readonly ShopeeSyncService $syncService) {}

    /**
     * Clear cached reconciliation, summary stats, and file-based notification queue.
     */
    public static function clearAuditCache(?int $accountId = null): void
    {
        try {
            Cache::store('file')->forget('shopee_stock_alert_queue');
        } catch (\Throwable $e) {
            // Safe fallback if file cache is unavailable
        }
    }

    /**
     * Bangun struktur notifikasi topbar untuk peringatan SKU kritis & selisih stok Shopee.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, critical: int}
     */
    public static function buildStockWorkQueue(int $criticalOosCount, int $discrepancyCount, int $campaignUnlockedCount = 0): array
    {
        $items = [];

        if ($criticalOosCount > 0 || $campaignUnlockedCount > 0) {
            $desc = number_format($criticalOosCount, 0, ',', '.') . ' SKU stok gudang 0 pcs tetapi masih dijual di Shopee.';
            if ($campaignUnlockedCount > 0) {
                $desc .= ' Termasuk ' . number_format($campaignUnlockedCount, 0, ',', '.') . ' SKU promo terbuka.';
            }

            $items[] = [
                'key'         => 'shopee_critical_oos',
                'type'        => 'stock',
                'title'       => 'SKU Habis di Gudang (Shopee)',
                'description' => $desc,
                'count'       => $criticalOosCount,
                'amount'      => null,
                'href'        => '/shopee-products?stock_status=oos_critical',
                'severity'    => 'critical',
            ];
        }

        if ($discrepancyCount > 0) {
            $items[] = [
                'key'         => 'shopee_stock_discrepancy',
                'type'        => 'stock',
                'title'       => 'SKU Selisih Stok (Gudang ≠ Shopee)',
                'description' => number_format($discrepancyCount, 0, ',', '.') . ' SKU memiliki selisih stok antara Shopee dan Gudang A + G.',
                'count'       => $discrepancyCount,
                'amount'      => null,
                'href'        => '/shopee-products?stock_status=discrepancy',
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
     * Ambil ringkasan notifikasi stok Shopee untuk topbar (khusus Super Admin).
     * Menggunakan file cache agar aman tanpa ketergantungan tabel database cache.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, critical: int}
     */
    public function getStockAlertWorkQueue(): array
    {
        $empty = ['items' => [], 'total' => 0, 'critical' => 0];

        try {
            $cached = Cache::store('file')->get('shopee_stock_alert_queue');
            if (is_array($cached) && isset($cached['items'])) {
                return $cached;
            }
        } catch (\Throwable $e) {
            // Lanjutkan evaluasi langsung bila file cache gagal dibaca
        }

        try {
            if (
                ! \Illuminate\Support\Facades\Schema::hasTable('master_stocks')
                || ! \Illuminate\Support\Facades\Schema::hasTable('shopee_products')
                || ! \Illuminate\Support\Facades\Schema::hasTable('shopee_accounts')
            ) {
                return $empty;
            }

            $account = ShopeeAccount::where('status', 'active')->first() ?? ShopeeAccount::first();
            if (! $account) {
                return $empty;
            }

            $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs')->get();
            if ($masterStocks->isEmpty()) {
                return $empty;
            }

            $maps     = $this->buildMasterStockMaps($masterStocks);
            $allProds = ShopeeProduct::where('shopee_account_id', $account->id)->get();

            $criticalOosCount      = 0;
            $campaignUnlockedCount = 0;
            $discrepancyCount      = 0;

            foreach ($allProds as $p) {
                $info = $this->resolveProductStockInfoFast(
                    $p,
                    $maps['masterByCode'],
                    $maps['gMap'],
                    $maps['aMap'],
                    $maps['aPrefixMap'],
                    $maps['smartIndex']
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
                Cache::store('file')->put('shopee_stock_alert_queue', $queue, 120);
            } catch (\Throwable $e) {
                // Abaikan jika tidak bisa menulis file cache
            }

            return $queue;
        } catch (\Throwable $e) {
            return $empty;
        }
    }

    /**
     * Display page list of Shopee Products, SKU, and Stock.
     * Dioptimalkan dengan index O(1) cepat & aman dari crash database cache.
     */
    public function index(Request $request): \Inertia\Response
    {
        // Pastikan skema tabel aman tanpa throw error jika di hosting cPanel
        try {
            $this->syncService->ensureProductSchema();
        } catch (\Throwable $e) {
            // Abaikan jika tidak punya akses alter table di cPanel
        }

        $search      = trim((string) $request->input('search', ''));
        $stockStatus = (string) $request->input('stock_status', 'all');
        $sort        = (string) $request->input('sort', 'stock_desc');
        $todayStr    = now('Asia/Jakarta')->toDateString();

        // Default rentang tanggal penjualan: Hari Ini
        $dateFrom = $request->has('date_from') ? (string) $request->input('date_from') : $todayStr;
        $dateTo   = $request->has('date_to') ? (string) $request->input('date_to') : $todayStr;

        $account = ShopeeAccount::where('status', 'active')->first() ?? ShopeeAccount::first();

        // Cek jika tabel shopee_products belum ada atau gagal dibuat
        if (! \Illuminate\Support\Facades\Schema::hasTable('shopee_products')) {
            return Inertia::render('Shopee/Products', [
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

        // 1. Ringkasan Master Stok Gudang (Aman dari null pointer & tanpa ketergantungan tabel cache)
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

        $masterStocks = collect();
        if ($hasMasterTable) {
            try {
                $whStats = MasterStock::selectRaw('warehouse, COUNT(*) as total_items, COALESCE(SUM(qty_pcs), 0) as total_pcs, MAX(last_imported_at) as last_imported')
                    ->groupBy('warehouse')
                    ->get()
                    ->keyBy('warehouse');

                $g = $whStats->get('G');
                $a = $whStats->get('A');

                $masterStockSummary = [
                    'total_g_items'    => (int) ($g?->total_items ?? 0),
                    'total_g_pcs'      => (int) ($g?->total_pcs ?? 0),
                    'last_imported_g'  => $g?->last_imported,
                    'total_a_items'    => (int) ($a?->total_items ?? 0),
                    'total_a_pcs'      => (int) ($a?->total_pcs ?? 0),
                    'last_imported_a'  => $a?->last_imported,
                    'has_master_stock' => ($whStats->count() > 0),
                ];

                if ($masterStockSummary['has_master_stock']) {
                    $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs')->get();
                }
            } catch (\Throwable $e) {
                // Fallback aman jika query MasterStock mengalami kendala
            }
        }

        // 2. Evaluasi Cepat Rekonsiliasi Master Stok dengan O(1) Hash Map Indexing (Instan di memori ~10ms)
        $criticalOosIds      = [];
        $campaignLockedIds   = [];
        $campaignUnlockedIds = [];
        $gudangReadyIds      = [];
        $discrepancyIds      = [];
        $matchedIds          = [];
        $stockInfoById       = [];

        if ($masterStockSummary['has_master_stock'] && $account && $masterStocks->isNotEmpty()) {
            $maps = $this->buildMasterStockMaps($masterStocks);

            // Ambil produk tanpa memaksakan nama kolom baru agar aman jika server belum menjalankan migrasi
            $allProds = ShopeeProduct::where('shopee_account_id', $account->id)->get();

            foreach ($allProds as $p) {
                $info = $this->resolveProductStockInfoFast(
                    $p,
                    $maps['masterByCode'],
                    $maps['gMap'],
                    $maps['aMap'],
                    $maps['aPrefixMap'],
                    $maps['smartIndex']
                );

                if ($info['is_critical_oos']) {
                    $criticalOosIds[] = $p->id;
                } elseif ($info['is_campaign_unlocked']) {
                    $campaignUnlockedIds[] = $p->id;
                } elseif ($info['is_campaign_locked']) {
                    $campaignLockedIds[] = $p->id;
                }

                // Deteksi barang yang di gudang ada stoknya (> 0) tapi di Shopee masih 0 (Gudang Ready)
                if ($info['warehouse_stock'] > 0 && $p->stock <= 0) {
                    $gudangReadyIds[] = $p->id;
                }

                // Auto deteksi perbandingan stok fisik Gudang (A + G) vs Stok di Shopee
                if (! empty($info['matched_code'])) {
                    if ($info['diff'] !== 0) {
                        $discrepancyIds[] = $p->id;
                    } else {
                        $matchedIds[] = $p->id;
                    }
                }

                $stockInfoById[$p->id] = $info;
            }
        }

        // 3. Ringkasan Global Statistik Shopee & Subquery Agregasi Penjualan Periode
        $hasCutOffTable   = \Illuminate\Support\Facades\Schema::hasTable('cut_off_orders');
        $periodSalesSub   = null;
        $totalPeriodSales = 0;
        $periodSalesCount = 0;

        if ($hasCutOffTable) {
            $invalidSkus = ['0', '', '-', '--', '---', '@', '.', 'null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku'];

            $subQuery = DB::table('cut_off_orders')
                ->select('sku_utama', DB::raw('CAST(SUM(qty) AS UNSIGNED) as period_sales'))
                ->where(function ($q) {
                    $q->where('channel', 'SH')
                      ->orWhere('channel', 'like', 'SH%');
                })
                ->where(function ($q) {
                    $q->whereNull('order_status')
                      ->orWhere(function ($sub) {
                          $sub->where('order_status', 'not like', '%Batal%')
                              ->where('order_status', 'not like', '%RJ%')
                              ->where('order_status', 'not like', '%Retur%');
                      });
                })
                ->whereNotNull('sku_utama')
                ->whereNotIn('sku_utama', $invalidSkus)
                ->whereRaw("TRIM(sku_utama) != '' AND TRIM(sku_utama) != '0' AND TRIM(sku_utama) != '-' AND TRIM(sku_utama) != '--' AND TRIM(sku_utama) != '@' AND LOWER(TRIM(sku_utama)) NOT IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku')");

            if (! empty($dateFrom)) {
                $subQuery->where('order_date', '>=', $dateFrom . ' 00:00:00');
            }
            if (! empty($dateTo)) {
                $subQuery->where('order_date', '<=', $dateTo . ' 23:59:59');
            }

            $subQuery->groupBy('sku_utama');
            $periodSalesSub = $subQuery;

            try {
                $summarySales = DB::table('cut_off_orders')
                    ->where(function ($q) {
                        $q->where('channel', 'SH')
                          ->orWhere('channel', 'like', 'SH%');
                    })
                    ->where(function ($q) {
                        $q->whereNull('order_status')
                          ->orWhere(function ($sub) {
                              $sub->where('order_status', 'not like', '%Batal%')
                                  ->where('order_status', 'not like', '%RJ%')
                                  ->where('order_status', 'not like', '%Retur%');
                          });
                    })
                    ->whereNotNull('sku_utama')
                    ->whereNotIn('sku_utama', $invalidSkus)
                    ->whereRaw("TRIM(sku_utama) != '' AND TRIM(sku_utama) != '0' AND TRIM(sku_utama) != '-' AND TRIM(sku_utama) != '--' AND TRIM(sku_utama) != '@' AND LOWER(TRIM(sku_utama)) NOT IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku')");

                if (! empty($dateFrom)) {
                    $summarySales->where('order_date', '>=', $dateFrom . ' 00:00:00');
                }
                if (! empty($dateTo)) {
                    $summarySales->where('order_date', '<=', $dateTo . ' 23:59:59');
                }

                $salesStats = $summarySales->selectRaw('COALESCE(SUM(qty), 0) as total_sold, COUNT(DISTINCT sku_utama) as total_skus')->first();
                $totalPeriodSales = (int) ($salesStats->total_sold ?? 0);
                $periodSalesCount = (int) ($salesStats->total_skus ?? 0);
            } catch (\Throwable $e) {
                // Abaikan jika query ringkasan bermasalah
            }
        }

        $qStats = ShopeeProduct::query();
        if ($account) {
            $qStats->where('shopee_account_id', $account->id);
        }
        $summaryStats = $qStats->selectRaw('
            COUNT(*) as total_skus,
            COALESCE(SUM(stock), 0) as total_stock,
            COALESCE(SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END), 0) as in_stock_skus,
            COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock_skus,
            COALESCE(SUM(CASE WHEN sales > 0 THEN 1 ELSE 0 END), 0) as has_sales_skus,
            COALESCE(SUM(sales), 0) as total_sales,
            MAX(last_synced_at) as last_synced_at
        ')->first();

        $totalSkus      = (int) ($summaryStats->total_skus ?? 0);
        $totalStock     = (int) ($summaryStats->total_stock ?? 0);
        $inStockSkus    = (int) ($summaryStats->in_stock_skus ?? 0);
        $outOfStockSkus = (int) ($summaryStats->out_of_stock_skus ?? 0);
        $hasSalesSkus   = $periodSalesCount > 0 ? $periodSalesCount : (int) ($summaryStats->has_sales_skus ?? 0);
        $totalSales     = $totalPeriodSales > 0 ? $totalPeriodSales : (int) ($summaryStats->total_sales ?? 0);
        $lastSyncedAt   = $summaryStats->last_synced_at ?? null;

        // 4. Query Paginasi 50 Item
        $query = ShopeeProduct::query();
        if ($account) {
            $query->where('shopee_products.shopee_account_id', $account->id);
        }

        if ($periodSalesSub) {
            $query->leftJoinSub($periodSalesSub, 'period_sales_sub', function ($join) {
                $join->on('shopee_products.sku', '=', 'period_sales_sub.sku_utama')
                     ->whereRaw("shopee_products.sku IS NOT NULL AND TRIM(shopee_products.sku) != '' AND TRIM(shopee_products.sku) != '0' AND TRIM(shopee_products.sku) != '-' AND TRIM(shopee_products.sku) != '--' AND TRIM(shopee_products.sku) != '@' AND LOWER(TRIM(shopee_products.sku)) NOT IN ('null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku')");
            });
            $query->select('shopee_products.*', DB::raw('COALESCE(period_sales_sub.period_sales, 0) as period_sales'));
        } else {
            $query->select('shopee_products.*', DB::raw('COALESCE(shopee_products.sales, 0) as period_sales'));
        }

        // Apply Search
        if (! empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('shopee_products.sku', 'like', "%{$search}%")
                  ->orWhere('shopee_products.item_name', 'like', "%{$search}%")
                  ->orWhere('shopee_products.model_name', 'like', "%{$search}%")
                  ->orWhere('shopee_products.item_id', 'like', "%{$search}%");
            });
        }

        // Apply Stock & Sales Filter
        if ($stockStatus === 'in_stock') {
            $query->where('shopee_products.stock', '>', 0);
        } elseif ($stockStatus === 'out_of_stock') {
            $query->where('shopee_products.stock', '<=', 0);
        } elseif ($stockStatus === 'has_sales') {
            if ($periodSalesSub) {
                $query->whereRaw('COALESCE(period_sales_sub.period_sales, 0) > 0');
            } else {
                $query->where('shopee_products.sales', '>', 0);
            }
        } elseif ($stockStatus === 'no_sales') {
            if ($periodSalesSub) {
                $query->whereRaw('COALESCE(period_sales_sub.period_sales, 0) <= 0');
            } else {
                $query->where(function ($q) {
                    $q->whereNull('shopee_products.sales')->orWhere('shopee_products.sales', '<=', 0);
                });
            }
        } elseif ($stockStatus === 'discrepancy') {
            $query->whereIn('shopee_products.id', ! empty($discrepancyIds) ? $discrepancyIds : [-1]);
        } elseif ($stockStatus === 'matched') {
            $query->whereIn('shopee_products.id', ! empty($matchedIds) ? $matchedIds : [-1]);
        } elseif ($stockStatus === 'oos_critical') {
            $query->whereIn('shopee_products.id', ! empty($criticalOosIds) ? $criticalOosIds : [-1]);
        } elseif ($stockStatus === 'gudang_ready') {
            $query->whereIn('shopee_products.id', ! empty($gudangReadyIds) ? $gudangReadyIds : [-1]);
        } elseif ($stockStatus === 'campaign_unlocked') {
            $query->whereIn('shopee_products.id', ! empty($campaignUnlockedIds) ? $campaignUnlockedIds : [-1]);
        } elseif ($stockStatus === 'campaign_locked') {
            $query->whereIn('shopee_products.id', ! empty($campaignLockedIds) ? $campaignLockedIds : [-1]);
        }

        // Apply Sorting
        switch ($sort) {
            case 'sales_desc':
                $query->orderBy('period_sales', 'desc')->orderBy('shopee_products.stock', 'desc');
                break;
            case 'sales_asc':
                $query->orderBy('period_sales', 'asc')->orderBy('shopee_products.stock', 'asc');
                break;
            case 'stock_asc':
                $query->orderBy('shopee_products.stock', 'asc')->orderBy('shopee_products.sku', 'asc');
                break;
            case 'sku_asc':
                $query->orderBy('shopee_products.sku', 'asc');
                break;
            case 'name_asc':
                $query->orderBy('shopee_products.item_name', 'asc');
                break;
            case 'stock_desc':
            default:
                $query->orderBy('shopee_products.stock', 'desc')->orderBy('shopee_products.sku', 'asc');
                break;
        }

        $products = $query->paginate(50)->withQueryString();

        // 5. Lampirkan hasil komparasi stok gudang dari array lookup instan O(1) & sales periode
        $products->getCollection()->transform(function ($p) use ($stockInfoById) {
            $skuTrimmed = trim((string) ($p->sku ?? ''));
            $isInvalidSku = empty($skuTrimmed)
                || in_array(strtolower($skuTrimmed), ['0', '-', '--', '---', '@', '.', 'null', 'undefined', 'none', 'n/a', 'na', 'tanpa sku'], true);

            if ($isInvalidSku) {
                $p->sales = 0;
                $p->period_sales = 0;
            } else {
                $p->sales = (int) ($p->period_sales ?? $p->sales ?? 0);
            }

            if (! empty($stockInfoById) && isset($stockInfoById[$p->id])) {
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
            \Illuminate\Support\Facades\Cache::store('file')->put('shopee_stock_alert_queue', $stockWorkQueue, 120);
        } catch (\Throwable $e) {
            // Abaikan error cache file pada environment hosting terbatas
        }

        $isSuperAdmin = $request->user()?->isSuperAdmin() ?? false;

        return Inertia::render('Shopee/Products', [
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
                'total_period_sales'      => $totalPeriodSales,
                'period_sales_count'      => $periodSalesCount,
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
            'workQueue' => $isSuperAdmin ? $stockWorkQueue : ['items' => [], 'total' => 0, 'critical' => 0],
            'account'  => $account ? [
                'id'           => $account->id,
                'account_name' => $account->account_name,
                'shop_id'      => $account->shop_id,
                'is_connected' => $account->isConnected() && ! empty($account->access_token),
            ] : null,
        ]);
    }

    /**
     * Trigger API sync from Shopee to update products, SKU, and Stock.
     */
    public function sync(Request $request): \Illuminate\Http\RedirectResponse
    {
        @ini_set('max_execution_time', '900');
        @set_time_limit(900);

        $account = ShopeeAccount::where('status', 'active')->whereNotNull('access_token')->first();

        if (! $account) {
            return back()->with('error', 'Toko Shopee belum terhubung dengan token aktif. Buka menu Integrasi Shopee untuk menghubungkan toko.');
        }

        try {
            $result = $this->syncService->syncProductsFromShopee($account);
            self::clearAuditCache($account->id);
            return back()->with('success', $result['message']);
        } catch (\Throwable $e) {
            return back()->with('error', 'Gagal menyinkronkan produk Shopee: ' . $e->getMessage());
        }
    }

    /**
     * Export products to CSV file.
     */
    public function export(Request $request): StreamedResponse
    {
        $search      = trim((string) $request->input('search', ''));
        $stockStatus = (string) $request->input('stock_status', 'all');
        $sort        = (string) $request->input('sort', 'stock_desc');

        $query = ShopeeProduct::query();

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
                $query->orderBy('stock', 'asc')->orderBy('sku', 'asc');
                break;
            case 'sku_asc':
                $query->orderBy('sku', 'asc');
                break;
            case 'name_asc':
                $query->orderBy('item_name', 'asc');
                break;
            case 'stock_desc':
            default:
                $query->orderBy('stock', 'desc')->orderBy('sku', 'asc');
                break;
        }

        $filename = 'stok_produk_shopee_' . date('Y-m-d_His') . '.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            // Write UTF-8 BOM for Excel
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'NO',
                'SKU',
                'NAMA PRODUK',
                'VARIASI / MODEL',
                'STOK TERSEDIA',
                'STOK TERKUNCI',
                'HARGA (RP)',
                'STATUS',
                'ITEM ID',
                'MODEL ID',
                'TERAKHIR SINKRON',
            ]);

            $no = 1;
            $query->chunk(200, function ($products) use ($handle, &$no) {
                foreach ($products as $p) {
                    fputcsv($handle, [
                        $no++,
                        $p->sku ?: '—',
                        $p->item_name,
                        $p->model_name ?: 'Single (Tanpa Variasi)',
                        $p->stock,
                        $p->reserved_stock,
                        $p->price,
                        $p->item_status,
                        $p->item_id,
                        $p->model_id ?: '—',
                        $p->last_synced_at ? $p->last_synced_at->format('Y-m-d H:i:s') : '—',
                    ]);
                }
            });

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * Compare internal warehouse stock (uploaded from Excel) against Shopee products stock.
     */
    public function compareStock(Request $request): JsonResponse
    {
        $this->syncService->ensureProductSchema();

        $account = ShopeeAccount::where('status', 'active')->first() ?? ShopeeAccount::first();
        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung di sistem ERP.',
            ], 422);
        }

        $items = $request->input('items', []);
        if (empty($items) || ! is_array($items)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Data baris Excel tidak ditemukan atau kosong.',
            ], 422);
        }

        // Ambil seluruh produk Shopee untuk akun ini
        $shopeeProducts = ShopeeProduct::where('shopee_account_id', $account->id)->get();

        // Buat map lookup berdasarkan SKU Shopee dan kode barang internal 8 digit
        $productMap = [];
        $codeMap    = [];

        foreach ($shopeeProducts as $p) {
            if (! empty($p->sku)) {
                $norm = strtoupper(trim($p->sku));
                $productMap[$norm] = $p;

                // 1. Ekstrak kode angka setelah underscore (misal: "..._01247938")
                if (preg_match('/_(\d{6,8})(?:\D|$)/i', $norm, $m)) {
                    $codeMap[$m[1]] = $p;
                    $codeMap[ltrim($m[1], '0')] = $p;
                }
                // 2. Ekstrak kode barang 7-8 digit mana saja di SKU
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

            // Pencarian fleksibel: exact SKU -> kode barang internal (dengan/tanpa leading zero)
            $matchedProduct = $productMap[$normSku]
                ?? $codeMap[$normSku]
                ?? ($codeMap[ltrim($normSku, '0')] ?? null)
                ?? null;

            if (! $matchedProduct && preg_match('/(?:\D|^)(\d{7,8})(?:\D|$)/', $normSku, $m)) {
                $matchedProduct = $codeMap[$m[1]] ?? ($codeMap[ltrim($m[1], '0')] ?? null);
            }

            if ($matchedProduct) {
                $shopeeStock   = (int) $matchedProduct->stock;
                $reservedStock = (int) $matchedProduct->reserved_stock;
                $diff          = $warehouseStock - $shopeeStock;

                // Status Audit:
                // 1. CRITICAL: Stok gudang 0, tapi di Shopee masih > 0 (Bahaya Overselling!)
                // 2. LOW_STOCK: Stok gudang menipis (1 s/d 3 pcs)
                // 3. DISCREPANCY: Selisih stok gudang != shopee
                // 4. MATCHED: Stok gudang sama persis dengan shopee
                if ($warehouseStock <= 0 && $shopeeStock > 0) {
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
                    'id'              => $matchedProduct->id,
                    'item_id'         => $matchedProduct->item_id,
                    'model_id'        => $matchedProduct->model_id,
                    'sku'             => $matchedProduct->sku ?: $rawSku,
                    'item_name'       => $matchedProduct->item_name,
                    'model_name'      => $matchedProduct->model_name,
                    'warehouse_stock' => $warehouseStock,
                    'shopee_stock'    => $shopeeStock,
                    'reserved_stock'  => $reservedStock,
                    'diff'            => $diff,
                    'status'          => $status,
                    'is_shopee_found' => true,
                ];
            } else {
                $unmatchedCount++;
                $comparisonList[] = [
                    'id'              => null,
                    'item_id'         => null,
                    'model_id'        => null,
                    'sku'             => $rawSku,
                    'item_name'       => 'SKU Tidak Terdaftar di Toko Shopee',
                    'model_name'      => null,
                    'warehouse_stock' => $warehouseStock,
                    'shopee_stock'    => 0,
                    'reserved_stock'  => 0,
                    'diff'            => $warehouseStock,
                    'status'          => 'UNMATCHED',
                    'is_shopee_found' => false,
                ];
            }
        }

        // Urutkan prioritas audit: CRITICAL (1), LOW_STOCK (2), DISCREPANCY (3), UNMATCHED (4), MATCHED (5)
        $priorityOrder = [
            'CRITICAL'    => 1,
            'LOW_STOCK'   => 2,
            'DISCREPANCY' => 3,
            'UNMATCHED'   => 4,
            'MATCHED'     => 5,
        ];

        usort($comparisonList, function ($a, $b) use ($priorityOrder) {
            $pA = $priorityOrder[$a['status']] ?? 99;
            $pB = $priorityOrder[$b['status']] ?? 99;
            if ($pA !== $pB) {
                return $pA <=> $pB;
            }
            return strcmp((string)$a['sku'], (string)$b['sku']);
        });

        return response()->json([
            'status'  => 'success',
            'summary' => [
                'total_rows'        => count($comparisonList),
                'critical_count'    => $criticalCount,
                'low_stock_count'   => $lowStockCount,
                'discrepancy_count' => $discrepancyCount,
                'matched_count'     => $matchedCount,
                'unmatched_count'   => $unmatchedCount,
            ],
            'items'   => $comparisonList,
        ]);
    }

    /**
     * Compare Shopee products stock directly against Master Stock (Gudang G & Gudang A) from database.
     * Includes:
     * - Lapis 1: Safety Guard (Proteksi SKU salah/tidak terdaftar agar tidak sembarangan dikosongkan)
     * - Lapis 2: Smart Fallback (Pencocokan Cerdas otomatis via Nama Artikel, Ukuran & Warna)
     * - Lapis 3: Manual Mapping (Mendukung manual_item_code yang disimpan admin)
     */
    public function compareWithMaster(Request $request): JsonResponse
    {
        $this->syncService->ensureProductSchema();

        $account = ShopeeAccount::where('status', 'active')->first() ?? ShopeeAccount::first();
        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung di sistem ERP.',
            ], 422);
        }

        $warehouse = strtoupper(trim((string) $request->input('warehouse', 'ALL')));

        if (! \Illuminate\Support\Facades\Schema::hasTable('master_stocks')) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Belum ada data Master Stok di database. Silakan upload laporan stok di menu Master Stok terlebih dahulu.',
            ], 422);
        }

        $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs')->get();

        if ($masterStocks->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Belum ada data Master Stok di database. Silakan upload laporan stok di menu Master Stok terlebih dahulu.',
            ], 422);
        }

        $maps = $this->buildMasterStockMaps($masterStocks);
        $shopeeProducts = ShopeeProduct::where('shopee_account_id', $account->id)->get();

        $comparisonList   = [];
        $criticalCount    = 0;
        $lowStockCount    = 0;
        $discrepancyCount = 0;
        $matchedCount     = 0;
        $unmatchedCount   = 0;

        foreach ($shopeeProducts as $p) {
            $info = $this->resolveProductStockInfoFast(
                $p,
                $maps['masterByCode'],
                $maps['gMap'],
                $maps['aMap'],
                $maps['aPrefixMap'],
                $maps['smartIndex'],
                $warehouse
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
                'shopee_stock'         => $info['shopee_stock'],
                'reserved_stock'       => $info['reserved_stock'],
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
                'is_shopee_found'      => true,
            ];
        }

        $priorityOrder = [
            'UNMATCHED'   => 1, // Letakkan kode yang butuh perhatian admin di paling atas
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
     * Build indexed lookup maps and O(1) smart index for Master Stocks in a single linear pass.
     */
    public function buildMasterStockMaps($masterStocks): array
    {
        $gMap = [];
        $aMap = [];
        $aPrefixMap = [];
        $masterByCode = [];
        $smartIndex = [];

        foreach ($masterStocks as $ms) {
            $code = strtoupper(trim((string) $ms->item_code));
            if ($code === '') {
                continue;
            }

            $unpadded = ltrim($code, '0');
            $padded8  = str_pad($unpadded !== '' ? $unpadded : $code, 8, '0', STR_PAD_LEFT);

            if (! isset($masterByCode[$code])) {
                $masterByCode[$code] = $ms;
            }
            if ($unpadded !== '' && ! isset($masterByCode[$unpadded])) {
                $masterByCode[$unpadded] = $ms;
            }
            if (! isset($masterByCode[$padded8])) {
                $masterByCode[$padded8] = $ms;
            }

            if ($ms->warehouse === 'G') {
                $gMap[$code] = ($gMap[$code] ?? 0) + (int) $ms->qty_pcs;
                if ($unpadded !== '') {
                    $gMap[$unpadded] = ($gMap[$unpadded] ?? 0) + (int) $ms->qty_pcs;
                }
                $gMap[$padded8] = ($gMap[$padded8] ?? 0) + (int) $ms->qty_pcs;
            } elseif ($ms->warehouse === 'A') {
                $aMap[$code] = ($aMap[$code] ?? 0) + (int) $ms->qty_pcs;
                if ($unpadded !== '') {
                    $aMap[$unpadded] = ($aMap[$unpadded] ?? 0) + (int) $ms->qty_pcs;
                }
                $aMap[$padded8] = ($aMap[$padded8] ?? 0) + (int) $ms->qty_pcs;

                if (strlen($padded8) >= 6) {
                    $prefix = substr($padded8, 0, 6);
                    $aPrefixMap[$prefix] = ($aPrefixMap[$prefix] ?? 0) + (int) $ms->qty_pcs;
                }
                if (strlen($code) >= 6) {
                    $prefix = substr($code, 0, 6);
                    $aPrefixMap[$prefix] = ($aPrefixMap[$prefix] ?? 0) + (int) $ms->qty_pcs;
                }
            }

            // Index for O(1) Smart Candidate lookup: key = ARTICLE_SIZE
            $nameUpper = strtoupper(trim((string) $ms->item_name));
            if (preg_match('/[\s\-_](2[0-9]|3[0-9]|4[0-9]|5[0-9])$/', $nameUpper, $sm)) {
                $size = $sm[1];
                $article = $this->extractArticleKeyword('', $nameUpper);
                if ($article) {
                    $key = $article . '_' . $size;
                    $exists = false;
                    if (isset($smartIndex[$key])) {
                        foreach ($smartIndex[$key] as $existing) {
                            if ($existing->item_code === $ms->item_code) {
                                $exists = true;
                                break;
                            }
                        }
                    }
                    if (! $exists) {
                        $smartIndex[$key][] = $ms;
                    }
                }
            }
        }

        return [
            'masterByCode' => $masterByCode,
            'gMap'         => $gMap,
            'aMap'         => $aMap,
            'aPrefixMap'   => $aPrefixMap,
            'smartIndex'   => $smartIndex,
        ];
    }

    /**
     * Fast O(1) resolution of stock info using pre-indexed smart dictionary.
     */
    public function resolveProductStockInfoFast(
        ShopeeProduct $p,
        array &$masterByCode,
        array &$gMap,
        array &$aMap,
        array &$aPrefixMap,
        array &$smartIndex,
        string $warehouse = 'ALL'
    ): array {
        $normSku = strtoupper(trim((string) $p->sku));

        // 1. Cek manual mapping admin atau deteksi kode angka internal dari SKU
        $manualCode = strtoupper(trim((string) ($p->manual_item_code ?? '')));
        $internalCode = null;
        $matchType = 'EXACT_CODE';
        $warningMessage = null;
        $suggestedCode = null;
        $suggestedName = null;
        $isSafeToZero = true;

        if (! empty($manualCode)) {
            $internalCode = $manualCode;
            $matchType = 'MANUAL_MAPPED';
        } elseif (preg_match('/_(\d{6,8})(?:\D|$)/i', $normSku, $m)) {
            $internalCode = $m[1];
        } elseif (preg_match('/(?:\D|^)(\d{8})(?:\D|$)/', $normSku, $m)) {
            $internalCode = $m[1];
        } elseif (preg_match('/(?:\D|^)(\d{7})(?:\D|$)/', $normSku, $m)) {
            $internalCode = $m[1];
        }

        $paddedCode = $internalCode ? str_pad($internalCode, 8, '0', STR_PAD_LEFT) : null;
        $unpaddedCode = $internalCode ? ltrim($internalCode, '0') : null;

        $exactItem = $internalCode
            ? ($masterByCode[$internalCode] ?? $masterByCode[$paddedCode] ?? ($unpaddedCode !== '' ? ($masterByCode[$unpaddedCode] ?? null) : null))
            : null;

        if (! empty($exactItem)) {
            // Kode barang cocok di Master Stok!
            // Sesuai aturan: "Beda artikel tidak apa-apa, yang penting kode barang di SKU terdeteksi di master stok"
            if ($matchType !== 'MANUAL_MAPPED') {
                $matchType = 'EXACT_CODE';
            }
            $isSafeToZero = true;
            $warningMessage = null;
        } else {
            // Kode belum ketemu langsung, coba cari smart fallback via nama artikel & ukuran
            $cleanSku = preg_replace('/_\d+$/', '', $normSku);
            $expectedSize = null;
            if (preg_match('/[-_ ](2[0-9]|3[0-9]|4[0-9]|5[0-9])$/', $cleanSku, $sm)) {
                $expectedSize = $sm[1];
            } elseif ($p->model_name && preg_match('/(2[0-9]|3[0-9]|4[0-9]|5[0-9])/', (string) $p->model_name, $sm)) {
                $expectedSize = $sm[1];
            }

            $articleKeyword = $this->extractArticleKeyword($cleanSku, (string) $p->item_name);
            $colorCode = $this->extractColorCode($cleanSku, (string) $p->model_name);

            $candidateFound = false;
            if ($articleKeyword && $expectedSize) {
                $key = $articleKeyword . '_' . $expectedSize;
                $candidates = $smartIndex[$key] ?? [];
                if (! empty($candidates)) {
                    $candidate = $this->pickBestCandidate($candidates, $colorCode);
                    if ($candidate) {
                        $suggestedCode = $candidate->item_code;
                        $suggestedName = $candidate->item_name;
                        $matchType = 'SMART_MATCH';
                        $internalCode = $candidate->item_code;
                        $paddedCode = str_pad($internalCode, 8, '0', STR_PAD_LEFT);
                        $unpaddedCode = ltrim($internalCode, '0');
                        $isSafeToZero = true;
                        $warningMessage = "Saran Otomatis: Cocok ke {$candidate->item_code} ({$candidate->item_name})";
                        $candidateFound = true;
                    }
                }
            }

            if (! $candidateFound) {
                $matchType = $internalCode ? 'CODE_NOT_FOUND' : 'NO_CODE';
                $warningMessage = $internalCode
                    ? "Kode {$internalCode} belum terdaftar di Master Stok Gudang"
                    : "SKU belum mencantumkan kode barang";
                $isSafeToZero = true;
            }
        }

        // 4. Hitung stok fisik gudang (Gudang G + Gudang A)
        $stockG = 0;
        $stockA = 0;

        if ($internalCode) {
            $stockG = $gMap[$internalCode] ?? $gMap[$paddedCode] ?? ($unpaddedCode !== '' ? ($gMap[$unpaddedCode] ?? 0) : 0);
            $stockA = $aMap[$internalCode] ?? $aMap[$paddedCode] ?? ($unpaddedCode !== '' ? ($aMap[$unpaddedCode] ?? 0) : 0);

            if ($stockA === 0 && strlen($internalCode) >= 6) {
                $prefix = substr($paddedCode, 0, 6);
                $stockA = $aMap[$prefix . '00'] ?? ($aPrefixMap[$prefix] ?? 0);
            }
        } elseif (isset($gMap[$normSku])) {
            $stockG = $gMap[$normSku];
        }

        if ($warehouse === 'G') {
            $warehouseStock = $stockG;
        } elseif ($warehouse === 'A') {
            $warehouseStock = $stockA;
        } else {
            $warehouseStock = $stockG + $stockA;
        }

        $shopeeStock   = (int) $p->stock;
        $reservedStock = (int) $p->reserved_stock;
        $diff          = $warehouseStock - $shopeeStock;
        $wasCampaignLocked = (bool) ($p->was_campaign_locked ?? false);

        // Evaluasi kondisi OOS Kritis & Campaign Promo Lock
        $isCriticalOos = false;
        $isCampaignLocked = false;
        $isCampaignUnlocked = false;

        if ($warehouseStock <= 0) {
            if ($wasCampaignLocked && $shopeeStock > 0) {
                // Kuota promosi selesai dan terbuka kembali menjadi stok normal > 0
                $isCampaignUnlocked = true;
            } elseif ($shopeeStock > 0) {
                // Habis di gudang (A + G = 0), tapi masih ada stok yang dijual di Shopee -> Wajib Kosongkan!
                $isCriticalOos = true;
            } elseif ($reservedStock > 0 && $shopeeStock <= 0) {
                // Stok reguler sudah 0, tersisa kuota campaign promo yang terkunci
                $isCampaignLocked = true;
            }
        }

        // Tentukan status audit
        if ($warehouseStock <= 0 && $shopeeStock > 0) {
            $status = 'CRITICAL';
        } elseif ($matchType === 'CODE_NOT_FOUND' || $matchType === 'NO_CODE') {
            $status = 'UNMATCHED';
        } elseif ($warehouseStock > 0 && $warehouseStock <= 3) {
            $status = 'LOW_STOCK';
        } elseif ($diff !== 0) {
            $status = 'DISCREPANCY';
        } else {
            $status = 'MATCHED';
        }

        return [
            'warehouse_stock'      => $warehouseStock,
            'stock_g'              => $stockG,
            'stock_a'              => $stockA,
            'shopee_stock'         => $shopeeStock,
            'reserved_stock'       => $reservedStock,
            'diff'                 => $diff,
            'status'               => $status,
            'matched_code'         => $internalCode,
            'match_type'           => $matchType,
            'is_critical_oos'      => $isCriticalOos,
            'is_campaign_locked'   => $isCampaignLocked,
            'is_campaign_unlocked' => $isCampaignUnlocked,
            'suggested_code'       => $suggestedCode,
            'suggested_name'       => $suggestedName,
            'warning_message'      => $warningMessage,
            'is_safe_to_zero'      => $isSafeToZero,
        ];
    }

    /**
     * Pilih kandidat Master Stock terbaik berdasarkan kesesuaian warna dalam array yang sudah terfilter O(1).
     */
    public function pickBestCandidate(array $candidates, ?string $colorCode)
    {
        if (empty($candidates)) return null;
        if (count($candidates) === 1) return $candidates[0];

        $colorKeywordsMap = [
            'HP' => ['HITAM/PUTIH', 'HITAM-PUTIH', 'HTM/PTH'],
            'HH' => ['HITAM/HITAM', 'HITAM-HITAM', 'FULL BLACK'],
            'BO' => ['BR TUA/ORANYE', 'BIRU/ORANYE'],
            'BA' => ['BR TUA/ABU', 'BIRU/ABU'],
            'PH' => ['PUTIH/HITAM'],
            'MO' => ['MERAH/ORANYE'],
            'H'  => ['HITAM'],
            'P'  => ['PUTIH'],
        ];

        $targetKeywords = ($colorCode && isset($colorKeywordsMap[$colorCode])) ? $colorKeywordsMap[$colorCode] : [];
        $bestCandidate = $candidates[0];
        $highestScore = -1;

        foreach ($candidates as $c) {
            $score = 0;
            $nameUpper = strtoupper((string) $c->item_name);
            foreach ($targetKeywords as $kw) {
                if (str_contains($nameUpper, $kw)) {
                    $score += 10;
                    break;
                }
            }
            if ($score > $highestScore) {
                $highestScore = $score;
                $bestCandidate = $c;
            }
        }

        return $bestCandidate;
    }

    /**
     * Resolves master stock match, warehouse quantities, and audit status for a single ShopeeProduct.
     */
    public function resolveProductStockInfo(
        ShopeeProduct $p,
        array $masterByCode,
        array $gMap,
        array $aMap,
        array $aPrefixMap,
        $masterStocks,
        string $warehouse = 'ALL'
    ): array {
        $normSku = strtoupper(trim((string) $p->sku));

        // 1. Cek manual mapping admin
        $manualCode = strtoupper(trim((string) ($p->manual_item_code ?? '')));
        $internalCode = null;
        $matchType = 'EXACT_CODE';
        $warningMessage = null;
        $suggestedCode = null;
        $suggestedName = null;
        $isSafeToZero = true;

        if (! empty($manualCode)) {
            $internalCode = $manualCode;
            $matchType = 'MANUAL_MAPPED';
        } elseif (preg_match('/(\d{8})$/', $normSku, $m)) {
            $internalCode = $m[1];
        } elseif (preg_match('/_(\d{6,8})/i', $normSku, $m)) {
            $internalCode = $m[1];
        }

        // Ekstrak ukuran & artikel dari SKU untuk validasi typo
        $cleanSku = preg_replace('/_\d+$/', '', $normSku);
        $expectedSize = null;
        if (preg_match('/[-_ ](2[0-9]|3[0-9]|4[0-9]|5[0-9])$/', $cleanSku, $sm)) {
            $expectedSize = $sm[1];
        } elseif ($p->model_name && preg_match('/(2[0-9]|3[0-9]|4[0-9]|5[0-9])/', (string) $p->model_name, $sm)) {
            $expectedSize = $sm[1];
        }

        $articleKeyword = $this->extractArticleKeyword($cleanSku, (string) $p->item_name);
        $colorCode = $this->extractColorCode($cleanSku, (string) $p->model_name);

        $exactItem = $internalCode ? ($masterByCode[$internalCode] ?? null) : null;
        $hasTypo = false;

        if ($matchType !== 'MANUAL_MAPPED') {
            if ($exactItem && $expectedSize) {
                if (preg_match('/(2[0-9]|3[0-9]|4[0-9]|5[0-9])$/', (string) $exactItem->item_name, $im)) {
                    $actualSize = $im[1];
                    if ($actualSize !== $expectedSize) {
                        $hasTypo = true;
                        $matchType = 'SIZE_MISMATCH';
                        $warningMessage = "Ukuran SKU ({$expectedSize}) berbeda dengan data gudang ({$actualSize}): {$exactItem->item_name}";
                        $isSafeToZero = false;
                    }
                }
            } elseif (! $exactItem) {
                $hasTypo = true;
                $matchType = $internalCode ? 'CODE_NOT_FOUND' : 'NO_CODE';
                $warningMessage = $internalCode
                    ? "Kode {$internalCode} tidak terdaftar di Master Stok Gudang"
                    : "SKU tidak mencantumkan kode 8 digit internal";
                $isSafeToZero = false;
            }
        }

        // 3. Smart Fallback jika ada Typo / Kode Belum Ditemukan
        if ($hasTypo && $articleKeyword && $expectedSize && $masterStocks) {
            $candidate = $this->findSmartCandidate($masterStocks, $articleKeyword, $expectedSize, $colorCode);
            if ($candidate) {
                $suggestedCode = $candidate->item_code;
                $suggestedName = $candidate->item_name;
                $matchType = 'SMART_MATCH';
                $internalCode = $candidate->item_code;
                $isSafeToZero = true;
                $warningMessage = "Saran Otomatis: Cocok ke {$candidate->item_code} ({$candidate->item_name})";
            }
        }

        // 4. Hitung stok fisik gudang
        $stockG = 0;
        $stockA = 0;

        if ($internalCode) {
            $stockG = $gMap[$internalCode] ?? 0;
            $stockA = $aMap[$internalCode] ?? 0;

            if ($stockA === 0 && strlen($internalCode) >= 6) {
                $prefix = substr($internalCode, 0, 6);
                $stockA = $aMap[$prefix . '00'] ?? ($aPrefixMap[$prefix] ?? 0);
            }
        } elseif (isset($gMap[$normSku])) {
            $stockG = $gMap[$normSku];
        }

        if ($warehouse === 'G') {
            $warehouseStock = $stockG;
        } elseif ($warehouse === 'A') {
            $warehouseStock = $stockA;
        } else {
            $warehouseStock = $stockG + $stockA;
        }

        $shopeeStock   = (int) $p->stock;
        $reservedStock = (int) $p->reserved_stock;
        $diff          = $warehouseStock - $shopeeStock;
        $wasCampaignLocked = (bool) ($p->was_campaign_locked ?? false);

        // Evaluasi kondisi OOS Kritis & Campaign Promo Lock
        $isCriticalOos = false;
        $isCampaignLocked = false;
        $isCampaignUnlocked = false;

        if ($warehouseStock <= 0 && $isSafeToZero) {
            if ($wasCampaignLocked && $shopeeStock > 0) {
                // Kuota promosi selesai dan terbuka kembali menjadi stok normal > 0
                $isCampaignUnlocked = true;
            } elseif ($shopeeStock > 0) {
                // Habis di gudang, tapi masih ada stok yang dijual di Shopee
                $isCriticalOos = true;
            } elseif ($reservedStock > 0 && $shopeeStock <= 0) {
                // Stok reguler sudah 0, tersisa kuota campaign promo yang terkunci
                $isCampaignLocked = true;
            }
        }

        // Tentukan status audit
        if ($matchType === 'CODE_NOT_FOUND' || $matchType === 'NO_CODE') {
            $status = 'UNMATCHED';
        } elseif ($warehouseStock <= 0 && $shopeeStock > 0) {
            $status = 'CRITICAL';
        } elseif ($warehouseStock > 0 && $warehouseStock <= 3) {
            $status = 'LOW_STOCK';
        } elseif ($diff !== 0) {
            $status = 'DISCREPANCY';
        } else {
            $status = 'MATCHED';
        }

        return [
            'warehouse_stock'      => $warehouseStock,
            'stock_g'              => $stockG,
            'stock_a'              => $stockA,
            'shopee_stock'         => $shopeeStock,
            'reserved_stock'       => $reservedStock,
            'diff'                 => $diff,
            'status'               => $status,
            'matched_code'         => $internalCode,
            'match_type'           => $matchType,
            'is_critical_oos'      => $isCriticalOos,
            'is_campaign_locked'   => $isCampaignLocked,
            'is_campaign_unlocked' => $isCampaignUnlocked,
            'suggested_code'       => $suggestedCode,
            'suggested_name'       => $suggestedName,
            'warning_message'      => $warningMessage,
            'is_safe_to_zero'      => $isSafeToZero,
        ];
    }

    /**
     * Ekstrak kata kunci artikel dari SKU atau nama produk.
     */
    private function extractArticleKeyword(string $cleanSku, string $itemName): ?string
    {
        $parts = preg_split('/[-_ ]+/', $cleanSku);
        $ignore = [
            'RECORD', 'SPT', 'SEPATU', 'REC', 'SHOES', 'ANAK', 'PRIA', 'WANITA',
            'HITAM', 'PUTIH', 'MERAH', 'BIRU', 'ABU', 'KUNING', 'HIJAU', 'COKLAT',
            'HP', 'HH', 'BO', 'BA', 'PH', 'MO', 'H', 'P'
        ];

        foreach ($parts as $part) {
            $p = strtoupper(trim($part));
            if (strlen($p) >= 3 && ! in_array($p, $ignore, true) && ! preg_match('/^(2[0-9]|3[0-9]|4[0-9]|5[0-9])$/', $p)) {
                return $p;
            }
        }

        // Fallback dari nama produk
        $itemParts = preg_split('/[\s\-]+/', $itemName);
        foreach ($itemParts as $part) {
            $p = strtoupper(trim($part));
            if (strlen($p) >= 3 && ! in_array($p, $ignore, true) && ! preg_match('/^(2[0-9]|3[0-9]|4[0-9]|5[0-9])$/', $p)) {
                return $p;
            }
        }

        return null;
    }

    /**
     * Ekstrak kode warna dari SKU atau nama variasi.
     */
    private function extractColorCode(string $cleanSku, ?string $modelName): ?string
    {
        $validCodes = ['HP', 'HH', 'BO', 'BA', 'PH', 'MO', 'H', 'P'];
        $parts = preg_split('/[-_ ]+/', $cleanSku);
        foreach ($parts as $part) {
            $p = strtoupper(trim($part));
            if (in_array($p, $validCodes, true)) {
                return $p;
            }
        }

        if ($modelName) {
            $mUpper = strtoupper($modelName);
            if (str_contains($mUpper, 'HITAM') && str_contains($mUpper, 'PUTIH')) return 'HP';
            if (str_contains($mUpper, 'HITAM') && str_contains($mUpper, 'HITAM')) return 'HH';
            if (str_contains($mUpper, 'ORANYE')) return 'BO';
            if (str_contains($mUpper, 'ABU')) return 'BA';
        }

        return null;
    }

    /**
     * Cari kandidat Master Stock terbaik berdasarkan Artikel, Ukuran & Warna.
     */
    private function findSmartCandidate($masterStocks, string $articleKeyword, string $expectedSize, ?string $colorCode)
    {
        $colorKeywordsMap = [
            'HP' => ['HITAM/PUTIH', 'HITAM-PUTIH', 'HTM/PTH'],
            'HH' => ['HITAM/HITAM', 'HITAM-HITAM', 'FULL BLACK'],
            'BO' => ['BR TUA/ORANYE', 'BIRU/ORANYE'],
            'BA' => ['BR TUA/ABU', 'BIRU/ABU'],
            'PH' => ['PUTIH/HITAM'],
            'MO' => ['MERAH/ORANYE'],
            'H'  => ['HITAM'],
            'P'  => ['PUTIH'],
        ];

        $candidates = [];
        foreach ($masterStocks as $ms) {
            $nameUpper = strtoupper((string) $ms->item_name);
            $endsWithSize = str_ends_with($nameUpper, ' ' . $expectedSize)
                || str_ends_with($nameUpper, '-' . $expectedSize)
                || preg_match('/[\s\-]' . preg_quote($expectedSize, '/') . '$/', $nameUpper);

            if ($endsWithSize && str_contains($nameUpper, $articleKeyword)) {
                $candidates[] = $ms;
            }
        }

        if (empty($candidates)) return null;
        if (count($candidates) === 1) return $candidates[0];

        $targetKeywords = ($colorCode && isset($colorKeywordsMap[$colorCode])) ? $colorKeywordsMap[$colorCode] : [];
        $bestCandidate = $candidates[0];
        $highestScore = -1;

        foreach ($candidates as $c) {
            $score = 0;
            $nameUpper = strtoupper((string) $c->item_name);
            foreach ($targetKeywords as $kw) {
                if (str_contains($nameUpper, $kw)) {
                    $score += 10;
                    break;
                }
            }
            if ($score > $highestScore) {
                $highestScore = $score;
                $bestCandidate = $c;
            }
        }

        return $bestCandidate;
    }

    /**
     * Simpan mapping manual kode Master Stok ke produk Shopee secara permanen.
     */
    public function mapProduct(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => 'required|integer',
            'item_code'  => 'required|string|max:50',
        ]);

        $this->syncService->ensureProductSchema();

        $product = ShopeeProduct::findOrFail($validated['product_id']);
        $product->update([
            'manual_item_code' => strtoupper(trim($validated['item_code'])),
        ]);

        self::clearAuditCache($product->shopee_account_id);

        return response()->json([
            'status'  => 'success',
            'message' => "SKU Shopee '{$product->sku}' berhasil dihubungkan permanen dengan Kode Barang '{$validated['item_code']}'.",
        ]);
    }

    /**
     * Pencarian Master Stok untuk modal mapping manual.
     */
    public function searchMasterStock(Request $request): JsonResponse
    {
        $q = strtoupper(trim((string) $request->input('q', '')));

        if (! \Illuminate\Support\Facades\Schema::hasTable('master_stocks')) {
            return response()->json(['status' => 'success', 'data' => []]);
        }

        $items = MasterStock::query()
            ->when($q, function ($query, $q) {
                $query->where('item_code', 'like', "%{$q}%")
                      ->orWhere('item_name', 'like', "%{$q}%");
            })
            ->select('item_code', 'item_name', 'warehouse', DB::raw('SUM(qty_pcs) as total_pcs'))
            ->groupBy('item_code', 'item_name', 'warehouse')
            ->orderBy('item_name', 'asc')
            ->limit(25)
            ->get();

        return response()->json([
            'status' => 'success',
            'data'   => $items,
        ]);
    }

    /**
     * Set stock to 0 on Shopee via API update_stock for selected products.
     * Mengosongkan stok di Shopee (Open API) dan menyinkronkan stok lokal ERP menjadi 0.
     */
    public function zeroOut(Request $request): JsonResponse
    {
        $account = ShopeeAccount::where('status', 'active')->whereNotNull('access_token')->first()
            ?? ShopeeAccount::whereNotNull('access_token')->first()
            ?? ShopeeAccount::first();

        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung di sistem ERP.',
            ], 422);
        }

        $productIds = $request->input('product_ids', []);
        if (empty($productIds) || ! is_array($productIds)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Pilih setidaknya 1 produk untuk dikosongkan.',
            ], 422);
        }

        $validProducts = ShopeeProduct::whereIn('id', array_map('intval', $productIds))->get();
        if ($validProducts->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Produk yang dipilih tidak ditemukan di database.',
            ], 422);
        }

        $safeIds = $validProducts->pluck('id')->all();
        $updatedCount = 0;
        $failures = [];
        $msg = '';

        // 1. Jika terhubung ke Shopee Open API dengan token aktif, eksekusi pembaruan stok ke marketplace
        if ($account->isConnected() && ! empty($account->access_token)) {
            try {
                $res = $this->syncService->zeroOutShopeeProducts($account, $safeIds);
                $updatedCount = $res['updated_count'];
                $failures = $res['failures'];
                $msg = $res['message'];
            } catch (\Throwable $e) {
                Log::warning('[ZeroOutShopee] API Shopee error: ' . $e->getMessage());
                $msg = 'Stok lokal berhasil dikosongkan. API Shopee: ' . $e->getMessage();
            }
        } else {
            $msg = 'Stok berhasil dikosongkan di sistem ERP menjadi 0.';
        }

        // 2. Selalu update kuantitas stok di tabel lokal shopee_products menjadi 0
        ShopeeProduct::whereIn('id', $safeIds)->update([
            'stock'          => 0,
            'last_synced_at' => now(),
        ]);

        self::clearAuditCache($account->id);

        return response()->json([
            'status'        => 'success',
            'message'       => $msg ?: 'Berhasil mengosongkan stok produk terpilih.',
            'updated_count' => count($safeIds),
            'failures'      => $failures,
        ]);
    }

    /**
     * Ambil variasi produk berdasarkan item_id atau pencarian nama/sku.
     * Digunakan untuk modal Restock / Tambah Stok Cepat.
     */
    public function getProductVariants(Request $request): JsonResponse
    {
        $account = ShopeeAccount::where('status', 'active')->first() ?? ShopeeAccount::first();
        if (! $account) {
            return response()->json(['status' => 'error', 'message' => 'Toko Shopee belum terhubung.'], 422);
        }

        $itemId = $request->input('item_id');
        $q      = trim((string) $request->input('q', ''));

        if (empty($itemId) && empty($q)) {
            return response()->json(['status' => 'success', 'variants' => []]);
        }

        $keywords = preg_split('/[\s\-_,]+/', strtolower($q), -1, PREG_SPLIT_NO_EMPTY);
        $filler = ['record', 'sepatu', 'spt', 'shoes', 'anak', 'pria', 'wanita'];
        $cleanKeywords = array_values(array_filter($keywords, function ($k) use ($filler, $keywords) {
            return count($keywords) === 1 || ! in_array($k, $filler, true);
        }));
        if (empty($cleanKeywords)) {
            $cleanKeywords = $keywords;
        }

        $query = ShopeeProduct::where('shopee_account_id', $account->id);

        if (! empty($itemId)) {
            $query->where('item_id', $itemId);
        }

        if (! empty($cleanKeywords)) {
            $query->where(function ($sub) use ($cleanKeywords) {
                foreach ($cleanKeywords as $kw) {
                    $sub->where(function ($w) use ($kw) {
                        // 1. Pencocokan mutlak pada kolom SKU
                        $w->where('sku', 'like', "%{$kw}%")
                          // 2. Fallback HANYA jika SKU produk memang null / kosong di Shopee
                          ->orWhere(function ($fallback) use ($kw) {
                              $fallback->where(function ($emptyCheck) {
                                  $emptyCheck->whereNull('sku')->orWhere('sku', '');
                              })->where(function ($f2) use ($kw) {
                                  $f2->where('model_name', 'like', "%{$kw}%")
                                     ->orWhere('item_name', 'like', "%{$kw}%");
                              });
                          });
                    });
                }
            });
        }

        $products = $query->orderBy('item_name', 'asc')->orderBy('model_name', 'asc')->get();

        // Strict SKU Filter: Pastikan variasi yang muncul benar-benar memuat kata kunci pada SKU-nya.
        // Jika user mencari 'theon', hanya variasi dengan SKU 'RECORD-THEON-...' yang boleh muncul.
        // Variasi dengan SKU 'RECORD-CARSON-...' mutlak ditolak meskipun nama variasinya tertulis THEON-CARSON.
        if (! empty($cleanKeywords)) {
            $products = $products->filter(function ($p) use ($cleanKeywords) {
                $skuLower   = strtolower(trim((string) $p->sku));
                $modelLower = strtolower(trim((string) $p->model_name));

                foreach ($cleanKeywords as $kw) {
                    // Cek kode warna khusus (misal 'hitam' / 'putih' cocok dengan '-hp-' di SKU)
                    $matchesColorCode = ($kw === 'hitam' || $kw === 'putih') && (
                        str_contains($skuLower, '-hp-') || str_contains($skuLower, '_hp_') || str_contains($modelLower, 'hp')
                    );

                    // Jika keyword berupa angka ukuran (misal '30', '31'), boleh cocok di SKU atau model_name
                    $matchesSize = is_numeric($kw) && (str_contains($skuLower, $kw) || str_contains($modelLower, $kw));

                    // Jika ada SKU: SKU WAJIB memuat keyword (misal 'theon')
                    if (! empty($skuLower)) {
                        if (str_contains($skuLower, $kw) || $matchesColorCode || $matchesSize) {
                            continue;
                        }
                        // SKU tidak memuat keyword -> TOLAK!
                        return false;
                    }

                    // Fallback jika SKU kosong di Shopee
                    if (str_contains($modelLower, $kw) || str_contains(strtolower((string) $p->item_name), $kw)) {
                        continue;
                    }

                    return false;
                }

                return true;
            })->values();
        }

        // Ambil data stok gudang untuk referensi
        $hasMasterTable = \Illuminate\Support\Facades\Schema::hasTable('master_stocks');
        $maps = null;
        if ($hasMasterTable) {
            try {
                $masterStocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs')->get();
                if ($masterStocks->isNotEmpty()) {
                    $maps = $this->buildMasterStockMaps($masterStocks);
                }
            } catch (\Throwable $e) {}
        }

        $result = $products->map(function ($p) use ($maps) {
            $whStock = 0;
            $stockG = 0;
            $stockA = 0;
            $suggestedCode = null;

            if ($maps) {
                $info = $this->resolveProductStockInfoFast(
                    $p,
                    $maps['masterByCode'],
                    $maps['gMap'],
                    $maps['aMap'],
                    $maps['aPrefixMap'],
                    $maps['smartIndex']
                );
                $whStock = $info['warehouse_stock'];
                $stockG = $info['stock_g'];
                $stockA = $info['stock_a'];
                $suggestedCode = $info['matched_code'] ?? $info['suggested_code'];
            }

            return [
                'id'              => $p->id,
                'item_id'         => $p->item_id,
                'model_id'        => $p->model_id,
                'sku'             => $p->sku,
                'item_name'       => $p->item_name,
                'model_name'      => $p->model_name ?: 'Standar',
                'current_stock'   => (int) $p->stock,
                'reserved_stock'  => (int) $p->reserved_stock,
                'warehouse_stock' => $whStock,
                'stock_g'         => $stockG,
                'stock_a'         => $stockA,
                'matched_code'    => $suggestedCode,
            ];
        });

        return response()->json([
            'status'   => 'success',
            'variants' => $result,
        ]);
    }

    /**
     * Update kuantitas stok di Shopee via API Open Platform.
     * Mendukung update massal per variasi atau penambahan stok.
     */
    public function updateStock(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'updates'              => 'required|array|min:1',
            'updates.*.product_id' => 'required|integer',
            'updates.*.stock'      => 'required|integer|min:0|max:100000',
        ]);

        $account = ShopeeAccount::where('status', 'active')->whereNotNull('access_token')->first();
        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung dengan token aktif. Buka menu Integrasi Shopee.',
            ], 422);
        }

        try {
            $res = $this->syncService->updateShopeeProductsStock($account, $validated['updates']);
            if (! empty($res['success'])) {
                self::clearAuditCache($account->id);
            }
            return response()->json([
                'status'        => $res['success'] ? 'success' : 'error',
                'message'       => $res['message'],
                'updated_count' => $res['updated_count'],
                'failures'      => $res['failures'],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Gagal mengubah stok di Shopee: ' . $e->getMessage(),
            ], 500);
        }
    }
}

