<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSalesOrderRequest;
use App\Http\Requests\UpdateSalesOrderRequest;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Role;
use App\Models\SalesOrder;
use App\Services\SalesOrderService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Exception;

class SalesOrderController extends Controller
{
    protected SalesOrderService $salesOrderService;

    public function __construct(SalesOrderService $salesOrderService)
    {
        $this->salesOrderService = $salesOrderService;
    }

    /**
     * Display a listing of sales orders.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('sales_order.view');

        $salesOrders = $this->filteredQuery($request)
            ->with(['customer', 'creator'])
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('SalesOrders/Index', [
            'salesOrders' => $salesOrders,
            'filters'     => $request->only(['search', 'status', 'payment_status', 'source', 'start_date', 'end_date']),
        ]);
    }

    /**
     * Query Sales Order dengan filter dari halaman index — dipakai bersama
     * oleh tampilan daftar dan unduhan Excel agar hasilnya selalu sama.
     */
    protected function filteredQuery(Request $request): Builder
    {
        return SalesOrder::query()
            ->when($request->input('search'), function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('so_number', 'like', "%{$search}%")
                      ->orWhereHas('customer', function ($custQ) use ($search) {
                          $custQ->where('name', 'like', "%{$search}%")
                                ->orWhere('customer_code', 'like', "%{$search}%");
                      });
                });
            })
            ->when($request->input('status'), fn ($query, $status) => $query->where('status', $status))
            ->when($request->input('payment_status'), fn ($query, $paymentStatus) => $query->where('payment_status', $paymentStatus))
            ->when($request->input('source'), fn ($query, $source) => $query->where('source', $source))
            ->when($request->input('start_date'), fn ($query, $startDate) => $query->whereDate('order_date', '>=', $startDate))
            ->when($request->input('end_date'), fn ($query, $endDate) => $query->whereDate('order_date', '<=', $endDate))
            ->orderBy('created_at', 'desc');
    }

    /**
     * Data Sales Order (mengikuti filter aktif) untuk diunduh sebagai Excel.
     * Pembentukan file dilakukan di sisi browser memakai SheetJS.
     */
    public function export(Request $request): JsonResponse
    {
        Gate::authorize('sales_order.view');

        $salesOrders = $this->filteredQuery($request)
            ->with(['customer', 'creator', 'items'])
            ->get();

        $orders = $salesOrders->map(fn (SalesOrder $so) => [
            'so_number'        => $so->so_number,
            'order_date'       => optional($so->order_date)->format('Y-m-d'),
            'customer_code'    => $so->customer?->customer_code,
            'customer_name'    => $so->customer?->name,
            'recipient_name'   => $so->recipient_name,
            'city'             => $so->city,
            'province'         => $so->province,
            'source'           => $so->source,
            'sales_channel'    => $so->sales_channel,
            'status'           => $so->status,
            'payment_status'   => $so->payment_status,
            'tracking_number'  => $so->tracking_number,
            'subtotal'         => (float) $so->subtotal,
            'discount_amount'  => (float) $so->discount_amount,
            'tax_amount'       => (float) $so->tax_amount,
            'shipping_cost'    => (float) $so->shipping_cost,
            'grand_total'      => (float) $so->grand_total,
            'dp_amount'        => (float) $so->dp_amount,
            'remaining_amount' => max(0, (float) $so->grand_total - (float) $so->dp_amount),
            'total_weight'     => (float) $so->total_weight,
            'created_by'       => $so->creator?->name,
            'notes'            => $so->notes,
        ]);

        $items = $salesOrders->flatMap(fn (SalesOrder $so) => $so->items->map(fn ($item) => [
            'so_number'     => $so->so_number,
            'order_date'    => optional($so->order_date)->format('Y-m-d'),
            'customer_name' => $so->customer?->name,
            'sku'           => $item->sku,
            'product_name'  => $item->product_name,
            'quantity'      => (int) $item->quantity,
            'price'         => (float) $item->price,
            'discount_amount' => (float) $item->discount_amount,
            'tax_amount'    => (float) $item->tax_amount,
            'subtotal'      => (float) $item->subtotal,
        ]));

        return response()->json([
            'orders' => $orders->values(),
            'items'  => $items->values(),
        ]);
    }

    /**
     * Label pengiriman (Resi / AWB) siap cetak untuk ditempel di paket.
     */
    public function label(SalesOrder $salesOrder): Response
    {
        Gate::authorize('sales_order.view');

        $salesOrder->load(['customer', 'items', 'creator']);

        return Inertia::render('SalesOrders/Label', [
            'salesOrder' => $salesOrder,
        ]);
    }

    /**
     * Show the form for creating a new sales order.
     */
    public function create(): Response
    {
        Gate::authorize('sales_order.create');

        $customers = Customer::where('status', 'active')->orderBy('name')->get(['id', 'customer_code', 'name']);
        $products = Product::where('status', 'active')->orderBy('name')->get(['id', 'sku', 'name', 'selling_price']);

        return Inertia::render('SalesOrders/Create', [
            'customers' => $customers,
            'products'  => $products,
        ]);
    }

    /**
     * Store a newly created sales order in storage.
     */
    public function store(StoreSalesOrderRequest $request): RedirectResponse
    {
        Gate::authorize('sales_order.create');

        try {
            $this->salesOrderService->create($request->validated(), auth()->id());

            return redirect()->route('sales-orders.index')
                ->with('success', 'Sales Order berhasil dibuat.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Display the specified sales order.
     */
    public function show(SalesOrder $salesOrder): Response
    {
        Gate::authorize('sales_order.view');

        $salesOrder->load([
            'customer', 'creator', 'items.product', 'invoice',
            'submitter:id,name,role_id', 'submitter.role:id,name',
            'approver:id,name,role_id', 'approver.role:id,name',
            'completer:id,name,role_id', 'completer.role:id,name',
        ]);

        // Role mana pun yang memegang permission approve — dibaca dari data,
        // bukan di-hardcode, sehingga ikut berubah saat permission diubah.
        $approverRoles = Role::whereHas('permissions', fn($q) => $q->where('name', 'sales_order.approve'))
            ->orderBy('name')
            ->pluck('name');

        return Inertia::render('SalesOrders/Show', [
            'salesOrder'    => $salesOrder,
            'approverRoles' => $approverRoles,
        ]);
    }

    /**
     * Show the form for editing the specified sales order.
     */
    public function edit(SalesOrder $salesOrder): Response
    {
        Gate::authorize('sales_order.edit');

        if ($salesOrder->status !== 'draft') {
            abort(403, 'Hanya Sales Order berstatus Draft yang dapat diubah.');
        }

        $salesOrder->load('items');
        $customers = Customer::where('status', 'active')->orderBy('name')->get(['id', 'customer_code', 'name']);
        $products = Product::where('status', 'active')->orderBy('name')->get(['id', 'sku', 'name', 'selling_price']);

        return Inertia::render('SalesOrders/Edit', [
            'salesOrder' => $salesOrder,
            'customers'  => $customers,
            'products'   => $products,
        ]);
    }

    /**
     * Update the specified sales order in storage.
     */
    public function update(UpdateSalesOrderRequest $request, SalesOrder $salesOrder): RedirectResponse
    {
        Gate::authorize('sales_order.edit');

        if ($salesOrder->status !== 'draft') {
            abort(403, 'Hanya Sales Order berstatus Draft yang dapat diubah.');
        }

        try {
            $this->salesOrderService->update($salesOrder, $request->validated());

            return redirect()->route('sales-orders.show', $salesOrder->id)
                ->with('success', 'Sales Order berhasil diperbarui.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Remove the specified sales order from storage.
     */
    public function destroy(SalesOrder $salesOrder): RedirectResponse
    {
        $user = auth()->user();
        $isSuperAdmin = $user && $user->isSuperAdmin();

        if (!$isSuperAdmin && $salesOrder->status !== 'draft') {
            return back()->withErrors(['error' => 'Hanya Sales Order berstatus Draft yang dapat dihapus. (Khusus Super Admin dapat menghapus SO apa saja).']);
        }

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($salesOrder) {
                // Delete associated invoices & items
                $invoices = \App\Models\Invoice::where('sales_order_id', $salesOrder->id)->get();
                foreach ($invoices as $inv) {
                    $inv->items()->delete();
                    $inv->delete();
                }

                // Delete associated stock reservations
                \App\Models\StockReservation::where('marketplace_order_id', function ($sub) use ($salesOrder) {
                    $sub->select('id')->from('marketplace_orders')->where('sales_order_id', $salesOrder->id);
                })->delete();

                // Delete items and the SO itself
                $salesOrder->items()->delete();
                $salesOrder->delete();
            });

            return redirect()->route('sales-orders.index')
                ->with('success', 'Sales Order dan data terkait berhasil dihapus.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }


    /**
     * Submit sales order for approval.
     */
    public function submitApproval(SalesOrder $salesOrder): RedirectResponse
    {
        Gate::authorize('sales_order.edit');

        try {
            $this->salesOrderService->submitForApproval($salesOrder);

            return back()->with('success', 'Sales Order telah diajukan persetujuan.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Approve the sales order.
     */
    public function approve(SalesOrder $salesOrder): RedirectResponse
    {
        Gate::authorize('sales_order.approve');

        try {
            $this->salesOrderService->approve($salesOrder);

            return back()->with('success', 'Sales Order berhasil disetujui.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Tandai Sales Order sebagai Selesai secara manual. Dipakai untuk transaksi
     * yang tidak melewati jalur resi (mis. grosir ambil di tempat); SO yang
     * normal sudah tertutup otomatis saat resi terbit dan invoice lunas.
     */
    public function complete(SalesOrder $salesOrder): RedirectResponse
    {
        Gate::authorize('sales_order.approve');

        try {
            $this->salesOrderService->markAsCompleted($salesOrder);

            return back()->with('success', "Sales Order {$salesOrder->so_number} ditandai Selesai.");
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Cancel the sales order.
     */
    public function cancel(SalesOrder $salesOrder): RedirectResponse
    {
        // Cancel can be done by creator or manager/approver if SO is not completed/cancelled
        // We protect via general sales_order.edit/approve permission
        if (!auth()->user()->hasPermission('sales_order.edit') && !auth()->user()->hasPermission('sales_order.approve')) {
            abort(403);
        }

        try {
            $this->salesOrderService->cancel($salesOrder);

            return back()->with('success', 'Sales Order berhasil dibatalkan.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    /**
     * Show form for creating Grosir (Offline) Sales Order.
     */
    public function createGrosir(): Response
    {
        Gate::authorize('sales_order.create');

        $products = Product::orderBy('name')->get(['id', 'name', 'sku', 'selling_price']);

        return Inertia::render('SalesOrders/GrosirCreate', [
            'products' => $products,
        ]);
    }

    /**
     * Store Grosir Sales Order (Single or Batch from Excel).
     */
    public function storeGrosir(Request $request): RedirectResponse
    {
        Gate::authorize('sales_order.create');

        try {
            $userId = auth()->id();
            $batchData = $request->input('orders');

            if (is_array($batchData) && count($batchData) > 0) {
                // Impor batch bersifat semua-atau-tidak sama sekali: kalau satu
                // baris gagal, tidak ada SO setengah jadi yang tertinggal.
                $created = [];

                \Illuminate\Support\Facades\DB::transaction(function () use ($batchData, $userId, &$created) {
                    foreach (array_values($batchData) as $index => $row) {
                        try {
                            $created[] = $this->salesOrderService->createGrosirOrder($row, $userId);
                        } catch (Exception $e) {
                            throw new Exception('Baris ' . ($index + 1) . ': ' . $e->getMessage());
                        }
                    }
                });

                // Satu baris ⇒ langsung ke detail SO-nya agar admin bisa menekan
                // "Ajukan Approval" tanpa mencari lagi, sama seperti input manual.
                if (count($created) === 1) {
                    $so = $created[0];

                    return redirect()->route('sales-orders.show', $so->id)
                        ->with('success', "Sales Order Grosir {$so->so_number} dibuat sebagai Draft. Silakan Ajukan Approval.");
                }

                // Lebih dari satu SO tidak bisa dibuka sekaligus, jadi diarahkan ke
                // daftar yang sudah tersaring Draft — antrian yang perlu diajukan.
                return redirect()->route('sales-orders.index', ['status' => 'draft'])
                    ->with('success', count($created) . " pesanan Grosir dibuat sebagai Draft. Ajukan Approval satu per satu dari daftar ini.");
            }

            // Single order creation
            $validated = $request->validate([
                'recipient_name'   => 'required|string|max:255',
                'customer_phone'   => 'nullable|string|max:50',
                'sku'              => 'required|string|max:100',
                'quantity'         => 'required|integer|min:1',
                'unit_price'       => 'required|numeric|min:0',
                'voucher'          => 'nullable|numeric|min:0',
                'tax'              => 'nullable|numeric|min:0',
                'total_weight'     => 'nullable|numeric|min:0',
                'shipping_address' => 'nullable|string',
                'city'             => 'nullable|string|max:100',
                'province'         => 'nullable|string|max:100',
                'account_name'     => 'nullable|string|max:100',
                'tracking_number'  => 'nullable|string|max:100',
                'payment_date'     => 'nullable|date',
                'dp_amount'        => 'nullable|numeric|min:0',
            ]);

            $so = $this->salesOrderService->createGrosirOrder($validated, $userId);

            return redirect()->route('sales-orders.show', $so->id)
                ->with('success', "Sales Order Grosir {$so->so_number} dibuat sebagai Draft. Silakan Ajukan Approval.");
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    /**
     * Update Tracking Number / No. Resi AWB (Delivery Order).
     */
    public function updateTracking(Request $request, SalesOrder $salesOrder): RedirectResponse
    {
        $request->validate([
            'tracking_number' => 'required|string|max:100',
        ]);

        try {
            $this->salesOrderService->updateTrackingNumber($salesOrder, $request->input('tracking_number'));

            return back()->with('success', "No. Resi / AWB untuk {$salesOrder->so_number} berhasil disimpan.");
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}

