import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
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

interface KreatifStats {
  today_total: number;
  my_today_total: number;
  today_ig: number;
  today_tiktok: number;
  today_shopee: number;
  month_total: number;
  my_month_total: number;
  month_views?: number;
  month_ig_views?: number;
  month_tiktok_views?: number;
  month_shopee_views?: number;
  my_month_views?: number;
  top_video_title?: string;
  top_video_views?: number;
  last_synced_at?: string;
  my_has_ig: boolean;
  my_has_tiktok: boolean;
  my_has_shopee: boolean;
}

interface ContentDailyTrendItem {
  date: string;
  label: string;
  dayName: string;
  total: number;
  ig_count: number;
  tiktok_count: number;
  shopee_count: number;
}

interface RecentReportItem {
  id: number;
  title: string;
  author: string;
  is_mine: boolean;
  reported_at: string;
  ig_link: string | null;
  tiktok_link: string | null;
  shopee_link: string | null;
  total_views?: number;
  ig_views?: number;
  tiktok_views?: number;
  shopee_views?: number;
  views_synced_at?: string | null;
  status: string;
  feedback: string | null;
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
  isKreatif?: boolean;
  kreatifStats?: KreatifStats;
  contentDailyTrend?: ContentDailyTrendItem[];
  recentReports?: RecentReportItem[];
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
  isKreatif: isKreatifProp,
  kreatifStats,
  contentDailyTrend = [],
  recentReports = [],
}: DashboardProps) {
  const { auth } = usePage().props as any;
  const userRoleName = (auth?.user?.role?.name || '').toLowerCase();
  const userRolesList = (auth?.user?.roles || []).map((r: any) => typeof r === 'string' ? r.toLowerCase() : (r.name || '').toLowerCase());
  const isKreatifRole = userRoleName.includes('kreatif') || userRoleName.includes('creator') || userRolesList.some((r: string) => r.includes('kreatif') || r.includes('creator'));
  const isKreatif = isKreatifProp || isKreatifRole;

  // VIEW KHUSUS ROLE KREATIF (Fokus 100% pada performa konten & social media)
  if (isKreatif) {
    const maxContentTrend = Math.max(...(contentDailyTrend.map((t) => t.total)), 1);

    return (
      <AppLayout>
        <Head title="Dashboard Konten & Sosial Media" />

        <div className="space-y-6 max-w-7xl mx-auto pb-10">
          {/* 1. Header Banner Tim Kreatif (Biru Navy #0B132B ke #1E3A8A) */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] p-5 sm:p-6 text-white shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 bg-white/10 px-2.5 py-1 rounded-full border border-white/20">
                  Tim Kreatif & Social Media
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-2">
                  Halo, {auth?.user?.name || 'Kreatif'}! 👋
                </h1>
                <p className="text-xs text-blue-100/90 mt-1 max-w-xl">
                  Pantau konsistensi unggahan video harian Anda di Instagram, TikTok, dan Shopee Video.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto">
                <Link
                  href="/content-reports?create=1"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#0B132B] hover:bg-blue-50 shadow-xs transition-all active:scale-98 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-[#0B132B]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>+ Setor Konten Baru</span>
                </Link>
                <Link
                  href="/content-reports"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 px-4 py-2.5 text-xs font-semibold text-white transition-all active:scale-98 cursor-pointer"
                >
                  <span>Lihat Semua Laporan →</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 2. Empat Kartu Statistik Utama Khusus Konten */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Konten Hari Ini */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Konten Hari Ini
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-black text-slate-900">
                  {kreatifStats?.today_total ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-400">konten diunggah</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Total Bulan Ini: <strong className="text-slate-800">{kreatifStats?.month_total ?? 0}</strong></span>
                <span className="text-emerald-700 font-bold">
                  {kreatifStats?.my_today_total ?? 0} oleh Anda
                </span>
              </div>
            </div>

            {/* Card 2: Instagram Video */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B132B]">
                  📸 Instagram Video
                </span>
                <span className="text-[10px] bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full font-bold border border-pink-200">
                  Reels & Story
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-black text-slate-900">
                  {kreatifStats?.today_ig ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-400">video hari ini</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Target: Reels & Story
                </span>
                <strong className={kreatifStats?.my_has_ig ? 'text-emerald-700 font-bold' : 'text-[#0B132B] font-bold'}>
                  {kreatifStats?.my_has_ig ? '✓ Disetor' : 'Belum'}
                </strong>
              </div>
            </div>

            {/* Card 3: TikTok Video */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B132B]">
                  🎵 TikTok Video
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-900 px-2 py-0.5 rounded-full font-bold border border-slate-300">
                  FYP & Tren
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-black text-slate-900">
                  {kreatifStats?.today_tiktok ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-400">video hari ini</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Target: FYP & Tren
                </span>
                <strong className={kreatifStats?.my_has_tiktok ? 'text-emerald-700 font-bold' : 'text-[#0B132B] font-bold'}>
                  {kreatifStats?.my_has_tiktok ? '✓ Disetor' : 'Belum'}
                </strong>
              </div>
            </div>

            {/* Card 4: Shopee Video */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B132B]">
                  🛒 Shopee Video
                </span>
                <span className="text-[10px] bg-blue-50 text-[#0B132B] px-2 py-0.5 rounded-full font-bold border border-blue-200">
                  Keranjang Kuning
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-black text-slate-900">
                  {kreatifStats?.today_shopee ?? 0}
                </span>
                <span className="text-xs font-semibold text-slate-400">video hari ini</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Target: Keranjang Kuning
                </span>
                <strong className={kreatifStats?.my_has_shopee ? 'text-emerald-700 font-bold' : 'text-[#0B132B] font-bold'}>
                  {kreatifStats?.my_has_shopee ? '✓ Disetor' : 'Belum'}
                </strong>
              </div>
            </div>
          </div>

          {/* 3. Baris Dua Kolom: Tren Aktivitas 7 Hari + Checklist Upload */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Kolom Kiri: Tren Unggahan 7 Hari Terakhir */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Aktivitas Upload 7 Hari Terakhir
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Grafik konsistensi unggahan video seluruh channel dalam 1 minggu
                  </p>
                </div>
                <span className="text-[11px] font-bold text-[#0B132B] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                  7 Hari
                </span>
              </div>

              {/* Bar Chart Sederhana */}
              <div className="pt-4 pb-2">
                <div className="h-44 flex items-end justify-between gap-2 sm:gap-4 px-2 border-b border-slate-100">
                  {contentDailyTrend.map((item, idx) => {
                    const heightPercent = maxContentTrend > 0 ? Math.max((item.total / maxContentTrend) * 100, 8) : 8;
                    const isToday = idx === contentDailyTrend.length - 1;

                    return (
                      <div key={item.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
                        {/* Tooltip Hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-semibold py-1 px-2 rounded-md whitespace-nowrap pointer-events-none shadow-md z-10">
                          {item.label}: {item.total} video (IG:{item.ig_count}, TT:{item.tiktok_count}, SP:{item.shopee_count})
                        </div>

                        {/* Bar */}
                        <span className="text-[10px] font-bold text-slate-600 mb-0.5">
                          {item.total}
                        </span>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full max-w-[36px] rounded-t-lg transition-all ${
                            isToday
                              ? 'bg-gradient-to-t from-[#0B132B] to-[#1E3A8A] shadow-xs'
                              : 'bg-slate-200 group-hover:bg-blue-600'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Labels Tanggal */}
                <div className="flex items-center justify-between gap-2 sm:gap-4 px-2 mt-2">
                  {contentDailyTrend.map((item, idx) => {
                    const isToday = idx === contentDailyTrend.length - 1;
                    return (
                      <div key={item.date} className="flex-1 text-center">
                        <span className={`text-[10px] block ${isToday ? 'font-bold text-[#0B132B]' : 'text-slate-500'}`}>
                          {item.dayName}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          {item.label.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Status & Tips Unggahan Harian */}
            <div className="lg:col-span-5 space-y-4">
              {/* Box Status Checklist Hari Ini */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Target Setoran Hari Ini
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                    {dateSubtitle}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {/* IG Item */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    kreatifStats?.my_has_ig ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">📸</span>
                      <div>
                        <span className="font-bold text-slate-900 block">Instagram Video</span>
                        <span className="text-[10px] text-slate-500">Reels / Feed / Story</span>
                      </div>
                    </div>
                    {kreatifStats?.my_has_ig ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        ✓ Disetor
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        Belum
                      </span>
                    )}
                  </div>

                  {/* TikTok Item */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    kreatifStats?.my_has_tiktok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🎵</span>
                      <div>
                        <span className="font-bold text-slate-900 block">TikTok Video</span>
                        <span className="text-[10px] text-slate-500">Sound Tren & FYP</span>
                      </div>
                    </div>
                    {kreatifStats?.my_has_tiktok ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        ✓ Disetor
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        Belum
                      </span>
                    )}
                  </div>

                  {/* Shopee Video Item */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    kreatifStats?.my_has_shopee ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🛒</span>
                      <div>
                        <span className="font-bold text-slate-900 block">Shopee Video</span>
                        <span className="text-[10px] text-slate-500">Review & Keranjang Kuning</span>
                      </div>
                    </div>
                    {kreatifStats?.my_has_shopee ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        ✓ Disetor
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        Belum
                      </span>
                    )}
                  </div>
                </div>

                {(!kreatifStats?.my_has_ig || !kreatifStats?.my_has_tiktok || !kreatifStats?.my_has_shopee) && (
                  <Link
                    href="/content-reports?create=1"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] text-white py-2.5 px-4 text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer text-center"
                  >
                    Setor Laporan Konten Hari Ini →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* 4. Tabel Konten Terbaru */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Laporan Konten Terbaru
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Daftar unggahan konten terakhir dari tim kreatif
                </p>
              </div>
              <Link
                href="/content-reports"
                className="text-xs font-bold text-[#0B132B] hover:underline"
              >
                Lihat Semua ({kreatifStats?.month_total ?? 0}) →
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Judul Konten</th>
                    <th className="py-3 px-4">Creator</th>
                    <th className="py-3 px-4">Link Video</th>
                    <th className="py-3 px-4">Status Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentReports.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Belum ada laporan konten yang disetor.
                      </td>
                    </tr>
                  ) : (
                    recentReports.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {item.reported_at}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 max-w-[260px] truncate">
                          {item.title}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-600">
                          {item.author} {item.is_mine && <span className="text-[10px] text-blue-600 font-bold">(Anda)</span>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.ig_link && (
                              <a
                                href={item.ig_link}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-700 border border-pink-200 text-[10px] font-bold hover:bg-pink-100"
                              >
                                📸 IG ↗
                              </a>
                            )}
                            {item.tiktok_link && (
                              <a
                                href={item.tiktok_link}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 border border-slate-300 text-[10px] font-bold hover:bg-slate-200"
                              >
                                🎵 TikTok ↗
                              </a>
                            )}
                            {item.shopee_link && (
                              <a
                                href={item.shopee_link}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded-md bg-blue-50 text-[#0B132B] border border-blue-200 text-[10px] font-bold hover:bg-blue-100"
                              >
                                🛒 Shopee ↗
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {item.status === 'reviewed' ? (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                              ✓ Ditinjau
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-medium">
                              Belum ada review
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // VIEW DASHBOARD REGULER (Super Admin, Admin, Direktur, PIC, Gudang)
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
                  Grafik riwayat volume pesanan cut off yang telah diproses dalam 14 hari terakhir. Arahkan kursor pada batang untuk melihat nominal.
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
