import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface SyncLog {
    id: number;
    marketplace: string;
    sync_type: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    records_fetched: number;
    records_created: number;
    records_updated: number;
    records_skipped: number;
    records_failed: number;
    error_message: string | null;
    account: { id: number; account_name: string };
    creator: { name: string } | null;
}

interface Props {
    logs: { data: SyncLog[]; current_page: number; last_page: number; total: number };
    accounts: { id: number; account_name: string; marketplace: string }[];
    filters: Record<string, string>;
    syncTypes: string[];
    statuses: string[];
}

const STATUS_COLORS: Record<string, string> = {
    success: 'bg-emerald-500/20 text-emerald-400',
    partial: 'bg-amber-500/20 text-amber-400',
    failed:  'bg-red-500/20 text-red-400',
    running: 'bg-blue-500/20 text-blue-400',
};

const MP_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok_shop: 'TikTok Shop' };

export default function MarketplaceSyncLogsIndex({ logs, accounts, filters, syncTypes, statuses }: Props) {
    const [localFilters, setLocalFilters] = useState({ ...filters });

    const applyFilters = () => {
        router.get('/marketplace/sync-logs', localFilters as Record<string, string>, { preserveState: true });
    };

    const duration = (log: SyncLog): string => {
        if (!log.completed_at) return 'Running...';
        const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <AppLayout>
            <Head title="Log Sinkronisasi Marketplace" />
            <div className="min-h-screen bg-slate-950 p-6">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-violet-600/20 rounded-lg text-violet-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Log Sinkronisasi</h1>
                        <p className="text-slate-400 text-sm">Riwayat sinkronisasi semua akun marketplace</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <select value={localFilters.account_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, account_id: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Akun</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                        </select>
                        <select value={localFilters.sync_type ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, sync_type: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Tipe</option>
                            {syncTypes.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                        </select>
                        <select value={localFilters.status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, status: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Status</option>
                            {statuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </select>
                        <button onClick={applyFilters}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors text-sm">
                            Filter
                        </button>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    {logs.data.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-slate-400">Belum ada log sinkronisasi.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    {['Akun', 'Tipe Sync', 'Status', 'Mulai', 'Durasi', 'Fetch', 'Baru', 'Update', 'Gagal'].map(h => (
                                        <th key={h} className="text-left px-5 py-4 text-slate-400 text-xs font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {logs.data.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-5 py-3">
                                            <p className="text-white text-sm">{log.account.account_name}</p>
                                            <p className="text-slate-500 text-xs">{MP_LABELS[log.marketplace] ?? log.marketplace}</p>
                                        </td>
                                        <td className="px-5 py-3 text-slate-300 text-sm capitalize">{log.sync_type}</td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[log.status] ?? 'bg-slate-700 text-slate-300'}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-slate-400 text-xs">
                                            {new Date(log.started_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="px-5 py-3 text-slate-400 text-xs">{duration(log)}</td>
                                        <td className="px-5 py-3 text-slate-300 text-sm">{log.records_fetched}</td>
                                        <td className="px-5 py-3 text-emerald-400 text-sm">{log.records_created}</td>
                                        <td className="px-5 py-3 text-blue-400 text-sm">{log.records_updated}</td>
                                        <td className="px-5 py-3">
                                            {log.records_failed > 0 ? (
                                                <span className="text-red-400 text-sm font-medium">{log.records_failed}</span>
                                            ) : (
                                                <span className="text-slate-500 text-sm">0</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {logs.last_page > 1 && (
                        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
                            <p className="text-slate-400 text-sm">Total {logs.total} log</p>
                            <div className="flex items-center gap-2">
                                {logs.current_page > 1 && (
                                    <Link href={`/marketplace/sync-logs?page=${logs.current_page - 1}`}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                                        &laquo;
                                    </Link>
                                )}
                                <span className="text-slate-400 text-sm">{logs.current_page} / {logs.last_page}</span>
                                {logs.current_page < logs.last_page && (
                                    <Link href={`/marketplace/sync-logs?page=${logs.current_page + 1}`}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                                        &raquo;
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
