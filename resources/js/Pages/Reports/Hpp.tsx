import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface HppRow {
  product_id: number | null;
  sku: string;
  product_name: string;
  qty: number;
  unit_hpp: number;
  unit_price: number;
  total_hpp: number;
  total_sales: number;
  margin: number;
}

interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null; }

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

  /** Isi hari ini di kedua tanggal — memudahkan cek barang keluar hari ini. */
  function setToday() {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
    router.get('/reports/hpp', { search, date_from: today, date_to: today }, { preserveState: true });
  }

  const marginPositive = summary.margin >= 0;

  return (
    <AppLayout>
      <Head title="HPP Report — Modal, Penjualan & Keuntungan" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HPP Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rekap barang keluar per SKU berdasarkan invoice, beserta modal dan keuntungannya
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-gray-500">Total Qty Keluar</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1 font-mono">{fmt(summary.qty)}</p>
        </div>
        <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-orange-600">Total HPP (Modal)</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1 font-mono">{rp(summary.total_hpp)}</p>
        </div>
        <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-gray-500">Total Penjualan</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1 font-mono">{rp(summary.total_sales)}</p>
        </div>
        <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
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
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Cari SKU / Produk</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
            placeholder="Contoh: 2842P"
            className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none w-64"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Tanggal Mulai</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Tanggal Akhir</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none"
          />
        </div>
        <button
          onClick={applyFilter}
          className="px-4 py-2 bg-gray-100 text-gray-800 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-200 transition-all"
        >
          Filter
        </button>
        <button
          onClick={setToday}
          className="px-4 py-2 bg-white text-teal-700 rounded-xl text-sm font-semibold border border-teal-300 hover:bg-teal-50 transition-all"
        >
          Hari Ini
        </button>
        {(filters.search || filters.date_from || filters.date_to) && (
          <button
            onClick={resetFilter}
            className="px-4 py-2 bg-white text-gray-500 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-50 transition-all"
          >
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-300/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                <th className="py-3.5 px-5">SKU</th>
                <th className="py-3.5 px-4">Nama Produk</th>
                <th className="py-3.5 px-4 text-center">Qty</th>
                <th className="py-3.5 px-4 text-right text-orange-600">HPP</th>
                <th className="py-3.5 px-4 text-right">Harga Jual</th>
                <th className="py-3.5 px-4 text-right text-orange-600">Total HPP</th>
                <th className="py-3.5 px-4 text-right">Total Jual</th>
                <th className="py-3.5 px-4 text-right text-emerald-600">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/60 text-sm text-gray-700">
              {rows.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    Belum ada barang keluar pada rentang tanggal ini.
                  </td>
                </tr>
              )}
              {rows.data.map((row, idx) => (
                <tr key={`${row.sku}-${idx}`} className="hover:bg-orange-50/50 transition-colors">
                  <td className="py-3.5 px-5 font-mono text-xs font-bold text-teal-500">{row.sku}</td>
                  <td className="py-3.5 px-4 font-semibold text-gray-800">{row.product_name}</td>
                  <td className="py-3.5 px-4 text-center font-bold text-gray-800 font-mono">{fmt(row.qty)}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-orange-600">{rp(row.unit_hpp)}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-gray-800">{rp(row.unit_price)}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-orange-600">{rp(row.total_hpp)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-gray-900">{rp(row.total_sales)}</td>
                  <td className={`py-3.5 px-4 text-right font-mono font-bold ${row.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {rp(row.margin)}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.data.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 text-sm font-bold text-gray-900">
                  <td className="py-3.5 px-5" colSpan={2}>Grand Total (seluruh hasil filter)</td>
                  <td className="py-3.5 px-4 text-center font-mono">{fmt(summary.qty)}</td>
                  <td className="py-3.5 px-4"></td>
                  <td className="py-3.5 px-4"></td>
                  <td className="py-3.5 px-4 text-right font-mono text-orange-600">{rp(summary.total_hpp)}</td>
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
        {rows.last_page > 1 && (
          <div className="px-5 py-3.5 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>{rows.from}–{rows.to} dari {rows.total} SKU</span>
            <div className="flex gap-2">
              {rows.current_page > 1 && (
                <button onClick={() => router.get('/reports/hpp', { ...filters, page: rows.current_page - 1 })} className="px-3 py-1.5 bg-white rounded-lg hover:bg-teal-50 border border-teal-300 text-teal-700 transition-all">← Sebelumnya</button>
              )}
              {rows.current_page < rows.last_page && (
                <button onClick={() => router.get('/reports/hpp', { ...filters, page: rows.current_page + 1 })} className="px-3 py-1.5 bg-white rounded-lg hover:bg-teal-50 border border-teal-300 text-teal-700 transition-all">Berikutnya →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
