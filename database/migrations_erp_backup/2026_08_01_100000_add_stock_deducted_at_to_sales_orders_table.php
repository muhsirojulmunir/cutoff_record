<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Penanda kapan stok dipotong untuk Sales Order ini.
     *
     * Fungsinya sebagai kunci pengaman: selama kolom ini terisi, pemotongan
     * stok tidak akan diulang walau approve dipanggil lagi. Saat SO dibatalkan
     * stok dikembalikan dan kolom ini dikosongkan kembali.
     */
    public function up(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->timestamp('stock_deducted_at')->nullable()->after('completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropColumn('stock_deducted_at');
        });
    }
};
