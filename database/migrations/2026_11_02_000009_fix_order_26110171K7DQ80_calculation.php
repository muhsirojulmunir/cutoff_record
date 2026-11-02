<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Perbaiki pesanan 26110171K7DQ80 menjadi Rp 150.099 (Harga Produk Rp 189.999 * 79%)
     */
    public function up(): void
    {
        DB::statement("
            UPDATE cut_off_orders 
            SET est_net_income = 150099,
                marketplace_net_payout = 150099
            WHERE order_number = '26110171K7DQ80'
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
