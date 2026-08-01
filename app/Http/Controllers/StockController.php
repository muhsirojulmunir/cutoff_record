<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\StockReservation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class StockController extends Controller
{
    /**
     * Display global real-time stock overview (All Stock).
     */
    public function allStock(Request $request): Response
    {
        Gate::authorize('stock.view');

        $search = $request->input('search');
        $categoryId = $request->input('category_id');

        // Subquery for reserved stock per product
        $reservedSubquery = StockReservation::select('product_id', DB::raw('SUM(quantity) as total_reserved'))
            ->where('status', StockReservation::STATUS_RESERVED)
            ->groupBy('product_id');

        $query = Product::with('category')
            ->leftJoinSub($reservedSubquery, 'reservations', function ($join) {
                $join->on('products.id', '=', 'reservations.product_id');
            })
            ->select(
                'products.*',
                DB::raw('COALESCE(reservations.total_reserved, 0) as reserved_stock')
            )
            ->orderBy('products.name');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('products.name', 'like', "%{$search}%")
                  ->orWhere('products.sku', 'like', "%{$search}%");
            });
        }

        if ($categoryId) {
            $query->where('products.category_id', $categoryId);
        }

        $products = $query->paginate(25)->withQueryString();

        // Calculate summary stats
        $totalProducts = Product::count();
        $totalPhysicalStock = Product::sum('stock');
        $totalReservedStock = StockReservation::where('status', StockReservation::STATUS_RESERVED)->sum('quantity');
        $totalReadyStock = max(0, $totalPhysicalStock - $totalReservedStock);

        $categories = Category::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Stock/AllStock', [
            'products'   => $products,
            'categories' => $categories,
            'filters'    => $request->only('search', 'category_id'),
            'summary'    => [
                'total_products'       => $totalProducts,
                'total_physical_stock' => (int) $totalPhysicalStock,
                'total_reserved_stock' => (int) $totalReservedStock,
                'total_ready_stock'    => (int) $totalReadyStock,
            ],
        ]);
    }
}
