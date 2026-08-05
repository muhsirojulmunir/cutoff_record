import React from 'react';
import { Head, Link } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { WorkQueueItem, WorkQueueType } from '../../Types';

interface Props {
  approvals: WorkQueueItem[];
  summary: { approval_total: number };
}

/** Path Heroicons 24x24 outline per jenis dokumen. */
const TYPE_ICONS: Record<WorkQueueType, string> = {
  purchase_order:
    'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
  sales_order:
    'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  petty_cash:
    'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6',
  invoice:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  factory_receivable:
    'M12 6v12m-3-2.818l.879.879c1.003 1.003 2.63 1.003 3.633 0L14 15m-1.879-8.919l-.621.621c-1.129 1.129-1.129 2.96 0 4.089l.879.879M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  marketplace:
    'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72',
  stock:
    'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
};

const SEVERITY_STYLES: Record<string, { card: string; icon: string; count: string }> = {
  critical: {
    card: 'border-rose-200 bg-rose-50/60 hover:border-rose-300',
    icon: 'bg-rose-100 text-rose-600',
    count: 'text-rose-600',
  },
  warning: {
    card: 'border-orange-200 bg-orange-50/60 hover:border-orange-300',
    icon: 'bg-orange-100 text-orange-600',
    count: 'text-orange-600',
  },
  info: {
    card: 'border-gray-200 bg-white hover:border-teal-300',
    icon: 'bg-teal-50 text-teal-600',
    count: 'text-teal-600',
  },
};

function QueueCard({ item }: { item: WorkQueueItem }) {
  const styles = SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.info;

  return (
    <Link
      href={item.href}
      className={`block p-5 rounded-2xl border shadow-sm transition-all ${styles.card}`}
    >
      <div className="flex items-start gap-4">
        <span className={`shrink-0 p-2.5 rounded-xl ${styles.icon}`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[item.type]} />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-gray-900">{item.title}</p>
            <span className={`shrink-0 text-2xl font-extrabold font-mono leading-none ${styles.count}`}>
              {item.count}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{item.description}</p>
          <p className="text-[11px] font-semibold text-teal-700 mt-2.5">Buka daftar →</p>
        </div>
      </div>
    </Link>
  );
}

export default function ApprovalCenter({ approvals, summary }: Props) {
  return (
    <AppLayout>
      <Head title="Pusat Approval" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pusat Approval</h1>
          <p className="text-gray-500 text-xs mt-1">
            Semua dokumen yang menunggu persetujuan Anda — Purchase Order, Barang Masuk, Retur,
            Sales Order, dan Petty Cash dalam satu halaman
          </p>
        </div>

        {/* Ringkasan */}
        <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-rose-600">Menunggu Persetujuan Anda</p>
          <p className="text-2xl font-extrabold text-rose-600 mt-1 font-mono">{summary.approval_total}</p>
        </div>

        {/* Daftar approval */}
        <div>
          {approvals.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
              <span className="inline-flex p-3 rounded-2xl bg-emerald-50 text-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-gray-800 mt-3">Tidak ada yang menunggu persetujuan</p>
              <p className="text-xs text-gray-400 mt-1">
                Semua pengajuan yang menjadi wewenang Anda sudah diproses.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {approvals.map((item) => (
                <QueueCard key={item.key} item={item} />
              ))}
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
