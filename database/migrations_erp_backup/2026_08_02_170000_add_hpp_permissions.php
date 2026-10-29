<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * HPP hanya boleh dilihat dan diisi oleh Finance dan Leader (plus Super Admin).
 * Admin tetap mengurus master produk tanpa melihat angka modal.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'hpp.view'   => 'Lihat HPP Produk',
        'hpp.manage' => 'Input & Ubah HPP Produk',
    ];

    private const ROLE_GRANTS = [
        'Super Admin' => ['hpp.view', 'hpp.manage'],
        'Finance'     => ['hpp.view', 'hpp.manage'],
        'Leader'      => ['hpp.view', 'hpp.manage'],
    ];

    public function up(): void
    {
        $ids = [];

        foreach (self::PERMISSIONS as $name => $description) {
            $existing = DB::table('permissions')->where('name', $name)->first();

            $ids[$name] = $existing
                ? $existing->id
                : DB::table('permissions')->insertGetId([
                    'name'        => $name,
                    'description' => $description,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]);
        }

        foreach (self::ROLE_GRANTS as $roleName => $permissions) {
            $role = DB::table('roles')->where('name', $roleName)->first();

            if (! $role) {
                continue;
            }

            foreach ($permissions as $permission) {
                $granted = DB::table('role_permission')
                    ->where('role_id', $role->id)
                    ->where('permission_id', $ids[$permission])
                    ->exists();

                if (! $granted) {
                    DB::table('role_permission')->insert([
                        'role_id'       => $role->id,
                        'permission_id' => $ids[$permission],
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->whereIn('name', array_keys(self::PERMISSIONS))->pluck('id');

        DB::table('role_permission')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
