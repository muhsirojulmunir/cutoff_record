<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi permintaan klien untuk master data supplier pabrik:
 * - Kolom NPWP dihapus.
 * - Satu pabrik bisa punya banyak rekening bank, jadi bank dipindah
 *   ke tabel tersendiri.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_bank_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->string('bank_name');
            $table->string('account_number')->nullable();
            $table->string('account_holder')->nullable();
            $table->timestamps();

            $table->index('supplier_id');
        });

        // Pindahkan rekening lama (satu per supplier) ke tabel baru.
        DB::table('suppliers')
            ->whereNotNull('bank_name')
            ->where('bank_name', '!=', '')
            ->orderBy('id')
            ->each(function ($supplier) {
                DB::table('supplier_bank_accounts')->insert([
                    'supplier_id'    => $supplier->id,
                    'bank_name'      => $supplier->bank_name,
                    'account_number' => $supplier->bank_account_number,
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
            });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['tax_number', 'bank_name', 'bank_account_number']);
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('tax_number')->nullable()->after('address');
            $table->string('bank_name')->nullable()->after('tax_number');
            $table->string('bank_account_number')->nullable()->after('bank_name');
        });

        Schema::dropIfExists('supplier_bank_accounts');
    }
};
