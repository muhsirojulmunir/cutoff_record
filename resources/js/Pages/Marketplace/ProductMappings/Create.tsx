import React from 'react';
import { Head, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Account { id: number; account_name: string; marketplace: string }
interface Product { id: number; sku: string; name: string }

interface Props {
    accounts: Account[];
    products: Product[];
    preselectedAccountId?: string;
}

export default function MarketplaceProductMappingCreate({ accounts, products, preselectedAccountId }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        marketplace_account_id: preselectedAccountId ?? (accounts[0]?.id?.toString() ?? ''),
        external_sku: '',
        external_product_id: '',
        external_product_name: '',
        product_id: '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/marketplace/mappings');
    };

    return (
        <AppLayout>
            <Head title="Tambah Mapping Produk" />
            <div className="min-h-screen bg-white p-6">
                <div className="flex items-center gap-4 mb-8">
                    <a href="/marketplace/mappings"
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Tambah Mapping Produk</h1>
                        <p className="text-gray-500 text-sm">Petakan SKU marketplace ke produk internal</p>
                    </div>
                </div>

                <div className="max-w-xl">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-6">
                        <form onSubmit={submit} className="space-y-5">
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Akun Marketplace *</label>
                                <select value={data.marketplace_account_id}
                                    onChange={e => setData('marketplace_account_id', e.target.value)}
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-teal-500 text-sm">
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} ({a.marketplace})</option>)}
                                </select>
                                {errors.marketplace_account_id && <p className="text-red-400 text-xs mt-1">{errors.marketplace_account_id}</p>}
                            </div>
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">SKU Marketplace *</label>
                                <input type="text" value={data.external_sku}
                                    onChange={e => setData('external_sku', e.target.value)}
                                    placeholder="SKU dari Shopee / TikTok"
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-500 text-sm" />
                                {errors.external_sku && <p className="text-red-400 text-xs mt-1">{errors.external_sku}</p>}
                            </div>
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Nama Produk di Marketplace (opsional)</label>
                                <input type="text" value={data.external_product_name}
                                    onChange={e => setData('external_product_name', e.target.value)}
                                    placeholder="Nama yang tampil di marketplace"
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-500 text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Produk Internal *</label>
                                <select value={data.product_id}
                                    onChange={e => setData('product_id', e.target.value)}
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-teal-500 text-sm">
                                    <option value="">-- Pilih Produk --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                                </select>
                                {errors.product_id && <p className="text-red-400 text-xs mt-1">{errors.product_id}</p>}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <a href="/marketplace/mappings"
                                    className="flex-1 text-center px-4 py-2.5 border border-gray-300 text-gray-500 hover:text-gray-900 rounded-xl transition-colors text-sm font-medium">
                                    Batal
                                </a>
                                <button type="submit" disabled={processing}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-xl transition-colors text-sm font-medium shadow-lg shadow-teal-200/40">
                                    {processing ? 'Menyimpan...' : 'Simpan Mapping'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
