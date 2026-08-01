<?php

namespace App\Http\Controllers;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrder;
use App\Services\Marketplace\MarketplaceFulfillmentService;
use App\Services\Marketplace\MarketplaceOrderService;
use App\Services\Marketplace\StockReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class MarketplaceOrderController extends Controller
{
    public function __construct(
        private readonly MarketplaceOrderService $orderService,
        private readonly MarketplaceFulfillmentService $fulfillmentService,
        private readonly StockReservationService $reservationService,
    ) {}

    public function index(Request $request): \Inertia\Response
    {
        Gate::authorize('marketplace.order.view');

        $query = MarketplaceOrder::with(['account', 'salesOrder', 'warehouse'])
            ->latest('order_date');

        if ($request->filled('marketplace')) {
            $query->where('marketplace', $request->marketplace);
        }
        if ($request->filled('account_id')) {
            $query->where('marketplace_account_id', $request->account_id);
        }
        if ($request->filled('internal_status')) {
            $query->where('internal_status', $request->internal_status);
        }
        if ($request->filled('workflow_status')) {
            $query->where('workflow_status', $request->workflow_status);
        }
        if ($request->filled('conversion_status')) {
            $query->where('conversion_status', $request->conversion_status);
        }
        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn($q) => $q
                ->where('external_order_id', 'like', "%{$s}%")
                ->orWhere('external_order_number', 'like', "%{$s}%")
                ->orWhere('customer_name', 'like', "%{$s}%")
                ->orWhere('tracking_number', 'like', "%{$s}%")
                ->orWhere('courier_name', 'like', "%{$s}%")
            );
        }
        if ($request->filled('date_from')) {
            $query->where('order_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('order_date', '<=', $request->date_to . ' 23:59:59');
        }

        $orders   = $query->paginate(20)->withQueryString();
        $accounts = MarketplaceAccount::where('status', 'active')->get(['id', 'account_name', 'marketplace']);
        $warehouses = \App\Models\Warehouse::where('status', 'active')->get(['id', 'name']);

        return Inertia::render('Marketplace/Orders/Index', [
            'orders'            => $orders,
            'accounts'          => $accounts,
            'warehouses'        => $warehouses,
            'filters'           => $request->only([
                'marketplace', 'account_id', 'internal_status', 'workflow_status',
                'conversion_status', 'warehouse_id', 'search', 'date_from', 'date_to'
            ]),
            'internalStatuses'  => MarketplaceOrder::INTERNAL_STATUSES,
            'workflowStatuses'  => MarketplaceOrder::WORKFLOW_STATUSES,
            'conversionStatuses'=> MarketplaceOrder::CONVERSION_STATUSES,
        ]);
    }

    public function show(MarketplaceOrder $marketplaceOrder): \Inertia\Response
    {
        Gate::authorize('marketplace.order.view');

        $marketplaceOrder->load([
            'account', 'items.product', 'salesOrder.items', 'salesOrder.invoice',
            'warehouse', 'stockReservations.product',
        ]);

        $canViewPayload = request()->user()?->hasPermission('marketplace.payload.view');

        // Build traceability chain
        $timeline = $this->buildTimeline($marketplaceOrder);

        return Inertia::render('Marketplace/Orders/Show', [
            'order'          => $marketplaceOrder,
            'canViewPayload' => $canViewPayload,
            'timeline'       => $timeline,
        ]);
    }

    public function convertToSalesOrder(MarketplaceOrder $marketplaceOrder, Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.order.convert');

        $request->validate([
            'warehouse_id' => 'nullable|integer|exists:warehouses,id',
        ]);

        try {
            $updated = $this->fulfillmentService->convertAndReserve(
                $marketplaceOrder,
                $request->user()->id,
                $request->warehouse_id
            );
            return redirect()->route('marketplace.orders.show', $updated)
                ->with('success', "Order berhasil dikonversi ke Sales Order #{$updated->salesOrder?->so_number} dan stok berhasil di-reserve.");
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    public function reserveStock(MarketplaceOrder $marketplaceOrder, Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.order.reserve_stock');

        try {
            $marketplaceOrder->load('items.product', 'warehouse');

            if (! $marketplaceOrder->warehouse) {
                return back()->with('error', 'Pilih gudang terlebih dahulu sebelum melakukan reservasi stok.');
            }

            foreach ($marketplaceOrder->items as $item) {
                if (! $item->product) continue;
                $this->reservationService->reserveStock(
                    $item->product,
                    $marketplaceOrder->warehouse,
                    $item->quantity,
                    $marketplaceOrder,
                    $request->user()->id
                );
            }

            $marketplaceOrder->update(['workflow_status' => 'stock_reserved']);

            return back()->with('success', 'Stok berhasil di-reserve.');
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    public function releaseStock(MarketplaceOrder $marketplaceOrder, Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.order.release_stock');

        $reservations = $marketplaceOrder->stockReservations()
            ->where('status', 'reserved')
            ->get();

        foreach ($reservations as $reservation) {
            $this->reservationService->releaseReservation($reservation);
        }

        if ($marketplaceOrder->workflow_status === 'stock_reserved') {
            $marketplaceOrder->update(['workflow_status' => 'converted_to_so']);
        }

        return back()->with('success', 'Reservasi stok berhasil dilepaskan.');
    }

    public function fulfill(MarketplaceOrder $marketplaceOrder, Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.order.fulfill');

        $request->validate([
            'tracking_number' => 'nullable|string|max:100',
            'courier_name'    => 'nullable|string|max:100',
        ]);

        try {
            $updated = $this->fulfillmentService->fulfillOrder(
                $marketplaceOrder,
                $request->tracking_number,
                $request->courier_name,
                $request->user()->id
            );
            return redirect()->route('marketplace.orders.show', $updated)
                ->with('success', "Order berhasil dikirim. Stok telah dikurangi secara fisik (Stock Movement OUT).");
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    private function buildTimeline(MarketplaceOrder $order): array
    {
        $events = [];

        if ($order->order_date) {
            $events[] = ['label' => 'Order Diterima dari Marketplace', 'at' => $order->order_date, 'done' => true];
        }

        $events[] = [
            'label' => 'SKU Mapped',
            'at'    => $order->updated_at,
            'done'  => $order->allItemsMapped(),
        ];

        $events[] = [
            'label' => 'Dikonversi ke Sales Order',
            'at'    => $order->converted_at,
            'done'  => (bool) $order->converted_at,
        ];

        $events[] = [
            'label' => 'Stok di-Reserve',
            'at'    => $order->stockReservations->first()?->reserved_at,
            'done'  => in_array($order->workflow_status, ['stock_reserved', 'processing', 'shipped', 'completed']),
        ];

        $events[] = [
            'label' => 'Dalam Proses',
            'at'    => null,
            'done'  => in_array($order->workflow_status, ['processing', 'shipped', 'completed']),
        ];

        $events[] = [
            'label' => 'Dikirim',
            'at'    => $order->shipped_at,
            'done'  => (bool) $order->shipped_at,
        ];

        $events[] = [
            'label' => 'Selesai',
            'at'    => $order->completed_at,
            'done'  => (bool) $order->completed_at,
        ];

        return $events;
    }
}
