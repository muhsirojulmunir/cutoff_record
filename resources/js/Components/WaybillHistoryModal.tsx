import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayScrollLockAndEscape } from './Shopee/overlayHelpers';

export interface ArchivedWaybill {
  id: number;
  channel: 'shopee' | 'tiktok';
  file_name: string;
  file_path: string;
  file_size: number;
  file_size_formatted: string;
  order_count: number;
  order_sns: string[];
  downloaded_by: number | null;
  downloaded_by_name: string | null;
  downloaded_at: string;
  expires_at: string;
  days_remaining: number;
}

interface PaginatedWaybillResponse {
  data: ArchivedWaybill[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export interface WaybillHistoryModalProps {
  show: boolean;
  onClose: () => void;
  channel: 'shopee' | 'tiktok';
  initialSearch?: string;
}

function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' WIB';
  } catch {
    return dateStr;
  }
}

export default function WaybillHistoryModal({
  show,
  onClose,
  channel,
  initialSearch = '',
}: WaybillHistoryModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ArchivedWaybill[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedSn, setCopiedSn] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const channelLabel = channel === 'shopee' ? 'Shopee' : 'TikTok Shop';
  const apiBase = `/${channel}-orders/waybill-history`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useOverlayScrollLockAndEscape(show, onClose);

  const fetchHistory = useCallback(
    async (page = 1, searchQuery = search) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          per_page: '15',
        });
        if (searchQuery.trim() !== '') {
          params.set('search', searchQuery.trim());
        }

        const res = await fetch(`${apiBase}?${params.toString()}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });

        if (!res.ok) {
          throw new Error(`Gagal memuat riwayat (HTTP ${res.status})`);
        }

        const json = (await res.json()) as PaginatedWaybillResponse;
        setItems(json.data ?? []);
        setCurrentPage(json.current_page ?? 1);
        setLastPage(json.last_page ?? 1);
        setTotal(json.total ?? 0);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal menghubungi server.');
      } finally {
        setLoading(false);
      }
    },
    [apiBase, search]
  );

  useEffect(() => {
    if (show) {
      setSearch(initialSearch);
      void fetchHistory(1, initialSearch);
    }
  }, [show, initialSearch, fetchHistory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchHistory(1, search);
  };

  const handleClearSearch = () => {
    setSearch('');
    void fetchHistory(1, '');
  };

  const handleCopySn = (sn: string) => {
    navigator.clipboard.writeText(sn);
    setCopiedSn(sn);
    setTimeout(() => setCopiedSn(null), 2000);
  };

  if (!show || !mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Riwayat Cetak Resi ${channelLabel}`}
    >
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="relative z-10 my-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B132B] px-5 py-4 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              {/* Document / Archive Icon */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-white">
                  Riwayat Cetak Resi {channelLabel}
                </h3>
                <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-200 border border-blue-400/30">
                  Retensi 90 Hari
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-300">
                Arsip fisik PDF resi disimpan selama 3 bulan sejak dicetak, siap diunduh ulang sewaktu-waktu tanpa membebani database.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Tutup modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar: Search & Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6">
          <form onSubmit={handleSearchSubmit} className="relative flex flex-1 min-w-[240px] max-w-md items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari No. Pesanan (Order SN) atau nama berkas..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-20 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
            />
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-12 text-slate-400 hover:text-slate-600 text-xs font-semibold px-1"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 rounded-lg bg-[#0B132B] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Cari
            </button>
          </form>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Total: <strong className="text-slate-800">{total}</strong> berkas resi</span>
            <button
              type="button"
              onClick={() => void fetchHistory(currentPage, search)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors shadow-2xs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        {/* Modal Body / Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[320px] max-h-[60vh]">
          {errorMsg && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-7 w-7 animate-spin text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span className="text-xs font-medium">Memuat riwayat arsip resi...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-slate-400">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-slate-700">
                {search ? 'Tidak ada berkas resi yang cocok dengan pencarian.' : 'Belum ada riwayat cetak resi tersimpan.'}
              </p>
              <p className="max-w-md text-[11px] text-slate-500">
                Setiap kali Anda mencetak resi (satuan atau massal) untuk pesanan {channelLabel}, salinan PDF fisik akan otomatis tersimpan di sini selama 90 hari.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Nama Berkas & Tipe</th>
                    <th className="px-4 py-3">Nomor Pesanan (Order SN)</th>
                    <th className="px-4 py-3">Waktu Cetak & Admin</th>
                    <th className="px-4 py-3 text-center">Masa Retensi</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((item) => {
                    const isMassal = item.order_count > 1;
                    const isExpanded = expandedId === item.id;
                    const daysRemaining = item.days_remaining;

                    let retentionBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    if (daysRemaining <= 7) {
                      retentionBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                    } else if (daysRemaining <= 21) {
                      retentionBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                    }

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* File Name & Type */}
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                              PDF
                            </span>
                            <div className="min-w-0">
                              <span
                                className="block font-semibold text-slate-800 text-[11px] leading-tight break-all"
                                title={item.file_name}
                              >
                                {item.file_name}
                              </span>
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold border ${isMassal ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                  {isMassal ? `Massal (${item.order_count} Pesanan)` : 'Satuan'}
                                </span>
                                <span>•</span>
                                <span className="tabular-nums font-mono">{item.file_size_formatted}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Order SNs */}
                        <td className="px-4 py-3 align-top">
                          {item.order_sns && item.order_sns.length > 0 ? (
                            <div>
                              {item.order_count === 1 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] font-semibold text-slate-700">
                                    {item.order_sns[0]}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopySn(item.order_sns[0])}
                                    className="text-slate-400 hover:text-slate-700 transition-colors"
                                    title="Salin No. Pesanan"
                                  >
                                    {copiedSn === item.order_sns[0] ? (
                                      <span className="text-[10px] text-emerald-600 font-bold">✓ Tersalin</span>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-3.5 w-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    {item.order_sns.slice(0, 2).map((sn) => (
                                      <span key={sn} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                                        {sn}
                                      </span>
                                    ))}
                                    {item.order_sns.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline decoration-dotted"
                                      >
                                        {isExpanded ? 'Tutup' : `+${item.order_sns.length - 2} lainnya`}
                                      </button>
                                    )}
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                                      <div className="flex flex-wrap gap-1">
                                        {item.order_sns.map((sn) => (
                                          <div
                                            key={sn}
                                            onClick={() => handleCopySn(sn)}
                                            className="group inline-flex cursor-pointer items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700 shadow-2xs hover:bg-blue-50 hover:text-blue-700"
                                            title="Klik untuk salin"
                                          >
                                            <span>{sn}</span>
                                            {copiedSn === sn ? (
                                              <span className="text-[9px] text-emerald-600 font-bold">✓</span>
                                            ) : (
                                              <span className="opacity-0 group-hover:opacity-100 text-[9px] text-slate-400">⎘</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Download Date & User */}
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <span className="block font-medium text-slate-700 text-[11px]">
                            {formatDateIndo(item.downloaded_at)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            Oleh: <span className="text-slate-600 font-medium">{item.downloaded_by_name || 'Admin'}</span>
                          </span>
                        </td>

                        {/* Retention / Expiration Countdown */}
                        <td className="px-4 py-3 align-top text-center whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${retentionBadgeClass}`}>
                            Sisa {daysRemaining} hari
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Preview in tab */}
                            <a
                              href={`/${channel}-orders/waybill-history/${item.id}/download?mode=preview`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
                              title="Buka pratinjau PDF di tab baru"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-3 w-3 text-slate-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span>Lihat</span>
                            </a>

                            {/* Download file */}
                            <a
                              href={`/${channel}-orders/waybill-history/${item.id}/download`}
                              download={item.file_name}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0B132B] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 transition-colors shadow-2xs"
                              title="Unduh berkas PDF fisik"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                              <span>Unduh</span>
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer / Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <span className="text-xs text-slate-500">
            Halaman <strong className="text-slate-800">{currentPage}</strong> dari <strong className="text-slate-800">{lastPage}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => void fetchHistory(currentPage - 1, search)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              ← Sebelumnya
            </button>
            <button
              type="button"
              disabled={currentPage >= lastPage || loading}
              onClick={() => void fetchHistory(currentPage + 1, search)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Berikutnya →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
