<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('cut_off_orders', function (Blueprint $table) {
            $table->id();

            // Identitas Baris & Waktu
            $table->string('row_no', 50)->nullable();
            $table->date('order_date')->nullable()->index();

            // Toko / Channel & Identitas Pesanan
            $table->string('channel', 50)->index(); // SH, TT, LZD, EVM, SH_KOL, dll
            $table->string('order_number', 100)->index(); // No. Pesanan Marketplace
            $table->string('jl_number', 100)->nullable()->index(); // DATA JL (Surat Jalan)
            $table->string('buyer_username', 150)->nullable()->index(); // Username Pembeli
            $table->string('shipping_courier', 150)->nullable(); // PENGIRIMAN

            // Produk & Gudang
            $table->string('sku_utama', 150)->nullable()->index();
            $table->string('sku_pengganti', 150)->nullable();
            $table->string('product_name', 255)->nullable();
            $table->integer('qty')->default(1);
            $table->integer('recheck_qty')->nullable();
            $table->string('package_count', 50)->nullable(); // PAKET / RESI
            $table->string('info_gudang', 100)->nullable()->index(); // OOS, STICKER, GIFT, BATAL, dll

            // Status & Masalah
            $table->string('order_status', 100)->nullable()->index(); // Transaksi Selesai, RJ, Batal, dll
            $table->text('keterangan_solutif')->nullable();

            // Keuangan & DPP
            $table->decimal('est_net_income', 15, 2)->nullable(); // EST BERSIH
            $table->decimal('marketplace_net_payout', 15, 2)->nullable(); // NETTO DIBAYAR MARKETPLACE
            $table->string('sheet_dpp', 100)->nullable();
            $table->string('dpp_number', 100)->nullable()->index(); // NO DPP

            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cut_off_orders');
    }
};
