import React, { useRef, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Order {
  id: number;
  so_number: string;
  sales_channel: string;
  tracking_number: string | null;
  recipient_name: string | null;
  city: string | null;
  resi_scanned_at: string | null;
  customer: { id: number; name: string } | null;
  resi_scanner: { id: number; name: string } | null;
}

interface Props {
  orders: {
    data: Order[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
  filters: { search?: string; channel?: string; scan_status?: string };
  canScan: boolean;
  summary: { unscanned: number; scanned_today: number };
}

const OFFLINE_CHANNELS = ['manual', 'grosir'];

const CHANNEL_LABEL: Record<string, string> = {
  manual: 'Offline',
  grosir: 'Grosir (Offline)',
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  website: 'Website',
  other: 'Lainnya',
};

const fmtDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export default function Dispatch({ orders, filters, canScan, summary }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [resi, setResi] = useState('');
  const [scanning, setScanning] = useState(false);
  const resiInputRef = useRef<HTMLInputElement>(null);

  function applyFilter(next?: { channel?: string; scan_status?: string }) {
    router.get('/gudang/pengiriman', {
      search,
      channel: next?.channel ?? filters.channel ?? '',
      scan_status: next?.scan_status ?? filters.scan_status ?? '',
    }, { preserveState: true, replace: true });
  }

  /** Validasi resi hasil ketik manual maupun alat pemindai barcode. */
  function submitScan(e: React.FormEvent) {
    e.preventDefault();
    if (resi.trim() === '') return;

    setScanning(true);
    router.post('/gudang/pengiriman/scan', { tracking_number: resi.trim() }, {
      preserveScroll: true,
      onSuccess: () => setResi(''),
      onFinish: () => {
        setScanning(false);
        // Fokus dikembalikan supaya scan berikutnya bisa langsung ditembak.
        resiInputRef.current?.focus();
      },
    });
  }

  function unscan(order: Order) {
    router.post(`/gudang/pengiriman/${order.id}/batal-validasi`, {}, { preserveScroll: true });
  }

  return (
    <AppLayout>
      <Head title="Gudang — Cetak Resi & Validasi Kurir" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gudang — Pengiriman</h1>
          <p className="text-gray-500 text-xs mt-1">
            Cetak resi pesanan offline maupun marketplace, lalu validasi saat paket diserahkan ke kurir
          </p>
        </div>

        {/* Ringkasan */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
            <p className="text-xs font-semibold text-orange-600">Belum Divalidasi</p>
            <p className="text-2xl font-extrabold text-orange-600 mt-1 font-mono">{summary.unscanned}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Paket berresi yang belum discan</p>
          </div>
          <div className="bg-white border border-gray-300/80 rounded-2xl p-4 shadow-xl">
            <p className="text-xs font-semibold text-teal-600">Divalidasi Hari Ini</p>
            <p className="text-2xl font-extrabold text-teal-600 mt-1 font-mono">{summary.scanned_today}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Siap diserahkan ke kurir</p>
          </div>
        </div>

        {/* Kotak scan resi */}
        {canScan && (
          <form onSubmit={submitScan} className="bg-white border border-teal-300 rounded-2xl p-5 shadow-xl">
            <label htmlFor="resi-scan" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Scan / Ketik Nomor Resi
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="resi-scan"
                ref={resiInputRef}
                value={resi}
                onChange={(e) => setResi(e.target.value)}
                placeholder="Tembak barcode resi atau ketik nomornya lalu tekan Enter"
                autoComplete="off"
                autoFocus
                className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
              />
              <button
                type="submit"
                disabled={scanning || resi.trim() === ''}
                className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
              >
                {scanning ? 'Memvalidasi...' : 'Validasi Resi'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Validasi menandakan paket sudah diperiksa gudang dan siap diserahkan ke kurir.
            </p>
          </form>
        )}

        {/* Filter */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
              placeholder="Cari No. SO, resi, atau penerima..."
              className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
            <select
              value={filters.channel ?? ''}
              onChange={(e) => applyFilter({ channel: e.target.value })}
              className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer"
            >
              <option value="">Semua Channel</option>
              <option value="offline">Offline</option>
              <option value="marketplace">Marketplace</option>
            </select>
            <select
              value={filters.scan_status ?? ''}
              onChange={(e) => applyFilter({ scan_status: e.target.value })}
              className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer"
            >
              <option value="">Semua Status</option>
              <option value="unscanned">Belum Divalidasi</option>
              <option value="scanned">Sudah Divalidasi</option>
            </select>
            <button
              type="button"
              onClick={() => applyFilter()}
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 transition-all"
            >
              Cari
            </button>
          </div>
        </div>

        {/* Daftar pengiriman */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                  <th className="px-5 py-3.5">No. SO / Channel</th>
                  <th className="px-5 py-3.5">Penerima</th>
                  <th className="px-5 py-3.5">No. Resi</th>
                  <th className="px-5 py-3.5">Status Validasi</th>
                  <th className="px-5 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 text-sm">
                {orders.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-gray-400">
                      Tidak ada pesanan yang siap dikirim.
                    </td>
                  </tr>
                ) : (
                  orders.data.map((order) => {
                    const isOffline = OFFLINE_CHANNELS.includes(order.sales_channel);
                    const scanned = order.resi_scanned_at !== null;

                    return (
                      <tr key={order.id} className="hover:bg-teal-50/60 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <p className="text-xs font-mono font-bold text-gray-800">{order.so_number}</p>
                          <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                            isOffline
                              ? 'bg-gray-50 border-gray-300 text-gray-600'
                              : 'bg-teal-50 border-teal-200 text-teal-700'
                          }`}>
                            {CHANNEL_LABEL[order.sales_channel] ?? order.sales_channel}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          <p className="text-xs font-semibold text-gray-800">
                            {order.recipient_name ?? order.customer?.name ?? '—'}
                          </p>
                          <p className="text-[10px] text-gray-400">{order.city ?? '—'}</p>
                        </td>

                        <td className="px-5 py-3.5">
                          {order.tracking_number ? (
                            <span className="text-xs font-mono font-bold text-gray-800">{order.tracking_number}</span>
                          ) : (
                            <span className="text-[11px] text-orange-600">Resi belum diisi</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {scanned ? (
                            <>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold bg-teal-50 border-teal-200 text-teal-700">
                                Siap diserahkan
                              </span>
                              <p className="text-[10px] text-gray-400 mt-1">
                                {fmtDateTime(order.resi_scanned_at)} · {order.resi_scanner?.name ?? '—'}
                              </p>
                            </>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold bg-orange-50 border-orange-200 text-orange-700">
                              Belum divalidasi
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/sales-orders/${order.id}/label`}
                              className="px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-[11px] font-semibold transition-all"
                            >
                              Cetak Resi
                            </Link>
                            {canScan && scanned && (
                              <button
                                type="button"
                                onClick={() => unscan(order)}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 text-[11px] font-semibold transition-all"
                              >
                                Batalkan
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {orders.last_page > 1 && (
            <div className="px-5 py-3.5 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
              <span>{orders.from}–{orders.to} dari {orders.total} pesanan</span>
              <div className="flex gap-2">
                {orders.current_page > 1 && (
                  <button onClick={() => router.get('/gudang/pengiriman', { ...filters, page: orders.current_page - 1 })} className="px-3 py-1.5 bg-white rounded-lg hover:bg-teal-50 border border-teal-300 text-teal-700 transition-all">← Sebelumnya</button>
                )}
                {orders.current_page < orders.last_page && (
                  <button onClick={() => router.get('/gudang/pengiriman', { ...filters, page: orders.current_page + 1 })} className="px-3 py-1.5 bg-white rounded-lg hover:bg-teal-50 border border-teal-300 text-teal-700 transition-all">Berikutnya →</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
