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
  partially_paid: 'bg-orange-50 border-orange-200 text-orange-600',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue:        'bg-red-600/10 border-red-600/20 text-red-400',
  cancelled:      'bg-gray-200 border-gray-400 text-gray-500',
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
          <h1 className="text-2xl font-bold text-gray-900">Invoice Pabrik</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daftar invoice yang diterima dari supplier / pabrik</p>
        </div>
        <Link href="/factory-invoices/create" className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all">
          + Buat Invoice Pabrik
        </Link>
      </div>

      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* Filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilter()}
          placeholder="Cari no. invoice / supplier..."
          className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none w-64" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-teal-500 focus:outline-none">
          <option value="">Semua Status</option>
          <option value="unpaid">Belum Bayar</option>
          <option value="partially_paid">Sebagian</option>
          <option value="paid">Lunas</option>
          <option value="overdue">Jatuh Tempo</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        <button onClick={applyFilter} className="px-4 py-2 bg-gray-100 text-gray-800 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-200 transition-all">Filter</button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-50">
                <th className="py-3.5 px-5 whitespace-nowrap">No. Invoice</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Supplier</th>
                <th className="py-3.5 px-4 whitespace-nowrap">No. Invoice Supplier</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Referensi PO</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Tgl Invoice</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Total</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Sisa</th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap">Status</th>
                <th className="py-3.5 px-4 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {invoices.data.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-gray-400 font-medium">Belum ada invoice pabrik.</td></tr>
              )}
              {invoices.data.map(inv => (
                <tr key={inv.id} className="hover:bg-teal-50/60 transition-colors group">
                  <td className="py-3.5 px-5 font-bold text-teal-400 font-mono text-xs whitespace-nowrap">{inv.invoice_number}</td>
                  <td className="py-3.5 px-4 font-semibold text-xs text-gray-800">{inv.supplier?.name ?? '—'}</td>
                  <td className="py-3.5 px-4 text-gray-500 font-mono text-xs whitespace-nowrap">{inv.supplier_invoice_number ?? '—'}</td>
                  <td className="py-3.5 px-4 text-gray-500 font-mono text-xs whitespace-nowrap">{inv.purchase_order?.po_number ?? '—'}</td>
                  <td className="py-3.5 px-4 text-gray-700 font-mono text-xs whitespace-nowrap">{new Date(inv.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-gray-900 font-mono text-xs whitespace-nowrap">Rp {fmt(inv.total_amount)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-rose-400 font-mono text-xs whitespace-nowrap">Rp {fmt(inv.remaining_amount)}</td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor[inv.status] ?? 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                      {statusLabel[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <Link href={`/factory-invoices/${inv.id}`} className="text-xs text-teal-400 hover:text-teal-600 font-semibold transition-colors">Detail →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {invoices.last_page > 1 && (
          <div className="px-5 py-3.5 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>{invoices.from}–{invoices.to} dari {invoices.total} invoice</span>
            <div className="flex gap-2">
              {invoices.current_page > 1 && (
                <button onClick={() => router.get('/factory-invoices', { ...filters, page: invoices.current_page - 1 })} className="px-3 py-1.5 bg-white rounded-lg hover:bg-teal-50 border border-teal-300 text-teal-700 transition-all">← Sebelumnya</button>
              )}
              {invoices.current_page < invoices.last_page && (
                <button onClick={() => router.get('/factory-invoices', { ...filters, page: invoices.current_page + 1 })} className="px-3 py-1.5 bg-white rounded-lg hover:bg-teal-50 border border-teal-300 text-teal-700 transition-all">Berikutnya →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
