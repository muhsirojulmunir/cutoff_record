<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\StockMovementService;
use Exception;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Barang Masuk — satu-satunya tempat menambah stok secara manual.
 * Master produk hanya mengurus data barang, stoknya diatur di sini agar
 * setiap perubahan stok punya jejak (siapa, kapan, berapa, alasannya).
 */
class GoodsReceiptController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovementService) {}

    public function index(Request $request): Response
    {
        Gate::authorize('stock.view');

        $movements = StockMovement::with(['product:id,sku,name', 'warehouse:id,name', 'creator:id,name'])
            ->where('movement_type', 'in')
            ->when($request->input('search'), function ($query, $search) {
                $query->whereHas('product', function ($productQuery) use ($search) {
                    $productQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%");
                });
            })
            ->when($request->input('warehouse_id'), fn ($query, $warehouseId) => $query->where('warehouse_id', $warehouseId))
            ->orderByDesc('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('GoodsReceipt/Index', [
            'movements'  => $movements,
            'filters'    => $request->only(['search', 'warehouse_id']),
            'products'   => Product::where('status', 'active')
                ->orderBy('name')
                ->get(['id', 'sku', 'name', 'stock']),
            'warehouses' => Warehouse::where('status', 'active')->orderBy('name')->get(['id', 'code', 'name']),
            'canCreate'  => Gate::allows('stock.adjust'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('stock.adjust');

        $validated = $request->validate([
            'product_id'   => ['required', 'exists:products,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'quantity'     => ['required', 'integer', 'min:1'],
            'notes'        => ['required', 'string', 'min:3', 'max:255'],
        ], [], [
            'product_id'   => 'Produk',
            'warehouse_id' => 'Gudang',
            'quantity'     => 'Jumlah masuk',
            'notes'        => 'Keterangan',
        ]);

        try {
            $product = Product::findOrFail($validated['product_id']);

            $this->stockMovementService->recordStockIn(
                $product,
                (int) $validated['warehouse_id'],
                (int) $validated['quantity'],
                'manual_entry',
                null,
                null,
                $validated['notes'],
                auth()->id(),
            );
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }

        return back()->with(
            'success',
            "Stok {$product->name} bertambah {$validated['quantity']} pcs."
        );
    }
}
