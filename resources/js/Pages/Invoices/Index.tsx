import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  sales_order_id: number;
  customer_id: number;
  invoice_date: string;
  due_date: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_cost: string;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  notes: string | null;
  customer: Customer | null;
  sales_order: SalesOrder | null;
}

interface InvoiceIndexProps {
  invoices: {
    data: Invoice[];
    links: any[];
    current_page: number;
    total: number;
  };
  filters: {
    search?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    due_start_date?: string;
    due_end_date?: string;
    /** Pintasan Finance: overdue | due_soon | unpaid */
    due_filter?: string;
  };
}

const statusBadgeColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue:        'bg-red-650/15 border-red-500/20 text-red-400 font-extrabold animate-pulse',
  cancelled:      'bg-gray-100 border-gray-300 text-gray-500',
};

const statusLabel: Record<string, string> = {
  unpaid:         'Belum Lunas',
  partially_paid: 'Dibayar Sebagian',
  paid:           'Lunas',
  overdue:        'Jatuh Tempo (Overdue)',
  cancelled:      'Dibatalkan',
};

/** Berapa hari sebelum jatuh tempo mulai diberi penanda kuning. */
const DUE_SOON_DAYS = 7;

/**
 * Penanda tindak lanjut Finance pada kolom jatuh tempo: sudah telat berapa
 * hari, atau tinggal berapa hari lagi. Invoice lunas/batal tidak diberi
 * penanda karena tidak perlu ditagih.
 */
function dueMarker(invoice: Invoice): { label: string; className: string } | null {
  if (!invoice.due_date) return null;
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return null;
  if (Number(invoice.remaining_amount) <= 0) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const due = startOfDay(new Date(invoice.due_date));
  const today = startOfDay(new Date());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { label: `Telat ${Math.abs(days)} hari`, className: 'text-rose-400' };
  if (days === 0) return { label: 'Jatuh tempo hari ini', className: 'text-amber-400' };
  if (days <= DUE_SOON_DAYS) return { label: `${days} hari lagi`, className: 'text-amber-400' };

  return null;
}

export default function Index({ invoices, filters }: InvoiceIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [startDate, setStartDate] = useState(filters.start_date ?? '');
  const [endDate, setEndDate] = useState(filters.end_date ?? '');
  const [dueStartDate, setDueStartDate] = useState(filters.due_start_date ?? '');
  const [dueEndDate, setDueEndDate] = useState(filters.due_end_date ?? '');

  const canEdit = permissions.includes('invoice.edit');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/invoices', {
      search,
      status,
      start_date: startDate,
      end_date: endDate,
      due_start_date: dueStartDate,
      due_end_date: dueEndDate,
    }, { preserveState: true });
  }

  function handleFilterChange(key: string, value: string) {
    const newFilters = {
      search,
      status,
      start_date: startDate,
      end_date: endDate,
      due_start_date: dueStartDate,
      due_end_date: dueEndDate,
      [key]: value,
    };

    if (key === 'status') setStatus(value);

    router.get('/invoices', newFilters, { preserveState: true });
  }

  function handleResetFilters() {
    setSearch('');
    setStatus('');
    setStartDate('');
    setEndDate('');
    setDueStartDate('');
    setDueEndDate('');
    router.get('/invoices', {}, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="Invoice Customer (Tagihan Penjualan)" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Invoice Customer</h1>
          <p className="text-gray-500 text-xs mt-1">Penjualan / Laporan Tagihan Resmi Customer</p>
        </div>

        {/* Pintasan tindak lanjut penagihan untuk Finance */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mr-1">Tindak Lanjut</span>
          {[
            { key: 'overdue', label: 'Telat Bayar', active: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
            { key: 'due_soon', label: `Jatuh Tempo ≤ ${DUE_SOON_DAYS} Hari`, active: 'bg-amber-400/15 text-amber-400 border-amber-400/30' },
            { key: 'unpaid', label: 'Semua Belum Lunas', active: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
          ].map((chip) => {
            const isActive = filters.due_filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => router.get('/invoices', isActive ? {} : { due_filter: chip.key }, { preserveState: true })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  isActive ? chip.active : 'bg-gray-50 text-gray-500 border-gray-300 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Alerts */}
        <Alert message={flash.success ?? null} type="success" />
        {flash.error && <Alert message={flash.error} type="error" />}

        {/* Filter Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Search */}
              <div className="lg:col-span-2 space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="No. Invoice, Customer, No. SO..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400"
                  />
                  <div className="absolute left-3 top-2.5 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Status</label>
                <select
                  value={status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Status</option>
                  <option value="unpaid">Belum Lunas</option>
                  <option value="partially_paid">Dibayar Sebagian</option>
                  <option value="paid">Lunas</option>
                  <option value="overdue">Jatuh Tempo</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>

              {/* Date Start */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Tgl Invoice (Mulai)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>

              {/* Due Date Start */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Tgl Jatuh Tempo (Mulai)</label>
                <input
                  type="date"
                  value={dueStartDate}
                  onChange={(e) => setDueStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>

              {/* Due Date End */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Tgl Jatuh Tempo (Akhir)</label>
                <input
                  type="date"
                  value={dueEndDate}
                  onChange={(e) => setDueEndDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Reset / Search Action buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
              >
                Reset Filter
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-xs font-semibold border border-gray-300 hover:border-gray-400 transition-all flex items-center gap-1.5 shadow-md"
              >
                Cari Data
              </button>
            </div>
          </form>
        </div>

        {/* Ledger Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-50">
                  <th className="py-3.5 px-6">No. Invoice</th>
                  <th className="py-3.5 px-6">Customer</th>
                  <th className="py-3.5 px-6">Sales Order</th>
                  <th className="py-3.5 px-6 text-center">Tgl Invoice</th>
                  <th className="py-3.5 px-6 text-center">Jatuh Tempo</th>
                  <th className="py-3.5 px-6 text-right">Total Tagihan</th>
                  <th className="py-3.5 px-6 text-right">Paid Amount</th>
                  <th className="py-3.5 px-6 text-right">Remaining</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {invoices.data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 font-medium">
                      Tidak ada data invoice customer ditemukan.
                    </td>
                  </tr>
                ) : (
                  invoices.data.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-teal-50/60 transition-colors group">
                      <td className="py-3.5 px-6 font-bold text-gray-900 whitespace-nowrap font-mono text-xs">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-teal-400 hover:text-teal-600 transition-colors"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-gray-800 block text-xs">
                          {invoice.customer ? invoice.customer.name : '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 mt-0.5 block font-mono">
                          Kode: {invoice.customer ? invoice.customer.customer_code : '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap font-medium text-gray-700 text-xs font-mono">
                        {invoice.sales_order ? (
                          <Link
                            href={`/sales-orders/${invoice.sales_order_id}`}
                            className="hover:underline text-gray-500 hover:text-gray-800"
                          >
                            {invoice.sales_order.so_number}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-gray-500 font-mono">
                        {new Date(invoice.invoice_date).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-gray-700 font-mono">
                        {invoice.due_date ? (
                          <>
                            {new Date(invoice.due_date).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {(() => {
                              const marker = dueMarker(invoice);
                              if (!marker) return null;
                              return (
                                <span className={`mt-1 block text-[10px] font-bold ${marker.className}`}>
                                  {marker.label}
                                </span>
                              );
                            })()}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-gray-800 whitespace-nowrap font-mono text-xs">
                        Rp {Number(invoice.total_amount).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-right text-emerald-400 whitespace-nowrap text-xs font-mono">
                        {Number(invoice.paid_amount) > 0 ? `Rp ${Number(invoice.paid_amount).toLocaleString('id-ID')}` : 'Rp 0'}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-gray-900 whitespace-nowrap font-mono text-xs">
                        Rp {Number(invoice.remaining_amount).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-xs font-semibold ${statusBadgeColor[invoice.status]}`}>
                          {statusLabel[invoice.status]}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all"
                            title="Detail"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </Link>
                          {canEdit && invoice.status === 'unpaid' && Number(invoice.paid_amount) === 0 && (
                            <Link
                              href={`/invoices/${invoice.id}/edit`}
                              className="p-1.5 text-gray-500 hover:text-teal-400 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all"
                              title="Edit due date/notes"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Link>
                          )}
                          {auth.user?.roles?.includes('Super Admin') && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Hapus Invoice ${invoice.invoice_number}? Tindakan ini permanen.`)) {
                                  router.delete(`/invoices/${invoice.id}`);
                                }
                              }}
                              className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-50 border border-transparent hover:border-rose-900/40 rounded-lg transition-all"
                              title="Hapus Invoice (Super Admin)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

          {/* Pagination */}
          <div className="p-4 border-t border-gray-200 bg-white/80 flex justify-between items-center">
            <div className="text-gray-400 text-xs font-medium">
              Menampilkan <span className="font-mono text-gray-700">{invoices.data.length}</span> dari <span className="font-mono text-gray-700">{invoices.total}</span> invoice customer
            </div>
            <Pagination links={invoices.links} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
