<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Pastikan pesanan Shopee nomor 2611028HNRV3NQ bernilai tepat Rp 107.740
     * sesuai rumus ERP: (Harga Produk Rp 156.380 - Voucher Toko Rp 20.000) * 79% = Rp 107.740
     */
    public function up(): void
    {
        DB::statement("
            UPDATE cut_off_orders 
            SET est_net_income = 107740,
                marketplace_net_payout = 107740
            WHERE order_number IN ('2611028HNRV3NQ', '2611028HNRV3WQ')
        ");

        DB::statement("
            UPDATE cut_off_orders 
            SET est_net_income = 0,
                marketplace_net_payout = 0
            WHERE order_status = 'Batal'
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No rollback needed
    }
};
