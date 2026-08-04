<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** Permission baru untuk alur persetujuan barang masuk. */
    private const PERMISSIONS = [
        'stock.receipt.request' => 'Ajukan Barang Masuk',
        'stock.receipt.approve' => 'Setujui / Tolak Barang Masuk (PIC Gudang)',
    ];

    /**
     * Ditulis sebagai migration, bukan seeder, supaya database yang sudah
     * berjalan ikut mendapat permission ini tanpa menimpa hak akses role lain
     * yang mungkin sudah disesuaikan manual.
     */
    public function up(): void
    {
        $permissionIds = [];

        foreach (self::PERMISSIONS as $name => $description) {
            $permissionIds[$name] = Permission::firstOrCreate(
                ['name' => $name],
                ['description' => $description]
            )->id;
        }

        // Role yang sudah boleh adjustment stok otomatis boleh mengajukan.
        Role::whereHas('permissions', fn ($q) => $q->where('name', 'stock.adjust'))
            ->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([
                $permissionIds['stock.receipt.request'],
            ]));

        // Super Admin tetap bisa menyetujui agar sistem tidak terkunci.
        Role::where('name', 'Super Admin')->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching(
                array_values($permissionIds)
            ));

        // Tim gudang: melihat stok, mengajukan, dan menyetujui barang masuk.
        $warehouseRole = Role::firstOrCreate(
            ['name' => 'PIC Gudang'],
            ['description' => 'Tim gudang: verifikasi dan persetujuan barang masuk']
        );

        $viewStockId = Permission::where('name', 'stock.view')->value('id');

        $warehouseRole->permissions()->syncWithoutDetaching(array_filter([
            $viewStockId,
            $permissionIds['stock.receipt.request'],
            $permissionIds['stock.receipt.approve'],
        ]));
    }

    public function down(): void
    {
        Permission::whereIn('name', array_keys(self::PERMISSIONS))->delete();
        Role::where('name', 'PIC Gudang')->delete();
    }
};
