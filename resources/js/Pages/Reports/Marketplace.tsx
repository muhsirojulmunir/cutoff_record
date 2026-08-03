import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Platform { platform: string; count: number; total: number; }

interface Props {
    summary: {
        total_orders: number; total_amount: number;
        shopee_orders: number; tiktok_orders: number;
        converted_count: number; ready_count: number; unconverted_count: number;
        shipped_count: number; completed_count: number; cancelled_count: number;
        insufficient_count: number; mapping_required_count: number;
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
                        <h1 className="text-2xl font-bold text-gray-900 mt-1">Laporan Integration &amp; Fulfillment Marketplace</h1>
                        <p className="text-gray-500 text-sm">Analisis integrasi Shopee &amp; TikTok Shop API, konversi SO, dan pipeline fulfillment</p>
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
                        className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-xs font-medium transition-colors shadow-lg shadow-teal-200/40">
                        Terapkan Filter
                    </button>
                </div>

                {/* Platform Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Total Omset Marketplace</p>
                        <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmt(summary.total_amount)}</p>
                        <p className="text-gray-400 text-xs mt-2">{summary.total_orders} Total Order Staged</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Order Shopee</p>
                        <p className="text-2xl font-extrabold text-orange-400 mt-1">{summary.shopee_orders}</p>
                        <p className="text-gray-400 text-xs mt-2">Shopee Open API v2</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Order TikTok Shop</p>
                        <p className="text-2xl font-extrabold text-pink-400 mt-1">{summary.tiktok_orders}</p>
                        <p className="text-gray-400 text-xs mt-2">TikTok Partner API v2</p>
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
                        <p className="text-2xl font-extrabold text-rose-400 mt-1">{summary.mapping_required_count + summary.insufficient_count}</p>
                        <p className="text-gray-400 text-xs mt-1">{summary.mapping_required_count} SKU Unmapped, {summary.insufficient_count} Stok Insufficient</p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
