import React from 'react';
import { Head, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Mapping {
    id: number;
    external_sku: string;
    external_product_id: string | null;
    external_product_name: string | null;
    status: string;
    product: { id: number; name: string; sku: string } | null;
    account: { id: number; account_name: string; marketplace: string };
}

interface Product { id: number; sku: string; name: string }

interface Props {
    mapping: Mapping;
    products: Product[];
}

export default function MarketplaceProductMappingEdit({ mapping, products }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        product_id: mapping.product?.id?.toString() ?? '',
        external_product_id: mapping.external_product_id ?? '',
        external_product_name: mapping.external_product_name ?? '',
        status: mapping.status,
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put(`/marketplace/mappings/${mapping.id}`);
    };

    return (
        <AppLayout>
            <Head title="Edit Mapping Produk" />
            <div className="min-h-screen bg-slate-950 p-6">
                <div className="flex items-center gap-4 mb-8">
                    <a href="/marketplace/mappings"
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Edit Mapping Produk</h1>
                        <p className="text-slate-400 text-sm font-mono">{mapping.external_sku}</p>
                    </div>
                </div>

                <div className="max-w-xl">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        {/* Read-only info */}
                        <div className="mb-5 p-3 bg-slate-800 rounded-xl text-sm">
                            <p className="text-slate-400">Akun: <span className="text-white">{mapping.account.account_name}</span></p>
                            <p className="text-slate-400">SKU Marketplace: <span className="text-white font-mono">{mapping.external_sku}</span></p>
                        </div>

                        <form onSubmit={submit} className="space-y-5">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Produk Internal *</label>
                                <select value={data.product_id}
                                    onChange={e => setData('product_id', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 text-sm">
                                    <option value="">-- Pilih Produk --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                                </select>
                                {errors.product_id && <p className="text-red-400 text-xs mt-1">{errors.product_id}</p>}
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Nama Produk di Marketplace</label>
                                <input type="text" value={data.external_product_name}
                                    onChange={e => setData('external_product_name', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Status</label>
                                <select value={data.status}
                                    onChange={e => setData('status', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 text-sm">
                                    <option value="active">Aktif</option>
                                    <option value="inactive">Nonaktif</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <a href="/marketplace/mappings"
                                    className="flex-1 text-center px-4 py-2.5 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors text-sm font-medium">
                                    Batal
                                </a>
                                <button type="submit" disabled={processing}
                                    className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl transition-colors text-sm font-medium">
                                    {processing ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
