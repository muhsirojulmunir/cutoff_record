import React from 'react';
import { Head, Link, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Warehouse {
  id: number;
  code: string;
  name: string;
  location: string | null;
  person_in_charge: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ShowProps {
  warehouse: Warehouse;
}

export default function Show({ warehouse }: ShowProps) {
  const { auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];
  const canEdit = permissions.includes('warehouse.edit');

  return (
    <AppLayout>
      <Head title={`Detail Gudang - ${warehouse.code}`} />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Breadcrumb / Actions */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{warehouse.name}</h1>
            <p className="text-gray-500 text-xs mt-1">Master Data / Gudang / Detail ({warehouse.code})</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/warehouses"
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
            >
              Kembali
            </Link>
            {canEdit && (
              <Link
                href={`/warehouses/${warehouse.id}/edit`}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40"
              >
                Edit Gudang
              </Link>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kode Gudang</span>
              <p className="text-sm font-mono font-bold text-teal-400">{warehouse.code}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nama Gudang</span>
              <p className="text-sm font-semibold text-gray-800">{warehouse.name}</p>
            </div>
          </div>

          <div className="space-y-1 border-b border-gray-300/80 pb-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Lokasi / Alamat</span>
            <p className="text-sm text-gray-700 leading-relaxed">{warehouse.location ?? '—'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Person in Charge (PIC)</span>
              <p className="text-sm font-semibold text-gray-800">{warehouse.person_in_charge ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nomor Telepon</span>
              <p className="text-sm font-medium text-gray-700">{warehouse.phone ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                    ${warehouse.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${warehouse.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {warehouse.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Terakhir Diperbarui</span>
              <p className="text-xs text-gray-500 pt-1">{new Date(warehouse.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Catatan</span>
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{warehouse.notes ?? 'Tidak ada catatan.'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
