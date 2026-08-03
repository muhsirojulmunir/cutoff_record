import React, { FormEvent } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';
import Pagination from '@/Components/Pagination';
import { PageProps } from '../../Types';

interface CashBankAccount {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  current_balance: string;
}

interface Allocation {
  id: number;
  fund_type: string;
  fund_type_label: string;
  period_label: string;
  period_start: string;
  period_end: string;
  amount: string;
  notes: string | null;
  cash_bank_account: CashBankAccount | null;
  creator: { id: number; name: string } | null;
}

interface FundSummary {
  period_label: string;
  allocated: number;
  used: number;
  remaining: number;
  over_budget: boolean;
}

interface Props {
  allocations: {
    data: Allocation[];
    links: { url: string | null; label: string; active: boolean }[];
    total: number;
  };
  filters: { fund_type?: string };
  fundTypes: Record<string, string>;
  summaries: Record<string, FundSummary>;
  currentWeek: { period_start: string; period_end: string; label: string };
  cashBankAccounts: CashBankAccount[];
}

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all';

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const formatCurrency = (amount: string | number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(amount));

export default function FundAllocationIndex({
  allocations,
  filters,
  fundTypes,
  summaries,
  currentWeek,
  cashBankAccounts,
}: Props) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];
  const canCreate = permissions.includes('fund_allocation.create');

  const { data, setData, post, processing, errors, reset } = useForm({
    fund_type: 'petty_cash',
    period_start: currentWeek.period_start,
    amount: '',
    cash_bank_account_id: '',
    notes: '',
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    post('/fund-allocations', {
      preserveScroll: true,
      onSuccess: () => reset('amount', 'notes'),
    });
  }

  function handleFilter(value: string) {
    router.get('/fund-allocations', value ? { fund_type: value } : {}, { preserveState: true, replace: true });
  }

  function handleDelete(allocation: Allocation) {
    if (!confirm(`Hapus pengisian ${allocation.fund_type_label} periode ${allocation.period_label}?`)) return;
    router.delete(`/fund-allocations/${allocation.id}`, { preserveScroll: true });
  }

  return (
    <AppLayout>
      <Head title="Pengisian Dana Mingguan" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pengisian Dana Mingguan</h1>
          <p className="text-gray-500 text-xs mt-1">Keuangan / Dana Petty Cash &amp; Dana Kelola</p>
        </div>

        {flash?.success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm rounded-xl px-4 py-3">
            {flash.success}
          </div>
        )}
        {flash?.error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm rounded-xl px-4 py-3">
            {flash.error}
          </div>
        )}

        {/* Ringkasan minggu berjalan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(fundTypes).map(([type, label]) => {
            const summary = summaries[type];
            if (!summary) return null;

            return (
              <div
                key={type}
                className={`rounded-2xl border p-5 shadow-xl ${summary.over_budget ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-200'}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">Minggu {summary.period_label}</p>
                <p className={`text-2xl font-bold font-mono mt-3 ${summary.over_budget ? 'text-rose-600' : 'text-gray-900'}`}>
                  {formatCurrency(summary.remaining)}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Diisi {formatCurrency(summary.allocated)} • Terpakai {formatCurrency(summary.used)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form pengisian */}
          {canCreate && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden h-fit">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">Catat Pengisian Dana</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label htmlFor="fund_type" className={labelClass}>
                    Jenis Dana <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="fund_type"
                    value={data.fund_type}
                    onChange={(e) => setData('fund_type', e.target.value)}
                    className={inputClass}
                  >
                    {Object.entries(fundTypes).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {errors.fund_type && <p className="text-rose-400 text-xs mt-1">{errors.fund_type}</p>}
                </div>

                <div>
                  <label htmlFor="period_start" className={labelClass}>
                    Minggu Periode <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="period_start"
                    type="date"
                    value={data.period_start}
                    onChange={(e) => setData('period_start', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Tanggal berapa pun akan dibulatkan ke minggu Senin–Minggu.
                  </p>
                  {errors.period_start && <p className="text-rose-400 text-xs mt-1">{errors.period_start}</p>}
                </div>

                <div>
                  <label htmlFor="amount" className={labelClass}>
                    Nominal Dana <span className="text-rose-400">*</span>
                  </label>
                  <CurrencyInput
                    id="amount"
                    value={data.amount}
                    onChange={(v) => setData('amount', String(v))}
                    className={inputClass}
                  />
                  {errors.amount && <p className="text-rose-400 text-xs mt-1">{errors.amount}</p>}
                </div>

                <div>
                  <label htmlFor="cash_bank_account_id" className={labelClass}>Sumber Dana (Kas / Bank)</label>
                  <select
                    id="cash_bank_account_id"
                    value={data.cash_bank_account_id}
                    onChange={(e) => setData('cash_bank_account_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Tanpa potong saldo kas --</option>
                    {cashBankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        [{account.account_code}] {account.account_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Bila dipilih, saldo rekening otomatis berkurang sebesar nominal dana.
                  </p>
                  {errors.cash_bank_account_id && <p className="text-rose-400 text-xs mt-1">{errors.cash_bank_account_id}</p>}
                </div>

                <div>
                  <label htmlFor="notes" className={labelClass}>Catatan</label>
                  <textarea
                    id="notes"
                    rows={2}
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                    placeholder="Opsional"
                    className={`${inputClass} resize-none`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={processing}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40 disabled:opacity-50"
                >
                  {processing ? 'Menyimpan...' : 'Simpan Pengisian Dana'}
                </button>
              </form>
            </div>
          )}

          {/* Riwayat pengisian */}
          <div className={`${canCreate ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-800 text-sm">Riwayat Pengisian</h2>
              <select
                value={filters.fund_type ?? ''}
                onChange={(e) => handleFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none cursor-pointer"
              >
                <option value="">Semua Jenis Dana</option>
                {Object.entries(fundTypes).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                      <th className="py-3 px-5">Periode</th>
                      <th className="py-3 px-5">Jenis Dana</th>
                      <th className="py-3 px-5 text-right">Nominal</th>
                      <th className="py-3 px-5">Sumber Dana</th>
                      <th className="py-3 px-5">Dicatat Oleh</th>
                      {canCreate && <th className="py-3 px-5 text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {allocations.data.length === 0 ? (
                      <tr>
                        <td colSpan={canCreate ? 6 : 5} className="text-center py-14 text-gray-400">
                          Belum ada pengisian dana dicatat.
                        </td>
                      </tr>
                    ) : (
                      allocations.data.map((allocation) => (
                        <tr key={allocation.id} className="hover:bg-teal-50/60 transition-colors">
                          <td className="py-3.5 px-5 whitespace-nowrap font-semibold text-gray-800">
                            {allocation.period_label}
                          </td>
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider ${allocation.fund_type === 'dana_kelola' ? 'bg-violet-500/10 border-violet-500/20 text-violet-500' : 'bg-teal-500/10 border-teal-500/20 text-teal-600'}`}>
                              {allocation.fund_type === 'dana_kelola' ? 'Dana Kelola' : 'Petty Cash'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                            {formatCurrency(allocation.amount)}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-gray-500">
                            {allocation.cash_bank_account
                              ? `[${allocation.cash_bank_account.account_code}] ${allocation.cash_bank_account.account_name}`
                              : '—'}
                          </td>
                          <td className="py-3.5 px-5 text-xs text-gray-500">{allocation.creator?.name ?? '—'}</td>
                          {canCreate && (
                            <td className="py-3.5 px-5 text-center">
                              <button
                                type="button"
                                onClick={() => handleDelete(allocation)}
                                title="Hapus pengisian"
                                className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {allocations.links.length > 3 && (
                <div className="px-5 py-3 border-t border-gray-200">
                  <Pagination links={allocations.links} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
