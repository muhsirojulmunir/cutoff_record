import React, { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';
import DualCalendarRangePicker, { formatDateIndo, formatYMD } from '../../Components/DualCalendarRangePicker';

interface ShopeeAccountData {
  id: number;
  account_name: string;
  shop_id: string | null;
  partner_id: string | null;
  status: string;
  connection_status: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  has_credentials: boolean;
  has_tokens: boolean;
}

interface Props {
  account: ShopeeAccountData;
  callbackUrl: string;
  productSummary?: {
    total_skus: number;
    total_stock: number;
    last_synced_at: string | null;
  };
}

export default function ShopeeIndex({ account, callbackUrl, productSummary }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [showPartnerKey, setShowPartnerKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // State untuk Sinkronisasi Produk & Stok
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productPagination, setProductPagination] = useState<any>(null);

  // Default rentang tanggal: 14 hari terakhir sampai hari ini
  const now = new Date();
  const defaultEnd = formatYMD(now.getFullYear(), now.getMonth(), now.getDate());
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 13);
  const defaultStart = formatYMD(d14.getFullYear(), d14.getMonth(), d14.getDate());

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingReturns, setSyncingReturns] = useState(false);
  const [testing, setTesting] = useState(false);

  // Menghitung jumlah hari dari rentang terpilih
  const getDaysCount = (s: string, e: string): number => {
    if (!s || !e) return 0;
    const diff = new Date(e).getTime() - new Date(s).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  const { data, setData, post, processing, errors } = useForm({
    account_name: account.account_name || 'Toko Shopee Utama',
    partner_id: account.partner_id || '',
    partner_key: '',
    shop_id: account.shop_id || '',
  });

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    post('/marketplace/shopee/credentials', {
      preserveScroll: true,
    });
  };

  const handleConnectShop = () => {
    window.location.href = '/marketplace/shopee/auth';
  };

  const handleTestConnection = () => {
    setTesting(true);
    router.post(
      '/marketplace/shopee/test-connection',
      {},
      {
        preserveScroll: true,
        onFinish: () => setTesting(false),
      }
    );
  };

  const handleSyncNow = () => {
    if (!startDate || !endDate) {
      alert('Silakan tentukan Rentang Tanggal terlebih dahulu.');
      return;
    }

    setSyncing(true);
    router.post(
      '/marketplace/shopee/sync-now',
      { start_date: startDate, end_date: endDate },
      {
        preserveScroll: true,
        onFinish: () => setSyncing(false),
      }
    );
  };

  const handleSyncReturns = () => {
    if (!startDate || !endDate) {
      alert('Silakan tentukan Rentang Tanggal terlebih dahulu.');
      return;
    }

    setSyncingReturns(true);
    router.post(
      '/marketplace/shopee/sync-returns',
      { start_date: startDate, end_date: endDate },
      {
        preserveScroll: true,
        onFinish: () => setSyncingReturns(false),
      }
    );
  };

  const handleCopyCallback = () => {
    navigator.clipboard.writeText(callbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncProducts = () => {
    if (!confirm('Tarik data seluruh produk, SKU, dan stok dari Shopee sekarang?\n\nSistem akan mengambil semua produk aktif dan menyimpan rincian SKU serta stok ke database.')) {
      return;
    }
    setSyncingProducts(true);
    router.post(
      '/marketplace/shopee/sync-products',
      {},
      {
        preserveScroll: true,
        onFinish: () => setSyncingProducts(false),
      }
    );
  };

  const fetchProducts = async (page = 1, search = '') => {
    setLoadingProducts(true);
    try {
      const res = await fetch(`/marketplace/shopee/products?page=${page}&search=${encodeURIComponent(search)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      setProductsList(data.data || []);
      setProductPagination(data);
    } catch (e) {
      console.error('Gagal mengambil daftar produk:', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleOpenProductModal = () => {
    setShowProductModal(true);
    fetchProducts(1, productSearch);
  };

  const handleSearchProduct = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(1, productSearch);
  };

  const handleExportProductsCsv = () => {
    if (!productsList || productsList.length === 0) {
      alert('Tidak ada data produk untuk diexport.');
      return;
    }

    const headers = ['SKU', 'Nama Produk', 'Variasi', 'Stok Tersedia', 'Stok Terkunci', 'Harga (Rp)', 'Status', 'Terakhir Sync'];
    const rows = productsList.map((p) => [
      `"${(p.sku || '').replace(/"/g, '""')}"`,
      `"${(p.item_name || '').replace(/"/g, '""')}"`,
      `"${(p.model_name || '').replace(/"/g, '""')}"`,
      p.stock ?? 0,
      p.reserved_stock ?? 0,
      p.price ?? 0,
      `"${p.item_status || 'NORMAL'}"`,
      `"${p.last_synced_at || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shopee_sku_stock_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isConnected = account.connection_status === 'connected';

  return (
    <AppLayout>
      <Head title="Integrasi Shopee Open API v2 - Koding ERP" />

      <div className="space-y-6 max-w-6xl mx-auto pb-10">
        {/* Flash Notifications */}
        {flash?.success && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{flash.success}</span>
            </div>
          </div>
        )}

        {flash?.error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-rose-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{flash.error}</span>
            </div>
          </div>
        )}

        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#070D1E] via-[#0B132B] to-[#132043] rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden border border-slate-800">
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="p-2 rounded-xl bg-[#EE4D2D] text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M19.5 7.5h-2.25V6a5.25 5.25 0 00-10.5 0v1.5H4.5A2.25 2.25 0 002.25 9.75v10.5A2.25 2.25 0 004.5 22.5h15a2.25 2.25 0 002.25-2.25V9.75A2.25 2.25 0 0019.5 7.5zm-10.5-1.5a3.75 3.75 0 017.5 0v1.5h-7.5V6zm10.5 15H4.5V9.75h15V21z" />
                  </svg>
                </span>
                <h1 className="text-2xl font-extrabold tracking-tight">
                  Integrasi Shopee Open API v2
                </h1>
                {isConnected ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Terhubung (Shop ID: {account.shop_id || '-'})
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-700/60 text-slate-300 border border-slate-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Belum Terhubung
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
                Hubungkan toko Shopee Anda menggunakan kredensial resmi Shopee Open Platform. Pesanan akan otomatis ditarik dan disinkronkan langsung ke tabel Pesanan Cut Off.
              </p>
            </div>
          </div>
        </div>

        {/* 2 Main Columns: Credentials & Sync Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: API Credentials Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-700">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                Pengaturan Kredensial Shopee
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Masukkan Partner ID dan Partner Key yang didapatkan dari Shopee Open Platform Console setelah peninjauan profil selesai.
              </p>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Akun / Toko:
                </label>
                <input
                  type="text"
                  value={data.account_name}
                  onChange={(e) => setData('account_name', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 focus:outline-none focus:border-[#0B132B]"
                  placeholder="Contoh: Toko Shopee Utama"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Partner ID:
                </label>
                <input
                  type="text"
                  value={data.partner_id}
                  onChange={(e) => setData('partner_id', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 font-mono focus:outline-none focus:border-[#0B132B]"
                  placeholder="Contoh: 1234567"
                  required
                />
                {errors.partner_id && <p className="text-[11px] text-rose-600 mt-1">{errors.partner_id}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Partner Key (Secret):
                </label>
                <div className="relative">
                  <input
                    type={showPartnerKey ? 'text' : 'password'}
                    value={data.partner_key}
                    onChange={(e) => setData('partner_key', e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 font-mono focus:outline-none focus:border-[#0B132B] pr-10"
                    placeholder={account.has_credentials ? '•••••••• (Tersimpan - masukkan untuk mengubah)' : 'Masukkan Partner Key'}
                    required={!account.has_credentials}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPartnerKey(!showPartnerKey)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    {showPartnerKey ? 'Tutup' : 'Lihat'}
                  </button>
                </div>
                {errors.partner_key && <p className="text-[11px] text-rose-600 mt-1">{errors.partner_key}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Shop ID (Opsional):
                </label>
                <input
                  type="text"
                  value={data.shop_id}
                  onChange={(e) => setData('shop_id', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-300 font-mono focus:outline-none focus:border-[#0B132B]"
                  placeholder="ID Toko Shopee (akan otomatis terisi saat OAuth)"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B132B] hover:bg-slate-800 text-white shadow-xs transition-colors cursor-pointer"
                >
                  {processing ? 'Menyimpan...' : 'Simpan Kredensial'}
                </button>

                {account.has_credentials && (
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    {testing ? 'Menguji...' : 'Test Koneksi'}
                  </button>
                )}
              </div>
            </form>

            {/* OAuth Connect Action */}
            <div className="pt-4 border-t border-slate-100">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Otorisasi Toko (OAuth)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Klik untuk membuka halaman login penjual Shopee dan memberikan izin sinkronisasi.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConnectShop}
                  disabled={!account.has_credentials}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all ${
                    account.has_credentials
                      ? 'bg-[#EE4D2D] hover:bg-[#d63f20] text-white cursor-pointer active:scale-98'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  {isConnected ? 'Hubungkan Ulang Toko Shopee' : 'Hubungkan Toko Shopee Sekarang'}
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Sync Orders & Callback Info */}
          <div className="space-y-6">
            {/* Sync Action Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-700">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Tarik Data Pesanan Shopee
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Ambil pesanan terbaru dari Shopee secara langsung ke tabel Pesanan Cut Off.
                </p>
              </div>

              {/* Sync Range Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Rentang Waktu Tarik Data Shopee:
                  </label>
                  <span className="text-[11px] font-bold text-[#EE4D2D]">
                    {getDaysCount(startDate, endDate)} Hari Terpilih
                  </span>
                </div>

                {/* Preset Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Hari Ini', days: 1 },
                    { label: '7 Hari Terakhir', days: 7 },
                    { label: '14 Hari (Cepat)', days: 14 },
                    { label: '30 Hari (1 Bln)', days: 30 },
                  ].map((preset) => {
                    const isSelected = getDaysCount(startDate, endDate) === preset.days && endDate === defaultEnd;
                    return (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => {
                          const sObj = new Date();
                          sObj.setDate(sObj.getDate() - (preset.days - 1));
                          const s = formatYMD(sObj.getFullYear(), sObj.getMonth(), sObj.getDate());
                          setStartDate(s);
                          setEndDate(defaultEnd);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#0B132B] text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Interactive Visual Date Range Trigger Bar & Dual Calendar */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 hover:border-slate-300 rounded-xl text-left transition-all cursor-pointer group shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="p-2 rounded-xl bg-white border border-slate-200 text-[#EE4D2D] group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Pilih Rentang di Kalender (Klik untuk Buka/Tutup)
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                          {formatDateIndo(startDate)} — {formatDateIndo(endDate)}
                          <span className="ml-2 text-[11px] font-bold text-[#EE4D2D]">
                            ({getDaysCount(startDate, endDate)} hari)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                      <span className="text-[11px] font-bold text-[#EE4D2D] hidden sm:inline">
                        {isCalendarOpen ? 'Tutup Kalender' : 'Buka Kalender'}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className={`w-4 h-4 text-slate-500 transition-transform ${isCalendarOpen ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Dual Calendar Range Picker Popover */}
                  <DualCalendarRangePicker
                    initialStartDate={startDate}
                    initialEndDate={endDate}
                    isOpen={isCalendarOpen}
                    onClose={() => setIsCalendarOpen(false)}
                    onApply={(start, end) => {
                      setStartDate(start);
                      setEndDate(end);
                    }}
                    align="right"
                  />
                </div>
              </div>

              {/* Tips Anti-Timeout */}
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                <span className="font-bold text-blue-800">💡 Tips Penarikan Data:</span> Jika Anda ingin menarik data riwayat panjang, sangat disarankan menarik per <strong>14 atau 30 hari</strong> via kalender. Setiap kali ditarik, sistem otomatis menyimpan dan memperbarui pesanan tanpa membuat duplikasi.
              </div>

              {/* Trigger Button: Tarik Pesanan */}
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing || !isConnected}
                className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all ${
                  isConnected && !syncing
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sedang Menarik Pesanan dari Shopee API...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Tarik Pesanan ({formatDateIndo(startDate)} s/d {formatDateIndo(endDate)})
                  </>
                )}
              </button>

              {/* Trigger Return Sync Button */}
              <button
                type="button"
                onClick={handleSyncReturns}
                disabled={syncingReturns || !isConnected}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                  isConnected && !syncingReturns
                    ? 'border-orange-300 bg-orange-50 hover:bg-orange-100 text-[#EE4D2D] cursor-pointer active:scale-98'
                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {syncingReturns ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#EE4D2D]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sedang Menarik Data Retur dari Shopee...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#EE4D2D]">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.53 5.47a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v5.69a.75.75 0 001.5 0v-5.69l1.72 1.72a.75.75 0 101.06-1.06l-3-3z" clipRule="evenodd" />
                    </svg>
                    Tarik Data Retur Shopee ({formatDateIndo(startDate)} s/d {formatDateIndo(endDate)})
                  </>
                )}
              </button>

              {/* Last Sync Info */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Terakhir Sinkronisasi:</span>
                  <span className="font-semibold text-slate-800">
                    {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString('id-ID') : 'Belum pernah'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status Terakhir:</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {account.last_sync_status || '-'}
                  </span>
                </div>
                {account.last_sync_error && (
                  <div className="pt-1 text-[11px] text-rose-600 font-medium">
                    Catatan: {account.last_sync_error}
                  </div>
                )}
              </div>
            </div>

            {/* Shopee Product & Stock Sync Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-orange-50 text-[#EE4D2D] border border-orange-200">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </span>
                  Data Produk & Stok Shopee (SKU & Stok)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Ambil data seluruh produk aktif, SKU variasi, dan jumlah stok tersedia langsung dari Shopee Open Platform.
                </p>
              </div>

              {/* Product Summary Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total SKU Tersimpan</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {productSummary?.total_skus?.toLocaleString('id-ID') ?? 0} <span className="text-xs font-normal text-slate-500">SKU</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-orange-50/60 border border-orange-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Total Stok Tersedia</div>
                  <div className="text-lg font-bold text-[#EE4D2D] mt-0.5">
                    {productSummary?.total_stock?.toLocaleString('id-ID') ?? 0} <span className="text-xs font-normal text-orange-500">pcs</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSyncProducts}
                  disabled={syncingProducts || !isConnected}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    isConnected && !syncingProducts
                      ? 'bg-[#EE4D2D] hover:bg-[#d43f20] text-white shadow-xs cursor-pointer active:scale-98'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {syncingProducts ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Menarik SKU & Stok dari Shopee...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Tarik Produk & Stok Shopee
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenProductModal}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Lihat SKU & Stok ({productSummary?.total_skus ?? 0})
                </button>
              </div>

              {productSummary?.last_synced_at && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-1">
                  <span>🕒 Terakhir sinkron produk:</span>
                  <span className="font-semibold text-slate-700">
                    {new Date(productSummary.last_synced_at).toLocaleString('id-ID')}
                  </span>
                </div>
              )}
            </div>

            {/* Callback URL Info Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                Callback / Redirect URL untuk Shopee Console
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Jika di Shopee Developer Console diminta memasukkan <strong>Redirect URL</strong> / <strong>Authorization Callback URL</strong>, masukkan URL sistem ini:
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={callbackUrl}
                  className="flex-1 px-3 py-2 rounded-xl text-xs border border-slate-300 bg-slate-50 font-mono text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyCallback}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0 cursor-pointer"
                >
                  {copied ? 'Tersalin!' : 'Salin URL'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Daftar SKU & Stok Produk Shopee */}
        {showProductModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-200">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Daftar SKU & Stok Produk Shopee
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Total {productPagination?.total ?? productsList.length} SKU variasi tersimpan dari toko Shopee
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Filter & Search Bar */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row gap-3 items-center justify-between">
                <form onSubmit={handleSearchProduct} className="flex items-center gap-2 w-full sm:w-96">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Cari SKU, Nama Produk, atau Item ID..."
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
                  >
                    Cari
                  </button>
                </form>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={handleExportProductsCsv}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download CSV
                  </button>
                </div>
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingProducts ? (
                  <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                    <svg className="animate-spin h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Memuat data SKU & Stok dari database...</span>
                  </div>
                ) : productsList.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-xs">
                    Belum ada data produk tersimpan. Klik tombol <strong className="text-orange-400">"Tarik Produk & Stok Shopee"</strong> untuk menyinkronkan data.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/60 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-3 px-3 w-12 text-center">No</th>
                          <th className="py-3 px-3">SKU</th>
                          <th className="py-3 px-4">Nama Produk</th>
                          <th className="py-3 px-3">Variasi / Model</th>
                          <th className="py-3 px-3 text-right">Stok Tersedia</th>
                          <th className="py-3 px-3 text-right">Stok Terkunci</th>
                          <th className="py-3 px-3 text-right">Harga</th>
                          <th className="py-3 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {productsList.map((p, idx) => {
                          const rowNo = ((productPagination?.current_page ?? 1) - 1) * (productPagination?.per_page ?? 50) + idx + 1;
                          const hasStock = (p.stock ?? 0) > 0;
                          return (
                            <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-2.5 px-3 text-center text-slate-500">{rowNo}</td>
                              <td className="py-2.5 px-3">
                                <span className="font-mono font-bold text-violet-400 select-all">
                                  {p.sku || <span className="text-slate-600 font-normal italic">— tanpa SKU —</span>}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 max-w-xs truncate text-slate-200" title={p.item_name}>
                                {p.item_name}
                              </td>
                              <td className="py-2.5 px-3">
                                {p.model_name ? (
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700">
                                    {p.model_name}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 italic text-[11px]">Single (Tanpa Variasi)</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                                    hasStock
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}
                                >
                                  {p.stock?.toLocaleString('id-ID') ?? 0}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                {p.reserved_stock?.toLocaleString('id-ID') ?? 0}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                Rp {Math.round(p.price ?? 0).toLocaleString('id-ID')}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {p.item_status || 'NORMAL'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Pagination Footer */}
              {productPagination && productPagination.last_page > 1 && (
                <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    Halaman <strong className="text-white">{productPagination.current_page}</strong> dari{' '}
                    <strong className="text-white">{productPagination.last_page}</strong> ({productPagination.total} SKU)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={productPagination.current_page <= 1}
                      onClick={() => fetchProducts(productPagination.current_page - 1, productSearch)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={productPagination.current_page >= productPagination.last_page}
                      onClick={() => fetchProducts(productPagination.current_page + 1, productSearch)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
