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
  };
}

const statusBadgeColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue:        'bg-red-650/15 border-red-500/20 text-red-400 font-extrabold animate-pulse',
  cancelled:      'bg-slate-800 border-slate-700 text-slate-400',
};

const statusLabel: Record<string, string> = {
  unpaid:         'Belum Lunas',
  partially_paid: 'Dibayar Sebagian',
  paid:           'Lunas',
  overdue:        'Jatuh Tempo (Overdue)',
  cancelled:      'Dibatalkan',
};

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
          <h1 className="text-2xl font-bold text-white tracking-tight">Invoice Customer</h1>
          <p className="text-slate-400 text-xs mt-1">Penjualan / Laporan Tagihan Resmi Customer</p>
        </div>

        {/* Alerts */}
        <Alert message={flash.success ?? null} type="success" />
        {flash.error && <Alert message={flash.error} type="error" />}

        {/* Filter Card */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Search */}
              <div className="lg:col-span-2 space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="No. Invoice, Customer, No. SO..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all placeholder:text-slate-600"
                  />
                  <div className="absolute left-3 top-2.5 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Status</label>
                <select
                  value={status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
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
                <label className="block text-xs font-semibold text-slate-400">Tgl Invoice (Mulai)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>

              {/* Due Date Start */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Tgl Jatuh Tempo (Mulai)</label>
                <input
                  type="date"
                  value={dueStartDate}
                  onChange={(e) => setDueStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>

              {/* Due Date End */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Tgl Jatuh Tempo (Akhir)</label>
                <input
                  type="date"
                  value={dueEndDate}
                  onChange={(e) => setDueEndDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Reset / Search Action buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                Reset Filter
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5 shadow-md"
              >
                Cari Data
              </button>
            </div>
          </form>
        </div>

        {/* Ledger Table */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                  <th className="py-3 px-6">No. Invoice</th>
                  <th className="py-3 px-6">Customer</th>
                  <th className="py-3 px-6">Sales Order</th>
                  <th className="py-3 px-6 text-center">Tgl Invoice</th>
                  <th className="py-3 px-6 text-center">Jatuh Tempo</th>
                  <th className="py-3 px-6 text-right">Total Tagihan</th>
                  <th className="py-3 px-6 text-right">Paid Amount</th>
                  <th className="py-3 px-6 text-right">Remaining</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-sm text-slate-300">
                {invoices.data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500 font-medium">
                      Tidak ada data invoice customer ditemukan.
                    </td>
                  </tr>
                ) : (
                  invoices.data.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 px-6 font-bold text-white whitespace-nowrap">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-slate-200 block">
                          {invoice.customer ? invoice.customer.name : '—'}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Kode: {invoice.customer ? invoice.customer.customer_code : '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap font-medium text-slate-300 text-xs">
                        {invoice.sales_order ? (
                          <Link
                            href={`/sales-orders/${invoice.sales_order_id}`}
                            className="hover:underline text-slate-400 hover:text-slate-200"
                          >
                            {invoice.sales_order.so_number}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-slate-400">
                        {new Date(invoice.invoice_date).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-slate-300">
                        {invoice.due_date ? (
                          new Date(invoice.due_date).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right font-semibold text-slate-200 whitespace-nowrap">
                        Rp {Number(invoice.total_amount).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-right text-emerald-400 whitespace-nowrap text-xs">
                        {Number(invoice.paid_amount) > 0 ? `Rp ${Number(invoice.paid_amount).toLocaleString('id-ID')}` : 'Rp 0'}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-white whitespace-nowrap">
                        Rp {Number(invoice.remaining_amount).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-xs font-semibold ${statusBadgeColor[invoice.status]}`}>
                          {statusLabel[invoice.status]}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg transition-all"
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
                              className="p-1 text-slate-400 hover:text-violet-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg transition-all"
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
                              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-transparent hover:border-rose-900/40 rounded-lg transition-all"
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
          <div className="p-4 border-t border-slate-900 bg-slate-950/40 flex justify-between items-center">
            <div className="text-slate-500 text-xs font-medium">
              Menampilkan {invoices.data.length} dari {invoices.total} invoice customer
            </div>
            <Pagination links={invoices.links} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
