<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace');                    // shopee, tiktok_shop
            $table->string('account_name');
            $table->string('shop_id')->nullable();
            $table->string('shop_name')->nullable();
            $table->string('external_account_id')->nullable();
            $table->string('status')->default('active');      // active, inactive, error
            $table->string('credentials_status')->default('not_configured'); // not_configured, configured, expired, error
            $table->timestamp('last_synced_at')->nullable();
            $table->string('last_sync_status')->nullable();
            $table->text('last_sync_error')->nullable();
            $table->text('settings')->nullable();             // JSON encrypted settings
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_accounts');
    }
};
