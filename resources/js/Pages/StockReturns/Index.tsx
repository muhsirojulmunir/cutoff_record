import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import AppLayout from '../../Layouts/AppLayout';
import Modal from '../../Components/Modal';
import { PageProps } from '../../Types';

interface StockReturnItem {
  id: number;
  return_number: string;
  invoice_number: string;
  product_sku: string;
  product_name: string;
  quantity: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  status_label: string;
  status_color: string;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

interface PaginatedReturns {
  data: StockReturnItem[];
  links: { url: string | null; label: string; active: boolean }[];
  from: number | null;
  to: number | null;
  total: number;
}

interface Props {
  returns: PaginatedReturns;
  filters: { status?: string; search?: string };
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'pending', label: 'Menunggu Approval' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'rejected', label: 'Ditolak' },
];

const statusBadge = (color: string, label: string) => {
  const cls: Record<string, string> = {
    amber:   'bg-amber-500/10 text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    rose:    'bg-rose-500/10 text-rose-400 border-rose-500/30',
    slate:   'bg-slate-700/40 text-slate-400 border-slate-600/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cls[color] ?? cls.slate}`}>
      {label}
    </span>
  );
};

export default function Index({ returns, filters }: Props) {
  const { auth } = usePage<PageProps>().props;
  const canCreate  = auth.user?.permissions?.includes('stock_return.create');
  const canApprove = auth.user?.permissions?.includes('stock_return.approve');
  const isSuperAdmin = auth.user?.role?.name === 'Super Admin' || auth.user?.roles?.includes('Super Admin');

  const [search, setSearch]   = useState(filters.search ?? '');
  const [status, setStatus]   = useState(filters.status ?? '');

  // Modal approve
  const [approvingId, setApprovingId]   = useState<number | null>(null);
  const [approvingNum, setApprovingNum] = useState('');

  // Modal reject
  const [rejectingItem, setRejectingItem]   = useState<StockReturnItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectProcessing, setRejectProcessing] = useState(false);

  function applyFilter(newSearch: string, newStatus: string) {
    router.get('/stock-returns', { search: newSearch, status: newStatus }, { preserveState: true, replace: true });
  }

  function handleApprove() {
    if (!approvingId) return;
    router.post(`/stock-returns/${approvingId}/approve`, {}, {
      onFinish: () => setApprovingId(null),
    });
  }

  function handleReject() {
    if (!rejectingItem || !rejectionReason.trim()) return;
    setRejectProcessing(true);
    router.post(`/stock-returns/${rejectingItem.id}/reject`, { rejection_reason: rejectionReason }, {
      onFinish: () => {
        setRejectProcessing(false);
        setRejectingItem(null);
        setRejectionReason('');
      },
    });
  }

  return (
    <AppLayout>
      <Head title="Return Stok" />

      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Return Stok</h1>
            <p className="text-gray-400 text-xs mt-0.5">Kelola pengajuan return barang dari customer</p>
          </div>
          {(canCreate || isSuperAdmin) && (
            <Link
              href="/stock-returns/create"
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-semibold transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Ajukan Return
            </Link>
          )}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); applyFilter(e.target.value, status); }}
              placeholder="Cari nomor retur, invoice, SKU..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
          </div>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); applyFilter(search, e.target.value); }}
            className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* ── Table Card ── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['No. Return', 'No. Invoice', 'SKU / Produk', 'Qty', 'Keterangan', 'Status', 'Diajukan Oleh', 'Tanggal', 'Aksi'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {returns.data.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto mb-3 text-gray-300">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                      <p className="font-medium text-gray-500">Belum ada retun</p>
                      <p className="text-xs mt-1">Ajukan return pertama Anda</p>
                    </td>
                  </tr>
                ) : returns.data.map(item => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-teal-600 whitespace-nowrap">{item.return_number}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{item.invoice_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 text-xs">{item.product_sku}</div>
                      <div className="text-gray-400 text-xs truncate max-w-[180px]">{item.product_name}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800 whitespace-nowrap">+{item.quantity}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                      <p className="truncate text-xs">{item.reason}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {statusBadge(item.status_color, item.status_label)}
                      {item.status === 'rejected' && item.rejection_reason && (
                        <p className="text-[10px] text-rose-400 mt-1 max-w-[140px] truncate" title={item.rejection_reason}>
                          {item.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{item.requested_by ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{item.requested_at ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.status === 'pending' && (canApprove || isSuperAdmin) && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setApprovingId(item.id); setApprovingNum(item.return_number); }}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => { setRejectingItem(item); setRejectionReason(''); }}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                      {item.status === 'approved' && (
                        <span className="text-xs text-emerald-500 font-medium">✓ {item.approved_by}</span>
                      )}
                      {item.status === 'rejected' && (
                        <span className="text-xs text-rose-400 font-medium">✗ {item.rejected_by}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {returns.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Menampilkan {returns.from}–{returns.to} dari {returns.total} retur
              </p>
              <div className="flex gap-1">
                {returns.links.map((link, i) => (
                  <button
                    key={i}
                    disabled={!link.url}
                    onClick={() => link.url && router.get(link.url)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      link.active
                        ? 'bg-teal-600 text-white'
                        : link.url
                          ? 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                          : 'text-gray-300 cursor-not-allowed'
                    }`}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Konfirmasi Approve ── */}
      <Modal show={approvingId !== null} onClose={() => setApprovingId(null)} title="Konfirmasi Persetujuan Retur">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Setujui Retur <span className="font-mono">{approvingNum}</span>?</p>
              <p className="text-xs text-emerald-600 mt-1">Stok produk akan <strong>langsung bertambah</strong> sesuai qty retur dan tercatat di Stock Movements.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setApprovingId(null)} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-sm font-semibold transition-all">Batal</button>
            <button onClick={handleApprove} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all">Ya, Setujui</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Tolak Retur ── */}
      <Modal show={rejectingItem !== null} onClose={() => setRejectingItem(null)} title="Tolak Retur">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Tolak retur <span className="font-mono font-semibold text-gray-800">{rejectingItem?.return_number}</span>? Stok tidak akan berubah.
          </p>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">Alasan Penolakan <span className="text-rose-500 normal-case font-normal">(wajib)</span></label>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              rows={3}
              placeholder="Contoh: Barang tidak sesuai dengan klaim retur..."
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectingItem(null)} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-sm font-semibold transition-all">Batal</button>
            <button
              onClick={handleReject}
              disabled={rejectProcessing || !rejectionReason.trim()}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all"
            >
              {rejectProcessing ? 'Menolak...' : 'Ya, Tolak'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
