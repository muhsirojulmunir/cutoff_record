import { useEffect, useRef, useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';

import { PageProps, WorkQueue, WorkQueueSeverity, WorkQueueType } from '../Types';

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
  critical: { icon: 'text-rose-600 bg-rose-50', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  warning: { icon: 'text-amber-700 bg-amber-50', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { icon: 'text-teal-600 bg-teal-50', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
};

export default function NotificationBell({ queue }: Props) {
  const { auth } = usePage<PageProps>().props;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = Boolean(auth?.user?.is_super_admin || auth?.user?.role?.name === 'Super Admin');
  const visibleItems = isSuperAdmin
    ? queue.items
    : queue.items.filter(
        (item) => item.key !== 'shopee_critical_oos' && item.key !== 'shopee_stock_discrepancy'
      );
  const visibleTotal = visibleItems.length;
  const hasCritical = visibleItems.some((item) => item.severity === 'critical');
  const badgeLabel = visibleTotal > 99 ? '99+' : String(visibleTotal);

  const handleZeroOutCritical = () => {
    setOpen(false);
    if (window.location.pathname === '/shopee-products') {
      window.dispatchEvent(new CustomEvent('shopee:zero-out-critical'));
    } else {
      router.visit('/shopee-products?stock_status=oos_critical&open_zero_out=1');
    }
  };

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
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Notifikasi"
        aria-label={`Notifikasi${visibleTotal > 0 ? `, ${visibleTotal} item` : ''}`}
        className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
          open
            ? 'text-slate-900 bg-slate-100 border-slate-300'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border-slate-200 hover:border-slate-300 bg-white'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {visibleTotal > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white shadow-2xs ${
              hasCritical ? 'bg-rose-600' : 'bg-amber-600'
            }`}
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] sm:w-[390px] max-h-[75vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70 shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Notifikasi</p>
            {visibleTotal > 0 && (
              <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                {visibleTotal}
              </span>
            )}
          </div>

          {visibleItems.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto text-emerald-500/70">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-slate-700 mt-3">Tidak ada notifikasi</p>
              <p className="text-xs text-slate-400 mt-1">Semua stok dan tugas operasional terpantau aman.</p>
            </div>
          ) : (
            <div className="overflow-y-auto sidebar-scroll divide-y divide-slate-100">
              {visibleItems.map((item) => {
                const styles = SEVERITY_STYLES[item.severity];
                if (item.key === 'shopee_critical_oos' && isSuperAdmin) {
                  return (
                    <div key={item.key} className="px-4 py-3.5 hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`shrink-0 p-2 rounded-xl ${styles.icon}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[item.type]} />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                            <span className={`shrink-0 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md border ${styles.badge}`}>
                              {item.count.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.description}</p>
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-semibold transition-colors"
                            >
                              Lihat SKU Kritis
                            </Link>
                            <button
                              type="button"
                              onClick={handleZeroOutCritical}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              <span>Kosongkan di Shopee</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <span className={`shrink-0 p-2 rounded-xl ${styles.icon}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[item.type]} />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-slate-950">{item.title}</p>
                        <span className={`shrink-0 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md border ${styles.badge}`}>
                          {item.count.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.description}</p>
                      {item.key === 'shopee_stock_discrepancy' && (
                        <span className="inline-block mt-1.5 text-[11px] font-semibold text-amber-700 group-hover:text-amber-800">
                          Tampilkan {item.count.toLocaleString('id-ID')} Selisih Stok →
                        </span>
                      )}
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
