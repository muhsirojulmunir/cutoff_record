<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Models\ShopeeProduct;
use App\Models\MasterStock;
use App\Services\ShopeeSyncService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ShopeeProductController extends Controller
{
    public function __construct(private readonly ShopeeSyncService $syncService) {}

    /**
     * Display page list of Shopee Products, SKU, and Stock.
     */
    public function index(Request $request): \Inertia\Response
    {
        $this->syncService->ensureProductSchema();

        $search      = trim((string) $request->input('search', ''));
        $stockStatus = (string) $request->input('stock_status', 'all');
        $sort        = (string) $request->input('sort', 'stock_desc');

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

        $query = ShopeeProduct::query();
        if ($account) {
            $query->where('shopee_account_id', $account->id);
        }

        // Summary Statistics
        $totalSkus        = (clone $query)->count();
        $totalStock       = (int) (clone $query)->sum('stock');
        $inStockSkus      = (clone $query)->where('stock', '>', 0)->count();
        $outOfStockSkus   = (clone $query)->where('stock', '<=', 0)->count();
        $lastSyncedAt     = (clone $query)->max('last_synced_at');

        // Apply Search
        if (! empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('sku', 'like', "%{$search}%")
                  ->orWhere('item_name', 'like', "%{$search}%")
                  ->orWhere('model_name', 'like', "%{$search}%")
                  ->orWhere('item_id', 'like', "%{$search}%");
            });
        }

        // Apply Stock Filter
        if ($stockStatus === 'in_stock') {
            $query->where('stock', '>', 0);
        } elseif ($stockStatus === 'out_of_stock') {
            $query->where('stock', '<=', 0);
        }

        // Apply Sorting
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

        $products = $query->paginate(50)->withQueryString();

        $masterStockSummary = [
            'total_g_items'    => MasterStock::where('warehouse', 'G')->count(),
            'total_g_pcs'      => (int) MasterStock::where('warehouse', 'G')->sum('qty_pcs'),
            'last_imported_g'  => MasterStock::where('warehouse', 'G')->max('last_imported_at'),
            'total_a_items'    => MasterStock::where('warehouse', 'A')->count(),
            'total_a_pcs'      => (int) MasterStock::where('warehouse', 'A')->sum('qty_pcs'),
            'last_imported_a'  => MasterStock::where('warehouse', 'A')->max('last_imported_at'),
            'has_master_stock' => MasterStock::exists(),
        ];

        return Inertia::render('Shopee/Products', [
            'products' => $products,
            'filters'  => [
                'search'       => $search,
                'stock_status' => $stockStatus,
                'sort'         => $sort,
            ],
            'summary'  => [
                'total_skus'        => $totalSkus,
                'total_stock'       => $totalStock,
                'in_stock_skus'     => $inStockSkus,
                'out_of_stock_skus' => $outOfStockSkus,
                'last_synced_at'    => $lastSyncedAt,
            ],
            'master_stock_summary' => $masterStockSummary,
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

                // 1. Ekstrak kode barang 8 digit di akhir SKU (misal: "RECORD-CARAVAN-HP-38_01247938" -> "01247938")
                if (preg_match('/(\d{8})$/', $norm, $m)) {
                    $codeMap[$m[1]] = $p;
                }
                // 2. Ekstrak kode angka setelah underscore (misal: "..._01247938")
                if (preg_match('/_(\d{6,8})/i', $norm, $m)) {
                    $codeMap[$m[1]] = $p;
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

            // Pencarian fleksibel: exact SKU -> kode barang internal -> regex suffix
            $matchedProduct = $productMap[$normSku]
                ?? $codeMap[$normSku]
                ?? null;

            if (! $matchedProduct && preg_match('/(\d{8})$/', $normSku, $m)) {
                $matchedProduct = $codeMap[$m[1]] ?? null;
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

        $masterStocksQuery = MasterStock::query();
        if (in_array($warehouse, ['A', 'G'])) {
            $masterStocksQuery->where('warehouse', $warehouse);
        }
        $masterStocks = $masterStocksQuery->get();

        if ($masterStocks->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Belum ada data Master Stok di database. Silakan upload laporan stok di menu Master Stok terlebih dahulu.',
            ], 422);
        }

        // Build lookup maps for fast matching
        $gMap = [];
        $aMap = [];
        $aPrefixMap = [];

        foreach ($masterStocks as $ms) {
            $code = strtoupper(trim((string) $ms->item_code));
            if ($ms->warehouse === 'G') {
                $gMap[$code] = ($gMap[$code] ?? 0) + (int) $ms->qty_pcs;
            } elseif ($ms->warehouse === 'A') {
                $aMap[$code] = ($aMap[$code] ?? 0) + (int) $ms->qty_pcs;
                if (strlen($code) >= 6) {
                    $prefix = substr($code, 0, 6);
                    $aPrefixMap[$prefix] = ($aPrefixMap[$prefix] ?? 0) + (int) $ms->qty_pcs;
                }
            }
        }

        $shopeeProducts = ShopeeProduct::where('shopee_account_id', $account->id)->get();

        $comparisonList   = [];
        $criticalCount    = 0;
        $lowStockCount    = 0;
        $discrepancyCount = 0;
        $matchedCount     = 0;

        foreach ($shopeeProducts as $p) {
            $normSku = strtoupper(trim((string) $p->sku));

            $internalCode = null;
            if (preg_match('/(\d{8})$/', $normSku, $m)) {
                $internalCode = $m[1];
            } elseif (preg_match('/_(\d{6,8})/i', $normSku, $m)) {
                $internalCode = $m[1];
            }

            $stockG = 0;
            $stockA = 0;

            if ($internalCode) {
                $stockG = $gMap[$internalCode] ?? 0;
                $stockA = $aMap[$internalCode] ?? 0;

                // Jika di Gudang A tidak ada kode ukuran spesifik, cari di prefix artikel (misal 01247900)
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
                // ALL: stok gabungan Gudang G (eceran) + Gudang A (grosir)
                $warehouseStock = $stockG + $stockA;
            }

            $shopeeStock   = (int) $p->stock;
            $reservedStock = (int) $p->reserved_stock;
            $diff          = $warehouseStock - $shopeeStock;

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
                'id'              => $p->id,
                'item_id'         => $p->item_id,
                'model_id'        => $p->model_id,
                'sku'             => $p->sku ?: '—',
                'item_name'       => $p->item_name,
                'model_name'      => $p->model_name,
                'warehouse_stock' => $warehouseStock,
                'stock_g'         => $stockG,
                'stock_a'         => $stockA,
                'shopee_stock'    => $shopeeStock,
                'reserved_stock'  => $reservedStock,
                'diff'            => $diff,
                'status'          => $status,
                'is_shopee_found' => true,
            ];
        }

        $priorityOrder = [
            'CRITICAL'    => 1,
            'LOW_STOCK'   => 2,
            'DISCREPANCY' => 3,
            'MATCHED'     => 4,
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
                'unmatched_count'   => 0,
            ],
            'items'     => $comparisonList,
            'source'    => 'MASTER_STOCK',
            'warehouse' => $warehouse,
        ]);
    }

    /**
     * Set stock to 0 on Shopee via API update_stock for selected products.
     */
    public function zeroOut(Request $request): JsonResponse
    {
        $account = ShopeeAccount::where('status', 'active')->whereNotNull('access_token')->first();

        if (! $account) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung dengan token aktif.',
            ], 422);
        }

        $productIds = $request->input('product_ids', []);
        if (empty($productIds) || ! is_array($productIds)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Pilih setidaknya 1 produk untuk dikosongkan.',
            ], 422);
        }

        try {
            $res = $this->syncService->zeroOutShopeeProducts($account, array_map('intval', $productIds));

            return response()->json([
                'status'        => $res['success'] ? 'success' : 'error',
                'message'       => $res['message'],
                'updated_count' => $res['updated_count'],
                'failures'      => $res['failures'],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Gagal mengosongkan stok di Shopee: ' . $e->getMessage(),
            ], 500);
        }
    }
}

