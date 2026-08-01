import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

export default function Create() {
  const { data, setData, post, processing, errors } = useForm({
    code: '',
    name: '',
    location: '',
    person_in_charge: '',
    phone: '',
    status: 'active' as 'active' | 'inactive',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/warehouses');
  }

  return (
    <AppLayout>
      <Head title="Tambah Gudang" />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Tambah Gudang Baru</h1>
          <p className="text-slate-400 text-xs mt-1">Master Data / Gudang / Tambah</p>
        </div>

        {/* Form Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Code */}
              <div className="space-y-1.5">
                <label htmlFor="code" className="block text-sm font-semibold text-slate-300">
                  Kode Gudang <span className="text-violet-400">*</span>
                </label>
                <input
                  id="code"
                  type="text"
                  value={data.code}
                  onChange={(e) => setData('code', e.target.value)}
                  placeholder="Contoh: WH-001"
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.code ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                  disabled={processing}
                />
                {errors.code && <p className="text-rose-400 text-xs mt-1">{errors.code}</p>}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-semibold text-slate-300">
                  Nama Gudang <span className="text-violet-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={data.name}
                  onChange={(e) => setData('name', e.target.value)}
                  placeholder="Masukkan nama gudang..."
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.name ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                  disabled={processing}
                />
                {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label htmlFor="location" className="block text-sm font-semibold text-slate-300">
                Lokasi / Alamat
              </label>
              <input
                id="location"
                type="text"
                value={data.location}
                onChange={(e) => setData('location', e.target.value)}
                placeholder="Alamat lengkap lokasi gudang..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                disabled={processing}
              />
              {errors.location && <p className="text-rose-400 text-xs mt-1">{errors.location}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* PIC */}
              <div className="space-y-1.5">
                <label htmlFor="person_in_charge" className="block text-sm font-semibold text-slate-300">
                  Person in Charge (PIC)
                </label>
                <input
                  id="person_in_charge"
                  type="text"
                  value={data.person_in_charge}
                  onChange={(e) => setData('person_in_charge', e.target.value)}
                  placeholder="Nama penanggung jawab..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.person_in_charge && <p className="text-rose-400 text-xs mt-1">{errors.person_in_charge}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label htmlFor="phone" className="block text-sm font-semibold text-slate-300">
                  Nomor Telepon
                </label>
                <input
                  id="phone"
                  type="text"
                  value={data.phone}
                  onChange={(e) => setData('phone', e.target.value)}
                  placeholder="Contoh: 08123456789"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.phone && <p className="text-rose-400 text-xs mt-1">{errors.phone}</p>}
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label htmlFor="status" className="block text-sm font-semibold text-slate-300">
                Status
              </label>
              <select
                id="status"
                value={data.status}
                onChange={(e) => setData('status', e.target.value as 'active' | 'inactive')}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                disabled={processing}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
              {errors.status && <p className="text-rose-400 text-xs mt-1">{errors.status}</p>}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="notes" className="block text-sm font-semibold text-slate-300">
                Catatan Tambahan
              </label>
              <textarea
                id="notes"
                value={data.notes}
                onChange={(e) => setData('notes', e.target.value)}
                rows={3}
                placeholder="Tulis catatan penting tentang gudang..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.notes && <p className="text-rose-400 text-xs mt-1">{errors.notes}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
              <Link
                href="/warehouses"
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-violet-900/20 transition-all flex items-center gap-2"
              >
                {processing ? 'Menyimpan...' : 'Simpan Gudang'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
