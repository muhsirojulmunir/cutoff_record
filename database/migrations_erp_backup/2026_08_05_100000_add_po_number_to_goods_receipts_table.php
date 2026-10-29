<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Nomor PO rujukan pada pengajuan barang masuk.
     *
     * Satu pengajuan bisa memuat beberapa SKU sekaligus; tiap SKU tetap
     * disimpan sebagai baris tersendiri agar bisa disetujui atau ditolak
     * satu per satu, dan dikelompokkan lewat nomor PO yang sama.
     */
    public function up(): void
    {
        Schema::table('goods_receipts', function (Blueprint $table) {
            $table->string('po_number')->nullable()->after('receipt_number');
            $table->index('po_number', 'goods_receipts_po_number_index');
        });
    }

    public function down(): void
    {
        Schema::table('goods_receipts', function (Blueprint $table) {
            $table->dropIndex('goods_receipts_po_number_index');
            $table->dropColumn('po_number');
        });
    }
};
