<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Models\ShopeeProduct;
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

        // Buat map lookup berdasarkan SKU (case-insensitive & trimmed)
        $productMap = [];
        foreach ($shopeeProducts as $p) {
            if (! empty($p->sku)) {
                $productMap[strtoupper(trim($p->sku))] = $p;
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
            $matchedProduct = $productMap[$normSku] ?? null;

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

