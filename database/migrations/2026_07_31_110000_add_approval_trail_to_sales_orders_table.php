<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Jejak siapa yang mengajukan, menyetujui, dan menutup Sales Order — dipakai
     * untuk menampilkan "Disetujui oleh ..." pada status timeline.
     */
    public function up(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->foreignId('submitted_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable()->after('submitted_by');

            $table->foreignId('approved_by')->nullable()->after('submitted_at')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');

            $table->foreignId('completed_by')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable()->after('completed_by');
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropConstrainedForeignId('completed_by');
            $table->dropColumn(['submitted_at', 'approved_at', 'completed_at']);
        });
    }
};
