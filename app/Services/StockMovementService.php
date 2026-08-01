<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class StockMovementService
{
    /**
     * Record stock IN.
     */
    public function recordStockIn(
        Product $product,
        int $warehouseId,
        int $quantity,
        ?string $refType = null,
        ?int $refId = null,
        ?string $refNumber = null,
        ?string $notes = null,
        ?int $userId = null
    ): StockMovement {
        if ($quantity <= 0) {
            throw new InvalidArgumentException('Kuantitas masuk harus lebih besar dari 0.');
        }

        return DB::transaction(function () use ($product, $warehouseId, $quantity, $refType, $refId, $refNumber, $notes, $userId) {
            // Lock product row to prevent race conditions
            $lockedProduct = Product::where('id', $product->id)->lockForUpdate()->firstOrFail();

            $stockBefore = $lockedProduct->stock;
            $stockAfter = $stockBefore + $quantity;

            // Update product stock
            $lockedProduct->update([
                'stock' => $stockAfter
            ]);

            // Create stock movement record
            return StockMovement::create([
                'product_id'       => $lockedProduct->id,
                'warehouse_id'     => $warehouseId,
                'movement_type'    => 'in',
                'quantity'         => $quantity,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'reference_type'   => $refType,
                'reference_id'     => $refId,
                'reference_number' => $refNumber,
                'notes'            => $notes,
                'created_by'       => $userId,
            ]);
        });
    }

    /**
     * Record stock OUT.
     */
    public function recordStockOut(
        Product $product,
        int $warehouseId,
        int $quantity,
        ?string $refType = null,
        ?int $refId = null,
        ?string $refNumber = null,
        ?string $notes = null,
        ?int $userId = null
    ): StockMovement {
        if ($quantity <= 0) {
            throw new InvalidArgumentException('Kuantitas keluar harus lebih besar dari 0.');
        }

        return DB::transaction(function () use ($product, $warehouseId, $quantity, $refType, $refId, $refNumber, $notes, $userId) {
            // Lock product row to prevent race conditions
            $lockedProduct = Product::where('id', $product->id)->lockForUpdate()->firstOrFail();

            $stockBefore = $lockedProduct->stock;
            $stockAfter = $stockBefore - $quantity;

            if ($stockAfter < 0) {
                throw new InvalidArgumentException("Stok tidak mencukupi untuk melakukan pengeluaran barang. Kuantitas keluar: {$quantity}, Stok saat ini: {$stockBefore}.");
            }

            // Update product stock
            $lockedProduct->update([
                'stock' => $stockAfter
            ]);

            // Create stock movement record
            return StockMovement::create([
                'product_id'       => $lockedProduct->id,
                'warehouse_id'     => $warehouseId,
                'movement_type'    => 'out',
                'quantity'         => $quantity,
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'reference_type'   => $refType,
                'reference_id'     => $refId,
                'reference_number' => $refNumber,
                'notes'            => $notes,
                'created_by'       => $userId,
            ]);
        });
    }

    /**
     * Record stock ADJUSTMENT.
     */
    public function recordAdjustment(
        Product $product,
        int $warehouseId,
        int $quantity, // Can be positive or negative
        string $notes,
        int $userId
    ): StockMovement {
        if ($quantity === 0) {
            throw new InvalidArgumentException('Kuantitas adjustment tidak boleh bernilai 0.');
        }

        return DB::transaction(function () use ($product, $warehouseId, $quantity, $notes, $userId) {
            // Lock product row to prevent race conditions
            $lockedProduct = Product::where('id', $product->id)->lockForUpdate()->firstOrFail();

            $stockBefore = $lockedProduct->stock;
            $stockAfter = $stockBefore + $quantity;

            if ($stockAfter < 0) {
                throw new InvalidArgumentException("Adjustment menyebabkan stok negatif. Nilai adjustment: {$quantity}, Stok saat ini: {$stockBefore}.");
            }

            // Update product stock
            $lockedProduct->update([
                'stock' => $stockAfter
            ]);

            // Create stock movement record
            return StockMovement::create([
                'product_id'       => $lockedProduct->id,
                'warehouse_id'     => $warehouseId,
                'movement_type'    => 'adjustment',
                'quantity'         => abs($quantity), // Store absolute quantity in the movement
                'stock_before'     => $stockBefore,
                'stock_after'      => $stockAfter,
                'reference_type'   => 'adjustment',
                'reference_id'     => null,
                'reference_number' => 'ADJ-' . time() . '-' . rand(100, 999),
                'notes'            => $notes,
                'created_by'       => $userId,
            ]);
        });
    }
}
