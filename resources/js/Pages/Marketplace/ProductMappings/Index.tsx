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
            <div className="min-h-screen bg-white p-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-600/20 rounded-lg text-teal-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Mapping Produk</h1>
                            <p className="text-gray-500 text-sm">Petakan SKU marketplace ke produk internal</p>
                        </div>
                    </div>
                    <Link href="/marketplace/mappings/create"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-teal-200/40">
                        + Tambah Mapping
                    </Link>
                </div>

                {flash.success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{flash.success}</div>}
                {flash.error   && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{flash.error}</div>}

                {/* Filters */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4 mb-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="relative">
                            <input type="text" placeholder="Cari SKU / nama..."
                                value={localFilters.search ?? ''}
                                onChange={e => setLocalFilters(f => ({ ...f, search: e.target.value }))}
                                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-teal-500" />
                        </div>
                        <select value={localFilters.account_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, account_id: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Akun</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                        </select>
                        <select value={localFilters.status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, status: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Status</option>
                            <option value="active">Aktif</option>
                            <option value="inactive">Nonaktif</option>
                        </select>
                        <button onClick={applyFilters}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl transition-colors text-sm shadow-lg shadow-teal-200/40">
                            Filter
                        </button>
                    </div>
                </div>

                <div className="bg-gray-50 border border-gray-300 rounded-2xl overflow-hidden">
                    {mappings.data.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-gray-500">Belum ada mapping produk.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-300">
                                    {['SKU Marketplace', 'Nama Produk Ext.', 'Produk Internal', 'Akun', 'Status', 'Aksi'].map(h => (
                                        <th key={h} className="text-left px-5 py-4 text-gray-500 text-sm font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/50">
                                {mappings.data.map(m => (
                                    <tr key={m.id} className="hover:bg-gray-100/30 transition-colors">
                                        <td className="px-5 py-3 text-gray-900 font-mono text-sm">{m.external_sku}</td>
                                        <td className="px-5 py-3 text-gray-700 text-sm">{m.external_product_name ?? '-'}</td>
                                        <td className="px-5 py-3">
                                            {m.product ? (
                                                <div>
                                                    <p className="text-gray-900 text-sm">{m.product.name}</p>
                                                    <p className="text-gray-500 text-xs font-mono">{m.product.sku}</p>
                                                </div>
                                            ) : (
                                                <span className="text-red-400 text-xs">Produk tidak ditemukan</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <p className="text-gray-700 text-sm">{m.account.account_name}</p>
                                            <p className="text-gray-400 text-xs">{MP_LABELS[m.marketplace] ?? m.marketplace}</p>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-200 text-gray-500'}`}>
                                                {m.status === 'active' ? 'Aktif' : 'Nonaktif'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/marketplace/mappings/${m.id}/edit`}
                                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 text-xs">
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
                        <div className="px-5 py-4 border-t border-gray-300 flex items-center justify-between">
                            <p className="text-gray-500 text-sm">Total {mappings.total} mapping</p>
                            <div className="flex items-center gap-2">
                                {mappings.current_page > 1 && (
                                    <Link href={`/marketplace/mappings?page=${mappings.current_page - 1}`}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
                                        &laquo;
                                    </Link>
                                )}
                                <span className="text-gray-500 text-sm">{mappings.current_page} / {mappings.last_page}</span>
                                {mappings.current_page < mappings.last_page && (
                                    <Link href={`/marketplace/mappings?page=${mappings.current_page + 1}`}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
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
