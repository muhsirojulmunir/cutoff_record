<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockController extends Controller
{
    /**
     * Tampilkan daftar stok seluruh produk (All Stock),
     * mendukung penarikan historical stock per tanggal tertentu di masa lalu.
     */
    public function allStock(Request $request): Response
    {
        Gate::authorize('stock.view');

        $search     = $request->input('search');
        $categoryId = $request->input('category_id');
        $date       = $request->input('date'); // YYYY-MM-DD

        $query = Product::with('category:id,name')
            ->orderBy('sku');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        if ($categoryId) {
            $query->where('category_id', $categoryId);
        }

        // Subquery historical stock jika filter tanggal diisi
        $targetDateTime = $date ? Carbon::parse($date)->endOfDay() : null;

        if ($targetDateTime) {
            // Dapatkan movement terakhir pada atau sebelum tanggal target untuk tiap produk
            $lastMovements = DB::table('stock_movements')
                ->select('product_id', DB::raw('MAX(id) as max_id'))
                ->where('created_at', '<=', $targetDateTime)
                ->groupBy('product_id');

            $query->leftJoinSub($lastMovements, 'last_mov', 'last_mov.product_id', '=', 'products.id')
                ->leftJoin('stock_movements as sm', 'sm.id', '=', 'last_mov.max_id')
                ->select(
                    'products.*',
                    DB::raw('COALESCE(sm.stock_after, CASE WHEN products.created_at <= "' . $targetDateTime->toDateTimeString() . '" THEN products.stock ELSE 0 END) as historical_stock')
                );
        } else {
            $query->select('products.*');
        }

        $products = $query->paginate(25)->withQueryString();

        // Transform collection agar atribut stock sesuai (historical vs realtime)
        $products->getCollection()->transform(function ($p) use ($targetDateTime) {
            $effectiveStock = $targetDateTime ? (int) ($p->historical_stock ?? 0) : (int) $p->stock;
            return [
                'id'            => $p->id,
                'sku'           => $p->sku,
                'name'          => $p->name,
                'category_name' => $p->category?->name ?? '—',
                'stock'         => $effectiveStock,
                'photo_url'     => $p->photo_url,
            ];
        });

        // Calculate summary
        $totalProducts = Product::count();

        if ($targetDateTime) {
            // Total stok seluruh produk pada tanggal target
            $totalStockSum = DB::table('products')
                ->leftJoinSub(
                    DB::table('stock_movements')
                        ->select('product_id', DB::raw('MAX(id) as max_id'))
                        ->where('created_at', '<=', $targetDateTime)
                        ->groupBy('product_id'),
                    'last_mov',
                    'last_mov.product_id',
                    '=',
                    'products.id'
                )
                ->leftJoin('stock_movements as sm', 'sm.id', '=', 'last_mov.max_id')
                ->sum(DB::raw('COALESCE(sm.stock_after, CASE WHEN products.created_at <= "' . $targetDateTime->toDateTimeString() . '" THEN products.stock ELSE 0 END)'));
        } else {
            $totalStockSum = Product::sum('stock');
        }

        $categories = Category::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Stock/AllStock', [
            'products'   => $products,
            'categories' => $categories,
            'filters'    => $request->only('search', 'category_id', 'date'),
            'summary'    => [
                'total_products'       => $totalProducts,
                'total_physical_stock' => (int) $totalStockSum,
                'snapshot_date'        => $date ? Carbon::parse($date)->format('d/m/Y') : null,
            ],
        ]);
    }

    /**
     * Export seluruh data stok ke CSV / Excel (termasuk historical stock jika ada filter tanggal).
     */
    public function export(Request $request): StreamedResponse
    {
        Gate::authorize('stock.view');

        $search     = $request->input('search');
        $categoryId = $request->input('category_id');
        $date       = $request->input('date');

        $dateFormatted = $date ? Carbon::parse($date)->format('Ymd') : date('Ymd_His');
        $filename = "stok_produk_{$dateFormatted}.csv";

        return response()->stream(function () use ($search, $categoryId, $date) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['sep=,']); // CSV UTF-8 separator

            $targetDateTime = $date ? Carbon::parse($date)->endOfDay() : null;

            fputcsv($handle, [
                'SKU',
                'Nama Produk',
                'Kategori',
                $targetDateTime ? "Stok Per " . Carbon::parse($date)->format('d/m/Y') : 'Stok Real-time',
                'Tanggal Penarikan'
            ]);

            $query = Product::with('category:id,name')->orderBy('sku');

            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('sku', 'like', "%{$search}%");
                });
            }

            if ($categoryId) {
                $query->where('category_id', $categoryId);
            }

            if ($targetDateTime) {
                $lastMovements = DB::table('stock_movements')
                    ->select('product_id', DB::raw('MAX(id) as max_id'))
                    ->where('created_at', '<=', $targetDateTime)
                    ->groupBy('product_id');

                $query->leftJoinSub($lastMovements, 'last_mov', 'last_mov.product_id', '=', 'products.id')
                    ->leftJoin('stock_movements as sm', 'sm.id', '=', 'last_mov.max_id')
                    ->select(
                        'products.*',
                        DB::raw('COALESCE(sm.stock_after, CASE WHEN products.created_at <= "' . $targetDateTime->toDateTimeString() . '" THEN products.stock ELSE 0 END) as historical_stock')
                    );
            } else {
                $query->select('products.*');
            }

            $query->chunk(500, function ($rows) use ($handle, $targetDateTime) {
                foreach ($rows as $p) {
                    $stockVal = $targetDateTime ? (int) ($p->historical_stock ?? 0) : (int) $p->stock;
                    fputcsv($handle, [
                        $p->sku,
                        $p->name,
                        $p->category?->name ?? '-',
                        $stockVal,
                        now()->format('d/m/Y H:i')
                    ]);
                }
            });

            fclose($handle);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
