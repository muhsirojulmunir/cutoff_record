import React from 'react';
import { Head, Link, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string;
  bank_accounts: {
    id: number;
    bank_name: string;
    account_number: string | null;
    account_holder: string | null;
  }[];
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    name: string;
  } | null;
}

interface ShowProps {
  supplier: Supplier;
}

export default function Show({ supplier }: ShowProps) {
  const { auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];
  const canEdit = permissions.includes('supplier.edit');

  return (
    <AppLayout>
      <Head title={`Detail Supplier - ${supplier.supplier_code}`} />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
            <p className="text-gray-500 text-xs mt-1">Master Data / Supplier / Detail ({supplier.supplier_code})</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/suppliers"
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
            >
              Kembali
            </Link>
            {canEdit && (
              <Link
                href={`/suppliers/${supplier.id}/edit`}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40"
              >
                Edit Supplier
              </Link>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kode Supplier</span>
              <p className="text-sm font-mono font-bold text-teal-400">{supplier.supplier_code}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nama Supplier</span>
              <p className="text-sm font-semibold text-gray-800">{supplier.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Contact Person</span>
              <p className="text-sm font-semibold text-gray-800">{supplier.contact_person ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nomor Telepon</span>
              <p className="text-sm font-medium text-gray-700">{supplier.phone ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Email</span>
              <p className="text-sm text-gray-700">{supplier.email ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Termin Pembayaran</span>
              <p className="text-sm text-gray-700">{supplier.payment_terms}</p>
            </div>
          </div>

          <div className="space-y-1 border-b border-gray-300/80 pb-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Alamat Kantor / Pabrik</span>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{supplier.address ?? '—'}</p>
          </div>

          {/* Bank Accounts */}
          <div className="space-y-3 border-b border-gray-300/80 pb-6 p-4 rounded-xl bg-gray-50 border border-gray-300/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Rekening Bank ({supplier.bank_accounts.length})
            </span>

            {supplier.bank_accounts.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada rekening terdaftar.</p>
            ) : (
              <div className="space-y-2">
                {supplier.bank_accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-300/70"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{account.bank_name}</p>
                      {account.account_holder && (
                        <p className="text-xs text-gray-400 mt-0.5">a.n. {account.account_holder}</p>
                      )}
                    </div>
                    <p className="text-sm font-mono font-bold text-gray-800">{account.account_number ?? '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                    ${supplier.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${supplier.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {supplier.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dibuat Oleh</span>
              <p className="text-xs text-gray-700 pt-1">{supplier.creator?.name ?? 'Sistem'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Terakhir Diperbarui</span>
              <p className="text-xs text-gray-500 pt-1">{new Date(supplier.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Catatan</span>
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{supplier.notes ?? 'Tidak ada catatan.'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
