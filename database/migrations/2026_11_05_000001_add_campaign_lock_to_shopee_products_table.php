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
        if (Schema::hasTable('shopee_products')) {
            Schema::table('shopee_products', function (Blueprint $table) {
                if (! Schema::hasColumn('shopee_products', 'locked_campaign_qty')) {
                    $table->integer('locked_campaign_qty')->default(0)->after('reserved_stock');
                }
                if (! Schema::hasColumn('shopee_products', 'was_campaign_locked')) {
                    $table->boolean('was_campaign_locked')->default(false)->after('locked_campaign_qty')->index();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('shopee_products')) {
            Schema::table('shopee_products', function (Blueprint $table) {
                if (Schema::hasColumn('shopee_products', 'was_campaign_locked')) {
                    $table->dropColumn('was_campaign_locked');
                }
                if (Schema::hasColumn('shopee_products', 'locked_campaign_qty')) {
                    $table->dropColumn('locked_campaign_qty');
                }
            });
        }
    }
};
