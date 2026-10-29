<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Melengkapi hak akses PIC Gudang.
     *
     * Saat dibuat, role ini hanya diberi izin seputar stok sehingga:
     *  - halaman /dashboard menolak dengan 403 tepat setelah login, karena
     *    setiap user diarahkan ke sana lebih dulu;
     *  - tombol Cetak Resi menolak dengan 403, karena halaman label berada
     *    di bawah izin sales_order.view.
     *
     * Keduanya izin baca saja dan tidak menambah wewenang mengubah data.
     */
    private const REQUIRED = ['dashboard.view', 'sales_order.view'];

    public function up(): void
    {
        $role = Role::where('name', 'PIC Gudang')->first();

        if (!$role) return;

        $ids = Permission::whereIn('name', self::REQUIRED)->pluck('id')->all();

        if ($ids !== []) {
            $role->permissions()->syncWithoutDetaching($ids);
        }
    }

    public function down(): void
    {
        $role = Role::where('name', 'PIC Gudang')->first();

        if (!$role) return;

        $role->permissions()->detach(
            Permission::whereIn('name', self::REQUIRED)->pluck('id')->all()
        );
    }
};
