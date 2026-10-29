<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    private const PERMISSIONS = [
        'stock_return.view'    => 'Lihat Daftar Retur Stok',
        'stock_return.create'  => 'Ajukan Retur Stok',
        'stock_return.approve' => 'Setujui / Tolak Retur Stok (Leader)',
    ];

    public function up(): void
    {
        $ids = [];

        foreach (self::PERMISSIONS as $name => $description) {
            $ids[$name] = Permission::firstOrCreate(
                ['name' => $name],
                ['description' => $description]
            )->id;
        }

        // Super Admin mendapat semua permission retur
        Role::where('name', 'Super Admin')->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching(array_values($ids)));

        // Leader bisa melihat, mengajukan, dan menyetujui retur
        Role::where('name', 'Leader')->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching(array_values($ids)));

        // Admin: lihat + ajukan retur
        Role::where('name', 'Admin')->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([
                $ids['stock_return.view'],
                $ids['stock_return.create'],
            ]));

        // PIC Gudang: lihat + ajukan retur
        Role::where('name', 'PIC Gudang')->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([
                $ids['stock_return.view'],
                $ids['stock_return.create'],
            ]));
    }

    public function down(): void
    {
        Permission::whereIn('name', array_keys(self::PERMISSIONS))->delete();
    }
};
