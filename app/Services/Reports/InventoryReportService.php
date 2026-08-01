<?php

namespace App\Services\Reports;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\StockReservation;
use Illuminate\Support\Facades\DB;

class InventoryReportService
{
    public function getSummary(): array
    {
        $totalProducts   = Product::count();
        $totalPhysical   = (int) Product::sum('stock');
        $totalReserved   = (int) StockReservation::where('status', StockReservation::STATUS_RESERVED)->sum('quantity');
        $availableStock  = max(0, $totalPhysical - $totalReserved);

        $outOfStockCount = Product::where('stock', '<=', 0)->count();

        // Low stock: products where physical stock > 0 but available stock <= minimum_stock
        $products = Product::select('id', 'stock', 'minimum_stock')->get();
        $lowStockCount = 0;

        foreach ($products as $p) {
            if ($p->stock > 0) {
                $reserved  = (int) StockReservation::where('product_id', $p->id)->where('status', StockReservation::STATUS_RESERVED)->sum('quantity');
                $avail     = max(0, $p->stock - $reserved);
                $min       = $p->minimum_stock > 0 ? $p->minimum_stock : 5;
                if ($avail <= $min) {
                    $lowStockCount++;
                }
            }
        }

        return [
            'total_products'    => $totalProducts,
            'total_physical'    => $totalPhysical,
            'total_reserved'    => $totalReserved,
            'available_stock'   => $availableStock,
            'out_of_stock_count'=> $outOfStockCount,
            'low_stock_count'   => $lowStockCount,
        ];
    }

    public function getStockOverview(int $perPage = 20): \Illuminate\Contracts\Pagination\LengthAwarePaginator
    {
        $products = Product::with('category:id,name')
            ->select('id', 'sku', 'name', 'category_id', 'stock', 'minimum_stock', 'unit', 'selling_price')
            ->orderBy('name', 'asc')
            ->paginate($perPage);

        $products->getCollection()->transform(function ($p) {
            $reserved  = (int) StockReservation::where('product_id', $p->id)->where('status', StockReservation::STATUS_RESERVED)->sum('quantity');
            $available = max(0, $p->stock - $reserved);
            $min       = $p->minimum_stock > 0 ? $p->minimum_stock : 5;

            $status = 'normal';
            if ($p->stock <= 0) {
                $status = 'out_of_stock';
            } elseif ($available <= $min) {
                $status = 'low_stock';
            } elseif ($min > 0 && $p->stock > ($min * 5)) {
                $status = 'overstock';
            }

            return [
                'id'             => $p->id,
                'sku'            => $p->sku,
                'name'           => $p->name,
                'category_name'  => $p->category?->name ?? '—',
                'physical_stock' => $p->stock,
                'reserved_stock' => $reserved,
                'available_stock'=> $available,
                'minimum_stock'  => $p->minimum_stock,
                'status'         => $status,
                'unit'           => $p->unit ?? 'pcs',
            ];
        });

        return $products;
    }

    public function getMovementAnalytics(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $query = StockMovement::query();
        if ($dateFrom) $query->where('created_at', '>=', $dateFrom);
        if ($dateTo)   $query->where('created_at', '<=', $dateTo . ' 23:59:59');

        $totalIn  = (clone $query)->where('movement_type', 'in')->sum('quantity');
        $totalOut = (clone $query)->where('movement_type', 'out')->sum('quantity');

        $topMovedOut = (clone $query)->where('movement_type', 'out')
            ->with('product:id,name,sku')
            ->select('product_id', DB::raw('sum(quantity) as total_qty'))
            ->groupBy('product_id')
            ->orderByDesc('total_qty')
            ->limit(5)
            ->get()
            ->map(fn($r) => [
                'product_name' => $r->product?->name ?? 'N/A',
                'sku'          => $r->product?->sku ?? 'N/A',
                'total_qty'    => (int) $r->total_qty,
            ])
            ->toArray();

        return [
            'total_in'      => (int) $totalIn,
            'total_out'     => (int) $totalOut,
            'top_moved_out' => $topMovedOut,
        ];
    }
}
