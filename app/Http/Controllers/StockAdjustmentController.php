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
 * Adjustment Stok — koreksi stok yang tidak lewat pembelian maupun penjualan,
 * misalnya hasil stock opname, barang hilang, atau salah input sebelumnya.
 *
 * Menu ini khusus Leader. Berbeda dengan Barang Masuk yang menunggu
 * persetujuan, koreksi di sini langsung berlaku karena memang wewenang
 * Leader — karena itu setiap perubahan wajib disertai alasan dan tercatat
 * lengkap di Inventory Ledger.
 */
class StockAdjustmentController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovementService) {}

    public function index(Request $request): Response
    {
        Gate::authorize('stock.adjustment.manage');

        $adjustments = StockMovement::with(['product:id,sku,name', 'warehouse:id,name', 'creator:id,name'])
            ->where('movement_type', 'adjustment')
            ->when($request->input('search'), function ($query, $search) {
                $query->whereHas('product', function ($productQuery) use ($search) {
                    $productQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%");
                });
            })
            ->orderByDesc('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('Stock/Adjustment', [
            'adjustments' => $adjustments,
            'filters'     => $request->only(['search']),
            'products'    => Product::where('status', 'active')
                ->orderBy('sku')
                ->get(['id', 'sku', 'name', 'stock']),
            'warehouses'  => Warehouse::where('status', 'active')->orderBy('name')->get(['id', 'code', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('stock.adjustment.manage');

        $validated = $request->validate([
            'product_id'   => ['required', 'exists:products,id'],
            'warehouse_id' => ['nullable', 'exists:warehouses,id'],
            'quantity'     => ['required', 'integer', 'not_in:0'],
            'notes'        => ['required', 'string', 'min:5', 'max:255'],
        ], [], [
            'product_id'   => 'Produk',
            'warehouse_id' => 'Gudang',
            'quantity'     => 'Jumlah koreksi',
            'notes'        => 'Alasan koreksi',
        ]);

        try {
            $product = Product::findOrFail($validated['product_id']);

            $movement = $this->stockMovementService->recordAdjustment(
                $product,
                $validated['warehouse_id'] ?? null,
                (int) $validated['quantity'],
                $validated['notes'],
                auth()->id()
            );
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }

        $arah = $validated['quantity'] > 0 ? 'bertambah' : 'berkurang';

        return back()->with(
            'success',
            "Stok {$product->name} {$arah} " . abs((int) $validated['quantity'])
            . ". Sekarang {$movement->stock_after}."
        );
    }
}
