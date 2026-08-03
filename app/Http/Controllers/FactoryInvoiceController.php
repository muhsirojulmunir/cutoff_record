<?php

namespace App\Http\Controllers;

use App\Models\FactoryInvoice;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class FactoryInvoiceController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('factory_receivable.view');

        $query = FactoryInvoice::with(['supplier', 'purchaseOrder', 'creator'])
            ->orderBy('invoice_date', 'desc');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%$search%")
                  ->orWhere('supplier_invoice_number', 'like', "%$search%")
                  ->orWhereHas('supplier', fn($s) => $s->where('name', 'like', "%$search%"));
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $invoices = $query->paginate(20)->withQueryString();

        return Inertia::render('FactoryInvoices/Index', [
            'invoices' => $invoices,
            'filters'  => $request->only('search', 'status'),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('factory_receivable.create');

        $suppliers     = Supplier::where('status', 'active')->orderBy('name')->get(['id', 'name', 'supplier_code']);
        $purchaseOrders = PurchaseOrder::whereIn('status', ['received', 'finance_validated'])
            ->orderBy('po_number')->get(['id', 'po_number', 'supplier_id', 'grand_total']);
        $products = Product::where('status', 'active')->orderBy('name')->get(['id', 'sku', 'name', 'selling_price']);

        return Inertia::render('FactoryInvoices/Create', [
            'suppliers'      => $suppliers,
            'purchaseOrders' => $purchaseOrders,
            'products'       => $products,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('factory_receivable.create');

        $data = $request->validate([
            'supplier_id'              => ['required', 'exists:suppliers,id'],
            'purchase_order_id'        => ['nullable', 'exists:purchase_orders,id'],
            'factory_receivable_id'    => ['nullable', 'exists:factory_receivables,id'],
            'invoice_date'             => ['required', 'date'],
            'due_date'                 => ['nullable', 'date', 'after_or_equal:invoice_date'],
            'supplier_invoice_number'  => ['nullable', 'string', 'max:100'],
            'discount_amount'          => ['nullable', 'numeric', 'min:0'],
            'tax_amount'               => ['nullable', 'numeric', 'min:0'],
            'shipping_cost'            => ['nullable', 'numeric', 'min:0'],
            'notes'                    => ['nullable', 'string', 'max:2000'],
            'items'                    => ['required', 'array', 'min:1'],
            'items.*.product_id'       => ['nullable', 'exists:products,id'],
            'items.*.product_name'     => ['required', 'string', 'max:255'],
            'items.*.product_code'     => ['nullable', 'string', 'max:100'],
            'items.*.quantity'         => ['required', 'integer', 'min:1'],
            'items.*.unit'             => ['nullable', 'string', 'max:50'],
            'items.*.unit_price'       => ['required', 'numeric', 'min:0'],
            'items.*.discount_amount'  => ['nullable', 'numeric', 'min:0'],
            'items.*.tax_amount'       => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($data) {
            $subtotal = 0;
            $itemsData = [];

            foreach ($data['items'] as $item) {
                $disc     = $item['discount_amount'] ?? 0;
                $tax      = $item['tax_amount'] ?? 0;
                $itemSub  = ($item['quantity'] * $item['unit_price']) - $disc + $tax;
                $subtotal += $itemSub;
                $itemsData[] = array_merge($item, [
                    'subtotal'        => $itemSub,
                    'unit'            => $item['unit'] ?? 'pcs',
                    'discount_amount' => $disc,
                    'tax_amount'      => $tax,
                ]);
            }

            $disc     = $data['discount_amount'] ?? 0;
            $tax      = $data['tax_amount'] ?? 0;
            $shipping = $data['shipping_cost'] ?? 0;
            $total    = $subtotal - $disc + $tax + $shipping;

            $inv = FactoryInvoice::create([
                'invoice_number'          => $this->generateInvoiceNumber(),
                'supplier_id'             => $data['supplier_id'],
                'purchase_order_id'       => $data['purchase_order_id'] ?? null,
                'factory_receivable_id'   => $data['factory_receivable_id'] ?? null,
                'invoice_date'            => $data['invoice_date'],
                'due_date'                => $data['due_date'] ?? null,
                'supplier_invoice_number' => $data['supplier_invoice_number'] ?? null,
                'subtotal'                => $subtotal,
                'discount_amount'         => $disc,
                'tax_amount'              => $tax,
                'shipping_cost'           => $shipping,
                'total_amount'            => $total,
                'paid_amount'             => 0,
                'remaining_amount'        => $total,
                'status'                  => 'unpaid',
                'notes'                   => $data['notes'] ?? null,
                'created_by'              => auth()->id(),
            ]);

            $inv->items()->createMany($itemsData);
        });

        return redirect('/factory-invoices')->with('success', 'Invoice Pabrik berhasil dibuat.');
    }

    public function show(FactoryInvoice $factoryInvoice): Response
    {
        Gate::authorize('factory_receivable.view');

        $factoryInvoice->load(['supplier', 'purchaseOrder', 'factoryReceivable', 'creator', 'items.product']);

        return Inertia::render('FactoryInvoices/Show', [
            'invoice' => $factoryInvoice,
        ]);
    }

    public function cancel(FactoryInvoice $factoryInvoice): RedirectResponse
    {
        Gate::authorize('factory_receivable.cancel');

        if (!in_array($factoryInvoice->status, ['unpaid', 'overdue'])) {
            return back()->with('error', 'Hanya invoice unpaid/overdue yang bisa dibatalkan.');
        }

        $factoryInvoice->update(['status' => 'cancelled']);

        return back()->with('success', 'Invoice Pabrik berhasil dibatalkan.');
    }

    private function generateInvoiceNumber(): string
    {
        $prefix = 'INV-FAB-' . now()->format('Ym');
        $last   = FactoryInvoice::withTrashed()
            ->where('invoice_number', 'like', "$prefix%")
            ->orderByDesc('invoice_number')
            ->value('invoice_number');

        $seq = $last ? ((int) substr($last, -4)) + 1 : 1;
        return $prefix . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }
}
