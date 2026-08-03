import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Role {
  id: number;
  name: string;
}

interface UserData {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  role: Role | null;
  role_id: number | null;
}

interface UserEditProps {
  user: UserData;
  roles: Role[];
}

export default function Edit({ user, roles }: UserEditProps) {
  const { data, setData, put, processing, errors } = useForm({
    name: user.name,
    email: user.email,
    password: '',
    role_id: user.role_id?.toString() ?? '',
    status: user.status,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    put(`/users/${user.id}`);
  }

  return (
    <AppLayout>
      <Head title={`Edit User — ${user.name}`} />

      <div className="max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/users"
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
            <p className="text-gray-500 text-xs mt-0.5">Pengaturan / User Management / {user.name}</p>
          </div>
        </div>

        {/* Identity Card */}
        <div className="flex items-center gap-4 px-5 py-4 bg-gray-50/50 border border-gray-300 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user.name}</p>
            <p className="text-gray-500 text-xs">{user.email}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white border border-gray-300 rounded-2xl p-6 space-y-5">
          {/* Nama */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              Nama Lengkap <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData('name', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              Email <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              value={data.email}
              onChange={(e) => setData('email', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            {errors.email && <p className="text-rose-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Password (opsional saat edit) */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              Password Baru
              <span className="ml-2 text-gray-400 font-normal text-xs">(Kosongkan jika tidak ingin diubah)</span>
            </label>
            <input
              type="password"
              value={data.password}
              onChange={(e) => setData('password', e.target.value)}
              placeholder="Minimal 8 karakter..."
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            {errors.password && <p className="text-rose-400 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              Role <span className="text-rose-400">*</span>
            </label>
            <select
              value={data.role_id}
              onChange={(e) => setData('role_id', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              disabled={processing}
            >
              <option value="">Pilih role...</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            {errors.role_id && <p className="text-rose-400 text-xs mt-1">{errors.role_id}</p>}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Status</label>
            <select
              value={data.status}
              onChange={(e) => setData('status', e.target.value as 'active' | 'inactive')}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              disabled={processing}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
            {errors.status && <p className="text-rose-400 text-xs mt-1">{errors.status}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-300/80">
            <Link
              href="/users"
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-all"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={processing}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-60"
            >
              {processing ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
