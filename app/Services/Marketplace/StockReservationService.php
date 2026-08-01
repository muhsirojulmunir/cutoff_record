<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceOrder;
use App\Models\Product;
use App\Models\StockReservation;
use App\Models\Warehouse;
use App\Services\StockMovementService;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class StockReservationService
{
    public function __construct(private readonly StockMovementService $stockMovementService) {}

    /**
     * Calculate available stock for a product in a warehouse.
     * available_stock = physical_stock - reserved_stock
     */
    public function getAvailableStock(Product $product, Warehouse $warehouse): int
    {
        $reservedStock = (int) StockReservation::where('product_id', $product->id)
            ->where('warehouse_id', $warehouse->id)
            ->where('status', StockReservation::STATUS_RESERVED)
            ->sum('quantity');

        return max(0, $product->stock - $reservedStock);
    }

    /**
     * Reserve stock for a product in a warehouse.
     * Uses pessimistic locking and atomic transaction.
     */
    public function reserveStock(
        Product $product,
        Warehouse $warehouse,
        int $quantity,
        ?MarketplaceOrder $order = null,
        ?int $userId = null
    ): StockReservation {
        if ($quantity <= 0) {
            throw new InvalidArgumentException('Kuantitas reservasi harus lebih besar dari 0.');
        }

        return DB::transaction(function () use ($product, $warehouse, $quantity, $order, $userId) {
            $lockedProduct = Product::where('id', $product->id)->lockForUpdate()->firstOrFail();

            $availableStock = $this->getAvailableStock($lockedProduct, $warehouse);

            if ($quantity > $availableStock) {
                throw new InvalidArgumentException(
                    "Stok tidak mencukupi untuk reservasi produk [{$lockedProduct->sku}] {$lockedProduct->name}. " .
                    "Permintaan: {$quantity}, Stok tersedia: {$availableStock} (Stok fisik: {$lockedProduct->stock})."
                );
            }

            return StockReservation::create([
                'product_id'           => $lockedProduct->id,
                'warehouse_id'         => $warehouse->id,
                'marketplace_order_id' => $order?->id,
                'quantity'             => $quantity,
                'status'               => StockReservation::STATUS_RESERVED,
                'reserved_at'          => now(),
                'created_by'           => $userId,
            ]);
        });
    }

    /**
     * Release a reserved stock (returns available stock).
     */
    public function releaseReservation(StockReservation $reservation): StockReservation
    {
        if ($reservation->status !== StockReservation::STATUS_RESERVED) {
            return $reservation;
        }

        $reservation->update([
            'status'      => StockReservation::STATUS_RELEASED,
            'released_at' => now(),
        ]);

        return $reservation->fresh();
    }

    /**
     * Consume a reserved stock upon fulfillment/shipping.
     * Deducts physical stock via StockMovementService OUT.
     */
    public function consumeReservation(StockReservation $reservation, ?int $userId = null): StockReservation
    {
        if ($reservation->status !== StockReservation::STATUS_RESERVED) {
            return $reservation;
        }

        return DB::transaction(function () use ($reservation, $userId) {
            $reservation->load('product', 'marketplaceOrder');

            // Record physical Stock Movement OUT
            $this->stockMovementService->recordStockOut(
                $reservation->product,
                $reservation->warehouse_id,
                $reservation->quantity,
                'marketplace_fulfillment',
                $reservation->marketplace_order_id,
                $reservation->marketplaceOrder?->external_order_id,
                "Fulfillment Marketplace Order #{$reservation->marketplaceOrder?->external_order_id}",
                $userId
            );

            $reservation->update([
                'status'      => StockReservation::STATUS_CONSUMED,
                'consumed_at' => now(),
            ]);

            return $reservation->fresh();
        });
    }

    /**
     * Cancel a reservation.
     */
    public function cancelReservation(StockReservation $reservation): StockReservation
    {
        if ($reservation->status !== StockReservation::STATUS_RESERVED) {
            return $reservation;
        }

        $reservation->update([
            'status'      => StockReservation::STATUS_CANCELLED,
            'released_at' => now(),
        ]);

        return $reservation->fresh();
    }
}
