import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../Layouts/AppLayout';
import WorkQueuePanel from '../Components/WorkQueuePanel';

interface SalesTrend { date: string; count: number; total: number; }
interface ChannelBreakdown { channel: string; count: number; total: number; }

interface Props {
    metrics: {
        range: string;
        date_from: string;
        date_to: string;
        sales: {
            total_orders: number; total_revenue: number;
            today_orders: number; today_revenue: number;
            month_orders: number; month_revenue: number;
            status_breakdown: Record<string, number>;
            channel_breakdown: ChannelBreakdown[];
        };
        sales_trend: SalesTrend[];
        purchase: {
            total_orders: number; total_amount: number;
            status_breakdown: Record<string, number>;
            top_suppliers: { supplier_name: string; order_count: number; total_amount: number }[];
        };
        inventory: {
            total_products: number; total_physical: number;
            total_reserved: number; available_stock: number;
            out_of_stock_count: number; low_stock_count: number;
        };
        financial: {
            total_receivables: number; overdue_receivables: number;
            unpaid_invoices_count: number; overdue_invoices_count: number;
            total_payables: number; total_cash_balance: number;
            petty_cash_approved: number; petty_cash_pending: number;
            estimated_revenue: number; estimated_cogs: number;
            operating_expenses: number; estimated_gross_profit: number;
        };
        marketplace: {
            total_orders: number; total_amount: number;
            shopee_orders: number; tiktok_orders: number;
            converted_count: number; ready_count: number; unconverted_count: number;
            shipped_count: number; completed_count: number; cancelled_count: number;
            insufficient_count: number; mapping_required_count: number;
            pipeline: Record<string, number>;
        };
    };
    filters: { range: string; date_from?: string; date_to?: string };
}

const fmt = (v: number) => 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });

const RANGE_LABELS: Record<string, string> = {
    today: 'Hari Ini',
    this_week: 'Minggu Ini',
    this_month: 'Bulan Ini',
    this_year: 'Tahun Ini',
    custom: 'Kustom Date',
};

export default function Dashboard({ metrics, filters }: Props) {
    const [selectedRange, setSelectedRange] = useState(filters.range ?? 'this_month');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]     = useState(filters.date_to ?? '');

    const applyFilter = (newRange: string) => {
        setSelectedRange(newRange);
        router.get('/dashboard', { range: newRange, date_from: dateFrom, date_to: dateTo }, { preserveState: true });
    };

    const maxTrendTotal = Math.max(...(metrics.sales_trend.map(t => t.total) ?? [1]), 1);

    return (
        <AppLayout>
            <Head title="Executive Dashboard ERP" />
            <div className="min-h-screen bg-white p-6 space-y-6">

                {/* Header & Date Range Filter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Executive Dashboard ERP</h1>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-teal-500/10 border-teal-500/20 text-teal-400">
                                Live Analytics
                            </span>
                        </div>
                        <p className="text-slate-450 text-xs mt-1">
                            Ringkasan performa operasional &amp; keuangan • <span className="text-gray-700 font-medium">{RANGE_LABELS[selectedRange] ?? selectedRange}</span>
                        </p>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap bg-white border border-gray-200 p-1.5 rounded-2xl shadow-inner">
                        {['today', 'this_week', 'this_month', 'this_year'].map(r => (
                            <button key={r} onClick={() => applyFilter(r)}
                                className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all duration-150 ${
                                    selectedRange === r
                                        ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-semibold shadow-md shadow-teal-500/20'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50/60'
                                }`}>
                                {RANGE_LABELS[r]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Pengingat kerja per-role */}
                <WorkQueuePanel />

                {/* KPI Overview Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Sales KPI */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-gray-300 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Penjualan ({RANGE_LABELS[selectedRange]})</span>
                            <span className="px-2 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-lg text-[11px] font-bold font-mono">
                                {metrics.sales.total_orders} SO
                            </span>
                        </div>
                        <p className="text-xl font-bold font-mono text-gray-900 tracking-tight">{fmt(metrics.sales.total_revenue)}</p>
                        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-[11px] text-slate-450">
                            <span>Hari ini: <strong className="text-gray-700 font-mono">{fmt(metrics.sales.today_revenue)}</strong></span>
                            <span>Bulan ini: <strong className="text-gray-700 font-mono">{fmt(metrics.sales.month_revenue)}</strong></span>
                        </div>
                    </div>

                    {/* Financial Receivable KPI */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-gray-300 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Piutang Customer</span>
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[11px] font-bold font-mono">
                                {metrics.financial.unpaid_invoices_count} Invoice
                            </span>
                        </div>
                        <p className="text-xl font-bold font-mono text-gray-900 tracking-tight">{fmt(metrics.financial.total_receivables)}</p>
                        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-[11px]">
                            <span className="text-rose-400 font-medium">Overdue: <strong className="font-mono">{fmt(metrics.financial.overdue_receivables)}</strong></span>
                            <span className="text-gray-400">{metrics.financial.overdue_invoices_count} Macet</span>
                        </div>
                    </div>

                    {/* Cash & Bank KPI */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-gray-300 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kas &amp; Bank Aktif</span>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] font-bold">Aktif</span>
                        </div>
                        <p className="text-xl font-bold font-mono text-emerald-400 tracking-tight">{fmt(metrics.financial.total_cash_balance)}</p>
                        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-[11px] text-slate-450">
                            <span>Payable Pabrik: <strong className="text-gray-700 font-mono">{fmt(metrics.financial.total_payables)}</strong></span>
                        </div>
                    </div>

                    {/* Inventory KPI */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-gray-300 transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Available Stock</span>
                            <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg text-[11px] font-bold font-mono">
                                {metrics.inventory.total_products} SKU
                            </span>
                        </div>
                        <p className="text-xl font-bold font-mono text-gray-900 tracking-tight">{metrics.inventory.available_stock} <span className="text-xs text-gray-400 font-normal">units</span></p>
                        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-[11px]">
                            <span className="text-gray-400">Reserved: {metrics.inventory.total_reserved}</span>
                            <span className="text-rose-400 font-semibold">Low: {metrics.inventory.low_stock_count} SKU</span>
                        </div>
                    </div>
                </div>

                {/* Sales Trend Chart & Channel Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Sales Trend Bar Visualizer */}
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Grafik Tren Penjualan Harian</h2>
                            <Link href="/reports/sales" className="text-xs font-medium text-teal-400 hover:text-teal-600 transition-colors">Laporan Penjualan Lengkap →</Link>
                        </div>
                        {metrics.sales_trend.length === 0 ? (
                            <p className="text-gray-400 text-xs text-center py-12">Belum ada transaksi penjualan pada periode ini.</p>
                        ) : (
                            <div className="h-44 flex items-end gap-1.5 pt-4">
                                {metrics.sales_trend.map((t, idx) => {
                                    const heightPct = Math.max(8, Math.round((t.total / maxTrendTotal) * 100));
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                                            {/* Tooltip */}
                                            <div className="absolute -top-10 hidden group-hover:flex flex-col items-center bg-gray-50 border border-gray-300 text-gray-900 text-[10px] px-2 py-1 rounded-lg z-20 whitespace-nowrap shadow-xl">
                                                <span>{t.date}</span>
                                                <span className="font-bold text-teal-600 font-mono">{fmt(t.total)} ({t.count} SO)</span>
                                            </div>
                                            <div style={{ height: `${heightPct}%` }}
                                                className="w-full bg-gradient-to-t from-teal-600 to-cyan-500 hover:from-teal-500 hover:to-cyan-400 rounded-t-md transition-all cursor-pointer shadow-sm" />
                                            <span className="text-[9px] text-gray-400 font-mono truncate w-full text-center">{t.date.substring(8, 10)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Sales Channel Breakdown */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Penjualan Berdasarkan Channel</h2>
                        <div className="space-y-3.5">
                            {metrics.sales.channel_breakdown.length === 0 ? (
                                <p className="text-gray-400 text-xs py-6 text-center">Belum ada data channel.</p>
                            ) : (
                                metrics.sales.channel_breakdown.map(c => (
                                    <div key={c.channel} className="space-y-1.5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-700 capitalize font-medium">{c.channel}</span>
                                            <span className="text-gray-900 font-mono text-[11px]">{fmt(c.total)} ({c.count} SO)</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                                            <div style={{ width: `${Math.min(100, Math.round((c.total / (metrics.sales.total_revenue || 1)) * 100))}%` }}
                                                className="h-full bg-gradient-to-r from-teal-600 to-cyan-500 rounded-full" />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Marketplace Fulfillment Pipeline & Financial Profitability */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Fulfillment Pipeline */}
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Pipeline Fulfillment Order Marketplace</h2>
                            <Link href="/reports/marketplace" className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors">Laporan Marketplace →</Link>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Total Order', val: metrics.marketplace.total_orders, color: 'border-gray-300 text-gray-900' },
                                { label: 'Shopee', val: metrics.marketplace.shopee_orders, color: 'border-orange-500/20 text-orange-400 bg-orange-500/5' },
                                { label: 'TikTok Shop', val: metrics.marketplace.tiktok_orders, color: 'border-pink-500/20 text-pink-400 bg-pink-500/5' },
                                { label: 'Ter-Konversi SO', val: metrics.marketplace.converted_count, color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' },
                                { label: 'Stok Di-Reserve', val: metrics.marketplace.pipeline.stock_reserved ?? 0, color: 'border-teal-500/20 text-teal-400 bg-teal-500/5' },
                                { label: 'Dikirim (Shipped)', val: metrics.marketplace.shipped_count, color: 'border-sky-500/20 text-sky-400 bg-sky-500/5' },
                                { label: 'Stok Insufficient', val: metrics.marketplace.insufficient_count, color: 'border-rose-500/20 text-rose-400 bg-rose-500/5' },
                                { label: 'Perlu Mapping SKU', val: metrics.marketplace.mapping_required_count, color: 'border-amber-500/20 text-amber-400 bg-amber-500/5' },
                            ].map(p => (
                                <div key={p.label} className={`p-3.5 bg-gray-50/60 border rounded-xl ${p.color}`}>
                                    <p className="text-gray-500 text-[11px] font-medium">{p.label}</p>
                                    <p className="text-lg font-bold font-mono mt-1">{p.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Estimated Gross Profit Card */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Estimasi Laba Kotor</h2>
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-300 rounded-full">Estimated</span>
                            </div>
                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Estimasi Omset Penjualan</span>
                                    <span className="text-gray-800 font-mono">{fmt(metrics.financial.estimated_revenue)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Pembelian HPP (COGS)</span>
                                    <span className="text-gray-800 font-mono">-{fmt(metrics.financial.estimated_cogs)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Operasional Petty Cash</span>
                                    <span className="text-gray-800 font-mono">-{fmt(metrics.financial.operating_expenses)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-gray-200 mt-4">
                            <p className="text-gray-400 text-[11px] font-medium">Estimated Gross Profit</p>
                            <p className={`text-xl font-bold mt-1 font-mono tracking-tight ${
                                metrics.financial.estimated_gross_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                                {fmt(metrics.financial.estimated_gross_profit)}
                            </p>
                            <Link href="/reports/financial" className="mt-3 block text-xs text-center text-teal-600 font-semibold hover:text-teal-700 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 hover:border-teal-300 rounded-xl transition-all">
                                Laporan Keuangan Lengkap →
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Quick Reports Navigation */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Pusat Laporan &amp; Analytics ERP</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { title: 'Laporan Penjualan', href: '/reports/sales', color: 'bg-teal-500/5 text-teal-400 border-teal-500/20 hover:border-teal-500/40' },
                            { title: 'Laporan Pembelian', href: '/reports/purchase', color: 'bg-cyan-500/5 text-cyan-400 border-cyan-500/20 hover:border-cyan-500/40' },
                            { title: 'Laporan Inventory', href: '/reports/inventory', color: 'bg-sky-500/5 text-sky-400 border-sky-500/20 hover:border-sky-500/40' },
                            { title: 'Laporan Keuangan', href: '/reports/financial', color: 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40' },
                            { title: 'Laporan Marketplace', href: '/reports/marketplace', color: 'bg-pink-500/5 text-pink-400 border-pink-500/20 hover:border-pink-500/40' },
                        ].map(r => (
                            <Link key={r.title} href={r.href}
                                className={`p-4 border rounded-xl transition-all duration-200 hover:scale-[1.02] flex flex-col justify-between ${r.color}`}>
                                <span className="text-xs font-semibold">{r.title}</span>
                                <span className="text-[10px] mt-3 opacity-75 font-mono">Buka Analytics →</span>
                            </Link>
                        ))}
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
