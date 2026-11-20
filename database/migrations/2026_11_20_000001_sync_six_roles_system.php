<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $targetRoles = [
            'Super Admin' => 'Akses penuh ke seluruh sistem tanpa batasan',
            'Admin'       => 'Akses operasional dan administrasi sistem',
            'Gudang'      => 'Akses operasional gudang, inventori, dan stok',
            'PIC'         => 'Akses penanggung jawab operasional',
            'Direktur'    => 'Akses eksekutif dan pemantauan level direksi',
            'PIC Gudang'  => 'Akses penanggung jawab operasional dan verifikasi gudang',
        ];

        // 1. Jika ada role Management, alihkan user dan perbarui namanya ke Direktur
        $managementRole = Role::where('name', 'Management')->first();
        if ($managementRole) {
            $direkturRole = Role::where('name', 'Direktur')->first();
            if (! $direkturRole) {
                $managementRole->update([
                    'name'        => 'Direktur',
                    'description' => $targetRoles['Direktur'],
                ]);
            } else {
                User::where('role_id', $managementRole->id)->update(['role_id' => $direkturRole->id]);
                $managementRole->permissions()->detach();
                $managementRole->delete();
            }
        }

        // 2. Pastikan ke-6 role ada
        foreach ($targetRoles as $name => $desc) {
            $role = Role::firstOrCreate(
                ['name' => $name],
                ['description' => $desc]
            );
            $role->update(['description' => $desc]);
        }

        // 3. Hapus role selain 6 role target jika tidak memiliki user (misal: role 'User')
        Role::whereNotIn('name', array_keys($targetRoles))
            ->doesntHave('users')
            ->each(function ($role) {
                $role->permissions()->detach();
                $role->delete();
            });

        // 4. Pastikan Super Admin dan Admin punya permission yang benar, dan role lain punya dashboard.view
        $allPerms = Permission::all();
        $dashboardPerm = Permission::where('name', 'dashboard.view')->first();

        $superAdmin = Role::where('name', 'Super Admin')->first();
        if ($superAdmin && $allPerms->isNotEmpty()) {
            $superAdmin->permissions()->sync($allPerms->pluck('id'));
        }

        $admin = Role::where('name', 'Admin')->first();
        if ($admin && $allPerms->isNotEmpty()) {
            $adminPerms = $allPerms->whereIn('name', ['dashboard.view', 'user.view', 'role.view'])->pluck('id');
            $admin->permissions()->sync($adminPerms);
        }

        if ($dashboardPerm) {
            foreach (Role::whereIn('name', array_keys($targetRoles))->get() as $r) {
                if ($r->permissions()->count() === 0) {
                    $r->permissions()->attach($dashboardPerm->id);
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};
