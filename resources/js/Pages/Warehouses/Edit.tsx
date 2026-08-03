import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Warehouse {
  id: number;
  code: string;
  name: string;
  location: string | null;
  person_in_charge: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
}

interface EditProps {
  warehouse: Warehouse;
}

export default function Edit({ warehouse }: EditProps) {
  const { data, setData, put, processing, errors } = useForm({
    code: warehouse.code,
    name: warehouse.name,
    location: warehouse.location ?? '',
    person_in_charge: warehouse.person_in_charge ?? '',
    phone: warehouse.phone ?? '',
    status: warehouse.status,
    notes: warehouse.notes ?? '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    put(`/warehouses/${warehouse.id}`);
  }

  return (
    <AppLayout>
      <Head title="Edit Gudang" />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Gudang: {warehouse.code}</h1>
          <p className="text-gray-500 text-xs mt-1">Master Data / Gudang / Edit</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Code */}
              <div className="space-y-1.5">
                <label htmlFor="code" className="block text-sm font-semibold text-gray-700">
                  Kode Gudang <span className="text-teal-400">*</span>
                </label>
                <input
                  id="code"
                  type="text"
                  value={data.code}
                  onChange={(e) => setData('code', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                    ${errors.code ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                  disabled={processing}
                />
                {errors.code && <p className="text-rose-400 text-xs mt-1">{errors.code}</p>}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-semibold text-gray-700">
                  Nama Gudang <span className="text-teal-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={data.name}
                  onChange={(e) => setData('name', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                    ${errors.name ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                  disabled={processing}
                />
                {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label htmlFor="location" className="block text-sm font-semibold text-gray-700">
                Lokasi / Alamat
              </label>
              <input
                id="location"
                type="text"
                value={data.location}
                onChange={(e) => setData('location', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                disabled={processing}
              />
              {errors.location && <p className="text-rose-400 text-xs mt-1">{errors.location}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* PIC */}
              <div className="space-y-1.5">
                <label htmlFor="person_in_charge" className="block text-sm font-semibold text-gray-700">
                  Person in Charge (PIC)
                </label>
                <input
                  id="person_in_charge"
                  type="text"
                  value={data.person_in_charge}
                  onChange={(e) => setData('person_in_charge', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.person_in_charge && <p className="text-rose-400 text-xs mt-1">{errors.person_in_charge}</p>}
              </div>

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
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.phone && <p className="text-rose-400 text-xs mt-1">{errors.phone}</p>}
              </div>
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
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.notes && <p className="text-rose-400 text-xs mt-1">{errors.notes}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-300/80">
              <Link
                href="/warehouses"
                className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all flex items-center gap-2"
              >
                {processing ? 'Menyimpan...' : 'Perbarui Gudang'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
