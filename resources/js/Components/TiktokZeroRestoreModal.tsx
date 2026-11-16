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
  tiktok_product_id: number | null;
  item_id: string;
  model_id: string;
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
  tiktok_account_id: number | null;
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

export interface TiktokZeroRestoreModalProps {
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

export default function TiktokZeroRestoreModal({
  isOpen,
  onClose,
  initialBatchId = null,
  initialFilter = 'all',
  onRestoredSuccess,
  onToast,
}: TiktokZeroRestoreModalProps) {
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
      const resp = await fetch(`/tiktok-products/zero-history?${params.toString()}`, {
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
    const restorableIds = batch.items.filter(i => i.status === 'zeroed').map(i => i.id);
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

      const resp = await fetch('/tiktok-products/restore', {
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
        const msg = resJson.message || `Berhasil memulihkan ${resJson.restored_count} SKU ke TikTok Shop!`;
        setConfirmState(null);
        setSelectedItemIdsByBatch(prev => ({ ...prev, [batch.id]: [] }));
        setExpandedBatchIds(prev => ({ ...prev, [batch.id]: true }));
        onRestoredSuccess(msg);
        await loadHistory(filter, search);
      } else {
        onToast(resJson.message || 'Gagal memulihkan stok ke TikTok Shop.', 'error');
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
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        Siap Dipulihkan
      </span>
    );
  }

  function renderItemStatusBadge(item: ZeroHistoryItem) {
    if (item.status === 'restored') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Sudah Dipulihkan
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        Siap Dipulihkan
      </span>
    );
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
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 flex items-center justify-center shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Pulihkan Stok TikTok &amp; Riwayat Pemulihan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kembalikan stok SKU TikTok persis ke angka snapshot sebelum dikosongkan, lengkap dengan log tanggal dikosongkan &amp; tanggal pemulihan.
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

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-50/40">
          {fetchError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {fetchError}
            </div>
          )}

          {isLoading && batches.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <div className="w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto mb-2.5"></div>
              Memuat riwayat pengosongan &amp; pemulihan TikTok...
            </div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 px-6">
              <p className="text-sm font-bold text-slate-700">Belum ada catatan pengosongan stok TikTok</p>
              <p className="text-xs text-slate-500 mt-1">
                Setiap kali Anda mengosongkan stok TikTok melalui fitur Kosongkan Stok, riwayat dan snapshot stok akan tercatat otomatis di sini untuk dipulihkan kapan saja.
              </p>
            </div>
          ) : (
            batches.map(batch => {
              const isExpanded = Boolean(expandedBatchIds[batch.id]);
              const restorableItems = batch.items.filter(i => i.status === 'zeroed');
              const selectedIds = selectedItemIdsByBatch[batch.id] || [];
              const selectedRestorableItems = restorableItems.filter(i => selectedIds.includes(i.id));

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
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-300">
                          {batch.source_label || 'Bulk'}
                        </span>
                        {renderBatchStatusBadge(batch)}
                        <span className="text-xs font-semibold text-slate-600">
                          {batch.total_requested} SKU
                          {batch.restored_count > 0 && (
                            <span className="text-emerald-700"> • {batch.restored_count} dipulihkan</span>
                          )}
                        </span>
                      </div>

                      {batch.note && (
                        <p className="text-xs font-medium text-slate-700">{batch.note}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] pt-0.5">
                        <span className="text-slate-500">
                          Dikosongkan: <strong className="text-slate-700 font-semibold">{batch.zeroed_at || '-'}</strong> ({batch.zeroed_by_name || 'Admin'})
                        </span>
                        {batch.restored_at && (
                          <span className="text-emerald-700 font-medium">
                            Dipulihkan: <strong>{batch.restored_at}</strong> ({batch.restored_by_name || 'Admin'})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                      {restorableItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openRestoreConfirm(batch, restorableItems, true)}
                          disabled={isRestoring}
                          className="px-3 py-1.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          Pulihkan Seluruh Batch ({restorableItems.length})
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleBatchExpanded(batch.id)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Sembunyikan' : 'Rincian SKU'}</span>
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

                  {/* Expanded Items Table */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2.5">SKU / Nama Produk</th>
                              <th className="px-3 py-2.5">Varian</th>
                              <th className="px-3 py-2.5 text-right">Stok Semula</th>
                              <th className="px-3 py-2.5 text-center">Status</th>
                              <th className="px-3 py-2.5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {batch.items.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50/80">
                                <td className="px-3 py-2.5 max-w-xs">
                                  <div className="font-bold text-slate-900 font-mono text-[11px]">{item.sku || '-'}</div>
                                  <div className="text-slate-500 truncate text-[11px]">{item.item_name}</div>
                                </td>
                                <td className="px-3 py-2.5 text-slate-700 font-medium">
                                  {item.model_name || '-'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-black font-mono text-slate-900">
                                  {item.previous_stock} pcs
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {renderItemStatusBadge(item)}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {item.status === 'zeroed' && (
                                    <button
                                      type="button"
                                      onClick={() => openRestoreConfirm(batch, [item], false)}
                                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                                    >
                                      Pulihkan
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Riwayat pemulihan stok tersimpan aman di database ERP.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-slate-900">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-300 text-slate-800 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Pemulihan Stok</h3>
                <p className="text-xs text-slate-500">TikTok Shop</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Anda akan memulihkan <strong>{confirmState.items.length} SKU</strong> dari batch{' '}
              <strong className="font-mono text-slate-900">{confirmState.batch.batch_code}</strong> ke angka stok semula.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isRestoring && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>{isRestoring ? 'Memulihkan...' : 'Ya, Pulihkan Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
