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
        if (!Schema::hasColumn('purchase_orders', 'payment_proof_path')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->string('payment_proof_path')->nullable()->after('notes');
            });
        }

        if (!Schema::hasColumn('purchase_order_items', 'landed_unit_price')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->decimal('landed_unit_price', 15, 2)->nullable()->after('unit_price');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('purchase_orders', 'payment_proof_path')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->dropColumn('payment_proof_path');
            });
        }

        if (Schema::hasColumn('purchase_order_items', 'landed_unit_price')) {
            Schema::table('purchase_order_items', function (Blueprint $table) {
                $table->dropColumn('landed_unit_price');
            });
        }
    }
};
