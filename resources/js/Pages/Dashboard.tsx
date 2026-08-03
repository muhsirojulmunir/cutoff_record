import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '../Layouts/AppLayout';
import CountUp from '../Components/CountUp';
import LineChart from '../Components/LineChart';

interface SalesTrend { date: string; count: number; total: number; }
interface ChannelBreakdown { channel: string; count: number; total: number; }
interface TopProduct {
    product_id: number;
    name: string;
    sku: string | null;
    qty: number;
    revenue: number;
    profit: number;
}

interface Props {
    metrics: {
        range: string;
        date_from: string;
        date_to: string;
        channel: string | null;
        channels: string[];
        generated_at: string;
        sales: {
            total_orders: number; total_revenue: number;
            today_orders: number; today_revenue: number;
            month_orders: number; month_revenue: number;
            status_breakdown: Record<string, number>;
            channel_breakdown: ChannelBreakdown[];
        };
        sales_trend: SalesTrend[];
        channel_trend: {
            dates: string[];
            series: { channel: string; total: number; points: number[] }[];
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
            total_orders: number; shopee_orders: number; tiktok_orders: number;
            shipped_count: number; completed_count: number;
            insufficient_count: number; mapping_required_count: number;
            pipeline: Record<string, number>;
        };
        today: {
            date: string;
            revenue: number;
            net_profit: number;
            orders: number;
            shipped: number;
            growth: {
                revenue: number | null;
                net_profit: number | null;
                orders: number | null;
                shipped: number | null;
            };
            yesterday: { revenue: number; net_profit: number; orders: number; shipped: number };
        };
        profit_funnel: {
            revenue: number; cogs: number; gross_profit: number;
            discount: number; shipping: number; expenses: number;
            net_profit: number; margin: number;
        };
        top_products: TopProduct[];
    };
    filters: { range: string; date_from?: string; date_to?: string; channel?: string | null };
}

const fmt = (v: number) => 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });

const fmtCompact = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
    if (abs >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1).replace('.', ',')} jt`;
    return fmt(v);
};

const RANGE_LABELS: Record<string, string> = {
    today: 'Hari Ini',
    this_week: 'Minggu Ini',
    this_month: 'Bulan Ini',
    this_year: 'Tahun Ini',
    custom: 'Kustom',
};

const CHANNEL_LABELS: Record<string, string> = {
    manual: 'Manual',
    grosir: 'Grosir Offline',
    shopee: 'Shopee',
    tiktok: 'TikTok Shop',
    website: 'Website',
    other: 'Lainnya',
};

const fmtDate = (value: string) =>
    new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

/** Perubahan dibanding hari sebelumnya, ditulis kecil di bawah angka utama. */
function GrowthNote({ value, tone = 'light' }: { value: number | null; tone?: 'light' | 'dark' }) {
    if (value === null) {
        return <span className={`text-[11px] font-semibold ${tone === 'dark' ? 'text-white/70' : 'text-gray-400'}`}>Data baru</span>;
    }

    const positive = value >= 0;
    const color = tone === 'dark'
        ? (positive ? 'text-white' : 'text-rose-100')
        : (positive ? 'text-emerald-600' : 'text-rose-500');

    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${color}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-3 h-3 ${positive ? '' : 'rotate-180'}`}>
                <path d="M12 4.5l7.5 10.5H4.5L12 4.5z" />
            </svg>
            {Math.abs(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })}% dari kemarin
        </span>
    );
}

export default function Dashboard({ metrics, filters }: Props) {
    const [selectedRange, setSelectedRange] = useState(filters.range ?? 'this_month');
    const [channel, setChannel] = useState(filters.channel ?? '');
    const [refreshing, setRefreshing] = useState(false);

    const navigate = (params: Record<string, string | undefined>) => {
        router.get('/dashboard', {
            range: selectedRange,
            channel: channel || undefined,
            ...params,
        }, { preserveState: true, preserveScroll: true });
    };

    const refresh = () => {
        setRefreshing(true);
        router.reload({ onFinish: () => setRefreshing(false) });
    };

    const { today, profit_funnel: funnel, top_products: topProducts } = metrics;
    const maxProfit = Math.max(...topProducts.map(p => Math.abs(p.profit)), 1);

    // Corong laba — blok pertama paling besar, sisanya menyusut seperti referensi.
    const funnelSteps = [
        { label: 'Laba Kotor', value: funnel.gross_profit, gradient: 'from-teal-500 to-emerald-500', width: 'lg:flex-[2.2]' },
        { label: 'Omset', value: funnel.revenue, gradient: 'from-teal-600 to-teal-500', width: 'lg:flex-[1.6]' },
        { label: 'HPP / Modal', value: funnel.cogs, gradient: 'from-cyan-600 to-cyan-500', width: 'lg:flex-[1.3]' },
        { label: 'Biaya Operasional', value: funnel.expenses, gradient: 'from-teal-700 to-teal-600', width: 'lg:flex-1' },
        { label: 'Ongkir', value: funnel.shipping, gradient: 'from-slate-500 to-slate-400', width: 'lg:flex-[0.8]' },
    ];

    const kpis = [
        {
            key: 'omset',
            label: 'Omset Hari Ini',
            value: <CountUp value={today.revenue} format={fmt} />,
            growth: today.growth.revenue,
            filled: true,
            icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 20.25z',
        },
        {
            key: 'laba',
            label: 'Laba Bersih Hari Ini',
            value: <CountUp value={today.net_profit} format={fmt} />,
            growth: today.growth.net_profit,
            filled: true,
            icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        },
        {
            key: 'order',
            label: 'Total Order',
            value: <CountUp value={today.orders} />,
            growth: today.growth.orders,
            filled: false,
            icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 21.75H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
        },
        {
            key: 'kirim',
            label: 'Pengiriman',
            value: <CountUp value={today.shipped} />,
            growth: today.growth.shipped,
            filled: false,
            icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-6',
        },
    ];

    return (
        <AppLayout>
            <Head title="Dashboard" />

            <div className="space-y-5">
                {/* Header — pemilih channel, judul, ringkasan periode */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 anim-fade-down">
                    <div className="flex items-center gap-4">
                        {/* Pemilih channel/toko */}
                        <div className="relative">
                            <select
                                value={channel}
                                onChange={(e) => { setChannel(e.target.value); navigate({ channel: e.target.value || undefined }); }}
                                className="appearance-none pl-4 pr-10 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm font-bold text-gray-900 shadow-sm hover:border-teal-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:outline-none transition-all cursor-pointer"
                            >
                                <option value="">Semua Channel</option>
                                {metrics.channels.map(c => (
                                    <option key={c} value={c}>{CHANNEL_LABELS[c] ?? c}</option>
                                ))}
                            </select>
                            <span className="absolute left-4 -top-2 px-1 bg-white text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                Channel
                            </span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                                className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </div>

                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Performa Hari Ini</h1>
                            <p className="text-gray-500 text-xs mt-1">
                                {new Date(today.date).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>

                    {/* Ringkasan laporan */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-400 hidden sm:inline">Ringkasan Laporan</span>

                        <div className="flex items-center gap-1 bg-white border border-gray-200 p-1.5 rounded-2xl shadow-sm">
                            {['today', 'this_week', 'this_month', 'this_year'].map(r => (
                                <button
                                    key={r}
                                    onClick={() => { setSelectedRange(r); navigate({ range: r }); }}
                                    className={`px-3 py-1.5 text-xs rounded-xl font-semibold transition-all duration-150 ${
                                        selectedRange === r
                                            ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-200/50'
                                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                    }`}
                                >
                                    {RANGE_LABELS[r]}
                                </button>
                            ))}
                        </div>

                        <span className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-gray-200 text-[11px] text-gray-400 font-mono shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {metrics.generated_at}
                        </span>

                        <button
                            onClick={refresh}
                            disabled={refreshing}
                            title="Muat ulang data"
                            className="p-2.5 rounded-2xl bg-white border border-gray-200 text-gray-500 hover:text-teal-600 hover:border-teal-300 transition-all shadow-sm disabled:opacity-60"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m-.001 0v4.99m0-4.99a48.417 48.417 0 00-15.919 4.5A8.967 8.967 0 003 12c0 4.97 4.03 9 9 9a8.967 8.967 0 006.362-2.639M4.031 9.865a8.967 8.967 0 00-.53 3.135" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* KPI hari ini */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {kpis.map((kpi, index) => (
                        <div
                            key={kpi.key}
                            className={`anim-fade-up anim-d${index + 1} relative overflow-hidden rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 ${
                                kpi.filled
                                    ? 'bg-gradient-to-br from-teal-500 via-teal-500 to-emerald-500 shadow-lg shadow-teal-200/50'
                                    : 'bg-white border border-gray-200 shadow-sm hover:border-teal-300 hover:shadow-md'
                            }`}
                        >
                            {kpi.filled && <div className="absolute -right-10 -top-12 w-40 h-40 rounded-full bg-white/15 blur-2xl pointer-events-none" />}

                            <div className="relative flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                                    className={`w-4 h-4 ${kpi.filled ? 'text-white/80' : 'text-teal-500'}`}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={kpi.icon} />
                                </svg>
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${kpi.filled ? 'text-white/85' : 'text-gray-400'}`}>
                                    {kpi.label}
                                </span>
                            </div>

                            <p className={`relative text-[26px] leading-tight font-bold font-mono tracking-tight mt-3 ${
                                kpi.filled ? 'text-white' : 'text-gray-900'
                            }`}>
                                {kpi.value}
                            </p>

                            <div className="relative mt-2">
                                <GrowthNote value={kpi.growth} tone={kpi.filled ? 'dark' : 'light'} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Profit Funnel */}
                <div className="anim-fade-up anim-d2 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Profit Funnel</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                {RANGE_LABELS[selectedRange]} · {fmtDate(metrics.date_from)} – {fmtDate(metrics.date_to)}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${funnel.margin >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                Margin {funnel.margin.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                            </span>
                            <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold">
                                Laba Bersih {fmtCompact(funnel.net_profit)}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-stretch gap-2 lg:gap-0">
                        {funnelSteps.map((step, index) => (
                            <div
                                key={step.label}
                                style={{
                                    clipPath: index === 0
                                        ? 'polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%)'
                                        : 'polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%)',
                                    marginLeft: index === 0 ? 0 : '-14px',
                                }}
                                className={`group relative min-w-0 ${step.width} bg-gradient-to-br ${step.gradient}
                                    pl-8 pr-9 py-4 text-white transition-all duration-200 hover:brightness-110 cursor-default`}
                            >
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/75 truncate">{step.label}</p>
                                <p className="text-lg font-bold font-mono tracking-tight mt-1 truncate" title={fmt(step.value)}>
                                    {fmtCompact(step.value)}
                                </p>
                                {funnel.revenue > 0 && (
                                    <p className="text-[10px] text-white/70 mt-0.5">
                                        {((Math.abs(step.value) / funnel.revenue) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari omset
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Produk Paling Menguntungkan */}
                <div className="anim-fade-up anim-d3 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Produk Paling Menguntungkan</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">Laba = omset item − modal · {RANGE_LABELS[selectedRange]}</p>
                        </div>
                        <Link href="/reports/product-velocity" className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                            Analisis produk →
                        </Link>
                    </div>

                    {topProducts.length === 0 ? (
                        <p className="text-gray-400 text-xs text-center py-12">Belum ada penjualan produk pada periode ini.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {topProducts.map((product, index) => (
                                <div
                                    key={product.product_id}
                                    className="group flex items-center gap-3 rounded-xl border border-gray-100 hover:border-teal-300 bg-gray-50/70 hover:bg-white px-3.5 py-3 transition-all duration-200"
                                >
                                    <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                                        index === 0
                                            ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white'
                                            : 'bg-white border border-gray-200 text-gray-500 group-hover:border-teal-200 group-hover:text-teal-600'
                                    }`}>
                                        {index + 1}
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-gray-800 truncate" title={product.name}>
                                            {product.name}
                                        </p>
                                        <div className="w-full h-1.5 bg-gray-200/70 rounded-full overflow-hidden mt-1.5">
                                            <div
                                                style={{ width: `${Math.max(4, Math.round((Math.abs(product.profit) / maxProfit) * 100))}%` }}
                                                className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-mono mt-1 truncate">
                                            {product.sku ?? '—'} · {product.qty} pcs · omset {fmtCompact(product.revenue)}
                                        </p>
                                    </div>

                                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                                        product.profit >= 0 ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-600'
                                    }`}>
                                        {fmtCompact(product.profit)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Penjualan per channel — grafik garis */}
                <div className="anim-fade-up anim-d4 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Penjualan per Channel</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                Omset harian tiap channel · klik legenda untuk menyembunyikan garis
                            </p>
                        </div>
                        <Link href="/reports/sales" className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                            Laporan lengkap →
                        </Link>
                    </div>

                    <LineChart
                        labels={metrics.channel_trend.dates}
                        series={metrics.channel_trend.series.map(item => ({
                            key: item.channel,
                            label: CHANNEL_LABELS[item.channel] ?? item.channel,
                            values: item.points,
                        }))}
                        formatValue={fmtCompact}
                        formatLabel={fmtDate}
                    />
                </div>

                {/* Ringkasan operasional */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        {
                            label: 'Piutang Customer',
                            value: fmtCompact(metrics.financial.total_receivables),
                            note: `${metrics.financial.unpaid_invoices_count} invoice belum lunas`,
                            accent: 'text-gray-900',
                            href: '/invoices',
                        },
                        {
                            label: 'Saldo Kas & Bank',
                            value: fmtCompact(metrics.financial.total_cash_balance),
                            note: `Utang pabrik ${fmtCompact(metrics.financial.total_payables)}`,
                            accent: 'text-teal-600',
                            href: '/cash-bank/accounts',
                        },
                        {
                            label: 'Stok Tersedia',
                            value: `${metrics.inventory.available_stock.toLocaleString('id-ID')} unit`,
                            note: `${metrics.inventory.low_stock_count} SKU menipis`,
                            accent: 'text-gray-900',
                            href: '/stock-movements',
                        },
                        {
                            label: 'Order Marketplace',
                            value: `${metrics.marketplace.total_orders} order`,
                            note: `${metrics.marketplace.shipped_count} sudah dikirim`,
                            accent: 'text-gray-900',
                            href: '/marketplace/orders',
                        },
                    ].map(card => (
                        <Link
                            key={card.label}
                            href={card.href}
                            className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm hover:border-teal-300 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                        >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{card.label}</p>
                            <p className={`text-lg font-bold font-mono tracking-tight mt-2 ${card.accent}`}>{card.value}</p>
                            <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">{card.note}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}
