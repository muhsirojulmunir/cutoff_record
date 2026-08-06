<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\StockMovementService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Exception;

class StockMovementController extends Controller
{
    protected StockMovementService $stockMovementService;

    public function __construct(StockMovementService $stockMovementService)
    {
        $this->stockMovementService = $stockMovementService;
    }

    /**
     * Display a listing of stock movements.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('stock.view');

        $search = $request->input('search');
        $movementType = $request->input('movement_type');
        $warehouseId = $request->input('warehouse_id');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        $stockMovements = StockMovement::with(['product', 'warehouse', 'creator'])
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('reference_number', 'like', "%{$search}%")
                      ->orWhereHas('product', function ($subQ) use ($search) {
                          $subQ->where('name', 'like', "%{$search}%")
                               ->orWhere('sku', 'like', "%{$search}%");
                      });
                });
            })
            ->when($movementType, function ($query, $movementType) {
                $query->where('movement_type', $movementType);
            })
            ->when($warehouseId, function ($query, $warehouseId) {
                $query->where('warehouse_id', $warehouseId);
            })
            ->when($startDate, function ($query, $startDate) {
                $query->whereDate('created_at', '>=', $startDate);
            })
            ->when($endDate, function ($query, $endDate) {
                $query->whereDate('created_at', '<=', $endDate);
            })
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        $warehouses = Warehouse::where('status', 'active')->orderBy('name')->get(['id', 'code', 'name']);
        $products = Product::where('status', 'active')->orderBy('name')->get(['id', 'sku', 'name']);

        return Inertia::render('StockMovements/Index', [
            'stockMovements' => $stockMovements,
            'warehouses'     => $warehouses,
            'products'       => $products,
            'filters'        => $request->only(['search', 'movement_type', 'warehouse_id', 'start_date', 'end_date']),
        ]);
    }

    /**
     * Kosongkan seluruh Inventory Ledger dan nolkan stok semua produk.
     *
     * Disediakan agar client bisa mencoba sistem dari kondisi bersih. Karena
     * dampaknya luas dan tidak bisa dibatalkan, aksinya dibatasi Super Admin
     * dan harus dikonfirmasi dengan mengetik ulang kata kuncinya.
     */
    public function reset(Request $request): RedirectResponse
    {
        abort_unless(
            $request->user()?->isSuperAdmin(),
            403,
            'Pengosongan Inventory Ledger hanya dapat dilakukan oleh Super Admin.'
        );

        $request->validate([
            'confirmation' => ['required', 'string', 'in:KOSONGKAN'],
        ], [
            'confirmation.in'       => 'Ketik KOSONGKAN untuk memastikan Anda memang ingin mengosongkan ledger.',
            'confirmation.required' => 'Ketik KOSONGKAN untuk memastikan Anda memang ingin mengosongkan ledger.',
        ]);

        $jumlahBaris = StockMovement::withTrashed()->count();

        DB::transaction(function () {
            // withTrashed agar baris yang sudah diarsipkan ikut terbuang —
            // tujuannya memang meninggalkan tabel yang benar-benar kosong.
            StockMovement::withTrashed()->forceDelete();

            Product::withTrashed()->update(['stock' => 0]);
        });

        return back()->with(
            'success',
            "Inventory Ledger dikosongkan: {$jumlahBaris} catatan dihapus dan stok semua produk kembali ke 0."
        );
    }

    /**
     * Process stock adjustment.
     */
    public function adjust(Request $request): RedirectResponse
    {
        Gate::authorize('stock.adjust');

        $request->validate([
            'product_id'   => ['required', 'exists:products,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'quantity'     => ['required', 'integer', 'not_in:0'],
            'notes'        => ['required', 'string', 'min:5'],
        ]);

        try {
            $product = Product::findOrFail($request->input('product_id'));
            
            $this->stockMovementService->recordAdjustment(
                $product,
                (int) $request->input('warehouse_id'),
                (int) $request->input('quantity'),
                $request->input('notes'),
                auth()->id()
            );

            return back()->with('success', 'Penyesuaian stok berhasil disimpan.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        }
    }
}
