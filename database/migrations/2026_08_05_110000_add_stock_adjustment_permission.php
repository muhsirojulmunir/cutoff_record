<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Hak khusus untuk menu Adjustment Stok.
     *
     * Dibuat terpisah dari stock.adjust yang lama agar hak akses role yang
     * sudah berjalan tidak berubah; menu baru ini khusus Leader, dengan
     * Super Admin tetap disertakan supaya sistem tidak terkunci.
     */
    private const PERMISSION = 'stock.adjustment.manage';

    public function up(): void
    {
        $permission = Permission::firstOrCreate(
            ['name' => self::PERMISSION],
            ['description' => 'Adjustment / Koreksi Stok (Leader)']
        );

        Role::whereIn('name', ['Leader', 'Super Admin'])->get()
            ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$permission->id]));

        // Leader perlu bisa membuka halaman stok untuk melihat hasil koreksinya.
        $viewStock = Permission::where('name', 'stock.view')->value('id');

        if ($viewStock) {
            Role::where('name', 'Leader')->get()
                ->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$viewStock]));
        }
    }

    public function down(): void
    {
        Permission::where('name', self::PERMISSION)->delete();
    }
};
