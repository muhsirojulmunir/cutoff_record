<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Izin untuk pencatatan pengisian dana mingguan (Petty Cash & Dana Kelola).
 * Finance & Admin boleh mencatat, Leader dan Management hanya melihat.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        'fund_allocation.view'   => 'Lihat Pengisian Dana Mingguan',
        'fund_allocation.create' => 'Catat Pengisian Dana Mingguan',
    ];

    private const ROLE_GRANTS = [
        'Super Admin' => ['fund_allocation.view', 'fund_allocation.create'],
        'Finance'     => ['fund_allocation.view', 'fund_allocation.create'],
        'Admin'       => ['fund_allocation.view', 'fund_allocation.create'],
        'Leader'      => ['fund_allocation.view'],
        'Management'  => ['fund_allocation.view'],
    ];

    public function up(): void
    {
        $permissionIds = [];

        foreach (self::PERMISSIONS as $name => $description) {
            $existing = DB::table('permissions')->where('name', $name)->first();

            $permissionIds[$name] = $existing
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
                $alreadyGranted = DB::table('role_permission')
                    ->where('role_id', $role->id)
                    ->where('permission_id', $permissionIds[$permission])
                    ->exists();

                if (! $alreadyGranted) {
                    DB::table('role_permission')->insert([
                        'role_id'       => $role->id,
                        'permission_id' => $permissionIds[$permission],
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
