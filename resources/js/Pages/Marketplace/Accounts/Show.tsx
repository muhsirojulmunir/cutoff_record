import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface SyncLog {
    id: number;
    sync_type: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    records_fetched: number;
    records_created: number;
    records_updated: number;
    records_failed: number;
    error_message: string | null;
}

interface Account {
    id: number;
    marketplace: string;
    account_name: string;
    shop_id: string | null;
    shop_name: string | null;
    status: string;
    credentials_status: string;
    connection_status: string;
    has_credentials?: boolean;
    last_synced_at: string | null;
    token_expires_at: string | null;
    last_connected_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    sync_logs: SyncLog[];
    created_at: string;
}

interface Props {
    account: Account;
    ordersCount: number;
}

const MP_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok_shop: 'TikTok Shop' };

const CONN_STATUS_COLORS: Record<string, string> = {
    connected:    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    disconnected: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    expired:      'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    error:        'bg-red-500/20 text-red-400 border border-red-500/30',
};

export default function MarketplaceAccountShow({ account, ordersCount }: Props) {
    const { props } = usePage<{ flash?: { success?: string; error?: string } }>();
    const flash = props.flash ?? {};

    const [showCredModal, setShowCredModal] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);

    const [credForm, setCredForm] = useState({
        access_token: '',
        refresh_token: '',
        app_key: '',
        app_secret: '',
        shop_id: account.shop_id ?? '',
    });

    const [syncForm, setSyncForm] = useState({
        date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        date_to: new Date().toISOString().split('T')[0],
    });

    const handleSaveCreds = (e: React.FormEvent) => {
        e.preventDefault();
        router.post(`/marketplace/accounts/${account.id}/credentials`, credForm, {
            onSuccess: () => setShowCredModal(false),
        });
    };

    const handleTestConnection = () => {
        router.post(`/marketplace/accounts/${account.id}/test-connection`);
    };

    const handleDisconnect = () => {
        if (confirm('Putuskan koneksi API untuk akun ini?')) {
            router.post(`/marketplace/accounts/${account.id}/disconnect`);
        }
    };

    const handleSyncNow = (e: React.FormEvent) => {
        e.preventDefault();
        router.post(`/marketplace/accounts/${account.id}/sync-now`, syncForm, {
            onSuccess: () => setShowSyncModal(false),
        });
    };

    return (
        <AppLayout>
            <Head title={account.account_name} />
            <div className="min-h-screen bg-slate-950 p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link href="/marketplace/accounts"
                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                            &laquo; Batal
                        </Link>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-2xl font-bold text-white">{account.account_name}</h1>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${CONN_STATUS_COLORS[account.connection_status] ?? 'bg-slate-700 text-slate-300'}`}>
                                    {account.connection_status}
                                </span>
                            </div>
                            {account.shop_name && <p className="text-slate-400 text-sm">{account.shop_name}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowSyncModal(true)}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors text-sm font-medium">
                            Sync Order Sekarang
                        </button>
                        <button onClick={handleTestConnection}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm font-medium">
                            Test Koneksi
                        </button>
                        <button onClick={() => setShowCredModal(true)}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm font-medium">
                            Setup Credential
                        </button>
                        {account.connection_status === 'connected' && (
                            <button onClick={handleDisconnect}
                                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm font-medium">
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>

                {flash.success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{flash.success}</div>}
                {flash.error   && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{flash.error}</div>}

                {/* Info Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <h2 className="text-white font-semibold mb-4">Detail Koneksi API</h2>
                        <dl className="space-y-3 text-sm">
                            <div className="flex justify-between"><dt className="text-slate-400">Platform</dt><dd className="text-white capitalize">{MP_LABELS[account.marketplace] ?? account.marketplace}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-400">Shop ID</dt><dd className="text-white font-mono">{account.shop_id ?? '-'}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-400">Status Koneksi</dt><dd className="text-white capitalize">{account.connection_status}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-400">Token Status</dt><dd className="text-white capitalize">{account.credentials_status}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-400">Terakhir Terhubung</dt><dd className="text-white">{account.last_connected_at ? new Date(account.last_connected_at).toLocaleString('id-ID') : '-'}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-400">Token Expire</dt><dd className="text-white">{account.token_expires_at ? new Date(account.token_expires_at).toLocaleString('id-ID') : '-'}</dd></div>
                        </dl>
                        {account.last_sync_error && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                                <p className="font-medium mb-1">Catatan Error API Terakhir:</p>
                                <p className="font-mono">{account.last_sync_error}</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <h2 className="text-white font-semibold mb-4">Log Sinkronisasi Terakhir</h2>
                        {account.sync_logs.length === 0 ? (
                            <p className="text-slate-500 text-sm">Belum ada log sinkronisasi.</p>
                        ) : (
                            <div className="space-y-2">
                                {account.sync_logs.map(log => (
                                    <Link key={log.id} href={`/marketplace/sync-logs/${log.id}`}
                                        className="flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">
                                        <div>
                                            <p className="text-white text-sm capitalize">{log.sync_type}</p>
                                            <p className="text-slate-400 text-xs">
                                                {new Date(log.started_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-medium capitalize text-slate-300">
                                                {log.status}
                                            </span>
                                            <p className="text-slate-400 text-xs">
                                                {log.records_created} baru · {log.records_updated} upd
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Setup Credentials Modal */}
                {showCredModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg">
                            <h2 className="text-xl font-bold text-white mb-2">Setup Kredensial API {MP_LABELS[account.marketplace]}</h2>
                            <p className="text-slate-400 text-xs mb-4">Token &amp; Key disimpan secara tertutup menggunakan Laravel Encryption.</p>
                            <form onSubmit={handleSaveCreds} className="space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Access Token *</label>
                                    <input type="password" value={credForm.access_token}
                                        onChange={e => setCredForm(f => ({ ...f, access_token: e.target.value }))}
                                        required placeholder="Masukkan Access Token API"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Refresh Token (opsional)</label>
                                    <input type="password" value={credForm.refresh_token}
                                        onChange={e => setCredForm(f => ({ ...f, refresh_token: e.target.value }))}
                                        placeholder="Masukkan Refresh Token API"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Shop ID / Open ID</label>
                                    <input type="text" value={credForm.shop_id}
                                        onChange={e => setCredForm(f => ({ ...f, shop_id: e.target.value }))}
                                        placeholder="ID Toko dari portal developer"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500" />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => setShowCredModal(false)}
                                        className="px-4 py-2 border border-slate-700 text-slate-400 hover:text-white rounded-xl text-sm">Batal</button>
                                    <button type="submit"
                                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm">Simpan Kredensial</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Sync Now Modal */}
                {showSyncModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
                            <h2 className="text-xl font-bold text-white mb-2">Sync Orders dari {account.account_name}</h2>
                            <p className="text-slate-400 text-xs mb-4">Pilih rentang tanggal order yang akan di-fetch dari API.</p>
                            <form onSubmit={handleSyncNow} className="space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Dari Tanggal</label>
                                    <input type="date" value={syncForm.date_from}
                                        onChange={e => setSyncForm(f => ({ ...f, date_from: e.target.value }))}
                                        required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Sampai Tanggal</label>
                                    <input type="date" value={syncForm.date_to}
                                        onChange={e => setSyncForm(f => ({ ...f, date_to: e.target.value }))}
                                        required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm" />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => setShowSyncModal(false)}
                                        className="px-4 py-2 border border-slate-700 text-slate-400 hover:text-white rounded-xl text-sm">Batal</button>
                                    <button type="submit"
                                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm">Mulai Sync</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
