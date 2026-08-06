<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kode customer bersifat unik untuk satu tabel penuh, termasuk baris yang
 * sudah diarsipkan. Akibatnya penomoran ulang setelah penghapusan bisa
 * bentrok dengan kode milik customer lama yang sudah dihapus.
 *
 * Migrasi ini melepas kode milik customer yang terlanjur diarsipkan supaya
 * kode tersebut bisa dipakai kembali oleh data aktif.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customers')) {
            return;
        }

        $archived = DB::table('customers')
            ->whereNotNull('deleted_at')
            ->where('customer_code', 'not like', 'ARSIP-%')
            ->get(['id', 'customer_code']);

        foreach ($archived as $customer) {
            DB::table('customers')
                ->where('id', $customer->id)
                ->update(['customer_code' => 'ARSIP-' . $customer->id . '-' . $customer->customer_code]);
        }
    }

    public function down(): void
    {
        // Kode lama tidak dipulihkan: memulihkannya justru mengembalikan bentrok.
    }
};
