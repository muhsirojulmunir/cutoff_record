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
        if (Schema::hasTable('downloaded_waybills')) {
            return;
        }

        Schema::create('downloaded_waybills', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 32)->index(); // 'shopee' | 'tiktok'
            $table->string('file_name', 255);
            $table->string('file_path', 255);
            $table->unsignedInteger('file_size')->default(0); // in bytes
            $table->unsignedInteger('order_count')->default(1);
            $table->json('order_sns'); // Array of order SNs included in this PDF
            $table->unsignedBigInteger('downloaded_by')->nullable()->index();
            $table->string('downloaded_by_name', 100)->nullable();
            $table->timestamp('downloaded_at')->index();
            $table->timestamp('expires_at')->index(); // Auto-cleanup threshold (90 days)
            $table->timestamps();

            $table->index(['channel', 'expires_at']);
            $table->index(['channel', 'downloaded_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('downloaded_waybills');
    }
};
