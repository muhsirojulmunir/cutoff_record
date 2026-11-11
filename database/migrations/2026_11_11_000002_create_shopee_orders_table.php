<?php

use App\Models\ShopeeOrder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shopee_orders')) {
            Schema::create('shopee_orders', ShopeeOrder::buildSchemaCallback());
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shopee_orders');
    }
};
