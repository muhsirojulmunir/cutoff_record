<?php

namespace App\Services\Reports;

use App\Models\MarketplaceOrder;
use Illuminate\Support\Facades\DB;

class MarketplaceReportService
{
    public function getSummary(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $query = MarketplaceOrder::query();

        if ($dateFrom) $query->where('order_date', '>=', $dateFrom);
        if ($dateTo)   $query->where('order_date', '<=', $dateTo . ' 23:59:59');

        $totalOrders   = (clone $query)->count();
        $totalAmount   = (float) (clone $query)->sum('total_amount');
        $shopeeOrders  = (clone $query)->where('marketplace', 'shopee')->count();
        $tiktokOrders  = (clone $query)->where('marketplace', 'tiktok_shop')->count();

        $convertedCount = (clone $query)->where('conversion_status', 'converted')->count();
        $readyCount     = (clone $query)->where('conversion_status', 'ready')->count();
        $unconvertedCount = (clone $query)->where('conversion_status', 'not_converted')->count();

        $shippedCount   = (clone $query)->where('workflow_status', 'shipped')->count();
        $completedCount = (clone $query)->where('workflow_status', 'completed')->count();
        $cancelledCount = (clone $query)->where('workflow_status', 'cancelled')->count();
        $insufficientCount = (clone $query)->where('workflow_status', 'stock_insufficient')->count();
        $mappingRequiredCount = (clone $query)->where('workflow_status', 'mapping_required')->count();

        // Fulfillment Pipeline breakdown
        $pipeline = [
            'pending'            => (clone $query)->where('workflow_status', 'pending')->count(),
            'ready_to_process'   => (clone $query)->where('workflow_status', 'ready_to_process')->count(),
            'converted_to_so'    => (clone $query)->where('workflow_status', 'converted_to_so')->count(),
            'stock_reserved'     => (clone $query)->where('workflow_status', 'stock_reserved')->count(),
            'processing'         => (clone $query)->where('workflow_status', 'processing')->count(),
            'shipped'            => $shippedCount,
            'completed'          => $completedCount,
            'cancelled'          => $cancelledCount,
            'stock_insufficient' => $insufficientCount,
            'mapping_required'   => $mappingRequiredCount,
        ];

        // Revenue by platform
        $platformBreakdown = (clone $query)
            ->select('marketplace', DB::raw('count(*) as count'), DB::raw('sum(total_amount) as total'))
            ->groupBy('marketplace')
            ->get()
            ->map(fn($row) => [
                'platform' => $row->marketplace,
                'count'    => (int) $row->count,
                'total'    => (float) $row->total,
            ])
            ->toArray();

        return [
            'total_orders'         => $totalOrders,
            'total_amount'         => $totalAmount,
            'shopee_orders'        => $shopeeOrders,
            'tiktok_orders'        => $tiktokOrders,
            'converted_count'      => $convertedCount,
            'ready_count'          => $readyCount,
            'unconverted_count'    => $unconvertedCount,
            'shipped_count'        => $shippedCount,
            'completed_count'      => $completedCount,
            'cancelled_count'      => $cancelledCount,
            'insufficient_count'   => $insufficientCount,
            'mapping_required_count'=> $mappingRequiredCount,
            'pipeline'             => $pipeline,
            'platform_breakdown'   => $platformBreakdown,
        ];
    }
}
