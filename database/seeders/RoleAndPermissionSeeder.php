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
        // PERMISSIONS
        // --------------------
        $permissions = [
            // Dashboard
            'dashboard.view'             => 'Lihat Dashboard',

            // Sales Order
            'sales_order.view'           => 'Lihat Sales Order',
            'sales_order.create'         => 'Buat Sales Order',
            'sales_order.edit'           => 'Edit Sales Order',
            'sales_order.delete'         => 'Hapus Sales Order',
            'sales_order.approve'        => 'Approve Sales Order',

            // Purchase Order
            'purchase_order.view'          => 'Lihat Purchase Order',
            'purchase_order.create'        => 'Buat Purchase Order',
            'purchase_order.edit'          => 'Edit Purchase Order',
            'purchase_order.delete'        => 'Hapus Purchase Order',
            'purchase_order.leader_approve'=> 'Approve PO (Leader)',
            'purchase_order.finance_approve'=> 'Approve PO (Finance)',
            'purchase_order.receive'       => 'Terima Barang Purchase Order',

            // Piutang Pabrik
            'factory_receivable.view'    => 'Lihat Piutang Pabrik',
            'factory_receivable.create'  => 'Buat Piutang Pabrik',
            'factory_receivable.edit'    => 'Edit Piutang Pabrik',
            'factory_receivable.payment' => 'Proses Pembayaran Piutang',
            'factory_receivable.cancel'  => 'Batalkan Piutang Pabrik',

            // Invoice
            'invoice.view'               => 'Lihat Invoice',
            'invoice.create'             => 'Buat Invoice',
            'invoice.edit'               => 'Edit Invoice',
            'invoice.delete'             => 'Hapus Invoice',
            'invoice.cancel'             => 'Batalkan Invoice',

            // Payment
            'payment.view'               => 'Lihat Payment',
            'payment.create'             => 'Buat Payment',
            'payment.cancel'             => 'Batalkan Payment',

            // Petty Cash
            'petty_cash.view'            => 'Lihat Petty Cash',
            'petty_cash.create'          => 'Buat Petty Cash',
            'petty_cash.edit'            => 'Edit Petty Cash',
            'petty_cash.submit'          => 'Ajukan Petty Cash untuk Persetujuan',
            'petty_cash.leader_approve'  => 'Approve Petty Cash (Leader)',
            'petty_cash.finance_approve' => 'Approve & Cairkan Petty Cash (Finance)',
            'petty_cash.reject'          => 'Tolak Petty Cash',
            'petty_cash.cancel'          => 'Batalkan Petty Cash',

            // Pengisian dana mingguan (Petty Cash & Dana Kelola)
            'fund_allocation.view'       => 'Lihat Pengisian Dana Mingguan',
            'fund_allocation.create'     => 'Catat Pengisian Dana Mingguan',

            // HPP produk — hanya Finance & Leader
            'hpp.view'                   => 'Lihat HPP Produk',
            'hpp.manage'                 => 'Input & Ubah HPP Produk',

            // Marketplace
            'marketplace.view'               => 'Lihat Marketplace',
            'marketplace.sync'               => 'Sinkronisasi Marketplace',
            'marketplace.manage'             => 'Kelola Marketplace',

            // Marketplace Order Fulfillment (Session 13)
            'marketplace.order.view'         => 'Lihat Order Marketplace',
            'marketplace.order.convert'      => 'Konversi Order ke Sales Order',
            'marketplace.order.reserve_stock'=> 'Reserve Stok Order Marketplace',
            'marketplace.order.release_stock'=> 'Release Reservasi Stok',
            'marketplace.order.sync'         => 'Sync Order dari Marketplace API',
            'marketplace.order.fulfill'      => 'Fulfillment / Kirim Order Marketplace',

            // Reporting Center (Session 14)
            'reports.sales.view'             => 'Lihat Laporan Penjualan',
            'reports.purchase.view'          => 'Lihat Laporan Pembelian',
            'reports.inventory.view'         => 'Lihat Laporan Stok / Inventory',
            'reports.financial.view'         => 'Lihat Laporan Keuangan',
            'reports.marketplace.view'       => 'Lihat Laporan Marketplace',
            'reports.export'                 => 'Ekspor Laporan (CSV/Excel)',

            // User Management
            'user.view'                  => 'Lihat User',
            'user.create'                => 'Buat User',
            'user.edit'                  => 'Edit User',
            'user.delete'                => 'Hapus User',

            // Role & Permission
            'role.view'                  => 'Lihat Role & Permission',
            'role.create'                => 'Buat Role',
            'role.edit'                  => 'Edit Role',
            'role.delete'                => 'Hapus Role',

            // Customer
            'customer.view'              => 'Lihat Customer',
            'customer.create'            => 'Buat Customer',
            'customer.edit'              => 'Edit Customer',
            'customer.delete'            => 'Hapus Customer',

            // Supplier
            'supplier.view'              => 'Lihat Supplier',
            'supplier.create'            => 'Buat Supplier',
            'supplier.edit'              => 'Edit Supplier',
            'supplier.delete'            => 'Hapus Supplier',

            // Product
            'product.view'               => 'Lihat Produk',
            'product.create'             => 'Buat Produk',
            'product.edit'               => 'Edit Produk',
            'product.delete'             => 'Hapus Produk',

            // Category
            'category.view'              => 'Lihat Kategori',
            'category.create'            => 'Buat Kategori',
            'category.edit'              => 'Edit Kategori',
            'category.delete'            => 'Hapus Kategori',

            // Warehouse
            'warehouse.view'             => 'Lihat Gudang',
            'warehouse.create'           => 'Buat Gudang',
            'warehouse.edit'             => 'Edit Gudang',
            'warehouse.delete'           => 'Hapus Gudang',

            // Stock
            'stock.view'                 => 'Lihat Stok / Histori',
            'stock.adjust'               => 'Adjustment Stok',

            // Cash & Bank Account (Session 10)
            'cash_bank.view'             => 'Lihat Rekening Kas/Bank',
            'cash_bank.create'           => 'Buat Rekening Kas/Bank',
            'cash_bank.edit'             => 'Edit Rekening Kas/Bank',
            'cash_bank.adjust'           => 'Adjustment Saldo Rekening',
            'cash_bank.deactivate'       => 'Nonaktifkan Rekening',

            // Cash Bank Transaction (Session 10)
            'cash_transaction.view'      => 'Lihat Transaksi Kas/Bank',
            'cash_transaction.create'    => 'Buat Transaksi Manual Kas/Bank',
            'cash_transaction.adjust'    => 'Adjustment Transaksi Kas/Bank',
        ];

        foreach ($permissions as $name => $description) {
            Permission::firstOrCreate(['name' => $name], ['description' => $description]);
        }

        // --------------------
        // ROLES & THEIR PERMISSIONS
        // --------------------
        $allPermissions = Permission::all();

        // Super Admin — semua akses
        $superAdmin = Role::firstOrCreate(
            ['name' => 'Super Admin'],
            ['description' => 'Akses penuh ke seluruh sistem']
        );
        $superAdmin->permissions()->sync($allPermissions->pluck('id'));

        // Admin — akses umum transaksi & semua master data
        $admin = Role::firstOrCreate(
            ['name' => 'Admin'],
            ['description' => 'Akses umum transaksi dan master data']
        );
        $admin->permissions()->sync(
            $allPermissions->whereIn('name', [
                'dashboard.view',
                'sales_order.view', 'sales_order.create', 'sales_order.edit',
                'purchase_order.view', 'purchase_order.create', 'purchase_order.edit',
                'invoice.view', 'invoice.create', 'invoice.edit', 'invoice.cancel',
                'user.view',
                // Master Data (Semua)
                'customer.view', 'customer.create', 'customer.edit', 'customer.delete',
                'supplier.view', 'supplier.create', 'supplier.edit', 'supplier.delete',
                'product.view', 'product.create', 'product.edit', 'product.delete',
                'category.view', 'category.create', 'category.edit', 'category.delete',
                'warehouse.view', 'warehouse.create', 'warehouse.edit', 'warehouse.delete',
                // Stock
                'stock.view', 'stock.adjust',
                // Factory Receivable
                'factory_receivable.view', 'factory_receivable.create', 'factory_receivable.edit', 'factory_receivable.cancel',
                // Payment
                'payment.view', 'payment.create', 'payment.cancel',
                // Petty Cash
                'petty_cash.view', 'petty_cash.create', 'petty_cash.edit', 'petty_cash.submit', 'petty_cash.approve', 'petty_cash.reject', 'petty_cash.cancel',
                'fund_allocation.view', 'fund_allocation.create',
                // Cash & Bank
                'cash_bank.view', 'cash_bank.create', 'cash_bank.edit', 'cash_bank.adjust', 'cash_bank.deactivate',
                'cash_transaction.view', 'cash_transaction.create', 'cash_transaction.adjust',
                // Marketplace Order Fulfillment — Admin: full
                'marketplace.view', 'marketplace.sync', 'marketplace.manage',
                'marketplace.order.view', 'marketplace.order.convert', 'marketplace.order.reserve_stock',
                'marketplace.order.release_stock', 'marketplace.order.sync', 'marketplace.order.fulfill',
                // Reports — Admin: full
                'reports.sales.view', 'reports.purchase.view', 'reports.inventory.view',
                'reports.financial.view', 'reports.marketplace.view', 'reports.export',
            ])->pluck('id')
        );

        // Finance — approval keuangan (PO Finance Approve, Petty Cash Finance Approve & Disburse)
        $finance = Role::firstOrCreate(
            ['name' => 'Finance'],
            ['description' => 'Approval keuangan tahap 2 (Finance), invoice, pembayaran, pencairan kas']
        );
        $finance->permissions()->sync(
            $allPermissions->whereIn('name', [
                'dashboard.view',
                // Sales Order — Finance: approval tunggal (Leader hanya melihat)
                'sales_order.view', 'sales_order.approve',
                'invoice.view', 'invoice.create', 'invoice.edit', 'invoice.delete', 'invoice.cancel',
                'payment.view', 'payment.create', 'payment.cancel',
                'factory_receivable.view', 'factory_receivable.create', 'factory_receivable.edit', 'factory_receivable.payment', 'factory_receivable.cancel',
                // Purchase Order — Finance: view + finance approve
                'purchase_order.view', 'purchase_order.finance_approve',
                // Petty Cash — Finance: view, create, edit, submit, finance approve & disburse
                'petty_cash.view', 'petty_cash.create', 'petty_cash.edit', 'petty_cash.submit',
                'petty_cash.finance_approve', 'petty_cash.reject', 'petty_cash.cancel',
                // Pengisian dana mingguan — Finance yang menerima & mencatat
                'fund_allocation.view', 'fund_allocation.create',
                // HPP produk
                'hpp.view', 'hpp.manage',
                'customer.view',
                'supplier.view',
                'product.view',
                // Cash & Bank — Finance: full
                'cash_bank.view', 'cash_bank.create', 'cash_bank.edit', 'cash_bank.adjust', 'cash_bank.deactivate',
                'cash_transaction.view', 'cash_transaction.create', 'cash_transaction.adjust',
                // Reports — Finance
                'reports.financial.view', 'reports.purchase.view', 'reports.export',
            ])->pluck('id')
        );

        // Leader — approval tahap 1 (PO & Petty Cash), view transaksi
        $leader = Role::firstOrCreate(
            ['name' => 'Leader'],
            ['description' => 'Supervisi operasional & approval pengajuan tahap 1 (PO, Petty Cash)']
        );
        $leader->permissions()->sync(
            $allPermissions->whereIn('name', [
                'dashboard.view',
                // Sales Order — Leader: view, create, edit (approval ada di Finance)
                'sales_order.view', 'sales_order.create', 'sales_order.edit',
                // Purchase Order — Leader: view, create, edit, leader approve
                'purchase_order.view', 'purchase_order.create', 'purchase_order.edit',
                'purchase_order.leader_approve',
                // Petty Cash — Leader: view, create, edit, submit, leader approve, reject
                'petty_cash.view', 'petty_cash.create', 'petty_cash.edit', 'petty_cash.submit',
                'petty_cash.leader_approve', 'petty_cash.reject', 'petty_cash.cancel',
                'fund_allocation.view',
                // HPP produk
                'hpp.view', 'hpp.manage',
                // Factory Receivable — view
                'factory_receivable.view',
                // Master Data — view
                'customer.view', 'customer.create', 'customer.edit',
                'supplier.view', 'supplier.create', 'supplier.edit',
                'product.view',
                'category.view',
                'warehouse.view',
                // Stock
                'stock.view',
                // Invoice
                'invoice.view',
                // Payment
                'payment.view',
                // Marketplace Order — Leader: view + convert + reserve/release stock
                'marketplace.view', 'marketplace.order.view', 'marketplace.order.convert',
                'marketplace.order.reserve_stock', 'marketplace.order.release_stock',
                // Reports — Leader
                'reports.sales.view', 'reports.purchase.view', 'reports.inventory.view',
                'reports.marketplace.view', 'reports.export',
            ])->pluck('id')
        );

        // Management — view only untuk transaksi & master data
        $management = Role::firstOrCreate(
            ['name' => 'Management'],
            ['description' => 'Akses laporan dan monitoring transaksi']
        );
        $management->permissions()->sync(
            $allPermissions->whereIn('name', [
                'dashboard.view',
                'sales_order.view',
                'purchase_order.view',
                'invoice.view',
                'factory_receivable.view',
                'payment.view',
                // Petty Cash — Management: view only
                'petty_cash.view',
                'fund_allocation.view',
                // Cash & Bank — Management: view only
                'cash_bank.view',
                'cash_transaction.view',
                // Master Data (View Only)
                'customer.view',
                'supplier.view',
                'product.view',
                'category.view',
                'warehouse.view',
                // Stock
                'stock.view',
                // Marketplace — Management: view only
                'marketplace.view', 'marketplace.order.view',
                // Reports — Management: all view
                'reports.sales.view', 'reports.purchase.view', 'reports.inventory.view',
                'reports.financial.view', 'reports.marketplace.view',
            ])->pluck('id')
        );

        // --------------------
        // DEFAULT DEV USERS
        // --------------------
        $devUsers = [
            ['name' => 'Super Admin',     'email' => 'superadmin@company.com',  'role' => $superAdmin],
            ['name' => 'Admin User',      'email' => 'admin@company.com',        'role' => $admin],
            ['name' => 'Leader User',     'email' => 'leader@company.com',       'role' => $leader],
            ['name' => 'Finance User',    'email' => 'finance@company.com',      'role' => $finance],
            ['name' => 'Management User', 'email' => 'management@company.com',   'role' => $management],
        ];

        foreach ($devUsers as $userData) {
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
