<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cut_off_returns', function (Blueprint $table) {
            $table->id();

            // Col 1: NO URUT PENERIMAAN
            $table->unsignedInteger('no_urut')->nullable();

            // Col 2: NAMA MARKET PLACE / MP
            $table->string('marketplace', 50)->nullable()->index();

            // Col 3: TGL INPUT DATA DR MARKET PLACE
            $table->date('tgl_input_mp')->nullable();

            // Col 4: NAMA BARANG BERDASARKAN DATA RETUR MARKET PLACE
            $table->string('nama_barang_mp', 255)->nullable();

            // Col 5: JML PRODUK BERDASARKAN MP
            $table->unsignedSmallInteger('jml_produk_mp')->nullable()->default(1);

            // Col 6: NO INVOICE SESUAI DATA MP
            $table->string('no_invoice_mp', 100)->nullable()->index();

            // Col 7: NO INVOICE BARU
            $table->string('no_invoice_baru', 100)->nullable();

            // Col 8: NO RETUR
            $table->string('no_retur', 100)->nullable()->index();

            // Col 9: TGL RJ
            $table->date('tgl_rj')->nullable();

            // Col 10: TGL TERIMA BRG DR EXP
            $table->date('tgl_terima_brg')->nullable();

            // Col 11: NAMA BARANG SESUAI FISIK
            $table->string('nama_barang_fisik', 255)->nullable();

            // Col 12: JUMLAH BRG SESUAI FISIK
            $table->unsignedSmallInteger('jml_brg_fisik')->nullable();

            // Col 13: KETERANGAN
            $table->text('keterangan')->nullable();

            // Col 14: BARCODE
            $table->string('barcode', 100)->nullable();

            // Col 15: TGL BANDING / KETERANGAN BANDING
            $table->string('tgl_banding', 100)->nullable();

            // Col 16: NO PENGAJUAN
            $table->string('no_pengajuan', 100)->nullable();

            // Col 17: JL/NO PESANAN BARU
            $table->string('no_pesanan_baru', 100)->nullable();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cut_off_returns');
    }
};

