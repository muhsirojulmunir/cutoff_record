<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Soft-delete pesanan Cut Off yang masih berstatus Belum Bayar, Perlu Dikirim,
     * Tertahan, Pengajuan Batal, atau Batal agar hanya pesanan "Diproses" ke atas
     * yang tercatat di Pesanan Cut Off. Data di shopee_orders ("Pesanan Saya") tetap utuh.
     */
    public function up(): void
    {
        if (! Schema::hasTable('cut_off_orders')) {
            return;
        }

        $patterns = [
            '%batal%',
            '%cancel%',
            '%belum bayar%',
            '%perlu dikirim%',
            '%tertahan%',
            '%unpaid%',
            '%ready_to_ship%',
            '%in_cancel%',
            '%cancelled%',
            '%on_hold%',
            '%awaiting_shipment%',
        ];

        DB::table('cut_off_orders')
            ->whereNull('deleted_at')
            ->whereNotNull('order_status')
            ->where(function ($q) use ($patterns) {
                foreach ($patterns as $pattern) {
                    $q->orWhereRaw('LOWER(order_status) LIKE ?', [$pattern]);
                }
            })
            ->update([
                'deleted_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Data cleanup migration: jangan restore sembarangan karena bisa mengembalikan pesanan yang dihapus manual.
    }
};

