<?php

use App\Models\CutOffOrder;
use App\Services\ShopeeSyncService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Hitung ulang seluruh pesanan Cut Off dengan rumus resmi:
     * Est. Bersih = (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
     * Jika Voucher Ditanggung Penjual = 0, maka (Subtotal Pesanan - 0) * 79%
     * Jika Status = Batal, maka Est. Bersih = 0
     */
    public function up(): void
    {
        // 1. Pastikan semua pesanan berstatus Batal bernilai Rp 0
        DB::statement("
            UPDATE cut_off_orders 
            SET est_net_income = 0,
                marketplace_net_payout = 0
            WHERE order_status = 'Batal'
        ");

        // 2. Jalankan recalculateAllOrders dari Shopee API jika akun terhubung
        try {
            app(ShopeeSyncService::class)->recalculateAllOrders();
        } catch (\Throwable $e) {
            Log::warning('Migration recalculateAllOrders notice: ' . $e->getMessage());
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No rollback needed
    }
};
