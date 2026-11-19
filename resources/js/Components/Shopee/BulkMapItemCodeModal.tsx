import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';

export interface VariantItem {
  id: number;
  item_id: number;
  model_id: number | null;
  item_name: string;
  model_name: string | null;
  sku: string;
  manual_item_code?: string | null;
  stock?: number;
}

export interface MasterStockItem {
  item_code: string;
  item_name: string;
  warehouse?: string;
  qty_pcs?: number;
  total_pcs?: number;
}

export interface BulkMapItemCodeModalProps {
  show: boolean;
  onClose: () => void;
  platform?: 'shopee' | 'tiktok';
  searchEndpoint: string;
  bulkMapEndpoint: string;
  searchMasterEndpoint?: string;
  onSuccess: (updatedCount: number, itemCode: string) => void;
}

export default function BulkMapItemCodeModal({
  show,
  onClose,
  platform = 'shopee',
  searchEndpoint,
  bulkMapEndpoint,
  searchMasterEndpoint = '/shopee-products/search-master',
  onSuccess,
}: BulkMapItemCodeModalProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<VariantItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Target code & verification
  const [targetItemCode, setTargetItemCode] = useState('');
  const [isVerifyingMaster, setIsVerifyingMaster] = useState(false);
  const [verifiedMasterItem, setVerifiedMasterItem] = useState<MasterStockItem | null>(null);

  // Workflow step: 'select' (cari & pilih varian + isi kode) | 'preview' (pratinjau diff sebelum simpan)
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search debounce timer ref
  const searchTimerRef = useRef<number | null>(null);
  const verifyTimerRef = useRef<number | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (show) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedIds(new Set());
      setTargetItemCode('');
      setVerifiedMasterItem(null);
      setStep('select');
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [show]);

  // Debounced search for variants
  const performSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSearchResults([]);
        setSelectedIds(new Set());
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setErrorMessage(null);
      try {
        const url = `${searchEndpoint}?q=${encodeURIComponent(trimmed)}`;
        const resp = await fetch(url, {
          headers: { credentials: 'same-origin', Accept: 'application/json' },
        });
        const json = await resp.json();
        if (json.status === 'success' && Array.isArray(json.data)) {
          setSearchResults(json.data);
          // Default: select all found variants
          setSelectedIds(new Set(json.data.map((item: VariantItem) => item.id)));
        } else {
          setSearchResults([]);
          setSelectedIds(new Set());
        }
      } catch (err: any) {
        setErrorMessage('Gagal mencari varian: ' + (err?.message || 'Error koneksi'));
      } finally {
        setIsSearching(false);
      }
    },
    [searchEndpoint]
  );

  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      performSearch(val);
    }, 300);
  };

  // Debounced verification of Master Stock
  const verifyMasterStock = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed || trimmed.length < 2) {
        setVerifiedMasterItem(null);
        setIsVerifyingMaster(false);
        return;
      }

      setIsVerifyingMaster(true);
      try {
        const url = `${searchMasterEndpoint}?q=${encodeURIComponent(trimmed)}`;
        const resp = await fetch(url, {
          headers: { credentials: 'same-origin', Accept: 'application/json' },
        });
        const json = await resp.json();
        const items: MasterStockItem[] = json.data || json.items || [];
        const exact = items.find(
          (m) => m.item_code.trim().toUpperCase() === trimmed
        ) || items[0] || null;
        setVerifiedMasterItem(exact);
      } catch {
        setVerifiedMasterItem(null);
      } finally {
        setIsVerifyingMaster(false);
      }
    },
    [searchMasterEndpoint]
  );

  const handleTargetCodeChange = (val: string) => {
    setTargetItemCode(val);
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = window.setTimeout(() => {
      verifyMasterStock(val);
    }, 350);
  };

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedIds.size === searchResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(searchResults.map((item) => item.id)));
    }
  };

  const toggleItem = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selected variants list
  const selectedVariants = useMemo(
    () => searchResults.filter((item) => selectedIds.has(item.id)),
    [searchResults, selectedIds]
  );

  // Submit bulk map
  const handleExecuteBulkMap = async () => {
    const cleanCode = targetItemCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage('Harap masukkan Kode Barang Master baru.');
      return;
    }
    if (selectedVariants.length === 0) {
      setErrorMessage('Pilih minimal 1 varian untuk diubah.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const resp = await fetch(bulkMapEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          product_ids: Array.from(selectedIds),
          item_code: cleanCode,
        }),
      });

      const resJson = await resp.json();
      if (resJson.status === 'success') {
        onSuccess(resJson.updated_count || selectedVariants.length, cleanCode);
        onClose();
      } else {
        setErrorMessage(resJson.message || 'Gagal mengubah kode barang varian.');
      }
    } catch (err: any) {
      setErrorMessage('Terjadi kesalahan: ' + (err?.message || 'Error server'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const platformLabel = platform === 'tiktok' ? 'TikTok' : 'Shopee';

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={`Ubah Kode Barang Varian Massal (${platformLabel})`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Error Alert */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-900 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* STEP 1: SELECT & INPUT */}
        {step === 'select' && (
          <div className="space-y-4">
            {/* Box 1: Pencarian Varian */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    1. Cari Varian Produk yang Ingin Diubah
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ketik SKU, Nama Produk, atau Nama Variasi (misal: <strong>jayden_hp_31</strong> atau <strong>jayden</strong>).
                  </p>
                </div>
                {searchResults.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                    Ditemukan: <strong className="text-slate-900">{searchResults.length}</strong> varian
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Ketik kata kunci SKU / nama produk / artikel..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 shadow-2xs"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <svg className="animate-spin h-4 w-4 text-violet-600" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Mencari...</span>
                  </div>
                )}
              </div>

              {/* Tabel Hasil Pencarian Varian */}
              {searchResults.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 z-10">
                        <tr>
                          <th className="py-2 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                searchResults.length > 0 &&
                                selectedIds.size === searchResults.length
                              }
                              onChange={toggleSelectAll}
                              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                              title="Pilih / Batal Semua"
                            />
                          </th>
                          <th className="py-2 px-3">Produk & Variasi</th>
                          <th className="py-2 px-3">SKU Marketplace</th>
                          <th className="py-2 px-3">Kode Saat Ini</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {searchResults.map((item) => {
                          const isChecked = selectedIds.has(item.id);
                          return (
                            <tr
                              key={item.id}
                              onClick={() => toggleItem(item.id)}
                              className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                isChecked ? 'bg-violet-50/30' : ''
                              }`}
                            >
                              <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleItem(item.id)}
                                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900">{item.item_name}</div>
                                <div className="text-[11px] text-slate-500">
                                  Variasi: <span className="font-medium text-slate-700">{item.model_name || '-'}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-800 select-all">
                                {item.sku || '-'}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {item.manual_item_code ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold font-mono">
                                    ✓ {item.manual_item_code}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium">
                                    Belum Diatur
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-50/80 px-3 py-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Terpilih: <strong className="text-violet-700 font-bold">{selectedIds.size}</strong> dari {searchResults.length} varian
                    </span>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-violet-600 hover:text-violet-800 font-semibold cursor-pointer"
                    >
                      {selectedIds.size === searchResults.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    </button>
                  </div>
                </div>
              )}

              {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                  Tidak ditemukan varian produk yang cocok dengan kata kunci &quot;<strong>{searchQuery}</strong>&quot;.
                </div>
              )}
            </div>

            {/* Box 2: Input Kode Barang Master Baru */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Masukkan Kode Barang Master Baru
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Kode barang dari sistem Master Stok gudang yang ingin dihubungkan (contoh: <strong>31231</strong>).
                </p>
              </div>

              <div>
                <input
                  type="text"
                  maxLength={50}
                  value={targetItemCode}
                  onChange={(e) => handleTargetCodeChange(e.target.value)}
                  placeholder="Masukkan Kode Barang Master (misal: 31231)..."
                  className="w-full sm:w-80 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs font-bold text-slate-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 shadow-2xs uppercase"
                />

                {/* Live Lookup Status */}
                {isVerifyingMaster ? (
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5 text-violet-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Memeriksa database Master Stok...</span>
                  </p>
                ) : verifiedMasterItem ? (
                  <div className="mt-1.5 inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800">
                    <span className="font-bold text-emerald-700">✓ Ditemukan di Master Stok:</span>
                    <strong className="font-semibold">{verifiedMasterItem.item_name}</strong>
                    <span className="text-[11px] text-emerald-600">
                      (Gudang {verifiedMasterItem.warehouse || 'G/A'} - {verifiedMasterItem.total_pcs || verifiedMasterItem.qty_pcs || 0} pcs)
                    </span>
                  </div>
                ) : targetItemCode.trim().length >= 2 ? (
                  <p className="text-[11px] text-amber-600 mt-1">
                    ℹ Kode &quot;{targetItemCode.trim().toUpperCase()}&quot; belum terdaftar di Master Stok (tetap dapat disimpan sebagai kode manual).
                  </p>
                ) : null}
              </div>
            </div>

            {/* Bottom Actions for Step 1 */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  selectedVariants.length === 0 ||
                  !targetItemCode.trim() ||
                  isSearching
                }
                onClick={() => setStep('preview')}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer"
              >
                <span>Lanjut ke Pratinjau ({selectedVariants.length} Varian)</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW DIFF & CONFIRMATION */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Pratinjau Perubahan Kode Barang
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Harap periksa daftar varian sebelum menerapkan perubahan permanen.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Kode Target Baru:</div>
                  <div className="font-mono font-extrabold text-violet-700 text-sm">
                    {targetItemCode.trim().toUpperCase()}
                  </div>
                </div>
              </div>

              {verifiedMasterItem && (
                <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 mt-2">
                  Terhubung ke Barang Master: <strong>{verifiedMasterItem.item_name}</strong>
                </div>
              )}
            </div>

            {/* Tabel Pratinjau Perubahan */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Produk & Variasi</th>
                      <th className="py-2.5 px-3">SKU Marketplace</th>
                      <th className="py-2.5 px-3 text-center">Kode Lama</th>
                      <th className="py-2.5 px-3 text-center">Arah</th>
                      <th className="py-2.5 px-3 text-center">Kode Baru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedVariants.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900">{item.item_name}</div>
                          <div className="text-[11px] text-slate-500">
                            Variasi: <span className="font-medium text-slate-700">{item.model_name || '-'}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                          {item.sku || '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-[11px]">
                          {item.manual_item_code ? (
                            <span className="text-slate-600 line-through">
                              {item.manual_item_code}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Belum Diatur</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center text-violet-600 font-bold">
                          ➔
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-xs font-bold text-emerald-700 bg-emerald-50/50">
                          {targetItemCode.trim().toUpperCase()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 text-xs text-slate-600 flex justify-between items-center">
                <span>
                  Total Varian yang Akan Diperbarui: <strong className="text-slate-900 font-bold">{selectedVariants.length}</strong>
                </span>
                <span className="text-[11px] text-slate-500">
                  Cache audit stok akan otomatis disegarkan seketika.
                </span>
              </div>
            </div>

            {/* Bottom Actions for Step 2 */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep('select')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                ← Kembali ke Pilihan
              </button>
              <button
                type="button"
                disabled={isSubmitting || selectedVariants.length === 0}
                onClick={handleExecuteBulkMap}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Menyimpan {selectedVariants.length} Varian...</span>
                  </>
                ) : (
                  <span>Konfirmasi & Terapkan ({selectedVariants.length} Varian)</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
