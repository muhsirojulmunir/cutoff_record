import React, { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

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
}

export default function ShopeeIndex({ account, callbackUrl }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [showPartnerKey, setShowPartnerKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncDays, setSyncDays] = useState<number>(7);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

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
    setSyncing(true);
    router.post(
      '/marketplace/shopee/sync-now',
      { days: syncDays },
      {
        preserveScroll: true,
        onFinish: () => setSyncing(false),
      }
    );
  };

  const handleCopyCallback = () => {
    navigator.clipboard.writeText(callbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Pilih Rentang Waktu Tarik Pesanan:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Hari Ini', days: 1 },
                    { label: '3 Hari', days: 3 },
                    { label: '7 Hari', days: 7 },
                    { label: '14 Hari', days: 14 },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setSyncDays(preset.days)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        syncDays === preset.days
                          ? 'bg-[#0B132B] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trigger Button */}
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing || !isConnected}
                className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${
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
                    Tarik Pesanan ({syncDays} Hari Terakhir)
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
      </div>
    </AppLayout>
  );
}
