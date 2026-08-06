<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saat pengajuan barang masuk dihapus, catatan pergerakan stoknya ikut
 * hilang dari Inventory Ledger supaya keduanya tidak saling bertentangan.
 * Barisnya diarsipkan, bukan dibuang permanen, agar tetap bisa ditelusuri
 * langsung di database bila suatu saat diperlukan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
