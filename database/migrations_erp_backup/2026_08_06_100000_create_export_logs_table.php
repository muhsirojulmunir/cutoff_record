<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Riwayat unduhan file export.
     *
     * Mencatat setiap file yang diunduh pengguna beserta waktunya, sehingga
     * jelas laporan mana yang sudah pernah diambil dan kapan. Berlaku untuk
     * export yang dibuat di server maupun yang dirakit langsung di peramban.
     */
    public function up(): void
    {
        Schema::create('export_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('file_name');
            $table->string('module');                    // label modul, mis. "All Stock"
            $table->string('description')->nullable();   // keterangan filter yang dipakai
            $table->timestamp('exported_at');
            $table->timestamps();

            $table->index(['user_id', 'id'], 'export_logs_user_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_logs');
    }
};
