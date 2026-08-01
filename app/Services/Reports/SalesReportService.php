<?php

namespace App\Services\Reports;

use App\Models\SalesOrder;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class SalesReportService
{
    /**
     * Get Sales summary metrics for a given date range.
     */
    public function getSummary(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $query = SalesOrder::query();

        if ($dateFrom) {
            $query->where('order_date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('order_date', '<=', $dateTo);
        }

        $totalOrders   = (clone $query)->count();
        $totalRevenue  = (clone $query)->whereNotIn('status', ['cancelled', 'rejected'])->sum('grand_total');
        $todayOrders   = SalesOrder::whereDate('order_date', Carbon::today())->count();
        $todayRevenue  = SalesOrder::whereDate('order_date', Carbon::today())->whereNotIn('status', ['cancelled', 'rejected'])->sum('grand_total');
        $monthOrders   = SalesOrder::whereMonth('order_date', Carbon::now()->month)->whereYear('order_date', Carbon::now()->year)->count();
        $monthRevenue  = SalesOrder::whereMonth('order_date', Carbon::now()->month)->whereYear('order_date', Carbon::now()->year)->whereNotIn('status', ['cancelled', 'rejected'])->sum('grand_total');

        // Status breakdown
        $statusBreakdown = (clone $query)
            ->select('status', DB::raw('count(*) as count'), DB::raw('sum(grand_total) as total'))
            ->groupBy('status')
            ->get()
            ->pluck('count', 'status')
            ->toArray();

        // Channel breakdown
        $channelBreakdown = (clone $query)
            ->select('sales_channel', DB::raw('count(*) as count'), DB::raw('sum(grand_total) as total'))
            ->groupBy('sales_channel')
            ->get()
            ->map(fn($row) => [
                'channel' => $row->sales_channel ?? 'manual',
                'count'   => (int) $row->count,
                'total'   => (float) $row->total,
            ])
            ->toArray();

        return [
            'total_orders'      => $totalOrders,
            'total_revenue'     => (float) $totalRevenue,
            'today_orders'      => $todayOrders,
            'today_revenue'     => (float) $todayRevenue,
            'month_orders'      => $monthOrders,
            'month_revenue'     => (float) $monthRevenue,
            'status_breakdown'  => $statusBreakdown,
            'channel_breakdown' => $channelBreakdown,
        ];
    }

    /**
     * Get Sales Trend over time.
     */
    public function getSalesTrend(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $dateFrom = $dateFrom ?? Carbon::now()->subDays(30)->toDateString();
        $dateTo   = $dateTo ?? Carbon::now()->toDateString();

        $rows = SalesOrder::whereDate('order_date', '>=', $dateFrom)
            ->whereDate('order_date', '<=', $dateTo)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->select(
                DB::raw('DATE(order_date) as date'),
                DB::raw('count(*) as count'),
                DB::raw('sum(grand_total) as total')
            )
            ->groupBy(DB::raw('DATE(order_date)'))
            ->orderBy('date', 'asc')
            ->get();

        return $rows->map(fn($r) => [
            'date'  => $r->date,
            'count' => (int) $r->count,
            'total' => (float) $r->total,
        ])->toArray();
    }
}
