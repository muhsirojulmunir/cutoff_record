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

  return (
    <AppLayout>
      <Head title="Stok Produk Shopee (SKU & Stok) - Koding ERP" />

      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Flash Notification */}
        {flash?.success && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{flash.success}</span>
            </div>
          </div>
        )}
        {flash?.error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>{flash.error}</span>
            </div>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-orange-500/10 text-[#EE4D2D] border border-orange-500/20 shadow-2xs">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Stok Produk Shopee</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Daftar katalog SKU variasi produk dan kuantitas stok fisik tersedia dari Shopee Open Platform.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-98"
              title="Download seluruh SKU & Stok ke file CSV / Excel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                isSyncing
                  ? 'bg-orange-600/50 text-white cursor-not-allowed'
                  : 'bg-[#EE4D2D] hover:bg-[#d43f20] text-white cursor-pointer active:scale-98'
              }`}
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Menarik Stok dari Shopee...</span>
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

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total SKU Variasi</div>
            <div className="text-2xl font-bold text-white mt-1.5 font-mono">
              {summary.total_skus.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Item aktif terdaftar di Shopee</div>
          </div>

          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-orange-400">Total Stok Fisik</div>
            <div className="text-2xl font-bold text-orange-400 mt-1.5 font-mono">
              {summary.total_stock.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-500">pcs</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Stok tersedia untuk dijual</div>
          </div>

          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">SKU Ada Stok</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1.5 font-mono">
              {summary.in_stock_skus.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Stok &gt; 0 pcs</div>
          </div>

          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">SKU Stok Habis</div>
            <div className="text-2xl font-bold text-rose-400 mt-1.5 font-mono">
              {summary.out_of_stock_skus.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Stok kosong (0 pcs)</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, nama produk, atau ID..."
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 pr-9 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    handleFilter('', stockStatus, sort);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
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
              className="px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
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
              className="px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="stock_desc">Urutkan: Stok Terbanyak</option>
              <option value="stock_asc">Urutkan: Stok Tersedikit</option>
              <option value="sku_asc">Urutkan: SKU (A-Z)</option>
              <option value="name_asc">Urutkan: Nama Produk (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl shadow-xs overflow-hidden">
          {products.data.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <span className="p-3 rounded-2xl bg-slate-900 text-slate-500 inline-block border border-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-slate-300">Belum Ada Data Produk Shopee</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Silakan klik tombol <strong>"Tarik Stok Shopee (API)"</strong> di atas untuk menyinkronkan seluruh SKU dan kuantitas stok dari toko Shopee Anda.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/30 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-900">
                    <th className="py-3.5 px-4 w-12 text-center">No</th>
                    <th className="py-3.5 px-4">SKU Utama / Variasi</th>
                    <th className="py-3.5 px-4">Nama Produk</th>
                    <th className="py-3.5 px-4">Variasi / Model</th>
                    <th className="py-3.5 px-4 text-right">Stok Tersedia</th>
                    <th className="py-3.5 px-4 text-right">Stok Terkunci</th>
                    <th className="py-3.5 px-4 text-right">Harga</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4">Terakhir Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 font-sans">
                  {products.data.map((p, idx) => {
                    const rowNo = (products.current_page - 1) * products.per_page + idx + 1;
                    const hasStock = p.stock > 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-500">{rowNo}</td>

                        {/* SKU */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-violet-400 select-all tracking-tight">
                            {p.sku || <span className="text-slate-600 font-normal italic">— tanpa SKU —</span>}
                          </span>
                        </td>

                        {/* Nama Produk */}
                        <td className="py-3 px-4 max-w-sm">
                          <div className="font-semibold text-slate-200 truncate" title={p.item_name}>
                            {p.item_name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Item ID: {p.item_id}
                          </div>
                        </td>

                        {/* Variasi */}
                        <td className="py-3 px-4">
                          {p.model_name ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-slate-900 text-slate-300 text-[11px] font-medium border border-slate-800">
                              {p.model_name}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Single (Tanpa Variasi)</span>
                          )}
                        </td>

                        {/* Stok Tersedia */}
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                              hasStock
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {p.stock.toLocaleString('id-ID')}
                          </span>
                        </td>

                        {/* Stok Terkunci */}
                        <td className="py-3 px-4 text-right font-mono text-slate-400">
                          {p.reserved_stock.toLocaleString('id-ID')}
                        </td>

                        {/* Harga */}
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          Rp {Math.round(Number(p.price) || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {p.item_status || 'NORMAL'}
                          </span>
                        </td>

                        {/* Terakhir Sync */}
                        <td className="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                          {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString('id-ID') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar */}
          {products.last_page > 1 && (
            <div className="p-4 bg-slate-900/20 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div>
                Menampilkan{' '}
                <strong className="text-white">
                  {(products.current_page - 1) * products.per_page + 1}
                </strong>{' '}
                s/d{' '}
                <strong className="text-white">
                  {Math.min(products.current_page * products.per_page, products.total)}
                </strong>{' '}
                dari <strong className="text-white">{products.total.toLocaleString('id-ID')}</strong> SKU
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {products.links.map((link, i) => {
                  if (!link.url) {
                    return (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg text-slate-600 bg-slate-900/50 cursor-not-allowed"
                        dangerouslySetInnerHTML={{ __html: link.label }}
                      />
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => router.get(link.url!, {}, { preserveScroll: true, preserveState: true })}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                        link.active
                          ? 'bg-violet-600 text-white font-bold'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
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
