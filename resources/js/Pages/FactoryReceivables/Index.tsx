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

interface PurchaseOrder {
  id: number;
  po_number: string;
}

interface FactoryReceivable {
  id: number;
  receivable_number: string;
  supplier_id: number;
  purchase_order_id: number;
  warehouse_id: number | null;
  transaction_date: string;
  due_date: string | null;
  original_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  notes: string | null;
  supplier: Supplier | null;
  purchase_order: PurchaseOrder | null;
}

interface FactoryReceivableIndexProps {
  factoryReceivables: {
    data: FactoryReceivable[];
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
  cancelled:      'bg-gray-100 border-gray-300 text-gray-500',
};

const statusLabel: Record<string, string> = {
  unpaid:         'Belum Lunas',
  partially_paid: 'Dibayar Sebagian',
  paid:           'Lunas',
  overdue:        'Jatuh Tempo (Overdue)',
  cancelled:      'Dibatalkan',
};

export default function Index({ factoryReceivables, filters }: FactoryReceivableIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [startDate, setStartDate] = useState(filters.start_date ?? '');
  const [endDate, setEndDate] = useState(filters.end_date ?? '');
  const [dueStartDate, setDueStartDate] = useState(filters.due_start_date ?? '');
  const [dueEndDate, setDueEndDate] = useState(filters.due_end_date ?? '');

  const canEdit = permissions.includes('factory_receivable.edit');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/factory-receivables', {
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

    router.get('/factory-receivables', newFilters, { preserveState: true });
  }

  function handleResetFilters() {
    setSearch('');
    setStatus('');
    setStartDate('');
    setEndDate('');
    setDueStartDate('');
    setDueEndDate('');
    router.get('/factory-receivables', {}, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="Piutang Pabrik (Supplier Payable)" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Piutang Pabrik</h1>
          <p className="text-gray-500 text-xs mt-1">Keuangan / Laporan Kewajiban Supplier</p>
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
                    placeholder="No. FP, Supplier, No. PO..."
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
                <label className="block text-xs font-semibold text-gray-500">Tgl Transaksi (Mulai)</label>
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
                  <th className="py-3.5 px-6 whitespace-nowrap">No. Piutang (FP)</th>
                  <th className="py-3.5 px-6 whitespace-nowrap">Supplier</th>
                  <th className="py-3.5 px-6 whitespace-nowrap">Purchase Order</th>
                  <th className="py-3.5 px-6 text-center whitespace-nowrap">Tgl Transaksi</th>
                  <th className="py-3.5 px-6 text-center whitespace-nowrap">Jatuh Tempo</th>
                  <th className="py-3.5 px-6 text-right whitespace-nowrap">Original Amount</th>
                  <th className="py-3.5 px-6 text-right whitespace-nowrap">Paid Amount</th>
                  <th className="py-3.5 px-6 text-right whitespace-nowrap">Remaining</th>
                  <th className="py-3.5 px-6 text-center whitespace-nowrap">Status</th>
                  <th className="py-3.5 px-6 text-center whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {factoryReceivables.data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 font-medium">
                      Tidak ada data piutang pabrik ditemukan.
                    </td>
                  </tr>
                ) : (
                  factoryReceivables.data.map((receivable) => (
                    <tr key={receivable.id} className="hover:bg-teal-50/60 transition-colors group">
                      <td className="py-3.5 px-6 font-bold text-gray-900 whitespace-nowrap font-mono text-xs">
                        <Link
                          href={`/factory-receivables/${receivable.id}`}
                          className="text-teal-400 hover:text-teal-600 transition-colors"
                        >
                          {receivable.receivable_number}
                        </Link>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-gray-800 block text-xs">
                          {receivable.supplier ? receivable.supplier.name : '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 mt-0.5 block font-mono">
                          Kode: {receivable.supplier ? receivable.supplier.supplier_code : '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap font-medium text-gray-700 text-xs font-mono">
                        {receivable.purchase_order ? (
                          <Link
                            href={`/purchase-orders/${receivable.purchase_order_id}`}
                            className="hover:underline text-gray-500 hover:text-gray-800"
                          >
                            {receivable.purchase_order.po_number}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-gray-500 font-mono">
                        {new Date(receivable.transaction_date).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-gray-700 font-mono">
                        {receivable.due_date ? (
                          new Date(receivable.due_date).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-gray-800 whitespace-nowrap font-mono text-xs">
                        Rp {Number(receivable.original_amount).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-right text-emerald-400 whitespace-nowrap text-xs font-mono">
                        {Number(receivable.paid_amount) > 0 ? `Rp ${Number(receivable.paid_amount).toLocaleString('id-ID')}` : 'Rp 0'}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-gray-900 whitespace-nowrap font-mono text-xs">
                        Rp {Number(receivable.remaining_amount).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-xs font-semibold ${statusBadgeColor[receivable.status]}`}>
                          {statusLabel[receivable.status]}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/factory-receivables/${receivable.id}`}
                            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all"
                            title="Detail"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </Link>
                          {canEdit && receivable.status !== 'cancelled' && (
                            <Link
                              href={`/factory-receivables/${receivable.id}/edit`}
                              className="p-1.5 text-gray-500 hover:text-teal-400 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all"
                              title="Edit due date/notes"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Link>
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
              Menampilkan <span className="font-mono text-gray-700">{factoryReceivables.data.length}</span> dari <span className="font-mono text-gray-700">{factoryReceivables.total}</span> piutang pabrik
            </div>
            <Pagination links={factoryReceivables.links} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
