import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Supplier { id: number; name: string; supplier_code: string; }
interface PO { id: number; po_number: string; }
interface FactoryInvoice {
  id: number;
  invoice_number: string;
  supplier_invoice_number: string | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: string;
  remaining_amount: string;
  supplier: Supplier | null;
  purchase_order: PO | null;
}
interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null; }

const statusColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue:        'bg-red-600/10 border-red-600/20 text-red-400',
  cancelled:      'bg-slate-700 border-slate-600 text-slate-400',
};
const statusLabel: Record<string, string> = {
  unpaid: 'Belum Bayar', partially_paid: 'Sebagian', paid: 'Lunas', overdue: 'Jatuh Tempo', cancelled: 'Dibatalkan',
};
const fmt = (n: string | number) => Number(n).toLocaleString('id-ID');

export default function Index({ invoices, filters }: { invoices: Paginated<FactoryInvoice>; filters: { search?: string; status?: string } }) {
  const { flash } = usePage<PageProps>().props;
  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  function applyFilter() {
    router.get('/factory-invoices', { search, status }, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="Invoice Pabrik" />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoice Pabrik</h1>
          <p className="text-sm text-slate-400 mt-0.5">Daftar invoice yang diterima dari supplier / pabrik</p>
        </div>
        <Link href="/factory-invoices/create" className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-950/40 transition-all">
          + Buat Invoice Pabrik
        </Link>
      </div>

      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* Filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilter()}
          placeholder="Cari no. invoice / supplier..."
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none w-64" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none">
          <option value="">Semua Status</option>
          <option value="unpaid">Belum Bayar</option>
          <option value="partially_paid">Sebagian</option>
          <option value="paid">Lunas</option>
          <option value="overdue">Jatuh Tempo</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <button onClick={applyFilter} className="px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-sm font-semibold border border-slate-700 hover:bg-slate-700 transition-all">Filter</button>
      </div>

      {/* Table */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                <th className="py-3 px-5">No. Invoice</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4">No. Invoice Supplier</th>
                <th className="py-3 px-4">Referensi PO</th>
                <th className="py-3 px-4">Tgl Invoice</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Sisa</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
              {invoices.data.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-slate-500">Belum ada invoice pabrik.</td></tr>
              )}
              {invoices.data.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-violet-400">{inv.invoice_number}</td>
                  <td className="py-3.5 px-4 font-medium text-slate-200">{inv.supplier?.name ?? '—'}</td>
                  <td className="py-3.5 px-4 text-slate-400">{inv.supplier_invoice_number ?? '—'}</td>
                  <td className="py-3.5 px-4 text-slate-400">{inv.purchase_order?.po_number ?? '—'}</td>
                  <td className="py-3.5 px-4 text-slate-300">{new Date(inv.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-white">Rp {fmt(inv.total_amount)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-rose-400">Rp {fmt(inv.remaining_amount)}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor[inv.status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {statusLabel[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <Link href={`/factory-invoices/${inv.id}`} className="text-xs text-violet-400 hover:text-violet-300 font-semibold">Detail →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {invoices.last_page > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
            <span>{invoices.from}–{invoices.to} dari {invoices.total} invoice</span>
            <div className="flex gap-2">
              {invoices.current_page > 1 && (
                <button onClick={() => router.get('/factory-invoices', { ...filters, page: invoices.current_page - 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">← Sebelumnya</button>
              )}
              {invoices.current_page < invoices.last_page && (
                <button onClick={() => router.get('/factory-invoices', { ...filters, page: invoices.current_page + 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">Berikutnya →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
