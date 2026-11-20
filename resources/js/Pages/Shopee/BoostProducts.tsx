import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { useOverlayScrollLockAndEscape } from '../../Components/Shopee/overlayHelpers';

interface BoostSlot {
  slot_number: number;
  status: 'active' | 'empty';
  item_id: number | null;
  item_name?: string;
  sku?: string | null;
  price?: number | null;
  image_url?: string | null;
  cool_down_second?: number;
  ends_at?: string;
}

interface BoostData {
  slots: BoostSlot[];
  active_count: number;
  available_count: number;
  raw_items: Array<{ item_id: number; cool_down_second: number }>;
}

interface ShopeeAccountInfo {
  id: number;
  account_name: string;
  shop_id: number | string;
  connection_status: string;
  connected: boolean;
}

interface CandidateProduct {
  item_id: number;
  item_name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  sales: number;
  image_url: string | null;
}

interface CatalogItem {
  item_id: number;
  item_name: string;
  sku: string;
  price: number | null;
  stock: number;
  sales: number;
  is_boosted: boolean;
  cool_down_second: number;
  ends_at: string | null;
  image_url: string | null;
}

interface CatalogData {
  items: CatalogItem[];
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
  counts: {
    all: number;
    boosted: number;
    available: number;
  };
}

interface Props {
  account: ShopeeAccountInfo | null;
  boostData: BoostData;
  catalog: CatalogData;
  errorMessage: string | null;
}

function formatIDR(amount?: number | null): string {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatEndsAt(endsAtStr?: string | null): string {
  if (!endsAtStr) return '-';
  try {
    const d = new Date(endsAtStr);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' WIB';
  } catch {
    return '-';
  }
}

function formatCountdown(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function BoostProducts({
  account,
  boostData: initialBoostData,
  catalog: initialCatalog,
  errorMessage: initialErrorMessage,
}: Props) {
  const [boostData, setBoostData] = useState<BoostData>(initialBoostData);
  const [catalogData, setCatalogData] = useState<CatalogData>(initialCatalog);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Remaining seconds map for ticking countdown: { itemId: seconds }
  const [remainingMap, setRemainingMap] = useState<Record<number, number>>({});

  // Product Selection Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [candidates, setCandidates] = useState<CandidateProduct[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [submittingBoost, setSubmittingBoost] = useState(false);

  // Catalog Table Filters & State
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'boosted' | 'available'>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(initialCatalog?.current_page || 1);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [singleBoostingId, setSingleBoostingId] = useState<number | null>(null);

  // Track failed image URLs
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Initialize remaining seconds whenever boostData or catalog changes
  useEffect(() => {
    const map: Record<number, number> = {};
    for (const slot of boostData.slots) {
      if (slot.status === 'active' && slot.item_id && typeof slot.cool_down_second === 'number') {
        map[slot.item_id] = Math.max(0, slot.cool_down_second);
      }
    }
    if (catalogData?.items) {
      for (const item of catalogData.items) {
        if (item.is_boosted && item.cool_down_second > 0) {
          map[item.item_id] = Math.max(0, item.cool_down_second);
        }
      }
    }
    setRemainingMap(map);
  }, [boostData, catalogData]);

  // Live countdown timer ticking every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMap((prev) => {
        let hasChanges = false;
        const next: Record<number, number> = {};
        for (const [idStr, sec] of Object.entries(prev)) {
          const id = Number(idStr);
          const nextSec = Math.max(0, sec - 1);
          next[id] = nextSec;
          if (nextSec !== sec) hasChanges = true;
        }
        return hasChanges ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch updated status from backend API
  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/shopee/boost-products/status', {
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal menyegarkan status produk dinaikkan.');
      }
      setBoostData(json.data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghubungi server.');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Active items IDs
  const activeItemIds = useMemo(() => {
    return boostData.slots
      .filter((s) => s.status === 'active' && s.item_id !== null)
      .map((s) => s.item_id as number);
  }, [boostData]);

  const availableSlotsCount = useMemo(() => {
    return Math.max(0, 5 - activeItemIds.length);
  }, [activeItemIds]);

  // Fetch catalog with pagination, filter, and search
  const fetchCatalog = useCallback(
    async (page = 1, filter = catalogFilter, keyword = catalogSearch) => {
      setLoadingCatalog(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('filter', filter);
        if (keyword.trim()) params.set('keyword', keyword.trim());
        params.set('per_page', '15');

        const res = await fetch(`/shopee/boost-products/catalog?${params.toString()}`, {
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        const json = await res.json();
        if (res.ok && json.status === 'success') {
          setCatalogData(json.data);
          setCatalogPage(json.data.current_page);
        }
      } catch {
        // Abaikan kendala jaringan sementara
      } finally {
        setLoadingCatalog(false);
      }
    },
    [catalogFilter, catalogSearch]
  );

  // Fetch candidates for selection modal
  const fetchCandidates = useCallback(
    async (keyword = '') => {
      setLoadingCandidates(true);
      try {
        const params = new URLSearchParams();
        if (keyword.trim()) params.set('keyword', keyword.trim());
        for (const id of activeItemIds) {
          params.append('exclude_ids[]', String(id));
        }

        const res = await fetch(`/shopee/boost-products/search-products?${params.toString()}`, {
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        const json = await res.json();
        setCandidates(json.products || []);
      } catch {
        setCandidates([]);
      } finally {
        setLoadingCandidates(false);
      }
    },
    [activeItemIds]
  );

  const handleOpenModal = () => {
    if (availableSlotsCount <= 0) {
      setToast({ type: 'error', message: 'Seluruh 5 slot saat ini sedang penuh. Tunggu hingga salah satu slot selesai.' });
      return;
    }
    setSelectedItemIds([]);
    setSearchKeyword('');
    setIsModalOpen(true);
    void fetchCandidates('');
  };

  const handleToggleSelectProduct = (itemId: number) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      }
      if (prev.length >= availableSlotsCount) {
        setToast({
          type: 'error',
          message: `Hanya tersisa ${availableSlotsCount} slot kosong. Anda tidak dapat memilih lebih dari ${availableSlotsCount} produk.`,
        });
        return prev;
      }
      return [...prev, itemId];
    });
  };

  // Eksekusi menaikkan produk massal (1 - 5 produk)
  const handleExecuteBoost = async () => {
    if (selectedItemIds.length === 0) return;
    setSubmittingBoost(true);
    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
      const res = await fetch('/shopee/boost-products/boost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ item_ids: selectedItemIds }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal menaikkan produk.');
      }

      setToast({ type: 'success', message: json.message || 'Produk berhasil dinaikkan ke urutan teratas Shopee!' });
      setIsModalOpen(false);
      void refreshStatus();
      void fetchCatalog(catalogPage, catalogFilter, catalogSearch);
    } catch (err: unknown) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Terjadi kendala saat menaikkan produk.' });
    } finally {
      setSubmittingBoost(false);
    }
  };

  // Eksekusi menaikkan 1 produk langsung dari tabel katalog
  const handleSingleBoost = async (item: CatalogItem) => {
    if (availableSlotsCount <= 0) {
      setToast({
        type: 'error',
        message: 'Seluruh 5 slot saat ini sedang penuh. Tunggu salah satu produk selesai masa 4 jam.',
      });
      return;
    }

    setSingleBoostingId(item.item_id);
    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
      const res = await fetch('/shopee/boost-products/boost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ item_ids: [item.item_id] }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || `Gagal menaikkan ${item.item_name}.`);
      }

      setToast({
        type: 'success',
        message: `✓ "${item.item_name}" berhasil dinaikkan ke urutan teratas Shopee selama 4 jam!`,
      });

      void refreshStatus();
      void fetchCatalog(catalogPage, catalogFilter, catalogSearch);
    } catch (err: unknown) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Terjadi kendala saat menaikkan produk.',
      });
    } finally {
      setSingleBoostingId(null);
    }
  };

  useOverlayScrollLockAndEscape(isModalOpen, () => setIsModalOpen(false));

  return (
    <AppLayout>
      <Head title="Naikkan Produk Shopee" />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Toast Alert */}
        {toast && (
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs font-medium shadow-xs transition-all ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">{toast.type === 'success' ? '✓ Berhasil:' : '✕ Kendala:'}</span>
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="font-bold text-slate-500 hover:text-slate-800 px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 shrink-0 text-rose-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              <p className="font-bold">Gagal sinkronisasi data dengan Shopee:</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Hero Header Section */}
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0B132B] via-[#15234E] to-[#1E3A8A] p-6 text-white shadow-xl sm:p-8">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 border border-blue-400/30">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                  <span>Shopee Product Boost</span>
                </span>
                {account?.account_name && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-400/30">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{account.account_name}</span>
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Naikkan Produk Shopee
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Promosi organik resmi Shopee untuk menempatkan hingga <strong>5 produk</strong> di urutan teratas tab <em>Terbaru</em> hasil pencarian selama <strong>4 jam</strong>.
              </p>
            </div>

            {/* Header Right Actions & Slot Gauge */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-md border border-white/15">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Slot Terpakai</p>
                  <p className="text-lg font-black text-white">
                    {activeItemIds.length} <span className="text-xs font-medium text-slate-300">/ 5 Slot</span>
                  </p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Slot Kosong</p>
                  <p className="text-lg font-black text-emerald-300">
                    {availableSlotsCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void refreshStatus();
                    void fetchCatalog(catalogPage, catalogFilter, catalogSearch);
                  }}
                  disabled={loadingStatus || loadingCatalog}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/20 disabled:opacity-50"
                  title="Segarkan status slot terkini dari Shopee"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  <span>Segarkan</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenModal}
                  disabled={availableSlotsCount === 0}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 hover:shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>Naikkan Produk</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5 Slots Interactive Cards */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Status 5 Slot Produk</span>
              <span className="text-xs font-normal text-slate-500">(1 Slot = 1 Produk selama 4 Jam)</span>
            </h2>
            <span className="text-xs font-semibold text-slate-600">
              {availableSlotsCount > 0 ? (
                <span className="text-emerald-600">✓ {availableSlotsCount} Slot Siap Digunakan</span>
              ) : (
                <span className="text-amber-600">⚠ Semua Slot Penuh</span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {boostData.slots.map((slot) => {
              const isActive = slot.status === 'active' && slot.item_id !== null;
              const remainingSeconds = slot.item_id ? (remainingMap[slot.item_id] ?? 0) : 0;

              const hours = Math.floor(remainingSeconds / 3600);
              const minutes = Math.floor((remainingSeconds % 3600) / 60);
              const seconds = remainingSeconds % 60;
              const pad = (n: number) => String(n).padStart(2, '0');

              // 4 hours = 14400 seconds
              const progressPct = Math.max(0, Math.min(100, Math.round((remainingSeconds / 14400) * 100)));
              const imgKey = `slot-${slot.slot_number}-${slot.item_id ?? ''}`;
              const hasValidImage = Boolean(slot.image_url && !failedImages[imgKey]);

              return (
                <div
                  key={slot.slot_number}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border transition-all ${
                    isActive
                      ? 'border-slate-200 bg-white shadow-sm hover:shadow-md'
                      : 'border-dashed border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/30'
                  }`}
                >
                  {/* Slot Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 p-3.5 bg-slate-50/50">
                    <span className="rounded-lg bg-slate-200/80 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                      SLOT {slot.slot_number}
                    </span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Dinaikkan</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        Kosong
                      </span>
                    )}
                  </div>

                  {/* Slot Card Body */}
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    {isActive ? (
                      <div className="space-y-3">
                        {/* Product Thumbnail & Title */}
                        <div className="flex items-start gap-3">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-2xs">
                            {hasValidImage ? (
                              <img
                                src={slot.image_url!}
                                alt={slot.item_name || 'Produk'}
                                onError={() => setFailedImages((prev) => ({ ...prev, [imgKey]: true }))}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                                <span className="text-[9px] font-bold mt-0.5">PRODUK</span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3
                              className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight"
                              title={slot.item_name}
                            >
                              {slot.item_name}
                            </h3>
                            {slot.sku && (
                              <p className="mt-1 font-mono text-[10px] text-slate-500 truncate" title={slot.sku}>
                                SKU: {slot.sku}
                              </p>
                            )}
                            <p className="mt-0.5 text-xs font-bold text-blue-600">
                              {formatIDR(slot.price)}
                            </p>
                          </div>
                        </div>

                        {/* Live Countdown Clock */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Sisa Waktu Boost
                          </p>
                          <div className="mt-1 font-mono text-lg font-black tracking-wider text-slate-900 tabular-nums">
                            <span>{pad(hours)}</span>
                            <span className="mx-1 text-slate-400">:</span>
                            <span>{pad(minutes)}</span>
                            <span className="mx-1 text-slate-400">:</span>
                            <span className="text-blue-600">{pad(seconds)}</span>
                          </div>

                          {/* Progress Bar */}
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all duration-1000"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>

                          <p className="mt-1.5 text-[10px] text-slate-400">
                            Selesai: {formatEndsAt(slot.ends_at)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Empty Slot View */
                      <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-2xs">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-6 w-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </div>
                        <p className="mt-3 text-xs font-bold text-slate-700">Slot Tersedia</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Siap menaikkan produk ke posisi teratas.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenModal}
                          className="mt-4 inline-flex cursor-pointer items-center gap-1 rounded-xl bg-[#0B132B] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition-colors"
                        >
                          Pilih Produk
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DAFTAR PRODUK TOKO SHOPEE (CATALOG TABLE WITH LIVE ACTIONS) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          {/* Header Bar */}
          <div className="border-b border-slate-200/80 p-5 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Daftar Produk Toko Shopee</h2>
                <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {catalogData?.total ?? 0} Produk
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Lihat semua produk toko, pantau hitung mundur produk yang sedang dinaikkan, atau naikkan produk lainnya langsung dengan 1 klik.
              </p>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Tabs */}
              <div className="inline-flex rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogFilter('all');
                    void fetchCatalog(1, 'all', catalogSearch);
                  }}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 transition-all ${
                    catalogFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({catalogData?.counts?.all ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogFilter('boosted');
                    void fetchCatalog(1, 'boosted', catalogSearch);
                  }}
                  className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                    catalogFilter === 'boosted'
                      ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Sedang Dinaikkan ({catalogData?.counts?.boosted ?? 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogFilter('available');
                    void fetchCatalog(1, 'available', catalogSearch);
                  }}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 transition-all ${
                    catalogFilter === 'available'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bisa Dinaikkan ({catalogData?.counts?.available ?? 0})
                </button>
              </div>

              {/* Search Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetchCatalog(1, catalogFilter, catalogSearch);
                }}
                className="relative flex items-center"
              >
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Cari produk / SKU..."
                  className="w-48 sm:w-60 rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-hidden"
                />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </form>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-900/5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-16">Foto</th>
                  <th className="py-3 px-4">Nama Produk & SKU</th>
                  <th className="py-3 px-4 w-32">Harga</th>
                  <th className="py-3 px-4 w-24 text-center">Stok</th>
                  <th className="py-3 px-4 w-28 text-center">Terjual</th>
                  <th className="py-3 px-4 w-56 text-right">Status & Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingCatalog ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6 animate-spin text-blue-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        <span>Memuat data produk toko Shopee...</span>
                      </div>
                    </td>
                  </tr>
                ) : !catalogData?.items || catalogData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <p className="font-bold text-slate-700">Tidak ada produk yang sesuai dengan filter.</p>
                      <p className="text-slate-500 text-[11px] mt-1">Coba sesuaikan kata kunci pencarian atau tab filter di atas.</p>
                    </td>
                  </tr>
                ) : (
                  catalogData.items.map((prod) => {
                    const remainingSec = remainingMap[prod.item_id] ?? prod.cool_down_second ?? 0;
                    const isCurrentlyBoosted = prod.is_boosted || remainingSec > 0;
                    const imgKey = `catalog-${prod.item_id}`;
                    const hasValidImage = Boolean(prod.image_url && !failedImages[imgKey]);

                    return (
                      <tr
                        key={prod.item_id}
                        className={`transition-colors ${
                          isCurrentlyBoosted
                            ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Foto Produk */}
                        <td className="py-3 px-4">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-2xs">
                            {hasValidImage ? (
                              <img
                                src={prod.image_url!}
                                alt={prod.item_name}
                                onError={() => setFailedImages((prev) => ({ ...prev, [imgKey]: true }))}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                                <span className="text-[9px] font-bold mt-0.5">FOTO</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Nama Produk & SKU */}
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900 line-clamp-2 leading-tight" title={prod.item_name}>
                            {prod.item_name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            {prod.sku && prod.sku !== '-' && (
                              <span className="font-mono rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                SKU: {prod.sku}
                              </span>
                            )}
                            <span className="font-mono text-slate-400">ID: {prod.item_id}</span>
                          </div>
                        </td>

                        {/* Harga */}
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {formatIDR(prod.price)}
                        </td>

                        {/* Stok */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                            prod.stock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {prod.stock}
                          </span>
                        </td>

                        {/* Terjual */}
                        <td className="py-3 px-4 text-center font-semibold text-slate-700">
                          {prod.sales > 0 ? (
                            <span className="text-blue-600 font-bold">{prod.sales} pcs</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>

                        {/* Status & Aksi Naikkan */}
                        <td className="py-3 px-4 text-right">
                          {isCurrentlyBoosted ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-black text-emerald-800 shadow-2xs">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span>SEDANG DINAIKKAN</span>
                              </span>
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-700">
                                <span>Sisa: {formatCountdown(remainingSec)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSingleBoost(prod)}
                                disabled={availableSlotsCount === 0 || singleBoostingId === prod.item_id}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                title={availableSlotsCount === 0 ? 'Semua slot sedang penuh' : 'Naikkan produk ini sekarang'}
                              >
                                {singleBoostingId === prod.item_id ? (
                                  <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 animate-spin">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                    <span>Memproses...</span>
                                  </>
                                ) : (
                                  <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                    </svg>
                                    <span>Naikkan Produk</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {catalogData?.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-3 bg-slate-50/50 text-xs text-slate-600">
              <div>
                Menampilkan halaman <strong>{catalogData.current_page}</strong> dari <strong>{catalogData.last_page}</strong> ({catalogData.total} total produk)
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fetchCatalog(catalogPage - 1, catalogFilter, catalogSearch)}
                  disabled={catalogPage <= 1 || loadingCatalog}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  ← Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => fetchCatalog(catalogPage + 1, catalogFilter, catalogSearch)}
                  disabled={catalogPage >= catalogData.last_page || loadingCatalog}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Berikutnya →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Informational Guidance Box */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-slate-900">Ketentuan & Panduan Naikkan Produk Shopee</h4>
              <ul className="list-disc pl-4 text-slate-600 space-y-1 leading-relaxed">
                <li>Shopee memberikan batas maksimal <strong>5 produk sekaligus</strong> untuk dinaikkan dalam satu toko.</li>
                <li>Setiap produk yang dinaikkan akan aktif selama <strong>4 jam penuh</strong> di urutan atas pencarian kategori (tab <em>Terbaru</em>).</li>
                <li>Setelah masa 4 jam berakhir, slot akan otomatis terbuka kembali dan Anda dapat menaikkan produk yang sama atau produk lainnya.</li>
                <li>Fitur ini aman, resmi dari Shopee Open Platform, dan tidak memotong saldo iklan (100% gratis).</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Pemilihan Produk (Batch Boost) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Pilih Produk untuk Dinaikkan"
        >
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />

          <div className="relative z-10 my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B132B] px-5 py-4 text-white sm:px-6">
              <div>
                <h3 className="text-base font-bold text-white">Pilih Produk untuk Dinaikkan</h3>
                <p className="mt-0.5 text-xs text-slate-300">
                  Tersedia <strong>{availableSlotsCount} slot kosong</strong>. Pilih produk yang ingin Anda dorong ke urutan atas pencarian.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Search Toolbar */}
            <div className="border-b border-slate-100 bg-slate-50 p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetchCandidates(searchKeyword);
                }}
                className="relative flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Cari berdasarkan nama produk atau SKU Shopee..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-24 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 rounded-lg bg-[#0B132B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cari
                </button>
              </form>
            </div>

            {/* Product Candidates List */}
            <div className="max-h-[50vh] min-h-[250px] overflow-y-auto p-4 divide-y divide-slate-100">
              {loadingCandidates ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6 animate-spin text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  <span className="text-xs">Memuat katalog produk Shopee...</span>
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center text-slate-400">
                  <p className="text-xs font-semibold text-slate-700">Tidak ada produk ditemukan.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Coba kata kunci pencarian lain.</p>
                </div>
              ) : (
                candidates.map((prod) => {
                  const isSelected = selectedItemIds.includes(prod.item_id);
                  const imgKey = `modal-${prod.item_id}`;
                  const hasValidImage = Boolean(prod.image_url && !failedImages[imgKey]);

                  return (
                    <div
                      key={prod.item_id}
                      onClick={() => handleToggleSelectProduct(prod.item_id)}
                      className={`flex cursor-pointer items-center justify-between gap-4 p-3 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-blue-50/80 border border-blue-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectProduct(prod.item_id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />

                        {/* Image */}
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {hasValidImage ? (
                            <img
                              src={prod.image_url!}
                              alt={prod.item_name}
                              onError={() => setFailedImages((prev) => ({ ...prev, [imgKey]: true }))}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-[9px] text-slate-400 font-bold">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                              <span>FOTO</span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate" title={prod.item_name}>
                            {prod.item_name}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            {prod.sku && <span className="font-mono">SKU: {prod.sku}</span>}
                            <span>•</span>
                            <span className="font-semibold text-blue-600">{formatIDR(prod.price)}</span>
                            <span>•</span>
                            <span>Stok: <strong>{prod.stock}</strong></span>
                            {prod.sales > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-600 font-semibold">{prod.sales} terjual</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Select state button */}
                      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isSelected ? '✓ Terpilih' : 'Pilih'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:px-6">
              <span className="text-xs text-slate-600">
                Terpilih: <strong className="text-blue-600 font-bold">{selectedItemIds.length}</strong> dari maksimal <strong>{availableSlotsCount} produk</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBoost}
                  disabled={selectedItemIds.length === 0 || submittingBoost}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingBoost ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 animate-spin">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      <span>Menaikkan ke Shopee...</span>
                    </>
                  ) : (
                    <span>Naikkan {selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''} Sekarang</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
