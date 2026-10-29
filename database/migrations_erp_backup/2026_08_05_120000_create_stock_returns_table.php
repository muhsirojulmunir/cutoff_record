<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Retur barang dari customer.
     *
     * Stok tidak langsung bertambah saat retur diajukan: Leader harus
     * menyetujuinya lebih dulu. Setelah disetujui, barang masuk kembali ke
     * stok dan tercatat di Inventory Ledger seperti pergerakan lainnya.
     */
    public function up(): void
    {
        Schema::create('stock_returns', function (Blueprint $table) {
            $table->id();
            $table->string('return_number')->unique();        // RTR-YYYYMM-0001

            // Nomor invoice disimpan sebagai teks agar retur atas invoice lama
            // tetap bisa dicatat; invoice_id terisi bila nomornya cocok.
            $table->string('invoice_number');
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();

            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->nullOnDelete();
            $table->integer('quantity');
            $table->string('reason');                          // keterangan retur
            $table->string('status')->default('pending');      // pending, approved, rejected

            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();

            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason')->nullable();

            // Bukti stok sudah dikembalikan, sekaligus pengaman agar satu retur
            // tidak menambah stok dua kali.
            $table->foreignId('stock_movement_id')->nullable()->constrained('stock_movements')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'id'], 'stock_returns_status_index');
            $table->index('invoice_number', 'stock_returns_invoice_number_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_returns');
    }
};
