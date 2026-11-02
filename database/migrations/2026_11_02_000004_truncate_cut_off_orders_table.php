<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Mengosongkan data tabel cut_off_orders agar bersih untuk sinkronisasi murni dari API marketplace.
     */
    public function up(): void
    {
        DB::table('cut_off_orders')->truncate();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No rollback for truncation
    }
};
