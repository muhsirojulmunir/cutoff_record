<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::update("
            UPDATE cut_off_orders 
            SET order_date = CONCAT('2026-', SUBSTRING(order_date, 6, 5)) 
            WHERE order_date > '2027-01-01'
        ");
    }

    public function down(): void
    {
        // No rollback needed for data normalization
    }
};
