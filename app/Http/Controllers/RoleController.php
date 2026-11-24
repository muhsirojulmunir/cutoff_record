<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    public function index(): Response
    {
        Gate::authorize('role.view');

        Role::ensureKreatifRoleExists();

        $roles = Role::with(['permissions', 'users'])
            ->orderBy('id')
            ->get()
            ->map(function ($role) {
                return [
                    'id'               => $role->id,
                    'name'             => $role->name,
                    'description'      => $role->description,
                    'user_count'       => $role->users->count(),
                    'permission_count' => $role->permissions->count(),
                    'permissions'      => $role->permissions->pluck('name')->toArray(),
                    'permission_ids'   => $role->permissions->pluck('id')->toArray(),
                ];
            });

        // Group permissions logically into system modules
        $moduleDefinitions = [
            'dashboard_cs' => [
                'title'       => 'Dashboard & Customer Service',
                'description' => 'Akses ringkasan statistik utama dan layanan pesan bantuan CS',
                'prefixes'    => ['dashboard.', 'cs.'],
            ],
            'pesanan' => [
                'title'       => 'Pesanan & Marketplace',
                'description' => 'Akses pesanan Shopee, TikTok, antrean Cut Off, dan retur online',
                'prefixes'    => ['orders.', 'returns.'],
            ],
            'stok' => [
                'title'       => 'Stok & Gudang',
                'description' => 'Akses stok gudang, mapping SKU produk marketplace, dan scan dispatch',
                'prefixes'    => ['stock.', 'dispatch.', 'warehouse.'],
            ],
            'penjualan_pembelian' => [
                'title'       => 'Penjualan & Pembelian (ERP Core)',
                'description' => 'Akses customer, supplier, produk, kategori, PO, SO, dan invoice',
                'prefixes'    => ['customer.', 'supplier.', 'product.', 'category.', 'sales_order.', 'purchase_order.', 'invoice.'],
            ],
            'keuangan' => [
                'title'       => 'Keuangan & Ledger',
                'description' => 'Akses kas & rekening bank, mutasi transaksi, piutang, dan alokasi dana',
                'prefixes'    => ['cash_bank.', 'cash_transaction.', 'factory_receivable.', 'fund_allocation.'],
            ],
            'pengaturan' => [
                'title'       => 'Pengaturan & Integrasi',
                'description' => 'Akses manajemen user, role hak akses, dan pengaturan integrasi toko',
                'prefixes'    => ['user.', 'role.', 'settings.'],
            ],
            'konten' => [
                'title'       => 'Report Harian Konten',
                'description' => 'Akses input report konten harian dan verifikasi/review konten',
                'prefixes'    => ['content_reports.'],
            ],
        ];

        $allPermissions = Permission::orderBy('id')->get();

        $modules = [];
        foreach ($moduleDefinitions as $key => $meta) {
            $items = $allPermissions->filter(function ($perm) use ($meta) {
                foreach ($meta['prefixes'] as $prefix) {
                    if (str_starts_with($perm->name, $prefix)) {
                        return true;
                    }
                }
                return false;
            })->values()->map(function ($p) {
                return [
                    'id'          => $p->id,
                    'name'        => $p->name,
                    'description' => $p->description,
                ];
            });

            if ($items->isNotEmpty()) {
                $modules[] = [
                    'key'         => $key,
                    'title'       => $meta['title'],
                    'description' => $meta['description'],
                    'permissions' => $items,
                ];
            }
        }

        return Inertia::render('Roles/Index', [
            'roles'   => $roles,
            'modules' => $modules,
        ]);
    }

    public function updatePermissions(Request $request, Role $role): RedirectResponse
    {
        Gate::authorize('role.view');

        // Pastikan hanya Super Admin yang bisa mengubah permission role
        $user = $request->user();
        if (! $user || ! $user->isSuperAdmin()) {
            abort(403, 'Hanya Super Admin yang diizinkan mengubah hak akses role.');
        }

        // Super Admin selalu memiliki semua hak akses dan tidak boleh dibatasi
        if ($role->name === 'Super Admin') {
            $allPermIds = Permission::pluck('id')->toArray();
            $role->permissions()->sync($allPermIds);

            return redirect()->route('roles.index')
                ->with('info', 'Role Super Admin selalu memiliki hak akses penuh ke seluruh sistem.');
        }

        $validated = $request->validate([
            'permission_ids'   => ['nullable', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $permissionIds = $validated['permission_ids'] ?? [];
        $role->permissions()->sync($permissionIds);

        return redirect()->route('roles.index')
            ->with('success', 'Hak akses untuk role ' . $role->name . ' berhasil disimpan.');
    }
}
