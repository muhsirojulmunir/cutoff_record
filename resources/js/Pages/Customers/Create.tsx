import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

export default function Create() {
  const { data, setData, post, processing, errors } = useForm({
    name: '',
    phone: '',
    email: '',
    address: '',
    tax_number: '',
    status: 'active' as 'active' | 'inactive',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/customers');
  }

  return (
    <AppLayout>
      <Head title="Tambah Customer" />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tambah Customer Baru</h1>
          <p className="text-gray-500 text-xs mt-1">Master Data / Customer / Tambah</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700">
                Nama Customer <span className="text-teal-400">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={data.name}
                onChange={(e) => setData('name', e.target.value)}
                placeholder="Masukkan nama customer..."
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                  ${errors.name ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                disabled={processing}
              />
              {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div className="space-y-1.5">
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-700">
                  Nomor Telepon
                </label>
                <input
                  id="phone"
                  type="text"
                  value={data.phone}
                  onChange={(e) => setData('phone', e.target.value)}
                  placeholder="Contoh: 08123456789"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.phone && <p className="text-rose-400 text-xs mt-1">{errors.phone}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={data.email}
                  onChange={(e) => setData('email', e.target.value)}
                  placeholder="customer@perusahaan.com"
                  className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                    ${errors.email ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                  disabled={processing}
                />
                {errors.email && <p className="text-rose-400 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <label htmlFor="address" className="block text-sm font-semibold text-gray-700">
                Alamat Lengkap
              </label>
              <textarea
                id="address"
                value={data.address}
                onChange={(e) => setData('address', e.target.value)}
                rows={3}
                placeholder="Masukkan alamat pengiriman / alamat lengkap..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.address && <p className="text-rose-400 text-xs mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* NPWP / Tax Number */}
              <div className="space-y-1.5">
                <label htmlFor="tax_number" className="block text-sm font-semibold text-gray-700">
                  NPWP / Tax Number
                </label>
                <input
                  id="tax_number"
                  type="text"
                  value={data.tax_number}
                  onChange={(e) => setData('tax_number', e.target.value)}
                  placeholder="Contoh: 01.234.567.8-901.000"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.tax_number && <p className="text-rose-400 text-xs mt-1">{errors.tax_number}</p>}
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label htmlFor="status" className="block text-sm font-semibold text-gray-700">
                  Status
                </label>
                <select
                  id="status"
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
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="notes" className="block text-sm font-semibold text-gray-700">
                Catatan Tambahan
              </label>
              <textarea
                id="notes"
                value={data.notes}
                onChange={(e) => setData('notes', e.target.value)}
                rows={3}
                placeholder="Tulis catatan penting tentang customer..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.notes && <p className="text-rose-400 text-xs mt-1">{errors.notes}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-300/80">
              <Link
                href="/customers"
                className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all flex items-center gap-2"
              >
                {processing ? 'Menyimpan...' : 'Simpan Customer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
