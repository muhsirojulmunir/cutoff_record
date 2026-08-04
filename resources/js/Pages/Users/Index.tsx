import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Role {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  role: Role | null;
  created_at: string;
}

interface UserIndexProps {
  users: {
    data: User[];
    links: any[];
    current_page: number;
    total: number;
  };
  roles: Role[];
  filters: {
    search?: string;
    role_id?: string;
    status?: string;
  };
}

const roleBadgeColor: Record<string, string> = {
  'Super Admin': 'bg-teal-500/15 border-teal-500/25 text-teal-600',
  'Admin':       'bg-blue-500/15 border-blue-500/25 text-blue-300',
  'Leader':      'bg-emerald-500/15 border-emerald-500/25 text-emerald-300',
  'Finance':     'bg-orange-50 border-orange-200 text-orange-600',
  'Management':  'bg-pink-500/15 border-pink-500/25 text-pink-300',
};

export default function Index({ users, roles, filters }: UserIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [roleId, setRoleId] = useState(filters.role_id ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canCreate = permissions.includes('user.create');
  const canEdit   = permissions.includes('user.edit');
  const canDelete = permissions.includes('user.delete');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/users', { search, role_id: roleId, status }, { preserveState: true });
  }

  function handleFilterChange(key: string, value: string) {
    const newFilters = { search, role_id: roleId, status, [key]: value };
    if (key === 'role_id') setRoleId(value);
    if (key === 'status') setStatus(value);
    router.get('/users', newFilters, { preserveState: true });
  }

  function handleDelete(user: User) {
    setDeleteLoading(true);
    router.delete(`/users/${user.id}`, {
      onFinish: () => {
        setDeleteLoading(false);
        setDeletingUser(null);
      },
    });
  }

  return (
    <AppLayout>
      <Head title="User Management" />
      <Alert message={flash.success ?? null} type="success" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 text-xs mt-1">Pengaturan / User Management</p>
          </div>
          {canCreate && (
            <Link
              href="/users/create"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-teal-200/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah User
            </Link>
          )}
        </div>

        {/* Filter & Search */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau email..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>
            <div className="flex gap-2">
              <select
                value={roleId}
                onChange={(e) => handleFilterChange('role_id', e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
              >
                Cari
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-300 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-300 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-teal-50/60">
                  <th className="px-6 py-4">Nama</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/60 text-sm">
                {users.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      Tidak ada data user ditemukan.
                    </td>
                  </tr>
                ) : (
                  users.data.map((user) => (
                    <tr key={user.id} className="hover:bg-teal-50/40 group transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-800 group-hover:text-gray-900 transition-colors">
                            {user.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{user.email}</td>
                      <td className="px-6 py-4">
                        {user.role ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleBadgeColor[user.role.name] ?? 'bg-gray-100 border-gray-300 text-gray-500'}`}>
                            {user.role.name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Tidak ada role</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          user.status === 'active'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-gray-100 border-gray-300 text-gray-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {user.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <Link
                              href={`/users/${user.id}/edit`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-teal-400 hover:bg-teal-500/10 border border-transparent hover:border-teal-500/10 transition-all"
                              title="Edit"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Link>
                          )}
                          {canDelete && user.id !== auth.user?.id && (
                            <button
                              onClick={() => setDeletingUser(user)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 transition-all"
                              title="Hapus"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-300/80 bg-gray-50/10 flex items-center justify-between">
            <p className="text-xs text-gray-400">Total {users.total} user</p>
            <Pagination links={users.links} />
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-50 backdrop-blur-sm" onClick={() => setDeletingUser(null)} />
          <div className="relative bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-rose-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-gray-900 font-semibold">Konfirmasi Hapus</h3>
                <p className="text-gray-500 text-xs">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>
            <p className="text-gray-700 text-sm mb-6">
              Hapus user <span className="font-bold text-gray-900">{deletingUser.name}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-all"
                disabled={deleteLoading}
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deletingUser)}
                className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-200/40"
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Menghapus...' : 'Hapus User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
