<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('marketplace_order_id')->nullable()->constrained('marketplace_orders')->cascadeOnDelete();
            $table->integer('quantity');
            $table->string('status')->default('reserved'); // reserved, released, consumed, cancelled
            $table->timestamp('reserved_at');
            $table->timestamp('released_at')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('sales_orders', function (Blueprint $table) {
            $table->foreignId('marketplace_order_id')->nullable()->after('customer_id')->constrained('marketplace_orders')->nullOnDelete();
            $table->foreignId('marketplace_account_id')->nullable()->after('marketplace_order_id')->constrained('marketplace_accounts')->nullOnDelete();
            $table->string('external_order_id')->nullable()->after('marketplace_account_id');
            $table->string('marketplace_platform')->nullable()->after('external_order_id');
            $table->foreignId('warehouse_id')->nullable()->after('marketplace_platform')->constrained('warehouses')->nullOnDelete();
        });

        Schema::table('marketplace_orders', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('sales_order_id')->constrained('warehouses')->nullOnDelete();
            $table->string('workflow_status')->default('pending')->after('internal_status'); // pending, ready_to_process, converted_to_so, stock_reserved, processing, shipped, completed, cancelled, failed, stock_insufficient, mapping_required
        });
    }

    public function down(): void
    {
        Schema::table('marketplace_orders', function (Blueprint $table) {
            $table->dropForeign(['warehouse_id']);
            $table->dropColumn(['warehouse_id', 'workflow_status']);
        });

        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropForeign(['marketplace_order_id']);
            $table->dropForeign(['marketplace_account_id']);
            $table->dropForeign(['warehouse_id']);
            $table->dropColumn(['marketplace_order_id', 'marketplace_account_id', 'external_order_id', 'marketplace_platform', 'warehouse_id']);
        });

        Schema::dropIfExists('stock_reservations');
    }
};
