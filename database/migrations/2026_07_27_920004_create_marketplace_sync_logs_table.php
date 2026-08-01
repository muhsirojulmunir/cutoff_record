<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
            $table->string('marketplace');                    // shopee, tiktok_shop
            $table->string('sync_type');                      // orders, products, inventory, shipments
            $table->string('status');                         // running, success, partial, failed
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->integer('records_fetched')->default(0);
            $table->integer('records_created')->default(0);
            $table->integer('records_updated')->default(0);
            $table->integer('records_skipped')->default(0);
            $table->integer('records_failed')->default(0);
            $table->text('error_message')->nullable();
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_sync_logs');
    }
};
