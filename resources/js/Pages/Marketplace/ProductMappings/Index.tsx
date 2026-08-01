import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Mapping {
    id: number;
    marketplace: string;
    external_sku: string;
    external_product_name: string | null;
    status: string;
    account: { id: number; account_name: string };
    product: { id: number; name: string; sku: string } | null;
    creator: { name: string } | null;
    created_at: string;
}

interface Props {
    mappings: { data: Mapping[]; current_page: number; last_page: number; total: number };
    accounts: { id: number; account_name: string; marketplace: string }[];
    filters: Record<string, string>;
}

const MP_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok_shop: 'TikTok Shop' };

export default function MarketplaceProductMappingsIndex({ mappings, accounts, filters }: Props) {
    const [localFilters, setLocalFilters] = useState({ ...filters });
    const { props } = usePage<{ flash?: { success?: string; error?: string } }>();
    const flash = props.flash ?? {};

    const applyFilters = () => {
        router.get('/marketplace/mappings', localFilters as Record<string, string>, { preserveState: true });
    };

    const handleDelete = (id: number) => {
        if (confirm('Hapus mapping ini?')) {
            router.delete(`/marketplace/mappings/${id}`);
        }
    };

    return (
        <AppLayout>
            <Head title="Mapping Produk Marketplace" />
            <div className="min-h-screen bg-slate-950 p-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-600/20 rounded-lg text-violet-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Mapping Produk</h1>
                            <p className="text-slate-400 text-sm">Petakan SKU marketplace ke produk internal</p>
                        </div>
                    </div>
                    <Link href="/marketplace/mappings/create"
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors text-sm font-medium">
                        + Tambah Mapping
                    </Link>
                </div>

                {flash.success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{flash.success}</div>}
                {flash.error   && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{flash.error}</div>}

                {/* Filters */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="relative">
                            <input type="text" placeholder="Cari SKU / nama..."
                                value={localFilters.search ?? ''}
                                onChange={e => setLocalFilters(f => ({ ...f, search: e.target.value }))}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500" />
                        </div>
                        <select value={localFilters.account_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, account_id: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Akun</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                        </select>
                        <select value={localFilters.status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, status: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Status</option>
                            <option value="active">Aktif</option>
                            <option value="inactive">Nonaktif</option>
                        </select>
                        <button onClick={applyFilters}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors text-sm">
                            Filter
                        </button>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    {mappings.data.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-slate-400">Belum ada mapping produk.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    {['SKU Marketplace', 'Nama Produk Ext.', 'Produk Internal', 'Akun', 'Status', 'Aksi'].map(h => (
                                        <th key={h} className="text-left px-5 py-4 text-slate-400 text-sm font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {mappings.data.map(m => (
                                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-5 py-3 text-white font-mono text-sm">{m.external_sku}</td>
                                        <td className="px-5 py-3 text-slate-300 text-sm">{m.external_product_name ?? '-'}</td>
                                        <td className="px-5 py-3">
                                            {m.product ? (
                                                <div>
                                                    <p className="text-white text-sm">{m.product.name}</p>
                                                    <p className="text-slate-400 text-xs font-mono">{m.product.sku}</p>
                                                </div>
                                            ) : (
                                                <span className="text-red-400 text-xs">Produk tidak ditemukan</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <p className="text-slate-300 text-sm">{m.account.account_name}</p>
                                            <p className="text-slate-500 text-xs">{MP_LABELS[m.marketplace] ?? m.marketplace}</p>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                                {m.status === 'active' ? 'Aktif' : 'Nonaktif'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/marketplace/mappings/${m.id}/edit`}
                                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-xs">
                                                    Edit
                                                </Link>
                                                <button onClick={() => handleDelete(m.id)}
                                                    className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-400 text-xs">
                                                    Hapus
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {mappings.last_page > 1 && (
                        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
                            <p className="text-slate-400 text-sm">Total {mappings.total} mapping</p>
                            <div className="flex items-center gap-2">
                                {mappings.current_page > 1 && (
                                    <Link href={`/marketplace/mappings?page=${mappings.current_page - 1}`}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                                        &laquo;
                                    </Link>
                                )}
                                <span className="text-slate-400 text-sm">{mappings.current_page} / {mappings.last_page}</span>
                                {mappings.current_page < mappings.last_page && (
                                    <Link href={`/marketplace/mappings?page=${mappings.current_page + 1}`}
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
