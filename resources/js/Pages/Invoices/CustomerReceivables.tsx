import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: 'unpaid' | 'partially_paid' | 'overdue';
  customer: Customer | null;
  sales_order: SalesOrder | null;
}

interface Summary {
  total_receivable: number;
  total_overdue: number;
  total_unpaid: number;
  total_partially_paid: number;
  count_invoices: number;
  count_customers: number;
}

interface Props {
  invoices: Invoice[];
  filters: { search?: string; status?: string };
  summary: Summary;
}

const statusConfig: Record<string, { label: string; badge: string }> = {
  unpaid:         { label: 'Belum Bayar',     badge: 'bg-rose-500/10 border border-rose-500/20 text-rose-400' },
  partially_paid: { label: 'Dibayar Sebagian', badge: 'bg-amber-500/10 border border-amber-500/20 text-amber-400' },
  overdue:        { label: '⚠ Jatuh Tempo',   badge: 'bg-red-500/15 border border-red-500/30 text-red-400 font-bold animate-pulse' },
};

function fmt(val: number | string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(val));
}

function getDaysInfo(dueDate: string | null): { text: string; color: string } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `Terlambat ${Math.abs(diff)} hari`, color: 'text-red-400 font-semibold' };
  if (diff === 0) return { text: 'Jatuh tempo hari ini!', color: 'text-orange-400 font-semibold' };
  if (diff <= 7) return { text: `${diff} hari lagi`, color: 'text-amber-400' };
  return { text: `${diff} hari lagi`, color: 'text-slate-400' };
}

export default function CustomerReceivables({ invoices, filters, summary }: Props) {
  const { flash } = usePage<PageProps>().props;
  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  function applyFilter() {
    router.get('/piutang-customer', { search, status }, { preserveState: true });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyFilter();
  }

  return (
    <AppLayout>
      <Head title="Piutang Customer" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Piutang Customer</h1>
          <p className="text-slate-500 text-xs mt-0.5">Finance / Piutang Customer</p>
        </div>

        {flash?.success && <Alert type="success" message={flash.success} />}
        {flash?.error && <Alert type="error" message={flash.error} />}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Piutang</p>
            <p className="text-xl font-bold text-slate-100">{fmt(summary.total_receivable)}</p>
            <p className="text-xs text-slate-500 mt-1">{summary.count_invoices} invoice · {summary.count_customers} customer</p>
          </div>
          <div className="bg-slate-950 border border-red-900/40 rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-500/70 mb-1">Jatuh Tempo / Overdue</p>
            <p className="text-xl font-bold text-red-400">{fmt(summary.total_overdue)}</p>
            <p className="text-xs text-slate-500 mt-1">Segera tindaklanjuti</p>
          </div>
          <div className="bg-slate-950 border border-amber-900/40 rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500/70 mb-1">Dibayar Sebagian</p>
            <p className="text-xl font-bold text-amber-400">{fmt(summary.total_partially_paid)}</p>
            <p className="text-xs text-slate-500 mt-1">Sisa belum dilunasi</p>
          </div>
          <div className="bg-slate-950 border border-rose-900/40 rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-500/70 mb-1">Belum Bayar</p>
            <p className="text-xl font-bold text-rose-400">{fmt(summary.total_unpaid)}</p>
            <p className="text-xs text-slate-500 mt-1">Sama sekali belum ada pembayaran</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Cari Invoice / Customer</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nomor invoice, nama customer..."
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div className="w-48">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:border-violet-500 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">Semua</option>
                <option value="overdue">Jatuh Tempo (Overdue)</option>
                <option value="due_soon">Segera Jatuh Tempo</option>
                <option value="partially_paid">Dibayar Sebagian</option>
                <option value="unpaid">Belum Bayar</option>
              </select>
            </div>
            <button
              onClick={applyFilter}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Filter
            </button>
            {(search || status) && (
              <button
                onClick={() => { setSearch(''); setStatus(''); router.get('/piutang-customer'); }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden">
          {invoices.length === 0 ? (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-emerald-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-slate-400 font-semibold">Tidak ada piutang customer</p>
              <p className="text-slate-600 text-sm mt-1">Semua tagihan sudah lunas atau tidak ada data sesuai filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900/30 border-b border-slate-900">
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Invoice</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Tgl Invoice</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Jatuh Tempo</th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Tagihan</th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Sudah Dibayar</th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Sisa Piutang</th>
                    <th className="text-center px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="text-center px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {invoices.map((inv) => {
                    const cfg = statusConfig[inv.status] ?? statusConfig['unpaid'];
                    const daysInfo = getDaysInfo(inv.due_date);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="px-5 py-4">
                          <Link href={`/invoices/${inv.id}`} className="font-semibold text-violet-400 hover:text-violet-300 text-sm">
                            {inv.invoice_number}
                          </Link>
                          {inv.sales_order && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              <Link href={`/sales-orders/${inv.sales_order.id}`} className="hover:text-slate-400">
                                {inv.sales_order.so_number}
                              </Link>
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-200">{inv.customer?.name ?? '—'}</p>
                          <p className="text-[11px] text-slate-500">{inv.customer?.customer_code}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">
                          {new Date(inv.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-4">
                          {inv.due_date ? (
                            <div>
                              <p className="text-sm text-slate-300">
                                {new Date(inv.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                              {daysInfo && <p className={`text-[11px] mt-0.5 ${daysInfo.color}`}>{daysInfo.text}</p>}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-slate-300 font-medium">{fmt(inv.total_amount)}</td>
                        <td className="px-5 py-4 text-right text-sm text-emerald-400">{fmt(inv.paid_amount)}</td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-sm font-bold text-rose-400">{fmt(inv.remaining_amount)}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Link
                            href={`/invoices/${inv.id}/pay`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
                            </svg>
                            Bayar
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
