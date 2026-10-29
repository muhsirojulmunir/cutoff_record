<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi permintaan klien:
 * - Kolom "Ukuran" (teks bebas) diganti dimensi Panjang x Lebar,
 *   khusus produk kardus ditambah Tinggi (P x L x T).
 * - Kolom "Satuan" dihapus; dokumen transaksi memakai default "pcs".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('is_box')->default(false)->after('color');
            $table->decimal('length', 10, 2)->nullable()->after('is_box');
            $table->decimal('width', 10, 2)->nullable()->after('length');
            $table->decimal('height', 10, 2)->nullable()->after('width');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['size', 'unit']);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('size')->nullable()->after('brand');
            $table->string('unit')->default('pcs')->after('color');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['is_box', 'length', 'width', 'height']);
        });
    }
};
