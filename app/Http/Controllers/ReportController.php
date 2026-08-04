<?php

namespace App\Http\Controllers;

use App\Services\Reports\FinancialReportService;
use App\Services\Reports\InventoryReportService;
use App\Services\Reports\MarketplaceReportService;
use App\Services\Reports\PurchaseReportService;
use App\Services\Reports\SalesReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(
        private readonly SalesReportService $salesService,
        private readonly PurchaseReportService $purchaseService,
        private readonly InventoryReportService $inventoryService,
        private readonly FinancialReportService $financialService,
        private readonly MarketplaceReportService $marketplaceService,
    ) {}

    public function sales(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.sales.view');

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $summary = $this->salesService->getSummary($dateFrom, $dateTo);
        $trend   = $this->salesService->getSalesTrend($dateFrom, $dateTo);

        return Inertia::render('Reports/Sales', [
            'summary' => $summary,
            'trend'   => $trend,
            'filters' => ['date_from' => $dateFrom, 'date_to' => $dateTo],
        ]);
    }

    public function purchase(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.purchase.view');

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $summary = $this->purchaseService->getSummary($dateFrom, $dateTo);

        return Inertia::render('Reports/Purchase', [
            'summary' => $summary,
            'filters' => ['date_from' => $dateFrom, 'date_to' => $dateTo],
        ]);
    }

    public function inventory(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.inventory.view');

        $summary   = $this->inventoryService->getSummary();
        $overview  = $this->inventoryService->getStockOverview(25);
        $movements = $this->inventoryService->getMovementAnalytics(
            $request->get('date_from'),
            $request->get('date_to')
        );

        return Inertia::render('Reports/Inventory', [
            'summary'   => $summary,
            'overview'  => $overview,
            'movements' => $movements,
            'filters'   => $request->only(['date_from', 'date_to']),
        ]);
    }

    public function financial(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.financial.view');

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $summary     = $this->financialService->getSummary($dateFrom, $dateTo);
        $receivables = $this->financialService->getCustomerReceivables(15);
        $payables    = $this->financialService->getSupplierPayables(15);
        $cashBank    = $this->financialService->getCashBankSummary();

        return Inertia::render('Reports/Financial', [
            'summary'     => $summary,
            'receivables' => $receivables,
            'payables'    => $payables,
            'cashBank'    => $cashBank,
            'filters'     => ['date_from' => $dateFrom, 'date_to' => $dateTo],
        ]);
    }

    public function marketplace(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.marketplace.view');

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $summary = $this->marketplaceService->getSummary($dateFrom, $dateTo);

        return Inertia::render('Reports/Marketplace', [
            'summary' => $summary,
            'filters' => ['date_from' => $dateFrom, 'date_to' => $dateTo],
        ]);
    }

    /**
     * HPP Report — rekap barang keluar berdasarkan invoice.
     *
     * Dihitung dari item invoice (bukan master produk) agar terlihat berapa
     * kuantitas tiap SKU yang benar-benar keluar pada rentang tanggal tertentu,
     * lengkap dengan modal, penjualan, dan keuntungannya. Invoice batal tidak
     * dihitung. Nama dan SKU diambil dari salinan di item invoice supaya baris
     * lama tetap tampil walau produknya sudah dihapus dari master.
     */
    public function hpp(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.purchase.view');

        $search   = $request->input('search');
        $dateFrom = $request->input('date_from');
        $dateTo   = $request->input('date_to');

        $pricing = app(\App\Services\Reports\ProductPricingService::class);

        $baseQuery = \Illuminate\Support\Facades\DB::table('invoice_items')
            ->join('invoices', 'invoices.id', '=', 'invoice_items.invoice_id')
            ->whereNull('invoices.deleted_at')
            ->where('invoices.status', '!=', 'cancelled')
            ->when($dateFrom, fn($q, $from) => $q->whereDate('invoices.invoice_date', '>=', $from))
            ->when($dateTo, fn($q, $to) => $q->whereDate('invoices.invoice_date', '<=', $to))
            ->when($search, function ($q, $keyword) {
                $q->where(function ($inner) use ($keyword) {
                    $inner->where('invoice_items.sku', 'like', "%{$keyword}%")
                          ->orWhere('invoice_items.product_name', 'like', "%{$keyword}%");
                });
            });

        $groupedQuery = (clone $baseQuery)
            ->leftJoinSub(
                $pricing->effectiveCostSubquery(),
                'costs',
                'costs.product_id',
                '=',
                'invoice_items.product_id'
            )
            ->groupBy('invoice_items.product_id', 'invoice_items.sku', 'invoice_items.product_name')
            ->select(
                'invoice_items.product_id',
                'invoice_items.sku',
                'invoice_items.product_name',
                \Illuminate\Support\Facades\DB::raw('SUM(invoice_items.quantity) as qty'),
                \Illuminate\Support\Facades\DB::raw('SUM(invoice_items.subtotal) as total_sales'),
                \Illuminate\Support\Facades\DB::raw('MAX(COALESCE(costs.avg_cost, 0)) as unit_hpp')
            )
            ->orderByDesc(\Illuminate\Support\Facades\DB::raw('SUM(invoice_items.subtotal)'));

        $rows = $groupedQuery->paginate(25)->withQueryString();

        $rows->getCollection()->transform(function ($row) {
            $qty        = (int) $row->qty;
            $totalSales = (float) $row->total_sales;
            $unitHpp    = (float) $row->unit_hpp;
            $totalHpp   = $qty * $unitHpp;

            return [
                'product_id'    => $row->product_id,
                'sku'           => $row->sku,
                'product_name'  => $row->product_name,
                'qty'           => $qty,
                'unit_hpp'      => round($unitHpp, 2),
                // Harga jual rata-rata yang benar-benar tertagih di invoice.
                'unit_price'    => $qty > 0 ? round($totalSales / $qty, 2) : 0.0,
                'total_hpp'     => round($totalHpp, 2),
                'total_sales'   => round($totalSales, 2),
                'margin'        => round($totalSales - $totalHpp, 2),
            ];
        });

        // Grand total dihitung atas seluruh hasil filter, bukan hanya halaman ini.
        $totals = \Illuminate\Support\Facades\DB::query()
            ->fromSub($groupedQuery->reorder(), 'summary')
            ->selectRaw('COALESCE(SUM(qty), 0) as qty')
            ->selectRaw('COALESCE(SUM(total_sales), 0) as total_sales')
            ->selectRaw('COALESCE(SUM(qty * unit_hpp), 0) as total_hpp')
            ->first();

        $grandSales = (float) ($totals->total_sales ?? 0);
        $grandHpp   = (float) ($totals->total_hpp ?? 0);

        return Inertia::render('Reports/Hpp', [
            'rows'    => $rows,
            'filters' => $request->only('search', 'date_from', 'date_to'),
            'summary' => [
                'qty'         => (int) ($totals->qty ?? 0),
                'total_hpp'   => round($grandHpp, 2),
                'total_sales' => round($grandSales, 2),
                'margin'      => round($grandSales - $grandHpp, 2),
                'margin_percentage' => $grandSales > 0
                    ? round((($grandSales - $grandHpp) / $grandSales) * 100, 1)
                    : 0.0,
            ],
        ]);
    }


    public function salesSummary(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.sales.view');

        $dateFrom     = $request->input('date_from');
        $dateTo       = $request->input('date_to');
        $salesChannel = $request->input('sales_channel');

        // Pre-fetch weighted average HPP per product
        $poCosts = \App\Models\PurchaseOrderItem::select(
                'product_id',
                \Illuminate\Support\Facades\DB::raw('SUM(COALESCE(NULLIF(accepted_quantity, 0), received_quantity, quantity) * COALESCE(validated_unit_price, unit_price)) as total_cost'),
                \Illuminate\Support\Facades\DB::raw('SUM(COALESCE(NULLIF(accepted_quantity, 0), received_quantity, quantity)) as total_qty')
            )
            ->whereHas('purchaseOrder', function ($q) {
                $q->whereIn('status', ['received', 'finance_validated', 'partially_received']);
            })
            ->groupBy('product_id')
            ->get();

        $hppMap = [];
        foreach ($poCosts as $cost) {
            if ($cost->total_qty > 0) {
                $hppMap[$cost->product_id] = (float) ($cost->total_cost / $cost->total_qty);
            }
        }

        // Fetch products for fallback purchase_price
        $productMasterPrices = \App\Models\Product::pluck('purchase_price', 'id')->toArray();

        $query = \App\Models\SalesOrder::with(['customer', 'items.product'])
            ->where('status', '!=', 'cancelled')
            ->orderBy('order_date', 'desc');

        if ($dateFrom) {
            $query->whereDate('order_date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('order_date', '<=', $dateTo);
        }
        if ($salesChannel) {
            $query->where('sales_channel', $salesChannel);
        }

        $orders = $query->paginate(20)->withQueryString();

        $totalRevenue = 0.0;
        $totalHpp     = 0.0;

        // Transform orders to calculate order-level HPP and margin
        $orders->getCollection()->transform(function ($so) use (&$totalRevenue, &$totalHpp, $hppMap, $productMasterPrices) {
            $orderRevenue = (float) $so->grand_total;
            $orderHpp     = 0.0;

            foreach ($so->items as $item) {
                $unitHpp = $hppMap[$item->product_id] ?? (float) ($productMasterPrices[$item->product_id] ?? 0);
                $orderHpp += ($item->quantity * $unitHpp);
            }

            $orderMargin    = $orderRevenue - $orderHpp;
            $orderMarginPct = $orderRevenue > 0 ? (($orderMargin / $orderRevenue) * 100) : 0;

            $so->calculated_hpp        = round($orderHpp, 2);
            $so->calculated_margin     = round($orderMargin, 2);
            $so->calculated_margin_pct = round($orderMarginPct, 1);

            $totalRevenue += $orderRevenue;
            $totalHpp     += $orderHpp;

            return $so;
        });

        $totalMargin    = $totalRevenue - $totalHpp;
        $totalMarginPct = $totalRevenue > 0 ? (($totalMargin / $totalRevenue) * 100) : 0;

        return Inertia::render('Reports/SalesSummary', [
            'orders'  => $orders,
            'filters' => $request->only('date_from', 'date_to', 'sales_channel'),
            'summary' => [
                'total_revenue'    => round($totalRevenue, 2),
                'total_hpp'        => round($totalHpp, 2),
                'total_margin'     => round($totalMargin, 2),
                'margin_percentage'=> round($totalMarginPct, 1),
            ],
        ]);
    }

    public function productVelocity(Request $request): \Inertia\Response
    {
        Gate::authorize('reports.sales.view');

        $days       = (int) ($request->input('days') ?? 30);
        $categoryId = $request->input('category_id');
        $startDate  = now()->subDays($days)->startOfDay();

        $soSubquery = \App\Models\SalesOrderItem::select(
                'product_id',
                \Illuminate\Support\Facades\DB::raw('SUM(quantity) as total_sold_qty'),
                \Illuminate\Support\Facades\DB::raw('SUM(subtotal) as total_sold_amount')
            )
            ->whereHas('salesOrder', function ($q) use ($startDate) {
                $q->where('status', '!=', 'cancelled')
                  ->where('order_date', '>=', $startDate);
            })
            ->groupBy('product_id');

        $query = \App\Models\Product::with('category')
            ->leftJoinSub($soSubquery, 'so_sales', function ($join) {
                $join->on('products.id', '=', 'so_sales.product_id');
            })
            ->select(
                'products.*',
                \Illuminate\Support\Facades\DB::raw('COALESCE(so_sales.total_sold_qty, 0) as total_sold_qty'),
                \Illuminate\Support\Facades\DB::raw('COALESCE(so_sales.total_sold_amount, 0) as total_sold_amount')
            );

        if ($categoryId) {
            $query->where('products.category_id', $categoryId);
        }

        $allProducts = $query->get();

        // Hero Products (Fast Moving) - sorted by Qty desc
        $heroProducts = $allProducts->where('total_sold_qty', '>', 0)
            ->sortByDesc('total_sold_qty')
            ->values()
            ->take(20);

        // Slow Moving Products - sorted by Qty asc (min 1 sold)
        $slowProducts = $allProducts->where('total_sold_qty', '>', 0)
            ->sortBy('total_sold_qty')
            ->values()
            ->take(20);

        // Dead Stock Products - 0 sold in period but physical stock > 0
        $deadStockProducts = $allProducts->where('total_sold_qty', '==', 0)
            ->where('stock', '>', 0)
            ->sortByDesc('stock')
            ->values()
            ->take(20);

        $categories = \App\Models\Category::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Reports/ProductVelocity', [
            'heroProducts'      => $heroProducts,
            'slowProducts'      => $slowProducts,
            'deadStockProducts' => $deadStockProducts,
            'categories'        => $categories,
            'filters'           => [
                'days'        => $days,
                'category_id' => $categoryId,
            ],
            'summary' => [
                'hero_count'       => $allProducts->where('total_sold_qty', '>', 5)->count(),
                'slow_count'       => $allProducts->where('total_sold_qty', '>', 0)->where('total_sold_qty', '<=', 5)->count(),
                'dead_stock_count' => $allProducts->where('total_sold_qty', '==', 0)->where('stock', '>', 0)->count(),
            ],
        ]);
    }



    public function export(string $type, Request $request): StreamedResponse
    {
        Gate::authorize('reports.export');

        $filename = "report_{$type}_" . date('Ymd_His') . ".csv";

        return response()->stream(function () use ($type, $request) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['sep=,']); // CSV header

            if ($type === 'sales') {
                fputcsv($handle, ['Order Date', 'SO Number', 'Customer', 'Channel', 'Status', 'Grand Total']);
                $orders = \App\Models\SalesOrder::with('customer')->latest('order_date')->get();
                foreach ($orders as $so) {
                    fputcsv($handle, [
                        $so->order_date->format('d/m/Y'),
                        $so->so_number,
                        $so->customer?->name ?? '-',
                        $so->sales_channel,
                        $so->status,
                        $so->grand_total,
                    ]);
                }
            } elseif ($type === 'inventory') {
                fputcsv($handle, ['SKU', 'Product Name', 'Physical Stock', 'Reserved Stock', 'Available Stock', 'Status']);
                $overview = $this->inventoryService->getStockOverview(1000);
                foreach ($overview as $row) {
                    fputcsv($handle, [
                        $row['sku'],
                        $row['name'],
                        $row['physical_stock'],
                        $row['reserved_stock'],
                        $row['available_stock'],
                        $row['status'],
                    ]);
                }
            } elseif ($type === 'receivables') {
                fputcsv($handle, ['Invoice Number', 'Customer', 'Due Date', 'Total Amount', 'Paid Amount', 'Remaining', 'Status']);
                $invoices = \App\Models\Invoice::with('customer')->latest('due_date')->get();
                foreach ($invoices as $inv) {
                    $rem = max(0, $inv->grand_total - $inv->paid_amount);
                    fputcsv($handle, [
                        $inv->invoice_number,
                        $inv->customer?->name ?? '-',
                        $inv->due_date ? $inv->due_date->format('d/m/Y') : '-',
                        $inv->grand_total,
                        $inv->paid_amount,
                        $rem,
                        $inv->status,
                    ]);
                }
            } elseif ($type === 'marketplace') {
                fputcsv($handle, ['Platform', 'External Order ID', 'Customer', 'Tracking Number', 'Status', 'Workflow', 'Total']);
                $orders = \App\Models\MarketplaceOrder::latest('order_date')->get();
                foreach ($orders as $mo) {
                    fputcsv($handle, [
                        $mo->marketplace,
                        $mo->external_order_id,
                        $mo->customer_name ?? '-',
                        $mo->tracking_number ?? '-',
                        $mo->internal_status,
                        $mo->workflow_status,
                        $mo->total_amount,
                    ]);
                }
            }

            fclose($handle);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
