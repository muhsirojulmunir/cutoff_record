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
        if (! Schema::hasTable('tiktok_products')) {
            Schema::create('tiktok_products', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tiktok_account_id')->nullable()->index();
                $table->string('item_id', 64)->index();
                $table->string('model_id', 64)->default('0')->index();
                $table->string('item_name', 255);
                $table->string('model_name', 255)->nullable();
                $table->string('sku', 100)->nullable()->index();
                $table->string('manual_item_code', 50)->nullable()->index();
                $table->integer('stock')->default(0)->index();
                $table->integer('reserved_stock')->default(0);
                $table->integer('locked_campaign_qty')->default(0);
                $table->boolean('was_campaign_locked')->default(false)->index();
                $table->decimal('price', 15, 2)->default(0);
                $table->integer('sales')->default(0)->index();
                $table->string('item_status', 50)->default('ACTIVATE');
                $table->boolean('has_model')->default(false);
                $table->dateTime('last_synced_at')->nullable()->index();
                $table->json('raw_data')->nullable();
                $table->timestamps();

                $table->unique(['tiktok_account_id', 'item_id', 'model_id'], 'tiktok_prod_unique_variant');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tiktok_products');
    }
};
