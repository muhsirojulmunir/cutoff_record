import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '../Layouts/AppLayout';

interface ChannelItem {
  id: string;
  name: string;
  count: number;
}

interface SummaryProps {
  omset: number;
  omsetChange: string;
  labaBersih: number;
  labaChange: string;
  totalOrders: number;
  ordersChange: string;
  pengiriman: number;
  pengirimanChange: string;
}

interface ProfitFunnelProps {
  period: string;
  margin: number;
  labaBersih: number;
  labaKotor: number;
  labaKotorPercent: number;
  omset: number;
  omsetPercent: number;
  hpp: number;
  hppPercent: number;
  biayaOps: number;
  biayaOpsPercent: number;
  ongkir: number;
  ongkirPercent: number;
}

interface DailyTrendItem {
  date: string;
  order_count: number;
  total_income: number;
}

interface ChannelBreakdownItem {
  channel: string;
  count: number;
  total_income: number;
}

interface CourierBreakdownItem {
  shipping_courier: string;
  count: number;
  total_income: number;
}

interface TopProductItem {
  rank: number;
  sku: string;
  name: string;
  orders: number;
  qty: number;
  omset: number;
  modal: number;
  laba: number;
  percent: number;
}

interface DashboardProps {
  filters: {
    range: string;
    channel: string;
  };
  timeframeTitle: string;
  dateSubtitle: string;
  channels: ChannelItem[];
  summary: SummaryProps;
  profitFunnel: ProfitFunnelProps;
  dailyTrend?: DailyTrendItem[];
  channelBreakdown?: ChannelBreakdownItem[];
  courierBreakdown?: CourierBreakdownItem[];
  topProducts: TopProductItem[];
  stats: {
    totalUsers: number;
    activeUsers: number;
    totalRoles: number;
    appName: string;
  };
}

function formatRupiah(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'Rp 0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 'Rp 0';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

function formatCompactRupiah(val: number): string {
  if (val >= 1_000_000_000) {
    return 'Rp ' + (val / 1_000_000_000).toFixed(1).replace('.', ',') + ' M';
  }
  if (val >= 1_000_000) {
    return 'Rp ' + (val / 1_000_000).toFixed(1).replace('.', ',') + ' jt';
  }
  if (val >= 1_000) {
    return 'Rp ' + (val / 1_000).toFixed(0).replace('.', ',') + ' rb';
  }
  return formatRupiah(val);
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split(' ')[0].split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d);
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export default function Dashboard({
  filters,
  timeframeTitle,
  dateSubtitle,
  channels = [],
  summary,
  profitFunnel,
  dailyTrend = [],
  channelBreakdown = [],
  courierBreakdown = [],
  topProducts = [],
}: DashboardProps) {
  const [selectedChannel, setSelectedChannel] = useState(filters.channel || 'all');
  const [activeRange, setActiveRange] = useState(filters.range || 'year');
  const [hoveredTrend, setHoveredTrend] = useState<DailyTrendItem | null>(null);

  const rangeOptions = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: 'Minggu Ini' },
    { key: 'month', label: 'Bulan Ini' },
    { key: 'year', label: 'Tahun Ini' },
    { key: 'all', label: 'Semua' },
  ];

  function applyFilter(override: { range?: string; channel?: string }) {
    const nextRange = override.range !== undefined ? override.range : activeRange;
    const nextChannel = override.channel !== undefined ? override.channel : selectedChannel;

    if (override.range !== undefined) setActiveRange(nextRange);
    if (override.channel !== undefined) setSelectedChannel(nextChannel);

    router.get(
      '/dashboard',
      {
        range: nextRange,
        channel: nextChannel,
      },
      { preserveState: true, replace: true, preserveScroll: true }
    );
  }

  const maxTrendCount = Math.max(...dailyTrend.map((t) => t.order_count), 1);
  const periodTotal = summary.totalOrders || 1;

  return (
    <AppLayout>
      <Head title="Dashboard Performa" />

      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Top Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Channel Dropdown Pill */}
            <div className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Channel
              </label>
              <div className="relative">
                <select
                  value={selectedChannel}
                  onChange={(e) => applyFilter({ channel: e.target.value })}
                  className="appearance-none pl-3.5 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0B132B] shadow-2xs cursor-pointer"
                >
                  <option value="all">Semua Channel</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.count.toLocaleString('id-ID')})
                    </option>
                  ))}
                </select>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>

            {/* Performa Title & Subtitle */}
            <div className="pt-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {timeframeTitle}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {dateSubtitle}
              </p>
            </div>
          </div>

          {/* Right Action & Range Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium hidden md:inline mr-1">
              Ringkasan Laporan
            </span>

            {/* Timeframe Presets */}
            <div className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
              {rangeOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => applyFilter({ range: opt.key })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeRange === opt.key
                      ? 'bg-[#0B132B] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => router.reload()}
              title="Refresh Data"
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-[#0B132B] hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        {/* 4 Cards Metrik Utama (Gaya Modern Navy Brand + Clean White) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Omset (Aksen Utama Navy Gradient) */}
          <div className="rounded-2xl p-6 bg-gradient-to-r from-[#0B132B] via-slate-900 to-blue-950 text-white shadow-xs border border-blue-950/60 relative overflow-hidden">
            <div className="flex items-center gap-2 text-blue-200/90">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                Omset {timeframeTitle.replace('Performa ', '')}
              </span>
            </div>
            <p className="text-3xl font-extrabold mt-3 tracking-tight text-white">
              {formatCompactRupiah(summary.omset)}
            </p>
            <p className="text-xs text-blue-300 font-medium mt-2 flex items-center gap-1">
              <span>▲</span> {summary.omsetChange}
            </p>
          </div>

          {/* Card 2: Laba Bersih (Navy Blue Gradient) */}
          <div className="rounded-2xl p-6 bg-gradient-to-r from-blue-950 via-blue-900 to-[#1E3A8A] text-white shadow-xs border border-blue-900/50 relative overflow-hidden">
            <div className="flex items-center gap-2 text-blue-200/90">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                Laba Bersih {timeframeTitle.replace('Performa ', '')}
              </span>
            </div>
            <p className="text-3xl font-extrabold mt-3 tracking-tight text-white">
              {formatCompactRupiah(summary.labaBersih)}
            </p>
            <p className="text-xs text-blue-200 font-medium mt-2 flex items-center gap-1">
              <span>▲</span> {summary.labaChange}
            </p>
          </div>

          {/* Card 3: Total Order (Clean Card) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Total Order
              </span>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">
              {summary.totalOrders.toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-blue-700 font-semibold mt-2 flex items-center gap-1">
              <span>▲</span> {summary.ordersChange}
            </p>
          </div>

          {/* Card 4: Pengiriman (Clean Card) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h.375c.621 0 1.125-.504 1.125-1.125V11.25c0-.621-.504-1.125-1.125-1.125h-1.5M14.25 5.25v9.75m0 0h-6" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Pengiriman
              </span>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">
              {summary.pengiriman.toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-blue-700 font-semibold mt-2 flex items-center gap-1">
              <span>▲</span> {summary.pengirimanChange}
            </p>
          </div>
        </div>

        {/* Profit Funnel Arrow Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Profit Funnel</h2>
              <p className="text-xs text-slate-500 mt-0.5">{profitFunnel.period}</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-semibold text-blue-900 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                Margin {profitFunnel.margin}%
              </span>
              <span className="font-bold text-blue-900">
                Laba Bersih {formatRupiah(profitFunnel.labaBersih)}
              </span>
            </div>
          </div>

          {/* Chevron / Funnel Step Cards (Responsive) */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-0 overflow-hidden rounded-xl border border-slate-200">
            {/* Step 1: Laba Kotor */}
            <div className="bg-blue-600 text-white p-4 relative flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Laba Kotor</p>
                <p className="text-base font-extrabold mt-1 truncate">{formatCompactRupiah(profitFunnel.labaKotor)}</p>
              </div>
              <p className="text-[11px] text-blue-100/90 mt-3 font-medium">{profitFunnel.labaKotorPercent}% dari omset</p>
            </div>

            {/* Step 2: Omset */}
            <div className="bg-[#0B132B] text-white p-4 relative flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Omset</p>
                <p className="text-base font-extrabold mt-1 truncate">{formatCompactRupiah(profitFunnel.omset)}</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 font-medium">100% dari omset</p>
            </div>

            {/* Step 3: HPP / Modal */}
            <div className="bg-slate-800 text-white p-4 relative flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">HPP / Modal</p>
                <p className="text-base font-extrabold mt-1 truncate">{formatCompactRupiah(profitFunnel.hpp)}</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 font-medium">{profitFunnel.hppPercent}% dari omset</p>
            </div>

            {/* Step 4: Biaya Operasional */}
            <div className="bg-slate-700 text-white p-4 relative flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Biaya Operasional</p>
                <p className="text-base font-extrabold mt-1 truncate">{formatCompactRupiah(profitFunnel.biayaOps)}</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 font-medium">0% dari omset</p>
            </div>

            {/* Step 5: Ongkir */}
            <div className="bg-slate-900 text-white p-4 relative flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Ongkir</p>
                <p className="text-base font-extrabold mt-1 truncate">{formatCompactRupiah(profitFunnel.ongkir)}</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 font-medium">0% dari omset</p>
            </div>
          </div>
        </div>

        {/* Tren Volume & Penjualan Harian (Visual Bar Chart 14 Hari) */}
        {dailyTrend.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Tren Volume & Penjualan Harian
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Grafik riwayat volume pesanan dalam 14 hari terakhir. Arahkan kursor pada batang untuk melihat nominal.
                </p>
              </div>

              {hoveredTrend && (
                <div className="text-xs bg-[#0B132B] text-white px-3 py-1.5 rounded-lg font-mono">
                  <span className="text-slate-300">{formatDateIndo(hoveredTrend.date)}: </span>
                  <strong className="text-blue-300">{hoveredTrend.order_count} pesanan</strong>
                  <span className="text-slate-400"> ({formatRupiah(hoveredTrend.total_income)})</span>
                </div>
              )}
            </div>

            {/* Custom Bar Chart Visual */}
            <div className="pt-4 pb-2">
              <div className="flex items-end gap-2 h-44 border-b border-slate-200 px-2">
                {dailyTrend.map((item, idx) => {
                  const heightPercent = Math.max(Math.round((item.order_count / maxTrendCount) * 100), 8);
                  const isHovered = hoveredTrend?.date === item.date;

                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                      onMouseEnter={() => setHoveredTrend(item)}
                      onMouseLeave={() => setHoveredTrend(null)}
                    >
                      {/* Tooltip on hover */}
                      {isHovered && (
                        <div className="absolute -top-12 z-20 bg-[#0B132B] text-white text-[10px] py-1 px-2.5 rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
                          <p className="font-bold">{item.order_count} pesanan</p>
                          <p className="text-blue-300 font-mono">{formatRupiah(item.total_income)}</p>
                        </div>
                      )}

                      {/* Bar */}
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-lg transition-all duration-200 ${
                          isHovered
                            ? 'bg-[#0B132B] shadow-md scale-y-105'
                            : 'bg-gradient-to-t from-blue-700 to-blue-500 hover:from-blue-800 hover:to-blue-600'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X Axis Labels */}
              <div className="flex items-center gap-2 px-2 pt-2 text-[10px] text-slate-400 font-mono">
                {dailyTrend.map((item, idx) => {
                  const day = item.date.split('-')[2];
                  return (
                    <div key={idx} className="flex-1 text-center truncate font-semibold text-slate-500">
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Breakdown Toko & Kurir (Two Column Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Marketplace / Channel Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Performa Toko & Marketplace
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribusi pesanan & omzet per channel penjualan
                </p>
              </div>
              <Link
                href="/cut-off-orders"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Lihat Semua &rarr;
              </Link>
            </div>

            <div className="space-y-3">
              {channelBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Tidak ada data channel pada periode ini.</p>
              ) : (
                channelBreakdown.map((item) => {
                  const pct = Math.round((item.count / periodTotal) * 100);
                  return (
                    <Link
                      key={item.channel}
                      href={`/cut-off-orders?channel=${item.channel}`}
                      className="block p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/70 transition-all group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold px-2 py-0.5 rounded bg-[#0B132B] text-white text-[11px]">
                            {item.channel}
                          </span>
                          <span className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                            {item.count.toLocaleString('id-ID')} pesanan
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-900 block">
                            {formatRupiah(item.total_income)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {pct}% kontribusi
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Courier Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Performa Jasa Pengiriman (Kurir)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Volume pesanan berdasarkan kurir dan ekspedisi
                </p>
              </div>
              <Link
                href="/cut-off-orders"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                Filter Kurir &rarr;
              </Link>
            </div>

            <div className="space-y-3">
              {courierBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Tidak ada data kurir pada periode ini.</p>
              ) : (
                courierBreakdown.map((item) => {
                  const pct = Math.round((item.count / periodTotal) * 100);
                  return (
                    <Link
                      key={item.shipping_courier}
                      href={`/cut-off-orders?shipping_courier=${encodeURIComponent(item.shipping_courier)}`}
                      className="block p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/70 transition-all group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="truncate max-w-[200px] sm:max-w-xs">
                          <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors block truncate">
                            {item.shipping_courier}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {item.count.toLocaleString('id-ID')} paket terkirim
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-bold text-slate-900 block">
                            {formatRupiah(item.total_income)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {pct}% volume
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Produk Paling Menguntungkan */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Produk Paling Menguntungkan</h2>
              <p className="text-xs text-slate-500 mt-0.5">Laba = omset item – modal · {profitFunnel.period}</p>
            </div>
            <Link
              href="/cut-off-orders"
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Analisis produk →
            </Link>
          </div>

          {/* Grid 2 Kolom Produk */}
          {topProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Tidak ada data produk pada periode ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {topProducts.map((prod) => (
                <div
                  key={prod.sku}
                  className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center gap-3.5"
                >
                  {/* Badge Angka Ranking */}
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      prod.rank === 1
                        ? 'bg-[#0B132B] text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    {prod.rank}
                  </div>

                  {/* Info SKU, Nama & Bar Progress */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate" title={prod.name}>
                      {prod.name}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate font-mono">
                      {prod.sku} · {prod.qty} pcs · omset {formatRupiah(prod.omset)}
                    </p>

                    {/* Progress Bar Laba */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${prod.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Nilai Laba */}
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-blue-900">
                      {formatRupiah(prod.laba)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
