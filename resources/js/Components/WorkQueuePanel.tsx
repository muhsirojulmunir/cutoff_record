import { Link, usePage } from '@inertiajs/react';

import { PageProps, WorkQueueSeverity } from '../Types';

const SEVERITY_STYLES: Record<WorkQueueSeverity, { card: string; accent: string; label: string }> = {
  critical: { card: 'border-rose-500/25 bg-rose-500/5 hover:border-rose-500/50', accent: 'text-rose-400', label: 'Perlu Approval' },
  warning: { card: 'border-amber-400/25 bg-amber-400/5 hover:border-amber-400/50', accent: 'text-amber-400', label: 'Perlu Ditindak' },
  info: { card: 'border-slate-800 bg-slate-900 hover:border-violet-500/40', accent: 'text-violet-400', label: 'Informasi' },
};

/**
 * Panel pengingat kerja di Dashboard. Datanya berasal dari shared prop
 * `workQueue` sehingga selalu sinkron dengan lonceng di topbar.
 */
export default function WorkQueuePanel() {
  const { workQueue } = usePage<PageProps>().props;
  const queue = workQueue ?? { items: [], total: 0, critical: 0 };

  if (queue.items.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-3">
        <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-200">Tidak ada tugas tertunda</p>
          <p className="text-xs text-slate-500 mt-0.5">Semua pengajuan yang menjadi tanggung jawab Anda sudah diproses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Pengingat Kerja</h2>
          <p className="text-sm text-slate-300 mt-1">
            Ada <span className="font-bold text-white">{queue.total}</span> item menunggu tindakan Anda
          </p>
        </div>
        {queue.critical > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
            {queue.critical} Mendesak
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {queue.items.map((item) => {
          const styles = SEVERITY_STYLES[item.severity];
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`block p-4 rounded-xl border transition-colors ${styles.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{styles.label}</p>
                  <p className="text-sm font-semibold text-slate-100 mt-1 truncate">{item.title}</p>
                </div>
                <span className={`shrink-0 text-xl font-extrabold font-mono ${styles.accent}`}>{item.count}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">{item.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
