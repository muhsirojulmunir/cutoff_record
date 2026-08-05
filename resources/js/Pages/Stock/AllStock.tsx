import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import DownloadHistory from '../../Components/DownloadHistory';

interface Category { id: number; name: string; }
interface ProductItem {
  id: number;
  sku: string;
  name: string;
  category_name: string;
  stock: number;
  photo_url: string | null;
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
  total_products: number;
  total_physical_stock: number;
  snapshot_date: string | null;
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
  filters: { search?: string; category_id?: string; date?: string };
  summary: Summary;
}) {
  const [search, setSearch] = useState(filters.search ?? '');
  const [categoryId, setCategoryId] = useState(filters.category_id ?? '');
  const [date, setDate] = useState(filters.date ?? '');

  function applyFilter() {
    router.get('/all-stock', { search, category_id: categoryId, date }, { preserveState: true });
  }

  function resetFilter() {
    setSearch('');
    setCategoryId('');
    setDate('');
    router.get('/all-stock', {}, { preserveState: true });
  }

  function setTodayDate() {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    router.get('/all-stock', { search, category_id: categoryId, date: today }, { preserveState: true });
  }

  const [historyKey, setHistoryKey] = useState(0);

  function handleExportExcel() {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (categoryId) params.append('category_id', categoryId);
    if (date) params.append('date', date);
    window.location.href = `/all-stock/export?${params.toString()}`;

    // Riwayat dicatat di server; beri jeda sebentar agar barisnya sudah ada
    // saat panel menyegarkan diri.
    window.setTimeout(() => setHistoryKey((k) => k + 1), 1200);
  }

  return (
    <AppLayout>
      <Head title="All Stock — Stok Produk" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Daftar stok produk real-time dan histori stok per tanggal
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
        <DownloadHistory refreshKey={historyKey} />
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-200/40 transition-all shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export Excel (Semua Stok)
        </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Varian Produk</p>
            <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-gray-900 mt-2 font-mono">{fmt(summary.total_products)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {summary.snapshot_date ? `Total Stok (Per ${summary.snapshot_date})` : 'Total Stok Real-time'}
              </p>
              {summary.snapshot_date && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md mt-1 border border-amber-200">
                  📌 Histori Tanggal {summary.snapshot_date}
                </span>
              )}
            </div>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-teal-600 mt-2 font-mono">{fmt(summary.total_physical_stock)}</p>
        </div>
      </div>

      {/* Filters & History Date Picker */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-6 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Filter & History Tanggal</p>
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[220px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
              placeholder="Cari SKU / Nama Produk..."
              className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Category Filter */}
          <div className="min-w-[180px]">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* History Date Filter */}
          <div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              title="Pilih tanggal untuk mengecek histori stok pada tanggal tersebut"
              className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            onClick={applyFilter}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
          >
            Tampilkan
          </button>
          <button
            onClick={setTodayDate}
            className="px-4 py-2 bg-white text-violet-700 rounded-xl text-sm font-semibold border border-violet-200 hover:bg-violet-50 transition-all"
          >
            Hari Ini
          </button>
          {(filters.search || filters.category_id || filters.date) && (
            <button
              onClick={resetFilter}
              className="px-4 py-2 bg-white text-gray-500 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table: HANYA SKU, NAMA PRODUK, DAN STOK */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-6 whitespace-nowrap w-48">SKU</th>
                <th className="py-3.5 px-6">Nama Produk</th>
                <th className="py-3.5 px-6 text-center whitespace-nowrap w-48">
                  {summary.snapshot_date ? `Stok Per ${summary.snapshot_date}` : 'Stok'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {products.data.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-gray-400">
                    Tidak ada data stok produk ditemukan.
                  </td>
                </tr>
              )}
              {products.data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3.5 px-6 font-mono text-xs font-bold text-violet-600 whitespace-nowrap">{item.sku}</td>
                  <td className="py-3.5 px-6 font-semibold text-gray-800">{item.name}</td>
                  <td className="py-3.5 px-6 text-center font-extrabold text-gray-900 font-mono text-sm whitespace-nowrap">
                    <span className={`inline-flex px-3 py-1 rounded-full ${item.stock > 0 ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                      {fmt(item.stock)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {products.total > 0 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Menampilkan {products.from}–{products.to} dari {products.total} varian produk</span>
            <div className="flex gap-2">
              {products.current_page > 1 && (
                <button
                  onClick={() => router.get('/all-stock', { ...filters, page: products.current_page - 1 })}
                  className="px-3 py-1.5 bg-white rounded-lg hover:bg-gray-50 border border-gray-200 text-gray-700 transition-all font-medium"
                >
                  ← Sebelumnya
                </button>
              )}
              {products.current_page < products.last_page && (
                <button
                  onClick={() => router.get('/all-stock', { ...filters, page: products.current_page + 1 })}
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
