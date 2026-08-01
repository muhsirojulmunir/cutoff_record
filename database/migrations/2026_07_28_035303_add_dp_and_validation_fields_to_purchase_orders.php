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
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->decimal('dp_amount', 15, 2)->default(0.00)->after('grand_total');
            $table->decimal('dp_paid_amount', 15, 2)->default(0.00)->after('dp_amount');
            $table->date('dp_payment_date')->nullable()->after('dp_paid_amount');
            $table->foreignId('dp_cash_bank_account_id')->nullable()->constrained('cash_bank_accounts')->nullOnDelete()->after('dp_payment_date');
            
            $table->string('payment_terms')->default('cash_on_delivery')->after('dp_cash_bank_account_id'); // cash_on_delivery, tempo_1_week, tempo_2_weeks
            
            $table->decimal('validated_subtotal', 15, 2)->nullable()->after('payment_terms');
            $table->decimal('validated_grand_total', 15, 2)->nullable()->after('validated_subtotal');
            $table->decimal('final_bill_amount', 15, 2)->nullable()->after('validated_grand_total');
            
            $table->boolean('is_finance_validated')->default(false)->after('final_bill_amount');
            $table->foreignId('finance_validated_by')->nullable()->constrained('users')->nullOnDelete()->after('is_finance_validated');
            $table->timestamp('finance_validated_at')->nullable()->after('finance_validated_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropForeign(['dp_cash_bank_account_id']);
            $table->dropForeign(['finance_validated_by']);
            $table->dropColumn([
                'dp_amount',
                'dp_paid_amount',
                'dp_payment_date',
                'dp_cash_bank_account_id',
                'payment_terms',
                'validated_subtotal',
                'validated_grand_total',
                'final_bill_amount',
                'is_finance_validated',
                'finance_validated_by',
                'finance_validated_at',
            ]);
        });
    }
};
