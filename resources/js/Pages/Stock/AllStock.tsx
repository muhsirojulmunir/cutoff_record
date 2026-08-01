import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Category { id: number; name: string; }
interface ProductItem {
  id: number;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  stock: number;
  reserved_stock: number;
  minimum_stock: number;
  selling_price: string;
  category: Category | null;
}
interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null; }

interface Summary {
  total_products: number;
  total_physical_stock: number;
  total_reserved_stock: number;
  total_ready_stock: number;
}

const fmt = (n: number | string) => Number(n).toLocaleString('id-ID');

export default function AllStock({
  products,
  categories,
  filters,
  summary,
}: {
  products: Paginated<ProductItem>;
  categories: Category[];
  filters: { search?: string; category_id?: string };
  summary: Summary;
}) {
  const [search, setSearch] = useState(filters.search ?? '');
  const [categoryId, setCategoryId] = useState(filters.category_id ?? '');

  function applyFilter() {
    router.get('/all-stock', { search, category_id: categoryId }, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="All Stock — Stok Real-Time" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">All Stock — Ringkasan Stok Ready</h1>
          <p className="text-sm text-slate-400 mt-0.5">Pantau seluruh ketersediaan stok fisik, reservasi order, dan stok siap jual (ready) secara real-time</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-slate-400">Total Varian Produk</p>
          <p className="text-2xl font-extrabold text-white mt-1">{fmt(summary.total_products)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-slate-400">Total Stok Fisik</p>
          <p className="text-2xl font-extrabold text-indigo-400 mt-1">{fmt(summary.total_physical_stock)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-amber-400">Stok Di-Reserved (Order Pending)</p>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">{fmt(summary.total_reserved_stock)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
          <p className="text-xs font-semibold text-emerald-400">Stok Ready Siap Jual</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{fmt(summary.total_ready_stock)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
          placeholder="Cari SKU / Nama Produk..."
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none w-72"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
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
                <th className="py-3.5 px-4 text-center">Stok Fisik</th>
                <th className="py-3.5 px-4 text-center text-amber-400">Reserved</th>
                <th className="py-3.5 px-4 text-center text-emerald-400">Stok Ready</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Harga Jual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
              {products.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Tidak ada data stok produk ditemukan.
                  </td>
                </tr>
              )}
              {products.data.map((item) => {
                const physicalStock = Number(item.stock);
                const reserved = Number(item.reserved_stock || 0);
                const readyStock = Math.max(0, physicalStock - reserved);
                const minStock = Number(item.minimum_stock || 0);

                let badgeColor = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                let badgeText  = '✅ Ready';

                if (physicalStock <= 0) {
                  badgeColor = 'bg-rose-500/10 border-rose-500/20 text-rose-400';
                  badgeText  = '❌ Stok Habis';
                } else if (readyStock <= minStock) {
                  badgeColor = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
                  badgeText  = '⚠️ Menipis';
                }

                return (
                  <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-xs font-bold text-violet-400">{item.sku}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      {item.name}
                      {item.brand && <span className="text-[10px] text-slate-500 block">{item.brand}</span>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{item.category?.name ?? '—'}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-200">{fmt(physicalStock)} <span className="text-[10px] text-slate-500">{item.unit || 'pcs'}</span></td>
                    <td className="py-3.5 px-4 text-center font-bold text-amber-400">{reserved > 0 ? fmt(reserved) : '—'}</td>
                    <td className="py-3.5 px-4 text-center font-extrabold text-emerald-400 text-base">{fmt(readyStock)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                        {badgeText}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-200">Rp {fmt(item.selling_price)}</td>
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
                <button onClick={() => router.get('/all-stock', { ...filters, page: products.current_page - 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">← Sebelumnya</button>
              )}
              {products.current_page < products.last_page && (
                <button onClick={() => router.get('/all-stock', { ...filters, page: products.current_page + 1 })} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 transition-all">Berikutnya →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
