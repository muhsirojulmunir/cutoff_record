<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('cut_off_orders', 'financial_breakdown')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->json('financial_breakdown')->nullable()->after('variation_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('cut_off_orders', 'financial_breakdown')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->dropColumn('financial_breakdown');
            });
        }
    }
};

