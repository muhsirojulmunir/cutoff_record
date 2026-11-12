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
        if (! Schema::hasTable('shopee_stock_zero_batches')) {
            Schema::create('shopee_stock_zero_batches', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('shopee_account_id')->nullable()->index();
                $table->string('batch_code', 40)->unique();
                $table->string('source', 40)->default('bulk')->index();
                $table->string('note', 255)->nullable();
                $table->integer('total_requested')->default(0);
                $table->integer('zeroed_count')->default(0);
                $table->integer('failed_count')->default(0);
                $table->integer('restored_count')->default(0);
                $table->string('status', 30)->default('zeroed')->index();
                $table->unsignedBigInteger('zeroed_by')->nullable()->index();
                $table->string('zeroed_by_name', 120)->nullable();
                $table->timestamp('zeroed_at')->nullable()->index();
                $table->unsignedBigInteger('restored_by')->nullable()->index();
                $table->string('restored_by_name', 120)->nullable();
                $table->timestamp('restored_at')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('shopee_stock_zero_items')) {
            Schema::create('shopee_stock_zero_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('batch_id')->index();
                $table->unsignedBigInteger('shopee_account_id')->nullable()->index();
                $table->unsignedBigInteger('shopee_product_id')->nullable()->index();
                $table->unsignedBigInteger('item_id')->index();
                $table->unsignedBigInteger('model_id')->default(0)->index();
                $table->string('item_name', 255);
                $table->string('model_name', 255)->nullable();
                $table->string('sku', 100)->nullable()->index();
                $table->integer('previous_stock')->default(0);
                $table->integer('previous_reserved_stock')->default(0);
                $table->integer('previous_locked_campaign_qty')->default(0);
                $table->boolean('previous_was_campaign_locked')->default(false);
                $table->integer('zeroed_stock')->default(0);
                $table->string('status', 30)->default('zeroed')->index();
                $table->text('error_message')->nullable();
                $table->unsignedBigInteger('restored_by')->nullable();
                $table->string('restored_by_name', 120)->nullable();
                $table->timestamp('restored_at')->nullable()->index();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shopee_stock_zero_items');
        Schema::dropIfExists('shopee_stock_zero_batches');
    }
};

