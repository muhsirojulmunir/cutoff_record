<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            // Estimasi pembayaran bersih dari marketplace (Shopee/TikTok settlement)
            // Ini yang dipakai hitung laba bersih marketplace (bukan grand_total)
            $table->decimal('estimated_payout', 15, 2)->nullable()->after('other_fee');
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropColumn('estimated_payout');
        });
    }
};
