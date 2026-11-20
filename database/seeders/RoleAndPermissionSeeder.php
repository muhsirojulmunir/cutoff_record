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
        // PERMISSIONS LENGKAP
        // --------------------
        $permissionsData = [
            'dashboard.view'           => 'Lihat Dashboard Utama',
            'cs.view'                  => 'Akses Customer Service',
            'orders.shopee'            => 'Pesanan Shopee (Lihat, Atur Pengiriman & Cetak Resi)',
            'orders.tiktok'            => 'Pesanan TikTok (Lihat, Atur Pengiriman & Cetak Resi)',
            'orders.cutoff'            => 'Antrean Pesanan Cut Off',
            'returns.online'           => 'Retur Online (Cek Fisik & Input Resi RJ)',
            'stock.master'             => 'Master Stok Gudang (Lihat & Sesuaikan)',
            'stock.shopee'             => 'Stok & Mapping Produk Shopee',
            'stock.tiktok'             => 'Stok & Mapping Produk TikTok',
            'stock.view'               => 'Lihat Stok & Kartu Stok',
            'stock.adjust'             => 'Penyesuaian & Opname Stok',
            'dispatch.scan'            => 'Scan Dispatch Pengeluaran Gudang',
            'warehouse.view'           => 'Master Data Gudang',
            'customer.view'            => 'Master Customer',
            'supplier.view'            => 'Master Supplier / Pabrik',
            'product.view'             => 'Master Produk & Varian',
            'category.view'            => 'Master Kategori',
            'sales_order.view'         => 'Sales Order Penjualan',
            'purchase_order.view'      => 'Purchase Order Pembelian',
            'invoice.view'             => 'Invoice Penjualan',
            'cash_bank.view'           => 'Kas & Rekening Bank',
            'cash_transaction.view'    => 'Ledger Transaksi Keuangan',
            'factory_receivable.view'  => 'Piutang & Invoice Pabrik',
            'fund_allocation.view'     => 'Alokasi Dana',
            'user.view'                => 'User Management',
            'user.create'              => 'Tambah User',
            'user.edit'                => 'Ubah User',
            'user.delete'              => 'Hapus User',
            'role.view'                => 'Role & Hak Akses',
            'settings.shopee'          => 'Integrasi Toko Shopee',
            'settings.tiktok'          => 'Integrasi Toko TikTok',
        ];

        foreach ($permissionsData as $name => $desc) {
            Permission::firstOrCreate(
                ['name' => $name],
                ['description' => $desc]
            );
        }

        // --------------------
        // ROLES (6 Role Standar)
        // --------------------
        $rolesData = [
            'Super Admin' => 'Akses penuh ke seluruh sistem tanpa batasan',
            'Admin'       => 'Akses operasional dan administrasi sistem',
            'Gudang'      => 'Akses manajemen stok, gudang, dan retur fisik',
            'PIC'         => 'Akses penanggung jawab operasional, persetujuan, dan monitoring',
            'Direktur'    => 'Akses monitoring performa, laporan laba rugi, dan analitik',
            'PIC Gudang'  => 'Akses kepala operasional gudang dan validasi stok fisik',
        ];

        foreach ($rolesData as $name => $desc) {
            Role::firstOrCreate(
                ['name' => $name],
                ['description' => $desc]
            );
        }

        $superAdmin = Role::where('name', 'Super Admin')->first();
        $admin      = Role::where('name', 'Admin')->first();
        $gudang     = Role::where('name', 'Gudang')->first();
        $pic        = Role::where('name', 'PIC')->first();
        $direktur   = Role::where('name', 'Direktur')->first();
        $picGudang  = Role::where('name', 'PIC Gudang')->first();

        // Assign Permissions to Roles
        if ($superAdmin) {
            $superAdmin->permissions()->sync(Permission::pluck('id')->toArray());
        }

        if ($admin) {
            $admin->permissions()->sync(Permission::whereIn('name', [
                'dashboard.view', 'cs.view',
                'orders.shopee', 'orders.tiktok', 'orders.cutoff', 'returns.online',
                'stock.master', 'stock.shopee', 'stock.tiktok', 'stock.view', 'stock.adjust', 'dispatch.scan', 'warehouse.view',
                'customer.view', 'supplier.view', 'product.view', 'category.view', 'sales_order.view', 'purchase_order.view', 'invoice.view',
            ])->pluck('id')->toArray());
        }

        if ($gudang) {
            $gudang->permissions()->sync(Permission::whereIn('name', [
                'dashboard.view', 'orders.cutoff', 'returns.online',
                'stock.master', 'stock.view', 'stock.adjust', 'dispatch.scan', 'warehouse.view',
            ])->pluck('id')->toArray());
        }

        if ($pic) {
            $pic->permissions()->sync(Permission::whereIn('name', [
                'dashboard.view', 'cs.view',
                'orders.shopee', 'orders.tiktok', 'orders.cutoff', 'returns.online',
                'stock.master', 'stock.view', 'customer.view', 'sales_order.view',
            ])->pluck('id')->toArray());
        }

        if ($direktur) {
            $direktur->permissions()->sync(Permission::whereIn('name', [
                'dashboard.view', 'cs.view',
                'orders.shopee', 'orders.tiktok', 'orders.cutoff', 'returns.online',
                'stock.master', 'stock.shopee', 'stock.tiktok', 'stock.view', 'warehouse.view',
                'customer.view', 'supplier.view', 'product.view', 'category.view', 'sales_order.view', 'purchase_order.view', 'invoice.view',
                'cash_bank.view', 'cash_transaction.view', 'factory_receivable.view', 'fund_allocation.view',
                'user.view', 'role.view',
            ])->pluck('id')->toArray());
        }

        if ($picGudang) {
            $picGudang->permissions()->sync(Permission::whereIn('name', [
                'dashboard.view', 'orders.cutoff', 'returns.online',
                'stock.master', 'stock.shopee', 'stock.tiktok', 'stock.view', 'stock.adjust', 'dispatch.scan', 'warehouse.view',
            ])->pluck('id')->toArray());
        }

        // Hapus role lama selain 6 role target jika tidak memiliki user
        Role::whereNotIn('name', array_keys($rolesData))->doesntHave('users')->each(function ($role) {
            $role->permissions()->detach();
            $role->delete();
        });

        // --------------------
        // DEFAULT USERS (6 Role Standar)
        // --------------------
        $defaultUsers = [
            [
                'name'     => 'Super Admin',
                'email'    => 'superadmin',
                'password' => 'superadmin2026',
                'role'     => $superAdmin,
            ],
            [
                'name'     => 'Admin',
                'email'    => 'admin',
                'password' => 'admin2026',
                'role'     => $admin,
            ],
            [
                'name'     => 'Staff Gudang',
                'email'    => 'gudang',
                'password' => 'gudang2026',
                'role'     => $gudang,
            ],
            [
                'name'     => 'PIC Operasional',
                'email'    => 'pic',
                'password' => 'pic2026',
                'role'     => $pic,
            ],
            [
                'name'     => 'Direktur',
                'email'    => 'direktur',
                'password' => 'direktur2026',
                'role'     => $direktur,
            ],
            [
                'name'     => 'PIC Gudang',
                'email'    => 'picgudang',
                'password' => 'picgudang2026',
                'role'     => $picGudang,
            ],
        ];

        foreach ($defaultUsers as $item) {
            if (! $item['role']) {
                continue;
            }

            $user = User::withTrashed()->where('email', $item['email'])->first();

            if ($user) {
                $user->restore();
                $user->update([
                    'name'     => $item['name'],
                    'role_id'  => $item['role']->id,
                    'password' => Hash::make($item['password']),
                    'status'   => 'active',
                ]);
            } else {
                User::create([
                    'name'     => $item['name'],
                    'email'    => $item['email'],
                    'role_id'  => $item['role']->id,
                    'password' => Hash::make($item['password']),
                    'status'   => 'active',
                ]);
            }
        }
    }
}
