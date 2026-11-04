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
        if (! Schema::hasTable('shopee_products')) {
            Schema::create('shopee_products', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shopee_account_id')->nullable()->constrained('shopee_accounts')->nullOnDelete();
                $table->unsignedBigInteger('item_id')->index();
                $table->unsignedBigInteger('model_id')->nullable()->index();
                $table->string('item_name', 255);
                $table->string('model_name', 255)->nullable();
                $table->string('sku', 100)->nullable()->index();
                $table->integer('stock')->default(0)->index();
                $table->integer('reserved_stock')->default(0);
                $table->decimal('price', 15, 2)->default(0);
                $table->string('item_status', 50)->default('NORMAL');
                $table->boolean('has_model')->default(false);
                $table->dateTime('last_synced_at')->nullable()->index();
                $table->json('raw_data')->nullable();
                $table->timestamps();

                // Unique per item variation
                $table->unique(['shopee_account_id', 'item_id', 'model_id'], 'shopee_prod_unique_variant');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shopee_products');
    }
};

