<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Request;
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

        // Halaman ini hanya menampilkan SKU, nama produk, dan stok. Kolom harga
        // jual dipindahkan ke HPP Report, sedangkan reserved dan status stok
        // tidak lagi ditampilkan atas permintaan pengguna.
        $query = Product::with('category')
            ->select('products.*')
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

        $totalProducts = Product::count();
        $totalPhysicalStock = Product::sum('stock');

        $categories = Category::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Stock/AllStock', [
            'products'   => $products,
            'categories' => $categories,
            'filters'    => $request->only('search', 'category_id'),
            'summary'    => [
                'total_products'       => $totalProducts,
                'total_physical_stock' => (int) $totalPhysicalStock,
            ],
        ]);
    }
}
