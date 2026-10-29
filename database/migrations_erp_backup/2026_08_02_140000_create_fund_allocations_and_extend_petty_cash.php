<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi permintaan klien untuk kas kecil:
 * - Finance menerima dana tiap minggu untuk mengisi Petty Cash, jadi pengisian
 *   dana dicatat per periode mingguan beserta sisa saldonya.
 * - Selain Petty Cash (kebutuhan kantor) ada Dana Kelola untuk kebutuhan lain.
 * - Transaksi mencantumkan kode COA yang diketik sendiri oleh Finance.
 * - Bukti pembayaran diunggah ke folder Google Drive mingguan, bukan ke hosting.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Pengisian dana mingguan (Petty Cash / Dana Kelola).
        Schema::create('fund_allocations', function (Blueprint $table) {
            $table->id();
            $table->string('fund_type');                 // petty_cash, dana_kelola
            $table->date('period_start');                // Senin
            $table->date('period_end');                  // Minggu
            $table->decimal('amount', 18, 2);
            $table->foreignId('cash_bank_account_id')->nullable()->constrained('cash_bank_accounts')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index(['fund_type', 'period_start']);
        });

        // Cache folder Google Drive per minggu supaya tidak dibuat berulang.
        Schema::create('drive_week_folders', function (Blueprint $table) {
            $table->id();
            $table->date('period_start')->unique();
            $table->date('period_end');
            $table->string('folder_name');
            $table->string('folder_id');
            $table->string('folder_link')->nullable();
            $table->timestamps();
        });

        Schema::table('petty_cash_transactions', function (Blueprint $table) {
            $table->string('fund_type')->default('petty_cash')->after('transaction_date');
            $table->string('coa_code')->nullable()->after('expense_category_id');
            $table->string('attachment_name')->nullable()->after('attachment');
            $table->string('attachment_link', 1000)->nullable()->after('attachment_name');

            $table->index(['fund_type', 'transaction_date']);
        });
    }

    public function down(): void
    {
        Schema::table('petty_cash_transactions', function (Blueprint $table) {
            $table->dropIndex(['fund_type', 'transaction_date']);
            $table->dropColumn(['fund_type', 'coa_code', 'attachment_name', 'attachment_link']);
        });

        Schema::dropIfExists('drive_week_folders');
        Schema::dropIfExists('fund_allocations');
    }
};
