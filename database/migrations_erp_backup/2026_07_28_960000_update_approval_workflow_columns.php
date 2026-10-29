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
        // Add approval workflow columns to purchase_orders
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('leader_approved_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->timestamp('leader_approved_at')->nullable()->after('leader_approved_by');
            $table->foreignId('finance_approved_by')->nullable()->after('leader_approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('finance_approved_at')->nullable()->after('finance_approved_by');
            $table->foreignId('rejected_by')->nullable()->after('finance_approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable()->after('rejected_by');
            $table->text('reject_reason')->nullable()->after('rejected_at');
        });

        // Add approval & execution workflow columns to petty_cash_transactions
        Schema::table('petty_cash_transactions', function (Blueprint $table) {
            $table->foreignId('leader_approved_by')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('leader_approved_at')->nullable()->after('leader_approved_by');
            $table->foreignId('finance_approved_by')->nullable()->after('leader_approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('finance_approved_at')->nullable()->after('finance_approved_by');
            $table->foreignId('executed_by')->nullable()->after('finance_approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('executed_at')->nullable()->after('executed_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropForeign(['leader_approved_by']);
            $table->dropForeign(['finance_approved_by']);
            $table->dropForeign(['rejected_by']);
            $table->dropColumn([
                'leader_approved_by',
                'leader_approved_at',
                'finance_approved_by',
                'finance_approved_at',
                'rejected_by',
                'rejected_at',
                'reject_reason',
            ]);
        });

        Schema::table('petty_cash_transactions', function (Blueprint $table) {
            $table->dropForeign(['leader_approved_by']);
            $table->dropForeign(['finance_approved_by']);
            $table->dropForeign(['executed_by']);
            $table->dropColumn([
                'leader_approved_by',
                'leader_approved_at',
                'finance_approved_by',
                'finance_approved_at',
                'executed_by',
                'executed_at',
            ]);
        });
    }
};
