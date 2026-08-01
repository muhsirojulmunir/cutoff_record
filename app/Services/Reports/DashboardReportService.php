<?php

namespace App\Services\Reports;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class DashboardReportService
{
    public function __construct(
        private readonly SalesReportService $salesReportService,
        private readonly PurchaseReportService $purchaseReportService,
        private readonly InventoryReportService $inventoryReportService,
        private readonly FinancialReportService $financialReportService,
        private readonly MarketplaceReportService $marketplaceReportService,
    ) {}

    /**
     * Get consolidated executive dashboard metrics with optional date range filter.
     */
    public function getDashboardMetrics(string $range = 'this_month', ?string $dateFrom = null, ?string $dateTo = null): array
    {
        [$from, $to] = $this->resolveDateRange($range, $dateFrom, $dateTo);

        $sales       = $this->salesReportService->getSummary($from, $to);
        $salesTrend  = $this->salesReportService->getSalesTrend($from, $to);
        $purchase    = $this->purchaseReportService->getSummary($from, $to);
        $inventory   = $this->inventoryReportService->getSummary();
        $financial   = $this->financialReportService->getSummary($from, $to);
        $marketplace = $this->marketplaceReportService->getSummary($from, $to);

        return [
            'range'        => $range,
            'date_from'    => $from,
            'date_to'      => $to,
            'sales'        => $sales,
            'sales_trend'  => $salesTrend,
            'purchase'     => $purchase,
            'inventory'    => $inventory,
            'financial'    => $financial,
            'marketplace'  => $marketplace,
        ];
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
