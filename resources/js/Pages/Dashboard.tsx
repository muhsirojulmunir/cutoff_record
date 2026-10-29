import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../Layouts/AppLayout';
import { PageProps } from '../Types';
import DualCalendarRangePicker from '../Components/DualCalendarRangePicker';

interface FilterState {
  range: string;
  date_from: string;
  date_to: string;
}

interface TodayStats {
  date: string;
  orders: number;
  estNetIncome: number;
  netPayout: number;
  oos: number;
  rj: number;
  dpp: number;
}

interface PeriodStats {
  range: string;
  totalOrders: number;
  totalOos: number;
  totalRj: number;
  totalDpp: number;
  estNetIncome: number;
  netPayout: number;
}

interface ChannelItem {
  channel: string;
  count: number;
  total_income: number | string;
}

interface CourierItem {
  shipping_courier: string;
  count: number;
  total_income: number | string;
}

interface DailyTrendItem {
  date: string;
  order_count: number;
  total_income: number | string;
}

interface RecentOrder {
  id: number;
  order_number: string;
  order_date: string | null;
  channel: string;
  buyer_username: string | null;
  shipping_courier: string | null;
  order_status: string | null;
  info_gudang: string | null;
  est_net_income: number | string | null;
  dpp_number: string | null;
}

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  database: string;
  appName: string;
}

interface DashboardProps {
  filters?: FilterState;
  todayStats: TodayStats;
  periodStats: PeriodStats;
  channelBreakdown: ChannelItem[];
  courierBreakdown: CourierItem[];
  dailyTrend: DailyTrendItem[];
  recentOrders: RecentOrder[];
  stats: SystemStats;
  cutOff?: PeriodStats & { channelBreakdown: ChannelItem[] };
}

function formatRupiah(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'Rp 0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 'Rp 0';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split(' ')[0].split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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
  filters = { range: 'all', date_from: '', date_to: '' },
  todayStats,
  periodStats,
  channelBreakdown = [],
  courierBreakdown = [],
  dailyTrend = [],
  recentOrders = [],
  stats,
}: DashboardProps) {
  const { auth } = usePage<PageProps>().props;
  const user = auth.user;
  const isManagement = user?.role?.name === 'Management';

  const [activeRange, setActiveRange] = useState<string>(filters.range || 'all');
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [hoveredTrend, setHoveredTrend] = useState<DailyTrendItem | null>(null);

  const rangePresets = [
    { key: 'all', label: 'Semua Waktu' },
    { key: 'today', label: 'Hari Ini' },
    { key: 'yesterday', label: 'Kemarin' },
    { key: '7days', label: '7 Hari Terakhir' },
    { key: '30days', label: '30 Hari Terakhir' },
    { key: 'this_month', label: 'Bulan Ini' },
    { key: 'custom', label: 'Kustom Tanggal' },
  ];

  const handleSelectRange = (rangeKey: string) => {
    if (rangeKey === 'custom') {
      setIsCalendarOpen((prev) => !prev);
      return;
    }
    setIsCalendarOpen(false);
    setActiveRange(rangeKey);
    router.get(
      '/dashboard',
      { range: rangeKey },
      { preserveScroll: true, preserveState: true }
    );
  };

  const handleApplyRangePicker = (start: string, end: string) => {
    setActiveRange('custom');
    setIsCalendarOpen(false);
    router.get(
      '/dashboard',
      {
        range: 'custom',
        date_from: start,
        date_to: end,
      },
      { preserveScroll: true, preserveState: true }
    );
  };

  const handleResetFilter = () => {
    setActiveRange('all');
    setIsCalendarOpen(false);
    router.get('/dashboard', { range: 'all' }, { preserveScroll: true, preserveState: true });
  };

  // Max count for daily trend visual chart
  const maxTrendCount = Math.max(...dailyTrend.map((t) => t.order_count), 1);

  // Total orders in period for percentages
  const periodTotal = periodStats?.totalOrders || 1;

  return (
    <AppLayout>
      <Head title="Executive Dashboard - Koding ERP" />

      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Welcome & Role Header */}
        <div className="bg-gradient-to-r from-[#070D1E] via-[#0B132B] to-[#132043] rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden border border-slate-800">
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Selamat Datang, {user?.name ?? 'User'}
                </h1>
                {isManagement ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Akses Eksekutif (Read-Only)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    {user?.role?.name ?? 'Administrator'}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
                {isManagement
                  ? 'Panel analitik manajemen untuk monitoring performa penjualan harian, omzet toko, kendala stok, dan pergerakan logistik.'
                  : 'Dashboard terpadu operasional dan cut off order. Pantau status harian dan kelola pesanan dengan cepat.'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/cut-off-orders"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs tracking-wide shadow-md transition-all active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                Buka Data Pesanan Cut Off
              </Link>
            </div>
          </div>
        </div>

        {/* Realtime Live Highlight: PENJUALAN HARI INI */}
        <div className="bg-white border-2 border-slate-900/10 rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden bg-gradient-to-br from-white via-slate-50/50 to-blue-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  Live Monitoring: Penjualan Hari Ini
                  <span className="text-[11px] font-normal normal-case text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {formatDateIndo(todayStats?.date)}
                  </span>
                </h2>
              </div>
            </div>

            <Link
              href={`/cut-off-orders?date_from=${todayStats?.date}&date_to=${todayStats?.date}`}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 self-start sm:self-auto transition-colors"
            >
              Rincian Pesanan Hari Ini ({todayStats?.orders ?? 0}) &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            {/* Today Orders */}
            <div className="p-3.5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Pesanan Masuk
              </span>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                {(todayStats?.orders ?? 0).toLocaleString('id-ID')}
              </p>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Update transaksi tanggal berjalan
              </span>
            </div>

            {/* Today Income */}
            <div className="p-3.5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Est. Pendapatan Bersih
              </span>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1 truncate">
                {formatRupiah(todayStats?.estNetIncome)}
              </p>
              <span className="text-[11px] text-emerald-700/80 mt-0.5 block font-medium">
                Pencairan: {formatRupiah(todayStats?.netPayout)}
              </span>
            </div>

            {/* Today OOS / RJ Issues */}
            <div className="p-3.5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Kendala Gudang / Retur
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl sm:text-2xl font-extrabold text-rose-600">
                  {todayStats?.oos ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-bold">OOS</span>
                <span className="text-slate-300">•</span>
                <span className="text-xl sm:text-2xl font-extrabold text-amber-600">
                  {todayStats?.rj ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-bold">Retur</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {todayStats?.oos === 0 && todayStats?.rj === 0 ? 'Semua pesanan aman' : 'Perlu perhatian tim'}
              </span>
            </div>

            {/* Today DPP */}
            <div className="p-3.5 rounded-xl bg-white border border-slate-100 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                No. DPP Terbit
              </span>
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-700 mt-1">
                {(todayStats?.dpp ?? 0).toLocaleString('id-ID')}
              </p>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Klaim pencairan diproses
              </span>
            </div>
          </div>
        </div>

        {/* Custom Date Filter Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Filter Periode Analitik:
              </span>
              {filters.range === 'custom' && filters.date_from && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  {formatDateIndo(filters.date_from)} s/d {formatDateIndo(filters.date_to)}
                </span>
              )}
            </div>

            {(filters.range !== 'all' || filters.date_from) && (
              <button
                onClick={handleResetFilter}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold self-start md:self-auto flex items-center gap-1 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reset ke Semua Waktu
              </button>
            )}
          </div>

          {/* Preset Buttons & Dual Calendar Popover */}
          <div className="relative flex items-center gap-2 flex-wrap">
            {rangePresets.map((preset) => {
              const isActive = activeRange === preset.key;

              if (preset.key === 'custom') {
                const hasCustomDate = filters.range === 'custom' && filters.date_from;
                return (
                  <div key={preset.key} className="relative">
                    <button
                      type="button"
                      onClick={() => handleSelectRange('custom')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-[#EA3829] text-white shadow-xs'
                          : isCalendarOpen
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      {hasCustomDate
                        ? `${formatDateIndo(filters.date_from)} – ${formatDateIndo(filters.date_to)}`
                        : 'Kustom Tanggal'}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className={`w-3 h-3 transition-transform ${isCalendarOpen ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {/* Dual Month Calendar Popover matching reference screenshot */}
                    <DualCalendarRangePicker
                      initialStartDate={filters.date_from || undefined}
                      initialEndDate={filters.date_to || undefined}
                      maxDate={todayStats?.date || undefined}
                      isOpen={isCalendarOpen}
                      onClose={() => setIsCalendarOpen(false)}
                      onApply={handleApplyRangePicker}
                    />
                  </div>
                );
              }

              return (
                <button
                  key={preset.key}
                  onClick={() => handleSelectRange(preset.key)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0B132B] text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4 Main Cut Off Live Metric Cards for Selected Period */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Orders */}
          <Link
            href="/cut-off-orders"
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-[#0B132B] hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-900 transition-colors">
                Total Pesanan
              </span>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl group-hover:bg-[#0B132B] group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {periodStats.totalOrders.toLocaleString('id-ID')}
              </span>
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1 font-semibold">
                Buka Data Pesanan &rarr;
              </p>
            </div>
          </Link>

          {/* Card 2: Est Net Income */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Est. Pendapatan Bersih
              </span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate block">
                {formatRupiah(periodStats.estNetIncome)}
              </span>
              <p className="text-xs text-emerald-600 font-semibold mt-1">
                Pencairan Marketplace: {formatRupiah(periodStats.netPayout)}
              </p>
            </div>
          </div>

          {/* Card 3: Stok Habis (OOS) */}
          <Link
            href="/cut-off-orders?info_gudang=oos"
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-rose-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-rose-600 transition-colors">
                Stok Habis (OOS)
              </span>
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-rose-600 tracking-tight">
                {periodStats.totalOos.toLocaleString('id-ID')}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                {((periodStats.totalOos / periodTotal) * 100).toFixed(1)}% dari total pesanan
              </p>
            </div>
          </Link>

          {/* Card 4: Retur Jual (RJ) */}
          <Link
            href="/cut-off-orders?order_status=rj"
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-amber-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-amber-600 transition-colors">
                Retur Jual (RJ)
              </span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-amber-600 tracking-tight">
                {periodStats.totalRj.toLocaleString('id-ID')}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                {periodStats.totalDpp.toLocaleString('id-ID')} pesanan ber-DPP
              </p>
            </div>
          </Link>
        </div>

        {/* Visual Daily Sales Trend Chart (14 Hari) */}
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
                <div className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-mono">
                  <span className="text-slate-300">{formatDateIndo(hoveredTrend.date)}: </span>
                  <strong className="text-emerald-400">{hoveredTrend.order_count} pesanan</strong>
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
                        <div className="absolute -top-12 z-20 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-md shadow-lg whitespace-nowrap pointer-events-none">
                          <p className="font-bold">{item.order_count} pesanan</p>
                          <p className="text-emerald-300">{formatRupiah(item.total_income)}</p>
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
                    <div key={idx} className="flex-1 text-center truncate">
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Breakdown Toko & Kurir (Two Column) */}
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
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
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
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
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
                          className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
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

        {/* Live Activity Stream / Pesanan Terkini */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Pesanan Terkini (Live Feed)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoring transaksi cut off terbaru yang masuk ke dalam sistem
              </p>
            </div>
            <Link
              href="/cut-off-orders"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Buka Semua di Cut Off Order &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Tgl & Toko</th>
                  <th className="py-2.5 px-3">No. Pesanan</th>
                  <th className="py-2.5 px-3">Pembeli & Kurir</th>
                  <th className="py-2.5 px-3">Status Pesanan</th>
                  <th className="py-2.5 px-3 text-right">Est. Pendapatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Belum ada data transaksi cut off.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((ord) => {
                    const isOos = ord.info_gudang?.toUpperCase().includes('OOS');
                    const isRj =
                      ord.order_status?.toUpperCase().includes('RJ') ||
                      ord.order_status?.toUpperCase().includes('RETUR');

                    return (
                      <tr key={ord.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">
                            {formatDateIndo(ord.order_date)}
                          </div>
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-extrabold rounded bg-[#0B132B] text-white">
                            {ord.channel}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-medium text-slate-900 block">
                            {ord.order_number}
                          </span>
                          {ord.dpp_number && (
                            <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200 mt-0.5 inline-block">
                              DPP: {ord.dpp_number}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-slate-900 block truncate max-w-[150px]">
                            {ord.buyer_username || '-'}
                          </span>
                          <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                            {ord.shipping_courier || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {isOos ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              OOS (Habis)
                            </span>
                          ) : isRj ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Retur Jual
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {ord.order_status || 'Normal'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-slate-900 block">
                            {formatRupiah(ord.est_net_income)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
