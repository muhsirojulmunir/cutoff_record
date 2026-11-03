<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('cut_off_orders', function (Blueprint $table) {
            if (! Schema::hasColumn('cut_off_orders', 'ship_by_date')) {
                $table->dateTime('ship_by_date')->nullable()->after('order_date');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cut_off_orders', function (Blueprint $table) {
            if (Schema::hasColumn('cut_off_orders', 'ship_by_date')) {
                $table->dropColumn('ship_by_date');
            }
        });
    }
};

