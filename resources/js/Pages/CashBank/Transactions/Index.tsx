import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Account { id: number; account_code: string; account_name: string; }
interface Transaction {
    id: number; transaction_number: string; transaction_date: string;
    transaction_type: string; type_label: string; direction: string;
    amount: string; balance_before: string; balance_after: string;
    description: string; reference_number: string | null; status: string;
    account: { id: number; account_code: string; account_name: string; };
    creator: { name: string; };
}
interface TransactionType { value: string; label: string; }

interface Props {
    transactions: { data: Transaction[]; links: any[]; from: number; to: number; total: number; };
    accounts: Account[];
    filters: { search?: string; account_id?: string; transaction_type?: string; direction?: string; date_from?: string; date_to?: string; };
    transactionTypes: TransactionType[];
}

const fmt = (n: string | number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n));

const dirBadge: Record<string, string> = {
    in:  'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    out: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};
const statusBadge: Record<string, string> = {
    posted:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
    reversed: 'bg-slate-500/10 border-slate-500/20 text-gray-500',
};

export default function TransactionsIndex({ transactions, accounts, filters, transactionTypes }: Props) {
    const { auth } = usePage<any>().props;
    const [search,  setSearch]  = useState(filters.search ?? '');
    const [acctId,  setAcctId]  = useState(filters.account_id ?? '');
    const [type,    setType]    = useState(filters.transaction_type ?? '');
    const [dir,     setDir]     = useState(filters.direction ?? '');
    const [dateFrom,setDateFrom]= useState(filters.date_from ?? '');
    const [dateTo,  setDateTo]  = useState(filters.date_to ?? '');

    const apply = () => router.get('/cash-bank/transactions', {
        search: search || undefined, account_id: acctId || undefined,
        transaction_type: type || undefined, direction: dir || undefined,
        date_from: dateFrom || undefined, date_to: dateTo || undefined,
    }, { preserveState: true, replace: true });

    const reset = () => {
        setSearch(''); setAcctId(''); setType(''); setDir(''); setDateFrom(''); setDateTo('');
        router.get('/cash-bank/transactions', {}, { replace: true });
    };

    return (
        <AppLayout>
            <Head title="Ledger Transaksi Kas & Bank" />
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Ledger Transaksi Kas & Bank</h1>
                        <p className="text-gray-500 text-xs mt-1">Kas & Bank / Ledger Transaksi</p>
                    </div>
                    <Link href="/cash-bank/accounts" className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">
                        ← Daftar Rekening
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="relative lg:col-span-1">
                            <input id="filter-search" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && apply()}
                                placeholder="Nomor / Referensi / Keterangan..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none placeholder:text-gray-400" />
                            <div className="absolute left-3 top-2.5 text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" /></svg>
                            </div>
                        </div>
                        <select id="filter-account" value={acctId} onChange={e => setAcctId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none cursor-pointer">
                            <option value="">Semua Rekening</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                        </select>
                        <select id="filter-type" value={type} onChange={e => setType(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none cursor-pointer">
                            <option value="">Semua Jenis</option>
                            {transactionTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select id="filter-direction" value={dir} onChange={e => setDir(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none cursor-pointer">
                            <option value="">Semua Arah</option>
                            <option value="in">Masuk (IN)</option>
                            <option value="out">Keluar (OUT)</option>
                        </select>
                        <input id="filter-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none cursor-pointer" />
                        <input id="filter-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none cursor-pointer" />
                    </div>
                    <div className="flex justify-end gap-2.5 mt-4">
                        <button onClick={reset} className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">Reset</button>
                        <button id="btn-apply-filter" onClick={apply} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-xs font-semibold border border-gray-300 transition-all">Terapkan</button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                                    <th className="py-3 px-5">No. Transaksi</th>
                                    <th className="py-3 px-5">Tanggal</th>
                                    <th className="py-3 px-5">Rekening</th>
                                    <th className="py-3 px-5">Jenis</th>
                                    <th className="py-3 px-5 text-center">Arah</th>
                                    <th className="py-3 px-5 text-right">Nominal</th>
                                    <th className="py-3 px-5 text-right">Saldo Sebelum</th>
                                    <th className="py-3 px-5 text-right">Saldo Sesudah</th>
                                    <th className="py-3 px-5 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                {transactions.data.length === 0 ? (
                                    <tr><td colSpan={9} className="text-center py-16 text-gray-400">Belum ada transaksi</td></tr>
                                ) : transactions.data.map(t => (
                                    <tr key={t.id} className="hover:bg-teal-50/60 transition-colors">
                                        <td className="py-3.5 px-5 font-mono font-bold text-teal-400 whitespace-nowrap">
                                            <Link href={`/cash-bank/transactions/${t.id}`} className="hover:text-teal-600">{t.transaction_number}</Link>
                                        </td>
                                        <td className="py-3.5 px-5 whitespace-nowrap text-xs">{new Date(t.transaction_date).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'})}</td>
                                        <td className="py-3.5 px-5 text-xs whitespace-nowrap">
                                            <Link href={`/cash-bank/accounts/${t.account.id}`} className="text-blue-400 hover:text-blue-300 font-mono">{t.account.account_code}</Link>
                                        </td>
                                        <td className="py-3.5 px-5 text-xs whitespace-nowrap text-gray-500">{t.type_label}</td>
                                        <td className="py-3.5 px-5 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold ${dirBadge[t.direction]}`}>
                                                {t.direction === 'in' ? '▲ IN' : '▼ OUT'}
                                            </span>
                                        </td>
                                        <td className={`py-3.5 px-5 text-right font-extrabold whitespace-nowrap ${t.direction === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {t.direction === 'in' ? '+' : '-'}{fmt(t.amount)}
                                        </td>
                                        <td className="py-3.5 px-5 text-right font-mono text-xs text-gray-500 whitespace-nowrap">{fmt(t.balance_before)}</td>
                                        <td className="py-3.5 px-5 text-right font-mono text-xs font-semibold text-gray-900 whitespace-nowrap">{fmt(t.balance_after)}</td>
                        <td className="py-3.5 px-5 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase ${statusBadge[t.status] ?? ''}`}>
                                                {t.status === 'posted' ? 'Posted' : 'Reversed'}
                                            </span>
                                        </td>
                                        {auth.user?.roles?.includes('Super Admin') && (
                                            <td className="py-3.5 px-5 text-center whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirm(`Hapus transaksi ${t.transaction_number}? Saldo rekening akan dibalik.`)) {
                                                            router.delete(`/cash-bank/transactions/${t.id}`);
                                                        }
                                                    }}
                                                    className="p-1 text-gray-500 hover:text-rose-400 hover:bg-gray-50 border border-transparent hover:border-rose-900/40 rounded-lg transition-all inline-flex"
                                                    title="Hapus Transaksi (Super Admin)"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 border-t border-gray-200 bg-white/80 flex justify-between items-center">
                        <div className="text-gray-400 text-xs font-medium">
                            {transactions.total > 0 ? `Menampilkan ${transactions.from}–${transactions.to} dari ${transactions.total} transaksi` : 'Tidak ada data'}
                        </div>
                        {transactions.links.length > 3 && (
                            <div className="flex items-center gap-1">
                                {transactions.links.map((link, i) => link.url ? (
                                    <Link key={i} href={link.url} dangerouslySetInnerHTML={{ __html: link.label }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${link.active ? 'bg-teal-500 text-white' : 'bg-gray-50 border border-gray-300 text-gray-500 hover:text-gray-900'}`} />
                                ) : (
                                    <span key={i} dangerouslySetInnerHTML={{ __html: link.label }} className="px-3 py-1.5 text-xs text-gray-400" />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
