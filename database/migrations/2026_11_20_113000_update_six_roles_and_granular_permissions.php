<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // ----------------------------------------------------
        // 1. SETUP 6 ROLE STANDAR
        // ----------------------------------------------------
        $rolesData = [
            'Super Admin' => 'Akses penuh ke seluruh sistem tanpa batasan',
            'Admin'       => 'Akses operasional dan administrasi sistem',
            'Gudang'      => 'Akses manajemen stok, gudang, dan retur fisik',
            'PIC'         => 'Akses penanggung jawab operasional, persetujuan, dan monitoring',
            'Direktur'    => 'Akses monitoring performa, laporan laba rugi, dan analitik',
            'PIC Gudang'  => 'Akses kepala operasional gudang dan validasi stok fisik',
        ];

        // Ubah role lama 'Management' menjadi 'Direktur' jika ada
        $mgmtRole = Role::where('name', 'Management')->first();
        if ($mgmtRole) {
            $mgmtRole->update([
                'name'        => 'Direktur',
                'description' => $rolesData['Direktur'],
            ]);
        }

        // Buat atau update ke-6 role standar
        foreach ($rolesData as $name => $desc) {
            Role::firstOrCreate(
                ['name' => $name],
                ['description' => $desc]
            );
        }

        $adminRole = Role::where('name', 'Admin')->first();

        // Hapus role usang 'User' jika ada, alihkan user-nya ke 'Admin'
        $userRole = Role::where('name', 'User')->first();
        if ($userRole) {
            User::withTrashed()->where('role_id', $userRole->id)->update([
                'role_id' => $adminRole?->id,
            ]);
            $userRole->permissions()->detach();
            $userRole->delete();
        }

        $roleMap = Role::whereIn('name', array_keys($rolesData))->get()->keyBy('name');

        // ----------------------------------------------------
        // 2. SETUP DAFTAR PERMISSION LENGKAP UNTUK MENU
        // ----------------------------------------------------
        $permissionsData = [
            // Dashboard & CS
            'dashboard.view'           => 'Lihat Dashboard Utama',
            'cs.view'                  => 'Akses Customer Service',

            // Pesanan
            'orders.shopee'            => 'Pesanan Shopee (Lihat, Atur Pengiriman & Cetak Resi)',
            'orders.tiktok'            => 'Pesanan TikTok (Lihat, Atur Pengiriman & Cetak Resi)',
            'orders.cutoff'            => 'Antrean Pesanan Cut Off',
            'returns.online'           => 'Retur Online (Cek Fisik & Input Resi RJ)',

            // Stok & Gudang
            'stock.master'             => 'Master Stok Gudang (Lihat & Sesuaikan)',
            'stock.shopee'             => 'Stok & Mapping Produk Shopee',
            'stock.tiktok'             => 'Stok & Mapping Produk TikTok',
            'stock.view'               => 'Lihat Stok & Kartu Stok',
            'stock.adjust'             => 'Penyesuaian & Opname Stok',
            'dispatch.scan'            => 'Scan Dispatch Pengeluaran Gudang',
            'warehouse.view'           => 'Master Data Gudang',

            // Penjualan & Pembelian
            'customer.view'            => 'Master Customer',
            'supplier.view'            => 'Master Supplier / Pabrik',
            'product.view'             => 'Master Produk & Varian',
            'category.view'            => 'Master Kategori',
            'sales_order.view'         => 'Sales Order Penjualan',
            'purchase_order.view'      => 'Purchase Order Pembelian',
            'invoice.view'             => 'Invoice Penjualan',

            // Keuangan
            'cash_bank.view'           => 'Kas & Rekening Bank',
            'cash_transaction.view'    => 'Ledger Transaksi Keuangan',
            'factory_receivable.view'  => 'Piutang & Invoice Pabrik',
            'fund_allocation.view'     => 'Alokasi Dana',

            // Pengaturan
            'user.view'                => 'User Management',
            'user.create'              => 'Tambah User',
            'user.edit'                => 'Ubah User',
            'user.delete'              => 'Hapus User',
            'role.view'                => 'Role & Hak Akses',
            'settings.shopee'          => 'Integrasi Toko Shopee',
            'settings.tiktok'          => 'Integrasi Toko TikTok',
        ];

        foreach ($permissionsData as $permName => $permDesc) {
            Permission::firstOrCreate(
                ['name' => $permName],
                ['description' => $permDesc]
            );
        }

        $allPermMap = Permission::all()->keyBy('name');

        // ----------------------------------------------------
        // 3. ASSIGN DEFAULT PERMISSIONS KE ROLE
        // ----------------------------------------------------
        // Super Admin: Semua permission
        $superAdminRole = $roleMap->get('Super Admin');
        if ($superAdminRole) {
            $superAdminRole->permissions()->sync(Permission::pluck('id')->toArray());
        }

        // Admin: Operasional harian lengkap
        $adminPermNames = [
            'dashboard.view', 'cs.view',
            'orders.shopee', 'orders.tiktok', 'orders.cutoff', 'returns.online',
            'stock.master', 'stock.shopee', 'stock.tiktok', 'stock.view', 'stock.adjust', 'dispatch.scan', 'warehouse.view',
            'customer.view', 'supplier.view', 'product.view', 'category.view', 'sales_order.view', 'purchase_order.view', 'invoice.view',
        ];
        if ($adminRole) {
            $adminRole->permissions()->sync(Permission::whereIn('name', $adminPermNames)->pluck('id')->toArray());
        }

        // Gudang: Fokus stok, retur, pengeluaran gudang
        $gudangRole = $roleMap->get('Gudang');
        $gudangPermNames = [
            'dashboard.view', 'orders.cutoff', 'returns.online',
            'stock.master', 'stock.view', 'stock.adjust', 'dispatch.scan', 'warehouse.view',
        ];
        if ($gudangRole) {
            $gudangRole->permissions()->sync(Permission::whereIn('name', $gudangPermNames)->pluck('id')->toArray());
        }

        // PIC: Operasional cut off, marketplace, approval, CS
        $picRole = $roleMap->get('PIC');
        $picPermNames = [
            'dashboard.view', 'cs.view',
            'orders.shopee', 'orders.tiktok', 'orders.cutoff', 'returns.online',
            'stock.master', 'stock.view', 'customer.view', 'sales_order.view',
        ];
        if ($picRole) {
            $picRole->permissions()->sync(Permission::whereIn('name', $picPermNames)->pluck('id')->toArray());
        }

        // Direktur: Monitoring performa, semua laporan, viewer operasional & user
        $direkturRole = $roleMap->get('Direktur');
        $direkturPermNames = [
            'dashboard.view', 'cs.view',
            'orders.shopee', 'orders.tiktok', 'orders.cutoff', 'returns.online',
            'stock.master', 'stock.shopee', 'stock.tiktok', 'stock.view', 'warehouse.view',
            'customer.view', 'supplier.view', 'product.view', 'category.view', 'sales_order.view', 'purchase_order.view', 'invoice.view',
            'cash_bank.view', 'cash_transaction.view', 'factory_receivable.view', 'fund_allocation.view',
            'user.view', 'role.view',
        ];
        if ($direkturRole) {
            $direkturRole->permissions()->sync(Permission::whereIn('name', $direkturPermNames)->pluck('id')->toArray());
        }

        // PIC Gudang: Kepala gudang, monitoring stok, retur & dispatch
        $picGudangRole = $roleMap->get('PIC Gudang');
        $picGudangPermNames = [
            'dashboard.view', 'orders.cutoff', 'returns.online',
            'stock.master', 'stock.shopee', 'stock.tiktok', 'stock.view', 'stock.adjust', 'dispatch.scan', 'warehouse.view',
        ];
        if ($picGudangRole) {
            $picGudangRole->permissions()->sync(Permission::whereIn('name', $picGudangPermNames)->pluck('id')->toArray());
        }

        // ----------------------------------------------------
        // 4. SETUP 6 STANDARD AKUN DENGAN PASSWORD MUDAH
        // ----------------------------------------------------
        $oldManagementUser = User::withTrashed()->where('email', 'management')->first();
        if ($oldManagementUser) {
            $oldManagementUser->restore();
            $oldManagementUser->update([
                'name'     => 'Direktur',
                'email'    => 'direktur',
                'role_id'  => $roleMap->get('Direktur')?->id ?? $oldManagementUser->role_id,
                'password' => Hash::make('direktur2026'),
                'status'   => 'active',
            ]);
        }

        $standardUsers = [
            [
                'name'     => 'Super Admin',
                'email'    => 'superadmin',
                'password' => 'superadmin2026',
                'role'     => 'Super Admin',
            ],
            [
                'name'     => 'Admin',
                'email'    => 'admin',
                'password' => 'admin2026',
                'role'     => 'Admin',
            ],
            [
                'name'     => 'Staff Gudang',
                'email'    => 'gudang',
                'password' => 'gudang2026',
                'role'     => 'Gudang',
            ],
            [
                'name'     => 'PIC Operasional',
                'email'    => 'pic',
                'password' => 'pic2026',
                'role'     => 'PIC',
            ],
            [
                'name'     => 'Direktur',
                'email'    => 'direktur',
                'password' => 'direktur2026',
                'role'     => 'Direktur',
            ],
            [
                'name'     => 'PIC Gudang',
                'email'    => 'picgudang',
                'password' => 'picgudang2026',
                'role'     => 'PIC Gudang',
            ],
        ];

        foreach ($standardUsers as $item) {
            $role = $roleMap->get($item['role']);
            if (! $role) {
                continue;
            }

            $user = User::withTrashed()->where('email', $item['email'])->first();
            if ($user) {
                $user->restore();
                $user->update([
                    'name'     => $item['name'],
                    'role_id'  => $role->id,
                    'password' => Hash::make($item['password']),
                    'status'   => 'active',
                ]);
            } else {
                User::create([
                    'name'     => $item['name'],
                    'email'    => $item['email'],
                    'role_id'  => $role->id,
                    'password' => Hash::make($item['password']),
                    'status'   => 'active',
                ]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Safe no-op
    }
};
