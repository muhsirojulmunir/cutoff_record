import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';

interface CutOffOrder {
  id: number;
  row_no: string | null;
  order_date: string | null;
  channel: string;
  order_number: string;
  jl_number: string | null;
  buyer_username: string | null;
  shipping_courier: string | null;
  payment_method?: string | null;
  sku_utama: string | null;
  sku_pengganti: string | null;
  product_name: string | null;
  qty: number;
  recheck_qty: number | null;
  package_count: string | null;
  info_gudang: string | null;
  order_status: string | null;
  keterangan_solutif: string | null;
  cancel_by?: string | null;
  cancel_reason?: string | null;
  est_net_income: number | string | null;
  marketplace_net_payout: number | string | null;
  sheet_dpp: string | null;
  dpp_number: string | null;
}

interface JlExcelRow {
  order_number: string;
  jl_number: string;
}

interface JlMatchedItem {
  id: number;
  order_number: string;
  channel: string;
  buyer_username: string | null;
  sku_utama: string | null;
  current_jl: string | null;
  new_jl: string;
  order_status: string | null;
  is_changed: boolean;
}

interface JlUnmatchedItem {
  order_number: string;
  jl_number: string;
  reason: string;
}

interface JlPreviewResult {
  success: boolean;
  total_excel: number;
  total_matched: number;
  total_unmatched: number;
  total_changed: number;
  matched: JlMatchedItem[];
  unmatched: JlUnmatchedItem[];
}

interface PaginationLinks {
  url: string | null;
  label: string;
  active: boolean;
}

interface Props {
  orders: {
    data: CutOffOrder[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number;
    to: number;
    links: PaginationLinks[];
  };
  filters: {
    search?: string;
    channel?: string;
    info_gudang?: string;
    order_status?: string;
    dpp_status?: string;
    shipping_courier?: string;
    shipping_tier?: string;
    date_from?: string;
    date_to?: string;
    per_page?: string;
  };
  summary: {
    total_orders: number;
    total_oos: number;
    total_rj: number;
    total_has_dpp: number;
    total_est_income: number;
    total_net_payout: number;
  };
  channels: { name: string; count: number }[];
  couriers?: { name: string; count: number }[];
}

function formatRupiah(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

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

function getShippingTier(courier: string | null | undefined): {
  label: string;
  badgeClass: string;
  icon: string;
} {
  if (!courier) {
    return {
      label: 'Reguler',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: '🚚',
    };
  }

  const c = courier.toLowerCase();

  if (c.includes('instant') || c.includes('instan')) {
    return {
      label: 'INSTAN',
      badgeClass: 'bg-amber-500 text-white font-extrabold border-amber-600 shadow-xs ring-1 ring-amber-400',
      icon: '⚡',
    };
  }

  if (c.includes('sameday') || c.includes('same day')) {
    return {
      label: 'SAMEDAY',
      badgeClass: 'bg-cyan-600 text-white font-bold border-cyan-700 shadow-xs',
      icon: '⏱️',
    };
  }

  if (c.includes('kargo') || c.includes('cargo') || c.includes('trucking') || c.includes('jtr') || c.includes('gokil')) {
    return {
      label: 'KARGO',
      badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 font-bold',
      icon: '📦',
    };
  }

  if (c.includes('hemat') || c.includes('economy') || c.includes('halu')) {
    return {
      label: 'HEMAT',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
      icon: '🏷️',
    };
  }

  return {
    label: 'REGULER',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-200 font-bold',
    icon: '🚚',
  };
}

function formatTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const timePart = dateStr.includes('T')
      ? dateStr.split('T')[1]
      : (dateStr.includes(' ') ? dateStr.split(' ')[1] : null);

    if (!timePart) return null;

    const parts = timePart.split(':');
    if (parts.length >= 2) {
      const hh = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      if (hh === '00' && mm === '00' && (parts.length < 3 || parts[2].startsWith('00'))) {
        return null;
      }
      return `${hh}:${mm}`;
    }
    return null;
  } catch {
    return null;
  }
}

export default function CutOffIndex({ orders, filters, summary, channels, couriers = [] }: Props) {
  const { auth } = usePage<any>().props;
  const isManagement = auth?.user?.role?.name === 'Management';
  const canManage = !isManagement;
  const isSuperAdmin = auth?.user?.role?.name === 'Super Admin' || auth?.user?.roles?.includes('Super Admin');
  const [isTruncating, setIsTruncating] = useState(false);

  function handleTruncate() {
    if (confirm('PERINGATAN: Apakah Anda yakin ingin MENGOSONGKAN SELURUH data Pesanan Cut Off?\n\nTindakan ini akan menghapus semua riwayat pesanan cut off agar Anda bisa menarik data murni dari API marketplace.\n\nTabel lain (Akun Toko, Returan Online, User Management) TIDAK akan terhapus.')) {
      setIsTruncating(true);
      router.post('/cut-off-orders/truncate', {}, {
        onFinish: () => setIsTruncating(false),
      });
    }
  }

  const [search, setSearch] = useState(filters.search ?? '');
  const [selectedChannel, setSelectedChannel] = useState(filters.channel ?? 'all');
  const [selectedInfo, setSelectedInfo] = useState(filters.info_gudang ?? 'all');
  const [selectedStatus, setSelectedStatus] = useState(filters.order_status ?? 'all');
  const [selectedDpp, setSelectedDpp] = useState(filters.dpp_status ?? 'all');
  const [selectedCourier, setSelectedCourier] = useState(filters.shipping_courier ?? 'all');
  const [selectedTier, setSelectedTier] = useState(filters.shipping_tier ?? 'all');
  
  // Modal Edit Order State
  const [editingOrder, setEditingOrder] = useState<CutOffOrder | null>(null);

  const editForm = useForm({
    info_gudang: '',
    sku_pengganti: '',
    keterangan_solutif: '',
    dpp_number: '',
    marketplace_net_payout: '',
    recheck_qty: '',
  });

  function openEditModal(order: CutOffOrder) {
    setEditingOrder(order);
    editForm.setData({
      info_gudang: order.info_gudang ?? '',
      sku_pengganti: order.sku_pengganti ?? '',
      keterangan_solutif: order.keterangan_solutif ?? '',
      dpp_number: order.dpp_number ?? '',
      marketplace_net_payout: order.marketplace_net_payout ? String(order.marketplace_net_payout) : '',
      recheck_qty: order.recheck_qty !== null ? String(order.recheck_qty) : '',
    });
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;

    editForm.put(`/cut-off-orders/${editingOrder.id}`, {
      preserveScroll: true,
      onSuccess: () => setEditingOrder(null),
    });
  }

  // Modal Create Manual
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const createForm = useForm({
    order_date: new Date().toISOString().slice(0, 16),
    channel: 'TT',
    order_number: '',
    jl_number: '',
    buyer_username: '',
    shipping_courier: '',
    sku_utama: '',
    sku_pengganti: '',
    product_name: '',
    qty: 1,
    recheck_qty: '',
    package_count: '1',
    info_gudang: 'READY',
    order_status: 'Diproses',
    keterangan_solutif: '',
    est_net_income: '',
    marketplace_net_payout: '',
    dpp_number: '',
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createForm.post('/cut-off-orders', {
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

  // Modal Import No. JL State
  const [isImportJlModalOpen, setIsImportJlModalOpen] = useState(false);
  const [jlImportFile, setJlImportFile] = useState<File | null>(null);
  const [isParsingJl, setIsParsingJl] = useState(false);
  const [jlPreviewData, setJlPreviewData] = useState<JlPreviewResult | null>(null);
  const [jlFilterTab, setJlFilterTab] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [isSubmittingJl, setIsSubmittingJl] = useState(false);
  const [jlSearchQuery, setJlSearchQuery] = useState('');

  // Kunci scroll halaman saat modal aktif agar fokus tepat di viewport pengguna
  useEffect(() => {
    if (editingOrder || isCreateModalOpen || isImportModalOpen || isImportJlModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [editingOrder, isCreateModalOpen, isImportModalOpen, isImportJlModalOpen]);

  function handleExcelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length <= 1) {
          alert('Sheet Excel kosong.');
          setIsParsing(false);
          return;
        }

        const isFirstHeader = typeof rows[0][0] === 'string' && (
          rows[0][0].toLowerCase().includes('no') ||
          (rows[0][3] && String(rows[0][3]).toLowerCase().includes('pesanan'))
        );
        const startIdx = isFirstHeader ? 1 : 0;

        const parsed: any[] = [];
        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[3]) continue;

          let orderDate = '';
          if (typeof row[1] === 'number') {
            const d = new Date(Math.round((row[1] - 25569) * 86400 * 1000));
            if (!isNaN(d.getTime())) orderDate = d.toISOString().split('T')[0];
          } else if (typeof row[1] === 'string') {
            orderDate = row[1].trim();
          }

          parsed.push({
            order_date: orderDate || new Date().toISOString().split('T')[0],
            channel: String(row[2] || 'MANUAL').trim(),
            order_number: String(row[3]).trim(),
            jl_number: row[4] ? String(row[4]).trim() : null,
            buyer_username: row[5] ? String(row[5]).trim() : null,
            sku_utama: row[6] ? String(row[6]).trim() : null,
            sku_pengganti: row[7] ? String(row[7]).trim() : null,
            product_name: row[8] ? String(row[8]).trim() : null,
            qty: parseInt(row[9], 10) || 1,
            recheck_qty: row[10] ? parseInt(row[10], 10) : null,
            package_count: row[11] ? String(row[11]).trim() : null,
            info_gudang: row[12] ? String(row[12]).trim() : null,
            order_status: row[13] ? String(row[13]).trim() : null,
            keterangan_solutif: row[14] ? String(row[14]).trim() : null,
            est_net_income: row[15] ? parseFloat(String(row[15]).replace(/[^0-9.-]/g, '')) : null,
            marketplace_net_payout: row[16] ? parseFloat(String(row[16]).replace(/[^0-9.-]/g, '')) : null,
            sheet_dpp: row[17] ? String(row[17]).trim() : null,
            shipping_courier: row[18] ? String(row[18]).trim() : null,
            dpp_number: row[19] ? String(row[19]).trim() : null,
          });
        }

        setImportData(parsed);
        setImportFileName(file.name);
        setIsParsing(false);
      } catch (err) {
        console.error(err);
        alert('Gagal memproses file Excel. Pastikan format .xlsx valid.');
        setIsParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleImportSubmit() {
    if (importData.length === 0) return;
    setIsSubmittingImport(true);
    router.post(
      '/cut-off-orders/import',
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
    router.get(
      '/cut-off-orders',
      {
        ...filters,
        ...newFilters,
      },
      { preserveState: true, replace: true }
    );
  }

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-search realtime tanpa perlu tekan Enter (debounce 400ms)
  useEffect(() => {
    if (search === (filters.search ?? '')) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      applyFilters({ search });
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    applyFilters({ search });
  }

  function parseJlFile(file: File) {
    setIsParsingJl(true);
    setJlImportFile(file);
    setJlPreviewData(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) throw new Error('File kosong atau tidak dapat dibaca');

        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        let headerOrderIdx = -1;
        let headerJlIdx = -1;

        for (let r = 0; r < Math.min(25, rows.length); r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').toLowerCase().trim();
            if (/^(no|nomor)?\s*(pesanan|order|order_number|order_sn)\b/i.test(cellVal)) {
              headerOrderIdx = c;
            }
            if (/^(no|nomor)?\s*(jl|jl_number|bukti|nomor_bukti)\b/i.test(cellVal)) {
              headerJlIdx = c;
            }
          }
        }

        const extracted: JlExcelRow[] = [];

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;

          let jl: string | null = null;
          let orderNumber: string | null = null;

          // Pendekatan 1: Kolom header eksplisit
          if (headerOrderIdx !== -1 && headerJlIdx !== -1 && r > 0) {
            const rawJl = String(row[headerJlIdx] || '').trim();
            const rawOrder = String(row[headerOrderIdx] || '').trim();
            if (/^JL/i.test(rawJl) && rawOrder.length >= 8) {
              jl = rawJl;
              const cleanOrder = rawOrder.replace(/\([0-9\-\.]+\)/g, '').trim().split(/\s+/)[0];
              if (cleanOrder && cleanOrder.length >= 8 && !cleanOrder.toUpperCase().includes('DPP')) {
                orderNumber = cleanOrder;
              }
            }
          }

          // Pendekatan 2: Universal Pattern Search (seperti Kartu Piutang Jaya Mandiri / dendy asoy)
          if (!jl || !orderNumber) {
            for (let c = 0; c < row.length; c++) {
              const cell = row[c];
              if (typeof cell === 'string') {
                const val = cell.trim();
                if (/^JL[\/\-_]?[0-9]+/i.test(val)) {
                  jl = val;
                }
                if (val.includes('(1-') || /^[0-9A-Za-z]{12,25}$/.test(val)) {
                  const stripped = val.replace(/\([0-9\-\.]+\)/g, '').trim();
                  const token = stripped.split(/\s+/)[0];
                  if (
                    token &&
                    token.length >= 10 &&
                    !token.toUpperCase().includes('DPP') &&
                    !token.toUpperCase().includes('SALDO') &&
                    !token.toUpperCase().includes('SHOPEE') &&
                    !token.toUpperCase().includes('TIKTOK')
                  ) {
                    orderNumber = token;
                  }
                }
              }
            }
          }

          if (jl && orderNumber) {
            extracted.push({ order_number: orderNumber, jl_number: jl });
          }
        }

        const unique: JlExcelRow[] = [];
        const seen = new Set<string>();
        for (const item of extracted) {
          if (!seen.has(item.order_number)) {
            seen.add(item.order_number);
            unique.push(item);
          }
        }

        if (unique.length === 0) {
          alert('Tidak ditemukan data Nomor JL dan Nomor Pesanan yang cocok di dalam file Excel ini. Pastikan file berisi nomor bukti JL dan nomor pesanan.');
          setIsParsingJl(false);
          return;
        }

        const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
        const response = await fetch('/cut-off-orders/import-jl/preview', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken,
          },
          body: JSON.stringify({ items: unique }),
        });

        if (!response.ok) {
          throw new Error(`Gagal memuat preview dari server: HTTP ${response.status}`);
        }

        const data: JlPreviewResult = await response.json();
        setJlPreviewData(data);
      } catch (err: any) {
        alert(err.message || 'Gagal memproses file Excel.');
      } finally {
        setIsParsingJl(false);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function handleSubmitImportJl() {
    if (!jlPreviewData || jlPreviewData.matched.length === 0) return;
    setIsSubmittingJl(true);

    router.post(
      '/cut-off-orders/import-jl',
      {
        items: jlPreviewData.matched.map((m) => ({
          order_number: m.order_number,
          jl_number: m.new_jl,
        })),
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setIsImportJlModalOpen(false);
          setJlPreviewData(null);
          setJlImportFile(null);
          setIsSubmittingJl(false);
        },
        onError: () => {
          setIsSubmittingJl(false);
        },
      }
    );
  }

  // Baris preview JL setelah filter tab dan pencarian
  const filteredJlRows = useMemo(() => {
    if (!jlPreviewData) return [];
    let list: (JlMatchedItem | JlUnmatchedItem)[] = [];
    if (jlFilterTab === 'all') {
      list = [...jlPreviewData.matched, ...jlPreviewData.unmatched];
    } else if (jlFilterTab === 'matched') {
      list = jlPreviewData.matched;
    } else if (jlFilterTab === 'unmatched') {
      list = jlPreviewData.unmatched;
    }

    if (jlSearchQuery.trim()) {
      const q = jlSearchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        const orderNo = item.order_number.toLowerCase();
        const jl = ('new_jl' in item ? item.new_jl : item.jl_number).toLowerCase();
        return orderNo.includes(q) || jl.includes(q);
      });
    }

    return list;
  }, [jlPreviewData, jlFilterTab, jlSearchQuery]);

  return (
    <AppLayout>
      <Head title="Pesanan Cut Off 2026" />

      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pesanan Cut Off 2026
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kelola {summary.total_orders.toLocaleString('id-ID')} pesanan multi-channel, monitoring gudang (OOS & substitusi SKU), dan tracking pelunasan DPP.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
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
                {/* Upload Excel (.xlsx) */}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Upload Excel (.xlsx)
                </button>

                {/* Import No. JL (.xlsx / .xls) */}
                <button
                  onClick={() => {
                    setIsImportJlModalOpen(true);
                    setJlPreviewData(null);
                    setJlImportFile(null);
                    setJlSearchQuery('');
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                  title="Import Nomor JL dari Excel (Kartu Piutang Jaya Mandiri / format internal)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Import No. JL
                </button>

                {/* Tambah Pesanan Manual */}
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  + Tambah Pesanan
                </button>
              </>
            )}

            {/* Refresh */}
            <button
              onClick={() => router.reload()}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Refresh data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>

            {/* Kosongkan Seluruh Data Cut Off (Super Admin Only) */}
            {canManage && isSuperAdmin && (
              <button
                onClick={handleTruncate}
                disabled={isTruncating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-2xs whitespace-nowrap"
                title="Kosongkan seluruh data Pesanan Cut Off untuk mulai bersih dari marketplace"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-rose-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                {isTruncating ? 'Mengosongkan...' : 'Kosongkan Data'}
              </button>
            )}
          </div>
        </div>

        {/* 4 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Pesanan</span>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{summary.total_orders.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Data sheet Cut Off 2026</p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">OOS / Stok Habis</span>
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-rose-600 mt-3">{summary.total_oos.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Butuh SKU Pengganti</p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Retur Jual (RJ)</span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-amber-600 mt-3">{summary.total_rj.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Pesanan retur / kompensasi</p>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Est. Bersih</span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-900 mt-3 truncate">{formatRupiah(summary.total_est_income)}</p>
            <p className="text-xs text-slate-500 mt-1">{summary.total_has_dpp} pesanan cair (DPP)</p>
          </div>
        </div>

        {/* Filter Pills Channel / Toko */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => {
                setSelectedChannel('all');
                applyFilters({ channel: 'all' });
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedChannel === 'all'
                  ? 'bg-[#0B132B] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua Toko ({summary.total_orders.toLocaleString('id-ID')})
            </button>
            {channels.map((ch) => (
              <button
                key={ch.name}
                onClick={() => {
                  setSelectedChannel(ch.name);
                  applyFilters({ channel: ch.name });
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedChannel === ch.name
                    ? 'bg-[#0B132B] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {ch.name} ({ch.count.toLocaleString('id-ID')})
              </button>
            ))}
          </div>

          {/* Search & Filter Dropdowns Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="sm:col-span-2 lg:col-span-3 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari No. Pesanan, JL, SKU, Pembeli..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-[#0B132B] focus:bg-white transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    applyFilters({ search: '' });
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors"
                  title="Hapus pencarian"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </form>

            {/* Filter Tipe Layanan (Instan / Sameday / Reguler / Hemat / Kargo) */}
            <div className="lg:col-span-2">
              <select
                value={selectedTier}
                onChange={(e) => {
                  setSelectedTier(e.target.value);
                  applyFilters({ shipping_tier: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Tipe Layanan</option>
                <option value="instant">⚡ Instan (Prioritas)</option>
                <option value="sameday">⏱️ Sameday</option>
                <option value="reguler">🚚 Reguler / Standar</option>
                <option value="hemat">🏷️ Hemat / Economy</option>
                <option value="kargo">📦 Kargo / Trucking</option>
              </select>
            </div>

            {/* Filter Pengiriman / Kurir */}
            <div className="lg:col-span-2">
              <select
                value={selectedCourier}
                onChange={(e) => {
                  setSelectedCourier(e.target.value);
                  applyFilters({ shipping_courier: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Kurir</option>
                <optgroup label="Ekspedisi Populer">
                  <option value="SPX">Shopee Xpress (SPX)</option>
                  <option value="J&T">J&T Express</option>
                  <option value="SiCepat">SiCepat</option>
                  <option value="Anteraja">Anteraja</option>
                  <option value="ID Express">ID Express</option>
                  <option value="Ninja">Ninja Xpress</option>
                  <option value="Pos">Pos Indonesia</option>
                </optgroup>
                {couriers.length > 0 && (
                  <optgroup label="Layanan Kurir Lengkap">
                    {couriers.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.count.toLocaleString('id-ID')})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Filter Info Gudang */}
            <div className="lg:col-span-2">
              <select
                value={selectedInfo}
                onChange={(e) => {
                  setSelectedInfo(e.target.value);
                  applyFilters({ info_gudang: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Info Gudang</option>
                <option value="oos">OOS (Habis / Perlu Solusi)</option>
                <option value="STICKER">STICKER</option>
                <option value="GIFT">GIFT / HADIAH</option>
                <option value="BATAL">BATAL</option>
              </select>
            </div>

            {/* Filter Status Pesanan */}
            <div className="lg:col-span-2">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  applyFilters({ order_status: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Status Pesanan</option>
                <option value="selesai">Transaksi Selesai</option>
                <option value="rj">Retur Jual (RJ)</option>
                <option value="batal">Dibatalkan</option>
              </select>
            </div>

            {/* Filter Status DPP */}
            <div className="lg:col-span-2">
              <select
                value={selectedDpp}
                onChange={(e) => {
                  setSelectedDpp(e.target.value);
                  applyFilters({ dpp_status: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua DPP</option>
                <option value="has_dpp">Ada No. DPP</option>
                <option value="no_dpp">Belum DPP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap">
                  <th className="py-3 px-3 text-center w-12">No</th>
                  <th className="py-3 px-4">Toko & Tanggal</th>
                  <th className="py-3 px-4">Pesanan & Pengiriman</th>
                  <th className="py-3 px-4">Barang & SKU</th>
                  <th className="py-3 px-4 whitespace-nowrap">SKU Pengganti</th>
                  <th className="py-3 px-4">Info Gudang</th>
                  <th className="py-3 px-4">Status Pesanan</th>
                  <th className="py-3 px-4">Keuangan & DPP</th>
                  {canManage && <th className="py-3 px-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.data.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 9 : 8} className="py-16 text-center">
                      <div className="max-w-md mx-auto flex flex-col items-center">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">Tabel Pesanan Cut Off Kosong</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
                          Data pesanan siap ditarik langsung dari API Shopee atau TikTok untuk data yang bersih dan akurat.
                        </p>
                        {canManage && (
                          <div className="mt-4 flex items-center gap-2">
                            <Link
                              href="/marketplace/shopee"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EE4D2D] text-white text-xs font-semibold hover:bg-[#d83f21] transition-colors"
                            >
                              Tarik Data Shopee
                            </Link>
                            <Link
                              href="/marketplace/tiktok"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                            >
                              Tarik Data TikTok
                            </Link>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  orders.data.map((order, index) => {
                    const rowNumber = (orders.current_page - 1) * orders.per_page + index + 1;
                    const isOos = order.info_gudang && order.info_gudang.includes('OOS');
                    const isRj = order.order_status && (order.order_status.includes('RJ') || order.order_status.includes('Retur'));
                    const shippingTier = getShippingTier(order.shipping_courier);
                    const isOrderCod = Boolean(
                      (order.payment_method && (
                        order.payment_method.toLowerCase().includes('cod') ||
                        order.payment_method.toLowerCase().includes('cash on delivery')
                      )) ||
                      (order.order_status && order.order_status.toLowerCase().includes('cod'))
                    );

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* No */}
                        <td className="py-3.5 px-3 text-center text-xs font-bold text-slate-500 whitespace-nowrap">
                          {rowNumber}
                        </td>

                        {/* Toko & Tanggal */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#0B132B] text-white font-bold text-[10px] tracking-wide">
                              {order.channel}
                            </span>
                            {formatTime(order.order_date) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200" title={`Pukul ${formatTime(order.order_date)}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-slate-400">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatTime(order.order_date)}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-800 text-xs font-semibold">
                            {formatDate(order.order_date)}
                          </p>
                        </td>

                        {/* Pesanan & Pengiriman */}
                        <td className="py-3.5 px-4 font-mono max-w-[240px]">
                          <p className="font-bold text-slate-900 hover:text-blue-600 transition-colors cursor-pointer select-all truncate" title={order.order_number}>
                            {order.order_number}
                          </p>
                          {order.jl_number && (
                            <p className="text-blue-700 font-semibold text-[11px] mt-0.5 truncate" title={order.jl_number}>
                              {order.jl_number}
                            </p>
                          )}
                          {order.buyer_username && (
                            <p className="text-slate-500 font-sans text-[11px] truncate mt-0.5" title={order.buyer_username}>
                              @{order.buyer_username}
                            </p>
                          )}

                          {/* Ekspedisi & Tipe Layanan Badge */}
                          {order.shipping_courier ? (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 font-sans">
                              {/* Tipe Layanan Badge (Instan / Sameday / Reguler / Hemat / Kargo) */}
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border tracking-wide whitespace-nowrap ${shippingTier.badgeClass}`}
                                title={`Tipe Pengiriman: ${shippingTier.label}`}
                              >
                                <span>{shippingTier.icon}</span>
                                <span>{shippingTier.label}</span>
                              </span>

                              {/* Nama Kurir */}
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 max-w-[150px] truncate"
                                title={`Ekspedisi: ${order.shipping_courier}`}
                              >
                                <span className="truncate">{order.shipping_courier}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-sans text-[10px] block mt-1">— Kurir belum ada</span>
                          )}
                        </td>

                        {/* Barang & SKU */}
                        <td className="py-3.5 px-4 max-w-[240px]">
                          <p className="font-semibold text-slate-900 truncate" title={order.sku_utama ?? ''}>
                            {order.sku_utama ?? '—'}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span>QTY: <strong className="text-slate-900">{order.qty}</strong></span>
                            {order.recheck_qty !== null && (
                              <span className="text-emerald-600 font-medium">Recheck: {order.recheck_qty}</span>
                            )}
                          </div>
                        </td>

                        {/* SKU Pengganti */}
                        <td className="py-3.5 px-4 whitespace-nowrap max-w-[240px]">
                          {order.sku_pengganti ? (
                            <p
                              className={`font-semibold text-emerald-700 truncate whitespace-nowrap ${canManage ? 'cursor-pointer hover:underline' : ''}`}
                              title={`SKU Pengganti: ${order.sku_pengganti}${canManage ? ' (Klik untuk edit)' : ''}`}
                              onClick={() => canManage && openEditModal(order)}
                            >
                              {order.sku_pengganti}
                            </p>
                          ) : (
                            <span
                              className={`text-slate-400 text-[11px] ${canManage ? 'cursor-pointer hover:text-slate-600' : ''}`}
                              title={canManage ? 'Klik untuk isi SKU pengganti' : undefined}
                              onClick={() => canManage && openEditModal(order)}
                            >
                              —
                            </span>
                          )}
                        </td>

                        {/* Gudang & Solusi */}
                        <td className="py-3.5 px-4">
                          {order.info_gudang ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isOos
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {order.info_gudang}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}

                          {order.keterangan_solutif && (
                            <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 max-w-[180px]" title={order.keterangan_solutif}>
                              {order.keterangan_solutif}
                            </p>
                          )}
                        </td>

                        {/* Status Pesanan */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {order.order_status ? (
                            <div>
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                  isRj
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : order.order_status.toLowerCase().includes('selesai')
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : order.order_status.toLowerCase().includes('batal') || order.order_status.toLowerCase().includes('cancel')
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : isOrderCod
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-bold'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isOrderCod && (order.order_status === 'Belum Bayar' || order.order_status.toLowerCase().includes('belum bayar'))
                                  ? 'Perlu Dikirim [COD]'
                                  : order.order_status}
                              </span>

                              {/* Label Keterangan Metode Pembayaran */}
                              {isOrderCod ? (
                                <span className="block mt-1 text-[10px] font-bold text-amber-700 tracking-tight">
                                  💵 Bayar di Tempat (COD)
                                </span>
                              ) : order.payment_method ? (
                                <span className="block mt-1 text-[10px] text-slate-500 font-medium truncate max-w-[150px]" title={order.payment_method}>
                                  💳 {order.payment_method}
                                </span>
                              ) : null}

                              {(order.cancel_reason || order.cancel_by) && (
                                <div className="mt-1 text-[10px] text-rose-600 leading-tight max-w-[200px]" title={order.cancel_reason || ''}>
                                  {order.cancel_by && <span className="font-bold text-rose-700">[{order.cancel_by}] </span>}
                                  <span>{order.cancel_reason || 'Pesanan dibatalkan'}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Keuangan & DPP */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <p className="font-semibold text-slate-900">
                            {formatRupiah(order.est_net_income)}
                          </p>
                          <div className="flex flex-col gap-0.5 mt-1">
                            {order.dpp_number ? (
                              <span className="inline-block font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 w-fit">
                                {order.dpp_number}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Belum DPP</span>
                            )}
                          </div>
                        </td>

                        {/* Aksi */}
                        {canManage && (
                          <td className="py-3.5 px-3 text-center">
                            <button
                              onClick={() => openEditModal(order)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-[#0B132B] transition-all border border-slate-200"
                              title="Edit info pesanan / solusi gudang"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                              </svg>
                            </button>
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
              Menampilkan {orders.from ?? 0}–{orders.to ?? 0} dari {orders.total.toLocaleString('id-ID')} pesanan
            </span>

            <div className="flex items-center gap-1">
              {orders.links.map((link, idx) => {
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
                    onClick={() => router.get(link.url!, {}, { preserveState: true })}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
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

      {/* Modal Quick Edit Order */}
      {editingOrder && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setEditingOrder(null)}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all animate-scale-up space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Edit Informasi Pesanan</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">#{editingOrder.order_number}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                {/* Informasi Barang & SKU */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Barang & SKU</span>
                    <span className="font-semibold text-slate-900 text-xs truncate block font-mono select-all" title={editingOrder.sku_utama ?? ''}>
                      {editingOrder.sku_utama || '—'}
                    </span>
                    {editingOrder.product_name && editingOrder.product_name !== editingOrder.sku_utama && (
                      <span className="text-[11px] text-slate-500 truncate block mt-0.5" title={editingOrder.product_name}>
                        {editingOrder.product_name}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Qty Pesanan</span>
                    <span className="font-bold text-slate-900 text-xs">{editingOrder.qty} pcs</span>
                  </div>
                </div>

                {(editingOrder.cancel_reason || editingOrder.cancel_by) && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-rose-900">
                      <span className="w-2 h-2 rounded-full bg-rose-600" />
                      Informasi Pembatalan {editingOrder.cancel_by ? `(${editingOrder.cancel_by})` : ''}
                    </p>
                    <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                      {editingOrder.cancel_reason || 'Pesanan dibatalkan di platform marketplace.'}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Status Gudang (INFO GDG)</label>
                  <input
                    type="text"
                    value={editForm.data.info_gudang}
                    onChange={(e) => editForm.setData('info_gudang', e.target.value)}
                    placeholder="Misal: OOS, READY, STICKER..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">SKU Pengganti (Jika OOS)</label>
                  <input
                    type="text"
                    value={editForm.data.sku_pengganti}
                    onChange={(e) => editForm.setData('sku_pengganti', e.target.value)}
                    placeholder="Masukkan SKU pengganti..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Ekspedisi / Jasa Pengiriman</label>
                  <input
                    type="text"
                    value={editingOrder.shipping_courier || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-all"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Keterangan Solutif</label>
                  <textarea
                    value={editForm.data.keterangan_solutif}
                    onChange={(e) => editForm.setData('keterangan_solutif', e.target.value)}
                    placeholder="Catatan penanganan retur, denda, atau ganti ukuran..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Pesanan</label>
                    <input
                      type="text"
                      value={editingOrder.order_status || ''}
                      disabled
                      readOnly
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-all"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. DPP (Pencairan)</label>
                    <input
                      type="text"
                      value={editForm.data.dpp_number}
                      onChange={(e) => editForm.setData('dpp_number', e.target.value)}
                      placeholder="DPP/000..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={editForm.processing}
                    className="px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50"
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

      {/* Modal 1: Tambah Pesanan Manual */}
      {isCreateModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all animate-scale-up space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Tambah Pesanan Cut Off Baru</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Input data pesanan baru secara manual ke database</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Toko / Channel */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Toko / Channel *</label>
                    <input
                      type="text"
                      required
                      value={createForm.data.channel}
                      onChange={(e) => createForm.setData('channel', e.target.value)}
                      placeholder="Misal: TT, SP, LAZ..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Tanggal & Jam Pesanan */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Tanggal & Jam</label>
                    <input
                      type="datetime-local"
                      value={createForm.data.order_date}
                      onChange={(e) => createForm.setData('order_date', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* No. Pesanan */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pesanan *</label>
                    <input
                      type="text"
                      required
                      value={createForm.data.order_number}
                      onChange={(e) => createForm.setData('order_number', e.target.value)}
                      placeholder="Contoh: 57900123891..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* No. JL */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. JL</label>
                    <input
                      type="text"
                      value={createForm.data.jl_number}
                      onChange={(e) => createForm.setData('jl_number', e.target.value)}
                      placeholder="No. JL (opsional)..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Username Pembeli */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Username Pembeli</label>
                    <input
                      type="text"
                      value={createForm.data.buyer_username}
                      onChange={(e) => createForm.setData('buyer_username', e.target.value)}
                      placeholder="Nama / user pembeli..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Kurir / Jasa Pengiriman */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Jasa Pengiriman / Kurir</label>
                    <input
                      type="text"
                      value={createForm.data.shipping_courier}
                      onChange={(e) => createForm.setData('shipping_courier', e.target.value)}
                      placeholder="SPX, J&T Express, Anteraja..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* SKU Utama */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">SKU Utama</label>
                    <input
                      type="text"
                      value={createForm.data.sku_utama}
                      onChange={(e) => createForm.setData('sku_utama', e.target.value)}
                      placeholder="SKU produk..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* SKU Pengganti */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">SKU Pengganti (Jika OOS)</label>
                    <input
                      type="text"
                      value={createForm.data.sku_pengganti}
                      onChange={(e) => createForm.setData('sku_pengganti', e.target.value)}
                      placeholder="SKU ganti jika ada..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Qty */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Jumlah (QTY) *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={createForm.data.qty}
                      onChange={(e) => createForm.setData('qty', parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                {/* Nama Barang */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Nama Barang / Deskripsi</label>
                  <input
                    type="text"
                    value={createForm.data.product_name}
                    onChange={(e) => createForm.setData('product_name', e.target.value)}
                    placeholder="Nama barang atau catatan ukuran..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Info Gudang */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Info Gudang</label>
                    <input
                      type="text"
                      value={createForm.data.info_gudang}
                      onChange={(e) => createForm.setData('info_gudang', e.target.value)}
                      placeholder="READY, OOS, STICKER..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Status Pesanan */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Pesanan</label>
                    <input
                      type="text"
                      value={createForm.data.order_status}
                      onChange={(e) => createForm.setData('order_status', e.target.value)}
                      placeholder="Diproses, Selesai, RJ..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Est Net Income */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Est. Pendapatan Bersih (Rp)</label>
                    <input
                      type="number"
                      value={createForm.data.est_net_income}
                      onChange={(e) => createForm.setData('est_net_income', e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Keterangan Solutif</label>
                  <textarea
                    value={createForm.data.keterangan_solutif}
                    onChange={(e) => createForm.setData('keterangan_solutif', e.target.value)}
                    placeholder="Catatan penanganan atau keterangan gudang..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createForm.processing}
                    className="px-5 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50"
                  >
                    {createForm.processing ? 'Menyimpan...' : 'Simpan Pesanan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal 2: Upload & Import Excel (.xlsx) */}
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
              className="relative w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all animate-scale-up space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Import Data Pesanan dari Excel</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Unggah spreadsheet .xlsx / .xls format Cut Off 2026</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportData([]);
                    setImportFileName('');
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Dropzone / Upload area */}
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
                      Mendukung format .xlsx, .xls (Sheet Cut Off 20 kolom)
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
                          {importData.length.toLocaleString('id-ID')} pesanan siap diimpor
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportData([]);
                        setImportFileName('');
                      }}
                      className="text-xs text-slate-500 hover:text-rose-600 underline"
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
                            <span className="font-bold text-slate-900">{r.order_number}</span>
                            <span className="ml-2 text-slate-500">[{r.channel}]</span>
                            <p className="text-slate-500 text-[10px] mt-0.5">{r.sku_utama ?? 'Tanpa SKU'} • Qty: {r.qty}</p>
                          </div>
                          <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                            {r.shipping_courier ?? 'Kurir -'}
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
                      className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSubmit}
                      disabled={isSubmittingImport}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50"
                    >
                      {isSubmittingImport ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Menyimpan ke Database...
                        </>
                      ) : (
                        `Mulai Simpan (${importData.length.toLocaleString('id-ID')} Data)`
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

      {/* Modal 3: Import & Deteksi Nomor JL dari Excel */}
      {isImportJlModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={() => {
            if (!isSubmittingJl && !isParsingJl) {
              setIsImportJlModalOpen(false);
              setJlPreviewData(null);
              setJlImportFile(null);
            }
          }}
        >
          <div
            className="relative w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left transform transition-all animate-scale-up space-y-5 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100 text-blue-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">Import & Deteksi Nomor JL dari Excel</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Unggah file Excel (seperti Kartu Piutang Jaya Mandiri / dendy asoy.xls). Sistem akan otomatis mendeteksi Nomor Pesanan dan mencocokkan Nomor JL yang sesuai.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingJl && !isParsingJl) {
                    setIsImportJlModalOpen(false);
                    setJlPreviewData(null);
                    setJlImportFile(null);
                  }
                }}
                disabled={isSubmittingJl || isParsingJl}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step 1: Upload File Area (jika belum ada preview) */}
            {!jlPreviewData && (
              <div className="py-6">
                {isParsingJl ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="font-semibold text-slate-800 text-sm">Sedang Menganalisis File Excel...</p>
                    <p className="text-xs text-slate-500">Mendeteksi pasangan Nomor JL dan mencocokkan dengan pesanan di database ERP</p>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all block text-center">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) parseJlFile(f);
                      }}
                      className="hidden"
                    />
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-3 mx-auto">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      Klik di sini atau pilih file Excel (.xls / .xlsx)
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Mendukung file <strong>.xls / .xlsx</strong> dari Kartu Piutang (seperti <em>dendy asoy.xls</em>) maupun spreadsheet kustom (No. Pesanan & No. JL).
                    </p>
                    <span className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-xs hover:bg-blue-700 transition-colors">
                      Pilih File Excel
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* Step 2: Preview Hasil Deteksi & Pencocokan */}
            {jlPreviewData && (
              <div className="space-y-4">
                {/* File info bar */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-800 truncate">
                      File: {jlImportFile?.name || 'Excel Terpilih'}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">
                      {jlPreviewData.total_excel} data terdeteksi
                    </span>
                  </div>
                  <label className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline shrink-0">
                    Ganti File
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) parseJlFile(f);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total di Excel</span>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">{jlPreviewData.total_excel}</p>
                    <span className="text-[10px] text-slate-500">Baris Nomor JL terdeteksi</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Cocok di ERP (Siap Update)</span>
                    <p className="text-xl font-bold text-emerald-800 mt-0.5">{jlPreviewData.total_matched}</p>
                    <span className="text-[10px] text-emerald-700 font-medium">
                      {jlPreviewData.total_changed} pesanan akan diperbarui
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Tidak Ditemukan</span>
                    <p className="text-xl font-bold text-amber-800 mt-0.5">{jlPreviewData.total_unmatched}</p>
                    <span className="text-[10px] text-amber-700">Dilewati (belum ada di ERP)</span>
                  </div>
                </div>

                {/* Filter Tabs & Search */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                  <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setJlFilterTab('all')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                        jlFilterTab === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({jlPreviewData.total_excel})
                    </button>
                    <button
                      type="button"
                      onClick={() => setJlFilterTab('matched')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                        jlFilterTab === 'matched' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Cocok ({jlPreviewData.total_matched})
                    </button>
                    {jlPreviewData.total_unmatched > 0 && (
                      <button
                        type="button"
                        onClick={() => setJlFilterTab('unmatched')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                          jlFilterTab === 'unmatched' ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tidak Ada ({jlPreviewData.total_unmatched})
                      </button>
                    )}
                  </div>

                  {/* Search filter in preview */}
                  <input
                    type="text"
                    value={jlSearchQuery}
                    onChange={(e) => setJlSearchQuery(e.target.value)}
                    placeholder="Cari nomor pesanan / JL..."
                    className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                {/* Scrollable Table Preview */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-900 text-white font-semibold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="py-2.5 px-3">No. Pesanan</th>
                        <th className="py-2.5 px-3">Toko</th>
                        <th className="py-2.5 px-3">No. JL Saat Ini (Lama)</th>
                        <th className="py-2.5 px-3">No. JL Baru (Excel)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredJlRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                            Tidak ada data yang sesuai filter pencarian
                          </td>
                        </tr>
                      ) : (
                        filteredJlRows.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {item.order_number}
                              {'buyer_username' in item && item.buyer_username && (
                                <span className="block text-[10px] font-sans font-normal text-slate-500">
                                  @{item.buyer_username}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {'channel' in item ? (
                                <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px]">
                                  {item.channel}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {'current_jl' in item && item.current_jl ? item.current_jl : <span className="text-slate-400">— Kosong</span>}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                              {'new_jl' in item ? item.new_jl : item.jl_number}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {'is_changed' in item ? (
                                item.is_changed ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Siap Update
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                    Sudah Sama
                                  </span>
                                )
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                  Tidak di ERP
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportJlModalOpen(false);
                      setJlPreviewData(null);
                      setJlImportFile(null);
                    }}
                    disabled={isSubmittingJl}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs disabled:opacity-50"
                  >
                    Batal
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitImportJl}
                    disabled={isSubmittingJl || jlPreviewData.total_matched === 0}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingJl ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Terapkan & Simpan No. JL ({jlPreviewData.total_matched} Pesanan)
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </AppLayout>
  );
}
