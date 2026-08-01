import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Category { id: number; name: string; }
interface VelocityProductItem {
  id: number;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  stock: number;
  selling_price: string;
  total_sold_qty: number;
  total_sold_amount: number;
  category: Category | null;
}

interface SummaryStats {
  hero_count: number;
  slow_count: number;
  dead_stock_count: number;
}

const fmt = (n: number | string) => Number(n).toLocaleString('id-ID');

export default function ProductVelocity({
  heroProducts,
  slowProducts,
  deadStockProducts,
  categories,
  filters,
  summary,
}: {
  heroProducts: VelocityProductItem[];
  slowProducts: VelocityProductItem[];
  deadStockProducts: VelocityProductItem[];
  categories: Category[];
  filters: { days?: number; category_id?: string };
  summary: SummaryStats;
}) {
  const [days, setDays]                 = useState(filters.days ?? 30);
  const [categoryId, setCategoryId]     = useState(filters.category_id ?? '');
  const [activeTab, setActiveTab]       = useState<'hero' | 'slow' | 'dead'>('hero');

  function applyFilter(newDays?: number, newCat?: string) {
    const d = newDays !== undefined ? newDays : days;
    const c = newCat !== undefined ? newCat : categoryId;
    router.get('/reports/product-velocity', { days: d, category_id: c }, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="Cek Produk Hero & Slow — Pergerakan Penjualan" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cek Produk Hero & Slow Moving</h1>
          <p className="text-sm text-slate-400 mt-0.5">Analisis kecepatan perputaran barang (Product Velocity) untuk mengidentifikasi produk terlaris (Hero), lambat (Slow), dan Dead Stock</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div onClick={() => setActiveTab('hero')} className={`p-4 rounded-2xl border shadow-xl cursor-pointer transition-all ${activeTab === 'hero' ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/40' : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'}`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">🔥 Produk Hero (Terlaris)</span>
            <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{summary.hero_count} Varian</span>
          </div>
          <p className="text-2xl font-extrabold text-white mt-2">Top Performance</p>
          <p className="text-xs text-slate-400 mt-1">Produk dengan volume penjualan tertinggi dalam periode dipilih</p>
        </div>

        <div onClick={() => setActiveTab('slow')} className={`p-4 rounded-2xl border shadow-xl cursor-pointer transition-all ${activeTab === 'slow' ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/40' : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'}`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">🐢 Slow Moving</span>
            <span className="text-xs font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">{summary.slow_count} Varian</span>
          </div>
          <p className="text-2xl font-extrabold text-white mt-2">Penjualan Lambat</p>
          <p className="text-xs text-slate-400 mt-1">Produk yang memiliki penjualan sedikit (1–5 unit)</p>
        </div>

        <div onClick={() => setActiveTab('dead')} className={`p-4 rounded-2xl border shadow-xl cursor-pointer transition-all ${activeTab === 'dead' ? 'bg-rose-500/10 border-rose-500/40 ring-1 ring-rose-500/40' : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'}`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">❄️ Dead Stock</span>
            <span className="text-xs font-bold bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">{summary.dead_stock_count} Varian</span>
          </div>
          <p className="text-2xl font-extrabold text-white mt-2">Stok Mengendap</p>
          <p className="text-xs text-slate-400 mt-1">Stok fisik masih ada namun 0 penjualan dalam periode ini</p>
        </div>
      </div>

      {/* Filters & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        {/* Tabs */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('hero')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'hero' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            🔥 Hero (Fast Moving)
          </button>
          <button
            onClick={() => setActiveTab('slow')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'slow' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            🐢 Slow Moving
          </button>
          <button
            onClick={() => setActiveTab('dead')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'dead' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            ❄️ Dead Stock
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => { const d = Number(e.target.value); setDays(d); applyFilter(d, categoryId); }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none"
          >
            <option value={30}>Periode 30 Hari Terakhir</option>
            <option value={60}>Periode 60 Hari Terakhir</option>
            <option value={90}>Periode 90 Hari Terakhir</option>
            <option value={180}>Periode 6 Bulan Terakhir</option>
            <option value={365}>Periode 1 Tahun Terakhir</option>
          </select>

          <select
            value={categoryId}
            onChange={(e) => { const c = e.target.value; setCategoryId(c); applyFilter(days, c); }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
          >
            <option value="">Semua Kategori</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                <th className="py-3.5 px-5 text-center">Rank</th>
                <th className="py-3.5 px-4">SKU</th>
                <th className="py-3.5 px-4">Nama Produk</th>
                <th className="py-3.5 px-4">Kategori</th>
                <th className="py-3.5 px-4 text-center">Stok Fisik Gudang</th>
                <th className="py-3.5 px-4 text-center text-amber-400">Total Qty Terjual</th>
                <th className="py-3.5 px-4 text-right text-emerald-400">Total Nilai Penjualan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
              {activeTab === 'hero' && heroProducts.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">Belum ada produk hero di periode ini.</td></tr>
              )}
              {activeTab === 'slow' && slowProducts.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">Tidak ada produk slow moving di periode ini.</td></tr>
              )}
              {activeTab === 'dead' && deadStockProducts.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">Tidak ada dead stock ditemukan. All stock bergerak dengan baik!</td></tr>
              )}

              {(activeTab === 'hero' ? heroProducts : activeTab === 'slow' ? slowProducts : deadStockProducts).map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="py-3.5 px-5 text-center font-bold text-slate-400">#{idx + 1}</td>
                  <td className="py-3.5 px-4 font-mono text-xs font-bold text-amber-400">{item.sku}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-200">
                    {item.name}
                    {item.brand && <span className="text-[10px] text-slate-500 block">{item.brand}</span>}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{item.category?.name ?? '—'}</td>
                  <td className="py-3.5 px-4 text-center font-bold text-slate-200">
                    {fmt(item.stock)} <span className="text-[10px] text-slate-500">{item.unit || 'pcs'}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-extrabold text-amber-400">
                    {fmt(item.total_sold_qty)} {item.unit || 'pcs'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-extrabold text-emerald-400">
                    Rp {fmt(item.total_sold_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
