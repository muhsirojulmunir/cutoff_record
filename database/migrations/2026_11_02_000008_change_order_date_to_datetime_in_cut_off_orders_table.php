<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Ubah kolom order_date dari DATE menjadi DATETIME agar mencakup jam, menit, dan detik.
     */
    public function up(): void
    {
        try {
            DB::statement("ALTER TABLE cut_off_orders MODIFY order_date DATETIME NULL");
        } catch (\Throwable $e) {
            // Ignore if already datetime or driver unsupported
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        try {
            DB::statement("ALTER TABLE cut_off_orders MODIFY order_date DATE NULL");
        } catch (\Throwable $e) {
            //
        }
    }
};
