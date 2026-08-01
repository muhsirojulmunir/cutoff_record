import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Customer { id: number; name: string; }
interface SalesOrderSummaryItem {
  id: number;
  so_number: string;
  order_date: string;
  sales_channel: string;
  status: string;
  grand_total: string;
  calculated_hpp: number;
  calculated_margin: number;
  calculated_margin_pct: number;
  customer: Customer | null;
}
interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null; }

interface SummaryStats {
  total_revenue: number;
  total_hpp: number;
  total_margin: number;
  margin_percentage: number;
}

const statusColor: Record<string, string> = {
  draft:              'bg-slate-800 border-slate-700 text-slate-400',
  pending_approval:   'bg-amber-500/10 border-amber-500/20 text-amber-400',
  approved:           'bg-blue-500/10 border-blue-500/20 text-blue-400',
  processing:         'bg-violet-500/10 border-violet-500/20 text-violet-400',
  shipped:            'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  delivered:          'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  cancelled:          'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const fmt = (n: number | string) => Number(n).toLocaleString('id-ID');

export default function SalesSummary({
  orders,
  filters,
  summary,
}: {
  orders: Paginated<SalesOrderSummaryItem>;
  filters: { date_from?: string; date_to?: string; sales_channel?: string };
  summary: SummaryStats;
}) {
  const [dateFrom, setDateFrom]         = useState(filters.date_from ?? '');
  const [dateTo, setDateTo]             = useState(filters.date_to ?? '');
  const [salesChannel, setSalesChannel] = useState(filters.sales_channel ?? '');

  function applyFilter() {
    router.get('/reports/sales-summary', { date_from: dateFrom, date_to: dateTo, sales_channel: salesChannel }, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="Sales Summary — Omset & Margin" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales Summary (Omset & Margin Penjualan)</h1>
          <p className="text-sm text-slate-400 mt-0.5">Analisis ringkasan performa penjualan, total estimasi HPP produk terjual, dan Margin / Keuntungan Kotor</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-slate-400">Total Omset Penjualan</p>
          <p className="text-2xl font-extrabold text-white mt-1">Rp {fmt(summary.total_revenue)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-amber-400">Total Estimasi HPP Terjual</p>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">Rp {fmt(summary.total_hpp)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-emerald-400">Total Keuntungan Kotor (Margin)</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">Rp {fmt(summary.total_margin)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-emerald-400">Margin (%)</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{summary.margin_percentage}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 mb-1">Sales Channel</label>
          <select
            value={salesChannel}
            onChange={(e) => setSalesChannel(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">Semua Channel</option>
            <option value="direct">Direct / Offline</option>
            <option value="shopee">Shopee Marketplace</option>
            <option value="tokopedia">Tokopedia Marketplace</option>
            <option value="tiktok">TikTok Shop</option>
          </select>
        </div>
        <div className="flex items-end self-end">
          <button
            onClick={applyFilter}
            className="px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-sm font-semibold border border-slate-700 hover:bg-slate-700 transition-all"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                <th className="py-3.5 px-5">No. SO</th>
                <th className="py-3.5 px-4">Tanggal</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Channel</th>
                <th className="py-3.5 px-4 text-right">Omset (Revenue)</th>
                <th className="py-3.5 px-4 text-right text-amber-400">Estimasi HPP</th>
                <th className="py-3.5 px-4 text-right text-emerald-400">Margin Laba Kotor</th>
                <th className="py-3.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
              {orders.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Belum ada data transaksi Sales Order untuk periode ini.
                  </td>
                </tr>
              )}
              {orders.data.map((item) => (
                <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-violet-400">
                    <Link href={`/sales-orders/${item.id}`} className="hover:underline">{item.so_number}</Link>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">
                    {new Date(item.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-200">{item.customer?.name ?? '—'}</td>
                  <td className="py-3.5 px-4 text-slate-400 capitalize">{item.sales_channel}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-white">Rp {fmt(item.grand_total)}</td>
                  <td className="py-3.5 px-4 text-right font-bold text-amber-400">Rp {fmt(item.calculated_hpp)}</td>
                  <td className="py-3.5 px-4 text-right">
                    <span className={`font-extrabold block ${item.calculated_margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      Rp {fmt(item.calculated_margin)}
                    </span>
                    <span className={`text-[10px] font-semibold block ${item.calculated_margin_pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      ({item.calculated_margin_pct}%)
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor[item.status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {orders.last_page > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
            <span>{orders.from}–{orders.to} dari {orders.total} order</span>
            <div className="flex gap-2">
              {orders.current_page > 1 && (
                <button onClick={() => router.get('/reports/sales-summary', { ...filters, page: orders.current_page - 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">← Sebelumnya</button>
              )}
              {orders.current_page < orders.last_page && (
                <button onClick={() => router.get('/reports/sales-summary', { ...filters, page: orders.current_page + 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">Berikutnya →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
