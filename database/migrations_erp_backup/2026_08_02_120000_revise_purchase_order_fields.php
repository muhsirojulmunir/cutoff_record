<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi permintaan klien untuk Purchase Order:
 * - Estimasi pengiriman (tanggal) diganti estimasi pengerjaan pabrik dalam hari.
 * - Sumber PO dihapus, diganti pilihan pembayaran (cash to cash / termin 7 hari).
 * - Pajak & diskon dihapus; sebagai gantinya ada penanda free ongkir.
 *   Nominal ongkir diisi admin saat penerimaan barang.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->unsignedSmallInteger('production_lead_time_days')->nullable()->after('order_date');
            $table->boolean('is_free_shipping')->default(false)->after('shipping_cost');
        });

        // Samakan istilah termin lama ke dua pilihan baru.
        DB::table('purchase_orders')->where('payment_terms', 'cash_on_delivery')->update(['payment_terms' => 'cash_to_cash']);
        DB::table('purchase_orders')->whereIn('payment_terms', ['tempo_1_week', 'tempo_2_weeks'])->update(['payment_terms' => 'tempo_7_days']);

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn(['expected_delivery_date', 'source', 'discount_amount', 'tax_amount']);
        });

        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropColumn(['discount_amount', 'tax_amount']);
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->date('expected_delivery_date')->nullable()->after('order_date');
            $table->string('source')->default('manual')->after('expected_delivery_date');
            $table->decimal('discount_amount', 15, 2)->default(0.00)->after('subtotal');
            $table->decimal('tax_amount', 15, 2)->default(0.00)->after('discount_amount');
            $table->dropColumn(['production_lead_time_days', 'is_free_shipping']);
        });

        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->decimal('discount_amount', 15, 2)->default(0.00)->after('unit_price');
            $table->decimal('tax_amount', 15, 2)->default(0.00)->after('discount_amount');
        });
    }
};
