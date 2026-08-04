<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Validasi Delivery Order di gudang.
     *
     * Saat resi discan, paket dinyatakan siap diserahkan ke kurir. Waktu dan
     * petugasnya dicatat agar jelas siapa yang memverifikasi.
     */
    public function up(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->timestamp('resi_scanned_at')->nullable()->after('stock_deducted_at');
            $table->foreignId('resi_scanned_by')->nullable()->after('resi_scanned_at')
                ->constrained('users')->nullOnDelete();
        });

        $scanPermission = Permission::firstOrCreate(
            ['name' => 'dispatch.scan'],
            ['description' => 'Validasi Scan Resi / Serah Terima Kurir']
        );

        Role::whereIn('name', ['Super Admin', 'Admin', 'PIC Gudang'])->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$scanPermission->id]));
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('resi_scanned_by');
            $table->dropColumn('resi_scanned_at');
        });

        Permission::where('name', 'dispatch.scan')->delete();
    }
};
