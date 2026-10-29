<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Simpan lokasi berkas hasil export agar bisa diunduh ulang dari riwayat.
     *
     * Riwayat dibatasi sepuluh terbaru per pengguna, jadi jumlah berkas yang
     * tersimpan ikut terbatas dan tidak menumpuk di disk.
     */
    public function up(): void
    {
        Schema::table('export_logs', function (Blueprint $table) {
            $table->string('file_path')->nullable()->after('file_name');
        });
    }

    public function down(): void
    {
        Schema::table('export_logs', function (Blueprint $table) {
            $table->dropColumn('file_path');
        });
    }
};
