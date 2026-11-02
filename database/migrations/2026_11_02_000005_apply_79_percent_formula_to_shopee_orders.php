<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Terapkan rumus 79% (Harga Produk - Voucher Penjual x 79%) pada pesanan Shopee yang ada.
     */
    public function up(): void
    {
        DB::statement("
            UPDATE cut_off_orders 
            SET est_net_income = ROUND(est_net_income * 0.79),
                marketplace_net_payout = ROUND(marketplace_net_payout * 0.79)
            WHERE channel = 'SH' 
              AND order_status != 'Batal' 
              AND est_net_income > 0
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
