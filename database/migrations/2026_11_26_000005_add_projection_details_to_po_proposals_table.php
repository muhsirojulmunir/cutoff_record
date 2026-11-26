<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('po_proposals')) {
            Schema::table('po_proposals', function (Blueprint $table) {
                if (! Schema::hasColumn('po_proposals', 'target_months')) {
                    $table->unsignedInteger('target_months')->nullable()->after('stock_coverage_months');
                }
                if (! Schema::hasColumn('po_proposals', 'target_stock')) {
                    $table->integer('target_stock')->nullable()->after('target_months');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('po_proposals')) {
            Schema::table('po_proposals', function (Blueprint $table) {
                if (Schema::hasColumn('po_proposals', 'target_stock')) {
                    $table->dropColumn('target_stock');
                }
                if (Schema::hasColumn('po_proposals', 'target_months')) {
                    $table->dropColumn('target_months');
                }
            });
        }
    }
};
