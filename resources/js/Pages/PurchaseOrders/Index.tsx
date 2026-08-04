import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Supplier {
  id: number;
  name: string;
  supplier_code: string;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface Creator {
  id: number;
  name: string;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  order_date: string;
  production_lead_time_days: number | null;
  status: 'draft' | 'pending_leader_approval' | 'pending_finance_approval' | 'approved' | 'ordered' | 'partially_received' | 'received' | 'cancelled' | 'rejected';
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  grand_total: string;
  supplier: Supplier | null;
  warehouse: Warehouse | null;
  creator: Creator | null;
}

interface PurchaseOrderIndexProps {
  purchaseOrders: {
    data: PurchaseOrder[];
    links: any[];
    current_page: number;
    total: number;
  };
  filters: {
    search?: string;
    status?: string;
    payment_status?: string;
    start_date?: string;
    end_date?: string;
  };
}

const statusBadgeColor: Record<string, string> = {
  draft:                     'bg-gray-100 border-gray-300 text-gray-500',
  pending_leader_approval:   'bg-orange-50 border-orange-200 text-orange-600',
  pending_finance_approval:  'bg-violet-50 border-violet-200 text-violet-600',
  approved:                  'bg-blue-500/10 border-blue-500/20 text-blue-400',
  ordered:                   'bg-teal-500/10 border-teal-500/20 text-teal-400',
  partially_received:        'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  received:                  'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  rejected:                  'bg-rose-500/10 border-rose-500/20 text-rose-400',
  cancelled:                 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const statusLabel: Record<string, string> = {
  draft:                     'Draft',
  pending_leader_approval:   '⏳ Menunggu Leader',
  pending_finance_approval:  '⏳ Menunggu Finance',
  approved:                  '✅ Disetujui',
  ordered:                   'Dipesan',
  partially_received:        'Diterima Sebagian',
  received:                  'Diterima Lengkap',
  rejected:                  '❌ Ditolak',
  cancelled:                 'Dibatalkan',
};

const paymentBadgeColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-orange-50 border-orange-200 text-orange-600',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
};

const paymentLabel: Record<string, string> = {
  unpaid:         'Belum Bayar',
  partially_paid: 'Sebagian',
  paid:           'Lunas',
};

export default function Index({ purchaseOrders, filters }: PurchaseOrderIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [paymentStatus, setPaymentStatus] = useState(filters.payment_status ?? '');
  const [startDate, setStartDate] = useState(filters.start_date ?? '');
  const [endDate, setEndDate] = useState(filters.end_date ?? '');

  const [deletingOrder, setDeletingOrder] = useState<PurchaseOrder | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canCreate = permissions.includes('purchase_order.create');
  const canEdit   = permissions.includes('purchase_order.edit');
  const canDelete = permissions.includes('purchase_order.delete');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/purchase-orders', {
      search,
      status,
      payment_status: paymentStatus,
      start_date: startDate,
      end_date: endDate,
    }, { preserveState: true });
  }

  function handleFilterChange(key: string, value: string) {
    const nextFilters = {
      search,
      status,
      payment_status: paymentStatus,
      start_date: startDate,
      end_date: endDate,
      [key]: value,
    };

    if (key === 'status') setStatus(value);
    if (key === 'payment_status') setPaymentStatus(value);
    if (key === 'start_date') setStartDate(value);
    if (key === 'end_date') setEndDate(value);

    router.get('/purchase-orders', nextFilters, { preserveState: true });
  }

  function handleResetFilters() {
    setSearch('');
    setStatus('');
    setPaymentStatus('');
    setStartDate('');
    setEndDate('');
    router.get('/purchase-orders', {});
  }

  function handleDelete(order: PurchaseOrder) {
    setDeleteLoading(true);
    router.delete(`/purchase-orders/${order.id}`, {
      onFinish: () => {
        setDeleteLoading(false);
        setDeletingOrder(null);
      }
    });
  }

  return (
    <AppLayout>
      <Head title="Purchase Orders" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kelola permintaan pembelian barang kepada supplier/pabrik.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/purchase-orders/create"
            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all"
          >
            Buat Purchase Order
          </Link>
        )}
      </div>

      {/* Toast Alert */}
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* Filter Card */}
      <div className="bg-white border border-gray-300/80 rounded-2xl p-5 mb-6 shadow-xl">
        <form onSubmit={handleSearch} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Cari No. PO / Supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 focus:border-teal-600 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-900 focus:outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="bg-gray-50 border border-gray-300 focus:border-teal-600 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none transition-all"
            >
              <option value="">Semua Status PO</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            {/* Payment Status Filter */}
            <select
              value={paymentStatus}
              onChange={(e) => handleFilterChange('payment_status', e.target.value)}
              className="bg-gray-50 border border-gray-300 focus:border-teal-600 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none transition-all"
            >
              <option value="">Semua Status Bayar</option>
              {Object.entries(paymentLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            {/* Start Date */}
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="bg-gray-50 border border-gray-300 focus:border-teal-600 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none transition-all"
            />

            {/* End Date */}
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="bg-gray-50 border border-gray-300 focus:border-teal-600 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none transition-all"
            />
          </div>

          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold transition-all"
            >
              Reset Filter
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-teal-200/40"
            >
              Cari Data
            </button>
          </div>
        </form>
      </div>

      {/* Table Section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-50">
                <th className="py-3.5 px-5 whitespace-nowrap">No. PO</th>
                <th className="py-3.5 px-5 whitespace-nowrap">Tanggal Order</th>
                <th className="py-3.5 px-5 whitespace-nowrap">Supplier / Pabrik</th>
                <th className="py-3.5 px-5 whitespace-nowrap">Gudang</th>
                <th className="py-3.5 px-5 whitespace-nowrap">Estimasi Pengerjaan</th>
                <th className="py-3.5 px-5 text-right whitespace-nowrap">Grand Total</th>
                <th className="py-3.5 px-5 text-center whitespace-nowrap">Status PO</th>
                <th className="py-3.5 px-5 text-center whitespace-nowrap">Status Bayar</th>
                <th className="py-3.5 px-5 whitespace-nowrap">Dibuat Oleh</th>
                <th className="py-3.5 px-5 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {purchaseOrders.data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400 font-medium bg-gray-50/10">
                    Tidak ada data Purchase Order ditemukan.
                  </td>
                </tr>
              ) : (
                purchaseOrders.data.map((order) => (
                  <tr key={order.id} className="hover:bg-teal-50/60 transition-colors group">
                    <td className="py-3.5 px-5 font-bold text-gray-900 tracking-wide font-mono text-xs whitespace-nowrap">
                      <Link href={`/purchase-orders/${order.id}`} className="hover:text-teal-400 hover:underline">
                        {order.po_number}
                      </Link>
                    </td>
                    <td className="py-3.5 px-5 font-mono text-xs whitespace-nowrap text-gray-700">
                      {new Date(order.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3.5 px-5 font-medium text-gray-800 min-w-[160px]">
                      <div className="font-semibold text-xs text-gray-800 group-hover:text-gray-900 transition-colors">{order.supplier ? order.supplier.name : '—'}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{order.supplier?.supplier_code}</div>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-gray-700 whitespace-nowrap">
                      {order.warehouse ? order.warehouse.name : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-gray-500 font-mono text-xs whitespace-nowrap">
                      {order.production_lead_time_days ? `${order.production_lead_time_days} hari` : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-right font-bold text-gray-900 font-mono text-xs whitespace-nowrap">
                      Rp {Number(order.grand_total).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-5 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[order.status]}`}>
                        {statusLabel[order.status]}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${paymentBadgeColor[order.payment_status]}`}>
                        {paymentLabel[order.payment_status]}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-gray-500 text-xs whitespace-nowrap">
                      {order.creator ? order.creator.name : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-1.5">
                        <Link
                          href={`/purchase-orders/${order.id}`}
                          className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-lg border border-gray-300 transition-colors"
                          title="Lihat Detail"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>

                        {canEdit && order.status === 'draft' && (
                          <Link
                            href={`/purchase-orders/${order.id}/edit`}
                            className="p-1.5 bg-gray-50 hover:bg-violet-950/40 text-gray-500 hover:text-teal-400 rounded-lg border border-gray-300 hover:border-violet-900/50 transition-colors"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Link>
                        )}

                        {((canDelete && order.status === 'draft') || auth.user?.role?.name === 'Super Admin' || auth.user?.roles?.includes('Super Admin')) && (
                          <button
                            type="button"
                            onClick={() => setDeletingOrder(order)}
                            className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-50 border border-transparent hover:border-rose-900/40 rounded-lg transition-all"
                            title="Hapus Purchase Order"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

        {/* Pagination Section */}
        {purchaseOrders.data.length > 0 && (
          <div className="p-5 border-t border-gray-300/60 bg-white">
            <Pagination links={purchaseOrders.links} />
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-gray-900">Konfirmasi Hapus Purchase Order</h3>
            <p className="text-sm text-gray-500 mt-2">
              Apakah Anda yakin ingin menghapus Purchase Order <span className="font-semibold text-gray-900">{deletingOrder.po_number}</span>?
              {deletingOrder.status !== 'draft' && (
                <span className="block mt-1 text-rose-400 text-xs font-semibold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  ⚠️ Peringatan Super Admin: Menghapus PO ini juga akan menghapus seluruh data terkait (Invoice Pabrik, Piutang Pabrik, Items, dsb).
                </span>
              )}
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeletingOrder(null)}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-300 hover:border-teal-400 transition-all border border-gray-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingOrder)}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-200/40 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-900" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Menghapus...
                  </>
                ) : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
