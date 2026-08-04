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
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->string('payment_terms')->default('cash')->after('payment_date'); // cash, cod, tempo_7, tempo_14, tempo_30
            $table->date('due_date')->nullable()->after('payment_terms');
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropColumn(['payment_terms', 'due_date']);
        });
    }
};
