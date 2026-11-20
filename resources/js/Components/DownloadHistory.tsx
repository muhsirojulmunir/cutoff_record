import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ExportLog {
  id: number;
  file_name: string;
  module: string;
  description: string | null;
  exported_at: string;
  /** Berkasnya masih tersimpan sehingga bisa diunduh ulang. */
  downloadable: boolean;
}

interface Props {
  /** Dinaikkan setiap kali ada unduhan baru agar panel ikut menyegarkan isinya. */
  refreshKey?: number;
  /** Tema tampilan tombol dan lencana. */
  variant?: 'default' | 'shopee' | 'tiktok';
}

function formatModuleName(module: string): string {
  switch (module.toLowerCase()) {
    case 'shopee_orders':
    case 'shopee':
      return 'Pesanan Shopee';
    case 'tiktok_orders':
    case 'tiktok':
      return 'Pesanan TikTok';
    case 'sales_orders':
      return 'Sales Order';
    case 'cut_off_orders':
      return 'Pesanan Cut Off';
    default:
      return module.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

const fmtDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
};

const fmtTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' WIB';
  } catch {
    return '';
  }
};

/** Kelompokkan berdasarkan tanggal supaya riwayat panjang tetap mudah dibaca. */
function groupByDate(logs: ExportLog[]): { label: string; items: ExportLog[] }[] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const groups = new Map<string, ExportLog[]>();

  for (const log of logs) {
    const day = new Date(log.exported_at).toDateString();
    const label = day === today ? 'Hari Ini' : day === yesterday ? 'Kemarin' : fmtDate(log.exported_at);

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(log);
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

/**
 * Panel Riwayat Download.
 *
 * Menampilkan file export yang pernah diunduh pengguna beserta tanggal dan
 * jamnya. Data diambil saat panel dibuka, jadi tidak membebani pemuatan
 * halaman yang belum tentu dipakai.
 */
export default function DownloadHistory({ refreshKey = 0, variant = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isShopee = variant === 'shopee';
  const isTiktok = variant === 'tiktok';
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/export-logs', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });

      if (!response.ok) throw new Error('Gagal memuat riwayat.');

      const data = await response.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Riwayat gagal dimuat. Coba buka lagi.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Muat jumlah riwayat sekali di awal supaya lencana langsung terisi.
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  const grouped = groupByDate(logs);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`relative inline-flex items-center gap-2 rounded-xl font-semibold border transition-all ${
          isShopee
            ? open
              ? 'bg-[#FFF5F2] text-[#EE4D2D] border-[#EE4D2D] px-3.5 py-2 text-xs shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3.5 py-2 text-xs shadow-xs'
            : isTiktok
              ? open
                ? 'bg-slate-900 text-white border-slate-900 px-3.5 py-2 text-xs shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3.5 py-2 text-xs shadow-xs'
              : open
                ? 'bg-blue-50 text-blue-700 border-blue-400 px-4 py-2 text-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400 px-4 py-2 text-sm'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Riwayat Download</span>
        {total > 0 && (
          <span
            className={`min-w-[1.25rem] h-4.5 px-1.5 inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold ${
              isShopee ? 'bg-[#EE4D2D]' : isTiktok ? 'bg-[#FE2C55]' : 'bg-blue-600'
            }`}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[440px] sm:w-[480px] max-h-[75vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-900">Riwayat Download</p>
                <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {total} Berkas
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Maksimal 10 berkas unduhan terakhir Anda tersimpan otomatis.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
              title="Tutup riwayat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-xs text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 animate-spin text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>Memuat riwayat unduhan…</span>
            </div>
          )}

          {!loading && error && (
            <div className="px-5 py-8 text-center text-xs">
              <p className="text-rose-600 font-medium">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="px-5 py-10 text-center">
              <span className="inline-flex p-2.5 rounded-xl bg-slate-100 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </span>
              <p className="text-sm font-medium text-slate-600 mt-3">Belum ada unduhan</p>
              <p className="text-[11px] text-slate-400 mt-1">
                File yang Anda export akan tercatat di sini.
              </p>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="overflow-y-auto sidebar-scroll max-h-[24rem]">
              {grouped.map((group) => (
                <div key={group.label}>
                  <div className="px-5 py-1.5 bg-slate-100/70 border-y border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-600 sticky top-0 backdrop-blur-xs">
                    {group.label}
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {group.items.map((log) => (
                      <li key={log.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          {/* File Details */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* XLS Icon */}
                            <div className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] shadow-2xs">
                              XLS
                            </div>

                            <div className="min-w-0 flex-1">
                              {/* Filename: clean truncate without awkward character wraps */}
                              <p
                                className="text-xs font-semibold text-slate-900 font-mono truncate"
                                title={log.file_name}
                              >
                                {log.file_name}
                              </p>

                              {/* Metadata line: Module + Time */}
                              <div className="mt-1 flex items-center flex-wrap gap-1.5 text-[11px] text-slate-500">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-[10px] text-slate-700 border border-slate-200">
                                  {formatModuleName(log.module)}
                                </span>
                                <span>•</span>
                                <span className="text-slate-500 font-medium text-[11px]">
                                  {fmtDate(log.exported_at)} · {fmtTime(log.exported_at)}
                                </span>
                              </div>

                              {/* Description / Summary */}
                              {log.description && (
                                <p className="mt-1 text-[11px] text-slate-500 line-clamp-1" title={log.description}>
                                  {log.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="shrink-0">
                            {log.downloadable ? (
                              <a
                                href={`/export-logs/${log.id}/download`}
                                title="Unduh ulang berkas ini"
                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors ${
                                  isShopee
                                    ? 'bg-[#EE4D2D] hover:bg-[#d94122]'
                                    : isTiktok
                                      ? 'bg-slate-900 hover:bg-slate-800'
                                      : 'bg-[#0B132B] hover:bg-slate-800'
                                }`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                <span>Download</span>
                              </a>
                            ) : (
                              <span
                                title="Berkas lama sudah dihapus otomatis dari disk"
                                className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-400 border border-slate-200"
                              >
                                Terhapus
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
