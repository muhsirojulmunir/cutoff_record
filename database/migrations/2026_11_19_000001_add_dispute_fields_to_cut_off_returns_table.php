<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cut_off_returns', function (Blueprint $table) {
            if (! Schema::hasColumn('cut_off_returns', 'due_date')) {
                $table->dateTime('due_date')->nullable()->after('tgl_banding')->index();
            }
            if (! Schema::hasColumn('cut_off_returns', 'return_status')) {
                $table->string('return_status', 100)->nullable()->after('due_date')->index();
            }
            if (! Schema::hasColumn('cut_off_returns', 'needs_action')) {
                $table->boolean('needs_action')->default(false)->after('return_status')->index();
            }
            if (! Schema::hasColumn('cut_off_returns', 'refund_amount')) {
                $table->decimal('refund_amount', 12, 2)->nullable()->after('needs_action');
            }
            if (! Schema::hasColumn('cut_off_returns', 'seller_solution')) {
                $table->string('seller_solution', 100)->nullable()->after('refund_amount');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cut_off_returns', function (Blueprint $table) {
            $dropCols = [];
            foreach (['due_date', 'return_status', 'needs_action', 'refund_amount', 'seller_solution'] as $col) {
                if (Schema::hasColumn('cut_off_returns', $col)) {
                    $dropCols[] = $col;
                }
            }
            if (! empty($dropCols)) {
                $table->dropColumn($dropCols);
            }
        });
    }
};
