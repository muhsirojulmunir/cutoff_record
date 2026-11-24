<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class CreativeRoleAndUserSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Buat Permission Report Konten jika belum ada
        $permView = Permission::firstOrCreate(
            ['name' => 'content_reports.view'],
            ['description' => 'Lihat Report Harian Konten']
        );

        $permCreate = Permission::firstOrCreate(
            ['name' => 'content_reports.create'],
            ['description' => 'Kirim Report Harian Konten']
        );

        $permReview = Permission::firstOrCreate(
            ['name' => 'content_reports.review'],
            ['description' => 'Review & Beri Feedback Report Konten']
        );

        // 2. Buat Role Kreatif jika belum ada
        $kreatifRole = Role::firstOrCreate(
            ['name' => 'Kreatif'],
            ['description' => 'Tim Kreatif & Social Media']
        );

        // Ambil permission dashboard & CS
        $permDashboard = Permission::where('name', 'dashboard.view')->first();
        $permCs = Permission::where('name', 'cs.view')->first();

        // Tetapkan permissions ke role Kreatif
        $kreatifPermissions = array_filter([
            $permDashboard?->id,
            $permCs?->id,
            $permView->id,
            $permCreate->id,
        ]);
        $kreatifRole->permissions()->sync($kreatifPermissions);

        // 3. Tambahkan permission ke Super Admin, Direktur, PIC
        $superAdmin = Role::where('name', 'Super Admin')->first();
        if ($superAdmin) {
            $superAdmin->permissions()->syncWithoutDetaching([$permView->id, $permCreate->id, $permReview->id]);
        }

        $direktur = Role::where('name', 'Direktur')->first();
        if ($direktur) {
            $direktur->permissions()->syncWithoutDetaching([$permView->id, $permReview->id]);
        }

        $pic = Role::where('name', 'PIC')->first();
        if ($pic) {
            $pic->permissions()->syncWithoutDetaching([$permView->id, $permReview->id]);
        }

        // 4. Buat / Update user 'kreatif'
        $user = User::withTrashed()->where('email', 'kreatif')->orWhere('email', 'kreatif@record.com')->first();
        if ($user) {
            if ($user->trashed()) {
                $user->restore();
            }
            $user->update([
                'name'     => 'Tim Kreatif',
                'email'    => 'kreatif',
                'password' => Hash::make('kreatif2026'),
                'role_id'  => $kreatifRole->id,
                'status'   => 'active',
            ]);
        } else {
            User::create([
                'name'     => 'Tim Kreatif',
                'email'    => 'kreatif',
                'password' => Hash::make('kreatif2026'),
                'role_id'  => $kreatifRole->id,
                'status'   => 'active',
            ]);
        }
    }
}
