import React, { useMemo, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
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
  invoice_date: string;
  due_date: string | null;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: 'unpaid' | 'partially_paid' | 'overdue';
  customer: Customer | null;
  sales_order: SalesOrder | null;
}

interface Summary {
  total_receivable: number;
  total_overdue: number;
  total_unpaid: number;
  total_partially_paid: number;
  count_invoices: number;
  count_customers: number;
}

interface Props {
  invoices: Invoice[];
  filters: { search?: string; status?: string };
  summary: Summary;
}

type SortKey = 'due_date' | 'remaining' | 'customer';

const STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  unpaid:         { label: 'Belum Bayar',       badge: 'bg-rose-50 border-rose-200 text-rose-600',       dot: 'bg-rose-500' },
  partially_paid: { label: 'Dibayar Sebagian',  badge: 'bg-orange-50 border-orange-200 text-orange-600', dot: 'bg-orange-500' },
  overdue:        { label: 'Jatuh Tempo',       badge: 'bg-red-50 border-red-300 text-red-700',          dot: 'bg-red-600' },
};

const fmt = (value: number | string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value));

const fmtCompact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (abs >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  return fmt(value);
};

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

/** Sisa hari menuju jatuh tempo, sekaligus warna penandanya. */
function dueInfo(dueDate: string | null): { text: string; className: string; days: number } | null {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { text: `Terlambat ${Math.abs(days)} hari`, className: 'text-red-600 font-semibold', days };
  if (days === 0) return { text: 'Jatuh tempo hari ini', className: 'text-orange-600 font-semibold', days };
  if (days <= 7) return { text: `${days} hari lagi`, className: 'text-orange-600', days };

  return { text: `${days} hari lagi`, className: 'text-gray-400', days };
}

export default function CustomerReceivables({ invoices, filters, summary }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [sortAsc, setSortAsc] = useState(true);

  function applyFilter(next?: { search?: string; status?: string }) {
    router.get('/piutang-customer', {
      search: next?.search ?? search,
      status: next?.status ?? status,
    }, { preserveState: true, preserveScroll: true });
  }

  /** Kartu ringkasan ikut jadi pintasan filter. */
  function filterByStatus(value: string) {
    const nextStatus = status === value ? '' : value;
    setStatus(nextStatus);
    applyFilter({ status: nextStatus });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
      return;
    }
    setSortKey(key);
    setSortAsc(true);
  }

  const sortedInvoices = useMemo(() => {
    const rows = [...invoices];
    const direction = sortAsc ? 1 : -1;

    rows.sort((a, b) => {
      if (sortKey === 'remaining') {
        return (Number(a.remaining_amount) - Number(b.remaining_amount)) * direction;
      }

      if (sortKey === 'customer') {
        return (a.customer?.name ?? '').localeCompare(b.customer?.name ?? '') * direction;
      }

      // due_date — tanpa tanggal jatuh tempo selalu di bawah.
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * direction;
    });

    return rows;
  }, [invoices, sortKey, sortAsc]);

  const cards = [
    {
      key: '',
      label: 'Total Piutang',
      value: summary.total_receivable,
      note: `${summary.count_invoices} invoice · ${summary.count_customers} customer`,
      accent: 'text-gray-900',
      ring: 'hover:border-teal-300',
      bar: 'bg-teal-500',
    },
    {
      key: 'overdue',
      label: 'Jatuh Tempo',
      value: summary.total_overdue,
      note: 'Perlu ditagih segera',
      accent: 'text-red-600',
      ring: 'hover:border-red-300',
      bar: 'bg-red-500',
    },
    {
      key: 'partially_paid',
      label: 'Dibayar Sebagian',
      value: summary.total_partially_paid,
      note: 'Menunggu pelunasan',
      accent: 'text-orange-600',
      ring: 'hover:border-orange-300',
      bar: 'bg-orange-500',
    },
    {
      key: 'unpaid',
      label: 'Belum Bayar',
      value: summary.total_unpaid,
      note: 'Belum ada pembayaran masuk',
      accent: 'text-rose-600',
      ring: 'hover:border-rose-300',
      bar: 'bg-rose-500',
    },
  ];

  const SortButton = ({ label, keyName, align = 'left' }: { label: string; keyName: SortKey; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(keyName)}
      className={`inline-flex items-center gap-1 hover:text-teal-600 transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {label}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`w-2.5 h-2.5 transition-all ${sortKey === keyName ? 'text-teal-600' : 'text-gray-300'} ${sortKey === keyName && !sortAsc ? 'rotate-180' : ''}`}
      >
        <path d="M12 5l7 12H5L12 5z" />
      </svg>
    </button>
  );

  return (
    <AppLayout>
      <Head title="Piutang Customer" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Piutang Customer</h1>
            <p className="text-gray-500 text-xs mt-1">Finance / Tagihan customer yang belum lunas</p>
          </div>

          <Link
            href="/invoices"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-teal-50 text-teal-700 border border-teal-400 hover:border-teal-500 text-sm font-semibold transition-all"
          >
            Semua Invoice
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        {flash?.success && <Alert type="success" message={flash.success} />}
        {flash?.error && <Alert type="error" message={flash.error} />}

        {/* Ringkasan — sekaligus pintasan filter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => {
            const isActive = status === card.key && card.key !== '';
            const share = summary.total_receivable > 0
              ? Math.round((card.value / summary.total_receivable) * 100)
              : 0;

            return (
              <button
                key={card.label}
                type="button"
                onClick={() => filterByStatus(card.key)}
                className={`text-left rounded-2xl bg-white border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  isActive ? 'border-teal-400 ring-2 ring-teal-100' : `border-gray-200 ${card.ring}`
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{card.label}</p>
                  {isActive && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                      Aktif
                    </span>
                  )}
                </div>

                <p className={`text-xl font-bold font-mono tracking-tight mt-2 ${card.accent}`}>
                  {fmtCompact(card.value)}
                </p>

                {card.key !== '' && (
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2.5">
                    <div style={{ width: `${share}%` }} className={`h-full ${card.bar} rounded-full transition-all duration-500`} />
                  </div>
                )}

                <p className="text-[11px] text-gray-400 mt-2">{card.note}</p>
              </button>
            );
          })}
        </div>

        {/* Filter */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                placeholder="Cari nomor invoice, nama customer, atau No. SO..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); applyFilter({ status: e.target.value }); }}
                className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Status</option>
                <option value="overdue">Jatuh Tempo</option>
                <option value="due_soon">Segera Jatuh Tempo</option>
                <option value="partially_paid">Dibayar Sebagian</option>
                <option value="unpaid">Belum Bayar</option>
              </select>

              <button
                type="button"
                onClick={() => applyFilter()}
                className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
              >
                Cari
              </button>

              {(search || status) && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setStatus(''); router.get('/piutang-customer'); }}
                  className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-sm font-semibold transition-all"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabel */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          {sortedInvoices.length === 0 ? (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-emerald-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold">Tidak ada piutang customer</p>
              <p className="text-gray-400 text-xs mt-1">Semua tagihan sudah lunas, atau tidak ada data sesuai filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                    <th className="px-5 py-3.5">Invoice</th>
                    <th className="px-5 py-3.5"><SortButton label="Customer" keyName="customer" /></th>
                    <th className="px-5 py-3.5"><SortButton label="Jatuh Tempo" keyName="due_date" /></th>
                    <th className="px-5 py-3.5 min-w-[180px]">Progres Pembayaran</th>
                    <th className="px-5 py-3.5 text-right"><SortButton label="Sisa Piutang" keyName="remaining" align="right" /></th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 text-sm">
                  {sortedInvoices.map((invoice) => {
                    const config = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.unpaid;
                    const due = dueInfo(invoice.due_date);

                    const total = Number(invoice.total_amount);
                    const paid = Number(invoice.paid_amount);
                    const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

                    return (
                      <tr key={invoice.id} className="group hover:bg-teal-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-mono font-bold text-teal-600 hover:text-teal-700 text-xs hover:underline"
                          >
                            {invoice.invoice_number}
                          </Link>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {fmtDate(invoice.invoice_date)}
                            {invoice.sales_order && (
                              <>
                                {' · '}
                                <Link href={`/sales-orders/${invoice.sales_order.id}`} className="font-mono hover:text-teal-600">
                                  {invoice.sales_order.so_number}
                                </Link>
                              </>
                            )}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-xs font-semibold text-gray-800">{invoice.customer?.name ?? '—'}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{invoice.customer?.customer_code ?? '—'}</p>
                        </td>

                        <td className="px-5 py-4">
                          {invoice.due_date ? (
                            <>
                              <p className="text-xs text-gray-700">{fmtDate(invoice.due_date)}</p>
                              {due && <p className={`text-[10px] mt-0.5 ${due.className}`}>{due.text}</p>}
                            </>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${paidPct}%` }}
                              className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono mt-1">
                            {fmtCompact(paid)} dari {fmtCompact(total)} · {paidPct}%
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className="font-mono font-bold text-gray-900">{fmt(invoice.remaining_amount)}</span>
                        </td>

                        <td className="px-5 py-4 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${config.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                            {config.label}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/invoices/${invoice.id}/pay`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-teal-200/40 transition-all"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 20.25z" />
                            </svg>
                            Bayar
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sortedInvoices.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-gray-400">
                {sortedInvoices.length} invoice belum lunas dari {summary.count_customers} customer
              </p>
              <p className="text-[11px] text-gray-500">
                Total sisa piutang <span className="font-mono font-bold text-gray-900">{fmt(summary.total_receivable)}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
