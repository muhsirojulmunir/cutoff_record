import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface MarketplaceAccount {
    id: number;
    marketplace: string;
    account_name: string;
    shop_id: string | null;
    shop_name: string | null;
    status: string;
    credentials_status: string;
    last_synced_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    creator?: { name: string };
    created_at: string;
}

interface Props {
    accounts: {
        data: MarketplaceAccount[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

const MARKETPLACE_LABELS: Record<string, string> = {
    shopee: 'Shopee',
    tiktok_shop: 'TikTok Shop',
};

const MARKETPLACE_COLORS: Record<string, string> = {
    shopee: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    tiktok_shop: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
};

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; label: string }> = {
        active:   { color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', label: 'Aktif' },
        inactive: { color: 'bg-slate-500/20 text-gray-500 border border-slate-500/30',       label: 'Nonaktif' },
        error:    { color: 'bg-red-500/20 text-red-400 border border-red-500/30',             label: 'Error' },
    };
    const s = map[status] ?? map.inactive;
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
            {s.label}
        </span>
    );
}

export default function MarketplaceAccountsIndex({ accounts }: Props) {
    const [activeMenu, setActiveMenu] = useState<number | null>(null);
    const { props } = usePage<{ flash: { success?: string; error?: string } }>();
    const flash = props.flash ?? {};

    const handleDeactivate = (id: number) => {
        if (confirm('Nonaktifkan akun marketplace ini?')) {
            router.post(`/marketplace/accounts/${id}/deactivate`);
        }
        setActiveMenu(null);
    };

    const handleActivate = (id: number) => {
        router.post(`/marketplace/accounts/${id}/activate`);
        setActiveMenu(null);
    };

    return (
        <AppLayout>
            <Head title="Akun Marketplace" />

            <div className="min-h-screen bg-white p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-teal-600/20 rounded-lg text-teal-400">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Akun Marketplace</h1>
                        </div>
                        <p className="text-gray-500 text-sm ml-14">
                            Kelola koneksi ke Shopee dan TikTok Shop
                        </p>
                    </div>
                    <Link
                        href="/marketplace/accounts/create"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-teal-200/40"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Tambah Akun
                    </Link>
                </div>

                {/* Flash */}
                {flash.success && (
                    <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
                        {flash.success}
                    </div>
                )}
                {flash.error && (
                    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        {flash.error}
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {[
                        { label: 'Total Akun', value: accounts.total, color: 'text-teal-400' },
                        { label: 'Aktif', value: accounts.data.filter(a => a.status === 'active').length, color: 'text-emerald-400' },
                        { label: 'Tidak Aktif', value: accounts.data.filter(a => a.status !== 'active').length, color: 'text-gray-500' },
                    ].map(s => (
                        <div key={s.label} className="bg-gray-50 border border-gray-300 rounded-xl p-4">
                            <p className="text-gray-500 text-sm">{s.label}</p>
                            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Table */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl overflow-hidden">
                    {accounts.data.length === 0 ? (
                        <div className="text-center py-16">
                            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            <p className="text-gray-500">Belum ada akun marketplace.</p>
                            <Link href="/marketplace/accounts/create"
                                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-lg transition-colors text-sm shadow-lg shadow-teal-200/40">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Tambah Akun
                            </Link>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-300">
                                    <th className="text-left px-6 py-4 text-gray-500 text-sm font-medium">Akun</th>
                                    <th className="text-left px-6 py-4 text-gray-500 text-sm font-medium">Marketplace</th>
                                    <th className="text-left px-6 py-4 text-gray-500 text-sm font-medium">Status</th>
                                    <th className="text-left px-6 py-4 text-gray-500 text-sm font-medium">Sync Terakhir</th>
                                    <th className="text-right px-6 py-4 text-gray-500 text-sm font-medium">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/50">
                                {accounts.data.map(account => (
                                    <tr key={account.id} className="hover:bg-gray-100/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="text-gray-900 font-medium">{account.account_name}</p>
                                            {account.shop_name && (
                                                <p className="text-gray-500 text-xs mt-0.5">{account.shop_name}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${MARKETPLACE_COLORS[account.marketplace] ?? 'bg-gray-200 text-gray-700'}`}>
                                                {MARKETPLACE_LABELS[account.marketplace] ?? account.marketplace}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={account.status} />
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 text-sm">
                                            {account.last_synced_at
                                                ? new Date(account.last_synced_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
                                                : <span className="text-gray-400">Belum pernah</span>
                                            }
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={() => setActiveMenu(activeMenu === account.id ? null : account.id)}
                                                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 hover:text-gray-900"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                                                </button>
                                                {activeMenu === account.id && (
                                                    <div className="absolute right-0 top-10 z-10 bg-gray-100 border border-gray-300 rounded-xl shadow-2xl w-48 py-1 text-left">
                                                        <Link
                                                            href={`/marketplace/accounts/${account.id}`}
                                                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                                                        >
                                                            Detail
                                                        </Link>
                                                        <Link
                                                            href={`/marketplace/accounts/${account.id}/edit`}
                                                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                                                        >
                                                            Edit
                                                        </Link>
                                                        {account.status === 'active' ? (
                                                            <button
                                                                onClick={() => handleDeactivate(account.id)}
                                                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-gray-200 transition-colors"
                                                            >
                                                                Nonaktifkan
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleActivate(account.id)}
                                                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-emerald-400 hover:bg-gray-200 transition-colors"
                                                            >
                                                                Aktifkan
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Pagination */}
                    {accounts.last_page > 1 && (
                        <div className="px-6 py-4 border-t border-gray-300 flex items-center justify-between">
                            <p className="text-gray-500 text-sm">
                                Total {accounts.total} akun
                            </p>
                            <div className="flex items-center gap-2">
                                {accounts.current_page > 1 && (
                                    <Link
                                        href={`/marketplace/accounts?page=${accounts.current_page - 1}`}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                                    >
                                        &laquo;
                                    </Link>
                                )}
                                <span className="text-gray-500 text-sm">
                                    {accounts.current_page} / {accounts.last_page}
                                </span>
                                {accounts.current_page < accounts.last_page && (
                                    <Link
                                        href={`/marketplace/accounts?page=${accounts.current_page + 1}`}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                                    >
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
