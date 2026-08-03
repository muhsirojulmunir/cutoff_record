import React from 'react';
import { Head, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Props {
    marketplaces: string[];
}

const MARKETPLACE_LABELS: Record<string, string> = {
    shopee: 'Shopee',
    tiktok_shop: 'TikTok Shop',
};

export default function MarketplaceAccountCreate({ marketplaces }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        marketplace: marketplaces[0] ?? 'shopee',
        account_name: '',
        shop_id: '',
        shop_name: '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/marketplace/accounts');
    };

    return (
        <AppLayout>
            <Head title="Tambah Akun Marketplace" />

            <div className="min-h-screen bg-white p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <a href="/marketplace/accounts"
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Tambah Akun Marketplace</h1>
                        <p className="text-gray-500 text-sm">Daftarkan akun Shopee atau TikTok Shop baru</p>
                    </div>
                </div>

                <div className="max-w-xl">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-6">
                        <form onSubmit={submit} className="space-y-5">
                            {/* Marketplace */}
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Platform Marketplace *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {marketplaces.map(mp => (
                                        <button
                                            key={mp}
                                            type="button"
                                            onClick={() => setData('marketplace', mp)}
                                            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all text-sm font-medium ${
                                                data.marketplace === mp
                                                    ? 'border-teal-500 bg-teal-500/20 text-teal-600'
                                                    : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-900'
                                            }`}
                                        >
                                            {MARKETPLACE_LABELS[mp] ?? mp}
                                        </button>
                                    ))}
                                </div>
                                {errors.marketplace && <p className="text-red-400 text-xs mt-1">{errors.marketplace}</p>}
                            </div>

                            {/* Account Name */}
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Nama Akun *</label>
                                <input
                                    type="text"
                                    value={data.account_name}
                                    onChange={e => setData('account_name', e.target.value)}
                                    placeholder="cth: Toko Utama Shopee"
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-500 transition-colors text-sm"
                                />
                                {errors.account_name && <p className="text-red-400 text-xs mt-1">{errors.account_name}</p>}
                            </div>

                            {/* Shop ID */}
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Shop ID (opsional)</label>
                                <input
                                    type="text"
                                    value={data.shop_id}
                                    onChange={e => setData('shop_id', e.target.value)}
                                    placeholder="ID Toko dari Marketplace"
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-500 transition-colors text-sm"
                                />
                                {errors.shop_id && <p className="text-red-400 text-xs mt-1">{errors.shop_id}</p>}
                            </div>

                            {/* Shop Name */}
                            <div>
                                <label className="block text-sm text-gray-500 mb-2">Nama Toko (opsional)</label>
                                <input
                                    type="text"
                                    value={data.shop_name}
                                    onChange={e => setData('shop_name', e.target.value)}
                                    placeholder="Nama resmi toko di marketplace"
                                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-500 transition-colors text-sm"
                                />
                                {errors.shop_name && <p className="text-red-400 text-xs mt-1">{errors.shop_name}</p>}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <a href="/marketplace/accounts"
                                    className="flex-1 text-center px-4 py-2.5 border border-gray-300 text-gray-500 hover:text-gray-900 rounded-xl transition-colors text-sm font-medium">
                                    Batal
                                </a>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-xl transition-colors text-sm font-medium shadow-lg shadow-teal-200/40"
                                >
                                    {processing ? 'Menyimpan...' : 'Simpan Akun'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
