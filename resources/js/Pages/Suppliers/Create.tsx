import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import SupplierBankAccountFields, { emptyBankAccount } from '@/Components/SupplierBankAccountFields';

export default function Create() {
  const { data, setData, post, processing, errors } = useForm({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    payment_terms: '',
    bank_accounts: [emptyBankAccount()],
    status: 'active' as 'active' | 'inactive',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/suppliers');
  }

  return (
    <AppLayout>
      <Head title="Tambah Supplier" />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tambah Supplier Baru</h1>
          <p className="text-gray-500 text-xs mt-1">Master Data / Supplier / Tambah</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700">
                Nama Supplier / Pabrik <span className="text-teal-400">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={data.name}
                onChange={(e) => setData('name', e.target.value)}
                placeholder="Masukkan nama supplier..."
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                  ${errors.name ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                disabled={processing}
              />
              {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Contact Person */}
              <div className="space-y-1.5">
                <label htmlFor="contact_person" className="block text-sm font-semibold text-gray-700">
                  Contact Person
                </label>
                <input
                  id="contact_person"
                  type="text"
                  value={data.contact_person}
                  onChange={(e) => setData('contact_person', e.target.value)}
                  placeholder="Nama contact person..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.contact_person && <p className="text-rose-400 text-xs mt-1">{errors.contact_person}</p>}
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
                  placeholder="Contoh: 08123456789"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.phone && <p className="text-rose-400 text-xs mt-1">{errors.phone}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  placeholder="supplier@pabrik.com"
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
                Alamat Kantor / Pabrik
              </label>
              <textarea
                id="address"
                value={data.address}
                onChange={(e) => setData('address', e.target.value)}
                rows={3}
                placeholder="Masukkan alamat lengkap..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.address && <p className="text-rose-400 text-xs mt-1">{errors.address}</p>}
            </div>

            {/* Bank Info */}
            <SupplierBankAccountFields
              accounts={data.bank_accounts}
              onChange={(accounts) => setData('bank_accounts', accounts)}
              errors={errors as Record<string, string>}
              disabled={processing}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Payment Terms */}
              <div className="space-y-1.5">
                <label htmlFor="payment_terms" className="block text-sm font-semibold text-gray-700">
                  Termin Pembayaran <span className="text-teal-400">*</span>
                </label>
                <input
                  id="payment_terms"
                  type="text"
                  value={data.payment_terms}
                  onChange={(e) => setData('payment_terms', e.target.value)}
                  placeholder="Contoh: Tempo 30 hari setelah barang diterima"
                  className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                    ${errors.payment_terms ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                  disabled={processing}
                />
                {errors.payment_terms && <p className="text-rose-400 text-xs mt-1">{errors.payment_terms}</p>}
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
                placeholder="Tulis catatan penting tentang supplier..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.notes && <p className="text-rose-400 text-xs mt-1">{errors.notes}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-300/80">
              <Link
                href="/suppliers"
                className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all flex items-center gap-2"
              >
                {processing ? 'Menyimpan...' : 'Simpan Supplier'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
