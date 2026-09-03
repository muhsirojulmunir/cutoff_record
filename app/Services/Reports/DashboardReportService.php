<?php

namespace App\Services\Reports;

use App\Models\PettyCashTransaction;
use App\Models\SalesOrder;
use App\Models\SalesOrderItem;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardReportService
{
    public function __construct(
        private readonly SalesReportService $salesReportService,
        private readonly PurchaseReportService $purchaseReportService,
        private readonly InventoryReportService $inventoryReportService,
        private readonly FinancialReportService $financialReportService,
        private readonly MarketplaceReportService $marketplaceReportService,
        private readonly ProductPricingService $pricingService,
    ) {}

    /**
     * Get consolidated executive dashboard metrics with optional date range filter.
     */
    public function getDashboardMetrics(
        string $range = 'this_month',
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?string $channel = null,
    ): array {
        [$from, $to] = $this->resolveDateRange($range, $dateFrom, $dateTo);

        $sales       = $this->salesReportService->getSummary($from, $to);
        $salesTrend  = $this->salesReportService->getSalesTrend($from, $to);
        $purchase    = $this->purchaseReportService->getSummary($from, $to);
        $inventory   = $this->inventoryReportService->getSummary();
        $financial   = $this->financialReportService->getSummary($from, $to);
        $marketplace = $this->marketplaceReportService->getSummary($from, $to);

        return [
            'range'          => $range,
            'date_from'      => $from,
            'date_to'        => $to,
            'sales'          => $sales,
            'sales_trend'    => $salesTrend,
            'purchase'       => $purchase,
            'inventory'      => $inventory,
            'financial'      => $financial,
            'marketplace'    => $marketplace,
            'channel'        => $channel,
            'channels'       => $this->getChannels(),
            'channel_trend'  => $this->getChannelTrend($from, $to, $channel),
            'today'          => $this->getTodayPerformance($channel),
            'period'         => $this->getPeriodPerformance($from, $to, $channel),
            'profit_funnel'  => $this->getProfitFunnel($from, $to, $channel),
            'top_products'   => $this->getTopProfitableProducts($from, $to, $channel),
        ];
    }

    /**
     * Omset harian dipecah per channel penjualan — sumber data grafik garis.
     *
     * @return array{dates: array<int, string>, series: array<int, array{channel: string, total: float, points: array<int, float>}>}
     */
    public function getChannelTrend(string $from, string $to, ?string $channel = null): array
    {
        $rows = SalesOrder::whereBetween('order_date', [$from, $to])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->when($channel, fn ($query) => $query->where('sales_channel', $channel))
            ->select(
                DB::raw('DATE(order_date) as date'),
                'sales_channel',
                DB::raw('SUM(grand_total) as total'),
            )
            ->groupBy(DB::raw('DATE(order_date)'), 'sales_channel')
            ->orderBy('date')
            ->get();

        if ($rows->isEmpty()) {
            return ['dates' => [], 'series' => []];
        }

        $dates = $rows->pluck('date')->unique()->sort()->values()->all();

        $series = $rows->groupBy('sales_channel')
            ->map(function ($channelRows, $channelName) use ($dates) {
                $byDate = $channelRows->keyBy('date');

                return [
                    'channel' => $channelName ?: 'manual',
                    'total'   => (float) $channelRows->sum('total'),
                    'points'  => array_map(
                        fn ($date) => (float) ($byDate[$date]->total ?? 0),
                        $dates
                    ),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        return ['dates' => $dates, 'series' => $series];
    }

    /**
     * Daftar channel penjualan yang benar-benar dipakai, untuk pemilih di dashboard.
     *
     * @return array<int, string>
     */
    public function getChannels(): array
    {
        return SalesOrder::query()
            ->whereNotNull('sales_channel')
            ->distinct()
            ->orderBy('sales_channel')
            ->pluck('sales_channel')
            ->all();
    }

    /**
     * Performa hari ini beserta perbandingannya terhadap kemarin.
     * Dipakai kartu ringkas di bagian atas dashboard.
     */
    public function getTodayPerformance(?string $channel = null): array
    {
        $today     = Carbon::today()->toDateString();
        $yesterday = Carbon::yesterday()->toDateString();

        $todayStats     = $this->dayStats($today, $channel);
        $yesterdayStats = $this->dayStats($yesterday, $channel);

        return [
            'date'          => $today,
            'revenue'       => $todayStats['revenue'],
            'net_profit'    => $todayStats['net_profit'],
            'orders'        => $todayStats['orders'],
            'shipped'       => $todayStats['shipped'],
            'growth'        => [
                'revenue'    => $this->growth($todayStats['revenue'], $yesterdayStats['revenue']),
                'net_profit' => $this->growth($todayStats['net_profit'], $yesterdayStats['net_profit']),
                'orders'     => $this->growth($todayStats['orders'], $yesterdayStats['orders']),
                'shipped'    => $this->growth($todayStats['shipped'], $yesterdayStats['shipped']),
            ],
            'yesterday'     => $yesterdayStats,
        ];
    }

    /**
     * Dasar perhitungan modal: item Sales Order digabung dengan HPP rata-rata
     * dari penerimaan Purchase Order. Rentang tanggalnya ditentukan pemanggil.
     */
    private function cogsQuery(?string $channel): \Illuminate\Database\Eloquent\Builder
    {
        return SalesOrderItem::query()
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->leftJoinSub($this->pricingService->effectiveCostSubquery(), 'po_costs', 'po_costs.product_id', '=', 'sales_order_items.product_id')
            ->whereNull('sales_orders.deleted_at')
            ->whereNotIn('sales_orders.status', ['cancelled', 'rejected'])
            ->when($channel, fn ($query) => $query->where('sales_orders.sales_channel', $channel));
    }

    /**
     * Angka penjualan satu hari: omset, laba bersih, jumlah order, dan
     * order yang sudah dikirim (punya nomor resi).
     */
    private function dayStats(string $date, ?string $channel = null): array
    {
        $base = SalesOrder::whereDate('order_date', $date)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->when($channel, fn ($query) => $query->where('sales_channel', $channel));

        $revenue   = (float) (clone $base)->sum('grand_total');
        $orders    = (clone $base)->count();
        $shipped   = (clone $base)->whereNotNull('tracking_number')->count();
        $shipping  = (float) (clone $base)->sum('shipping_cost');
        $adminFees = (float) (clone $base)->sum('admin_fee') + (float) (clone $base)->sum('other_fee');

        // Modal memakai HPP rata-rata dari penerimaan Purchase Order.
        $cogs = (float) $this->cogsQuery($channel)
            ->whereDate('sales_orders.order_date', $date)
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));

        $expenses = (float) PettyCashTransaction::whereDate('transaction_date', $date)
            ->whereIn('status', ['approved', 'paid'])
            ->sum('amount');

        $netSales    = max(0, $revenue - $shipping);
        $grossProfit = max(0, $netSales - $cogs);
        $totalExpenses = $expenses + $adminFees;
        $netProfit   = $revenue > 0 ? ($grossProfit - $totalExpenses) : (0.0 - $expenses);

        return [
            'revenue'      => $revenue,
            'cogs'         => $cogs,
            'expenses'     => $totalExpenses,
            'gross_profit' => $grossProfit,
            'net_profit'   => $netProfit,
            'orders'       => $orders,
            'shipped'      => $shipped,
        ];
    }

    /**
     * Angka penjualan pada rentang periode terpilih (hari ini, minggu ini, bulan ini, tahun ini).
     */
    public function getPeriodPerformance(string $from, string $to, ?string $channel = null): array
    {
        $base = SalesOrder::whereBetween('order_date', [$from, $to])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->when($channel, fn ($query) => $query->where('sales_channel', $channel));

        $revenue = (float) (clone $base)->sum('grand_total');
        $orders  = (clone $base)->count();
        $shipped = (clone $base)->whereNotNull('tracking_number')->count();
        $adminFees = (float) (clone $base)->sum('admin_fee') + (float) (clone $base)->sum('other_fee');
        $shipping = (float) (clone $base)->sum('shipping_cost');

        $cogs = (float) $this->cogsQuery($channel)
            ->whereBetween('sales_orders.order_date', [$from, $to])
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));

        $expenses = (float) PettyCashTransaction::whereBetween('transaction_date', [$from, $to])
            ->whereIn('status', ['approved', 'paid'])
            ->sum('amount');

        $netSales = max(0, $revenue - $shipping);
        $grossProfit = max(0, $netSales - $cogs);
        $totalExpenses = $expenses + $adminFees;
        $netProfit = $revenue > 0 ? ($grossProfit - $totalExpenses) : (0.0 - $expenses);

        return [
            'revenue'      => $revenue,
            'cogs'         => $cogs,
            'expenses'     => $totalExpenses,
            'gross_profit' => $grossProfit,
            'net_profit'   => $netProfit,
            'orders'       => $orders,
            'shipped'      => $shipped,
        ];
    }

    /**
     * Alur laba dari omset sampai laba bersih, ditampilkan sebagai corong.
     */
    public function getProfitFunnel(string $from, string $to, ?string $channel = null): array
    {
        $base = SalesOrder::whereBetween('order_date', [$from, $to])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->when($channel, fn ($query) => $query->where('sales_channel', $channel));

        $revenue   = (float) (clone $base)->sum('grand_total');
        $shipping  = (float) (clone $base)->sum('shipping_cost');
        $discount  = (float) (clone $base)->sum('discount_amount');
        $adminFee  = (float) (clone $base)->sum('admin_fee');
        $otherFee  = (float) (clone $base)->sum('other_fee');

        $cogs = (float) $this->cogsQuery($channel)
            ->whereBetween('sales_orders.order_date', [$from, $to])
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));

        $expenses = (float) PettyCashTransaction::whereBetween('transaction_date', [$from, $to])
            ->whereIn('status', ['approved', 'paid'])
            ->sum('amount');

        // Omset bersih barang di luar ongkir titipan
        $netSales = max(0, $revenue - $shipping);
        $grossProfit = max(0, $netSales - $cogs);
        $totalExpenses = $expenses + $adminFee + $otherFee;
        $netProfit = $revenue > 0 ? ($grossProfit - $totalExpenses) : (0.0 - $expenses);

        return [
            'revenue'      => $revenue,
            'cogs'         => $cogs,
            'gross_profit' => $grossProfit,
            'discount'     => $discount,
            'shipping'     => $shipping,
            'expenses'     => $totalExpenses,
            'net_profit'   => $netProfit,
            'margin'       => $revenue > 0 ? round(($netProfit / $revenue) * 100, 2) : 0.0,
        ];
    }

    /**
     * Produk dengan kontribusi laba terbesar pada rentang tanggal terpilih.
     */
    public function getTopProfitableProducts(string $from, string $to, ?string $channel = null, int $limit = 8): array
    {
        return SalesOrderItem::query()
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->leftJoinSub($this->pricingService->effectiveCostSubquery(), 'po_costs', 'po_costs.product_id', '=', 'sales_order_items.product_id')
            ->whereBetween('sales_orders.order_date', [$from, $to])
            ->whereNotIn('sales_orders.status', ['cancelled', 'rejected'])
            ->when($channel, fn ($query) => $query->where('sales_orders.sales_channel', $channel))
            ->groupBy('sales_order_items.product_id', 'sales_order_items.product_name', 'sales_order_items.sku')
            ->select(
                'sales_order_items.product_id',
                'sales_order_items.product_name',
                'sales_order_items.sku',
                DB::raw('SUM(sales_order_items.quantity) as qty'),
                DB::raw('SUM(sales_order_items.subtotal) as revenue'),
                DB::raw('SUM(sales_order_items.subtotal - (sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0))) as profit'),
            )
            ->orderByDesc('profit')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'product_id' => $row->product_id,
                'name'       => $row->product_name,
                'sku'        => $row->sku,
                'qty'        => (int) $row->qty,
                'revenue'    => (float) $row->revenue,
                'profit'     => (float) $row->profit,
            ])
            ->toArray();
    }

    /** Persentase pertumbuhan; nol pada pembanding menghasilkan null agar tidak menyesatkan. */
    private function growth(float $current, float $previous): ?float
    {
        if ($previous == 0.0) {
            return $current > 0 ? null : 0.0;
        }

        return round((($current - $previous) / abs($previous)) * 100, 2);
    }

    /**
     * Resolve preset or custom date range string to [from, to].
     */
    public function resolveDateRange(string $range, ?string $customFrom = null, ?string $customTo = null): array
    {
        $now = Carbon::now();

        return match ($range) {
            'today' => [
                $now->toDateString(),
                $now->toDateString(),
            ],
            'this_week' => [
                $now->copy()->startOfWeek()->toDateString(),
                $now->copy()->endOfWeek()->toDateString(),
            ],
            'this_year' => [
                $now->copy()->startOfYear()->toDateString(),
                $now->copy()->endOfYear()->toDateString(),
            ],
            'custom' => [
                $customFrom ?? $now->copy()->startOfMonth()->toDateString(),
                $customTo ?? $now->toDateString(),
            ],
            default => [ // 'this_month'
                $now->copy()->startOfMonth()->toDateString(),
                $now->copy()->endOfMonth()->toDateString(),
            ],
        };
    }
}
