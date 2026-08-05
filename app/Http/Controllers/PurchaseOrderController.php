<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePurchaseOrderRequest;
use App\Http\Requests\UpdatePurchaseOrderRequest;
use App\Models\CashBankAccount;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Models\Warehouse;
use App\Services\PurchaseOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Exception;

class PurchaseOrderController extends Controller
{
    protected PurchaseOrderService $poService;

    public function __construct(PurchaseOrderService $poService)
    {
        $this->poService = $poService;
    }

    /**
     * Display a listing of purchase orders.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('purchase_order.view');

        $search = $request->input('search');
        $status = $request->input('status');
        $paymentStatus = $request->input('payment_status');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        $purchaseOrders = PurchaseOrder::with(['supplier', 'warehouse', 'creator'])
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('po_number', 'like', "%{$search}%")
                      ->orWhereHas('supplier', function ($subQ) use ($search) {
                          $subQ->where('name', 'like', "%{$search}%");
                      });
                });
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->when($paymentStatus, function ($query, $paymentStatus) {
                $query->where('payment_status', $paymentStatus);
            })
            ->when($startDate, function ($query, $startDate) {
                $query->whereDate('order_date', '>=', $startDate);
            })
            ->when($endDate, function ($query, $endDate) {
                $query->whereDate('order_date', '<=', $endDate);
            })
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('PurchaseOrders/Index', [
            'purchaseOrders' => $purchaseOrders,
            'filters'        => $request->only(['search', 'status', 'payment_status', 'start_date', 'end_date']),
        ]);
    }

    /**
     * Show the form for creating a new purchase order.
     */
    public function create(): Response
    {
        Gate::authorize('purchase_order.create');

        $suppliers = Supplier::where('status', 'active')->orderBy('name')->get(['id', 'supplier_code', 'name']);
        $warehouses = Warehouse::where('status', 'active')->orderBy('name')->get(['id', 'code', 'name']);
        $products = Product::where('status', 'active')->orderBy('name')->get(['id', 'sku', 'name', 'purchase_price']);

        return Inertia::render('PurchaseOrders/Create', [
            'suppliers'  => $suppliers,
            'warehouses' => $warehouses,
            'products'   => $products,
        ]);
    }

    /**
     * Store a newly created purchase order in storage.
     */
    public function store(StorePurchaseOrderRequest $request): RedirectResponse
    {
        Gate::authorize('purchase_order.create');

        try {
            $validatedData = $request->validated();

            if ($request->hasFile('payment_proof')) {
                $file = $request->file('payment_proof');
                $filename = 'po_proof_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
                $path = $file->storeAs('purchase_orders/proofs', $filename, 'public');
                $validatedData['payment_proof_path'] = $path;
            }

            $po = $this->poService->create($validatedData, auth()->id());

            return redirect()->route('purchase-orders.show', $po->id)
                ->with('success', 'Purchase Order berhasil dibuat sebagai Draft.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        }
    }

    /**
     * Display the specified purchase order.
     */
    public function show(PurchaseOrder $purchaseOrder): Response
    {
        Gate::authorize('purchase_order.view');

        $purchaseOrder->load([
            'supplier',
            'warehouse',
            'creator',
            'items.product',
            'dpCashBankAccount',
            'financeValidator',
            'leaderApprover',
            'financeApprover',
        ]);

        $cashBankAccounts = CashBankAccount::where('status', 'active')
            ->orderBy('account_name')
            ->get(['id', 'account_code', 'account_name', 'account_type', 'current_balance']);

        $user = auth()->user();

        return Inertia::render('PurchaseOrders/Show', [
            'purchaseOrder'    => $purchaseOrder,
            'cashBankAccounts' => $cashBankAccounts,
            'can' => [
                'finance_approve'   => $user->hasPermission('purchase_order.finance_approve'),
                'leader_approve'    => $user->hasPermission('purchase_order.leader_approve'),
                'edit'              => $user->hasPermission('purchase_order.edit'),
                'receive'           => $user->hasPermission('purchase_order.receive'),
            ],
        ]);
    }

    /**
     * Show the form for editing the specified purchase order.
     */
    public function edit(PurchaseOrder $purchaseOrder): Response
    {
        Gate::authorize('purchase_order.edit');

        if ($purchaseOrder->status !== 'draft') {
            abort(403, 'Hanya Purchase Order berstatus Draft yang dapat diubah.');
        }

        $purchaseOrder->load('items');
        $suppliers = Supplier::where('status', 'active')->orderBy('name')->get(['id', 'supplier_code', 'name']);
        $warehouses = Warehouse::where('status', 'active')->orderBy('name')->get(['id', 'code', 'name']);
        $products = Product::where('status', 'active')->orderBy('name')->get(['id', 'sku', 'name', 'purchase_price']);

        return Inertia::render('PurchaseOrders/Edit', [
            'purchaseOrder' => $purchaseOrder,
            'suppliers'      => $suppliers,
            'warehouses'     => $warehouses,
            'products'       => $products,
        ]);
    }

    /**
     * Update the specified purchase order in storage.
     */
    public function update(UpdatePurchaseOrderRequest $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.edit');

        if ($purchaseOrder->status !== 'draft') {
            abort(403, 'Hanya Purchase Order berstatus Draft yang dapat diubah.');
        }

        try {
            $validatedData = $request->validated();

            if ($request->hasFile('payment_proof')) {
                $file = $request->file('payment_proof');
                $filename = 'po_proof_' . $purchaseOrder->id . '_' . time() . '.' . $file->getClientOriginalExtension();
                $path = $file->storeAs('purchase_orders/proofs', $filename, 'public');
                $validatedData['payment_proof_path'] = $path;
            }

            $this->poService->update($purchaseOrder, $validatedData);

            return redirect()->route('purchase-orders.show', $purchaseOrder->id)
                ->with('success', 'Purchase Order berhasil diperbarui.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        }
    }

    /**
     * Upload payment proof photo for Purchase Order.
     */
    public function uploadPaymentProof(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        // Bukti bayar adalah catatan keuangan, jadi tidak cukup berbekal izin
        // melihat PO — Management yang hanya boleh memantau tidak ikut bisa
        // mengunggah atau mengganti buktinya.
        $user = auth()->user();

        if (! $user?->hasPermission('purchase_order.edit')
            && ! $user?->hasPermission('purchase_order.finance_approve')) {
            abort(403, 'Anda tidak berwenang mengunggah bukti pembayaran.');
        }

        $request->validate([
            'payment_proof' => ['required', 'file', 'mimes:jpeg,png,jpg,webp,pdf', 'max:5120'],
        ]);

        try {
            if ($request->hasFile('payment_proof')) {
                $file = $request->file('payment_proof');
                $filename = 'po_proof_' . $purchaseOrder->id . '_' . time() . '.' . $file->getClientOriginalExtension();
                $path = $file->storeAs('purchase_orders/proofs', $filename, 'public');

                $purchaseOrder->update([
                    'payment_proof_path' => $path,
                ]);
            }

            return back()->with('success', 'Bukti pembayaran berhasil diunggah.');
        } catch (Exception $e) {
            return back()->with('error', 'Gagal mengunggah bukti bayar: ' . $e->getMessage());
        }
    }

    /**
     * Remove the specified purchase order from storage.
     */
    public function destroy(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $user = auth()->user();
        $isSuperAdmin = $user && $user->isSuperAdmin();

        if (!$isSuperAdmin && $purchaseOrder->status !== 'draft') {
            return back()->with('error', 'Hanya Purchase Order berstatus Draft yang dapat dihapus. (Khusus Super Admin dapat menghapus PO apa saja).');
        }

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($purchaseOrder) {
                // Delete associated factory invoices & items
                $factoryInvoices = \App\Models\FactoryInvoice::where('purchase_order_id', $purchaseOrder->id)->get();
                foreach ($factoryInvoices as $fi) {
                    $fi->items()->delete();
                    $fi->delete();
                }

                // Delete associated factory receivables
                \App\Models\FactoryReceivable::where('purchase_order_id', $purchaseOrder->id)->delete();

                // Delete associated purchase order items
                $purchaseOrder->items()->delete();

                // Delete the PO itself
                $purchaseOrder->delete();
            });

            return redirect()->route('purchase-orders.index')
                ->with('success', 'Purchase Order dan seluruh data terkait berhasil dihapus.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }


    /**
     * Submit the Purchase Order for approval.
     */
    public function submitApproval(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.edit');

        try {
            $this->poService->submitApproval($purchaseOrder);
            return back()->with('success', 'Purchase Order berhasil diajukan persetujuan.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Leader approves the Purchase Order (status: pending_leader_approval → pending_finance_approval).
     */
    public function leaderApprove(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.leader_approve');

        try {
            $this->poService->leaderApprove($purchaseOrder, auth()->id());
            return back()->with('success', 'Purchase Order berhasil disetujui oleh Leader. Menunggu persetujuan Finance.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Finance approves the Purchase Order (status: pending_finance_approval → approved).
     */
    public function financeApprove(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.finance_approve');

        try {
            $this->poService->financeApprove($purchaseOrder, auth()->id());
            return back()->with('success', 'Purchase Order berhasil disetujui oleh Finance.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Reject the Purchase Order (Leader or Finance).
     */
    public function reject(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        if (!Gate::allows('purchase_order.leader_approve') && !Gate::allows('purchase_order.finance_approve')) {
            abort(403);
        }

        $request->validate([
            'reject_reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        try {
            $this->poService->reject($purchaseOrder, auth()->id(), $request->reject_reason);
            return back()->with('success', 'Purchase Order berhasil ditolak.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Mark the Purchase Order as ordered.
     */
    public function markOrdered(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.edit');

        try {
            $this->poService->markAsOrdered($purchaseOrder);
            return back()->with('success', 'Purchase Order berhasil ditandai sebagai Ordered.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Receive goods for the Purchase Order (Goods Receipt).
     */
    public function receive(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        if (!Gate::allows('purchase_order.receive') && !Gate::allows('purchase_order.edit') && !Gate::allows('purchase_order.approve') && !Gate::allows('purchase_order.create')) {
            abort(403, 'Anda tidak memiliki izin untuk mencatat penerimaan barang.');
        }

        $request->validate([
            'shipping_cost'                => ['nullable', 'numeric', 'min:0'],
            'items'                        => ['required', 'array', 'min:1'],
            'items.*.product_id'           => ['required', 'exists:products,id'],
            'items.*.received_qty'         => ['required', 'integer', 'min:0'],
            'items.*.rejected_qty'         => ['nullable', 'integer', 'min:0'],
            'items.*.rejected_reason'      => ['nullable', 'string', 'max:255'],
            'items.*.validated_unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.action_taken'         => ['nullable', 'in:accepted,revised,rejected'],
        ]);

        try {
            $this->poService->receiveGoods($purchaseOrder, $request->only('items', 'shipping_cost'));
            return back()->with('success', 'Penerimaan barang & kondisi fisik berhasil dicatat.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Cancel the Purchase Order.
     */
    public function cancel(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        // Cancel can be done by creator/editor (edit permission) or manager (approve permission)
        if (!Gate::allows('purchase_order.edit') && !Gate::allows('purchase_order.approve')) {
            abort(403);
        }

        try {
            $this->poService->cancel($purchaseOrder);
            return back()->with('success', 'Purchase Order berhasil dibatalkan.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Finance pays Down Payment (DP) for an approved PO.
     */
    public function payDownPayment(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.finance_approve');

        $validated = $request->validate([
            'dp_amount'           => ['required', 'numeric', 'min:1'],
            'cash_bank_account_id'=> ['nullable', 'exists:cash_bank_accounts,id'],
            'payment_terms'       => ['required', 'in:dp_50,cash,tempo_7_days,tempo_14_days,cash_to_cash'],
        ], [], [
            'dp_amount'            => 'Nominal Down Payment',
            'cash_bank_account_id' => 'Akun Kas / Bank',
            'payment_terms'        => 'Syarat pembayaran',
        ]);

        // Opsi DP 50% berarti nominalnya sudah pasti; Finance tidak perlu
        // menghitung sendiri dan salah ketik langsung ditolak di sini.
        if ($validated['payment_terms'] === 'dp_50') {
            $expected = round(((float) $purchaseOrder->grand_total) * 0.5);
            $paid     = round((float) $validated['dp_amount']);

            if (abs($paid - $expected) > 1) {
                return back()->withErrors([
                    'error' => 'Pembayaran DP 50% harus Rp ' . number_format($expected, 0, ',', '.')
                        . ' (setengah dari Grand Total Rp ' . number_format((float) $purchaseOrder->grand_total, 0, ',', '.')
                        . '), sedangkan yang diisi Rp ' . number_format($paid, 0, ',', '.') . '.',
                ]);
            }
        }

        try {
            $this->poService->payDownPayment($purchaseOrder, $request->all(), auth()->id());
            return back()->with('success', 'Down Payment PO berhasil dicatat.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Finance validates received goods: accept, revise, or reject items.
     */
    public function validateReceiving(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        Gate::authorize('purchase_order.finance_approve');

        $request->validate([
            'items'                          => ['required', 'array', 'min:1'],
            'items.*.item_id'                => ['required', 'exists:purchase_order_items,id'],
            'items.*.action'                 => ['required', 'in:accepted,revised,rejected'],
            'items.*.accepted_quantity'      => ['required', 'integer', 'min:0'],
            'items.*.rejected_quantity'      => ['nullable', 'integer', 'min:0'],
            'items.*.rejected_reason'        => ['nullable', 'string', 'max:255'],
            'items.*.validated_unit_price'   => ['nullable', 'numeric', 'min:0'],
        ]);

        try {
            $this->poService->validateReceivedItems($purchaseOrder, $request->input('items'), auth()->id());
            return back()->with('success', 'Validasi penerimaan barang berhasil disimpan. Tagihan akhir telah dihitung.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }
}
