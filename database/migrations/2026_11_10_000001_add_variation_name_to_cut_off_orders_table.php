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
        if (Schema::hasTable('cut_off_orders') && ! Schema::hasColumn('cut_off_orders', 'variation_name')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->string('variation_name', 255)->nullable()->after('product_name');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('cut_off_orders') && Schema::hasColumn('cut_off_orders', 'variation_name')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->dropColumn('variation_name');
            });
        }
    }
};

