import React from 'react';
import { Head, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Account {
    id: number;
    marketplace: string;
    account_name: string;
    shop_id: string | null;
    shop_name: string | null;
}

interface Props {
    account: Account;
    marketplaces: string[];
}

const MARKETPLACE_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok_shop: 'TikTok Shop' };

export default function MarketplaceAccountEdit({ account, marketplaces }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        account_name: account.account_name,
        shop_id: account.shop_id ?? '',
        shop_name: account.shop_name ?? '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put(`/marketplace/accounts/${account.id}`);
    };

    return (
        <AppLayout>
            <Head title="Edit Akun Marketplace" />
            <div className="min-h-screen bg-slate-950 p-6">
                <div className="flex items-center gap-4 mb-8">
                    <a href={`/marketplace/accounts/${account.id}`}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Edit Akun Marketplace</h1>
                        <p className="text-slate-400 text-sm">{account.account_name}</p>
                    </div>
                </div>

                <div className="max-w-xl">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        {/* Platform read-only */}
                        <div className="mb-5 p-3 bg-slate-800 rounded-xl flex items-center gap-2">
                            <span className="text-slate-300 text-sm font-medium">
                                {MARKETPLACE_LABELS[account.marketplace] ?? account.marketplace}
                            </span>
                            <span className="text-slate-500 text-xs ml-1">(tidak dapat diubah)</span>
                        </div>

                        <form onSubmit={submit} className="space-y-5">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Nama Akun *</label>
                                <input type="text" value={data.account_name}
                                    onChange={e => setData('account_name', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm" />
                                {errors.account_name && <p className="text-red-400 text-xs mt-1">{errors.account_name}</p>}
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Shop ID</label>
                                <input type="text" value={data.shop_id}
                                    onChange={e => setData('shop_id', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Nama Toko</label>
                                <input type="text" value={data.shop_name}
                                    onChange={e => setData('shop_name', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm" />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <a href={`/marketplace/accounts/${account.id}`}
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
