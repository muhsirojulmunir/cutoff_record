<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pengajuan barang masuk.
     *
     * Stok tidak lagi bertambah begitu form dikirim. Pengajuan menunggu
     * persetujuan PIC Gudang dulu; stok baru bertambah saat disetujui, dan
     * pergerakan stoknya tetap dicatat di stock_movements seperti biasa.
     */
    public function up(): void
    {
        Schema::create('goods_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('receipt_number')->unique();      // BM-YYYYMM-0001
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->integer('quantity');
            $table->string('notes');
            $table->string('status')->default('pending');    // pending, approved, rejected

            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();

            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason')->nullable();

            // Bukti bahwa stok benar-benar sudah ditambahkan, sekaligus pengaman
            // agar satu pengajuan tidak bisa menambah stok dua kali.
            $table->foreignId('stock_movement_id')->nullable()->constrained('stock_movements')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'id'], 'goods_receipts_status_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goods_receipts');
    }
};
