<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\StockReturn;
use App\Models\Warehouse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class StockReturnController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('stock_return.view');

        $status = $request->input('status', '');
        $search = $request->input('search', '');

        $returns = StockReturn::with(['product', 'requestedBy', 'approvedBy', 'rejectedBy'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->when($search, fn ($q) => $q->where(function ($q) use ($search) {
                $q->where('return_number', 'like', "%{$search}%")
                  ->orWhere('invoice_number', 'like', "%{$search}%")
                  ->orWhereHas('product', fn ($p) => $p->where('sku', 'like', "%{$search}%")
                      ->orWhere('name', 'like', "%{$search}%"));
            }))
            ->orderByDesc('id')
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($r) => [
                'id'               => $r->id,
                'return_number'    => $r->return_number,
                'invoice_number'   => $r->invoice_number,
                'product_id'       => $r->product_id,
                'product_sku'      => $r->product?->sku,
                'product_name'     => $r->product?->name,
                'quantity'         => $r->quantity,
                'reason'           => $r->reason,
                'status'           => $r->status,
                'status_label'     => $r->status_label,
                'status_color'     => $r->status_color,
                'requested_by'     => $r->requestedBy?->name,
                'requested_at'     => $r->requested_at?->format('d/m/Y H:i'),
                'approved_by'      => $r->approvedBy?->name,
                'approved_at'      => $r->approved_at?->format('d/m/Y H:i'),
                'rejected_by'      => $r->rejectedBy?->name,
                'rejected_at'      => $r->rejected_at?->format('d/m/Y H:i'),
                'rejection_reason' => $r->rejection_reason,
            ]);

        return Inertia::render('StockReturns/Index', [
            'returns' => $returns,
            'filters' => $request->only(['status', 'search']),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('stock_return.create');

        $products = Product::orderBy('sku')
            ->get(['id', 'sku', 'name', 'stock']);

        return Inertia::render('StockReturns/Create', [
            'products' => $products,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('stock_return.create');

        $validated = $request->validate([
            'invoice_number' => ['required', 'string', 'max:100'],
            'product_id'     => ['required', 'integer', 'exists:products,id'],
            'quantity'       => ['required', 'integer', 'min:1'],
            'reason'         => ['required', 'string', 'max:500'],
        ], [
            'invoice_number.required' => 'Nomor invoice wajib diisi.',
            'product_id.required'     => 'Produk wajib dipilih.',
            'product_id.exists'       => 'Produk tidak ditemukan.',
            'quantity.required'       => 'Jumlah qty wajib diisi.',
            'quantity.min'            => 'Jumlah qty minimal 1.',
            'reason.required'         => 'Keterangan retur wajib diisi.',
        ]);

        StockReturn::create([
            'return_number'  => StockReturn::generateReturnNumber(),
            'invoice_number' => $validated['invoice_number'],
            'product_id'     => $validated['product_id'],
            'quantity'       => $validated['quantity'],
            'reason'         => $validated['reason'],
            'status'         => 'pending',
            'requested_by'   => Auth::id(),
            'requested_at'   => now(),
        ]);

        return redirect()->route('stock-returns.index')
            ->with('success', 'Retur berhasil diajukan dan menunggu persetujuan Leader.');
    }

    public function show(StockReturn $stockReturn): Response
    {
        Gate::authorize('stock_return.view');

        $stockReturn->load(['product', 'warehouse', 'requestedBy', 'approvedBy', 'rejectedBy', 'stockMovement']);

        return Inertia::render('StockReturns/Show', [
            'stockReturn' => [
                'id'               => $stockReturn->id,
                'return_number'    => $stockReturn->return_number,
                'invoice_number'   => $stockReturn->invoice_number,
                'product_sku'      => $stockReturn->product?->sku,
                'product_name'     => $stockReturn->product?->name,
                'quantity'         => $stockReturn->quantity,
                'reason'           => $stockReturn->reason,
                'status'           => $stockReturn->status,
                'status_label'     => $stockReturn->status_label,
                'status_color'     => $stockReturn->status_color,
                'requested_by'     => $stockReturn->requestedBy?->name,
                'requested_at'     => $stockReturn->requested_at?->format('d/m/Y H:i'),
                'approved_by'      => $stockReturn->approvedBy?->name,
                'approved_at'      => $stockReturn->approved_at?->format('d/m/Y H:i'),
                'rejected_by'      => $stockReturn->rejectedBy?->name,
                'rejected_at'      => $stockReturn->rejected_at?->format('d/m/Y H:i'),
                'rejection_reason' => $stockReturn->rejection_reason,
            ],
        ]);
    }

    /**
     * Leader menyetujui retur → stok produk bertambah + catat StockMovement.
     */
    public function approve(StockReturn $stockReturn): RedirectResponse
    {
        Gate::authorize('stock_return.approve');

        if ($stockReturn->status !== 'pending') {
            return back()->with('error', 'Retur ini sudah diproses sebelumnya.');
        }

        DB::transaction(function () use ($stockReturn) {
            $product = Product::lockForUpdate()->findOrFail($stockReturn->product_id);

            $stockBefore = $product->stock;
            $stockAfter  = $stockBefore + $stockReturn->quantity;

            // Tambah stok produk
            $product->increment('stock', $stockReturn->quantity);

            // Catat di Stock Movements
            $movement = StockMovement::create([
                'product_id'       => $product->id,
                'movement_type'    => 'in',
                'quantity'         => $stockReturn->quantity,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'reference_type'   => 'stock_return',
                'reference_id'     => $stockReturn->id,
                'reference_number' => $stockReturn->return_number,
                'notes'            => "Retur dari Invoice #{$stockReturn->invoice_number}: {$stockReturn->reason}",
                'created_by'       => Auth::id(),
            ]);

            // Update retur
            $stockReturn->update([
                'status'            => 'approved',
                'approved_by'       => Auth::id(),
                'approved_at'       => now(),
                'stock_movement_id' => $movement->id,
            ]);
        });

        return redirect()->route('stock-returns.index')
            ->with('success', "Retur {$stockReturn->return_number} disetujui. Stok +{$stockReturn->quantity} sudah masuk ke All Stock.");
    }

    /**
     * Leader menolak retur — stok tidak berubah.
     */
    public function reject(Request $request, StockReturn $stockReturn): RedirectResponse
    {
        Gate::authorize('stock_return.approve');

        if ($stockReturn->status !== 'pending') {
            return back()->with('error', 'Retur ini sudah diproses sebelumnya.');
        }

        $validated = $request->validate([
            'rejection_reason' => ['required', 'string', 'max:500'],
        ], [
            'rejection_reason.required' => 'Alasan penolakan wajib diisi.',
        ]);

        $stockReturn->update([
            'status'           => 'rejected',
            'rejected_by'      => Auth::id(),
            'rejected_at'      => now(),
            'rejection_reason' => $validated['rejection_reason'],
        ]);

        return redirect()->route('stock-returns.index')
            ->with('success', "Retur {$stockReturn->return_number} ditolak.");
    }
}
