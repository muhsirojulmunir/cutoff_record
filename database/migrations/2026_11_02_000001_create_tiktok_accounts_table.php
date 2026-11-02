<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tiktok_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('account_name')->default('RecordShoesOfficial');
            $table->string('app_key')->nullable()->index();
            $table->text('app_secret')->nullable();
            $table->string('service_id')->nullable();
            $table->string('shop_id')->nullable()->index();
            $table->text('shop_cipher')->nullable();
            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('refresh_expires_at')->nullable();
            $table->string('status', 20)->default('active'); // active, inactive
            $table->string('connection_status', 30)->default('disconnected'); // connected, disconnected, expired, error
            $table->timestamp('last_synced_at')->nullable();
            $table->string('last_sync_status', 30)->nullable(); // success, failed, partial
            $table->text('last_sync_error')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tiktok_accounts');
    }
};

