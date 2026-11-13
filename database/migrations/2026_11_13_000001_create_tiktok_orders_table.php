<?php

use App\Models\TiktokOrder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tiktok_orders')) {
            Schema::create('tiktok_orders', TiktokOrder::buildSchemaCallback());
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tiktok_orders');
    }
};

