<?php

namespace App\Services\Reports;

use App\Models\MarketplaceOrder;
use App\Models\SalesOrder;
use App\Models\SalesOrderItem;
use Illuminate\Support\Facades\DB;

class MarketplaceReportService
{
    public function __construct(
        private readonly ProductPricingService $pricingService,
    ) {}

    public function getSummary(?string $dateFrom = null, ?string $dateTo = null): array
    {
        // 1. Ambil pesanan marketplace dari sales_orders (hasil impor Shopee & TikTok & Form SO)
        $soQuery = SalesOrder::whereIn('sales_channel', ['shopee', 'tiktok'])
            ->whereNotIn('status', ['cancelled', 'rejected']);

        if ($dateFrom) $soQuery->where('order_date', '>=', $dateFrom);
        if ($dateTo)   $soQuery->where('order_date', '<=', $dateTo . ' 23:59:59');

        $soOrders = (clone $soQuery)->get();
        $totalOrders = $soOrders->count();
        $totalRevenue = (float) $soOrders->sum('grand_total');
        $totalShipping = (float) $soOrders->sum('shipping_cost');
        $totalAdminFee = (float) $soOrders->sum('admin_fee') + (float) $soOrders->sum('other_fee');
        $totalDiscount = (float) $soOrders->sum('discount_amount');

        // HPP barang terjual di marketplace
        $totalCogs = (float) SalesOrderItem::query()
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->leftJoinSub($this->pricingService->effectiveCostSubquery(), 'po_costs', 'po_costs.product_id', '=', 'sales_order_items.product_id')
            ->whereIn('sales_orders.sales_channel', ['shopee', 'tiktok'])
            ->whereNotIn('sales_orders.status', ['cancelled', 'rejected'])
            ->whereNull('sales_orders.deleted_at')
            ->when($dateFrom, fn($q) => $q->where('sales_orders.order_date', '>=', $dateFrom))
            ->when($dateTo, fn($q) => $q->where('sales_orders.order_date', '<=', $dateTo . ' 23:59:59'))
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));

        // Laba Bersih Marketplace = (Omset - Ongkir) - HPP - Biaya Admin Marketplace
        $grossProfit = max(0, ($totalRevenue - $totalShipping) - $totalCogs);
        $netProfit = $totalRevenue > 0 ? ($grossProfit - $totalAdminFee) : 0.0;

        // Shopee Breakdown
        $shopeeOrdersList = $soOrders->where('sales_channel', 'shopee');
        $shopeeCount = $shopeeOrdersList->count();
        $shopeeRevenue = (float) $shopeeOrdersList->sum('grand_total');
        $shopeeShipping = (float) $shopeeOrdersList->sum('shipping_cost');
        $shopeeAdmin = (float) $shopeeOrdersList->sum('admin_fee') + (float) $shopeeOrdersList->sum('other_fee');
        $shopeeCogs = (float) SalesOrderItem::query()
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->leftJoinSub($this->pricingService->effectiveCostSubquery(), 'po_costs', 'po_costs.product_id', '=', 'sales_order_items.product_id')
            ->where('sales_orders.sales_channel', 'shopee')
            ->whereNotIn('sales_orders.status', ['cancelled', 'rejected'])
            ->whereNull('sales_orders.deleted_at')
            ->when($dateFrom, fn($q) => $q->where('sales_orders.order_date', '>=', $dateFrom))
            ->when($dateTo, fn($q) => $q->where('sales_orders.order_date', '<=', $dateTo . ' 23:59:59'))
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));
        $shopeeNetProfit = $shopeeRevenue > 0 ? max(0, ($shopeeRevenue - $shopeeShipping) - $shopeeCogs) - $shopeeAdmin : 0.0;

        // TikTok Breakdown
        $tiktokOrdersList = $soOrders->where('sales_channel', 'tiktok');
        $tiktokCount = $tiktokOrdersList->count();
        $tiktokRevenue = (float) $tiktokOrdersList->sum('grand_total');
        $tiktokShipping = (float) $tiktokOrdersList->sum('shipping_cost');
        $tiktokAdmin = (float) $tiktokOrdersList->sum('admin_fee') + (float) $tiktokOrdersList->sum('other_fee');
        $tiktokCogs = (float) SalesOrderItem::query()
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->leftJoinSub($this->pricingService->effectiveCostSubquery(), 'po_costs', 'po_costs.product_id', '=', 'sales_order_items.product_id')
            ->where('sales_orders.sales_channel', 'tiktok')
            ->whereNotIn('sales_orders.status', ['cancelled', 'rejected'])
            ->whereNull('sales_orders.deleted_at')
            ->when($dateFrom, fn($q) => $q->where('sales_orders.order_date', '>=', $dateFrom))
            ->when($dateTo, fn($q) => $q->where('sales_orders.order_date', '<=', $dateTo . ' 23:59:59'))
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));
        $tiktokNetProfit = $tiktokRevenue > 0 ? max(0, ($tiktokRevenue - $tiktokShipping) - $tiktokCogs) - $tiktokAdmin : 0.0;

        // Hitung juga data dari tabel MarketplaceOrder (API) bila ada
        $mpApiQuery = MarketplaceOrder::query();
        if ($dateFrom) $mpApiQuery->where('order_date', '>=', $dateFrom);
        if ($dateTo)   $mpApiQuery->where('order_date', '<=', $dateTo . ' 23:59:59');

        $shippedCount = $soOrders->whereNotNull('tracking_number')->count() + (clone $mpApiQuery)->where('workflow_status', 'shipped')->count();
        $completedCount = $soOrders->where('status', 'completed')->count() + (clone $mpApiQuery)->where('workflow_status', 'completed')->count();
        $cancelledCount = $soOrders->where('status', 'cancelled')->count() + (clone $mpApiQuery)->where('workflow_status', 'cancelled')->count();

        return [
            'total_orders'         => $totalOrders + (clone $mpApiQuery)->count(),
            'total_amount'         => $totalRevenue + (float) (clone $mpApiQuery)->sum('total_amount'),
            'total_revenue'        => $totalRevenue,
            'total_cogs'           => $totalCogs,
            'total_admin_fee'      => $totalAdminFee,
            'total_discount'       => $totalDiscount,
            'total_net_profit'     => $netProfit,
            'shopee_orders'        => $shopeeCount + (clone $mpApiQuery)->where('marketplace', 'shopee')->count(),
            'shopee_revenue'       => $shopeeRevenue,
            'shopee_net_profit'    => $shopeeNetProfit,
            'tiktok_orders'        => $tiktokCount + (clone $mpApiQuery)->where('marketplace', 'tiktok_shop')->count(),
            'tiktok_revenue'       => $tiktokRevenue,
            'tiktok_net_profit'    => $tiktokNetProfit,
            'shipped_count'        => $shippedCount,
            'completed_count'      => $completedCount,
            'cancelled_count'      => $cancelledCount,
            'platform_breakdown'   => [
                [
                    'platform'   => 'shopee',
                    'count'      => $shopeeCount,
                    'total'      => $shopeeRevenue,
                    'net_profit' => $shopeeNetProfit,
                ],
                [
                    'platform'   => 'tiktok',
                    'count'      => $tiktokCount,
                    'total'      => $tiktokRevenue,
                    'net_profit' => $tiktokNetProfit,
                ],
            ],
            'pipeline' => [
                'pending'   => $soOrders->where('status', 'draft')->count(),
                'shipped'   => $shippedCount,
                'completed' => $completedCount,
                'cancelled' => $cancelledCount,
            ],
        ];
    }
}
