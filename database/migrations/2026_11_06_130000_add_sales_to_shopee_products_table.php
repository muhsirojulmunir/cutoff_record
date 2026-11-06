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
        if (Schema::hasTable('shopee_products') && ! Schema::hasColumn('shopee_products', 'sales')) {
            Schema::table('shopee_products', function (Blueprint $table) {
                $table->integer('sales')->default(0)->after('price')->index();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('shopee_products') && Schema::hasColumn('shopee_products', 'sales')) {
            Schema::table('shopee_products', function (Blueprint $table) {
                $table->dropColumn('sales');
            });
        }
    }
};

