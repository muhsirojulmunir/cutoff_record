import { useEffect, useRef, useState } from 'react';
import { Link } from '@inertiajs/react';

import { WorkQueue, WorkQueueSeverity, WorkQueueType } from '../Types';

interface Props {
  queue: WorkQueue;
}

/** Path Heroicons 24x24 outline per jenis dokumen. */
const TYPE_ICONS: Record<WorkQueueType, string> = {
  purchase_order:
    'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
  sales_order:
    'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  petty_cash:
    'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6',
  invoice:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  factory_receivable:
    'M12 6v12m-3-2.818l.879.879c1.003 1.003 2.63 1.003 3.633 0L14 15m-1.879-8.919l-.621.621c-1.129 1.129-1.129 2.96 0 4.089l.879.879M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  marketplace:
    'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72',
  stock:
    'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
};

const SEVERITY_STYLES: Record<WorkQueueSeverity, { icon: string; badge: string }> = {
  critical: { icon: 'text-rose-400 bg-rose-500/10', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  warning: { icon: 'text-amber-400 bg-amber-400/10', badge: 'bg-amber-400/15 text-amber-400 border-amber-400/30' },
  info: { icon: 'text-violet-400 bg-violet-500/10', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
};

export default function NotificationBell({ queue }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasCritical = queue.critical > 0;
  const badgeLabel = queue.total > 99 ? '99+' : String(queue.total);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Pengingat tugas"
        aria-label={`Pengingat tugas${queue.total > 0 ? `, ${queue.total} menunggu` : ''}`}
        className={`relative p-2 rounded-lg border transition-all ${
          open
            ? 'text-violet-400 bg-violet-600/10 border-violet-500/30'
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {queue.total > 0 && (
          <>
            <span
              className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white ${
                hasCritical ? 'bg-rose-500' : 'bg-amber-500'
              }`}
            >
              {badgeLabel}
            </span>
            {hasCritical && (
              <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-rose-500 animate-ping opacity-60" />
            )}
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-h-[70vh] flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tugas Menunggu Anda</p>
            {queue.total > 0 && (
              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 rounded-full px-2 py-0.5">{queue.total}</span>
            )}
          </div>

          {queue.items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto text-emerald-500/60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-400 mt-3">Tidak ada tugas tertunda</p>
              <p className="text-xs text-slate-600 mt-1">Semua pengajuan sudah diproses.</p>
            </div>
          ) : (
            <div className="overflow-y-auto sidebar-scroll divide-y divide-slate-900">
              {queue.items.map((item) => {
                const styles = SEVERITY_STYLES[item.severity];
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-900 transition-colors group"
                  >
                    <span className={`shrink-0 p-2 rounded-lg ${styles.icon}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[item.type]} />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-white">{item.title}</p>
                        <span className={`shrink-0 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${styles.badge}`}>
                          {item.count}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
