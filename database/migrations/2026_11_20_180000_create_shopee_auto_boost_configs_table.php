<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shopee_auto_boost_configs')) {
            Schema::create('shopee_auto_boost_configs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('shopee_account_id')->index();
                $table->boolean('is_enabled')->default(false);
                $table->json('target_item_ids')->nullable();
                $table->integer('last_boosted_index')->default(0);
                $table->dateTime('last_run_at')->nullable();
                $table->string('last_run_status', 50)->nullable();
                $table->text('last_run_message')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shopee_auto_boost_configs');
    }
};
