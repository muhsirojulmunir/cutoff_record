<?php

namespace App\Services;

use App\Models\GoodsReceipt;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Alur barang masuk: diajukan dulu, stok bertambah hanya setelah disetujui
 * PIC Gudang. Halaman All Stock murni untuk melihat sisa stok.
 */
class GoodsReceiptService
{
    public function __construct(
        private readonly StockMovementService $stockMovementService,
    ) {}

    /** Buat pengajuan baru. Stok belum berubah sama sekali di tahap ini. */
    public function request(array $data, ?int $userId = null): GoodsReceipt
    {
        return DB::transaction(function () use ($data, $userId) {
            return GoodsReceipt::create([
                'receipt_number' => $this->generateReceiptNumber(),
                'product_id'     => $data['product_id'],
                'warehouse_id'   => $data['warehouse_id'] ?? null,
                'quantity'       => (int) $data['quantity'],
                'notes'          => $data['notes'],
                'status'         => GoodsReceipt::STATUS_PENDING,
                'requested_by'   => $userId,
                'requested_at'   => now(),
            ]);
        });
    }

    /**
     * Setujui pengajuan: stok bertambah dan pergerakannya dicatat.
     * Kolom stock_movement_id menjadi pengaman agar tidak dobel.
     */
    public function approve(GoodsReceipt $receipt, ?int $userId = null): GoodsReceipt
    {
        if (!$receipt->isPending()) {
            throw new InvalidArgumentException('Pengajuan ini sudah diproses sebelumnya.');
        }

        return DB::transaction(function () use ($receipt, $userId) {
            $locked = GoodsReceipt::where('id', $receipt->id)->lockForUpdate()->firstOrFail();

            if (!$locked->isPending()) {
                throw new InvalidArgumentException('Pengajuan ini sudah diproses sebelumnya.');
            }

            $product = Product::findOrFail($locked->product_id);

            $movement = $this->stockMovementService->recordStockIn(
                $product,
                $locked->warehouse_id,
                $locked->quantity,
                'goods_receipt',
                $locked->id,
                $locked->receipt_number,
                $locked->notes,
                $userId,
            );

            $locked->update([
                'status'            => GoodsReceipt::STATUS_APPROVED,
                'approved_by'       => $userId,
                'approved_at'       => now(),
                'stock_movement_id' => $movement->id,
            ]);

            return $locked->fresh();
        });
    }

    /** Tolak pengajuan. Stok tidak tersentuh sama sekali. */
    public function reject(GoodsReceipt $receipt, string $reason, ?int $userId = null): GoodsReceipt
    {
        if (!$receipt->isPending()) {
            throw new InvalidArgumentException('Pengajuan ini sudah diproses sebelumnya.');
        }

        $receipt->update([
            'status'           => GoodsReceipt::STATUS_REJECTED,
            'rejected_by'      => $userId,
            'rejected_at'      => now(),
            'rejection_reason' => $reason,
        ]);

        return $receipt->fresh();
    }

    /** Format nomor: BM-YYYYMM-0001, berurutan per bulan. */
    private function generateReceiptNumber(): string
    {
        $prefix = 'BM-' . now()->format('Ym');

        $last = GoodsReceipt::withTrashed()
            ->where('receipt_number', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->orderByDesc('receipt_number')
            ->value('receipt_number');

        $sequence = $last ? ((int) substr($last, -4)) + 1 : 1;

        return $prefix . '-' . str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
    }
}
