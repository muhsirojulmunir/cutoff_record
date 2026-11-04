import React, { useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface ProductItem {
  id: number;
  item_id: number;
  model_id: number | null;
  item_name: string;
  model_name: string | null;
  sku: string | null;
  stock: number;
  reserved_stock: number;
  price: string | number;
  item_status: string;
  has_model: boolean;
  last_synced_at: string | null;
}

interface PaginationLinks {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginatedProducts {
  data: ProductItem[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: PaginationLinks[];
}

interface SummaryData {
  total_skus: number;
  total_stock: number;
  in_stock_skus: number;
  out_of_stock_skus: number;
  last_synced_at: string | null;
}

interface Props {
  products: PaginatedProducts;
  filters: {
    search: string;
    stock_status: string;
    sort: string;
  };
  summary: SummaryData;
  account: {
    id: number;
    account_name: string;
    shop_id: string | null;
    is_connected: boolean;
  } | null;
}

export default function ShopeeProductsIndex({ products, filters, summary, account }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [stockStatus, setStockStatus] = useState(filters.stock_status ?? 'all');
  const [sort, setSort] = useState(filters.sort ?? 'stock_desc');
  const [isSyncing, setIsSyncing] = useState(false);

  function handleFilter(newSearch = search, newStatus = stockStatus, newSort = sort) {
    router.get(
      '/shopee-products',
      {
        search: newSearch || undefined,
        stock_status: newStatus !== 'all' ? newStatus : undefined,
        sort: newSort !== 'stock_desc' ? newSort : undefined,
      },
      {
        preserveState: true,
        preserveScroll: true,
      }
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleFilter(search, stockStatus, sort);
  }

  function handleSync() {
    if (!account?.is_connected) {
      alert('Toko Shopee belum terhubung dengan token aktif. Harap hubungkan toko terlebih dahulu di menu Integrasi Shopee.');
      return;
    }

    if (
      !confirm(
        'Tarik seluruh data produk, SKU, dan stok fisik dari Shopee sekarang?\n\nSistem akan mengambil seluruh produk aktif dari toko Shopee Anda dan memperbarui stok terkini.'
      )
    ) {
      return;
    }

    setIsSyncing(true);
    router.post(
      '/shopee-products/sync',
      {},
      {
        preserveScroll: true,
        onFinish: () => setIsSyncing(false),
      }
    );
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (stockStatus !== 'all') params.set('stock_status', stockStatus);
    if (sort !== 'stock_desc') params.set('sort', sort);

    window.location.href = `/shopee-products/export?${params.toString()}`;
  }

  const isConnected = Boolean(account?.is_connected);

  return (
    <AppLayout>
      <Head title="Stok Produk Shopee - Koding ERP" />

      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Flash Notifications */}
        {flash?.success && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{flash.success}</span>
            </div>
          </div>
        )}
        {flash?.error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>{flash.error}</span>
            </div>
          </div>
        )}

        {/* Header Title Banner - Konsisten dengan Cut Off & Returan */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>Stok Produk Shopee</span>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Terhubung
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Belum Terhubung
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Kelola dan pantau {(summary?.total_skus ?? 0).toLocaleString('id-ID')} SKU variasi produk aktif dan kuantitas stok fisik dari Shopee Open Platform.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Export CSV / Excel */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
              title="Download seluruh data SKU & Stok ke file CSV / Excel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>Export CSV</span>
            </button>

            {/* Tarik Stok Shopee (API) */}
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap active:scale-98 ${
                isSyncing
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-[#EE4D2D] hover:bg-[#d83f21] text-white'
              }`}
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Menarik Stok Shopee...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  <span>Tarik Stok Shopee (API)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4 Metric Summary Cards - Konsisten dengan Cut Off */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total SKU */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total SKU Variasi</span>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3 font-mono">
              {(summary?.total_skus ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Item SKU terdaftar di Shopee</p>
          </div>

          {/* Card 2: Total Stok Fisik */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Stok Fisik</span>
              <span className="p-2 bg-orange-50 text-[#EE4D2D] rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-[#EE4D2D] mt-3 font-mono">
              {(summary?.total_stock ?? 0).toLocaleString('id-ID')}{' '}
              <span className="text-xs font-normal text-slate-500">pcs</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Stok tersedia untuk dijual</p>
          </div>

          {/* Card 3: SKU Ada Stok */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">SKU Ready / Ada Stok</span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 mt-3 font-mono">
              {(summary?.in_stock_skus ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Stok &gt; 0 pcs siap kirim</p>
          </div>

          {/* Card 4: SKU Stok Habis (OOS) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Stok Habis (OOS)</span>
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-rose-600 mt-3 font-mono">
              {(summary?.out_of_stock_skus ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Stok kosong (0 pcs) di Shopee</p>
          </div>
        </div>

        {/* Filter and Search Bar - Konsisten dengan Cut Off */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, Nama Barang, atau Item ID..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B] pr-9 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    handleFilter('', stockStatus, sort);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Cari
            </button>
          </form>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Filter Status Stok */}
            <select
              value={stockStatus}
              onChange={(e) => {
                const val = e.target.value;
                setStockStatus(val);
                handleFilter(search, val, sort);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B] cursor-pointer"
            >
              <option value="all">Semua Status Stok</option>
              <option value="in_stock">Ada Stok (&gt; 0)</option>
              <option value="out_of_stock">Stok Habis (0)</option>
            </select>

            {/* Sort Selector */}
            <select
              value={sort}
              onChange={(e) => {
                const val = e.target.value;
                setSort(val);
                handleFilter(search, stockStatus, val);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B] cursor-pointer"
            >
              <option value="stock_desc">Urutkan: Stok Terbanyak</option>
              <option value="stock_asc">Urutkan: Stok Tersedikit</option>
              <option value="sku_asc">Urutkan: SKU (A-Z)</option>
              <option value="name_asc">Urutkan: Nama Produk (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Data Table Container - Konsisten dengan Cut Off & Returan */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {products.data.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Tabel Stok Produk Shopee Kosong</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Silakan klik tombol <strong className="text-[#EE4D2D]">"Tarik Stok Shopee (API)"</strong> di atas untuk mengambil data SKU dan kuantitas stok produk terkini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap">
                    <th className="py-3 px-3 text-center w-12">No</th>
                    <th className="py-3 px-4">SKU Utama / Variasi</th>
                    <th className="py-3 px-4">Nama Barang</th>
                    <th className="py-3 px-4">Variasi / Model</th>
                    <th className="py-3 px-4 text-right">Stok Tersedia</th>
                    <th className="py-3 px-4 text-right">Stok Terkunci</th>
                    <th className="py-3 px-4 text-right">Harga</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Terakhir Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {products.data.map((p, idx) => {
                    const rowNumber = (products.current_page - 1) * products.per_page + idx + 1;
                    const hasStock = (p.stock ?? 0) > 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-3 text-center text-xs font-bold text-slate-500 whitespace-nowrap">
                          {rowNumber}
                        </td>

                        {/* SKU */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {p.sku ? (
                            <span className="font-mono font-bold text-slate-900 select-all tracking-tight">
                              {p.sku}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">— tanpa SKU —</span>
                          )}
                        </td>

                        {/* Nama Produk */}
                        <td className="py-3.5 px-4 max-w-md">
                          <p className="font-semibold text-slate-900 line-clamp-1" title={p.item_name}>
                            {p.item_name}
                          </p>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            ID Produk: {p.item_id}
                          </div>
                        </td>

                        {/* Variasi */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {p.model_name ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                              {p.model_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Single (Tanpa Variasi)</span>
                          )}
                        </td>

                        {/* Stok Tersedia */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                              hasStock
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {(p.stock ?? 0).toLocaleString('id-ID')}
                          </span>
                        </td>

                        {/* Stok Terkunci */}
                        <td className="py-3.5 px-4 text-right font-mono text-slate-500 whitespace-nowrap">
                          {(p.reserved_stock ?? 0).toLocaleString('id-ID')}
                        </td>

                        {/* Harga */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          Rp {Math.round(Number(p.price) || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                            {p.item_status || 'NORMAL'}
                          </span>
                        </td>

                        {/* Terakhir Sync */}
                        <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                          {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString('id-ID') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar - Konsisten dengan Cut Off */}
          {products.last_page > 1 && (
            <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Menampilkan{' '}
                <strong className="text-slate-900 font-bold">
                  {(products.current_page - 1) * products.per_page + 1}
                </strong>{' '}
                s/d{' '}
                <strong className="text-slate-900 font-bold">
                  {Math.min(products.current_page * products.per_page, products.total)}
                </strong>{' '}
                dari <strong className="text-slate-900 font-bold">{products.total.toLocaleString('id-ID')}</strong> SKU
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {products.links.map((link, i) => {
                  if (!link.url) {
                    return (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed"
                        dangerouslySetInnerHTML={{ __html: link.label }}
                      />
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => router.get(link.url!, {}, { preserveScroll: true, preserveState: true })}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer border ${
                        link.active
                          ? 'bg-[#0B132B] text-white border-[#0B132B] font-bold'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
