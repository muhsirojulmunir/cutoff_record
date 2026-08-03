import React, { useState } from 'react';
import { Head } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Permission {
  id: number;
  name: string;
  description: string;
}

interface RoleData {
  id: number;
  name: string;
  description: string | null;
  user_count: number;
  permission_count: number;
  permissions: string[];
}

interface RoleIndexProps {
  roles: RoleData[];
  groupedPermissions: Record<string, Permission[]>;
}

const roleBadgeColor: Record<string, string> = {
  'Super Admin': 'from-teal-600 to-cyan-600',
  'Admin':       'from-blue-600 to-cyan-600',
  'Leader':      'from-emerald-600 to-teal-600',
  'Finance':     'from-amber-600 to-orange-600',
  'Management':  'from-pink-600 to-rose-600',
};


const moduleLabels: Record<string, string> = {
  dashboard:          'Dashboard',
  user:               'User Management',
  role:               'Role & Permission',
  customer:           'Customer',
  supplier:           'Supplier / Pabrik',
  product:            'Produk',
  category:           'Kategori',
  warehouse:          'Gudang',
  sales_order:        'Sales Order',
  purchase_order:     'Purchase Order',
  factory_receivable: 'Piutang Pabrik',
  invoice:            'Invoice',
  payment:            'Payment',
  petty_cash:         'Petty Cash',
  marketplace:        'Marketplace',
};

const moduleIcons: Record<string, string> = {
  dashboard:          'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  user:               'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z',
  role:               'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  customer:           'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  supplier:           'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15',
  product:            'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4',
  category:           'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.5 1.5 0 002.122 0l4.318-4.318a1.5 1.5 0 000-2.122L10.159 3.659A2.25 2.25 0 009.568 3z',
  warehouse:          'M8.25 21h8.25M17.25 21v-3.75c0-1.242-1.008-2.25-2.25-2.25h-3c-1.242 0-2.25 1.008-2.25 2.25V21m11.25 0h.75a.75.75 0 00.75-.75V8.877c0-.527-.209-1.034-.582-1.408l-6-6A1.5 1.5 0 0012 1h-1.5A1.5 1.5 0 009 2.5v.75m-6 3h18',
  sales_order:        'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272',
  purchase_order:     'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974',
  factory_receivable: 'M12 6v12m-3-2.818l.879.879c1.003 1.003 2.63 1.003 3.633 0L14 15m-1.879-8.919l-.621.621c-1.129 1.129-1.129 2.96 0 4.089l.879.879',
  invoice:            'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  payment:            'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5',
  petty_cash:         'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9',
  marketplace:        'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35',
};

export default function Index({ roles, groupedPermissions }: RoleIndexProps) {
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(roles[0] ?? null);

  const moduleOrder = [
    'dashboard', 'customer', 'supplier', 'product', 'category', 'warehouse',
    'sales_order', 'purchase_order', 'factory_receivable', 'invoice', 'payment', 'petty_cash',
    'marketplace', 'user', 'role',
  ];

  const orderedModules = moduleOrder.filter((m) => groupedPermissions[m]);

  return (
    <AppLayout>
      <Head title="Role & Permission" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Role & Permission</h1>
          <p className="text-gray-500 text-xs mt-1">Pengaturan / Role & Permission</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Role List */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Daftar Role</p>
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left p-4 rounded-2xl border transition-all group ${
                  selectedRole?.id === role.id
                    ? 'bg-teal-500/10 border-teal-500/30'
                    : 'bg-white border-gray-300 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${roleBadgeColor[role.name] ?? 'from-slate-600 to-slate-700'} flex items-center justify-center text-white text-xs font-bold`}>
                    {role.name.charAt(0)}
                  </div>
                  <span className={`font-semibold text-sm ${selectedRole?.id === role.id ? 'text-teal-600' : 'text-gray-800'}`}>
                    {role.name}
                  </span>
                </div>
                {role.description && (
                  <p className="text-gray-400 text-xs leading-relaxed mb-3">{role.description}</p>
                )}
                <div className="flex gap-3">
                  <span className="text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">{role.user_count}</span> user
                  </span>
                  <span className="text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">{role.permission_count}</span> permission
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Right: Permission Detail */}
          <div className="lg:col-span-2">
            {selectedRole ? (
              <div className="bg-white border border-gray-300 rounded-2xl overflow-hidden">
                {/* Role Header */}
                <div className={`px-6 py-5 bg-gradient-to-r ${roleBadgeColor[selectedRole.name] ?? 'from-slate-600 to-slate-700'} bg-opacity-10`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleBadgeColor[selectedRole.name] ?? 'from-slate-600 to-slate-700'} flex items-center justify-center text-white font-bold`}>
                      {selectedRole.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-gray-900 font-bold">{selectedRole.name}</h2>
                      <p className="text-gray-900/60 text-xs">{selectedRole.description ?? 'Tidak ada deskripsi'}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-gray-900/80 text-xs">{selectedRole.permission_count} dari {Object.values(groupedPermissions).flat().length} akses</p>
                      <div className="h-1.5 w-24 bg-white/10 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-white/60 rounded-full transition-all"
                          style={{ width: `${(selectedRole.permission_count / Object.values(groupedPermissions).flat().length) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Permission Modules */}
                <div className="p-5 space-y-4">
                  {orderedModules.map((module) => {
                    const modulePerms = groupedPermissions[module];
                    const hasAny = modulePerms.some((p) => selectedRole.permissions.includes(p.name));
                    const hasAll = modulePerms.every((p) => selectedRole.permissions.includes(p.name));

                    return (
                      <div key={module} className={`rounded-xl border p-4 transition-all ${hasAny ? 'border-gray-300 bg-teal-50/60' : 'border-gray-300/50 bg-white/50 opacity-50'}`}>
                        <div className="flex items-center gap-2.5 mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-gray-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d={moduleIcons[module] ?? 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'} />
                          </svg>
                          <span className="text-sm font-semibold text-gray-800">
                            {moduleLabels[module] ?? module}
                          </span>
                          {hasAll && (
                            <span className="ml-auto text-xs text-emerald-400 font-medium">Akses Penuh</span>
                          )}
                          {hasAny && !hasAll && (
                            <span className="ml-auto text-xs text-amber-400 font-medium">Akses Sebagian</span>
                          )}
                          {!hasAny && (
                            <span className="ml-auto text-xs text-gray-400 font-medium">Tidak Ada Akses</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {modulePerms.map((perm) => {
                            const hasIt = selectedRole.permissions.includes(perm.name);
                            const action = perm.name.split('.')[1] ?? perm.name;
                            return (
                              <span
                                key={perm.id}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                  hasIt
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-gray-50 border-gray-300 text-gray-400'
                                }`}
                              >
                                {hasIt ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                                {action}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-white border border-gray-300 rounded-2xl">
                <p className="text-gray-400 text-sm">Pilih role untuk melihat detail permission</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
