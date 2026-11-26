<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('cut_off_orders') && ! Schema::hasColumn('cut_off_orders', 'management_resolved_note')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->text('management_resolved_note')->nullable()->after('management_resolved_by_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('cut_off_orders') && Schema::hasColumn('cut_off_orders', 'management_resolved_note')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->dropColumn('management_resolved_note');
            });
        }
    }
};
