<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
            $table->string('marketplace');                    // shopee, tiktok_shop
            $table->string('external_order_id');
            $table->string('external_order_number')->nullable();
            $table->string('order_status');                   // original status from marketplace api
            $table->string('internal_status');                // pending, paid, processing, shipped, completed, cancelled, returned, failed
            $table->string('payment_status')->nullable();
            $table->string('fulfillment_status')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('customer_email')->nullable();
            $table->text('shipping_address')->nullable();
            $table->decimal('subtotal', 15, 2);
            $table->decimal('discount', 15, 2)->default(0.00);
            $table->decimal('shipping_fee', 15, 2)->default(0.00);
            $table->decimal('tax', 15, 2)->default(0.00);
            $table->decimal('total_amount', 15, 2);
            $table->timestamp('order_date');
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('synced_at');
            $table->foreignId('sales_order_id')->nullable()->constrained('sales_orders')->nullOnDelete();
            $table->timestamp('converted_at')->nullable();
            $table->string('conversion_status')->default('not_converted'); // not_converted, ready, converted, failed
            $table->json('raw_payload')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_account_id', 'external_order_id'], 'mp_order_acc_external_id_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_orders');
    }
};
