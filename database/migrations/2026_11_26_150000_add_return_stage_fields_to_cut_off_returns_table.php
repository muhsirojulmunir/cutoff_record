<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cut_off_returns', function (Blueprint $table) {
            if (! Schema::hasColumn('cut_off_returns', 'return_logistics_status')) {
                $table->string('return_logistics_status', 80)->nullable()->index()->after('return_status');
            }
            if (! Schema::hasColumn('cut_off_returns', 'return_shipped_at')) {
                $table->timestamp('return_shipped_at')->nullable()->after('return_logistics_status');
            }
            if (! Schema::hasColumn('cut_off_returns', 'estimated_arrival_at')) {
                $table->timestamp('estimated_arrival_at')->nullable()->after('return_shipped_at');
            }
            if (! Schema::hasColumn('cut_off_returns', 'arrival_eta_source')) {
                $table->string('arrival_eta_source', 30)->nullable()->after('estimated_arrival_at');
            }
            if (! Schema::hasColumn('cut_off_returns', 'dispute_action')) {
                $table->string('dispute_action', 40)->nullable()->index()->after('needs_action');
            }
            if (! Schema::hasColumn('cut_off_returns', 'dispute_action_at')) {
                $table->timestamp('dispute_action_at')->nullable()->after('dispute_action');
            }
            if (! Schema::hasColumn('cut_off_returns', 'dispute_action_by')) {
                $table->string('dispute_action_by', 120)->nullable()->after('dispute_action_at');
            }
            if (! Schema::hasColumn('cut_off_returns', 'dispute_action_note')) {
                $table->string('dispute_action_note', 255)->nullable()->after('dispute_action_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cut_off_returns', function (Blueprint $table) {
            $cols = [
                'return_logistics_status',
                'return_shipped_at',
                'estimated_arrival_at',
                'arrival_eta_source',
                'dispute_action',
                'dispute_action_at',
                'dispute_action_by',
                'dispute_action_note',
            ];
            foreach ($cols as $col) {
                if (Schema::hasColumn('cut_off_returns', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
