<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number')->unique();
            $table->date('payment_date');
            $table->string('payment_type'); // customer_invoice, factory_receivable
            $table->string('payment_method'); // cash, bank_transfer, credit_card, debit_card, e_wallet, other
            $table->decimal('amount', 15, 2);
            $table->string('reference_number')->nullable();
            $table->string('bank_account')->nullable();
            $table->string('cash_account')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('status')->default('posted'); // posted, cancelled
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
