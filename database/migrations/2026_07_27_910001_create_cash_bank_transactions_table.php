<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_bank_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_number')->unique();    // CB-YYYYMM-XXXX
            $table->foreignId('account_id')->constrained('cash_bank_accounts')->restrictOnDelete();
            $table->date('transaction_date');
            $table->string('transaction_type');                // opening_balance, customer_payment, supplier_payment, petty_cash, cash_in, cash_out, adjustment
            $table->string('direction');                       // in, out
            $table->decimal('amount', 18, 2);
            $table->decimal('balance_before', 18, 2);
            $table->decimal('balance_after', 18, 2);
            $table->string('source_type')->nullable();         // App\Models\Payment, App\Models\PettyCashTransaction, null
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('description');
            $table->string('reference_number')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('status')->default('posted');       // posted, reversed
            $table->timestamps();
            $table->softDeletes();

            $table->index(['source_type', 'source_id'], 'cb_txn_source_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_bank_transactions');
    }
};
