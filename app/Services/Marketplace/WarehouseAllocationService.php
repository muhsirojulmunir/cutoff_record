<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceOrder;
use App\Models\Warehouse;

class WarehouseAllocationService
{
    public function __construct(private readonly StockReservationService $reservationService) {}

    /**
     * Determine best warehouse fulfillment allocation for a MarketplaceOrder.
     */
    public function allocateWarehouse(MarketplaceOrder $order): ?Warehouse
    {
        $order->load('items.product');

        // 1. Check if a specific warehouse is already selected on the order
        if ($order->warehouse_id) {
            $selected = Warehouse::find($order->warehouse_id);
            if ($selected && $selected->status === 'active' && $this->canFulfillAllItems($order, $selected)) {
                return $selected;
            }
        }

        // 2. Fallback: Search all active warehouses for sufficient available stock
        $warehouses = Warehouse::where('status', 'active')->get();

        foreach ($warehouses as $warehouse) {
            if ($this->canFulfillAllItems($order, $warehouse)) {
                $order->update(['warehouse_id' => $warehouse->id]);
                return $warehouse;
            }
        }

        // 3. Insufficient stock across all warehouses
        $order->update(['workflow_status' => 'stock_insufficient']);
        return null;
    }

    /**
     * Check if a warehouse has enough available stock for all mapped items in the order.
     */
    public function canFulfillAllItems(MarketplaceOrder $order, Warehouse $warehouse): bool
    {
        foreach ($order->items as $item) {
            if (! $item->product) {
                return false;
            }

            $available = $this->reservationService->getAvailableStock($item->product, $warehouse);
            if ($item->quantity > $available) {
                return false;
            }
        }

        return true;
    }
}
