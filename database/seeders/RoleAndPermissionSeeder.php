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
        // ROLES
        // --------------------
        $superAdmin = Role::firstOrCreate(
            ['name' => 'Super Admin'],
            ['description' => 'Akses penuh ke seluruh sistem tanpa batasan']
        );
        $admin = Role::firstOrCreate(
            ['name' => 'Admin'],
            ['description' => 'Akses operasional dan manajemen pengguna dasar']
        );
        $user = Role::firstOrCreate(
            ['name' => 'User'],
            ['description' => 'Pengguna umum dengan akses standar']
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
        $user->permissions()->sync(
            $allPermissions->whereIn('name', [
                'dashboard.view',
            ])->pluck('id')
        );

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
