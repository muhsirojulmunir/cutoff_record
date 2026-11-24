import React, { useState, useEffect, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface PermissionItem {
  id: number;
  name: string;
  description: string;
}

interface ModuleGroup {
  key: string;
  title: string;
  description: string;
  permissions: PermissionItem[];
}

interface RoleData {
  id: number;
  name: string;
  description: string | null;
  user_count: number;
  permission_count: number;
  permissions: string[];
  permission_ids: number[];
}

interface RoleIndexProps {
  roles: RoleData[];
  modules: ModuleGroup[];
}

const roleBadgeColor: Record<string, string> = {
  'Super Admin': 'from-[#0B132B] to-[#1E3A8A]',
  'Admin':       'from-blue-600 to-sky-600',
  'Gudang':      'from-amber-600 to-orange-600',
  'PIC':         'from-emerald-600 to-teal-600',
  'Direktur':    'from-slate-700 to-slate-900',
  'PIC Gudang':  'from-cyan-700 to-blue-800',
  'Kreatif':     'from-pink-600 to-rose-600',
};

const moduleIcons: Record<string, string> = {
  dashboard_cs:        'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  pesanan:             'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  stok:                'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
  penjualan_pembelian: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
  keuangan:            'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5',
  pengaturan:          'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z',
  konten:              'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z',
};

export default function Index({ roles, modules }: RoleIndexProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<number>(roles[0]?.id ?? 1);
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  const allPermissionIds = useMemo(() => {
    return modules.flatMap((m) => m.permissions.map((p) => p.id));
  }, [modules]);

  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>(
    selectedRole?.permission_ids ?? []
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedRole) {
      setSelectedPermissionIds(selectedRole.permission_ids ?? []);
    }
  }, [selectedRoleId, roles]);

  const isSuperAdminRole = selectedRole?.name === 'Super Admin';

  const hasChanges = useMemo(() => {
    if (isSuperAdminRole) return false;
    const original = (selectedRole?.permission_ids ?? []).slice().sort();
    const current = selectedPermissionIds.slice().sort();
    if (original.length !== current.length) return true;
    return original.some((id, idx) => id !== current[idx]);
  }, [selectedRole, selectedPermissionIds, isSuperAdminRole]);

  function togglePermission(id: number) {
    if (isSuperAdminRole) return;
    setSelectedPermissionIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleModule(modulePermissions: PermissionItem[]) {
    if (isSuperAdminRole) return;
    const ids = modulePermissions.map((p) => p.id);
    const allSelected = ids.every((id) => selectedPermissionIds.includes(id));

    if (allSelected) {
      setSelectedPermissionIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedPermissionIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }

  function selectAll() {
    if (isSuperAdminRole) return;
    setSelectedPermissionIds(allPermissionIds);
  }

  function deselectAll() {
    if (isSuperAdminRole) return;
    setSelectedPermissionIds([]);
  }

  function handleSave() {
    if (isSuperAdminRole || !selectedRole) return;

    setIsSaving(true);
    router.put(
      `/roles/${selectedRole.id}/permissions`,
      { permission_ids: selectedPermissionIds },
      {
        preserveScroll: true,
        onFinish: () => setIsSaving(false),
      }
    );
  }

  const activeCount = isSuperAdminRole
    ? allPermissionIds.length
    : selectedPermissionIds.length;
  const totalCount = allPermissionIds.length;
  const percentActive = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;

  return (
    <AppLayout>
      <Head title="Role & Hak Akses Menu" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Role & Hak Akses Menu</h1>
            <p className="text-gray-500 text-xs mt-1">
              Atur izin centang menu yang dapat diakses oleh setiap role sistem (Super Admin, Admin, Gudang, PIC, Direktur, PIC Gudang, Kreatif).
            </p>
          </div>
          {hasChanges && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Ada perubahan hak akses yang belum disimpan
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kolom Kiri: Daftar 6 Role */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Pilih Role ({roles.length})
              </p>
              <span className="text-[11px] text-gray-400">Klik untuk atur</span>
            </div>

            <div className="space-y-2">
              {roles.map((role) => {
                const isSelected = selectedRole?.id === role.id;
                const roleBadge = roleBadgeColor[role.name] ?? 'from-slate-600 to-slate-700';

                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50/80 border-[#0B132B]/30 shadow-sm ring-1 ring-[#0B132B]/20'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/70'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleBadge} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                        {role.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold text-sm truncate ${isSelected ? 'text-[#0B132B]' : 'text-gray-800'}`}>
                            {role.name}
                          </span>
                          {role.name === 'Super Admin' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#0B132B] text-white">
                              Root Admin
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs truncate mt-0.5">
                          {role.description ?? 'Tidak ada deskripsi'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2 mt-2 border-t border-gray-100 text-xs text-gray-400">
                      <span>
                        <strong className="text-gray-700 font-semibold">{role.user_count}</strong> user aktif
                      </span>
                      <span>•</span>
                      <span>
                        <strong className="text-gray-700 font-semibold">
                          {role.name === 'Super Admin' ? 'Semua' : role.permission_count}
                        </strong> hak akses
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kolom Kanan: Pengaturan Hak Akses Checklist */}
          <div className="lg:col-span-8">
            {selectedRole ? (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                {/* Header Role Terpilih */}
                <div className={`px-6 py-5 bg-gradient-to-r ${roleBadgeColor[selectedRole.name] ?? 'from-slate-600 to-slate-700'} text-white`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-base shadow-inner">
                        {selectedRole.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold">{selectedRole.name}</h2>
                          {isSuperAdminRole && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/20">
                              Full Access
                            </span>
                          )}
                        </div>
                        <p className="text-white/80 text-xs mt-0.5">
                          {selectedRole.description ?? 'Konfigurasi hak akses menu untuk role ini'}
                        </p>
                      </div>
                    </div>

                    <div className="sm:text-right bg-black/15 px-3 py-2 rounded-xl backdrop-blur-xs">
                      <p className="text-white/90 text-xs font-medium">
                        {activeCount} dari {totalCount} Menu & Aksi Aktif ({percentActive}%)
                      </p>
                      <div className="h-1.5 w-32 bg-white/20 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-300"
                          style={{ width: `${percentActive}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Banner Khusus Super Admin */}
                {isSuperAdminRole ? (
                  <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-start gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Akses Penuh Tanpa Batas (Super Administrator)
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Role Super Admin memiliki akses root ke seluruh menu sistem tanpa batasan dan tidak dapat dikurangi demi keamanan operasional.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Action Bar untuk Role Lain */
                  <div className="p-4 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAll}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors shadow-2xs"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={deselectAll}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors shadow-2xs"
                      >
                        Batal Pilih Semua
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!hasChanges || isSaving}
                      onClick={handleSave}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                        hasChanges
                          ? 'bg-[#0B132B] hover:bg-[#15234E] text-white cursor-pointer ring-2 ring-blue-900/20 shadow-blue-950/20 active:scale-95'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Simpan Hak Akses</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Modul Permissions Checklist */}
                <div className="p-6 space-y-6">
                  {modules.map((mod) => {
                    const modPermIds = mod.permissions.map((p) => p.id);
                    const selectedInMod = isSuperAdminRole
                      ? modPermIds.length
                      : modPermIds.filter((id) => selectedPermissionIds.includes(id)).length;
                    const isAllSelected = selectedInMod === modPermIds.length;
                    const isSomeSelected = selectedInMod > 0 && !isAllSelected;

                    return (
                      <div
                        key={mod.key}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs hover:border-gray-300 transition-all"
                      >
                        {/* Header Modul */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 mb-4 border-b border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d={moduleIcons[mod.key] ?? 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'} />
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-gray-900">{mod.title}</h3>
                                <span className="text-[11px] font-semibold text-gray-400">
                                  ({selectedInMod}/{modPermIds.length})
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{mod.description}</p>
                            </div>
                          </div>

                          {!isSuperAdminRole && (
                            <button
                              type="button"
                              onClick={() => toggleModule(mod.permissions)}
                              className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            >
                              {isAllSelected ? 'Batalkan Modul' : 'Pilih Semua Modul'}
                            </button>
                          )}
                        </div>

                        {/* List Permissions Checkbox */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {mod.permissions.map((perm) => {
                            const isChecked = isSuperAdminRole || selectedPermissionIds.includes(perm.id);

                            return (
                              <label
                                key={perm.id}
                                className={`flex items-start gap-3 p-3 rounded-xl border transition-all select-none ${
                                  isChecked
                                    ? 'bg-blue-50/70 border-[#0B132B]/30 text-gray-900'
                                    : 'bg-gray-50/50 border-gray-200 text-gray-500 hover:bg-gray-50'
                                } ${isSuperAdminRole ? 'cursor-default' : 'cursor-pointer'}`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={isSuperAdminRole}
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0B132B] focus:ring-[#0B132B] disabled:opacity-60"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-semibold ${isChecked ? 'text-gray-900' : 'text-gray-600'}`}>
                                    {perm.description}
                                  </p>
                                  <p className="text-[10px] font-mono text-gray-400 mt-0.5">
                                    {perm.name}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Save Button (Mobile & Desktop convenience) */}
                {!isSuperAdminRole && (
                  <div className="p-4 bg-gray-50/80 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {hasChanges ? 'Ada perubahan belum disimpan.' : 'Semua hak akses sudah tersimpan.'}
                    </span>
                    <button
                      type="button"
                      disabled={!hasChanges || isSaving}
                      onClick={handleSave}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                        hasChanges
                          ? 'bg-[#0B132B] hover:bg-[#15234E] text-white cursor-pointer ring-2 ring-blue-900/20 active:scale-95'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? 'Menyimpan...' : 'Simpan Hak Akses Role Ini'}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
