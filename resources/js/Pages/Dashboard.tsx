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
            <div className="min-h-screen bg-slate-950 p-6 space-y-6">

                {/* Header & Date Range Filter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Executive Dashboard ERP</h1>
                        <p className="text-slate-400 text-sm mt-0.5">
                            Ringkasan performa operasional &amp; keuangan ({RANGE_LABELS[selectedRange] ?? selectedRange})
                        </p>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex items-center gap-2 flex-wrap bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
                        {['today', 'this_week', 'this_month', 'this_year'].map(r => (
                            <button key={r} onClick={() => applyFilter(r)}
                                className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-colors ${
                                    selectedRange === r
                                        ? 'bg-violet-600 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-slate-400 text-xs font-medium">Penjualan ({RANGE_LABELS[selectedRange]})</span>
                            <span className="p-2 bg-violet-500/10 text-violet-400 rounded-xl text-xs font-bold font-mono">
                                {metrics.sales.total_orders} SO
                            </span>
                        </div>
                        <p className="text-xl font-extrabold text-white">{fmt(metrics.sales.total_revenue)}</p>
                        <div className="mt-3 pt-3 border-t border-slate-800/80 flex justify-between text-xs text-slate-500">
                            <span>Hari ini: {fmt(metrics.sales.today_revenue)}</span>
                            <span>Bulan ini: {fmt(metrics.sales.month_revenue)}</span>
                        </div>
                    </div>

                    {/* Financial Receivable KPI */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-slate-400 text-xs font-medium">Piutang Customer</span>
                            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl text-xs font-bold font-mono">
                                {metrics.financial.unpaid_invoices_count} Invoice
                            </span>
                        </div>
                        <p className="text-xl font-extrabold text-white">{fmt(metrics.financial.total_receivables)}</p>
                        <div className="mt-3 pt-3 border-t border-slate-800/80 flex justify-between text-xs">
                            <span className="text-rose-400">Overdue: {fmt(metrics.financial.overdue_receivables)}</span>
                            <span className="text-slate-500">{metrics.financial.overdue_invoices_count} Macet</span>
                        </div>
                    </div>

                    {/* Cash & Bank KPI */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-slate-400 text-xs font-medium">Kas &amp; Bank Aktif</span>
                            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-bold">Aktif</span>
                        </div>
                        <p className="text-xl font-extrabold text-emerald-400">{fmt(metrics.financial.total_cash_balance)}</p>
                        <div className="mt-3 pt-3 border-t border-slate-800/80 flex justify-between text-xs text-slate-500">
                            <span>Payable Pabrik: {fmt(metrics.financial.total_payables)}</span>
                        </div>
                    </div>

                    {/* Inventory KPI */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-slate-400 text-xs font-medium">Available Stock</span>
                            <span className="p-2 bg-sky-500/10 text-sky-400 rounded-xl text-xs font-bold font-mono">
                                {metrics.inventory.total_products} SKU
                            </span>
                        </div>
                        <p className="text-xl font-extrabold text-white">{metrics.inventory.available_stock} <span className="text-xs text-slate-500 font-normal">units</span></p>
                        <div className="mt-3 pt-3 border-t border-slate-800/80 flex justify-between text-xs">
                            <span className="text-slate-500">Reserved: {metrics.inventory.total_reserved}</span>
                            <span className="text-rose-400 font-medium">Low: {metrics.inventory.low_stock_count} SKU</span>
                        </div>
                    </div>
                </div>

                {/* Sales Trend Chart & Channel Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Sales Trend Bar Visualizer */}
                    <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-white font-semibold text-sm">Grafik Tren Penjualan Harian</h2>
                            <Link href="/reports/sales" className="text-xs text-violet-400 hover:text-violet-300">Laporan Penjualan Lengkap →</Link>
                        </div>
                        {metrics.sales_trend.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-12">Belum ada transaksi penjualan pada periode ini.</p>
                        ) : (
                            <div className="h-44 flex items-end gap-1.5 pt-4">
                                {metrics.sales_trend.map((t, idx) => {
                                    const heightPct = Math.max(8, Math.round((t.total / maxTrendTotal) * 100));
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                                            {/* Tooltip */}
                                            <div className="absolute -top-10 hidden group-hover:flex flex-col items-center bg-slate-800 border border-slate-700 text-white text-[10px] px-2 py-1 rounded-lg z-20 whitespace-nowrap shadow-xl">
                                                <span>{t.date}</span>
                                                <span className="font-bold text-violet-300">{fmt(t.total)} ({t.count} SO)</span>
                                            </div>
                                            <div style={{ height: `${heightPct}%` }}
                                                className="w-full bg-gradient-to-t from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 rounded-t transition-all cursor-pointer" />
                                            <span className="text-[9px] text-slate-500 truncate w-full text-center">{t.date.substring(8, 10)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Sales Channel Breakdown */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <h2 className="text-white font-semibold text-sm mb-4">Penjualan Berdasarkan Channel</h2>
                        <div className="space-y-3">
                            {metrics.sales.channel_breakdown.length === 0 ? (
                                <p className="text-slate-500 text-xs py-6 text-center">Belum ada data channel.</p>
                            ) : (
                                metrics.sales.channel_breakdown.map(c => (
                                    <div key={c.channel} className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-300 capitalize font-medium">{c.channel}</span>
                                            <span className="text-white font-mono">{fmt(c.total)} ({c.count} SO)</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div style={{ width: `${Math.min(100, Math.round((c.total / (metrics.sales.total_revenue || 1)) * 100))}%` }}
                                                className="h-full bg-violet-500 rounded-full" />
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
                    <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-white font-semibold text-sm">Pipeline Fulfillment Order Marketplace</h2>
                            <Link href="/reports/marketplace" className="text-xs text-sky-400 hover:text-sky-300">Laporan Marketplace →</Link>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Total Order', val: metrics.marketplace.total_orders, color: 'border-slate-700 text-white' },
                                { label: 'Shopee', val: metrics.marketplace.shopee_orders, color: 'border-orange-500/30 text-orange-400' },
                                { label: 'TikTok Shop', val: metrics.marketplace.tiktok_orders, color: 'border-pink-500/30 text-pink-400' },
                                { label: 'Ter-Konversi SO', val: metrics.marketplace.converted_count, color: 'border-emerald-500/30 text-emerald-400' },
                                { label: 'Stok Di-Reserve', val: metrics.marketplace.pipeline.stock_reserved ?? 0, color: 'border-violet-500/30 text-violet-400' },
                                { label: 'Dikirim (Shipped)', val: metrics.marketplace.shipped_count, color: 'border-sky-500/30 text-sky-400' },
                                { label: 'Stok Insufficient', val: metrics.marketplace.insufficient_count, color: 'border-rose-500/30 text-rose-400' },
                                { label: 'Perlu Mapping SKU', val: metrics.marketplace.mapping_required_count, color: 'border-amber-500/30 text-amber-400' },
                            ].map(p => (
                                <div key={p.label} className={`p-3 bg-slate-950 border rounded-xl ${p.color}`}>
                                    <p className="text-slate-400 text-xs">{p.label}</p>
                                    <p className="text-lg font-bold font-mono mt-1">{p.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Estimated Gross Profit Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-white font-semibold text-sm">Estimasi Laba Kotor</h2>
                                <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">Estimated</span>
                            </div>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Estimasi Omset Penjualan</span>
                                    <span className="text-slate-200 font-mono">{fmt(metrics.financial.estimated_revenue)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Pembelian HPP (COGS)</span>
                                    <span className="text-slate-200 font-mono">-{fmt(metrics.financial.estimated_cogs)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Operasional Petty Cash</span>
                                    <span className="text-slate-200 font-mono">-{fmt(metrics.financial.operating_expenses)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-800 mt-4">
                            <p className="text-slate-400 text-xs">Estimated Gross Profit</p>
                            <p className={`text-xl font-extrabold mt-1 font-mono ${
                                metrics.financial.estimated_gross_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                                {fmt(metrics.financial.estimated_gross_profit)}
                            </p>
                            <Link href="/reports/financial" className="mt-2 block text-xs text-center text-slate-400 hover:text-white py-1 bg-slate-800 rounded-xl transition-colors">
                                Laporan Keuangan Lengkap
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Quick Reports Navigation */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h2 className="text-white font-semibold text-sm mb-4">Pusat Laporan &amp; Analytics ERP</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { title: 'Laporan Penjualan', href: '/reports/sales', color: 'bg-violet-600/10 text-violet-400 border-violet-500/20' },
                            { title: 'Laporan Pembelian', href: '/reports/purchase', color: 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20' },
                            { title: 'Laporan Inventory', href: '/reports/inventory', color: 'bg-sky-600/10 text-sky-400 border-sky-500/20' },
                            { title: 'Laporan Keuangan', href: '/reports/financial', color: 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20' },
                            { title: 'Laporan Marketplace', href: '/reports/marketplace', color: 'bg-pink-600/10 text-pink-400 border-pink-500/20' },
                        ].map(r => (
                            <Link key={r.title} href={r.href}
                                className={`p-4 border rounded-2xl transition-all hover:scale-[1.02] flex flex-col justify-between ${r.color}`}>
                                <span className="text-xs font-semibold">{r.title}</span>
                                <span className="text-[10px] mt-3 opacity-75">Buka Analytics →</span>
                            </Link>
                        ))}
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
