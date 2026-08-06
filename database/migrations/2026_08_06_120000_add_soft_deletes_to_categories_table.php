<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kategori sebelumnya dihapus permanen. Karena kolom products.category_id
 * wajib diisi dan memakai foreign key RESTRICT, penghapusan selalu gagal
 * ketika masih ada produk yang pernah memakai kategori itu — termasuk produk
 * yang sudah diarsipkan. Dengan soft delete, kategori cukup diarsipkan
 * sehingga riwayat produk lama tetap utuh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
