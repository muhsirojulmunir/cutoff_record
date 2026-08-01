<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_product_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
            $table->string('marketplace');                    // shopee, tiktok_shop
            $table->string('external_product_id')->nullable();
            $table->string('external_sku');
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->string('external_product_name')->nullable();
            $table->string('status')->default('active');      // active, inactive
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->unique(['marketplace_account_id', 'external_sku'], 'mp_mapping_acc_sku_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_product_mappings');
    }
};
