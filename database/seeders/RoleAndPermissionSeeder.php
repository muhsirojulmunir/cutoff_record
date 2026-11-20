<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class RoleAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        // --------------------
        // CORE PERMISSIONS
        // --------------------
        $permissions = [
            // Dashboard
            'dashboard.view' => 'Lihat Dashboard',

            // User Management
            'user.view'      => 'Lihat Pengguna',
            'user.create'    => 'Tambah Pengguna',
            'user.edit'      => 'Ubah Pengguna',
            'user.delete'    => 'Hapus Pengguna',

            // Role Management
            'role.view'      => 'Lihat Role & Permission',
        ];

        foreach ($permissions as $name => $desc) {
            Permission::firstOrCreate(
                ['name' => $name],
                ['description' => $desc]
            );
        }

        $allPermissions = Permission::all();

        // --------------------
        // ROLES (6 Role Standar)
        // --------------------
        $superAdmin = Role::firstOrCreate(
            ['name' => 'Super Admin'],
            ['description' => 'Akses penuh ke seluruh sistem tanpa batasan']
        );
        $admin = Role::firstOrCreate(
            ['name' => 'Admin'],
            ['description' => 'Akses operasional dan administrasi sistem']
        );
        $gudang = Role::firstOrCreate(
            ['name' => 'Gudang'],
            ['description' => 'Akses operasional gudang, inventori, dan stok']
        );
        $pic = Role::firstOrCreate(
            ['name' => 'PIC'],
            ['description' => 'Akses penanggung jawab operasional']
        );
        $direktur = Role::firstOrCreate(
            ['name' => 'Direktur'],
            ['description' => 'Akses eksekutif dan pemantauan level direksi']
        );
        $picGudang = Role::firstOrCreate(
            ['name' => 'PIC Gudang'],
            ['description' => 'Akses penanggung jawab operasional dan verifikasi gudang']
        );

        // Assign Permissions to Roles
        $superAdmin->permissions()->sync($allPermissions->pluck('id'));
        $admin->permissions()->sync(
            $allPermissions->whereIn('name', [
                'dashboard.view',
                'user.view',
                'role.view',
            ])->pluck('id')
        );
        $dashboardPermId = $allPermissions->where('name', 'dashboard.view')->pluck('id');
        $gudang->permissions()->sync($dashboardPermId);
        $pic->permissions()->sync($dashboardPermId);
        $direktur->permissions()->sync($dashboardPermId);
        $picGudang->permissions()->sync($dashboardPermId);

        // Hapus role lama selain 6 role target jika tidak memiliki user
        Role::whereNotIn('name', [
            'Super Admin', 'Admin', 'Gudang', 'PIC', 'Direktur', 'PIC Gudang'
        ])->doesntHave('users')->each(function ($role) {
            $role->permissions()->detach();
            $role->delete();
        });

        // --------------------
        // DEFAULT USERS
        // --------------------
        $defaultUsers = [
            [
                'name'     => 'Super Admin',
                'email'    => 'superadmin',
                'role'     => $superAdmin,
            ],
            [
                'name'     => 'Admin User',
                'email'    => 'admin',
                'role'     => $admin,
            ],
            [
                'name'     => 'Executive Management',
                'email'    => 'management',
                'role'     => $direktur,
            ],
        ];

        foreach ($defaultUsers as $userData) {
            User::firstOrCreate(
                ['email' => $userData['email']],
                [
                    'name'     => $userData['name'],
                    'password' => Hash::make('password'),
                    'role_id'  => $userData['role']->id,
                    'status'   => 'active',
                ]
            );
        }
    }
}
