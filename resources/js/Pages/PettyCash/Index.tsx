import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Category {
    id: number;
    name: string;
    code: string;
}

interface Creator {
    id: number;
    name: string;
}

interface Transaction {
    id: number;
    transaction_number: string;
    transaction_date: string;
    fund_type: string;
    expense_category_id: number;
    coa_code: string | null;
    payment_method: string;
    amount: string;
    description: string;
    vendor_name: string | null;
    status: string;
    attachment_link: string | null;
    category: Category;
    creator: Creator;
}

interface PaginatedTransactions {
    data: Transaction[];
    links: { url: string | null; label: string; active: boolean }[];
    from: number;
    to: number;
    total: number;
}

interface Filters {
    search?: string;
    category_id?: string;
    fund_type?: string;
    status?: string;
    payment_method?: string;
    date_from?: string;
    date_to?: string;
}

interface PaymentMethod {
    value: string;
    label: string;
}

interface Status {
    value: string;
    label: string;
}

interface FundSummary {
    period_label: string;
    allocated: number;
    used: number;
    remaining: number;
    over_budget: boolean;
}

interface Props {
    transactions: PaginatedTransactions;
    fundTypes: Record<string, string>;
    summaries: Record<string, FundSummary>;
    categories: Category[];
    filters: Filters;
    paymentMethods: PaymentMethod[];
    statuses: Status[];
}

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
    draft:                     { label: 'Draft',                     badge: 'bg-slate-500/10 border-slate-500/20 text-gray-500',     dot: 'bg-slate-400' },
    pending_leader_approval:   { label: '⏳ Menunggu Leader',         badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',     dot: 'bg-amber-400' },
    pending_finance_approval:  { label: '⏳ Menunggu Finance',        badge: 'bg-orange-500/10 border-orange-500/20 text-orange-400',  dot: 'bg-orange-400' },
    approved:                  { label: '✅ Disetujui (Siap Cair)',   badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
    paid:                      { label: '💰 Sudah Dibayar',          badge: 'bg-teal-500/10 border-teal-500/20 text-teal-400',       dot: 'bg-teal-400' },
    rejected:                  { label: '❌ Ditolak',                badge: 'bg-rose-500/10 border-rose-500/20 text-rose-400',        dot: 'bg-rose-400' },
    cancelled:                 { label: 'Dibatalkan',                badge: 'bg-slate-500/10 border-slate-500/20 text-gray-400',     dot: 'bg-slate-500' },
};

const formatCurrency = (amount: string | number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(amount));

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function PettyCashIndex({ transactions, categories, fundTypes, summaries, filters, paymentMethods, statuses }: Props) {
    const { flash, auth } = usePage<PageProps>().props;

    const [search, setSearch]         = useState(filters.search || '');
    const [categoryId, setCategoryId] = useState(filters.category_id || '');
    const [fundType, setFundType]     = useState(filters.fund_type || '');
    const [status, setStatus]         = useState(filters.status || '');
    const [payMethod, setPayMethod]   = useState(filters.payment_method || '');
    const [dateFrom, setDateFrom]     = useState(filters.date_from || '');
    const [dateTo, setDateTo]         = useState(filters.date_to || '');

    const applyFilters = () => {
        router.get('/petty-cash', {
            search:         search || undefined,
            category_id:    categoryId || undefined,
            fund_type:      fundType || undefined,
            status:         status || undefined,
            payment_method: payMethod || undefined,
            date_from:      dateFrom || undefined,
            date_to:        dateTo || undefined,
        }, { preserveState: true, replace: true });
    };

    const resetFilters = () => {
        setSearch(''); setCategoryId(''); setFundType(''); setStatus(''); setPayMethod(''); setDateFrom(''); setDateTo('');
        router.get('/petty-cash', {}, { replace: true });
    };

    return (
        <AppLayout>
            <Head title="Petty Cash" />

            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Petty Cash</h1>
                        <p className="text-gray-500 text-xs mt-1">Keuangan / Pencatatan Pengeluaran Operasional</p>
                    </div>
                    <Link
                        id="btn-create-petty-cash"
                        href="/petty-cash/create"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-teal-200/40"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Tambah Transaksi
                    </Link>
                </div>

                {/* Flash messages */}
                {flash?.success && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl px-4 py-3">
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl px-4 py-3">
                        {flash.error}
                    </div>
                )}

                {/* Ringkasan dana minggu berjalan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(fundTypes).map(([type, label]) => {
                        const summary = summaries[type];
                        if (!summary) return null;

                        return (
                            <div
                                key={type}
                                className={`rounded-2xl border p-5 shadow-xl ${summary.over_budget ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-200'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">Minggu {summary.period_label}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${summary.over_budget ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-teal-500/10 border-teal-500/20 text-teal-600'}`}>
                                        {summary.over_budget ? 'Melebihi Dana' : 'Aman'}
                                    </span>
                                </div>

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

                {/* Filter Card */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                        {/* Search */}
                        <div className="xl:col-span-2 relative">
                            <input
                                id="filter-search"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                                placeholder="No. Transaksi / Deskripsi..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400"
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                                </svg>
                            </div>
                        </div>

                        {/* Fund Type */}
                        <select
                            id="filter-fund-type"
                            value={fundType}
                            onChange={e => setFundType(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">Semua Jenis Dana</option>
                            {Object.entries(fundTypes).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>

                        {/* Category */}
                        <select
                            id="filter-category"
                            value={categoryId}
                            onChange={e => setCategoryId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">Semua Kategori</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        {/* Status */}
                        <select
                            id="filter-status"
                            value={status}
                            onChange={e => setStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">Semua Status</option>
                            {statuses.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>

                        {/* Payment Method */}
                        <select
                            id="filter-payment-method"
                            value={payMethod}
                            onChange={e => setPayMethod(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">Semua Metode</option>
                            {paymentMethods.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>

                        {/* Date From */}
                        <input
                            id="filter-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                        />
                    </div>

                    <div className="flex justify-end gap-2.5 mt-4">
                        <button
                            id="btn-reset-filter"
                            type="button"
                            onClick={resetFilters}
                            className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
                        >
                            Reset Filter
                        </button>
                        <button
                            id="btn-apply-filter"
                            type="button"
                            onClick={applyFilters}
                            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-xs font-semibold border border-gray-300 hover:border-gray-400 transition-all shadow-md"
                        >
                            Terapkan Pencarian
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                                    <th className="py-3 px-6">No. Transaksi</th>
                                    <th className="py-3 px-6 text-center">Tanggal</th>
                                    <th className="py-3 px-6">Jenis Dana</th>
                                    <th className="py-3 px-6">Kategori / COA</th>
                                    <th className="py-3 px-6">Deskripsi</th>
                                    <th className="py-3 px-6 text-right">Jumlah</th>
                                    <th className="py-3 px-6">Metode</th>
                                    <th className="py-3 px-6 text-center">Status</th>
                                    <th className="py-3 px-6 text-center">Bukti</th>
                                    <th className="py-3 px-6">Dibuat Oleh</th>
                                    <th className="py-3 px-6 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                {transactions.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="text-center py-16 text-gray-400 font-medium">
                                            <div className="flex flex-col items-center gap-3">
                                                <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                <div>
                                                    <p className="font-semibold text-gray-500">Belum ada transaksi petty cash</p>
                                                    <p className="text-xs text-gray-400 mt-1">Klik "Tambah Transaksi" untuk membuat transaksi baru</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.data.map(t => {
                                        const s = statusConfig[t.status] ?? { label: t.status, badge: 'bg-slate-500/10 border-slate-500/20 text-gray-500', dot: 'bg-slate-400' };
                                        return (
                                            <tr key={t.id} className="hover:bg-teal-50/60 transition-colors">
                                                <td className="py-3.5 px-6 font-bold whitespace-nowrap">
                                                    <Link href={`/petty-cash/${t.id}`} className="text-teal-400 hover:text-teal-600 transition-colors font-mono">
                                                        {t.transaction_number}
                                                    </Link>
                                                </td>
                                                <td className="py-3.5 px-6 text-center text-xs whitespace-nowrap text-gray-500">
                                                    {formatDate(t.transaction_date)}
                                                </td>
                                                <td className="py-3.5 px-6 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider ${t.fund_type === 'dana_kelola' ? 'bg-violet-500/10 border-violet-500/20 text-violet-500' : 'bg-teal-500/10 border-teal-500/20 text-teal-600'}`}>
                                                        {t.fund_type === 'dana_kelola' ? 'Dana Kelola' : 'Petty Cash'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-6 whitespace-nowrap">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 border-blue-500/20 text-blue-400">
                                                        {t.category?.name ?? '-'}
                                                    </span>
                                                    <span className="block text-[10px] text-gray-400 font-mono mt-1">
                                                        COA {t.coa_code ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-6 text-gray-700 max-w-xs truncate" title={t.description}>
                                                    {t.description}
                                                </td>
                                                <td className="py-3.5 px-6 text-right font-extrabold text-gray-900 whitespace-nowrap">
                                                    {formatCurrency(t.amount)}
                                                </td>
                                                <td className="py-3.5 px-6 text-xs text-gray-500 whitespace-nowrap">
                                                    {paymentMethods.find(m => m.value === t.payment_method)?.label ?? t.payment_method}
                                                </td>
                                                <td className="py-3.5 px-6 text-center whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider ${s.badge}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                        {s.label}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-6 text-center whitespace-nowrap">
                                                    {t.attachment_link ? (
                                                        <a
                                                            href={t.attachment_link}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title="Lihat bukti pembayaran"
                                                            className="inline-flex p-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50 border border-transparent hover:border-teal-200 rounded-lg transition-all"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                                            </svg>
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-300 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-6 text-xs text-gray-500">
                                                    {t.creator?.name ?? '-'}
                                                </td>
                                                <td className="py-3.5 px-6 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Link
                                                            href={`/petty-cash/${t.id}`}
                                                            className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all inline-flex"
                                                            title="Detail"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                        </Link>
                                                        {auth.user?.roles?.includes('Super Admin') && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (confirm(`Apakah Anda yakin ingin menghapus transaksi Petty Cash ${t.transaction_number}?`)) {
                                                                        router.delete(`/petty-cash/${t.id}`);
                                                                    }
                                                                }}
                                                                className="p-1 text-gray-500 hover:text-rose-400 hover:bg-gray-50 border border-transparent hover:border-rose-900/50 rounded-lg transition-all inline-flex"
                                                                title="Hapus Transaksi (Super Admin)"
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
                    <div className="p-4 border-t border-gray-200 bg-white/80 flex justify-between items-center">
                        <div className="text-gray-400 text-xs font-medium">
                            {transactions.total > 0
                                ? `Menampilkan ${transactions.from}–${transactions.to} dari ${transactions.total} transaksi`
                                : 'Tidak ada data'}
                        </div>
                        {transactions.links.length > 3 && (
                            <div className="flex items-center gap-1 flex-wrap">
                                {transactions.links.map((link, i) =>
                                    link.url ? (
                                        <Link
                                            key={i}
                                            href={link.url}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                link.active
                                                    ? 'bg-teal-500 text-white'
                                                    : 'bg-gray-50 border border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-300'
                                            }`}
                                        />
                                    ) : (
                                        <span
                                            key={i}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                            className="px-3 py-1.5 rounded-lg text-xs text-gray-400"
                                        />
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
