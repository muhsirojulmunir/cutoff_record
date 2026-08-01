import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Creator {
  id: number;
  name: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
}

interface FactoryReceivable {
  id: number;
  receivable_number: string;
}

interface PaymentAllocation {
  id: number;
  invoice_id: number | null;
  factory_receivable_id: number | null;
  allocated_amount: string;
  invoice: Invoice | null;
  factory_receivable: FactoryReceivable | null;
}

interface Payment {
  id: number;
  payment_number: string;
  payment_date: string;
  payment_type: 'customer_invoice' | 'factory_receivable';
  payment_method: 'cash' | 'bank_transfer' | 'credit_card' | 'debit_card' | 'e_wallet' | 'other';
  amount: string;
  reference_number: string | null;
  bank_account: string | null;
  notes: string | null;
  status: 'posted' | 'cancelled';
  creator: Creator | null;
  allocations: PaymentAllocation[];
}

interface PaymentIndexProps {
  payments: {
    data: Payment[];
    links: any[];
    current_page: number;
    total: number;
  };
  filters: {
    search?: string;
    type?: string;
    method?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  };
}

const statusBadgeColor: Record<string, string> = {
  posted:    'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  cancelled: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const statusLabel: Record<string, string> = {
  posted:    'Posted (Sukses)',
  cancelled: 'Batal (Cancelled)',
};

const typeLabel: Record<string, string> = {
  customer_invoice:   'Invoice Customer (Masuk)',
  factory_receivable: 'Piutang Pabrik (Keluar)',
};

const typeBadgeColor: Record<string, string> = {
  customer_invoice:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
  factory_receivable: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
};

const methodLabel: Record<string, string> = {
  cash:          'Tunai / Cash',
  bank_transfer: 'Transfer Bank',
  credit_card:   'Kartu Kredit',
  debit_card:    'Kartu Debit',
  e_wallet:      'E-Wallet',
  other:         'Lainnya',
};

export default function Index({ payments, filters }: PaymentIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [type, setType] = useState(filters.type ?? '');
  const [method, setMethod] = useState(filters.method ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [startDate, setStartDate] = useState(filters.start_date ?? '');
  const [endDate, setEndDate] = useState(filters.end_date ?? '');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/payments', {
      search,
      type,
      method,
      status,
      start_date: startDate,
      end_date: endDate,
    }, { preserveState: true });
  }

  function handleFilterChange(key: string, value: string) {
    const newFilters = {
      search,
      type,
      method,
      status,
      start_date: startDate,
      end_date: endDate,
      [key]: value,
    };

    if (key === 'type') setType(value);
    if (key === 'method') setMethod(value);
    if (key === 'status') setStatus(value);

    router.get('/payments', newFilters, { preserveState: true });
  }

  function handleResetFilters() {
    setSearch('');
    setType('');
    setMethod('');
    setStatus('');
    setStartDate('');
    setEndDate('');
    router.get('/payments', {}, { preserveState: true });
  }

  return (
    <AppLayout>
      <Head title="Histori Pembayaran (Payment Ledger)" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Histori Pembayaran</h1>
          <p className="text-slate-400 text-xs mt-1">Keuangan / Log Transaksi Pembayaran Masuk & Keluar</p>
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
                    placeholder="No. Transaksi, No. Ref, No. Invoice..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all placeholder:text-slate-600"
                  />
                  <div className="absolute left-3 top-2.5 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Tipe Pembayaran</label>
                <select
                  value={type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Tipe</option>
                  <option value="customer_invoice">Invoice Customer</option>
                  <option value="factory_receivable">Piutang Pabrik</option>
                </select>
              </div>

              {/* Method */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Metode</label>
                <select
                  value={method}
                  onChange={(e) => handleFilterChange('method', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Metode</option>
                  <option value="cash">Tunai / Cash</option>
                  <option value="bank_transfer">Transfer Bank</option>
                  <option value="credit_card">Kartu Kredit</option>
                  <option value="debit_card">Kartu Debit</option>
                  <option value="e_wallet">E-Wallet</option>
                  <option value="other">Lainnya</option>
                </select>
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
                  <option value="posted">Posted (Sukses)</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>

              {/* Date Start */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Tgl Transaksi (Mulai)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Actions */}
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
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-all shadow-md"
              >
                Terapkan Pencarian
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
                  <th className="py-3 px-6">No. Payment</th>
                  <th className="py-3 px-6 text-center">Tanggal</th>
                  <th className="py-3 px-6">Tipe Payment</th>
                  <th className="py-3 px-6">Sumber Alokasi</th>
                  <th className="py-3 px-6">Metode</th>
                  <th className="py-3 px-6 text-right">Nominal</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6">Operator</th>
                  <th className="py-3 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-sm text-slate-300">
                {payments.data.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-500 font-medium">
                      Tidak ada histori pembayaran ditemukan.
                    </td>
                  </tr>
                ) : (
                  payments.data.map((payment) => {
                    const allocation = payment.allocations[0] ?? null;
                    let sourceNumber = '—';
                    let sourceLink = '#';

                    if (allocation) {
                      if (payment.payment_type === 'customer_invoice' && allocation.invoice) {
                        sourceNumber = allocation.invoice.invoice_number;
                        sourceLink = `/invoices/${allocation.invoice_id}`;
                      } else if (payment.payment_type === 'factory_receivable' && allocation.factory_receivable) {
                        sourceNumber = allocation.factory_receivable.receivable_number;
                        sourceLink = `/factory-receivables/${allocation.factory_receivable_id}`;
                      }
                    }

                    return (
                      <tr key={payment.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3.5 px-6 font-bold text-white whitespace-nowrap">
                          <Link
                            href={`/payments/${payment.id}`}
                            className="text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            {payment.payment_number}
                          </Link>
                        </td>
                        <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-slate-400">
                          {new Date(payment.payment_date).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3.5 px-6 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider ${typeBadgeColor[payment.payment_type]}`}>
                            {typeLabel[payment.payment_type]}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-semibold text-slate-300 text-xs whitespace-nowrap">
                          {sourceNumber !== '—' ? (
                            <Link href={sourceLink} className="hover:underline text-slate-400 hover:text-slate-200">
                              {sourceNumber}
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-xs text-slate-200">
                          {methodLabel[payment.payment_method]}
                        </td>
                        <td className="py-3.5 px-6 text-right font-extrabold text-white whitespace-nowrap">
                          Rp {Number(payment.amount).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3.5 px-6 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-xs font-semibold ${statusBadgeColor[payment.status]}`}>
                            {statusLabel[payment.status]}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-xs text-slate-400">
                          {payment.creator?.name || 'System'}
                        </td>
                        <td className="py-3.5 px-6 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              href={`/payments/${payment.id}`}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg transition-all inline-flex"
                              title="Detail"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </Link>
                            {(auth.user?.role?.name === 'Super Admin' || auth.user?.roles?.includes('Super Admin')) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Hapus Payment ${payment.payment_number}? Alokasi pembayaran akan ikut terhapus.`)) {
                                    router.delete(`/payments/${payment.id}`);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-transparent hover:border-rose-900/40 rounded-lg transition-all inline-flex"
                                title="Hapus Payment (Super Admin)"
                              >

                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
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

          {/* Pagination */}
          <div className="p-4 border-t border-slate-900 bg-slate-950/40 flex justify-between items-center">
            <div className="text-slate-500 text-xs font-medium">
              Menampilkan {payments.data.length} dari {payments.total} transaksi pembayaran
            </div>
            <Pagination links={payments.links} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
