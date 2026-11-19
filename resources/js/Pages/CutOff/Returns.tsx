import React, { useState, useEffect, useRef } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';
import DualCalendarRangePicker, { formatDateIndo, formatYMD } from '../../Components/DualCalendarRangePicker';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
interface ReturnRow {
  id: number;
  no_urut: number | null;
  marketplace: string | null;
  tgl_input_mp: string | null;
  nama_barang_mp: string | null;
  jml_produk_mp: number | null;
  no_invoice_mp: string | null;
  no_invoice_baru: string | null;
  no_retur: string | null;
  tgl_rj: string | null;
  tgl_terima_brg: string | null;
  nama_barang_fisik: string | null;
  jml_brg_fisik: number | null;
  keterangan: string | null;
  barcode: string | null;
  tgl_banding: string | null;
  no_pengajuan: string | null;
  no_pesanan_baru: string | null;
  due_date?: string | null;
  return_status?: string | null;
  needs_action?: boolean | null;
  refund_amount?: number | null;
  seller_solution?: string | null;
  seller_center_url?: string | null;
}

interface PaginationLinks {
  url: string | null;
  label: string;
  active: boolean;
}

interface Props {
  returns: {
    data: ReturnRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: PaginationLinks[];
  };
  filters: {
    search?: string;
    marketplace?: string;
    needs_action?: string;
    date_from?: string;
    date_to?: string;
    per_page?: string;
  };
  summary: {
    total_retur: number;
    total_shopee: number;
    total_tokopedia: number;
    total_pesanan_baru: number;
    total_needs_action?: number;
    total_lainnya: number;
  };
  disputeTasks?: ReturnRow[];
  marketplaces: { name: string; count: number }[];
  flash?: {
    success?: string;
    error?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const raw = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
    const parts = raw.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const day = parseInt(parts[2], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0];
      return `${day} ${months[monthIdx] || parts[1]} ${year}`;
    }
    return raw;
  } catch {
    return String(dateStr);
  }
}

function cleanVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function excelSerialToDate(serial: number): string {
  const utc = (serial - 25569) * 86400 * 1000;
  const d = new Date(utc);
  return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
}

function parseDateVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v > 40000) return excelSerialToDate(v);
  const s = cleanVal(v);
  if (!s) return '';
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch { /* noop */ }
  return s;
}

function getMarketplaceLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const c = code.toUpperCase();
  if (c === 'SH') return 'Shopee';
  if (c === 'TT') return 'TikTok';
  if (c === 'LZD') return 'Lazada';
  return code;
}

// Badge channel/MP dengan palet terstruktur & solid
function ChannelBadge({ mp }: { mp: string | null }) {
  if (!mp) return <span className="text-slate-400 text-xs">—</span>;
  const code = mp.toUpperCase();
  if (code === 'SH') {
    return (
      <span className="inline-block px-2.5 py-1 rounded-md bg-[#EE4D2D] text-white font-bold text-[10px] tracking-wide mb-1 shadow-xs">
        Shopee
      </span>
    );
  }
  if (code === 'TT') {
    return (
      <span className="inline-block px-2.5 py-1 rounded-md bg-[#000000] text-white font-bold text-[10px] tracking-wide mb-1 border border-slate-700 shadow-xs">
        TikTok
      </span>
    );
  }
  if (code === 'LZD') {
    return (
      <span className="inline-block px-2.5 py-1 rounded-md bg-rose-700 text-white font-bold text-[10px] tracking-wide mb-1 shadow-xs">
        Lazada
      </span>
    );
  }
  return (
    <span className="inline-block px-2.5 py-1 rounded-md bg-[#0B132B] text-white font-bold text-[10px] tracking-wide mb-1 shadow-xs">
      {code}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper Estimasi / Resolusi Batas Waktu Banding
// ---------------------------------------------------------------------------
function resolveDisputeDeadline(row: ReturnRow): string | null {
  if (row.due_date) return row.due_date;

  if (row.tgl_banding) {
    const s = row.tgl_banding.trim();
    const d = new Date(s);
    if (!isNaN(d.getTime())) return s;
  }

  const ket = (row.keterangan || '').toUpperCase();
  const st = (row.return_status || '').toUpperCase();
  const isPending = ket.includes('PROCESSING') || ket.includes('REQUESTED') || st === 'PROCESSING' || st === 'REQUESTED';

  if (isPending && row.tgl_input_mp) {
    try {
      const inputDate = new Date(row.tgl_input_mp);
      if (!isNaN(inputDate.getTime())) {
        // Estimasi respon awal sengketa jika baru diajukan (48 jam)
        const estimated = new Date(inputDate.getTime() + (48 * 3600 * 1000));
        // HANYA gunakan estimasi awal jika waktu tersebut MASIH berjalan di masa depan
        // Jangan pernah menampilkan "Waktu Banding Berakhir" dari estimasi awal jika status di Shopee masih aktif [PROCESSING]!
        if (estimated.getTime() > Date.now()) {
          return estimated.toISOString();
        }
      }
    } catch {
      // noop
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Komponen Countdown Durasi Batas Waktu Adu Banding
// ---------------------------------------------------------------------------
function DisputeCountdown({ dueDateStr, compact = false }: { dueDateStr: string | null | undefined; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!dueDateStr) return null;

  const dueTime = new Date(dueDateStr).getTime();
  if (isNaN(dueTime)) return null;

  const diffMs = dueTime - now;

  if (diffMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
        <span>⏱️</span>
        <span>Waktu Banding Berakhir</span>
      </span>
    );
  }

  const seconds = Math.floor((diffMs / 1000) % 60);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isUrgent = diffMs < 12 * 3600 * 1000; // < 12 jam
  const isWarning = diffMs < 24 * 3600 * 1000; // < 24 jam

  let timeString = '';
  if (days > 0) {
    timeString = `Kurang ${days} Hari ${hours} Jam`;
  } else if (hours > 0) {
    timeString = `Kurang ${hours} Jam ${minutes} Menit`;
  } else {
    timeString = `Kurang ${minutes} Menit ${seconds} Detik`;
  }

  const colorClass = isUrgent
    ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
    : isWarning
    ? 'bg-amber-50 text-amber-800 border-amber-300'
    : 'bg-emerald-50 text-emerald-800 border-emerald-300';

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${colorClass} whitespace-nowrap shadow-xs`}
        title={`Batas Waktu Banding: ${formatDate(dueDateStr)}`}
      >
        <span>⏳</span>
        <span>{timeString}</span>
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${colorClass} whitespace-nowrap shadow-xs`}>
      <span className="text-[11px]">⏳</span>
      <span>Batas Banding: {timeString}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Returns({ returns, filters, summary, disputeTasks = [], marketplaces, flash }: Props) {
  const { auth } = usePage<any>().props;
  const isManagement = auth?.user?.role?.name === 'Management';
  const canManage = !isManagement;

  const handlePageChange = (rawUrl: string | null) => {
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      const targetUrl = parsed.pathname + parsed.search;
      router.get(targetUrl, {}, { preserveScroll: true, preserveState: true });
    } catch {
      router.get(rawUrl, {}, { preserveScroll: true, preserveState: true });
    }
  };

  const [search, setSearch] = useState(filters.search ?? '');
  const [selectedMp, setSelectedMp] = useState(filters.marketplace ?? 'all');
  const [needsActionFilter, setNeedsActionFilter] = useState(filters.needs_action ?? '');
  const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
  const [dateTo, setDateTo] = useState(filters.date_to ?? '');

  // Auto search secara otomatis (Debounced 350ms) tanpa perlu tekan Enter
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      applyFilters({ search });
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  // Modal Edit State
  const [editingRow, setEditingRow] = useState<ReturnRow | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fisikSelection, setFisikSelection] = useState<string>('');

  const copyToClipboard = (text: string | null | undefined, fieldKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };
  const editForm = useForm({
    marketplace: '',
    tgl_input_mp: '',
    nama_barang_mp: '',
    jml_produk_mp: 1,
    no_invoice_mp: '',
    no_invoice_baru: '',
    no_retur: '',
    tgl_rj: '',
    tgl_terima_brg: '',
    nama_barang_fisik: '',
    jml_brg_fisik: '',
    keterangan: '',
    barcode: '',
    tgl_banding: '',
    due_date: '',
    no_pengajuan: '',
    no_pesanan_baru: '',
  });

  function openEditModal(row: ReturnRow) {
    setEditingRow(row);
    const currentFisik = row.nama_barang_fisik ?? '';
    if (currentFisik === 'Sesuai' || currentFisik === 'Tidak Sesuai') {
      setFisikSelection(currentFisik);
    } else if (currentFisik) {
      setFisikSelection('Lainnya');
    } else {
      setFisikSelection('');
    }

    editForm.setData({
      marketplace: row.marketplace ?? '',
      tgl_input_mp: row.tgl_input_mp ?? '',
      nama_barang_mp: row.nama_barang_mp ?? '',
      jml_produk_mp: row.jml_produk_mp ?? 1,
      no_invoice_mp: row.no_invoice_mp ?? '',
      no_invoice_baru: row.no_invoice_baru ?? '',
      no_retur: row.no_retur ?? '',
      tgl_rj: row.tgl_rj ?? '',
      tgl_terima_brg: row.tgl_terima_brg ?? '',
      nama_barang_fisik: currentFisik,
      jml_brg_fisik: row.jml_brg_fisik !== null ? String(row.jml_brg_fisik) : '',
      keterangan: row.keterangan ?? '',
      barcode: row.barcode ?? '',
      tgl_banding: row.tgl_banding || 'Belum Dibanding',
      due_date: row.due_date ? String(row.due_date).slice(0, 16) : '',
      no_pengajuan: row.no_pengajuan ?? '',
      no_pesanan_baru: row.no_pesanan_baru ?? '',
    });
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;

    editForm.put(`/cut-off-returns/${editingRow.id}`, {
      preserveScroll: true,
      onSuccess: () => setEditingRow(null),
    });
  }

  function handleDeleteRow(row: ReturnRow) {
    const label = row.no_retur || row.no_invoice_mp || `ID #${row.id}`;
    if (!confirm(`Hapus data retur "${label}" dari sistem?`)) return;
    router.delete(`/cut-off-returns/${row.id}`, { preserveScroll: true });
  }

  // Modal Create Manual
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const createForm = useForm({
    marketplace: 'SH',
    tgl_input_mp: new Date().toISOString().split('T')[0],
    nama_barang_mp: '',
    jml_produk_mp: 1,
    no_invoice_mp: '',
    no_invoice_baru: '',
    no_retur: '',
    tgl_rj: '',
    tgl_terima_brg: new Date().toISOString().split('T')[0],
    nama_barang_fisik: '',
    jml_brg_fisik: '',
    keterangan: '',
    barcode: '',
    tgl_banding: '',
    due_date: '',
    no_pengajuan: '',
    no_pesanan_baru: '',
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createForm.post('/cut-off-returns', {
      preserveScroll: true,
      onSuccess: () => {
        setIsCreateModalOpen(false);
        createForm.reset();
      },
    });
  }

  // Modal Import Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  // Modal Tarik Retur Shopee
  const [isShopeeSyncModalOpen, setIsShopeeSyncModalOpen] = useState(false);
  const now = new Date();
  const defaultShopeeEnd = formatYMD(now.getFullYear(), now.getMonth(), now.getDate());
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 13);
  const defaultShopeeStart = formatYMD(d14.getFullYear(), d14.getMonth(), d14.getDate());

  const [shopeeStartDate, setShopeeStartDate] = useState(defaultShopeeStart);
  const [shopeeEndDate, setShopeeEndDate] = useState(defaultShopeeEnd);
  const [isShopeeCalendarOpen, setIsShopeeCalendarOpen] = useState(false);
  const [isSyncingShopee, setIsSyncingShopee] = useState(false);

  // Modal Tarik Retur TikTok
  const [isTiktokSyncModalOpen, setIsTiktokSyncModalOpen] = useState(false);
  const [tiktokStartDate, setTiktokStartDate] = useState(defaultShopeeStart);
  const [tiktokEndDate, setTiktokEndDate] = useState(defaultShopeeEnd);
  const [isTiktokCalendarOpen, setIsTiktokCalendarOpen] = useState(false);
  const [isSyncingTiktok, setIsSyncingTiktok] = useState(false);

  const getShopeeDaysCount = (s: string, e: string): number => {
    if (!s || !e) return 0;
    const diff = new Date(e).getTime() - new Date(s).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  function handleShopeeSyncSubmit() {
    if (!shopeeStartDate || !shopeeEndDate) {
      alert('Silakan tentukan Rentang Tanggal terlebih dahulu.');
      return;
    }

    setIsSyncingShopee(true);
    router.post(
      '/marketplace/shopee/sync-returns',
      { start_date: shopeeStartDate, end_date: shopeeEndDate },
      {
        preserveScroll: true,
        onFinish: () => {
          setIsSyncingShopee(false);
          setIsShopeeSyncModalOpen(false);
        },
      }
    );
  }

  function handleTiktokSyncSubmit() {
    if (!tiktokStartDate || !tiktokEndDate) {
      alert('Silakan tentukan Rentang Tanggal terlebih dahulu.');
      return;
    }

    setIsSyncingTiktok(true);
    router.post(
      '/marketplace/tiktok/sync-returns',
      { start_date: tiktokStartDate, end_date: tiktokEndDate },
      {
        preserveScroll: true,
        onFinish: () => {
          setIsSyncingTiktok(false);
          setIsTiktokSyncModalOpen(false);
        },
      }
    );
  }

  // Kunci scroll halaman saat modal aktif
  useEffect(() => {
    if (editingRow || isCreateModalOpen || isImportModalOpen || isShopeeSyncModalOpen || isTiktokSyncModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [editingRow, isCreateModalOpen, isImportModalOpen, isShopeeSyncModalOpen, isTiktokSyncModalOpen]);

  function handleExcelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Temukan sheet "RETURAN ONLINE FIX" atau sheet apapun yang mengandung kata "RETUR"
        const sheetName = workbook.SheetNames.find(n =>
          n.toUpperCase().includes('RETURAN') || n.toUpperCase().includes('RETUR')
        ) ?? workbook.SheetNames[0];

        const sheet = workbook.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

        if (rawRows.length <= 3) {
          alert(`Sheet "${sheetName}" tidak memiliki data yang cukup (minimal 4 baris dengan header).`);
          setIsParsing(false);
          return;
        }

        // Data dimulai dari baris 4 (indeks array 3)
        const dataRows = rawRows.slice(3);
        const parsed: any[] = [];

        for (const row of dataRows) {
          if (!row) continue;
          const mp = cleanVal(row[1]);
          const barangMp = cleanVal(row[3]);
          const invMp = cleanVal(row[5]);
          const noRetur = cleanVal(row[7]);

          // Abaikan baris jika tidak ada info retur sama sekali
          if (!mp && !barangMp && !invMp && !noRetur) continue;

          parsed.push({
            no_urut:           parseInt(cleanVal(row[0]), 10) || null,
            marketplace:       mp ? mp.toUpperCase() : 'SH',
            tgl_input_mp:      parseDateVal(row[2]) || null,
            nama_barang_mp:    barangMp || null,
            jml_produk_mp:     parseInt(cleanVal(row[4]), 10) || 1,
            no_invoice_mp:     invMp || null,
            no_invoice_baru:   cleanVal(row[6]) || null,
            no_retur:          noRetur || null,
            tgl_rj:            parseDateVal(row[8]) || null,
            tgl_terima_brg:    parseDateVal(row[9]) || null,
            nama_barang_fisik: cleanVal(row[10]) || null,
            jml_brg_fisik:     parseInt(cleanVal(row[11]), 10) || null,
            keterangan:        cleanVal(row[12]) || null,
            barcode:           cleanVal(row[13]) || null,
            tgl_banding:       cleanVal(row[14]) || null,
            no_pengajuan:      cleanVal(row[15]) || null,
            no_pesanan_baru:   cleanVal(row[16]) || null,
          });
        }

        setImportData(parsed);
        setImportFileName(`${file.name} [Sheet: ${sheetName}]`);
        setIsParsing(false);
      } catch (err) {
        console.error(err);
        alert('Gagal memproses file Excel. Pastikan file valid.');
        setIsParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function handleImportSubmit() {
    if (importData.length === 0) return;
    setIsSubmittingImport(true);
    router.post(
      '/cut-off-returns/import',
      { rows: importData },
      {
        preserveScroll: true,
        onSuccess: () => {
          setIsImportModalOpen(false);
          setImportData([]);
          setImportFileName('');
          setIsSubmittingImport(false);
        },
        onError: () => {
          setIsSubmittingImport(false);
        },
      }
    );
  }

  function applyFilters(newFilters: Record<string, string>) {
    const nextFilters: Record<string, string> = {
      ...filters,
      search,
      marketplace: selectedMp,
      needs_action: needsActionFilter,
      date_from: dateFrom,
      date_to: dateTo,
      ...newFilters,
    };

    if (nextFilters.marketplace === 'all' || !nextFilters.marketplace) {
      delete nextFilters.marketplace;
    }
    if (!nextFilters.needs_action) {
      delete nextFilters.needs_action;
    }
    if (!nextFilters.search) {
      delete nextFilters.search;
    }
    if (!nextFilters.date_from) {
      delete nextFilters.date_from;
    }
    if (!nextFilters.date_to) {
      delete nextFilters.date_to;
    }

    router.get('/cut-off-returns', nextFilters, {
      preserveState: true,
      replace: true,
      preserveScroll: true,
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters({ search });
  }

  return (
    <AppLayout>
      <Head title="Retur Online Multi-Channel" />

      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Flash Message Banner */}
        {flash?.success && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-5 py-4 text-xs font-semibold shadow-xs">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-600 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{flash.success}</span>
          </div>
        )}

        {/* Header Title Banner */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Retur Online Multi-Channel
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kelola {summary.total_retur.toLocaleString('id-ID')} data penerimaan barang retur dari marketplace, cek fisik gudang, dan sinkronisasi pesanan pengganti (JL).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {isManagement && (
              <span className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Akses Management (Read-Only)
              </span>
            )}

            {canManage && (
              <>
                {/* Marketplace Sync Control Group */}
                <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                  <span className="pl-2.5 pr-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
                    Tarik API
                  </span>
                  {/* Tarik Retur Shopee API */}
                  <button
                    type="button"
                    onClick={() => setIsShopeeSyncModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-orange-50 border border-slate-200/80 text-slate-700 hover:text-[#EE4D2D] text-xs font-semibold transition-colors shadow-2xs cursor-pointer active:scale-95"
                    title="Tarik Retur dari Shopee Open API"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[#EE4D2D]">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.53 5.47a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v5.69a.75.75 0 001.5 0v-5.69l1.72 1.72a.75.75 0 101.06-1.06l-3-3z" clipRule="evenodd" />
                    </svg>
                    <span>Shopee</span>
                  </button>

                  {/* Tarik Retur TikTok API */}
                  <button
                    type="button"
                    onClick={() => setIsTiktokSyncModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200/80 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer active:scale-95 ml-1"
                    title="Tarik Retur dari TikTok Shop API"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-slate-900">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.53 5.47a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v5.69a.75.75 0 001.5 0v-5.69l1.72 1.72a.75.75 0 101.06-1.06l-3-3z" clipRule="evenodd" />
                    </svg>
                    <span>TikTok</span>
                  </button>
                </div>

                {/* Upload Excel (.xlsx) */}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                  title="Upload dan import data retur dari file Excel (.xlsx)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span>Upload Excel</span>
                </button>

                {/* Tambah Retur Manual */}
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                  title="Tambah data penerimaan retur secara manual"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>Tambah Retur</span>
                </button>
              </>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => router.reload()}
              className="inline-flex items-center justify-center p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
              title="Refresh data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        {/* 5 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Total Retur */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Retur Masuk</span>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{summary.total_retur.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Data sheet RETURAN ONLINE FIX</p>
          </div>

          {/* Card 2: Shopee (SH) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Shopee (SH)</span>
              <span className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4 text-[#EE4D2D]">
                  <path d="M19.5 7.5h-2.25V6a5.25 5.25 0 00-10.5 0v1.5H4.5A2.25 2.25 0 002.25 9.75v10.5A2.25 2.25 0 004.5 22.5h15a2.25 2.25 0 002.25-2.25V9.75A2.25 2.25 0 0019.5 7.5zm-10.5-1.5a3.75 3.75 0 017.5 0v1.5h-7.5V6zm10.5 15H4.5V9.75h15V21z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-[#EE4D2D] mt-3">{summary.total_shopee.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Retur masuk dari channel Shopee</p>
          </div>

          {/* Card 3: Tokopedia (TT) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">TikTok Shop / TT</span>
              <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h5.25m-5.25 0v-7.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{summary.total_tokopedia.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Retur masuk dari channel TikTok</p>
          </div>

          {/* Card 4: Diterbitkan Pesanan Baru */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">JL / Pesanan Baru</span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 mt-3">{summary.total_pesanan_baru.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Retur yang sudah diproses tukar/kirim ulang</p>
          </div>

          {/* Card 5: Task Adu Banding / Respon */}
          <div
            onClick={() => {
              const nextVal = needsActionFilter === '1' ? '' : '1';
              setNeedsActionFilter(nextVal);
              applyFilters({ needs_action: nextVal });
            }}
            className={`cursor-pointer border rounded-2xl p-5 shadow-xs transition-all ${
              needsActionFilter === '1'
                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20'
                : (summary.total_needs_action ?? 0) > 0
                ? 'bg-white border-amber-300 hover:border-amber-400'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
            title="Klik untuk filter kasus retur yang butuh tindakan / respon"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Adu Banding / Respon</span>
              <span className={`p-2 rounded-xl ${(summary.total_needs_action ?? 0) > 0 ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <p className={`text-2xl font-extrabold mt-3 ${(summary.total_needs_action ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {(summary.total_needs_action ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {(summary.total_needs_action ?? 0) > 0 ? '⚠️ Butuh respon penjual' : 'Semua respon aman'}
            </p>
          </div>
        </div>

        {/* Widget Task Adu Banding & Respon Retur Marketplace */}
        {disputeTasks && disputeTasks.length > 0 && (
          <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  Task Adu Banding & Respon Retur Marketplace
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-500 text-slate-950">
                    {disputeTasks.length} Kasus
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Segera tanggapi sebelum batas waktu berakhir agar dana tidak otomatis dikembalikan ke pembeli.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {disputeTasks.map((task) => (
                <div key={task.id} className="bg-white border border-amber-200/90 rounded-xl p-3.5 shadow-xs flex flex-col justify-between gap-3 hover:border-amber-400 transition-all">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <ChannelBadge mp={task.marketplace} />
                        <span className="text-xs font-mono font-bold text-slate-800 select-all truncate max-w-[130px]" title={task.no_retur || task.no_invoice_mp || ''}>
                          {task.no_retur || task.no_invoice_mp}
                        </span>
                      </div>
                      <DisputeCountdown dueDateStr={task.due_date} compact />
                    </div>

                    <p className="text-xs font-semibold text-slate-900 truncate" title={task.nama_barang_mp ?? ''}>
                      {task.nama_barang_mp ?? 'Produk Retur'}
                    </p>

                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span>Qty: <strong className="text-slate-800">{task.jml_produk_mp ?? 1} pcs</strong></span>
                      {task.refund_amount ? (
                        <span className="font-bold text-rose-600">Rp {Number(task.refund_amount).toLocaleString('id-ID')}</span>
                      ) : null}
                    </div>

                    {task.keterangan && (
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-1.5 bg-slate-50 p-1.5 rounded border border-slate-100 italic" title={task.keterangan}>
                        "{task.keterangan}"
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate max-w-[120px]">
                      {task.return_status ? `Status: ${task.return_status}` : 'Menunggu Tindakan'}
                    </span>
                    {task.seller_center_url && (
                      <a
                        href={task.seller_center_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 transition-all shadow-xs shrink-0 cursor-pointer"
                      >
                        <span>Buka Seller Center</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Pills Channel / Toko & Search Row */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => {
                setSelectedMp('all');
                applyFilters({ marketplace: 'all' });
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedMp === 'all'
                  ? 'bg-[#0B132B] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua Marketplace ({summary.total_retur.toLocaleString('id-ID')})
            </button>
            {marketplaces.map((m) => (
              <button
                key={m.name}
                onClick={() => {
                  setSelectedMp(m.name);
                  applyFilters({ marketplace: m.name });
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedMp === m.name
                    ? 'bg-[#0B132B] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {getMarketplaceLabel(m.name)} ({m.count.toLocaleString('id-ID')})
              </button>
            ))}
          </div>

          {/* Search & Date Filter Dropdowns Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
            {/* Search Input (Auto-search tanpa tekan Enter) */}
            <form onSubmit={handleSearchSubmit} className="sm:col-span-2 lg:col-span-4 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari No Inv Baru, No Pesanan, Retur, SKU..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-[#0B132B] focus:bg-white transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer transition-colors"
                  title="Hapus pencarian"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </form>

            {/* Tanggal Terima Dari */}
            <div className="lg:col-span-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Dari:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    applyFilters({ date_from: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
                />
              </div>
            </div>

            {/* Tanggal Terima Sampai */}
            <div className="lg:col-span-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Sampai:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    applyFilters({ date_to: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
                />
              </div>
            </div>

            {/* Action / Reset Button */}
            <div className="lg:col-span-2 flex items-center justify-end gap-2">
              {(search || (selectedMp && selectedMp !== 'all') || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSelectedMp('all');
                    setDateFrom('');
                    setDateTo('');
                    router.get('/cut-off-returns', {}, { replace: true });
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 text-center w-12">No</th>
                  <th className="py-3 px-4">MP & Tanggal</th>
                  <th className="py-3 px-4">Pengembalian & Pesanan</th>
                  <th className="py-3 px-4">SKU Barang</th>
                  <th className="py-3 px-4">Pengecekan Fisik Gudang</th>
                  <th className="py-3 px-4">Keterangan & Banding</th>
                  <th className="py-3 px-4">Pengajuan & Pesanan Baru</th>
                  {canManage && <th className="py-3 px-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returns.data.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="py-12 text-center text-slate-400">
                      Tidak ada data retur yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  returns.data.map((row, index) => {
                    const rowNumber = (returns.current_page - 1) * returns.per_page + index + 1;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* No */}
                        <td className="py-3.5 px-3 text-center text-xs font-bold text-slate-500 whitespace-nowrap">
                          {rowNumber}
                        </td>

                        {/* MP & Tanggal */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <ChannelBadge mp={row.marketplace} />
                          <p className="text-slate-800 text-xs font-semibold">
                            {formatDate(row.tgl_terima_brg)}
                          </p>
                          {row.tgl_rj && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              RJ: {formatDate(row.tgl_rj)}
                            </p>
                          )}
                        </td>

                      {/* Retur & Invoice */}
                      <td className="py-3.5 px-4 font-mono max-w-[220px]">
                        {row.no_retur ? (
                          <p className="font-bold text-amber-700 select-all truncate" title={row.no_retur}>
                            {row.no_retur}
                          </p>
                        ) : (
                          <span className="text-slate-400 font-sans text-[11px] block">— Belum No RJ</span>
                        )}

                        {row.no_invoice_mp ? (
                          <p className="text-blue-700 font-semibold text-[11px] mt-0.5 truncate select-all" title={row.no_invoice_mp}>
                            {row.no_invoice_mp}
                          </p>
                        ) : (
                          <span className="text-slate-400 font-sans text-[10px] block mt-0.5">— No Inv Kosong</span>
                        )}

                        {row.no_invoice_baru && (
                          <span className="inline-block mt-1 font-mono text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate" title={`Invoice Baru: ${row.no_invoice_baru}`}>
                            Baru: {row.no_invoice_baru}
                          </span>
                        )}
                      </td>

                      {/* Barang (Data MP) */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <p className="font-semibold text-slate-900 truncate" title={row.nama_barang_mp ?? ''}>
                          {row.nama_barang_mp ?? '—'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-sans">
                          <span>QTY MP: <strong className="text-slate-900">{row.jml_produk_mp ?? 1}</strong></span>
                          {row.tgl_input_mp && (
                            <span className="text-slate-400 text-[10px]">Input: {formatDate(row.tgl_input_mp)}</span>
                          )}
                        </div>
                      </td>

                      {/* Pengecekan Fisik Gudang */}
                      <td className="py-3.5 px-4 max-w-[220px]">
                        <p className="font-medium text-slate-800 truncate" title={row.nama_barang_fisik ?? ''}>
                          {row.nama_barang_fisik ? (
                            <span
                              className={`inline-flex items-center gap-1 font-bold text-xs ${
                                row.nama_barang_fisik === 'Sesuai'
                                  ? 'text-emerald-700'
                                  : row.nama_barang_fisik === 'Tidak Sesuai'
                                  ? 'text-rose-600'
                                  : 'text-amber-800'
                              }`}
                            >
                              {row.nama_barang_fisik === 'Sesuai' && <span>✓</span>}
                              {row.nama_barang_fisik === 'Tidak Sesuai' && <span>✕</span>}
                              {row.nama_barang_fisik}
                            </span>
                          ) : (
                            <span className="text-slate-400">— Fisik Belum Diisi</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-sans">
                          {row.jml_brg_fisik !== null && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px] border border-emerald-200">
                              Fisik: {row.jml_brg_fisik} pcs
                            </span>
                          )}
                          {row.barcode && (
                            <span className="font-mono text-[10px] text-slate-400 truncate" title={`Barcode: ${row.barcode}`}>
                              {row.barcode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Keterangan & Banding */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        {row.keterangan ? (
                          <p className="text-[11px] text-slate-700 line-clamp-2" title={row.keterangan}>
                            {row.keterangan}
                          </p>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}

                        {(() => {
                          const deadline = resolveDisputeDeadline(row);
                          if (deadline) {
                            return (
                              <div className="mt-1.5">
                                <DisputeCountdown dueDateStr={deadline} compact />
                              </div>
                            );
                          }

                          const ket = (row.keterangan || '').toUpperCase();
                          const st = (row.return_status || '').toUpperCase();
                          const isPending = ket.includes('PROCESSING') || ket.includes('REQUESTED') || st === 'PROCESSING' || st === 'REQUESTED' || Boolean(row.needs_action);

                          if (isPending) {
                            return (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 whitespace-nowrap shadow-xs" title="Menunggu respon / validasi penjual di Shopee Seller Center">
                                  <span>⏳</span>
                                  <span>Menunggu Validasi Penjual</span>
                                </span>
                              </div>
                            );
                          }

                          return null;
                        })()}

                        {row.tgl_banding && (
                          <span
                            className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded border truncate max-w-[180px] ${
                              row.tgl_banding.toLowerCase().includes('sudah')
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                            title={`Status Banding: ${row.tgl_banding}`}
                          >
                            {row.tgl_banding}
                          </span>
                        )}
                      </td>

                      {/* Pengajuan & Pesanan Baru */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        {row.no_pengajuan && (
                          <p className="font-mono text-[11px] text-slate-600 truncate select-all" title={`No Pengajuan: ${row.no_pengajuan}`}>
                            {row.no_pengajuan}
                          </p>
                        )}

                        {row.no_pesanan_baru && (
                          <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] font-sans text-blue-900 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 max-w-[190px] truncate" title={`Pesanan Baru: ${row.no_pesanan_baru}`}>
                            <span className="truncate font-mono font-bold">{row.no_pesanan_baru}</span>
                          </div>
                        )}

                        {row.no_invoice_baru ? (
                          <div className="inline-flex items-center gap-1.5 mt-1 text-[11px] font-sans text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 max-w-[190px] truncate" title={`Nomer JL: ${row.no_invoice_baru}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-700 shrink-0">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                            <span className="truncate font-mono font-bold">{row.no_invoice_baru}</span>
                          </div>
                        ) : !row.no_pesanan_baru && (
                          <span className="text-slate-400 font-sans text-[10px] block mt-1">— Belum Ada JL</span>
                        )}
                      </td>

                      {/* Aksi */}
                      {canManage && (
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {row.seller_center_url && (
                              <a
                                href={row.seller_center_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-orange-600 hover:text-white hover:bg-[#EE4D2D] transition-all border border-orange-200 cursor-pointer"
                                title={`Buka di ${row.marketplace === 'SH' ? 'Shopee' : 'TikTok'} Seller Center`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                              </a>
                            )}
                            <button
                              onClick={() => openEditModal(row)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-[#0B132B] transition-all border border-slate-200 cursor-pointer"
                              title="Edit info retur / cek fisik"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteRow(row)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-white hover:bg-rose-600 transition-all border border-slate-200 cursor-pointer"
                              title="Hapus data retur"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50">
            <span className="text-slate-500">
              Menampilkan {returns?.from ?? 0}–{returns?.to ?? 0} dari {(returns?.total ?? 0).toLocaleString('id-ID')} data retur
            </span>

            <div className="flex items-center gap-1">
              {(returns?.links || []).map((link, idx) => {
                if (!link.url) {
                  return (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-400 bg-white cursor-not-allowed select-none"
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  );
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handlePageChange(link.url)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      link.active
                        ? 'bg-[#0B132B] text-white border border-[#0B132B]'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Quick Edit Retur */}
      {editingRow && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setEditingRow(null)}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Edit Informasi Retur</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {editingRow.no_retur || editingRow.no_invoice_mp || `Retur #${editingRow.id}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Marketplace</label>
                    <input
                      type="text"
                      value={getMarketplaceLabel(editForm.data.marketplace)}
                      readOnly
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 text-slate-800 font-bold border border-slate-200 cursor-not-allowed select-all"
                      title="Marketplace asal pesanan"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Fisik Barang</label>
                    <select
                      value={editForm.data.tgl_terima_brg ? 'sudah' : 'belum'}
                      onChange={(e) => {
                        if (e.target.value === 'sudah') {
                          const today = new Date().toISOString().split('T')[0];
                          editForm.setData('tgl_terima_brg', editForm.data.tgl_terima_brg || today);
                        } else {
                          editForm.setData('tgl_terima_brg', '');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800 focus:outline-none focus:border-[#0B132B]"
                    >
                      <option value="belum">Belum Diterima</option>
                      <option value="sudah">Sudah Diterima</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Tgl Terima Fisik</label>
                    <input
                      type="date"
                      value={editForm.data.tgl_terima_brg}
                      disabled={!editForm.data.tgl_terima_brg}
                      onChange={(e) => editForm.setData('tgl_terima_brg', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B] disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pengembalian</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editForm.data.no_retur}
                        readOnly
                        placeholder="No. Pengembalian..."
                        className="w-full pl-3 pr-8 py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 select-all font-mono font-medium focus:outline-none"
                        title="No. Pengembalian (bisa disalin)"
                      />
                      {editForm.data.no_retur && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(editForm.data.no_retur, 'retur')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          title="Salin No. Pengembalian"
                        >
                          {copiedField === 'retur' ? (
                            <span className="text-[10px] font-bold text-emerald-600 px-0.5">Tersalin!</span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pesanan</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editForm.data.no_invoice_mp}
                        readOnly
                        placeholder="No. Pesanan..."
                        className="w-full pl-3 pr-8 py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 select-all font-mono font-medium focus:outline-none"
                        title="No. Pesanan (bisa disalin)"
                      />
                      {editForm.data.no_invoice_mp && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(editForm.data.no_invoice_mp, 'invoice')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          title="Salin No. Pesanan"
                        >
                          {copiedField === 'invoice' ? (
                            <span className="text-[10px] font-bold text-emerald-600 px-0.5">Tersalin!</span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pesanan Baru</label>
                    <input
                      type="text"
                      value={editForm.data.no_pesanan_baru}
                      onChange={(e) => editForm.setData('no_pesanan_baru', e.target.value)}
                      placeholder="No. Pesanan baru pengganti / reorder..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Nomer JL</label>
                    <input
                      type="text"
                      value={editForm.data.no_invoice_baru}
                      onChange={(e) => editForm.setData('no_invoice_baru', e.target.value)}
                      placeholder="JL/00081185... (kosong jika belum ada)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 uppercase mb-1">SKU Barang</label>
                    <input
                      type="text"
                      value={editForm.data.nama_barang_mp}
                      readOnly
                      disabled
                      placeholder="SKU Barang..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold border border-slate-200 cursor-not-allowed select-all font-mono"
                      title="SKU Barang dari Marketplace (tidak dapat diubah)"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Qty MP</label>
                    <input
                      type="number"
                      value={editForm.data.jml_produk_mp}
                      readOnly
                      disabled
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold border border-slate-200 cursor-not-allowed select-all"
                      title="Qty MP otomatis dari Marketplace dan tidak dapat diubah"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 uppercase mb-1">Nama Barang (Fisik Cek Gudang)</label>
                    <select
                      value={fisikSelection}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFisikSelection(val);
                        if (val === 'Sesuai' || val === 'Tidak Sesuai') {
                          editForm.setData('nama_barang_fisik', val);
                        } else if (val === 'Lainnya') {
                          if (editForm.data.nama_barang_fisik === 'Sesuai' || editForm.data.nama_barang_fisik === 'Tidak Sesuai') {
                            editForm.setData('nama_barang_fisik', '');
                          }
                        } else {
                          editForm.setData('nama_barang_fisik', '');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800 focus:outline-none focus:border-[#0B132B]"
                    >
                      <option value="">-- Pilih Fisik Cek Gudang --</option>
                      <option value="Sesuai">Sesuai</option>
                      <option value="Tidak Sesuai">Tidak Sesuai</option>
                      <option value="Lainnya">Lainnya (Isi Sendiri, misal: isi kain)</option>
                    </select>

                    {fisikSelection === 'Lainnya' && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={editForm.data.nama_barang_fisik}
                          onChange={(e) => editForm.setData('nama_barang_fisik', e.target.value)}
                          placeholder="Tuliskan kondisi fisik barang (misal: isi kain, barang rusak, salah size)..."
                          className="w-full px-3 py-2 rounded-xl bg-amber-50/60 border border-amber-300 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-medium placeholder:text-slate-400"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Qty Fisik</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.data.jml_brg_fisik}
                      onChange={(e) => editForm.setData('jml_brg_fisik', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Keterangan / Alasan</label>
                    <input
                      type="text"
                      value={editForm.data.keterangan}
                      readOnly
                      disabled
                      placeholder="Keterangan marketplace..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 cursor-not-allowed select-all"
                      title="Keterangan/alasan pengajuan dari marketplace (tidak dapat diubah)"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Banding MP</label>
                    <select
                      value={
                        (editForm.data.tgl_banding || '').toLowerCase().includes('sudah')
                          ? 'Sudah Dibanding'
                          : 'Belum Dibanding'
                      }
                      onChange={(e) => editForm.setData('tgl_banding', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800 focus:outline-none focus:border-[#0B132B]"
                    >
                      <option value="Belum Dibanding">Belum Dibanding</option>
                      <option value="Sudah Dibanding">Sudah Dibanding</option>
                    </select>
                  </div>
                </div>

                {/* Batas Waktu Banding / Deadline */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Batas Waktu Banding (Deadline)</label>
                  <input
                    type="datetime-local"
                    value={editForm.data.due_date}
                    onChange={(e) => editForm.setData('due_date', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-[#0B132B]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Batas waktu respon dari Shopee/TikTok. Menampilkan hitungan mundur "Kurang X Hari Y Jam" di tabel.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingRow(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={editForm.processing}
                    className="px-5 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {editForm.processing ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Tambah Retur Manual */}
      {isCreateModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Tambah Data Retur Manual</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Input data penerimaan retur barang marketplace baru</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Marketplace *</label>
                    <select
                      value={createForm.data.marketplace}
                      onChange={(e) => createForm.setData('marketplace', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    >
                      <option value="SH">Shopee (SH)</option>
                      <option value="TT">TikTok Shop (TT)</option>
                      <option value="LZD">Lazada (LZD)</option>
                      <option value="EV">Evermos (EV)</option>
                      <option value="MANUAL">MANUAL / LAINNYA</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Tgl Terima Barang Fisik</label>
                    <input
                      type="date"
                      value={createForm.data.tgl_terima_brg}
                      onChange={(e) => createForm.setData('tgl_terima_brg', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pengembalian</label>
                    <input
                      type="text"
                      value={createForm.data.no_retur}
                      onChange={(e) => createForm.setData('no_retur', e.target.value)}
                      placeholder="No. Pengembalian / RJ..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pesanan</label>
                    <input
                      type="text"
                      value={createForm.data.no_invoice_mp}
                      onChange={(e) => createForm.setData('no_invoice_mp', e.target.value)}
                      placeholder="No. Pesanan..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 uppercase mb-1">SKU Barang *</label>
                    <input
                      type="text"
                      required
                      value={createForm.data.nama_barang_mp}
                      onChange={(e) => createForm.setData('nama_barang_mp', e.target.value)}
                      placeholder="Misal: SKP19-MH-31"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Qty MP</label>
                    <input
                      type="number"
                      min="1"
                      value={createForm.data.jml_produk_mp}
                      onChange={(e) => createForm.setData('jml_produk_mp', parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 uppercase mb-1">Nama Barang (Fisik Cek Gudang)</label>
                    <input
                      type="text"
                      value={createForm.data.nama_barang_fisik}
                      onChange={(e) => createForm.setData('nama_barang_fisik', e.target.value)}
                      placeholder="Sesuai fisik yang dicek adm gudang..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Qty Fisik</label>
                    <input
                      type="number"
                      min="0"
                      value={createForm.data.jml_brg_fisik}
                      onChange={(e) => createForm.setData('jml_brg_fisik', e.target.value)}
                      placeholder="1"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pesanan Baru</label>
                    <input
                      type="text"
                      value={createForm.data.no_pesanan_baru}
                      onChange={(e) => createForm.setData('no_pesanan_baru', e.target.value)}
                      placeholder="No. Pesanan baru pengganti / reorder..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Nomer JL</label>
                    <input
                      type="text"
                      value={createForm.data.no_invoice_baru}
                      onChange={(e) => createForm.setData('no_invoice_baru', e.target.value)}
                      placeholder="JL/00081185... (kosong jika belum ada)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Keterangan Retur</label>
                  <input
                    type="text"
                    value={createForm.data.keterangan}
                    onChange={(e) => createForm.setData('keterangan', e.target.value)}
                    placeholder="tukar size, batal kirim, dst..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createForm.processing}
                    className="px-5 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {createForm.processing ? 'Menyimpan...' : 'Simpan Retur'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Upload & Import Excel (.xlsx) */}
      {isImportModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => {
            setIsImportModalOpen(false);
            setImportData([]);
            setImportFileName('');
          }}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Import Data Retur dari Excel</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Unggah spreadsheet format Cut Off (Sheet: RETURAN ONLINE FIX)</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportData([]);
                    setImportFileName('');
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Upload Dropzone */}
              {importData.length === 0 ? (
                <div className="space-y-4">
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleExcelFileChange}
                      className="hidden"
                    />
                    <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl group-hover:scale-110 transition-transform">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <p className="font-bold text-slate-800 text-sm mt-3">
                      {isParsing ? 'Membaca data spreadsheet...' : 'Klik untuk memilih file Excel'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Mendukung format .xlsx, .xls (Otomatis mendeteksi Sheet RETURAN ONLINE FIX)
                    </p>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* File info card */}
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="p-2 bg-emerald-600 text-white rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-bold text-slate-900 text-xs truncate max-w-[280px]">{importFileName}</p>
                        <p className="text-emerald-700 font-semibold text-xs mt-0.5">
                          {importData.length.toLocaleString('id-ID')} data retur siap diimpor
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportData([]);
                        setImportFileName('');
                      }}
                      className="text-xs text-slate-500 hover:text-rose-600 underline cursor-pointer"
                    >
                      Ganti File
                    </button>
                  </div>

                  {/* Preview sample rows */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 uppercase">
                      Preview Data (3 Baris Pertama):
                    </div>
                    <div className="max-h-48 overflow-y-auto text-[11px] divide-y divide-slate-100">
                      {importData.slice(0, 3).map((r, i) => (
                        <div key={i} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <span className="font-bold text-slate-900">{r.no_retur || r.no_invoice_mp || 'Retur'}</span>
                            <span className="ml-2 text-slate-500">[{r.marketplace}]</span>
                            <p className="text-slate-500 text-[10px] mt-0.5">{r.nama_barang_mp ?? 'Tanpa Nama'} • Qty: {r.jml_produk_mp}</p>
                          </div>
                          <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                            {r.keterangan || r.tgl_banding || 'Tanpa Ket'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submit button */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportModalOpen(false);
                        setImportData([]);
                        setImportFileName('');
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSubmit}
                      disabled={isSubmittingImport}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      {isSubmittingImport ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Menyimpan ke Database...
                        </>
                      ) : (
                        `Impor ${importData.length.toLocaleString('id-ID')} Data Retur`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Tarik Retur Shopee API */}
      {isShopeeSyncModalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => !isSyncingShopee && setIsShopeeSyncModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 p-6 space-y-5 animate-in zoom-in-95 duration-150 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-orange-100 text-[#EE4D2D]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.53 5.47a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v5.69a.75.75 0 001.5 0v-5.69l1.72 1.72a.75.75 0 101.06-1.06l-3-3z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Tarik Retur dari Shopee API</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Ambil data pengajuan retur pembeli langsung dari Shopee Open API</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSyncingShopee}
                onClick={() => setIsShopeeSyncModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200/60 text-xs text-orange-950 leading-relaxed space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-[#EE4D2D]">
                <span>🔄</span> Otomatisasi Sinkronisasi Retur:
              </p>
              <p>1. Data pengajuan retur Shopee akan langsung dicatat ke tabel <strong>Retur Online</strong>.</p>
              <p>2. Nomor pesanan yang cocok di <strong>Pesanan Cut Off</strong> akan otomatis diubah statusnya menjadi <strong>RJ (Retur)</strong>.</p>
            </div>

            {/* Mode Rentang Waktu */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Pilih Rentang Waktu Tarik Retur:</label>
                <span className="text-[11px] font-bold text-[#EE4D2D]">
                  {getShopeeDaysCount(shopeeStartDate, shopeeEndDate)} Hari Terpilih
                </span>
              </div>

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Hari Ini', days: 1 },
                  { label: '7 Hari Terakhir', days: 7 },
                  { label: '14 Hari (Rekomendasi)', days: 14 },
                  { label: '30 Hari (1 Bln)', days: 30 },
                ].map((p) => {
                  const isSelected = getShopeeDaysCount(shopeeStartDate, shopeeEndDate) === p.days && shopeeEndDate === defaultShopeeEnd;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => {
                        const sObj = new Date();
                        sObj.setDate(sObj.getDate() - (p.days - 1));
                        const s = formatYMD(sObj.getFullYear(), sObj.getMonth(), sObj.getDate());
                        setShopeeStartDate(s);
                        setShopeeEndDate(defaultShopeeEnd);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#EE4D2D] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Trigger Bar Buka/Tutup Kalender */}
              <button
                type="button"
                onClick={() => setIsShopeeCalendarOpen(!isShopeeCalendarOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 hover:border-slate-300 rounded-xl text-left transition-all cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="p-2 rounded-xl bg-white border border-slate-200 text-[#EE4D2D] group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Pilih Tanggal di Kalender Dua Bulan
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                      {formatDateIndo(shopeeStartDate)} — {formatDateIndo(shopeeEndDate)}
                      <span className="ml-2 text-[11px] font-bold text-[#EE4D2D]">
                        ({getShopeeDaysCount(shopeeStartDate, shopeeEndDate)} hari)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <span className="text-[11px] font-bold text-[#EE4D2D] hidden sm:inline">
                    {isShopeeCalendarOpen ? 'Tutup Kalender' : 'Buka Kalender'}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className={`w-4 h-4 text-slate-500 transition-transform ${isShopeeCalendarOpen ? 'rotate-180' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Inline Dual Calendar Visual Picker */}
              {isShopeeCalendarOpen && (
                <div className="pt-1">
                  <DualCalendarRangePicker
                    initialStartDate={shopeeStartDate}
                    initialEndDate={shopeeEndDate}
                    inline={true}
                    onApply={(start, end) => {
                      setShopeeStartDate(start);
                      setShopeeEndDate(end);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isSyncingShopee}
                onClick={() => setIsShopeeSyncModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSyncingShopee}
                onClick={handleShopeeSyncSubmit}
                className="px-5 py-2.5 rounded-xl bg-[#EE4D2D] hover:bg-[#d83d1e] text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isSyncingShopee ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sedang Menarik Retur dari Shopee...
                  </>
                ) : (
                  `Tarik Retur Sekarang (${formatDateIndo(shopeeStartDate)} s/d ${formatDateIndo(shopeeEndDate)})`
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Tarik Retur TikTok API */}
      {isTiktokSyncModalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => !isSyncingTiktok && setIsTiktokSyncModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 p-6 space-y-5 animate-in zoom-in-95 duration-150 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-slate-900 text-[#25F4EE]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.53 5.47a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v5.69a.75.75 0 001.5 0v-5.69l1.72 1.72a.75.75 0 101.06-1.06l-3-3z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Tarik Retur dari TikTok Shop API</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Ambil data pengajuan retur/refund pembeli langsung dari TikTok Shop</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSyncingTiktok}
                onClick={() => setIsTiktokSyncModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-slate-900">
                <span>🔄</span> Otomatisasi Sinkronisasi Retur TikTok:
              </p>
              <p>1. Data pengajuan retur TikTok akan langsung dicatat ke tabel <strong>Retur Online</strong> (Marketplace: TT).</p>
              <p>2. Nomor pesanan yang cocok di <strong>Pesanan Cut Off</strong> akan otomatis diubah statusnya menjadi <strong>RJ (Retur)</strong>.</p>
            </div>

            {/* Mode Rentang Waktu */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Pilih Rentang Waktu Tarik Retur:</label>
                <span className="text-[11px] font-bold text-[#25F4EE] bg-slate-900 px-2 py-0.5 rounded-md">
                  {getShopeeDaysCount(tiktokStartDate, tiktokEndDate)} Hari Terpilih
                </span>
              </div>

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Hari Ini', days: 1 },
                  { label: '7 Hari Terakhir', days: 7 },
                  { label: '14 Hari (Rekomendasi)', days: 14 },
                  { label: '30 Hari (1 Bln)', days: 30 },
                ].map((p) => {
                  const isSelected = getShopeeDaysCount(tiktokStartDate, tiktokEndDate) === p.days && tiktokEndDate === defaultShopeeEnd;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => {
                        const sObj = new Date();
                        sObj.setDate(sObj.getDate() - (p.days - 1));
                        const s = formatYMD(sObj.getFullYear(), sObj.getMonth(), sObj.getDate());
                        setTiktokStartDate(s);
                        setTiktokEndDate(defaultShopeeEnd);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0B132B] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Trigger Bar Buka/Tutup Kalender */}
              <button
                type="button"
                onClick={() => setIsTiktokCalendarOpen(!isTiktokCalendarOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 hover:border-slate-300 rounded-xl text-left transition-all cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="p-2 rounded-xl bg-white border border-slate-200 text-slate-900 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Pilih Tanggal di Kalender Dua Bulan
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                      {formatDateIndo(tiktokStartDate)} — {formatDateIndo(tiktokEndDate)}
                      <span className="ml-2 text-[11px] font-bold text-slate-700">
                        ({getShopeeDaysCount(tiktokStartDate, tiktokEndDate)} hari)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <span className="text-[11px] font-bold text-slate-700 hidden sm:inline">
                    {isTiktokCalendarOpen ? 'Tutup Kalender' : 'Buka Kalender'}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className={`w-4 h-4 text-slate-500 transition-transform ${isTiktokCalendarOpen ? 'rotate-180' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Inline Dual Calendar Visual Picker */}
              {isTiktokCalendarOpen && (
                <div className="pt-1">
                  <DualCalendarRangePicker
                    initialStartDate={tiktokStartDate}
                    initialEndDate={tiktokEndDate}
                    inline={true}
                    onApply={(start, end) => {
                      setTiktokStartDate(start);
                      setTiktokEndDate(end);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isSyncingTiktok}
                onClick={() => setIsTiktokSyncModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSyncingTiktok}
                onClick={handleTiktokSyncSubmit}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-[#25F4EE] text-xs font-bold shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isSyncingTiktok ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-[#25F4EE]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sedang Menarik Retur dari TikTok...
                  </>
                ) : (
                  `Tarik Retur TikTok (${formatDateIndo(tiktokStartDate)} s/d {formatDateIndo(tiktokEndDate)})`
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AppLayout>
  );
}
