<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceOrder;
use App\Models\StockReservation;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class MarketplaceFulfillmentService
{
    public function __construct(
        private readonly MarketplaceOrderService $orderService,
        private readonly WarehouseAllocationService $warehouseAllocationService,
        private readonly StockReservationService $reservationService,
    ) {}

    /**
     * Convert Marketplace Order to Sales Order & Reserve Stock atomically.
     */
    public function convertAndReserve(MarketplaceOrder $order, int $userId, ?int $warehouseId = null): MarketplaceOrder
    {
        return DB::transaction(function () use ($order, $userId, $warehouseId) {
            $locked = MarketplaceOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();

            if ($locked->conversion_status === 'converted') {
                throw new InvalidArgumentException('Order marketplace ini sudah pernah dikonversi menjadi Sales Order.');
            }

            if ($locked->internal_status === 'cancelled') {
                throw new InvalidArgumentException('Order yang dibatalkan tidak dapat dikonversi.');
            }

            if (! $locked->allItemsMapped()) {
                $locked->update(['workflow_status' => 'mapping_required']);
                throw new InvalidArgumentException('Semua item order harus memiliki mapping produk internal sebelum dapat dikonversi.');
            }

            if ($warehouseId) {
                $locked->update(['warehouse_id' => $warehouseId]);
            }

            // Warehouse Allocation
            $warehouse = $this->warehouseAllocationService->allocateWarehouse($locked);
            if (! $warehouse) {
                throw new InvalidArgumentException('Stok tidak mencukupi di seluruh gudang aktif untuk memproses order ini.');
            }

            // Reserve Stock for each item
            foreach ($locked->items as $item) {
                $this->reservationService->reserveStock($item->product, $warehouse, $item->quantity, $locked, $userId);
            }

            // Convert to Sales Order
            $converted = $this->orderService->convertToSalesOrder($locked, $userId);

            // Update Sales Order with warehouse and marketplace references
            $salesOrder = $converted->salesOrder;
            if ($salesOrder) {
                $salesOrder->update([
                    'warehouse_id'           => $warehouse->id,
                    'marketplace_order_id'   => $converted->id,
                    'marketplace_account_id' => $converted->marketplace_account_id,
                    'external_order_id'      => $converted->external_order_id,
                    'marketplace_platform'  => $converted->marketplace,
                ]);
            }

            $converted->update([
                'workflow_status' => 'stock_reserved',
                'warehouse_id'    => $warehouse->id,
            ]);

            return $converted->fresh();
        });
    }

    /**
     * Fulfill/Ship Marketplace Order (consumes reservations & records Stock Movement OUT).
     */
    public function fulfillOrder(
        MarketplaceOrder $order,
        ?string $trackingNumber = null,
        ?string $courierName = null,
        ?int $userId = null
    ): MarketplaceOrder {
        return DB::transaction(function () use ($order, $trackingNumber, $courierName, $userId) {
            $locked = MarketplaceOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();

            if ($locked->internal_status === 'shipped' || $locked->internal_status === 'completed') {
                return $locked;
            }

            if ($locked->internal_status === 'cancelled') {
                throw new InvalidArgumentException('Order yang dibatalkan tidak dapat dikirim.');
            }

            // Consume active reservations (triggers StockMovement OUT)
            $reservations = StockReservation::where('marketplace_order_id', $locked->id)
                ->where('status', StockReservation::STATUS_RESERVED)
                ->get();

            foreach ($reservations as $reservation) {
                $this->reservationService->consumeReservation($reservation, $userId);
            }

            $tracking = $trackingNumber ?? $locked->tracking_number;
            $courier  = $courierName ?? $locked->courier_name;

            $locked->update([
                'tracking_number'    => $tracking,
                'courier_name'       => $courier,
                'shipped_at'         => now(),
                'internal_status'    => 'shipped',
                'workflow_status'    => 'shipped',
                'fulfillment_status' => 'shipped',
            ]);

            // Sync status to Sales Order if linked
            if ($locked->salesOrder) {
                $locked->salesOrder->update(['status' => 'confirmed']);
            }

            return $locked->fresh();
        });
    }

    /**
     * Cancel Marketplace Order (releases active stock reservations).
     */
    public function cancelOrder(MarketplaceOrder $order): MarketplaceOrder
    {
        return DB::transaction(function () use ($order) {
            $locked = MarketplaceOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();

            $reservations = StockReservation::where('marketplace_order_id', $locked->id)
                ->where('status', StockReservation::STATUS_RESERVED)
                ->get();

            foreach ($reservations as $reservation) {
                $this->reservationService->releaseReservation($reservation);
            }

            $locked->update([
                'internal_status' => 'cancelled',
                'workflow_status' => 'cancelled',
                'cancelled_at'    => now(),
            ]);

            return $locked->fresh();
        });
    }
}
