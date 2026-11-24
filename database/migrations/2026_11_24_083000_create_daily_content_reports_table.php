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
        Schema::create('daily_content_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('content_type', 30)->default('santai'); // 'santai', 'produk', 'semua'
            $table->string('title', 255);
            $table->text('ig_link')->nullable();
            $table->text('tiktok_link')->nullable();
            $table->text('shopee_link')->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 30)->default('submitted'); // 'submitted', 'reviewed'
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('feedback')->nullable();
            $table->timestamp('reported_at')->useCurrent();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'reported_at']);
            $table->index(['content_type', 'reported_at']);
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('daily_content_reports');
    }
};
