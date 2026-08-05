import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ExportLog {
  id: number;
  file_name: string;
  module: string;
  description: string | null;
  exported_at: string;
}

interface Props {
  /** Dinaikkan setiap kali ada unduhan baru agar panel ikut menyegarkan isinya. */
  refreshKey?: number;
}

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtTime = (value: string) =>
  new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

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
export default function DownloadHistory({ refreshKey = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
          open
            ? 'bg-teal-50 text-teal-700 border-teal-400'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Riwayat Download
        {total > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-teal-600 text-white text-[10px] font-bold">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-h-[70vh] flex flex-col bg-white border border-gray-300 rounded-2xl shadow-xl overflow-hidden z-50">
          <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
            <p className="text-sm font-bold text-gray-900">Riwayat Download</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              File export yang pernah Anda unduh
            </p>
          </div>

          {loading && (
            <p className="px-5 py-8 text-center text-xs text-gray-400">Memuat riwayat…</p>
          )}

          {!loading && error && (
            <p className="px-5 py-8 text-center text-xs text-rose-600">{error}</p>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="px-5 py-10 text-center">
              <span className="inline-flex p-2.5 rounded-xl bg-gray-100 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </span>
              <p className="text-sm text-gray-500 mt-3">Belum ada unduhan</p>
              <p className="text-[11px] text-gray-400 mt-1">
                File yang Anda export akan tercatat di sini.
              </p>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="overflow-y-auto sidebar-scroll">
              {grouped.map((group) => (
                <div key={group.label}>
                  <p className="px-5 py-1.5 bg-gray-50/80 border-y border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky top-0">
                    {group.label}
                  </p>

                  <ul className="divide-y divide-gray-100">
                    {group.items.map((log) => (
                      <li key={log.id} className="px-5 py-3 hover:bg-teal-50/40 transition-colors">
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-teal-50 text-teal-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 font-mono break-all leading-snug">
                              {log.file_name}
                            </p>
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-[10px] font-semibold text-gray-600">
                                {log.module}
                              </span>
                              <span className="text-[11px] text-gray-500 font-mono">
                                {fmtDate(log.exported_at)} · {fmtTime(log.exported_at)}
                              </span>
                            </div>
                            {log.description && (
                              <p className="text-[10px] text-gray-400 mt-1">{log.description}</p>
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
