<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HPP produk diinput sendiri oleh Finance & Leader, terpisah dari master produk
 * yang diisi Admin. Satu produk punya satu nilai HPP berjalan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_hpps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->unique()->constrained('products')->cascadeOnDelete();
            $table->decimal('hpp', 15, 2)->default(0);
            $table->date('effective_date');
            $table->text('notes')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_hpps');
    }
};
