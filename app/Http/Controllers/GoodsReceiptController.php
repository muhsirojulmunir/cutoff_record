<?php

namespace App\Http\Controllers;

use App\Models\GoodsReceipt;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\GoodsReceiptService;
use Exception;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Barang Masuk — satu-satunya tempat menambah stok secara manual.
 *
 * Pengajuan tidak langsung menambah stok: PIC Gudang harus menyetujuinya
 * lebih dulu. Dengan begitu setiap perubahan stok punya jejak siapa yang
 * mengajukan dan siapa yang menyetujui.
 */
class GoodsReceiptController extends Controller
{
    public function __construct(private readonly GoodsReceiptService $goodsReceiptService) {}

    public function index(Request $request): Response
    {
        Gate::authorize('stock.view');

        $receipts = GoodsReceipt::with([
                'product:id,sku,name',
                'warehouse:id,name',
                'requester:id,name',
                'approver:id,name',
                'rejecter:id,name',
            ])
            ->when($request->input('search'), function ($query, $search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('receipt_number', 'like', "%{$search}%")
                        ->orWhereHas('product', function ($productQuery) use ($search) {
                            $productQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('sku', 'like', "%{$search}%");
                        });
                });
            })
            ->when($request->input('status'), fn ($query, $status) => $query->where('status', $status))
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('GoodsReceipt/Index', [
            'receipts'     => $receipts,
            'filters'      => $request->only(['search', 'status']),
            'products'     => Product::where('status', 'active')
                ->orderBy('name')
                ->get(['id', 'sku', 'name', 'stock']),
            'warehouses'   => Warehouse::where('status', 'active')->orderBy('name')->get(['id', 'code', 'name']),
            'canRequest'   => Gate::allows('stock.receipt.request'),
            'canApprove'   => Gate::allows('stock.receipt.approve'),
            'pendingCount' => GoodsReceipt::where('status', GoodsReceipt::STATUS_PENDING)->count(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('stock.receipt.request');

        $validated = $request->validate([
            'product_id'   => ['required', 'exists:products,id'],
            'warehouse_id' => ['nullable', 'exists:warehouses,id'],
            'quantity'     => ['required', 'integer', 'min:1'],
            'notes'        => ['required', 'string', 'min:3', 'max:255'],
        ], [], [
            'product_id'   => 'Produk',
            'warehouse_id' => 'Gudang',
            'quantity'     => 'Jumlah masuk',
            'notes'        => 'Keterangan',
        ]);

        try {
            $receipt = $this->goodsReceiptService->request($validated, auth()->id());
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }

        return back()->with(
            'success',
            "Pengajuan {$receipt->receipt_number} terkirim. Stok bertambah setelah disetujui PIC Gudang."
        );
    }

    public function approve(GoodsReceipt $goodsReceipt): RedirectResponse
    {
        Gate::authorize('stock.receipt.approve');

        try {
            $approved = $this->goodsReceiptService->approve($goodsReceipt, auth()->id());
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with(
            'success',
            "{$approved->receipt_number} disetujui. Stok {$approved->product->name} bertambah {$approved->quantity}."
        );
    }

    public function reject(Request $request, GoodsReceipt $goodsReceipt): RedirectResponse
    {
        Gate::authorize('stock.receipt.approve');

        $validated = $request->validate([
            'rejection_reason' => ['required', 'string', 'min:3', 'max:255'],
        ], [], ['rejection_reason' => 'Alasan penolakan']);

        try {
            $rejected = $this->goodsReceiptService->reject(
                $goodsReceipt,
                $validated['rejection_reason'],
                auth()->id()
            );
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$rejected->receipt_number} ditolak. Stok tidak berubah.");
    }
}
