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
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->integer('accepted_quantity')->default(0)->after('received_quantity');
            $table->integer('rejected_quantity')->default(0)->after('accepted_quantity');
            $table->string('action_taken')->default('accepted')->after('rejected_quantity'); // accepted, revised, rejected
            $table->text('rejected_reason')->nullable()->after('action_taken');
            $table->decimal('validated_unit_price', 15, 2)->nullable()->after('rejected_reason');
            $table->decimal('validated_total_price', 15, 2)->nullable()->after('validated_unit_price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropColumn([
                'accepted_quantity',
                'rejected_quantity',
                'action_taken',
                'rejected_reason',
                'validated_unit_price',
                'validated_total_price',
            ]);
        });
    }
};
