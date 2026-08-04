import React from 'react';
import { Head, Link } from '@inertiajs/react';
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
    metadata: Record<string, unknown> | null;
    account: { id: number; account_name: string };
    creator: { name: string } | null;
}

interface Props {
    log: SyncLog;
}

const STATUS_COLORS: Record<string, string> = {
    success: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    partial: 'bg-orange-50 text-orange-600 border border-orange-300',
    failed:  'bg-red-500/20 text-red-400 border border-red-500/30',
    running: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
};

export default function MarketplaceSyncLogShow({ log }: Props) {
    const duration = (): string => {
        if (!log.completed_at) return 'Masih berjalan...';
        const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
    };

    return (
        <AppLayout>
            <Head title={`Sync Log #${log.id}`} />
            <div className="min-h-screen bg-white p-6">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/marketplace/sync-logs"
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-gray-900 capitalize">Sync {log.sync_type}</h1>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[log.status] ?? 'bg-gray-200 text-gray-700'}`}>
                                {log.status}
                            </span>
                        </div>
                        <p className="text-gray-500 text-sm">{log.account.account_name}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Stats */}
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <h2 className="text-gray-900 font-semibold mb-4">Statistik</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Total Fetch', value: log.records_fetched, color: 'text-gray-700' },
                                { label: 'Dibuat', value: log.records_created, color: 'text-emerald-400' },
                                { label: 'Diperbarui', value: log.records_updated, color: 'text-blue-400' },
                                { label: 'Dilewati', value: log.records_skipped, color: 'text-gray-500' },
                                { label: 'Gagal', value: log.records_failed, color: log.records_failed > 0 ? 'text-red-400' : 'text-gray-400' },
                                { label: 'Durasi', value: duration(), color: 'text-teal-400' },
                            ].map(s => (
                                <div key={s.label} className="bg-gray-100 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs">{s.label}</p>
                                    <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <h2 className="text-gray-900 font-semibold mb-4">Informasi</h2>
                        <dl className="space-y-3 text-sm">
                            {[
                                { label: 'Akun', value: log.account.account_name },
                                { label: 'Marketplace', value: log.marketplace },
                                { label: 'Tipe Sync', value: log.sync_type },
                                { label: 'Mulai', value: new Date(log.started_at).toLocaleString('id-ID') },
                                { label: 'Selesai', value: log.completed_at ? new Date(log.completed_at).toLocaleString('id-ID') : '-' },
                                { label: 'Dibuat Oleh', value: log.creator?.name ?? 'System' },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between">
                                    <dt className="text-gray-500">{label}</dt>
                                    <dd className="text-gray-900 capitalize">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        {log.error_message && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                                <p className="font-medium mb-1">Error:</p>
                                <p className="whitespace-pre-wrap">{log.error_message}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
