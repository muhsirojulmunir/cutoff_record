import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface HppRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  product_id: number | null;
  sku: string;
  product_name: string;
  qty: number;
  unit_hpp: number;
  unit_price: number;
  total_hpp: number;
  total_sales: number;
  margin: number;
  margin_pct: number;
}

interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface Summary {
  qty: number;
  total_hpp: number;
  total_sales: number;
  margin: number;
  margin_percentage: number;
}

const fmt = (n: number | string) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const rp = (n: number | string) => 'Rp ' + fmt(n);

export default function Hpp({
  rows,
  filters,
  summary,
}: {
  rows: Paginated<HppRow>;
  filters: { search?: string; date_from?: string; date_to?: string };
  summary: Summary;
}) {
  const [search, setSearch] = useState(filters.search ?? '');
  const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
  const [dateTo, setDateTo] = useState(filters.date_to ?? '');

  function applyFilter() {
    router.get('/reports/hpp', { search, date_from: dateFrom, date_to: dateTo }, { preserveState: true });
  }

  function resetFilter() {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    router.get('/reports/hpp', {}, { preserveState: true });
  }

  function setToday() {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
    router.get('/reports/hpp', { search, date_from: today, date_to: today }, { preserveState: true });
  }

  function handleExportExcel() {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    window.location.href = `/reports/export/hpp?${params.toString()}`;
  }

  const marginPositive = summary.margin >= 0;

  return (
    <AppLayout>
      <Head title="HPP Report — Detail Per Invoice & SKU" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HPP Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rincian per invoice dan SKU, lengkap dengan modal (HPP), harga jual, dan margin keuntungan
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-200/40 transition-all shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export Excel (Semua Data)
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500">Total Qty Keluar</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1 font-mono">{fmt(summary.qty)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-orange-600">Total HPP (Modal)</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1 font-mono">{rp(summary.total_hpp)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500">Total Penjualan</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1 font-mono">{rp(summary.total_sales)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-600">Grand Total Margin</p>
          <p className={`text-2xl font-extrabold mt-1 font-mono ${marginPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {rp(summary.margin)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{summary.margin_percentage}% dari penjualan</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Cari Invoice / SKU / Customer</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
            placeholder="No. Invoice, SKU, atau Customer..."
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none w-64"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Tanggal Mulai</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Tanggal Akhir</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none"
          />
        </div>
        <button
          onClick={applyFilter}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
        >
          Filter
        </button>
        <button
          onClick={setToday}
          className="px-4 py-2 bg-white text-violet-700 rounded-xl text-sm font-semibold border border-violet-200 hover:bg-violet-50 transition-all"
        >
          Hari Ini
        </button>
        {(filters.search || filters.date_from || filters.date_to) && (
          <button
            onClick={resetFilter}
            className="px-4 py-2 bg-white text-gray-500 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4 whitespace-nowrap">No. Invoice</th>
                <th className="py-3 px-4 whitespace-nowrap">Tanggal</th>
                <th className="py-3 px-4 whitespace-nowrap">Customer</th>
                <th className="py-3 px-4 whitespace-nowrap">SKU</th>
                <th className="py-3 px-4">Nama Produk</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Qty</th>
                <th className="py-3 px-4 text-right text-orange-600 whitespace-nowrap">HPP (Modal)</th>
                <th className="py-3 px-4 text-right text-orange-600 whitespace-nowrap">Total HPP</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Harga Jual</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Total Jual</th>
                <th className="py-3 px-4 text-right text-emerald-600 whitespace-nowrap">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {rows.data.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    Belum ada data barang keluar/invoice pada filter ini.
                  </td>
                </tr>
              )}
              {rows.data.map((row, idx) => (
                <tr key={`${row.invoice_number}-${row.sku}-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-violet-600 whitespace-nowrap">{row.invoice_number}</td>
                  <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{row.invoice_date}</td>
                  <td className="py-3 px-4 text-gray-800 font-medium whitespace-nowrap">{row.customer_name}</td>
                  <td className="py-3 px-4 font-mono font-bold text-gray-700 whitespace-nowrap">{row.sku}</td>
                  <td className="py-3 px-4 font-semibold text-gray-800 max-w-[200px] truncate">{row.product_name}</td>
                  <td className="py-3 px-4 text-center font-bold text-gray-800 font-mono whitespace-nowrap">{fmt(row.qty)}</td>
                  <td className="py-3 px-4 text-right font-mono text-orange-600 whitespace-nowrap">{rp(row.unit_hpp)}</td>
                  <td className="py-3 px-4 text-right font-mono text-orange-600 whitespace-nowrap">{rp(row.total_hpp)}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-800 whitespace-nowrap">{rp(row.unit_price)}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">{rp(row.total_sales)}</td>
                  <td className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${row.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {rp(row.margin)}
                    <span className="text-[10px] text-gray-400 font-normal block">{row.margin_pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.data.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs font-bold text-gray-900">
                  <td className="py-3.5 px-4" colSpan={5}>Grand Total (seluruh hasil filter)</td>
                  <td className="py-3.5 px-4 text-center font-mono">{fmt(summary.qty)}</td>
                  <td className="py-3.5 px-4"></td>
                  <td className="py-3.5 px-4 text-right font-mono text-orange-600">{rp(summary.total_hpp)}</td>
                  <td className="py-3.5 px-4"></td>
                  <td className="py-3.5 px-4 text-right font-mono">{rp(summary.total_sales)}</td>
                  <td className={`py-3.5 px-4 text-right font-mono ${marginPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {rp(summary.margin)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {rows.total > 0 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Menampilkan {rows.from}–{rows.to} dari {rows.total} baris invoice</span>
            <div className="flex gap-2">
              {rows.current_page > 1 && (
                <button
                  onClick={() => router.get('/reports/hpp', { ...filters, page: rows.current_page - 1 })}
                  className="px-3 py-1.5 bg-white rounded-lg hover:bg-gray-50 border border-gray-200 text-gray-700 transition-all font-medium"
                >
                  ← Sebelumnya
                </button>
              )}
              {rows.current_page < rows.last_page && (
                <button
                  onClick={() => router.get('/reports/hpp', { ...filters, page: rows.current_page + 1 })}
                  className="px-3 py-1.5 bg-white rounded-lg hover:bg-gray-50 border border-gray-200 text-gray-700 transition-all font-medium"
                >
                  Berikutnya →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
