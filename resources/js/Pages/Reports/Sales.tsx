import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Channel { channel: string; count: number; total: number; }
interface Trend { date: string; count: number; total: number; }

interface Props {
    summary: {
        total_orders: number; total_revenue: number;
        today_orders: number; today_revenue: number;
        month_orders: number; month_revenue: number;
        status_breakdown: Record<string, number>;
        channel_breakdown: Channel[];
    };
    trend: Trend[];
    filters: { date_from?: string; date_to?: string };
}

const fmt = (v: number) => 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function SalesReport({ summary, trend, filters }: Props) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]     = useState(filters.date_to ?? '');

    const applyFilter = () => {
        router.get('/reports/sales', { date_from: dateFrom, date_to: dateTo }, { preserveState: true });
    };

    return (
        <AppLayout>
            <Head title="Laporan Penjualan ERP" />
            <div className="min-h-screen bg-white p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link href="/dashboard" className="text-gray-400 text-xs hover:text-gray-700">← Kembali ke Dashboard</Link>
                        <h1 className="text-2xl font-bold text-gray-900 mt-1">Laporan Penjualan / Sales Analytics</h1>
                        <p className="text-gray-500 text-sm">Analisis kinerja omset, channel, dan tren Sales Order</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <a href={`/reports/export/sales?date_from=${dateFrom}&date_to=${dateTo}`}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-900 rounded-xl text-xs font-medium transition-colors flex items-center gap-2">
                            Export CSV
                        </a>
                    </div>
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

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs font-medium">Total Omset Penjualan</p>
                        <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmt(summary.total_revenue)}</p>
                        <p className="text-gray-400 text-xs mt-2">{summary.total_orders} Total Sales Orders</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs font-medium">Penjualan Hari Ini</p>
                        <p className="text-2xl font-extrabold text-emerald-400 mt-1">{fmt(summary.today_revenue)}</p>
                        <p className="text-gray-400 text-xs mt-2">{summary.today_orders} SO Hari Ini</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs font-medium">Penjualan Bulan Ini</p>
                        <p className="text-2xl font-extrabold text-sky-400 mt-1">{fmt(summary.month_revenue)}</p>
                        <p className="text-gray-400 text-xs mt-2">{summary.month_orders} SO Bulan Ini</p>
                    </div>
                </div>

                {/* Breakdown by Channel & Status */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <h2 className="text-gray-900 font-semibold text-sm mb-4">Omset Per Channel Penjualan</h2>
                        <div className="space-y-3">
                            {summary.channel_breakdown.map(c => (
                                <div key={c.channel} className="flex justify-between items-center p-3 bg-white border border-gray-300 rounded-xl">
                                    <div>
                                        <p className="text-gray-900 text-sm font-medium capitalize">{c.channel}</p>
                                        <p className="text-gray-400 text-xs">{c.count} Pesanan</p>
                                    </div>
                                    <p className="text-teal-400 font-bold font-mono text-sm">{fmt(c.total)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <h2 className="text-gray-900 font-semibold text-sm mb-4">Status Sales Order</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(summary.status_breakdown).map(([st, cnt]) => (
                                <div key={st} className="p-3 bg-white border border-gray-300 rounded-xl">
                                    <p className="text-gray-500 text-xs capitalize">{st}</p>
                                    <p className="text-lg font-bold text-gray-900 mt-0.5">{cnt}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
