<?php

namespace App\Services\Reports;

use App\Models\PurchaseOrder;
use Illuminate\Support\Facades\DB;

class PurchaseReportService
{
    public function getSummary(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $query = PurchaseOrder::query();

        if ($dateFrom) {
            $query->where('order_date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('order_date', '<=', $dateTo);
        }

        $totalOrders   = (clone $query)->count();
        $totalAmount   = (clone $query)->whereNotIn('status', ['cancelled', 'rejected'])->sum('grand_total');

        $statusBreakdown = (clone $query)
            ->select('status', DB::raw('count(*) as count'), DB::raw('sum(grand_total) as total'))
            ->groupBy('status')
            ->get()
            ->pluck('count', 'status')
            ->toArray();

        // Top Suppliers
        $topSuppliers = (clone $query)
            ->with('supplier:id,name')
            ->select('supplier_id', DB::raw('count(*) as count'), DB::raw('sum(grand_total) as total'))
            ->groupBy('supplier_id')
            ->orderByDesc('total')
            ->limit(5)
            ->get()
            ->map(fn($row) => [
                'supplier_id'   => $row->supplier_id,
                'supplier_name' => $row->supplier?->name ?? 'N/A',
                'order_count'   => (int) $row->count,
                'total_amount'  => (float) $row->total,
            ])
            ->toArray();

        return [
            'total_orders'     => $totalOrders,
            'total_amount'     => (float) $totalAmount,
            'status_breakdown' => $statusBreakdown,
            'top_suppliers'    => $topSuppliers,
        ];
    }
}
