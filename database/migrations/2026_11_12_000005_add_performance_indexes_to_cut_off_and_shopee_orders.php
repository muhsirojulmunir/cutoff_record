<?php

use App\Models\CutOffOrder;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Tambahkan composite index pada cut_off_orders & shopee_orders agar query
     * Pesanan Cut Off, Dashboard, dan Stok Produk Shopee berjalan cepat dan bebas lock.
     */
    public function up(): void
    {
        CutOffOrder::ensurePerformanceIndexes();
    }

    public function down(): void
    {
        // Index performa tidak perlu di-drop saat rollback ringan.
    }
};

