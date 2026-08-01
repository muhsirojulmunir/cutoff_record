<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_bank_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('account_code')->unique();         // ACC-0001
            $table->string('account_name');
            $table->string('account_type');                   // cash, bank, e_wallet
            $table->string('account_number')->nullable();
            $table->string('bank_name')->nullable();
            $table->string('account_holder')->nullable();
            $table->decimal('opening_balance', 18, 2)->default(0);
            $table->decimal('current_balance', 18, 2)->default(0);
            $table->boolean('allow_negative_balance')->default(false);
            $table->string('status')->default('active');      // active, inactive
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_bank_accounts');
    }
};
