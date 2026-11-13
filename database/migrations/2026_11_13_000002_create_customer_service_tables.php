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
        if (! Schema::hasTable('cs_conversations')) {
            Schema::create('cs_conversations', function (Blueprint $table) {
                $table->id();
                $table->string('external_conv_id')->unique();
                $table->string('channel', 20)->default('shopee'); // shopee, tiktok
                $table->string('shop_id')->nullable();
                $table->string('shop_name')->nullable();
                $table->string('buyer_id')->nullable();
                $table->string('buyer_username');
                $table->string('buyer_name')->nullable();
                $table->string('buyer_avatar', 500)->nullable();
                $table->unsignedInteger('unread_count')->default(0);
                $table->text('last_message')->nullable();
                $table->timestamp('last_message_time')->nullable();
                $table->string('last_message_sender', 20)->default('buyer');
                $table->string('status', 20)->default('unread'); // unread, read, resolved
                $table->string('group', 20)->default('unread');  // unread, manual, auto
                $table->string('order_sn')->nullable();
                $table->text('notes')->nullable();
                $table->timestamp('api_synced_at')->nullable();
                $table->json('extra_data')->nullable();
                $table->timestamps();

                $table->index(['channel', 'status']);
                $table->index('buyer_username');
                $table->index('order_sn');
            });
        }

        if (! Schema::hasTable('cs_messages')) {
            Schema::create('cs_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('conversation_id')->constrained('cs_conversations')->cascadeOnDelete();
                $table->string('external_message_id')->nullable()->index();
                $table->string('sender', 20)->default('buyer'); // buyer, seller
                $table->string('message_type', 30)->default('text'); // text, image, order, etc.
                $table->text('text');
                $table->string('media_url', 500)->nullable();
                $table->string('status', 20)->default('received'); // pending, sent, received, read, failed
                $table->text('error_message')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamps();

                $table->index(['conversation_id', 'created_at']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cs_messages');
        Schema::dropIfExists('cs_conversations');
    }
};

