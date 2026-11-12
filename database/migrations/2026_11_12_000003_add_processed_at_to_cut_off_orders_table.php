<?php

use App\Models\CutOffOrder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cut_off_orders')) {
            return;
        }

        if (! Schema::hasColumn('cut_off_orders', 'processed_at')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->dateTime('processed_at')->nullable()->after('order_date')->index();
            });
        }

        CutOffOrder::backfillProcessedAt();
    }

    public function down(): void
    {
        if (Schema::hasTable('cut_off_orders') && Schema::hasColumn('cut_off_orders', 'processed_at')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $table->dropColumn('processed_at');
            });
        }
    }
};

