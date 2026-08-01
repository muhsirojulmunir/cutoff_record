<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketplace_accounts', function (Blueprint $table) {
            $table->text('credentials')->nullable()->after('settings'); // Encrypted credentials JSON
            $table->string('connection_status')->default('disconnected')->after('credentials_status'); // connected, disconnected, expired, error
            $table->timestamp('token_expires_at')->nullable()->after('last_synced_at');
            $table->timestamp('last_connected_at')->nullable()->after('token_expires_at');
        });

        Schema::table('marketplace_orders', function (Blueprint $table) {
            $table->string('tracking_number')->nullable()->after('fulfillment_status'); // Nomor resi
            $table->string('courier_name')->nullable()->after('tracking_number');        // Nama kurir / ekspedisi
            $table->string('province')->nullable()->after('shipping_address');
            $table->string('city')->nullable()->after('province');
            $table->string('district')->nullable()->after('city');
            $table->string('postal_code')->nullable()->after('district');
            $table->decimal('service_fee', 15, 2)->default(0.00)->after('shipping_fee');
            $table->decimal('voucher_discount', 15, 2)->default(0.00)->after('discount');
        });
    }

    public function down(): void
    {
        Schema::table('marketplace_accounts', function (Blueprint $table) {
            $table->dropColumn(['credentials', 'connection_status', 'token_expires_at', 'last_connected_at']);
        });

        Schema::table('marketplace_orders', function (Blueprint $table) {
            $table->dropColumn([
                'tracking_number', 'courier_name', 'province', 'city',
                'district', 'postal_code', 'service_fee', 'voucher_discount'
            ]);
        });
    }
};
