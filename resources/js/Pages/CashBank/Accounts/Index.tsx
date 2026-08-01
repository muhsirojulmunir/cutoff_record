import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import { PageProps } from '../../../Types';

interface Account {
    id: number;
    account_code: string;
    account_name: string;
    account_type: string;
    bank_name: string | null;
    masked_account_number: string | null;
    current_balance: string;
    status: string;
    type_label: string;
}

interface AccountType { value: string; label: string; }

interface Props {
    accounts: { data: Account[]; links: any[]; from: number; to: number; total: number; };
    filters: { search?: string; type?: string; status?: string; };
    accountTypes: AccountType[];
}

const typeBadge: Record<string, string> = {
    cash:     'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    bank:     'bg-blue-500/10 border-blue-500/20 text-blue-400',
    e_wallet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
};

const statusBadge: Record<string, string> = {
    active:   'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    inactive: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const fmt = (n: string | number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n));

export default function AccountsIndex({ accounts, filters, accountTypes }: Props) {
    const { flash } = usePage<PageProps>().props;
    const [search, setSearch] = useState(filters.search ?? '');
    const [type,   setType]   = useState(filters.type   ?? '');
    const [status, setStatus] = useState(filters.status ?? '');

    const apply = () => router.get('/cash-bank/accounts', { search: search || undefined, type: type || undefined, status: status || undefined }, { preserveState: true, replace: true });
    const reset = () => { setSearch(''); setType(''); setStatus(''); router.get('/cash-bank/accounts', {}, { replace: true }); };

    return (
        <AppLayout>
            <Head title="Rekening Kas & Bank" />
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Rekening Kas & Bank</h1>
                        <p className="text-slate-400 text-xs mt-1">Kas & Bank / Master Rekening</p>
                    </div>
                    <Link href="/cash-bank/accounts/create" id="btn-create-account"
                        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-violet-900/30">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Tambah Rekening
                    </Link>
                </div>

                {flash?.success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl px-4 py-3">{flash.success}</div>}
                {flash?.error   && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl px-4 py-3">{flash.error}</div>}

                {/* Filters */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="relative">
                            <input id="filter-search" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && apply()}
                                placeholder="Kode / Nama Rekening / Bank..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none placeholder:text-slate-600" />
                            <div className="absolute left-3 top-2.5 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" /></svg>
                            </div>
                        </div>
                        <select id="filter-type" value={type} onChange={e => setType(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none cursor-pointer">
                            <option value="">Semua Jenis</option>
                            {accountTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select id="filter-status" value={status} onChange={e => setStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none cursor-pointer">
                            <option value="">Semua Status</option>
                            <option value="active">Aktif</option>
                            <option value="inactive">Tidak Aktif</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2.5 mt-4">
                        <button onClick={reset} className="px-4 py-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold transition-all">Reset</button>
                        <button id="btn-apply-filter" onClick={apply} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700 transition-all">Terapkan</button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                                    <th className="py-3 px-6">Kode</th>
                                    <th className="py-3 px-6">Nama Rekening</th>
                                    <th className="py-3 px-6 text-center">Jenis</th>
                                    <th className="py-3 px-6">Bank</th>
                                    <th className="py-3 px-6">No. Rekening</th>
                                    <th className="py-3 px-6 text-right">Saldo Saat Ini</th>
                                    <th className="py-3 px-6 text-center">Status</th>
                                    <th className="py-3 px-6 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900 text-sm text-slate-300">
                                {accounts.data.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16 text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                                            <p className="font-semibold text-slate-400">Belum ada rekening</p>
                                        </div>
                                    </td></tr>
                                ) : accounts.data.map(acc => (
                                    <tr key={acc.id} className="hover:bg-slate-900/30 transition-colors">
                                        <td className="py-3.5 px-6 font-mono font-bold text-violet-400 whitespace-nowrap">
                                            <Link href={`/cash-bank/accounts/${acc.id}`} className="hover:text-violet-300 transition-colors">{acc.account_code}</Link>
                                        </td>
                                        <td className="py-3.5 px-6 font-medium text-white whitespace-nowrap">{acc.account_name}</td>
                                        <td className="py-3.5 px-6 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider ${typeBadge[acc.account_type] ?? 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
                                                {acc.type_label}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-6 text-xs text-slate-400">{acc.bank_name ?? '—'}</td>
                                        <td className="py-3.5 px-6 text-xs font-mono text-slate-400">{acc.masked_account_number ?? '—'}</td>
                                        <td className="py-3.5 px-6 text-right font-extrabold text-white whitespace-nowrap">{fmt(acc.current_balance)}</td>
                                        <td className="py-3.5 px-6 text-center whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase ${statusBadge[acc.status] ?? ''}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${acc.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                {acc.status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-6 text-center whitespace-nowrap">
                                            <Link href={`/cash-bank/accounts/${acc.id}`}
                                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg transition-all inline-flex" title="Detail">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 border-t border-slate-900 bg-slate-950/40 flex justify-between items-center">
                        <div className="text-slate-500 text-xs font-medium">
                            {accounts.total > 0 ? `Menampilkan ${accounts.from}–${accounts.to} dari ${accounts.total} rekening` : 'Tidak ada data'}
                        </div>
                        {accounts.links.length > 3 && (
                            <div className="flex items-center gap-1">
                                {accounts.links.map((link, i) => link.url ? (
                                    <Link key={i} href={link.url} dangerouslySetInnerHTML={{ __html: link.label }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${link.active ? 'bg-violet-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'}`} />
                                ) : (
                                    <span key={i} dangerouslySetInnerHTML={{ __html: link.label }} className="px-3 py-1.5 text-xs text-slate-600" />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
