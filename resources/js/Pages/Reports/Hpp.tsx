import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Category { id: number; name: string; }
interface HppProductItem {
  id: number;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  purchase_price: string;
  selling_price: string;
  total_purchased_qty: number;
  hpp_weighted_average: number;
  margin_amount: number;
  margin_percentage: number;
  category: Category | null;
}
interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null; }

const fmt = (n: number | string) => Number(n).toLocaleString('id-ID');

export default function Hpp({
  products,
  categories,
  filters,
}: {
  products: Paginated<HppProductItem>;
  categories: Category[];
  filters: { search?: string; category_id?: string };
}) {
  const [search, setSearch] = useState(filters.search ?? '');
  const [categoryId, setCategoryId] = useState(filters.category_id ?? '');

  function applyFilter() {
    router.get('/reports/hpp', { search, category_id: categoryId }, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="HPP Report — Harga Pokok Penjualan" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Laporan HPP (Harga Pokok Penjualan)</h1>
          <p className="text-sm text-slate-400 mt-0.5">Metode HPP = Weighted Average (Rata-Rata Tertimbang) dari Purchase Order yang telah diterima (Received)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
          placeholder="Cari SKU / Nama Produk..."
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-amber-500 focus:outline-none w-72"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-amber-500 focus:outline-none"
        >
          <option value="">Semua Kategori</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <button
          onClick={applyFilter}
          className="px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-sm font-semibold border border-slate-700 hover:bg-slate-700 transition-all"
        >
          Filter
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                <th className="py-3.5 px-5">SKU</th>
                <th className="py-3.5 px-4">Nama Produk</th>
                <th className="py-3.5 px-4">Kategori</th>
                <th className="py-3.5 px-4 text-center">Qty Pembelian PO</th>
                <th className="py-3.5 px-4 text-right text-slate-400">Harga Master</th>
                <th className="py-3.5 px-4 text-right text-amber-400">HPP Weighted Avg</th>
                <th className="py-3.5 px-4 text-right">Harga Jual</th>
                <th className="py-3.5 px-4 text-right text-emerald-400">Potensi Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
              {products.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Belum ada data produk untuk laporan HPP.
                  </td>
                </tr>
              )}
              {products.data.map((item) => {
                const isPoBased = item.total_purchased_qty > 0;
                return (
                  <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-xs font-bold text-amber-400">{item.sku}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      {item.name}
                      {item.brand && <span className="text-[10px] text-slate-500 block">{item.brand}</span>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{item.category?.name ?? '—'}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-300">
                      {item.total_purchased_qty > 0 ? (
                        <span className="text-amber-400 font-extrabold">{fmt(item.total_purchased_qty)} {item.unit}</span>
                      ) : (
                        <span className="text-slate-500 text-xs">— (Master)</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 text-xs">Rp {fmt(item.purchase_price)}</td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-amber-300">
                      Rp {fmt(item.hpp_weighted_average)}
                      {isPoBased ? (
                        <span className="text-[9px] text-emerald-400 block font-semibold">Weighted PO</span>
                      ) : (
                        <span className="text-[9px] text-slate-500 block font-normal">Harga Master</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-200">Rp {fmt(item.selling_price)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <span className={`font-extrabold block ${item.margin_amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        Rp {fmt(item.margin_amount)}
                      </span>
                      <span className={`text-[10px] font-semibold block ${item.margin_percentage >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        ({item.margin_percentage}%)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {products.last_page > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
            <span>{products.from}–{products.to} dari {products.total} produk</span>
            <div className="flex gap-2">
              {products.current_page > 1 && (
                <button onClick={() => router.get('/reports/hpp', { ...filters, page: products.current_page - 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">← Sebelumnya</button>
              )}
              {products.current_page < products.last_page && (
                <button onClick={() => router.get('/reports/hpp', { ...filters, page: products.current_page + 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">Berikutnya →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
