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
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->string('tracking_number')->nullable()->after('so_number');
            $table->string('account_name')->nullable()->after('sales_channel');
            $table->string('recipient_name')->nullable()->after('customer_id');
            $table->string('customer_phone')->nullable()->after('recipient_name');
            $table->text('shipping_address')->nullable()->after('customer_phone');
            $table->string('city')->nullable()->after('shipping_address');
            $table->string('province')->nullable()->after('city');
            $table->decimal('total_weight', 10, 2)->default(0)->after('grand_total');
            $table->decimal('dp_amount', 15, 2)->default(0)->after('total_weight');
            $table->timestamp('payment_date')->nullable()->after('order_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropColumn([
                'tracking_number',
                'account_name',
                'recipient_name',
                'customer_phone',
                'shipping_address',
                'city',
                'province',
                'total_weight',
                'dp_amount',
                'payment_date',
            ]);
        });
    }
};
