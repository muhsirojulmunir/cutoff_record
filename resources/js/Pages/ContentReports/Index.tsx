import React, { useEffect, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Modal from '../../Components/Modal';

export interface Creator {
  id: number;
  name: string;
}

export interface UserSummary {
  id: number;
  name: string;
  email: string;
}

export interface ContentReportItem {
  id: number;
  user_id: number;
  content_type: 'santai' | 'produk' | 'semua';
  title: string;
  ig_link: string | null;
  tiktok_link: string | null;
  shopee_link: string | null;
  notes: string | null;
  total_views?: number;
  ig_views?: number;
  tiktok_views?: number;
  shopee_views?: number;
  views_synced_at?: string | null;
  views_sync_status?: string;
  status: 'submitted' | 'reviewed';
  reviewed_by: number | null;
  reviewed_at: string | null;
  feedback: string | null;
  reported_at: string;
  user?: UserSummary;
  reviewer?: UserSummary;
}

export interface Stats {
  today_total: number;
  today_ig?: number;
  today_tiktok?: number;
  today_shopee?: number;
  today_santai?: number;
  today_produk?: number;
  today_semua?: number;
  this_month_total: number;
  this_month_views?: number;
  last_synced_at?: string | null;
  my_today_count: number;
  my_today_has_ig?: boolean;
  my_today_has_tiktok?: boolean;
  my_today_has_shopee?: boolean;
  my_today_has_santai?: boolean;
  my_today_has_produk?: boolean;
  server_time: string;
}

export interface Capabilities {
  can_create: boolean;
  can_review: boolean;
  is_kreatif: boolean;
}

export interface PaginatedData<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: Array<{
    url: string | null;
    label: string;
    active: boolean;
  }>;
}

export interface Props {
  reports: PaginatedData<ContentReportItem>;
  filters: {
    search?: string;
    content_type?: string;
    user_id?: string | number;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
  stats: Stats;
  creators: Creator[];
  capabilities: Capabilities;
}

function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeString(): string {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function ContentReportsIndex({
  reports,
  filters,
  stats,
  creators,
  capabilities,
}: Props) {
  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<ContentReportItem | null>(null);
  const [reviewingReport, setReviewingReport] = useState<ContentReportItem | null>(null);

  // Filter Form State
  const [search, setSearch] = useState(filters.search || '');
  const [contentTypeFilter, setContentTypeFilter] = useState(filters.content_type || '');
  const [creatorFilter, setCreatorFilter] = useState(filters.user_id ? String(filters.user_id) : '');
  const [statusFilter, setStatusFilter] = useState(filters.status || '');
  const [dateFrom, setDateFrom] = useState(filters.date_from || '');
  const [dateTo, setDateTo] = useState(filters.date_to || '');

  // Form Input Report Baru (Default Hari Ini & Jam Sekarang)
  const createForm = useForm({
    title: '',
    reported_date: getTodayDateString(),
    reported_time: getCurrentTimeString(),
    ig_link: '',
    tiktok_link: '',
    shopee_link: '',
    notes: '',
  });

  // Form Edit Report
  const editForm = useForm({
    title: '',
    reported_date: '',
    reported_time: '',
    ig_link: '',
    tiktok_link: '',
    shopee_link: '',
    notes: '',
  });

  // Form Review PIC / Management
  const reviewForm = useForm({
    feedback: '',
  });

  const [syncingRowId, setSyncingRowId] = useState<number | null>(null);
  const [viewsModalReport, setViewsModalReport] = useState<ContentReportItem | null>(null);

  // Form Koreksi Views
  const viewsForm = useForm({
    tiktok_views: 0,
    ig_views: 0,
    shopee_views: 0,
  });

  const handleSyncSingleRow = (report: ContentReportItem) => {
    if (syncingRowId !== null) return;
    setSyncingRowId(report.id);
    router.post(`/content-reports/${report.id}/sync-views`, {}, {
      preserveScroll: true,
      onFinish: () => setSyncingRowId(null),
    });
  };

  const handleOpenViewsModal = (report: ContentReportItem) => {
    setViewsModalReport(report);
    viewsForm.setData({
      tiktok_views: report.tiktok_views || 0,
      ig_views: report.ig_views || 0,
      shopee_views: report.shopee_views || 0,
    });
  };

  const handleSubmitViewsModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewsModalReport) return;
    viewsForm.post(`/content-reports/${viewsModalReport.id}/update-views`, {
      preserveScroll: true,
      onSuccess: () => {
        setViewsModalReport(null);
        viewsForm.reset();
      },
    });
  };

  const handleOpenCreateModal = () => {
    createForm.setData({
      title: '',
      reported_date: getTodayDateString(),
      reported_time: getCurrentTimeString(),
      ig_link: '',
      tiktok_link: '',
      shopee_link: '',
      notes: '',
    });
    createForm.clearErrors();
    setShowCreateModal(true);
  };

  const handleOpenEdit = (item: ContentReportItem) => {
    setEditingReport(item);
    let dateStr = getTodayDateString();
    let timeStr = getCurrentTimeString();
    if (item.reported_at) {
      const d = new Date(item.reported_at);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
        timeStr = `${hours}:${minutes}`;
      }
    }
    editForm.setData({
      title: item.title,
      reported_date: dateStr,
      reported_time: timeStr,
      ig_link: item.ig_link || '',
      tiktok_link: item.tiktok_link || '',
      shopee_link: item.shopee_link || '',
      notes: item.notes || '',
    });
    editForm.clearErrors();
  };

  const handleUpdateReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport) return;
    editForm.put(`/content-reports/${editingReport.id}`, {
      onSuccess: () => {
        setEditingReport(null);
        editForm.reset();
      },
    });
  };

  // Auto-buka modal jika diakses dari tombol navigasi cepat ?create=1
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('create') === '1') {
        handleOpenCreateModal();
      }
    } catch {
      // Abaikan jika URLSearchParams tidak tersedia
    }
  }, []);

  const handlePasteToField = async (
    field: 'ig_link' | 'tiktok_link' | 'shopee_link',
    targetForm: 'create' | 'edit' = 'create'
  ) => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('http')) {
          if (targetForm === 'create') {
            createForm.setData(field, text.trim());
          } else {
            editForm.setData(field, text.trim());
          }
        }
      }
    } catch {
      // Abaikan jika izin clipboard ditolak browser
    }
  };

  const handleApplyFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    router.get(
      '/content-reports',
      {
        search: search.trim() || undefined,
        content_type: contentTypeFilter || undefined,
        user_id: creatorFilter || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      },
      { preserveState: true, replace: true }
    );
  };

  const handleResetFilter = () => {
    setSearch('');
    setContentTypeFilter('');
    setCreatorFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    router.get('/content-reports', {}, { preserveState: true, replace: true });
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    createForm.post('/content-reports', {
      onSuccess: () => {
        setShowCreateModal(false);
        createForm.reset();
      },
    });
  };

  const handleOpenReview = (report: ContentReportItem) => {
    setReviewingReport(report);
    reviewForm.setData('feedback', report.feedback || '');
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingReport) return;
    reviewForm.post(`/content-reports/${reviewingReport.id}/review`, {
      onSuccess: () => {
        setReviewingReport(null);
        reviewForm.reset();
      },
    });
  };

  const [isSyncingViews, setIsSyncingViews] = useState(false);

  const handleSyncViewsNow = () => {
    if (isSyncingViews) return;
    setIsSyncingViews(true);
    router.post('/content-reports/sync-views', {}, {
      preserveScroll: true,
      onFinish: () => setIsSyncingViews(false),
    });
  };

  const formatViewsCount = (num?: number) => {
    if (!num || num <= 0) return '0';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return num.toLocaleString('id-ID');
  };

  const handleDeleteReport = (id: number, title: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus laporan "${title}"?`)) {
      router.delete(`/content-reports/${id}`);
    }
  };

  const formatReportTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB';
    } catch {
      return dateStr;
    }
  };

  return (
    <AppLayout title="Report Harian Konten">
      <Head title="Report Harian Konten — Tim Kreatif" />

      <div className="space-y-6">
        {/* HEADER BAR (Biru Navy #0B132B ke #1E3A8A) */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white border border-white/20 shadow-inner">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  Report Harian Konten
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 bg-white/15 px-2 py-0.5 rounded-md border border-white/20">
                  Tim Kreatif
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5">
                Laporan unggahan video Instagram, TikTok, dan Shopee Video tim kreatif.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto">
            {capabilities.can_review && (
              <button
                type="button"
                disabled={isSyncingViews}
                onClick={handleSyncViewsNow}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-2.5 text-xs font-semibold text-white active:scale-98 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Tarik views video sekarang (Sistem juga otomatis sinkron tiap jam 12 malam)"
              >
                <svg className={`w-3.5 h-3.5 ${isSyncingViews ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span>{isSyncingViews ? 'Menyinkronkan...' : '🔄 Sync Views'}</span>
              </button>
            )}

            {capabilities.can_create && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#0B132B] hover:bg-blue-50 active:scale-98 shadow-sm transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-[#0B132B]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>+ Upload / Setor Konten</span>
              </button>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS / STATUS HARI INI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Status Laporan Hari Ini */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Setoran Hari Ini
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.today_total}
              </span>
              <span className="text-[11px] text-slate-400">konten diunggah</span>
            </div>
            <div className="mt-2 text-xs flex items-center justify-between">
              <span className="text-slate-500 text-[11px]">
                Bulan Ini: <strong className="text-slate-800">{stats.this_month_total}</strong> ({formatViewsCount(stats.this_month_views)} views)
              </span>
              <span className="text-emerald-700 font-semibold text-[10px] flex items-center gap-1">
                ⏱️ 00:00 WIB
              </span>
            </div>
          </div>

          {/* Card 2: Konten Instagram */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B132B]">
                📸 Konten Instagram
              </span>
              <span className="text-[10px] bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full font-bold border border-pink-200">
                Reels & Story
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.today_ig ?? stats.today_santai ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">video hari ini</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Video promosi, tren & story Instagram.
            </p>
          </div>

          {/* Card 3: Konten TikTok */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B132B]">
                🎵 Konten TikTok
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-900 px-2 py-0.5 rounded-full font-bold border border-slate-300">
                FYP & Tren
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.today_tiktok ?? stats.today_santai ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">video hari ini</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Video sound tren, gaya hidup & FYP TikTok.
            </p>
          </div>

          {/* Card 4: Shopee Video */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B132B]">
                🛒 Shopee Video
              </span>
              <span className="text-[10px] bg-blue-50 text-[#0B132B] px-2 py-0.5 rounded-full font-bold border border-blue-200">
                Keranjang Kuning
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.today_shopee ?? stats.today_produk ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">video hari ini</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Review sepatu & keranjang kuning Shopee.
            </p>
          </div>
        </div>

        {/* PENGINGAT SPESIFIK UNTUK ROLE KREATIF (Harmonisasi Biru Navy) */}
        {capabilities.is_kreatif && (
          <div
            className={`rounded-2xl border p-4 text-xs transition-all shadow-2xs ${
              stats.my_today_has_ig && stats.my_today_has_tiktok && stats.my_today_has_shopee
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-gradient-to-r from-blue-50/90 via-slate-50 to-blue-50/60 border-blue-200 text-[#0B132B]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B132B] to-[#1E3A8A] text-white shrink-0 shadow-2xs font-bold text-xs">
                  {stats.my_today_has_ig && stats.my_today_has_tiktok && stats.my_today_has_shopee ? '✓' : '📢'}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">
                    {stats.my_today_has_ig && stats.my_today_has_tiktok && stats.my_today_has_shopee
                      ? 'Luar biasa! Target upload ketiga channel hari ini lengkap.'
                      : 'Status Upload Konten Hari Ini:'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mt-1 text-slate-600">
                    <span>
                      📸 Instagram:{' '}
                      <strong className={stats.my_today_has_ig ? 'text-emerald-700 font-bold' : 'text-[#0B132B] font-bold'}>
                        {stats.my_today_has_ig ? '✓ Sudah Disetor' : 'Belum Disetor'}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      🎵 TikTok:{' '}
                      <strong className={stats.my_today_has_tiktok ? 'text-emerald-700 font-bold' : 'text-[#0B132B] font-bold'}>
                        {stats.my_today_has_tiktok ? '✓ Sudah Disetor' : 'Belum Disetor'}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      🛒 Shopee Video:{' '}
                      <strong className={stats.my_today_has_shopee ? 'text-emerald-700 font-bold' : 'text-[#0B132B] font-bold'}>
                        {stats.my_today_has_shopee ? '✓ Sudah Disetor' : 'Belum Disetor'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
              {(!stats.my_today_has_ig || !stats.my_today_has_tiktok || !stats.my_today_has_shopee) && (
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="rounded-xl bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:opacity-95 active:scale-98 shadow-xs transition-all self-start sm:self-auto cursor-pointer"
                >
                  Setor Sekarang →
                </button>
              )}
            </div>
          </div>
        )}

        {/* FILTER BAR */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
          <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Cari Judul / Catatan
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ketik judul konten / sepatu / creator..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B]"
              />
            </div>

            {/* Tipe / Channel Konten */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Channel Konten
              </label>
              <select
                value={contentTypeFilter}
                onChange={(e) => setContentTypeFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B]"
              >
                <option value="">Semua Channel</option>
                <option value="santai">📸 🎵 Instagram & TikTok</option>
                <option value="produk">🛒 Shopee Video</option>
                <option value="semua">🌐 Semua Platform</option>
              </select>
            </div>

            {/* Creator (Untuk PIC / Direktur / Superadmin) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Staf Kreatif
              </label>
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B]"
              >
                <option value="">Semua Staf</option>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Review */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Status Review
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B]"
              >
                <option value="">Semua Status</option>
                <option value="submitted">Terkirim (Belum Dicek)</option>
                <option value="reviewed">✓ Sudah Ditinjau PIC</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="flex-1 rounded-xl bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:opacity-95 active:scale-98 transition-all cursor-pointer shadow-xs"
              >
                Filter
              </button>
              <button
                type="button"
                onClick={handleResetFilter}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Reset Filter"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* MOBILE VIEW: FEED CARDS INTERAKTIF (< md) */}
        <div className="block md:hidden space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Daftar Laporan ({reports.total})
            </span>
            <span className="text-[11px] text-slate-400">Sentuh link untuk buka video</span>
          </div>

          {reports.data.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
              Belum ada laporan konten yang sesuai dengan filter.
            </div>
          ) : (
            reports.data.map((item) => (
              <div
                key={`mobile-${item.id}`}
                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3 transition-all"
              >
                {/* Header Card: Status & Category Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.ig_link && (
                      <span className="inline-flex items-center rounded-md bg-pink-50 text-pink-700 border border-pink-200 px-1.5 py-0.5 text-[9px] font-bold">
                        📸 Instagram
                      </span>
                    )}
                    {item.tiktok_link && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-900 border border-slate-300 px-1.5 py-0.5 text-[9px] font-bold">
                        🎵 TikTok
                      </span>
                    )}
                    {item.shopee_link && (
                      <span className="inline-flex items-center rounded-md bg-blue-50 text-[#0B132B] border border-blue-200 px-1.5 py-0.5 text-[9px] font-bold">
                        🛒 Shopee
                      </span>
                    )}
                  </div>

                  {item.status === 'reviewed' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold shrink-0">
                      ✓ Ditinjau
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-medium shrink-0">
                      Menunggu Review
                    </span>
                  )}
                </div>

                {/* Judul Konten & User */}
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                    <span className="font-semibold text-slate-700">{item.user?.name || 'Kreatif'}</span>
                    <span>•</span>
                    <span>{formatReportTime(item.reported_at)}</span>
                    {item.total_views && item.total_views > 0 ? (
                      <>
                        <span>•</span>
                        <span className="font-extrabold text-[#0B132B] bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                          {item.total_views.toLocaleString('id-ID')} views
                        </span>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={syncingRowId === item.id}
                      onClick={() => handleSyncSingleRow(item)}
                      className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded font-semibold cursor-pointer"
                      title="Cek Views Sekarang"
                    >
                      {syncingRowId === item.id ? 'Cek...' : '🔄 Cek'}
                    </button>
                    {(capabilities.can_create || capabilities.can_review) && (
                      <button
                        type="button"
                        onClick={() => handleOpenViewsModal(item)}
                        className="text-[10px] text-slate-500 hover:text-blue-600 cursor-pointer p-0.5"
                        title="Koreksi Views Manual"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>

                {/* Catatan jika ada */}
                {item.notes && (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 italic">
                    &quot;{item.notes}&quot;
                  </div>
                )}

                {/* Feedback Reviewer jika ada */}
                {item.feedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                    <span className="font-bold">Feedback {item.reviewer?.name || 'PIC'}:</span> &quot;{item.feedback}&quot;
                  </div>
                )}

                {/* Touch-Friendly Link Buttons (Grid 3 Kolom) */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                  {item.ig_link ? (
                    <a
                      href={item.ig_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-center transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-bold flex items-center gap-0.5">
                        📸 IG <span className="text-[10px]">↗</span>
                      </span>
                      <span className="text-[9px] text-pink-600 font-medium truncate w-full">Buka Post</span>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-slate-50 text-slate-300 border border-slate-100 text-center">
                      <span className="text-xs font-medium">📸 IG</span>
                      <span className="text-[9px] text-slate-300 font-mono">-</span>
                    </div>
                  )}

                  {item.tiktok_link ? (
                    <a
                      href={item.tiktok_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-center transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-bold flex items-center gap-0.5">
                        🎵 TikTok <span className="text-[10px]">↗</span>
                      </span>
                      <span className="text-[9px] text-slate-300 font-medium truncate w-full">Buka Video</span>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-slate-50 text-slate-300 border border-slate-100 text-center">
                      <span className="text-xs font-medium">🎵 TikTok</span>
                      <span className="text-[9px] text-slate-300 font-mono">-</span>
                    </div>
                  )}

                  {item.shopee_link ? (
                    <a
                      href={item.shopee_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#EE4D2D] border border-orange-200 text-center transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-bold flex items-center gap-0.5">
                        🛒 Shopee <span className="text-[10px]">↗</span>
                      </span>
                      <span className="text-[9px] text-orange-600 font-medium truncate w-full">Lihat Video</span>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-slate-50 text-slate-300 border border-slate-100 text-center">
                      <span className="text-xs font-medium">🛒 Shopee</span>
                      <span className="text-[9px] text-slate-300 font-mono">-</span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions di Mobile Card */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  {capabilities.can_review && (
                    <button
                      type="button"
                      onClick={() => handleOpenReview(item)}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      Review
                    </button>
                  )}
                  {(capabilities.can_create || capabilities.can_review) && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                    >
                      ✏️ <span>Edit</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteReport(item.id, item.title)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Pagination Mobile */}
          {reports.total > reports.per_page && (
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col gap-2 text-xs text-slate-600">
              <div className="text-center font-medium">
                Halaman {reports.current_page} dari {reports.last_page} ({reports.total} laporan)
              </div>
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {reports.links.map((link, idx) => (
                  <button
                    key={`m-link-${idx}`}
                    disabled={!link.url}
                    onClick={() => link.url && router.get(link.url)}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      link.active
                        ? 'bg-[#0B132B] text-white border-[#0B132B]'
                        : link.url
                        ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* DESKTOP VIEW: TABEL DAFTAR REPORT KONTEN (>= md) */}
        <div className="hidden md:block rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4 min-w-[140px]">Waktu Setor</th>
                  <th className="py-3 px-4 min-w-[130px]">Staf Kreatif</th>
                  <th className="py-3 px-4 min-w-[200px]">Topik & Judul Konten</th>
                  <th className="py-3 px-4 min-w-[200px]">Link Channel Video</th>
                  <th className="py-3 px-4 min-w-[150px]">Tayangan (Views)</th>
                  <th className="py-3 px-4 min-w-[140px]">Status & Review</th>
                  <th className="py-3 px-4 text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                      Belum ada laporan konten yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  reports.data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Waktu Setor */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {formatReportTime(item.reported_at)}
                        </div>
                        <span className="text-[10px] text-slate-400">Waktu Tayang</span>
                      </td>

                      {/* Staf Kreatif */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {item.user?.name || 'Kreatif'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.user?.email || '-'}
                        </div>
                      </td>

                      {/* Kategori & Judul */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {item.ig_link && (
                            <span className="inline-flex items-center rounded-md bg-pink-50 text-pink-700 border border-pink-200 px-1.5 py-0.5 text-[9px] font-bold">
                              📸 Instagram
                            </span>
                          )}
                          {item.tiktok_link && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-900 border border-slate-300 px-1.5 py-0.5 text-[9px] font-bold">
                              🎵 TikTok
                            </span>
                          )}
                          {item.shopee_link && (
                            <span className="inline-flex items-center rounded-md bg-blue-50 text-[#0B132B] border border-blue-200 px-1.5 py-0.5 text-[9px] font-bold">
                              🛒 Shopee
                            </span>
                          )}
                        </div>
                        <div className="font-extrabold text-slate-900 text-xs">
                          {item.title}
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-slate-500 italic mt-0.5 line-clamp-1">
                            &quot;{item.notes}&quot;
                          </p>
                        )}
                      </td>

                      {/* Link Channel Video */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* IG Link */}
                          {item.ig_link ? (
                            <a
                              href={item.ig_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-pink-200 bg-pink-50 hover:bg-pink-100 text-pink-700 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                              title="Buka Instagram"
                            >
                              <span>📸 Instagram</span>
                              <span className="text-[10px]">↗</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-mono">IG: -</span>
                          )}

                          {/* TikTok Link */}
                          {item.tiktok_link ? (
                            <a
                              href={item.tiktok_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                              title="Buka TikTok"
                            >
                              <span>🎵 TikTok</span>
                              <span className="text-[10px]">↗</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-mono">TikTok: -</span>
                          )}

                          {/* Shopee Video Link */}
                          {item.shopee_link ? (
                            <a
                              href={item.shopee_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                              title="Buka Shopee Video"
                            >
                              <span>🛒 Shopee Video</span>
                              <span className="text-[10px]">↗</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-mono">Shopee: -</span>
                          )}
                        </div>
                      </td>

                      {/* Tayangan (Views) */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-xs text-slate-900">
                              {item.total_views && item.total_views > 0
                                ? `${item.total_views.toLocaleString('id-ID')} views`
                                : '0 views'}
                            </span>
                            {item.total_views && item.total_views >= 10000 ? (
                              <span className="inline-flex items-center rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 text-[9px] font-bold">
                                🔥 Viral
                              </span>
                            ) : null}

                            {/* Tombol Tarik/Cek Views Langsung untuk baris ini */}
                            <button
                              type="button"
                              disabled={syncingRowId === item.id}
                              onClick={() => handleSyncSingleRow(item)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer disabled:opacity-50"
                              title="Tarik & Cek Views Link Ini Sekarang"
                            >
                              <svg className={`w-3 h-3 ${syncingRowId === item.id ? 'animate-spin text-blue-600' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              <span>{syncingRowId === item.id ? 'Cek...' : 'Cek'}</span>
                            </button>

                            {/* Tombol Koreksi / Input Views Manual */}
                            {(capabilities.can_create || capabilities.can_review) && (
                              <button
                                type="button"
                                onClick={() => handleOpenViewsModal(item)}
                                className="text-[10px] p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                title="Koreksi / Isi Views Manual"
                              >
                                ✏️
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                            {item.tiktok_views ? (
                              <span className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                                🎵 {formatViewsCount(item.tiktok_views)}
                              </span>
                            ) : null}
                            {item.ig_views ? (
                              <span className="inline-flex items-center gap-0.5 bg-pink-50 text-pink-700 px-1.5 py-0.2 rounded font-medium">
                                📸 {formatViewsCount(item.ig_views)}
                              </span>
                            ) : null}
                            {item.shopee_views ? (
                              <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-800 px-1.5 py-0.2 rounded font-medium">
                                🛒 {formatViewsCount(item.shopee_views)}
                              </span>
                            ) : null}
                            {(!item.total_views || item.total_views === 0) && (
                              <span className="text-slate-400 text-[10px] italic">Audit lanjut 00:00 WIB</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status & Review */}
                      <td className="py-3 px-4">
                        {item.status === 'reviewed' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                              ✓ Ditinjau: {item.reviewer?.name || 'PIC/Direktur'}
                            </span>
                            {item.feedback && (
                              <p className="text-[11px] text-slate-600 mt-0.5 italic">
                                &quot;{item.feedback}&quot;
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-medium">
                            Menunggu Review
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Tombol Review PIC */}
                          {capabilities.can_review && (
                            <button
                              type="button"
                              onClick={() => handleOpenReview(item)}
                              className="rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Beri Catatan / Review"
                            >
                              Review
                            </button>
                          )}

                          {/* Tombol Edit Laporan */}
                          {(capabilities.can_create || capabilities.can_review) && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-100 hover:text-[#0B132B] text-slate-600 px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Edit Laporan / Waktu"
                            >
                              Edit
                            </button>
                          )}

                          {/* Tombol Hapus */}
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(item.id, item.title)}
                            className="rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-400 p-1 transition-colors cursor-pointer"
                            title="Hapus Laporan"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {reports.total > reports.per_page && (
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Menampilkan{' '}
                <strong className="text-slate-900 font-bold">
                  {(reports.current_page - 1) * reports.per_page + 1}
                </strong>{' '}
                -{' '}
                <strong className="text-slate-900 font-bold">
                  {Math.min(reports.current_page * reports.per_page, reports.total)}
                </strong>{' '}
                dari <strong className="text-slate-900 font-bold">{reports.total}</strong> laporan
              </div>
              <div className="flex items-center gap-1">
                {reports.links.map((link, idx) => (
                  <button
                    key={idx}
                    disabled={!link.url}
                    onClick={() => link.url && router.get(link.url)}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      link.active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : link.url
                        ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL INPUT / SETOR LAPORAN KONTEN BARU */}
      <Modal
        show={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Upload / Setor Report Konten Harian"
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmitReport} className="space-y-4">
          {/* 1. Waktu & Jam Tayang Konten (Paling Atas - Default Hari Ini & Jam Sekarang, Bisa Diedit) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B132B] to-[#1E3A8A] text-white text-xs shadow-2xs">
                  ⏱️
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-900 block">
                    Waktu & Jam Tayang Konten
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Tercatat otomatis hari ini & jam sekarang (dapat Anda sesuaikan).
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  createForm.setData((prev) => ({
                    ...prev,
                    reported_date: getTodayDateString(),
                    reported_time: getCurrentTimeString(),
                  }));
                }}
                className="text-[10px] font-bold text-[#0B132B] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Set waktu ke menit saat ini"
              >
                ⚡ Jam Sekarang
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Tanggal Upload:
                </label>
                <input
                  type="date"
                  required
                  value={createForm.data.reported_date}
                  onChange={(e) => createForm.setData('reported_date', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs cursor-pointer"
                />
                {createForm.errors.reported_date && (
                  <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.reported_date}</p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Jam / Menit Tayang:
                </label>
                <input
                  type="time"
                  required
                  value={createForm.data.reported_time}
                  onChange={(e) => createForm.setData('reported_time', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs cursor-pointer"
                />
                {createForm.errors.reported_time && (
                  <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.reported_time}</p>
                )}
              </div>
            </div>
          </div>

          {/* 2. Judul / Topik Konten */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Judul / Topik Konten & Sepatu: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={createForm.data.title}
              onChange={(e) => createForm.setData('title', e.target.value)}
              placeholder="Contoh: Review Blanco Hitam 39 / OOTD Sekolah Kylie / Dance Tren"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
            />
            {createForm.errors.title && (
              <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.title}</p>
            )}
          </div>

          {/* 3. Input Link Tautan */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Masukkan Tautan Video yang Diunggah:
              </label>
              <span className="text-[11px] text-slate-400">
                (Isi minimal salah satu tautan)
              </span>
            </div>

            {/* Instagram Link */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                  <span>📸 Link Instagram (Reels / Feed / Story):</span>
                </label>
                <button
                  type="button"
                  onClick={() => handlePasteToField('ig_link', 'create')}
                  className="text-[10px] font-bold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  📋 Tempel
                </button>
              </div>
              <input
                type="url"
                value={createForm.data.ig_link}
                onChange={(e) => createForm.setData('ig_link', e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
              />
              {createForm.errors.ig_link && (
                <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.ig_link}</p>
              )}
            </div>

            {/* TikTok Link */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                  <span>🎵 Link TikTok Video:</span>
                </label>
                <button
                  type="button"
                  onClick={() => handlePasteToField('tiktok_link', 'create')}
                  className="text-[10px] font-bold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  📋 Tempel
                </button>
              </div>
              <input
                type="url"
                value={createForm.data.tiktok_link}
                onChange={(e) => createForm.setData('tiktok_link', e.target.value)}
                placeholder="https://vt.tiktok.com/... atau https://www.tiktok.com/@..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
              />
              {createForm.errors.tiktok_link && (
                <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.tiktok_link}</p>
              )}
            </div>

            {/* Shopee Video Link */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                  <span>🛒 Link Shopee Video:</span>
                </label>
                <button
                  type="button"
                  onClick={() => handlePasteToField('shopee_link', 'create')}
                  className="text-[10px] font-bold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  📋 Tempel
                </button>
              </div>
              <input
                type="url"
                value={createForm.data.shopee_link}
                onChange={(e) => createForm.setData('shopee_link', e.target.value)}
                placeholder="https://id.shp.ee/v/... atau link video Shopee"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
              />
              {createForm.errors.shopee_link && (
                <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.shopee_link}</p>
              )}
            </div>
          </div>

          {/* Catatan Tambahan (Opsional) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Catatan Tambahan (Opsional):
            </label>
            <textarea
              rows={2}
              value={createForm.data.notes}
              onChange={(e) => createForm.setData('notes', e.target.value)}
              placeholder="Contoh: Menggunakan hashtag kampanye sekolah, keranjang kuning tertaut ke artikel Kylie Hitam 38."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B]"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <span className="text-[10px] text-slate-400 italic">
              ⚡ Link langsung diaudit saat disimpan & diperbarui berkala jam 00:00 WIB.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={createForm.processing}
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-center"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createForm.processing}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] px-5 py-2.5 text-xs font-bold text-white hover:opacity-95 active:scale-98 disabled:opacity-50 shadow-xs transition-all cursor-pointer text-center"
              >
                {createForm.processing ? 'Menyimpan & Audit Link...' : 'Kirim Report Konten'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL EDIT LAPORAN KONTEN */}
      <Modal
        show={Boolean(editingReport)}
        onClose={() => setEditingReport(null)}
        title="Edit Laporan Konten Harian"
        maxWidth="2xl"
      >
        {editingReport && (
          <form onSubmit={handleUpdateReport} className="space-y-4">
            {/* Waktu & Jam Tayang Konten (Paling Atas) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B132B] to-[#1E3A8A] text-white text-xs shadow-2xs">
                    ⏱️
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">
                      Waktu & Jam Tayang Konten
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Sesuaikan tanggal dan jam unggah konten ini jika diperlukan.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    editForm.setData((prev) => ({
                      ...prev,
                      reported_date: getTodayDateString(),
                      reported_time: getCurrentTimeString(),
                    }));
                  }}
                  className="text-[10px] font-bold text-[#0B132B] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Set ke waktu sekarang"
                >
                  ⚡ Set Jam Sekarang
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Tanggal Upload:
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.data.reported_date}
                    onChange={(e) => editForm.setData('reported_date', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs cursor-pointer"
                  />
                  {editForm.errors.reported_date && (
                    <p className="text-[11px] text-rose-600 mt-1">{editForm.errors.reported_date}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Jam / Menit Tayang:
                  </label>
                  <input
                    type="time"
                    required
                    value={editForm.data.reported_time}
                    onChange={(e) => editForm.setData('reported_time', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs cursor-pointer"
                  />
                  {editForm.errors.reported_time && (
                    <p className="text-[11px] text-rose-600 mt-1">{editForm.errors.reported_time}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Judul / Topik Konten */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Judul / Topik Konten & Sepatu: <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editForm.data.title}
                onChange={(e) => editForm.setData('title', e.target.value)}
                placeholder="Contoh: Review Blanco Hitam 39 / OOTD Sekolah Kylie / Dance Tren"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
              />
              {editForm.errors.title && (
                <p className="text-[11px] text-rose-600 mt-1">{editForm.errors.title}</p>
              )}
            </div>

            {/* Input Link Tautan */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Tautan Video yang Diunggah:
                </label>
                <span className="text-[11px] text-slate-400">
                  (Minimal salah satu tautan)
                </span>
              </div>

              {/* Instagram Link */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>📸 Link Instagram (Reels / Feed / Story):</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handlePasteToField('ig_link', 'edit')}
                    className="text-[10px] font-bold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  >
                    📋 Tempel
                  </button>
                </div>
                <input
                  type="url"
                  value={editForm.data.ig_link}
                  onChange={(e) => editForm.setData('ig_link', e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
                />
                {editForm.errors.ig_link && (
                  <p className="text-[11px] text-rose-600 mt-1">{editForm.errors.ig_link}</p>
                )}
              </div>

              {/* TikTok Link */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>🎵 Link TikTok Video:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handlePasteToField('tiktok_link', 'edit')}
                    className="text-[10px] font-bold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  >
                    📋 Tempel
                  </button>
                </div>
                <input
                  type="url"
                  value={editForm.data.tiktok_link}
                  onChange={(e) => editForm.setData('tiktok_link', e.target.value)}
                  placeholder="https://vt.tiktok.com/... atau https://www.tiktok.com/@..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
                />
                {editForm.errors.tiktok_link && (
                  <p className="text-[11px] text-rose-600 mt-1">{editForm.errors.tiktok_link}</p>
                )}
              </div>

              {/* Shopee Video Link */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>🛒 Link Shopee Video:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handlePasteToField('shopee_link', 'edit')}
                    className="text-[10px] font-bold text-[#0B132B] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  >
                    📋 Tempel
                  </button>
                </div>
                <input
                  type="url"
                  value={editForm.data.shopee_link}
                  onChange={(e) => editForm.setData('shopee_link', e.target.value)}
                  placeholder="https://id.shp.ee/v/... atau link video Shopee"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B] shadow-2xs"
                />
                {editForm.errors.shopee_link && (
                  <p className="text-[11px] text-rose-600 mt-1">{editForm.errors.shopee_link}</p>
                )}
              </div>
            </div>

            {/* Catatan Tambahan (Opsional) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Catatan Tambahan (Opsional):
              </label>
              <textarea
                rows={2}
                value={editForm.data.notes}
                onChange={(e) => editForm.setData('notes', e.target.value)}
                placeholder="Contoh: Menggunakan hashtag kampanye sekolah, keranjang kuning tertaut ke artikel Kylie Hitam 38."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B132B] focus:ring-1 focus:ring-[#0B132B]"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={editForm.processing}
                onClick={() => setEditingReport(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-center"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={editForm.processing}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] px-5 py-2.5 text-xs font-bold text-white hover:opacity-95 active:scale-98 disabled:opacity-50 shadow-xs transition-all cursor-pointer text-center"
              >
                {editForm.processing ? 'Menyimpan & Re-Audit...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL REVIEW PIC / DIREKTUR / MANAGEMENT */}
      <Modal
        show={Boolean(reviewingReport)}
        onClose={() => setReviewingReport(null)}
        title="Review & Verifikasi Laporan Konten"
        maxWidth="lg"
      >
        {reviewingReport && (
          <form onSubmit={handleSubmitReview} className="space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
              <div className="font-bold text-slate-900 text-sm">
                {reviewingReport.title}
              </div>
              <div className="text-slate-600">
                Oleh: <strong>{reviewingReport.user?.name}</strong> •{' '}
                {formatReportTime(reviewingReport.reported_at)}
              </div>
              <div className="flex items-center gap-2 pt-1">
                {reviewingReport.ig_link && (
                  <a
                    href={reviewingReport.ig_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-pink-700 font-bold underline"
                  >
                    Buka IG ↗
                  </a>
                )}
                {reviewingReport.tiktok_link && (
                  <a
                    href={reviewingReport.tiktok_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-900 font-bold underline"
                  >
                    Buka TikTok ↗
                  </a>
                )}
                {reviewingReport.shopee_link && (
                  <a
                    href={reviewingReport.shopee_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-700 font-bold underline"
                  >
                    Buka Shopee ↗
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Catatan / Feedback untuk Tim Kreatif (Opsional):
              </label>
              <textarea
                rows={3}
                value={reviewForm.data.feedback}
                onChange={(e) => reviewForm.setData('feedback', e.target.value)}
                placeholder="Contoh: Konten bagus, views stabil. Tingkatkan durasi hook di awal video."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={reviewForm.processing}
                onClick={() => setReviewingReport(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={reviewForm.processing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
              >
                {reviewForm.processing ? 'Menyimpan...' : '✓ Tandai Sudah Ditinjau'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL KOREKSI / UPDATE TAYANGAN (VIEWS) */}
      <Modal
        show={Boolean(viewsModalReport)}
        onClose={() => setViewsModalReport(null)}
        title="Perbarui / Koreksi Tayangan (Views)"
        maxWidth="md"
      >
        {viewsModalReport && (
          <form onSubmit={handleSubmitViewsModal} className="space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
              <div className="font-bold text-slate-900 text-sm">
                {viewsModalReport.title}
              </div>
              <div className="text-slate-600">
                Oleh: <strong>{viewsModalReport.user?.name}</strong> •{' '}
                {formatReportTime(viewsModalReport.reported_at)}
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Gunakan tombol <strong>Cek</strong> di tabel untuk auto-sync instan. Jika platform membatasi akses publik atau ingin koreksi manual, masukkan angka di bawah:
              </p>
            </div>

            <div className="space-y-3">
              {viewsModalReport.tiktok_link && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    🎵 Tayangan TikTok:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={viewsForm.data.tiktok_views}
                    onChange={(e) => viewsForm.setData('tiktok_views', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  />
                </div>
              )}

              {viewsModalReport.ig_link && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    📸 Tayangan Instagram:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={viewsForm.data.ig_views}
                    onChange={(e) => viewsForm.setData('ig_views', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  />
                </div>
              )}

              {viewsModalReport.shopee_link && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    🛒 Tayangan Shopee Video:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={viewsForm.data.shopee_views}
                    onChange={(e) => viewsForm.setData('shopee_views', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  />
                </div>
              )}

              <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-2.5 text-xs flex items-center justify-between">
                <span className="font-semibold text-slate-700">Estimasi Total Tayangan:</span>
                <span className="font-extrabold text-[#0B132B] text-sm">
                  {((viewsForm.data.tiktok_views || 0) + (viewsForm.data.ig_views || 0) + (viewsForm.data.shopee_views || 0)).toLocaleString('id-ID')} views
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={viewsForm.processing}
                onClick={() => setViewsModalReport(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={viewsForm.processing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B132B] px-5 py-2 text-xs font-bold text-white hover:bg-blue-900 shadow-xs transition-colors cursor-pointer"
              >
                {viewsForm.processing ? 'Menyimpan...' : 'Simpan Tayangan'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppLayout>
  );
}
