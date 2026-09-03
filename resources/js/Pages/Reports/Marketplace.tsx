import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Platform { platform: string; count: number; total: number; }

interface Props {
    summary: {
        total_orders: number; total_amount: number;
        total_revenue: number; total_cogs: number;
        total_admin_fee: number; total_discount: number;
        total_net_profit: number;
        shopee_orders: number; shopee_revenue: number; shopee_net_profit: number;
        tiktok_orders: number; tiktok_revenue: number; tiktok_net_profit: number;
        converted_count: number; ready_count: number; unconverted_count: number;
        shipped_count: number; completed_count: number; cancelled_count: number;
        insufficient_count?: number; mapping_required_count?: number;
        pipeline: Record<string, number>;
        platform_breakdown: Platform[];
    };
    filters: { date_from?: string; date_to?: string };
}

const fmt = (v: number) => 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });

const WORKFLOW_LABELS: Record<string, string> = {
    pending:            'Pending Staging',
    ready_to_process:   'Siap Diproses',
    converted_to_so:    'Dikonversi ke SO',
    stock_reserved:     'Stok Di-Reserve',
    processing:         'Dalam Proses',
    shipped:            'Dikirim (Shipped)',
    completed:          'Selesai (Completed)',
    cancelled:          'Dibatalkan',
    stock_insufficient: 'Stok Tidak Cukup',
    mapping_required:   'Perlu Mapping SKU',
};

export default function MarketplaceReport({ summary, filters }: Props) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]     = useState(filters.date_to ?? '');

    const applyFilter = () => {
        router.get('/reports/marketplace', { date_from: dateFrom, date_to: dateTo }, { preserveState: true });
    };

    return (
        <AppLayout>
            <Head title="Laporan Marketplace & Analytics ERP" />
            <div className="min-h-screen bg-white p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link href="/dashboard" className="text-gray-400 text-xs hover:text-gray-700">← Kembali ke Dashboard</Link>
                        <h1 className="text-2xl font-bold text-gray-900 mt-1">Laporan Marketplace &amp; Laba Bersih</h1>
                        <p className="text-gray-500 text-sm">Analisis penjualan, HPP modal, biaya admin, dan laba bersih Shopee &amp; TikTok Shop</p>
                    </div>

                    <a href={`/reports/export/marketplace?date_from=${dateFrom}&date_to=${dateTo}`}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-900 rounded-xl text-xs font-medium transition-colors flex items-center gap-2">
                        Export CSV
                    </a>
                </div>

                {/* Filter Date Range */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-xs focus:outline-none focus:border-teal-500" />
                        <span className="text-gray-400 text-xs">s/d</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-xs focus:outline-none focus:border-teal-500" />
                    </div>
                    <button onClick={applyFilter}
                        className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-xs font-medium transition-colors shadow-lg shadow-teal-200/40 cursor-pointer">
                        Terapkan Filter
                    </button>
                </div>

                {/* Ringkasan Laba Bersih Marketplace */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl p-5 shadow-lg shadow-teal-200/40">
                        <p className="text-white/80 text-xs font-bold uppercase tracking-wider">Laba Bersih Marketplace</p>
                        <p className="text-2xl font-extrabold mt-1">{fmt(summary.total_net_profit || 0)}</p>
                        <p className="text-white/70 text-xs mt-2">{summary.total_orders} Total Pesanan</p>
                    </div>

                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Omset Penjualan</p>
                        <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmt(summary.total_revenue || summary.total_amount || 0)}</p>
                        <p className="text-gray-400 text-xs mt-2">HPP Modal: {fmt(summary.total_cogs || 0)}</p>
                    </div>

                    <div className="bg-gray-50 border border-orange-200 rounded-2xl p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-orange-600 text-xs font-bold uppercase tracking-wider">Shopee</p>
                            <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{summary.shopee_orders} Order</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900 mt-1">{fmt(summary.shopee_revenue || 0)}</p>
                        <p className="text-emerald-600 font-bold text-xs mt-2">Laba Bersih: {fmt(summary.shopee_net_profit || 0)}</p>
                    </div>

                    <div className="bg-gray-50 border border-neutral-300 rounded-2xl p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-neutral-900 text-xs font-bold uppercase tracking-wider">TikTok Shop</p>
                            <span className="text-xs font-bold bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded-full">{summary.tiktok_orders} Order</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900 mt-1">{fmt(summary.tiktok_revenue || 0)}</p>
                        <p className="text-emerald-600 font-bold text-xs mt-2">Laba Bersih: {fmt(summary.tiktok_net_profit || 0)}</p>
                    </div>
                </div>

                {/* Rincian Komponen Laba Bersih */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                    <h2 className="text-gray-900 font-bold text-sm mb-3">Rincian Komponen Perhitungan Laba Bersih Marketplace</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3.5 bg-white border border-gray-200 rounded-xl">
                            <span className="text-gray-500 block">Total Omset Produk</span>
                            <span className="text-base font-bold text-gray-900 font-mono mt-1 block">{fmt(summary.total_revenue || 0)}</span>
                        </div>
                        <div className="p-3.5 bg-white border border-gray-200 rounded-xl">
                            <span className="text-gray-500 block">Total HPP / Modal Barang</span>
                            <span className="text-base font-bold text-rose-500 font-mono mt-1 block">-{fmt(summary.total_cogs || 0)}</span>
                        </div>
                        <div className="p-3.5 bg-white border border-gray-200 rounded-xl">
                            <span className="text-gray-500 block">Biaya Admin Platform &amp; Layanan</span>
                            <span className="text-base font-bold text-orange-600 font-mono mt-1 block">-{fmt(summary.total_admin_fee || 0)}</span>
                        </div>
                        <div className="p-3.5 bg-white border border-emerald-300 bg-emerald-50/40 rounded-xl">
                            <span className="text-emerald-700 font-semibold block">Laba Bersih Marketplace</span>
                            <span className="text-base font-extrabold text-emerald-600 font-mono mt-1 block">{fmt(summary.total_net_profit || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Fulfillment Pipeline Breakdown */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                    <h2 className="text-gray-900 font-semibold text-sm mb-4">Pipeline Workflow Fulfillment Marketplace</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {Object.entries(summary.pipeline).map(([wf, cnt]) => (
                            <div key={wf} className="p-3 bg-white border border-gray-300 rounded-xl">
                                <p className="text-gray-500 text-xs">{WORKFLOW_LABELS[wf] ?? wf}</p>
                                <p className="text-xl font-bold font-mono text-gray-900 mt-1">{cnt}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sales Order Conversion State */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Sudah Dikonversi ke SO</p>
                        <p className="text-2xl font-extrabold text-emerald-400 mt-1">{summary.converted_count}</p>
                        <p className="text-gray-400 text-xs mt-1">Terhubung dengan Sales Order ERP</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Siap Konversi (SKU Mapped)</p>
                        <p className="text-2xl font-extrabold text-sky-400 mt-1">{summary.ready_count}</p>
                        <p className="text-gray-400 text-xs mt-1">Siap diproses menjadi SO</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Perlu Perhatian (Unmapped/Insufficient)</p>
                        <p className="text-2xl font-extrabold text-rose-400 mt-1">{(summary.mapping_required_count ?? 0) + (summary.insufficient_count ?? 0)}</p>
                        <p className="text-gray-400 text-xs mt-1">{summary.mapping_required_count ?? 0} SKU Unmapped, {summary.insufficient_count ?? 0} Stok Insufficient</p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
