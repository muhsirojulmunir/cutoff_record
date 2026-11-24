import React, { useState } from 'react';
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
  today_santai: number;
  today_produk: number;
  today_semua: number;
  this_month_total: number;
  my_today_count: number;
  my_today_has_santai: boolean;
  my_today_has_produk: boolean;
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

export default function ContentReportsIndex({
  reports,
  filters,
  stats,
  creators,
  capabilities,
}: Props) {
  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reviewingReport, setReviewingReport] = useState<ContentReportItem | null>(null);

  // Filter Form State
  const [search, setSearch] = useState(filters.search || '');
  const [contentTypeFilter, setContentTypeFilter] = useState(filters.content_type || '');
  const [creatorFilter, setCreatorFilter] = useState(filters.user_id ? String(filters.user_id) : '');
  const [statusFilter, setStatusFilter] = useState(filters.status || '');
  const [dateFrom, setDateFrom] = useState(filters.date_from || '');
  const [dateTo, setDateTo] = useState(filters.date_to || '');

  // Form Input Report Baru
  const createForm = useForm({
    content_type: 'santai' as 'santai' | 'produk' | 'semua',
    title: '',
    ig_link: '',
    tiktok_link: '',
    shopee_link: '',
    notes: '',
  });

  // Form Review PIC / Management
  const reviewForm = useForm({
    feedback: '',
  });

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
        {/* HEADER BAR */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
              </span>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Report Harian Konten
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Laporan unggahan video Instagram, TikTok, dan Shopee Video tim kreatif.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {capabilities.can_create && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 active:scale-98 shadow-sm transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>+ Upload / Setor Laporan Konten</span>
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
            <div className="mt-2 text-xs flex items-center gap-1.5">
              {stats.today_total > 0 ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  ✓ Sudah ada laporan hari ini
                </span>
              ) : (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  ⚠️ Belum ada laporan hari ini
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Konten Santai (IG & TikTok) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                ☕ Konten Santai
              </span>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200">
                IG & TikTok
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.today_santai}
              </span>
              <span className="text-[11px] text-slate-400">hari ini</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Format hiburan, tren, gaya hidup, atau daily update.
            </p>
          </div>

          {/* Card 3: Konten Produk (Shopee Video) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                👟 Konten Produk
              </span>
              <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                Shopee Video
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.today_produk}
              </span>
              <span className="text-[11px] text-slate-400">hari ini</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Review sepatu, detail bahan, ukuran, dan promo toko.
            </p>
          </div>

          {/* Card 4: Total Konten Bulan Ini */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Bulan Ini
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900">
                {stats.this_month_total}
              </span>
              <span className="text-[11px] text-slate-400">konten</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Konsistensi upload konten sosial media & Shopee.
            </p>
          </div>
        </div>

        {/* PENGINGAT SPESIFIK UNTUK ROLE KREATIF */}
        {capabilities.is_kreatif && (
          <div
            className={`rounded-2xl border p-4 text-xs transition-all ${
              stats.my_today_has_santai && stats.my_today_has_produk
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {stats.my_today_has_santai && stats.my_today_has_produk ? '🎉' : '📢'}
                </span>
                <div>
                  <h4 className="font-bold">
                    {stats.my_today_has_santai && stats.my_today_has_produk
                      ? 'Luar biasa! Target laporan konten hari ini lengkap.'
                      : 'Cek Kelengkapan Laporan Konten Hari Ini:'}
                  </h4>
                  <p className="text-[11px] mt-0.5">
                    • Konten Santai (IG & TikTok):{' '}
                    <strong className={stats.my_today_has_santai ? 'text-emerald-700' : 'text-amber-700'}>
                      {stats.my_today_has_santai ? '✓ Sudah Disetor' : 'Belum Disetor'}
                    </strong>
                    {' | '}
                    • Konten Produk (Shopee Video):{' '}
                    <strong className={stats.my_today_has_produk ? 'text-emerald-700' : 'text-amber-700'}>
                      {stats.my_today_has_produk ? '✓ Sudah Disetor' : 'Belum Disetor'}
                    </strong>
                  </p>
                </div>
              </div>
              {(!stats.my_today_has_santai || !stats.my_today_has_produk) && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 self-start sm:self-auto cursor-pointer"
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
              />
            </div>

            {/* Tipe Konten */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Kategori Konten
              </label>
              <select
                value={contentTypeFilter}
                onChange={(e) => setContentTypeFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
              >
                <option value="">Semua Kategori</option>
                <option value="santai">☕ Konten Santai (IG/TikTok)</option>
                <option value="produk">👟 Konten Produk (Shopee)</option>
                <option value="semua">🌐 Semua Channel</option>
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
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
                className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer"
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

        {/* TABEL DAFTAR REPORT KONTEN */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4 min-w-[150px]">Waktu Setor</th>
                  <th className="py-3 px-4 min-w-[140px]">Staf Kreatif</th>
                  <th className="py-3 px-4 min-w-[200px]">Kategori & Judul Konten</th>
                  <th className="py-3 px-4 min-w-[220px]">Link Channel Video</th>
                  <th className="py-3 px-4 min-w-[150px]">Status & Review</th>
                  <th className="py-3 px-4 text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
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
                        <span className="text-[10px] text-slate-400">Otomatis Terkunci</span>
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
                        <div className="flex items-center gap-1.5 mb-1">
                          {item.content_type === 'santai' && (
                            <span className="inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold">
                              ☕ Konten Santai
                            </span>
                          )}
                          {item.content_type === 'produk' && (
                            <span className="inline-flex items-center rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-bold">
                              👟 Konten Produk
                            </span>
                          )}
                          {item.content_type === 'semua' && (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                              🌐 Semua Channel
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
          {/* Pilihan Kategori Konten */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              1. Pilih Kategori Konten:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                  createForm.data.content_type === 'santai'
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950 ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="content_type"
                    value="santai"
                    checked={createForm.data.content_type === 'santai'}
                    onChange={() => createForm.setData('content_type', 'santai')}
                    className="accent-indigo-600 cursor-pointer"
                  />
                  <span className="font-bold text-xs">☕ Konten Santai</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 pl-5">
                  Fokus di Instagram & TikTok (lifestyle/tren)
                </span>
              </label>

              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                  createForm.data.content_type === 'produk'
                    ? 'border-amber-500 bg-amber-50/50 text-amber-950 ring-1 ring-amber-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="content_type"
                    value="produk"
                    checked={createForm.data.content_type === 'produk'}
                    onChange={() => createForm.setData('content_type', 'produk')}
                    className="accent-amber-600 cursor-pointer"
                  />
                  <span className="font-bold text-xs">👟 Konten Produk</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 pl-5">
                  Shopee Video review sepatu & keranjang
                </span>
              </label>

              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                  createForm.data.content_type === 'semua'
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="content_type"
                    value="semua"
                    checked={createForm.data.content_type === 'semua'}
                    onChange={() => createForm.setData('content_type', 'semua')}
                    className="accent-emerald-600 cursor-pointer"
                  />
                  <span className="font-bold text-xs">🌐 Semua Channel</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 pl-5">
                  Post serentak di IG, TikTok & Shopee
                </span>
              </label>
            </div>
          </div>

          {/* Judul / Topik Konten */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              2. Judul / Topik Konten & Sepatu: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={createForm.data.title}
              onChange={(e) => createForm.setData('title', e.target.value)}
              placeholder="Contoh: Review Blanco Hitam 39 / OOTD Sekolah Kylie / Dance Tren"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 shadow-2xs"
            />
            {createForm.errors.title && (
              <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.title}</p>
            )}
          </div>

          {/* Input Link Tautan */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                3. Masukkan Tautan Video yang Diunggah:
              </label>
              <span className="text-[11px] text-slate-400">
                (Isi minimal salah satu tautan)
              </span>
            </div>

            {/* Instagram Link */}
            <div>
              <label className="block text-[11px] font-semibold text-pink-700 mb-1 flex items-center gap-1">
                <span>📸 Link Instagram (Reels / Feed / Story):</span>
                {createForm.data.content_type === 'santai' && (
                  <span className="text-[10px] bg-pink-50 text-pink-700 px-1.5 py-0.2 rounded font-bold">
                    Utama
                  </span>
                )}
              </label>
              <input
                type="url"
                value={createForm.data.ig_link}
                onChange={(e) => createForm.setData('ig_link', e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-pink-600 focus:ring-1 focus:ring-pink-600 shadow-2xs"
              />
              {createForm.errors.ig_link && (
                <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.ig_link}</p>
              )}
            </div>

            {/* TikTok Link */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-900 mb-1 flex items-center gap-1">
                <span>🎵 Link TikTok Video:</span>
                {createForm.data.content_type === 'santai' && (
                  <span className="text-[10px] bg-slate-100 text-slate-900 px-1.5 py-0.2 rounded font-bold">
                    Utama
                  </span>
                )}
              </label>
              <input
                type="url"
                value={createForm.data.tiktok_link}
                onChange={(e) => createForm.setData('tiktok_link', e.target.value)}
                placeholder="https://vt.tiktok.com/... atau https://www.tiktok.com/@..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 shadow-2xs"
              />
              {createForm.errors.tiktok_link && (
                <p className="text-[11px] text-rose-600 mt-1">{createForm.errors.tiktok_link}</p>
              )}
            </div>

            {/* Shopee Video Link */}
            <div>
              <label className="block text-[11px] font-semibold text-orange-700 mb-1 flex items-center gap-1">
                <span>🛒 Link Shopee Video:</span>
                {createForm.data.content_type === 'produk' && (
                  <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded font-bold">
                    Utama Produk
                  </span>
                )}
              </label>
              <input
                type="url"
                value={createForm.data.shopee_link}
                onChange={(e) => createForm.setData('shopee_link', e.target.value)}
                placeholder="https://id.shp.ee/v/... atau link video Shopee"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs"
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
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Info Timestamp Otomatis */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-500 flex items-center justify-between">
            <span>⏱ Waktu Lapor: <strong>{stats.server_time}</strong></span>
            <span className="text-emerald-700 font-semibold">Tercatat Otomatis Realtime</span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={createForm.processing}
              onClick={() => setShowCreateModal(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createForm.processing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
            >
              {createForm.processing ? 'Mengirim Laporan...' : 'Kirim Report Konten'}
            </button>
          </div>
        </form>
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
    </AppLayout>
  );
}
