<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * User tidak bisa di-hard-delete karena masih dirujuk sebagai created_by /
     * approved_by pada dokumen (PO, SO, invoice, dst). Soft delete menjaga baris
     * tetap ada sehingga foreign key aman dan jejak audit tidak hilang.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
