import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';
import { downloadSalesOrderList, downloadGrosirTemplateExcel } from '../../Utils/salesOrderExcel';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
}

interface Creator {
  id: number;
  name: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
  order_date: string;
  source: 'manual' | 'marketplace' | 'website' | 'other';
  sales_channel: 'manual' | 'shopee' | 'tiktok' | 'website' | 'other';
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'completed' | 'cancelled';
  payment_status: 'unpaid' | 'partially_paid' | 'paid' | 'refunded';
  grand_total: string;
  customer: Customer | null;
  creator: Creator | null;
}

interface SalesOrderIndexProps {
  salesOrders: {
    data: SalesOrder[];
    links: any[];
    current_page: number;
    total: number;
  };
  filters: {
    search?: string;
    status?: string;
    payment_status?: string;
    source?: string;
    start_date?: string;
    end_date?: string;
  };
}

const statusBadgeColor: Record<string, string> = {
  draft:            'bg-gray-100 border-gray-300 text-gray-500',
  pending_approval: 'bg-orange-50 border-orange-200 text-orange-600',
  approved:         'bg-blue-500/10 border-blue-500/20 text-blue-400',
  processing:       'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  completed:        'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  cancelled:        'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

/** Tahapan pengerjaan pesanan, memakai istilah yang dipakai tim gudang. */
const statusLabel: Record<string, string> = {
  draft:            'Draft',
  pending_approval: 'Menunggu ACC',
  approved:         'Packing',
  processing:       'DO Validate',
  completed:        'Selesai',
  cancelled:        'Dibatalkan',
};

const sourceLabel: Record<string, string> = {
  manual:      'Manual',
  marketplace: 'Marketplace',
  website:     'Website',
  other:       'Lainnya',
};

export default function Index({ salesOrders, filters }: SalesOrderIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [paymentStatus, setPaymentStatus] = useState(filters.payment_status ?? '');
  const [source, setSource] = useState(filters.source ?? '');
  const [startDate, setStartDate] = useState(filters.start_date ?? '');
  const [endDate, setEndDate] = useState(filters.end_date ?? '');

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [deletingOrder, setDeletingOrder] = useState<SalesOrder | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canCreate = permissions.includes('sales_order.create');
  const canEdit   = permissions.includes('sales_order.edit');
  const canDelete = permissions.includes('sales_order.delete');

  async function handleDownloadExcel() {
    setDownloading(true);
    setDownloadError(null);

    try {
      await downloadSalesOrderList({
        search,
        status,
        payment_status: paymentStatus,
        source,
        start_date: startDate,
        end_date: endDate,
      });
    } catch {
      setDownloadError('Gagal mengunduh data Sales Order. Coba ulangi beberapa saat lagi.');
    } finally {
      setDownloading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/sales-orders', {
      search,
      status,
      payment_status: paymentStatus,
      source,
      start_date: startDate,
      end_date: endDate,
    }, { preserveState: true });
  }

  function handleFilterChange(key: string, value: string) {
    const nextFilters = {
      search,
      status,
      payment_status: paymentStatus,
      source,
      start_date: startDate,
      end_date: endDate,
      [key]: value,
    };

    if (key === 'status') setStatus(value);
    if (key === 'payment_status') setPaymentStatus(value);
    if (key === 'source') setSource(value);
    if (key === 'start_date') setStartDate(value);
    if (key === 'end_date') setEndDate(value);

    router.get('/sales-orders', nextFilters, { preserveState: true });
  }

  function handleResetFilters() {
    setSearch('');
    setStatus('');
    setPaymentStatus('');
    setSource('');
    setStartDate('');
    setEndDate('');
    router.get('/sales-orders', {});
  }

  function handleDelete(order: SalesOrder) {
    setDeleteLoading(true);
    router.delete(`/sales-orders/${order.id}`, {
      onFinish: () => {
        setDeleteLoading(false);
        setDeletingOrder(null);
      },
    });
  }

  return (
    <AppLayout>
      <Head title="Sales Orders" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}
      {downloadError && <Alert message={downloadError} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
            <p className="text-gray-500 text-xs mt-1">Transaksi / Sales Orders</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadGrosirTemplateExcel()}
              className="flex items-center justify-center gap-2 px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 font-semibold text-sm rounded-xl border border-emerald-300 hover:border-emerald-400 transition-all shadow-sm cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Template Import (17 Kolom)
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={downloading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 font-semibold text-sm rounded-xl border border-teal-400 hover:border-teal-500 transition-all disabled:opacity-60 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {downloading ? 'Menyiapkan...' : 'Export Data'}
            </button>

            {canCreate && (
              <>
              <Link
                href="/sales-orders/grosir/create"
                className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-200/40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Import Excel / Grosir
              </Link>
              <Link
                href="/sales-orders/create"
                className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-teal-200/40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Buat Sales Order
              </Link>
              </>
            )}
          </div>

        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4 space-y-4">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nomor SO atau nama customer..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>

            <div>
              <select
                value={status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Status</option>
                {Object.entries(statusLabel).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {/* Date Filters */}
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-1/2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                title="Tanggal Mulai"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-1/2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                title="Tanggal Akhir"
              />
            </div>

            <div>
              <select
                value={source}
                onChange={(e) => handleFilterChange('source', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Sumber Order</option>
                {Object.entries(sourceLabel).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 rounded-xl text-sm font-semibold border border-gray-300 transition-all"
              >
                Reset
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-sm font-semibold border border-gray-300 transition-all"
              >
                Terapkan Pencarian
              </button>
            </div>
          </form>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                  <th className="px-6 py-3.5">SO Number</th>
                  <th className="px-6 py-3.5">Tanggal</th>
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Sumber</th>
                  <th className="px-6 py-3.5 text-right">Total</th>
                  <th className="px-6 py-3.5 text-center">ACC</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5">Pembuat</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {salesOrders.data.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400 font-medium">
                      Tidak ada transaksi Sales Order ditemukan.
                    </td>
                  </tr>
                ) : (
                  salesOrders.data.map((order) => (
                    <tr key={order.id} className="hover:bg-teal-50/60 group transition-all">
                      <td className="px-6 py-3.5 font-bold text-teal-400 font-mono text-xs group-hover:text-teal-600 transition-colors">
                        <Link href={`/sales-orders/${order.id}`}>
                          {order.so_number}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 text-gray-700 font-mono text-xs whitespace-nowrap">
                        {new Date(order.order_date).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-3.5">
                        {order.customer ? (
                          <div>
                            <p className="font-semibold text-gray-800 group-hover:text-gray-900 transition-colors text-xs">{order.customer.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{order.customer.customer_code}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Umum / Walk-in</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 text-xs">
                        {sourceLabel[order.source] ?? order.source}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-gray-800 font-mono text-xs text-right whitespace-nowrap">
                        Rp {Number(order.grand_total).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-3.5 text-center whitespace-nowrap">
                        {['approved', 'processing', 'completed'].includes(order.status) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-teal-50 border-teal-200 text-teal-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                            Sudah ACC
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-gray-100 border-gray-300 text-gray-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            Belum ACC
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[order.status] ?? 'bg-gray-100 border-gray-300 text-gray-500'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${order.status === 'completed' ? 'bg-emerald-400' : order.status === 'cancelled' ? 'bg-rose-400' : 'bg-teal-400'}`} />
                          {statusLabel[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 text-xs">
                        {order.creator?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 border border-transparent transition-all"
                            title="Detail"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </Link>

                          {canEdit && order.status === 'draft' && (
                            <Link
                              href={`/sales-orders/${order.id}/edit`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-teal-400 hover:bg-teal-500/10 border border-transparent hover:border-teal-500/10 transition-all"
                              title="Edit"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Link>
                          )}

                          {((canDelete && order.status === 'draft') || auth.user?.roles?.includes('Super Admin')) && (
                            <button
                              onClick={() => {
                                if (confirm(`Apakah Anda yakin ingin menghapus Sales Order ${order.so_number}? Data terkait (Invoice, Item, Reservation) akan ikut terhapus.`)) {
                                  router.delete(`/sales-orders/${order.id}`);
                                }
                              }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 transition-all"
                              title="Hapus Sales Order (Super Admin)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-300/80 bg-gray-50/10 flex items-center justify-between">
            <p className="text-xs text-gray-400">Total {salesOrders.total} Sales Order</p>
            <Pagination links={salesOrders.links} />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-50 backdrop-blur-sm" onClick={() => setDeletingOrder(null)} />
          <div className="relative bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-rose-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-gray-900 font-semibold">Konfirmasi Hapus</h3>
                <p className="text-gray-500 text-xs">Hanya bisa menghapus SO berstatus Draft.</p>
              </div>
            </div>
            <p className="text-gray-700 text-sm mb-6">
              Apakah Anda yakin ingin menghapus Sales Order <span className="font-bold text-gray-900">{deletingOrder.so_number}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingOrder(null)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-all"
                disabled={deleteLoading}
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deletingOrder)}
                className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-200/40"
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Menghapus...' : 'Hapus SO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
