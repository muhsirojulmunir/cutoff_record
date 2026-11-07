<?php

namespace App\Console\Commands;

use App\Models\CutOffOrder;
use Illuminate\Console\Command;

class CutOffRecalculateNetIncomeCommand extends Command
{
    /**
     * Nama dan signature command.
     * Penggunaan:
     *   php artisan cutoff:recalc-net
     *   php artisan cutoff:recalc-net --percent=79
     *   php artisan cutoff:recalc-net --order=261104DN371CRV
     */
    protected $signature = 'cutoff:recalc-net
                            {--percent=79 : Persentase estimasi bersih (default 79%)}
                            {--order= : No. Pesanan spesifik yang ingin dihitung ulang}
                            {--force : Langsung simpan perubahan ke database}';

    protected $description = 'Hitung ulang Est. Bersih (est_net_income) pesanan Cut Off berdasarkan harga transaksi riil marketplace';

    public function handle(): int
    {
        $percent = (float) $this->option('percent');
        $rate    = $percent / 100.0;
        $orderSn = $this->option('order');

        $this->info("=== Hitung Ulang Est. Bersih Cut Off ({$percent}%) ===");

        $query = CutOffOrder::query();
        if ($orderSn) {
            $query->where('order_number', $orderSn);
        }

        $orders = $query->orderBy('id', 'desc')->get();
        if ($orders->isEmpty()) {
            $this->warn('Tidak ada data pesanan Cut Off yang ditemukan.');
            return self::SUCCESS;
        }

        $this->info("Memproses {$orders->count()} pesanan...");

        $updatedCount = 0;
        $rows = [];

        foreach ($orders as $order) {
            $status = strtolower((string) $order->order_status);
            $isBatal = str_contains($status, 'batal') || str_contains($status, 'cancel');

            // 1. Tentukan Nilai Bersih Dasar: Subtotal Pesanan - Voucher Ditanggung Penjual
            $raw = is_array($order->raw_payload) ? $order->raw_payload : [];
            $baseAmount = 0.0;

            if (! empty($raw['item_list'])) {
                // Shopee: Hitung Subtotal dari item_list (Harga Setelah Diskon * Qty)
                $subtotal = 0.0;
                foreach ($raw['item_list'] as $it) {
                    $price = (float) ($it['model_discounted_price'] ?? $it['discounted_price'] ?? $it['model_original_price'] ?? $it['original_price'] ?? 0);
                    $qty = (int) ($it['model_quantity_purchased'] ?? $it['quantity_purchased'] ?? $it['model_quantity'] ?? 1);
                    $subtotal += ($price * max(1, $qty));
                }
                $voucher = (float) ($raw['voucher_from_seller'] ?? $raw['payment_info']['voucher_from_seller'] ?? 0);
                $baseAmount = max(0, $subtotal - $voucher);
            } elseif (! empty($raw['payment']['original_total_product_price'])) {
                // TikTok Shop: original_total_product_price - seller_discount
                $sellerDisc = (float) ($raw['payment']['seller_discount'] ?? 0);
                $baseAmount = max(0, (float) $raw['payment']['original_total_product_price'] - $sellerDisc);
            } elseif (! empty($raw['payment']['total_amount'])) {
                $baseAmount = (float) $raw['payment']['total_amount'];
            }

            // Jika baseAmount masih 0, pertahankan nilai est_net_income yang sudah ada
            if ($baseAmount <= 0 && (float) ($order->est_net_income ?? 0) > 0) {
                $newEstBersih = (float) $order->est_net_income;
                $baseAmount = round($newEstBersih / $rate);
            } else {
                // 2. Hitung Est. Bersih: (Base Amount * 79%)
                $newEstBersih = round($baseAmount * $rate);
            }

            $oldEstBersih = (float) $order->est_net_income;

            $order->est_net_income         = $newEstBersih;
            $order->marketplace_net_payout = $newEstBersih;
            $order->save();
            $updatedCount++;

            if (count($rows) < 15) {
                $rows[] = [
                    $order->order_number,
                    $order->channel ?? 'SH',
                    $order->order_status ?? '—',
                    'Rp ' . number_format($baseAmount, 0, ',', '.'),
                    'Rp ' . number_format($oldEstBersih, 0, ',', '.'),
                    'Rp ' . number_format($newEstBersih, 0, ',', '.'),
                ];
            }
        }

        $this->table(
            ['No. Pesanan', 'Ch', 'Status', 'Nilai Transaksi (Base)', 'Est. Bersih Lama', "Est. Bersih Baru ({$percent}%)"],
            $rows
        );

        $this->info("Berhasil memperbarui {$updatedCount} pesanan Cut Off.");
        return self::SUCCESS;
    }
}

