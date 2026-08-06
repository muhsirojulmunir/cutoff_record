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
                'po_number'      => $data['po_number'] ?? null,
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
     * Ajukan beberapa SKU sekaligus dalam satu kiriman.
     *
     * Tiap SKU tetap menjadi baris tersendiri supaya PIC Gudang bisa
     * menyetujui atau menolaknya satu per satu; nomor PO, gudang, dan
     * keterangan dipakai bersama. Seluruhnya dibungkus satu transaksi agar
     * tidak ada pengajuan yang masuk setengah-setengah.
     *
     * @param  array<int, array{product_id: int|string, quantity: int|string}>  $items
     * @return array<int, GoodsReceipt>
     */
    public function requestBatch(array $shared, array $items, ?int $userId = null): array
    {
        return DB::transaction(function () use ($shared, $items, $userId) {
            $created = [];

            foreach ($items as $item) {
                $created[] = $this->request([
                    'po_number'    => $shared['po_number'] ?? null,
                    'warehouse_id' => $shared['warehouse_id'] ?? null,
                    'notes'        => $shared['notes'],
                    'product_id'   => $item['product_id'],
                    'quantity'     => $item['quantity'],
                ], $userId);
            }

            return $created;
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

    /**
     * Hapus pengajuan barang masuk.
     *
     * Bila pengajuannya sudah disetujui, stok yang terlanjur masuk ditarik
     * kembali lebih dulu supaya sisa stok tetap cocok dengan catatannya.
     * Nomor pengajuan tidak dipakai ulang karena penomoran menghitung data
     * yang sudah dihapus juga.
     */
    public function deleteRequest(GoodsReceipt $receipt, ?int $userId = null): void
    {
        DB::transaction(function () use ($receipt, $userId) {
            $locked = GoodsReceipt::where('id', $receipt->id)->lockForUpdate()->firstOrFail();

            if ($locked->stock_movement_id) {
                $product = Product::find($locked->product_id);

                if (!$product) {
                    throw new InvalidArgumentException('Produk pada pengajuan ini sudah tidak ada, penghapusan dibatalkan.');
                }

                if ($product->stock < $locked->quantity) {
                    throw new InvalidArgumentException(
                        "Pengajuan ini tidak bisa dihapus karena stok {$product->sku} tinggal {$product->stock}, "
                        . "sedangkan yang harus ditarik kembali {$locked->quantity}. "
                        . 'Sesuaikan stok lewat menu Adjustment terlebih dahulu.'
                    );
                }

                $this->stockMovementService->recordStockOut(
                    $product,
                    $locked->warehouse_id,
                    $locked->quantity,
                    'goods_receipt_deleted',
                    $locked->id,
                    $locked->receipt_number,
                    'Pembatalan barang masuk ' . $locked->receipt_number,
                    $userId,
                );
            }

            $locked->delete();
        });
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
