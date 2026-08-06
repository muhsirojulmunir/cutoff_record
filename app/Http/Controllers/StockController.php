<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

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
                // Baris ledger yang sudah dihapus tidak boleh ikut menentukan stok historis.
                ->whereNull('deleted_at')
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
                        ->whereNull('deleted_at')
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
     * Data stok untuk diexport.
     *
     * Dikembalikan sebagai JSON, lalu berkas .xlsx dirakit di peramban memakai
     * SheetJS yang sudah dipakai di modul lain. Dengan begitu hasil unduhannya
     * benar-benar Excel tanpa perlu menambah pustaka baru di sisi server.
     */
    public function export(Request $request): JsonResponse
    {
        Gate::authorize('stock.view');

        $search     = $request->input('search');
        $categoryId = $request->input('category_id');
        $date       = $request->input('date');

        $targetDateTime = $date ? Carbon::parse($date)->endOfDay() : null;

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
                // Baris ledger yang sudah dihapus tidak boleh ikut menentukan stok historis.
                ->whereNull('deleted_at')
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

        $stockLabel = $targetDateTime
            ? 'Stok Per ' . Carbon::parse($date)->format('d/m/Y')
            : 'Stok Real-time';

        $rows = $query->get()->map(fn ($p) => [
            'SKU'               => $p->sku,
            'Nama Produk'       => $p->name,
            'Kategori'          => $p->category?->name ?? '-',
            $stockLabel         => $targetDateTime ? (int) ($p->historical_stock ?? 0) : (int) $p->stock,
            'Tanggal Penarikan' => now()->format('d/m/Y H:i'),
        ]);

        $dateFormatted = $date ? Carbon::parse($date)->format('Ymd') : date('Ymd_His');

        return response()->json([
            'file_name'   => "stok_produk_{$dateFormatted}.xlsx",
            'sheet_name'  => 'All Stock',
            'module'      => 'All Stock',
            'description' => $date ? 'Stok per tanggal ' . $date : 'Stok real-time',
            'rows'        => $rows,
        ]);
    }
}
