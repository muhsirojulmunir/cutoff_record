<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Super Admin boleh menghapus kategori yang masih menempel di produk.
 * Produknya tidak ikut terhapus, melainkan menjadi tanpa kategori — jadi
 * kolomnya perlu boleh kosong.
 *
 * Foreign key products.category_id tidak selalu ada di setiap database
 * (di server hosting bisa saja tidak terbentuk), sehingga keberadaannya
 * diperiksa dulu dan hanya dipasang kembali bila memang tadinya ada.
 */
return new class extends Migration
{
    private const FOREIGN_KEY = 'products_category_id_foreign';

    public function up(): void
    {
        $hadForeignKey = $this->foreignKeyExists();

        if ($hadForeignKey) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropForeign(self::FOREIGN_KEY);
            });
        }

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('category_id')->nullable()->change();
        });

        if ($hadForeignKey) {
            Schema::table('products', function (Blueprint $table) {
                $table->foreign('category_id', self::FOREIGN_KEY)
                    ->references('id')->on('categories')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        $hadForeignKey = $this->foreignKeyExists();

        if ($hadForeignKey) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropForeign(self::FOREIGN_KEY);
            });
        }

        // Produk tanpa kategori harus punya isi dulu sebelum kolomnya
        // dikembalikan menjadi wajib.
        $fallbackId = DB::table('categories')->whereNull('deleted_at')->min('id');

        if ($fallbackId) {
            DB::table('products')->whereNull('category_id')->update(['category_id' => $fallbackId]);
        }

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('category_id')->nullable(false)->change();
        });

        if ($hadForeignKey) {
            Schema::table('products', function (Blueprint $table) {
                $table->foreign('category_id', self::FOREIGN_KEY)
                    ->references('id')->on('categories')->restrictOnDelete();
            });
        }
    }

    private function foreignKeyExists(): bool
    {
        $found = DB::selectOne(
            'SELECT CONSTRAINT_NAME
               FROM information_schema.TABLE_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE()
                AND TABLE_NAME = ?
                AND CONSTRAINT_NAME = ?
                AND CONSTRAINT_TYPE = ?',
            ['products', self::FOREIGN_KEY, 'FOREIGN KEY']
        );

        return $found !== null;
    }
};
