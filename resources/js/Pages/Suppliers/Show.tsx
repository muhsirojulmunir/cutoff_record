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
  tax_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  payment_terms: string;
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
            <h1 className="text-2xl font-bold text-white">{supplier.name}</h1>
            <p className="text-slate-400 text-xs mt-1">Master Data / Supplier / Detail ({supplier.supplier_code})</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/suppliers"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-sm font-semibold transition-all"
            >
              Kembali
            </Link>
            {canEdit && (
              <Link
                href={`/suppliers/${supplier.id}/edit`}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-violet-900/20"
              >
                Edit Supplier
              </Link>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kode Supplier</span>
              <p className="text-sm font-mono font-bold text-violet-400">{supplier.supplier_code}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Supplier</span>
              <p className="text-sm font-semibold text-slate-200">{supplier.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contact Person</span>
              <p className="text-sm font-semibold text-slate-200">{supplier.contact_person ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nomor Telepon</span>
              <p className="text-sm font-medium text-slate-300">{supplier.phone ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</span>
              <p className="text-sm text-slate-300">{supplier.email ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Termin Pembayaran</span>
              <p className="text-sm text-slate-300">{supplier.payment_terms}</p>
            </div>
          </div>

          <div className="space-y-1 border-b border-slate-800/80 pb-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Alamat Kantor / Pabrik</span>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{supplier.address ?? '—'}</p>
          </div>

          {/* Bank Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6 p-4 rounded-xl bg-slate-900/40 border border-slate-800/60">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Bank</span>
              <p className="text-sm font-semibold text-slate-200">{supplier.bank_name ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nomor Rekening Bank</span>
              <p className="text-sm font-mono font-bold text-slate-200">{supplier.bank_account_number ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">NPWP / Nomor Pajak</span>
              <p className="text-sm font-medium text-slate-300">{supplier.tax_number ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</span>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                    ${supplier.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${supplier.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {supplier.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dibuat Oleh</span>
              <p className="text-xs text-slate-300 pt-1">{supplier.creator?.name ?? 'Sistem'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Terakhir Diperbarui</span>
              <p className="text-xs text-slate-400 pt-1">{new Date(supplier.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Catatan</span>
            <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{supplier.notes ?? 'Tidak ada catatan.'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
