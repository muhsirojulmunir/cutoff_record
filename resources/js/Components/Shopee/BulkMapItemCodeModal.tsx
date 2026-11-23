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

/**
 * Ekstraksi ukuran sepatu dari nama variasi (model_name) atau SKU.
 * Menghilangkan satuan cm/mm terlebih dahulu agar tidak salah mendeteksi panjang cm (misal: 24.5cm).
 * Mendukung rentang ukuran sepatu umum di Indonesia: 20 s/d 50.
 */
export function extractShoeSize(modelName?: string | null, sku?: string | null): string | null {
  const sanitize = (str: string) => str.replace(/\d+(\.\d+)?\s*(cm|mm)/gi, ' ');

  if (modelName) {
    const cleaned = sanitize(modelName);
    const m = cleaned.match(/\b(2[0-9]|3[0-9]|4[0-9]|5[0])\b/);
    if (m) return m[1];
  }

  if (sku) {
    const cleaned = sanitize(sku);
    const mSku =
      cleaned.match(/[-_](2[0-9]|3[0-9]|4[0-9]|5[0])\b/) ||
      cleaned.match(/\b(2[0-9]|3[0-9]|4[0-9]|5[0])\b/);
    if (mSku) return mSku[1];
  }

  return null;
}

/**
 * Menghitung kode barang cerdas berdasarkan kode dasar inputan dan ukuran sepatu varian target.
 *
 * Contoh 1 (Input ada akhiran ukuran):
 * Base "01279139", Target Size "40" => "01279140"
 * Base "01279139", Target Size "41" => "01279141"
 *
 * Contoh 2 (Input hanya prefix artikel):
 * Base "012791", Target Size "40" => "01279140"
 */
export function computeSmartCode(baseInput: string, targetSize: string | null): string {
  const clean = baseInput.trim().toUpperCase();
  if (!clean) return '';
  if (!targetSize) return clean;

  // Cek apakah 2 digit terakhir dari baseInput adalah ukuran sepatu (20-50)
  const matchEndSize = clean.match(/^(.*?)(\b|(?<=[a-zA-Z0-9]))(2[0-9]|3[0-9]|4[0-9]|5[0])$/);
  if (matchEndSize) {
    const prefix = matchEndSize[1];
    return `${prefix}${targetSize}`;
  }

  // Jika input berupa prefix artikel murni tanpa ukuran, langsung tambahkan ukuran target
  return `${clean}${targetSize}`;
}

/**
 * Menghitung SKU baru dengan mengganti suffix kode lama setelah '_' dengan kode baru.
 * Contoh: "RECORD-BLANCO-H-39_01246239" + "01279139" => "RECORD-BLANCO-H-39_01279139"
 */
export function computeUpdatedSku(oldSku?: string | null, newCode?: string | null): string {
  const cleanCode = (newCode || '').trim().toUpperCase();
  if (!oldSku || !oldSku.trim()) return cleanCode;
  const cleanSku = oldSku.trim();
  if (!cleanCode) return cleanSku;

  const lastUnderscoreIdx = cleanSku.lastIndexOf('_');
  if (lastUnderscoreIdx !== -1) {
    const prefix = cleanSku.substring(0, lastUnderscoreIdx + 1);
    return `${prefix}${cleanCode}`;
  }

  return `${cleanSku}_${cleanCode}`;
}

export function getSkuPrefix(sku?: string | null): string {
  if (!sku) return '';
  const lastIdx = sku.lastIndexOf('_');
  if (lastIdx !== -1) {
    return sku.substring(0, lastIdx + 1);
  }
  return `${sku}_`;
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
  // State pencarian
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<VariantItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Mode Smart Size Matcher & Kode Barang per baris
  const [isSmartSizeEnabled, setIsSmartSizeEnabled] = useState(true);
  const [baseItemCode, setBaseItemCode] = useState('');
  const [rowItemCodes, setRowItemCodes] = useState<Record<number, string>>({});

  // Verifikasi Master Stok
  const [isVerifyingMaster, setIsVerifyingMaster] = useState(false);
  const [verifiedMasterItem, setVerifiedMasterItem] = useState<MasterStockItem | null>(null);

  // Workflow step: 'select' (cari & atur kode) | 'preview' (pratinjau diff sebelum simpan)
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
      setBaseItemCode('');
      setRowItemCodes({});
      setIsSmartSizeEnabled(true);
      setVerifiedMasterItem(null);
      setStep('select');
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [show]);

  // Eksekusi kalkulasi kode ke seluruh baris
  const applyCodeToVariants = useCallback(
    (base: string, smart: boolean, targetItems: VariantItem[]) => {
      const clean = base.trim().toUpperCase();
      if (!clean) return;

      setRowItemCodes((prev) => {
        const next = { ...prev };
        for (const item of targetItems) {
          if (smart) {
            const size = extractShoeSize(item.model_name, item.sku);
            next[item.id] = computeSmartCode(clean, size);
          } else {
            next[item.id] = clean;
          }
        }
        return next;
      });
    },
    []
  );

  // Debounced search for variants
  const performSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setSearchResults([]);
        setSelectedIds(new Set());
        setRowItemCodes({});
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setErrorMessage(null);
      try {
        const url = `${searchEndpoint}?q=${encodeURIComponent(trimmed)}`;
        const resp = await fetch(url, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const json = await resp.json();
        if (json.status === 'success' && Array.isArray(json.data)) {
          const items: VariantItem[] = json.data;
          setSearchResults(items);
          // Default: select all found variants
          setSelectedIds(new Set(items.map((item) => item.id)));

          // Jika baseItemCode sudah terisi, langsung hitung kode untuk varian yang baru ditemukan
          if (baseItemCode.trim()) {
            applyCodeToVariants(baseItemCode, isSmartSizeEnabled, items);
          }
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
    [searchEndpoint, baseItemCode, isSmartSizeEnabled, applyCodeToVariants]
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
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const json = await resp.json();
        const items: MasterStockItem[] = json.data || json.items || [];
        const exact =
          items.find((m) => m?.item_code?.trim().toUpperCase() === trimmed) || items[0] || null;
        setVerifiedMasterItem(exact);
      } catch {
        setVerifiedMasterItem(null);
      } finally {
        setIsVerifyingMaster(false);
      }
    },
    [searchMasterEndpoint]
  );

  const handleBaseCodeChange = (val: string) => {
    setBaseItemCode(val);
    applyCodeToVariants(val, isSmartSizeEnabled, searchResults);

    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = window.setTimeout(() => {
      verifyMasterStock(val);
    }, 350);
  };

  const handleToggleSmartSize = (enabled: boolean) => {
    setIsSmartSizeEnabled(enabled);
    if (baseItemCode.trim()) {
      applyCodeToVariants(baseItemCode, enabled, searchResults);
    }
  };

  // Ubah kode target per baris secara mandiri
  const handleRowCodeChange = (id: number, val: string) => {
    setRowItemCodes((prev) => ({
      ...prev,
      [id]: val.toUpperCase(),
    }));
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

  // Fitur Pintar: Pilih hanya varian ini (untuk ubah satuan saja, misal ukuran 41 saja)
  const handleSelectOnlyThis = (id: number) => {
    setSelectedIds(new Set([id]));
  };

  // Varian yang terpilih untuk diproses
  const selectedVariants = useMemo(
    () => searchResults.filter((item) => selectedIds.has(item.id)),
    [searchResults, selectedIds]
  );

  // Submit bulk map (hanya mengirim baris yang dicentang / terpilih)
  const handleExecuteBulkMap = async () => {
    if (selectedVariants.length === 0) {
      setErrorMessage('Pilih minimal 1 varian untuk diubah.');
      return;
    }

    // Bangun payload mappings: [{id, item_code, sku}]
    const mappings = selectedVariants.map((item) => {
      const customCode = (rowItemCodes[item.id] || baseItemCode || item.manual_item_code || '')
        .trim()
        .toUpperCase();
      const updatedSku = computeUpdatedSku(item.sku, customCode);

      return {
        id: item.id,
        item_code: customCode,
        sku: updatedSku,
      };
    });

    const emptyItems = mappings.filter((m) => !m.item_code);
    if (emptyItems.length > 0) {
      setErrorMessage('Masih ada varian terpilih yang belum memiliki Kode Barang Target.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const resp = await fetch(bulkMapEndpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          mappings,
        }),
      });

      const resJson = await resp.json();
      if (resJson.status === 'success') {
        const displayCode =
          mappings.length === 1
            ? mappings[0].item_code
            : baseItemCode.trim().toUpperCase() || mappings[0].item_code;
        onSuccess(resJson.updated_count || mappings.length, displayCode);
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
      title={`Ubah Kode Barang Varian (${platformLabel}) — Smart Size Matcher`}
      maxWidth="5xl"
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

        {/* STEP 1: SELECT & CONFIGURE */}
        {step === 'select' && (
          <div className="space-y-4">
            {/* Box 1: Pencarian Varian Produk */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    1. Cari Varian Produk yang Ingin Diubah
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ketik SKU, Nama Produk, atau Model (misal: <strong>blanco-h</strong>, <strong>KYLIE</strong>, atau <strong>012791</strong>).
                  </p>
                </div>
                {searchResults.length > 0 && (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      Ditemukan: <strong className="text-slate-900">{searchResults.length}</strong> varian
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      Terpilih: <strong className="text-emerald-900">{selectedIds.size}</strong> varian
                    </span>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Ketik kata kunci SKU / nama produk / artikel sepatu..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 shadow-2xs"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <svg className="animate-spin h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none">
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
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 z-10">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                searchResults.length > 0 &&
                                selectedIds.size === searchResults.length
                              }
                              onChange={toggleSelectAll}
                              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
                              title="Pilih / Batal Semua"
                            />
                          </th>
                          <th className="py-2.5 px-3 min-w-[200px]">Produk & Variasi</th>
                          <th className="py-2.5 px-2.5 text-center w-24">Ukuran</th>
                          <th className="py-2.5 px-3 min-w-[200px]">
                            SKU Marketplace{' '}
                            <span className="text-[10px] text-blue-600 font-semibold">(Otomatis Ikut Berubah)</span>
                          </th>
                          <th className="py-2.5 px-3 text-center min-w-[100px]">Kode Saat Ini</th>
                          <th className="py-2.5 px-3 min-w-[140px]">
                            Kode Target Baru{' '}
                            <span className="text-[10px] text-slate-400 lowercase font-normal">(bisa diedit)</span>
                          </th>
                          <th className="py-2.5 px-3 text-center w-28">Aksi Cepat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {searchResults.map((item) => {
                          const isChecked = selectedIds.has(item.id);
                          const detectedSize = extractShoeSize(item.model_name, item.sku);
                          const rowCode = rowItemCodes[item.id] || '';
                          const updatedSku = computeUpdatedSku(item.sku, rowCode);

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                isChecked ? 'bg-blue-50/30' : 'opacity-70 hover:opacity-100'
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleItem(item.id)}
                                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
                                />
                              </td>

                              {/* Nama Produk & Variasi */}
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-900 line-clamp-1">
                                  {item.item_name}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Variasi:{' '}
                                  <span className="font-semibold text-slate-700">
                                    {item.model_name || '-'}
                                  </span>
                                </div>
                              </td>

                              {/* Ukuran Sepatu Terdeteksi */}
                              <td className="py-2.5 px-2.5 text-center">
                                {detectedSize ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-bold font-mono">
                                    Size {detectedSize}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px]">
                                    Umum
                                  </span>
                                )}
                              </td>

                              {/* SKU Marketplace (Live Update Suffix Mengikuti Kode Baru) */}
                              <td className="py-2.5 px-3 font-mono">
                                {rowCode ? (
                                  <div>
                                    <div className="text-[11px] font-bold text-slate-900 select-all flex items-center flex-wrap gap-0.5">
                                      <span className="text-slate-600">{getSkuPrefix(item.sku)}</span>
                                      <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-300 shadow-2xs">
                                        {rowCode}
                                      </span>
                                    </div>
                                    {item.sku && item.sku !== updatedSku && (
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                                        <span className="text-slate-400">Lama:</span>
                                        <span className="line-through">{item.sku}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-700 select-all">
                                    {item.sku || '-'}
                                  </div>
                                )}
                              </td>

                              {/* Kode Lama Saat Ini */}
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {item.manual_item_code ? (
                                  <span className="inline-flex items-center rounded bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px] font-bold font-mono">
                                    {item.manual_item_code}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium">
                                    Belum Diatur
                                  </span>
                                )}
                              </td>

                              {/* Input Kode Target Baru per Baris */}
                              <td className="py-2.5 px-3">
                                <input
                                  type="text"
                                  maxLength={50}
                                  value={rowCode}
                                  onChange={(e) => handleRowCodeChange(item.id, e.target.value)}
                                  placeholder={
                                    baseItemCode ? 'Sesuai aturan...' : 'Isi kode target...'
                                  }
                                  className={`w-full rounded-lg border px-2.5 py-1 font-mono text-xs font-bold uppercase shadow-2xs transition-colors ${
                                    isChecked
                                      ? 'border-blue-400 bg-white text-blue-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                                      : 'border-slate-200 bg-slate-50 text-slate-400'
                                  }`}
                                />
                              </td>

                              {/* Aksi Cepat: Pilih Hanya Baris Ini */}
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleSelectOnlyThis(item.id)}
                                  className="rounded-lg border border-slate-200 bg-white hover:bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                                  title="Uncheck semua varian lain dan hanya ubah varian ini saja"
                                >
                                  Hanya Ubah Ini
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer Tabel Seleksi */}
                  <div className="bg-slate-50/90 px-3 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                    <div>
                      Terpilih:{' '}
                      <strong className="text-slate-900 font-bold">{selectedIds.size}</strong> dari{' '}
                      {searchResults.length} varian
                      {selectedIds.size === 1 && (
                        <span className="ml-2 inline-flex items-center text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ✓ Mode Satuan (Hanya 1 varian ini yang akan diubah)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-slate-700 hover:text-slate-950 font-semibold cursor-pointer underline"
                      >
                        {selectedIds.size === searchResults.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                  Tidak ditemukan varian produk yang cocok dengan kata kunci &quot;<strong>{searchQuery}</strong>&quot;.
                </div>
              )}
            </div>

            {/* Box 2: Pengaturan Kode Barang Baru & Smart Size Matcher */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Masukkan Kode Barang Master Yang Benar.
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ketik kode dasar / salah satu varian (misal: <strong>01279139</strong> atau <strong>012791</strong>). Sistem otomatis menyesuaikan 2 digit terakhir kode barang dan <strong>otomatis memperbarui akhiran SKU Marketplace</strong>.
                  </p>
                </div>

                {/* Toggle Smart Size Matcher */}
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    ✨ Smart Size Matcher:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleSmartSize(!isSmartSizeEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isSmartSizeEnabled ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isSmartSizeEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-extrabold ${
                      isSmartSizeEnabled ? 'text-blue-700' : 'text-slate-500'
                    }`}
                  >
                    {isSmartSizeEnabled ? 'Aktif' : 'Nonaktif (Seragam)'}
                  </span>
                </div>
              </div>

              {/* Input Kode Master & Tombol Terapkan Ulang */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  maxLength={50}
                  value={baseItemCode}
                  onChange={(e) => handleBaseCodeChange(e.target.value)}
                  placeholder="Ketik kode (misal: 01279139 atau 012791)..."
                  className="flex-1 sm:w-80 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-xs font-bold text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 shadow-2xs uppercase"
                />

                <button
                  type="button"
                  disabled={!baseItemCode.trim() || searchResults.length === 0}
                  onClick={() => applyCodeToVariants(baseItemCode, isSmartSizeEnabled, searchResults)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
                  title="Terapkan kembali pola kode ke seluruh baris tabel"
                >
                  <span>⚡ Terapkan ke Tabel</span>
                </button>
              </div>

              {/* Status Live Lookup Master Stok */}
              {isVerifyingMaster ? (
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                  <svg className="animate-spin h-3.5 w-3.5 text-slate-600" viewBox="0 0 24 24" fill="none">
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
                    (Gudang {verifiedMasterItem.warehouse || 'G/A'} -{' '}
                    {verifiedMasterItem.total_pcs || verifiedMasterItem.qty_pcs || 0} pcs)
                  </span>
                </div>
              ) : baseItemCode.trim().length >= 2 ? (
                <p className="text-[11px] text-slate-500 mt-1">
                  ℹ Kode dasar &quot;{baseItemCode.trim().toUpperCase()}&quot; akan digunakan sebagai pola kode variasi. Anda tetap dapat mengedit kode per baris di tabel atas jika diperlukan.
                </p>
              ) : null}
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
                  isSearching ||
                  selectedVariants.some((v) => !(rowItemCodes[v.id] || baseItemCode)?.trim())
                }
                onClick={() => setStep('preview')}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer active:scale-98"
              >
                <span>Lanjut ke Pratinjau ({selectedVariants.length} Varian Terpilih)</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW DIFF & CONFIRMATION */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Pratinjau Perubahan Kode Barang & SKU Marketplace
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Harap tinjau kode baru dan pembaruan SKU untuk setiap varian sebelum disimpan.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[11px] text-slate-500">Jumlah Target Update:</span>
                  <div className="font-bold text-slate-900 text-sm">
                    {selectedVariants.length} Varian Terpilih
                  </div>
                </div>
              </div>

              {/* Mode Alert */}
              {selectedVariants.length === 1 ? (
                <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="font-bold text-emerald-700">✓ Mode Satuan:</span>
                  <span>
                    Hanya <strong>1 varian ini</strong> yang akan diperbarui (Kode Barang & SKU). Seluruh varian ukuran lainnya <u>tetap menggunakan kode dan SKU lama tanpa tersentuh</u>.
                  </span>
                </div>
              ) : (
                <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="font-bold text-blue-700">ℹ Mode Massal:</span>
                  <span>
                    Sebanyak <strong>{selectedVariants.length} varian</strong> akan diperbarui Kode Barang dan SKU Marketplace masing-masing sesuai tabel di bawah.
                  </span>
                </div>
              )}
            </div>

            {/* Tabel Pratinjau Perubahan */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 z-10">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[180px]">Produk & Variasi</th>
                      <th className="py-2.5 px-2 text-center w-20">Ukuran</th>
                      <th className="py-2.5 px-3 min-w-[220px]">SKU Marketplace (Lama ➔ Baru)</th>
                      <th className="py-2.5 px-3 text-center min-w-[140px]">Kode Barang (Lama ➔ Baru)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedVariants.map((item) => {
                      const detectedSize = extractShoeSize(item.model_name, item.sku);
                      const targetCode = (rowItemCodes[item.id] || baseItemCode).trim().toUpperCase();
                      const updatedSku = computeUpdatedSku(item.sku, targetCode);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          {/* Nama Produk & Model */}
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900 line-clamp-1">
                              {item.item_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Variasi:{' '}
                              <span className="font-semibold text-slate-700">
                                {item.model_name || '-'}
                              </span>
                            </div>
                          </td>

                          {/* Ukuran */}
                          <td className="py-2.5 px-2 text-center">
                            {detectedSize ? (
                              <span className="inline-flex items-center rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-bold font-mono">
                                Size {detectedSize}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px]">
                                Umum
                              </span>
                            )}
                          </td>

                          {/* SKU Lama ➔ Baru */}
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {item.sku ? (
                              <div>
                                <div className="text-slate-400 line-through text-[10px]">{item.sku}</div>
                                <div className="text-blue-700 font-bold text-xs mt-0.5 flex items-center gap-1">
                                  <span>➔</span>
                                  <span>{updatedSku}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-blue-700 font-bold text-xs">{updatedSku}</div>
                            )}
                          </td>

                          {/* Kode Lama ➔ Baru */}
                          <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                            <div className="text-slate-400 line-through text-[10px]">
                              {item.manual_item_code || 'Belum Diatur'}
                            </div>
                            <div className="text-emerald-700 font-bold text-xs mt-0.5 flex items-center justify-center gap-1">
                              <span>➔</span>
                              <span>{targetCode}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 text-xs text-slate-600 flex justify-between items-center">
                <span>
                  Total Varian yang Akan Disimpan: <strong className="text-slate-900 font-bold">{selectedVariants.length}</strong>
                </span>
                <span className="text-[11px] text-slate-500">
                  Kode Barang dan SKU Marketplace akan diperbarui seketika.
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
                    <span>Menyimpan {selectedVariants.length} Varian & SKU...</span>
                  </>
                ) : (
                  <span>Konfirmasi & Simpan ({selectedVariants.length} Varian & SKU)</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
