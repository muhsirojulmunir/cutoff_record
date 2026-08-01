import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Role {
  id: number;
  name: string;
}

interface UserCreateProps {
  roles: Role[];
}

export default function Create({ roles }: UserCreateProps) {
  const { data, setData, post, processing, errors } = useForm({
    name: '',
    email: '',
    password: '',
    role_id: '',
    status: 'active',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/users');
  }

  return (
    <AppLayout>
      <Head title="Tambah User Baru" />

      <div className="max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/users"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Tambah User Baru</h1>
            <p className="text-slate-400 text-xs mt-0.5">Pengaturan / User Management / Tambah</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-5">
          {/* Nama */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">
              Nama Lengkap <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData('name', e.target.value)}
              placeholder="Masukkan nama lengkap..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">
              Email <span className="text-rose-400">*</span>
            </label>
            <input
              type="email"
              value={data.email}
              onChange={(e) => setData('email', e.target.value)}
              placeholder="user@company.com"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            {errors.email && <p className="text-rose-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">
              Password <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              value={data.password}
              onChange={(e) => setData('password', e.target.value)}
              placeholder="Minimal 8 karakter..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              disabled={processing}
            />
            {errors.password && <p className="text-rose-400 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">
              Role <span className="text-rose-400">*</span>
            </label>
            <select
              value={data.role_id}
              onChange={(e) => setData('role_id', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
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
            <label className="block text-sm font-semibold text-slate-300">Status</label>
            <select
              value={data.status}
              onChange={(e) => setData('status', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
              disabled={processing}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
            {errors.status && <p className="text-rose-400 text-xs mt-1">{errors.status}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
            <Link
              href="/users"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-all"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={processing}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-md shadow-violet-900/20 transition-all disabled:opacity-60"
            >
              {processing ? 'Menyimpan...' : 'Simpan User'}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
