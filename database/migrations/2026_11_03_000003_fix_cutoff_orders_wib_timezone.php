<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Koreksi order_date yang tersimpan dalam UTC (tertinggal 7 jam dari WIB)
        // khusus untuk pesanan Shopee 3 Nov 2026 yang jamnya tercatat sebelum jam 10:00
        try {
            DB::table('cut_off_orders')
                ->where('channel', 'SH')
                ->whereDate('order_date', '2026-11-03')
                ->whereTime('order_date', '<', '10:00:00')
                ->where('order_number', 'like', '261103%')
                ->update([
                    'order_date' => DB::raw("DATE_ADD(order_date, INTERVAL 7 HOUR)")
                ]);
        } catch (\Throwable $e) {
            // Abaikan jika format raw tidak didukung driver tertentu
        }
    }

    public function down(): void
    {
    }
};
