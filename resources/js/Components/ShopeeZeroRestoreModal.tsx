import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ZeroRestoreBatchSummary {
  id: number;
  batch_code: string;
  source: string;
  source_label: string;
  note: string | null;
  zeroed_by_name: string | null;
  zeroed_at_label: string | null;
  total_requested: number;
  zeroed_count: number;
  restored_count: number;
  restorable_count: number;
}

export interface ZeroRestoreSummary {
  total_batches: number;
  restorable_batches_count: number;
  restorable_items_count: number;
  restored_items_count: number;
  latest_restorable_batch: ZeroRestoreBatchSummary | null;
}

export interface ZeroHistoryItem {
  id: number;
  batch_id: number;
  shopee_product_id: number | null;
  item_id: number;
  model_id: number;
  item_name: string;
  model_name: string | null;
  sku: string | null;
  previous_stock: number;
  zeroed_stock: number;
  current_stock: number | null;
  status: 'zeroed' | 'restored' | 'zero_failed' | 'restore_failed' | 'restoring';
  is_restorable: boolean;
  has_manual_stock_change: boolean;
  error_message: string | null;
  restored_by_name: string | null;
  restored_at: string | null;
  restored_at_label: string | null;
}

export interface ZeroHistoryBatch {
  id: number;
  shopee_account_id: number | null;
  batch_code: string;
  source: string;
  source_label: string;
  note: string | null;
  total_requested: number;
  zeroed_count: number;
  failed_count: number;
  restored_count: number;
  restorable_count: number;
  restore_failed_count: number;
  status: 'zeroed' | 'partial_zero_failed' | 'partially_restored' | 'restored' | 'failed';
  zeroed_by_name: string | null;
  zeroed_at: string | null;
  zeroed_at_label: string | null;
  restored_by_name: string | null;
  restored_at: string | null;
  restored_at_label: string | null;
  items: ZeroHistoryItem[];
}

export interface ShopeeZeroRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBatchId?: number | null;
  initialFilter?: 'all' | 'restorable' | 'restored';
  onRestoredSuccess: (message: string) => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface ConfirmRestoreState {
  isOpen: boolean;
  batch: ZeroHistoryBatch;
  items: ZeroHistoryItem[];
  isWholeBatch: boolean;
  forceOverwrite: boolean;
}

export default function ShopeeZeroRestoreModal({
  isOpen,
  onClose,
  initialBatchId = null,
  initialFilter = 'all',
  onRestoredSuccess,
  onToast,
}: ShopeeZeroRestoreModalProps) {
  const [filter, setFilter] = useState<'all' | 'restorable' | 'restored'>(initialFilter);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [summary, setSummary] = useState<ZeroRestoreSummary | null>(null);
  const [batches, setBatches] = useState<ZeroHistoryBatch[]>([]);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<number, boolean>>({});
  const [selectedItemIdsByBatch, setSelectedItemIdsByBatch] = useState<Record<number, number[]>>({});
  const [confirmState, setConfirmState] = useState<ConfirmRestoreState | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFilter(initialFilter);
      if (initialBatchId) {
        setExpandedBatchIds(prev => ({ ...prev, [initialBatchId]: true }));
      }
    } else {
      setConfirmState(null);
      setSearch('');
      setFetchError(null);
    }
  }, [isOpen, initialBatchId, initialFilter]);

  const loadHistory = useCallback(async (activeFilter: 'all' | 'restorable' | 'restored', query: string) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set('filter', activeFilter);
      if (query.trim()) {
        params.set('search', query.trim());
      }
      const resp = await fetch(`/shopee-products/zero-history?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await resp.json();
      if (!resp.ok || data.status !== 'success') {
        throw new Error(data.message || 'Gagal memuat riwayat pengosongan & pemulihan.');
      }

      const loadedBatches: ZeroHistoryBatch[] = data.batches || [];
      setSummary(data.summary || null);
      setBatches(loadedBatches);

      if (initialBatchId) {
        setExpandedBatchIds(prev => ({ ...prev, [initialBatchId]: true }));
      } else if (loadedBatches.length > 0) {
        setExpandedBatchIds(prev => {
          if (Object.keys(prev).length > 0) return prev;
          return { [loadedBatches[0].id]: true };
        });
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Gagal memuat data riwayat pemulihan.');
    } finally {
      setIsLoading(false);
    }
  }, [initialBatchId]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadHistory(filter, search);
    }, search.trim() ? 220 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, filter, search, loadHistory]);

  function toggleBatchExpanded(batchId: number) {
    setExpandedBatchIds(prev => ({ ...prev, [batchId]: !prev[batchId] }));
  }

  function toggleItemSelection(batchId: number, itemId: number) {
    setSelectedItemIdsByBatch(prev => {
      const current = prev[batchId] || [];
      const exists = current.includes(itemId);
      const next = exists ? current.filter(id => id !== itemId) : [...current, itemId];
      return { ...prev, [batchId]: next };
    });
  }

  function toggleSelectAllInBatch(batch: ZeroHistoryBatch) {
    const restorableIds = batch.items.filter(i => i.is_restorable).map(i => i.id);
    if (restorableIds.length === 0) return;

    setSelectedItemIdsByBatch(prev => {
      const current = prev[batch.id] || [];
      const allSelected = restorableIds.every(id => current.includes(id));
      return { ...prev, [batch.id]: allSelected ? [] : restorableIds };
    });
  }

  function openRestoreConfirm(batch: ZeroHistoryBatch, itemsToRestore: ZeroHistoryItem[], isWholeBatch: boolean) {
    if (itemsToRestore.length === 0) {
      onToast('Tidak ada SKU yang dapat dipulihkan pada pilihan ini.', 'info');
      return;
    }
    setConfirmState({
      isOpen: true,
      batch,
      items: itemsToRestore,
      isWholeBatch,
      forceOverwrite: false,
    });
  }

  async function executeRestore() {
    if (!confirmState) return;
    const { batch, items, isWholeBatch, forceOverwrite } = confirmState;

    setIsRestoring(true);
    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
      const payload: Record<string, any> = {
        batch_id: batch.id,
        force_overwrite: forceOverwrite,
      };
      if (!isWholeBatch || items.length < batch.restorable_count) {
        payload.item_ids = items.map(i => i.id);
      }

      const resp = await fetch('/shopee-products/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resJson = await resp.json();
      if (resp.ok && resJson.status === 'success') {
        const msg = resJson.message || `Berhasil memulihkan ${resJson.restored_count} SKU ke Shopee!`;
        setConfirmState(null);
        setSelectedItemIdsByBatch(prev => ({ ...prev, [batch.id]: [] }));
        setExpandedBatchIds(prev => ({ ...prev, [batch.id]: true }));
        onRestoredSuccess(msg);
        await loadHistory(filter, search);
      } else {
        onToast(resJson.message || 'Gagal memulihkan stok ke Shopee.', 'error');
        const skippedIds: number[] = (resJson.skipped_modified || []).map((s: any) => Number(s.zero_item_id));
        if (skippedIds.length > 0) {
          setConfirmState(prev =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map(it =>
                    skippedIds.includes(it.id) ? { ...it, has_manual_stock_change: true } : it
                  ),
                }
              : null
          );
        }
        await loadHistory(filter, search);
      }
    } catch (err: any) {
      onToast('Terjadi kesalahan saat memulihkan stok: ' + (err?.message || 'Error jaringan'), 'error');
    } finally {
      setIsRestoring(false);
    }
  }

  const totalSelectedCount = useMemo(
    () => Object.values(selectedItemIdsByBatch).reduce((sum, arr) => sum + arr.length, 0),
    [selectedItemIdsByBatch]
  );

  function renderBatchStatusBadge(batch: ZeroHistoryBatch) {
    if (batch.status === 'restored') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Sudah Dipulihkan
        </span>
      );
    }
    if (batch.status === 'partially_restored') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
          Sebagian Dipulihkan
        </span>
      );
    }
    if (batch.status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          Gagal Kosongkan
        </span>
      );
    }
    if (batch.status === 'partial_zero_failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          Siap Dipulihkan (Sebagian Gagal)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        Siap Dipulihkan
      </span>
    );
  }

  function renderItemStatusBadge(item: ZeroHistoryItem) {
    switch (item.status) {
      case 'restored':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Sudah Dipulihkan
          </span>
        );
      case 'zero_failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Gagal Kosongkan
          </span>
        );
      case 'restore_failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Gagal Pulihkan
          </span>
        );
      case 'restoring':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
            Sedang Diproses...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            Siap Dipulihkan
          </span>
        );
    }
  }

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Pulihkan Stok Shopee &amp; Riwayat Pemulihan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kembalikan stok SKU Shopee persis ke angka snapshot sebelum dikosongkan, lengkap dengan tanggal dikosongkan &amp; tanggal pemulihan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
            title="Tutup"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary & Controls */}
        <div className="px-6 py-3.5 border-b border-slate-200 bg-white space-y-3 shrink-0">
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">Total Sesi Kosongkan</span>
                <span className="text-sm font-black font-mono text-slate-900">{summary.total_batches} batch</span>
              </div>
              <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-800">Siap Dipulihkan</span>
                <span className="text-sm font-black font-mono text-amber-900">{summary.restorable_items_count} SKU</span>
              </div>
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-800">Sudah Dipulihkan</span>
                <span className="text-sm font-black font-mono text-emerald-900">{summary.restored_items_count} SKU</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Filter Tabs */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 self-start">
              {[
                { key: 'all', label: 'Semua Riwayat' },
                { key: 'restorable', label: 'Bisa Dipulihkan' },
                { key: 'restored', label: 'Riwayat Pemulihan' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key as 'all' | 'restorable' | 'restored')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filter === tab.key
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search & Refresh */}
            <div className="flex items-center gap-2 flex-1 sm:max-w-sm">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cari SKU, nama produk, kode batch..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <button
                type="button"
                onClick={() => loadHistory(filter, search)}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                title="Muat ulang riwayat"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-50/40">
          {fetchError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {fetchError}
            </div>
          )}

          {isLoading && batches.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2.5"></div>
              Memuat riwayat pengosongan &amp; tanggal pemulihan...
            </div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 px-6">
              <p className="text-sm font-bold text-slate-700">Belum ada catatan pada filter ini</p>
              <p className="text-xs text-slate-500 mt-1">
                Setiap kali Anda mengosongkan stok Shopee (massal dari Pemberitahuan/Audit maupun Set 0 satuan), riwayat beserta tanggal pemulihan akan tercatat otomatis di sini.
              </p>
            </div>
          ) : (
            batches.map(batch => {
              const isExpanded = Boolean(expandedBatchIds[batch.id]);
              const restorableItems = batch.items.filter(i => i.is_restorable);
              const selectedIds = selectedItemIdsByBatch[batch.id] || [];
              const selectedRestorableItems = restorableItems.filter(i => selectedIds.includes(i.id));
              const allRestorableSelected =
                restorableItems.length > 0 && restorableItems.every(i => selectedIds.includes(i.id));

              return (
                <div
                  key={batch.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
                >
                  {/* Batch Card Header */}
                  <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {batch.batch_code}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {batch.source_label}
                        </span>
                        {renderBatchStatusBadge(batch)}
                        <span className="text-xs font-semibold text-slate-600">
                          {batch.total_requested} SKU
                          {batch.restored_count > 0 && (
                            <span className="text-emerald-700"> • {batch.restored_count} dipulihkan</span>
                          )}
                          {batch.failed_count > 0 && (
                            <span className="text-rose-600"> • {batch.failed_count} gagal</span>
                          )}
                        </span>
                      </div>

                      {batch.note && (
                        <p className="text-xs font-medium text-slate-700">{batch.note}</p>
                      )}

                      {/* Tanggal Dikosongkan & Tanggal Pemulihan */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] pt-0.5">
                        <div className="inline-flex items-center gap-1.5 text-slate-600">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                          </svg>
                          <span>
                            Dikosongkan:{' '}
                            <strong className="text-slate-800">{batch.zeroed_at_label || '-'}</strong>
                            {batch.zeroed_by_name ? ` oleh ${batch.zeroed_by_name}` : ''}
                          </span>
                        </div>

                        {batch.restored_at_label ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>
                              {batch.status === 'partially_restored' ? 'Terakhir dipulihkan:' : 'Dipulihkan:'}{' '}
                              <strong>{batch.restored_at_label}</strong>
                              {batch.restored_by_name ? ` oleh ${batch.restored_by_name}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Belum pernah dipulihkan</span>
                        )}
                      </div>
                    </div>

                    {/* Batch Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {batch.restorable_count > 0 && (
                        <button
                          type="button"
                          onClick={() => openRestoreConfirm(batch, restorableItems, true)}
                          disabled={isRestoring}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                          </svg>
                          <span>Pulihkan Batch ({batch.restorable_count} SKU)</span>
                        </button>
                      )}

                      {selectedRestorableItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openRestoreConfirm(batch, selectedRestorableItems, false)}
                          disabled={isRestoring}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <span>Pulihkan Terpilih ({selectedRestorableItems.length})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleBatchExpanded(batch.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                      >
                        <span>{isExpanded ? 'Tutup SKU' : `Lihat SKU (${batch.items.length})`}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded SKU Detail Table */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50/50 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <th className="py-2.5 pl-4 pr-2 w-9">
                              {restorableItems.length > 0 && (
                                <input
                                  type="checkbox"
                                  checked={allRestorableSelected}
                                  onChange={() => toggleSelectAllInBatch(batch)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  title="Pilih semua SKU yang siap dipulihkan di batch ini"
                                />
                              )}
                            </th>
                            <th className="py-2.5 px-3">SKU &amp; Produk</th>
                            <th className="py-2.5 px-3 text-center">Snapshot Stok Dulu</th>
                            <th className="py-2.5 px-3 text-center">Stok Saat Ini</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-4">Riwayat Tanggal Pemulihan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 bg-white">
                          {batch.items.map(item => {
                            const checked = selectedIds.includes(item.id);
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/70">
                                <td className="py-2.5 pl-4 pr-2">
                                  {item.is_restorable ? (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleItemSelection(batch.id, item.id)}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 max-w-xs">
                                  <div className="font-mono font-bold text-slate-900 text-xs">
                                    {item.sku || `ITEM-${item.item_id}`}
                                  </div>
                                  <div className="text-[11px] text-slate-700 truncate">{item.item_name}</div>
                                  {item.model_name && (
                                    <div className="text-[10px] text-slate-500">Variasi: {item.model_name}</div>
                                  )}
                                  {item.error_message && (
                                    <div className="text-[10px] text-rose-600 mt-0.5">{item.error_message}</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                    {item.previous_stock.toLocaleString('id-ID')} pcs
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <div className="font-mono font-semibold text-slate-800">
                                    {item.current_stock !== null ? `${item.current_stock.toLocaleString('id-ID')} pcs` : '—'}
                                  </div>
                                  {item.has_manual_stock_change && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                      Sudah diubah manual
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">{renderItemStatusBadge(item)}</td>
                                <td className="py-2.5 px-4">
                                  {item.restored_at_label ? (
                                    <div className="text-emerald-700">
                                      <div className="font-semibold">{item.restored_at_label}</div>
                                      {item.restored_by_name && (
                                        <div className="text-[10px] text-slate-500">oleh {item.restored_by_name}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic">Belum dipulihkan</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {totalSelectedCount > 0 ? (
              <span>
                <strong className="text-indigo-700">{totalSelectedCount} SKU</strong> dicentang (pulihkan dari tombol di header batch masing-masing).
              </span>
            ) : (
              <span>Menampilkan maksimal 40 batch pengosongan &amp; pemulihan terbaru.</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Nested Confirmation Modal before calling Shopee Live API */}
      {confirmState?.isOpen && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-indigo-50/70 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Konfirmasi Pulihkan Stok ke Shopee</h3>
                <p className="text-[11px] text-slate-600">
                  Batch {confirmState.batch.batch_code} • {confirmState.items.length} SKU target
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Sistem akan mengembalikan stok ke <strong>Shopee Live</strong> dan <strong>database ERP</strong> persis ke angka sebelum dikosongkan:
              </p>

              <div className="max-h-40 overflow-y-auto space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                {confirmState.items.slice(0, 12).map(it => (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                    <span className="font-mono font-semibold text-slate-800 truncate">
                      {it.sku || it.item_name}
                    </span>
                    <span className="font-mono font-bold text-indigo-700 shrink-0">
                      {it.zeroed_stock} → {it.previous_stock} pcs
                    </span>
                  </div>
                ))}
                {confirmState.items.length > 12 && (
                  <p className="text-[10px] text-slate-500 italic text-center pt-1">
                    + {confirmState.items.length - 12} SKU lainnya...
                  </p>
                )}
              </div>

              {confirmState.items.some(i => i.has_manual_stock_change) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <p className="text-[11px] font-semibold text-amber-900">
                    Sebagian SKU terdeteksi sudah diubah/diisi stoknya secara manual setelah dikosongkan.
                  </p>
                  <label className="flex items-start gap-2 text-[11px] text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmState.forceOverwrite}
                      onChange={e =>
                        setConfirmState(prev => (prev ? { ...prev, forceOverwrite: e.target.checked } : prev))
                      }
                      className="mt-0.5 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>
                      Tetap timpa SKU yang stoknya sudah berubah tersebut (jika tidak dicentang, SKU tersebut akan dilewati aman).
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Memulihkan ke Shopee...</span>
                  </>
                ) : (
                  <span>Ya, Pulihkan Sekarang</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
