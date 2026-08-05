import React from 'react';
import { Head, Link, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Customer {
  id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    name: string;
  } | null;
}

interface ShowProps {
  customer: Customer;
}

export default function Show({ customer }: ShowProps) {
  const { auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];
  const canEdit = permissions.includes('customer.edit');

  return (
    <AppLayout>
      <Head title={`Detail Customer - ${customer.customer_code}`} />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-gray-500 text-xs mt-1">Master Data / Customer / Detail ({customer.customer_code})</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/customers"
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
            >
              Kembali
            </Link>
            {canEdit && (
              <Link
                href={`/customers/${customer.id}/edit`}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40"
              >
                Edit Customer
              </Link>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kode Customer</span>
              <p className="text-sm font-mono font-bold text-teal-400">{customer.customer_code}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nama Customer</span>
              <p className="text-sm font-semibold text-gray-800">{customer.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nomor Telepon</span>
              <p className="text-sm font-medium text-gray-700">{customer.phone ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">NPWP / Nomor Pajak</span>
              <p className="text-sm font-medium text-gray-700">{customer.tax_number ?? '—'}</p>
            </div>
          </div>

          <div className="space-y-1 border-b border-gray-300/80 pb-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Alamat Lengkap</span>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{customer.address ?? '—'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                    ${customer.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${customer.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {customer.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dibuat Oleh</span>
              <p className="text-xs text-gray-700 pt-1">{customer.creator?.name ?? 'Sistem'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dibuat Oleh</span>
              <p className="text-xs text-gray-700 pt-1">{customer.creator?.name ?? 'Sistem'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Terakhir Diperbarui</span>
              <p className="text-xs text-gray-500 pt-1">{new Date(customer.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Catatan</span>
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{customer.notes ?? 'Tidak ada catatan.'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
