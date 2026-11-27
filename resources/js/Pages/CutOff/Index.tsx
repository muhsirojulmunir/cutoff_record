import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';
import CutOffOrderExportModal from '../../Components/CutOffOrderExportModal';

interface CutOffOrder {
  id: number;
  row_no: string | null;
  order_date: string | null;
  processed_at?: string | null;
  ship_by_date?: string | null;
  channel: string;
  order_number: string;
  jl_number: string | null;
  buyer_username: string | null;
  shipping_courier: string | null;
  payment_method?: string | null;
  sku_utama: string | null;
  sku_pengganti: string | null;
  product_name: string | null;
  variation_name?: string | null;
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
  management_flag?: 'harga_bermasalah' | 'margin_tipis' | 'ongkir_tidak_wajar' | string | null;
  management_note?: string | null;
  management_reviewed_by?: number | null;
  management_reviewed_by_name?: string | null;
  management_reviewed_at?: string | null;
  management_resolved_at?: string | null;
  management_resolved_by_name?: string | null;
  management_resolved_note?: string | null;
  financial_breakdown?: CutOffOrderFinancialBreakdown | null;
}

interface ReviewSummary {
  total_flagged: number;
  total_unresolved: number;
  total_resolved: number;
  harga_bermasalah: number;
  margin_tipis: number;
  ongkir_tidak_wajar: number;
}

interface CutOffOrderBreakdownItem {
  name: string;
  variation: string | null;
  sku: string | null;
  qty: number;
  subtotal: number;
  voucher_share: number;
  net_before_fee: number;
  est_net_income: number;
}

interface CutOffOrderFinancialBreakdown {
  subtotal_order: number;
  seller_voucher: number;
  voucher_per_item: number;
  item_count: number;
  net_base: number;
  fee_rate: number;
  is_cancelled?: boolean;
  est_net_income: number;
  items: CutOffOrderBreakdownItem[];
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
    management_review?: string;
  };
  summary: {
    total_orders: number;
    daily_products: number;
    daily_orders: number;
    daily_est_income?: number;
    daily_date_label: string;
    total_rj: number;
    total_has_dpp: number;
    total_ready?: number;
    total_oos?: number;
    total_substitusi?: number;
    total_has_resi?: number;
    total_items_qty?: number;
    total_est_income: number;
    total_net_payout: number;
  };
  channels: { name: string; count: number }[];
  couriers?: { name: string; count: number }[];
  reviewSummary?: ReviewSummary | null;
}

type ManagementFlagKey = 'harga_bermasalah' | 'margin_tipis' | 'ongkir_tidak_wajar';

const MANAGEMENT_FLAG_OPTIONS: Array<{
  key: ManagementFlagKey;
  label: string;
  shortLabel: string;
  dotClass: string;
  badgeClass: string;
  pillActiveClass: string;
  rowClass: string;
  leftBorderClass: string;
}> = [
  {
    key: 'harga_bermasalah',
    label: 'Harga Bermasalah / Terlalu Rendah',
    shortLabel: 'Harga Bermasalah',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    pillActiveClass: 'bg-rose-600 text-white border-rose-600',
    rowClass: 'bg-rose-50/35 hover:bg-rose-50/70',
    leftBorderClass: 'border-l-4 border-l-rose-500',
  },
  {
    key: 'margin_tipis',
    label: 'Margin Tipis / Voucher Kebesaran',
    shortLabel: 'Margin Tipis',
    dotClass: 'bg-amber-400',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    pillActiveClass: 'bg-amber-500 text-white border-amber-500',
    rowClass: 'bg-amber-50/30 hover:bg-amber-50/60',
    leftBorderClass: 'border-l-4 border-l-amber-400',
  },
  {
    key: 'ongkir_tidak_wajar',
    label: 'Potongan / Ongkir Tidak Wajar',
    shortLabel: 'Ongkir Tidak Wajar',
    dotClass: 'bg-orange-500',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    pillActiveClass: 'bg-orange-600 text-white border-orange-600',
    rowClass: 'bg-orange-50/30 hover:bg-orange-50/60',
    leftBorderClass: 'border-l-4 border-l-orange-500',
  },
];

function getManagementFlagMeta(flag: string | null | undefined) {
  return MANAGEMENT_FLAG_OPTIONS.find((opt) => opt.key === flag) ?? null;
}

function getPicResponsePresets(channel: string | null | undefined): string[] {
  const ch = (channel ?? '').toUpperCase();
  const isTiktok = ch.startsWith('TT') || ch.includes('TIKTOK');
  const platformName = isTiktok ? 'TikTok' : 'Shopee';
  return [
    `Subsidi ${platformName}`,
    `Promo / Flash Sale ${platformName}`,
    'Voucher / Diskon Toko',
    'Harga Normal / Sudah Dicek',
  ];
}

function formatRupiah(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

function parseDateToMs(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  // If ISO string with Z or timezone offset (+07:00), Date.parse converts UTC to local milliseconds
  if (dateStr.includes('Z') || (dateStr.includes('+') && dateStr.includes(':'))) {
    const timestamp = Date.parse(dateStr);
    return isNaN(timestamp) ? null : timestamp;
  }
  // Otherwise it's a local SQL datetime string "YYYY-MM-DD HH:mm:ss"
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const dateObj = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
      ss ? parseInt(ss, 10) : 0
    );
    return dateObj.getTime();
  }
  const timestamp = Date.parse(dateStr);
  return isNaN(timestamp) ? null : timestamp;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ms = parseDateToMs(dateStr);
  if (!ms) return dateStr;
  const d = new Date(ms);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()] || ''} ${d.getFullYear()}`;
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
      badgeClass: 'bg-stone-100 text-stone-900 border-stone-300 font-bold',
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
  const ms = parseDateToMs(dateStr);
  if (!ms) return null;
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (hh === '00' && mm === '00' && !dateStr.includes(':')) {
    return null;
  }
  return `${hh}:${mm}`;
}

function getRelativeTime(
  dateStr: string | null | undefined,
  nowMs: number
): { label: string; isRecent: boolean } | null {
  const ms = parseDateToMs(dateStr);
  if (!ms) return null;

  const diffSec = Math.floor((nowMs - ms) / 1000);
  if (diffSec < 60) {
    return { label: 'Baru saja', isRecent: true };
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return {
      label: `${diffMin} mnt lalu`,
      isRecent: diffMin <= 30,
    };
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return {
      label: `${diffHour} jam lalu`,
      isRecent: false,
    };
  }

  const diffDays = Math.floor(diffHour / 24);
  return {
    label: `${diffDays} hari lalu`,
    isRecent: false,
  };
}

function formatBreakdownCurrency(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasDecimals = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(rounded);
}

export default function CutOffIndex({ orders, filters, summary, channels = [], couriers = [], reviewSummary = null }: Props) {
  const { auth } = usePage<any>().props;
  const roleName: string = auth?.user?.role?.name ?? '';
  const rolesList: string[] = Array.isArray(auth?.user?.roles) ? auth.user.roles : [];
  const isSuperAdmin = Boolean(
    auth?.user?.is_super_admin ||
    roleName === 'Super Admin' ||
    rolesList.includes('Super Admin')
  );
  const isAdmin = !isSuperAdmin && (roleName === 'Admin' || rolesList.includes('Admin'));
  const isDirektur = !isSuperAdmin && (roleName === 'Direktur' || rolesList.includes('Direktur'));
  const isManagement = !isSuperAdmin && (roleName === 'Management' || rolesList.includes('Management'));
  const isPic = !isSuperAdmin && (roleName === 'PIC' || rolesList.includes('PIC'));
  const canManage = !isManagement && !isDirektur;
  const canFlagReview = isDirektur;
  const canSeeReview = isSuperAdmin || isDirektur || isPic;
  const canResolveReview = isSuperAdmin || isPic;
  const showAksiColumn = canManage || canFlagReview;
  const canViewFinancial =
    isSuperAdmin ||
    isAdmin ||
    isDirektur ||
    isManagement ||
    isPic;
  const [isTruncating, setIsTruncating] = useState(false);
  const [isSyncingShopee, setIsSyncingShopee] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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

  const safeChannels = Array.isArray(channels) ? channels : [];
  const safeCouriers = Array.isArray(couriers) ? couriers : [];
  const orderList = Array.isArray(orders?.data) ? orders.data : [];
  const paginationLinks = Array.isArray(orders?.links) ? orders.links : [];
  const safeSummary = summary || {
    total_orders: 0,
    daily_products: 0,
    daily_orders: 0,
    daily_est_income: 0,
    daily_date_label: '',
    total_rj: 0,
    total_has_dpp: 0,
    total_ready: 0,
    total_oos: 0,
    total_substitusi: 0,
    total_has_resi: 0,
    total_items_qty: 0,
    total_est_income: 0,
    total_net_payout: 0,
  };

  const [hoveredBreakdown, setHoveredBreakdown] = useState<{
    order: CutOffOrder;
    breakdown: CutOffOrderFinancialBreakdown;
    isEstimatedFallback: boolean;
    rect: { top: number; bottom: number; left: number; right: number };
  } | null>(null);

  function openBreakdownTooltip(e: React.MouseEvent<HTMLElement>, order: CutOffOrder) {
    const rect = e.currentTarget.getBoundingClientRect();
    const bd = order.financial_breakdown;
    if (bd && Array.isArray(bd.items) && bd.items.length > 0) {
      setHoveredBreakdown({
        order,
        breakdown: bd,
        isEstimatedFallback: false,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      });
      return;
    }

    const isTiktok = (order.channel ?? '').toUpperCase().includes('TT') || (order.channel ?? '').toUpperCase().includes('TIKTOK');
    const feeRate = isTiktok ? 0.75 : 0.79;
    const estNet = Number(order.est_net_income ?? 0);
    const estBase = estNet > 0 ? Math.round(estNet / feeRate) : 0;
    const fallbackBreakdown: CutOffOrderFinancialBreakdown = {
      subtotal_order: estBase,
      seller_voucher: 0,
      voucher_per_item: 0,
      item_count: 1,
      net_base: estBase,
      fee_rate: feeRate,
      is_cancelled: (order.order_status ?? '').toLowerCase().includes('batal'),
      est_net_income: estNet,
      items: [
        {
          name: order.product_name || 'Produk',
          variation: order.variation_name || null,
          sku: order.sku_utama || null,
          qty: Number(order.qty ?? 1),
          subtotal: estBase,
          voucher_share: 0,
          net_before_fee: estBase,
          est_net_income: estNet,
        },
      ],
    };

    setHoveredBreakdown({
      order,
      breakdown: fallbackBreakdown,
      isEstimatedFallback: true,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    });
  }

  function handleSyncShopeeRecent() {
    setIsMoreMenuOpen(false);
    setIsSyncingShopee(true);
    router.post('/cut-off-orders/sync-shopee', { days: 7 }, {
      preserveScroll: true,
      onFinish: () => setIsSyncingShopee(false),
    });
  }

  useEffect(() => {
    if (!hoveredBreakdown) return;
    const clear = () => setHoveredBreakdown(null);
    window.addEventListener('scroll', clear, true);
    return () => window.removeEventListener('scroll', clear, true);
  }, [hoveredBreakdown]);

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
  const [selectedReview, setSelectedReview] = useState(filters.management_review ?? 'all');

  // Direktur Review Dropdown State & PIC Resolve Popover State
  const [reviewMenuState, setReviewMenuState] = useState<{
    order: CutOffOrder;
    rect: { top: number; bottom: number; left: number; right: number };
  } | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [savingReviewOrderId, setSavingReviewOrderId] = useState<number | null>(null);
  const [resolvingOrderId, setResolvingOrderId] = useState<number | null>(null);
  const reviewPopoverRef = useRef<HTMLDivElement>(null);

  const [resolveMenuState, setResolveMenuState] = useState<{
    order: CutOffOrder;
    rect: { top: number; bottom: number; left: number; right: number };
  } | null>(null);
  const [resolveOtherMode, setResolveOtherMode] = useState(false);
  const [resolveCustomNote, setResolveCustomNote] = useState('');
  const resolvePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedReview(filters.management_review ?? 'all');
  }, [filters.management_review]);

  useEffect(() => {
    if (!reviewMenuState && !resolveMenuState) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (reviewMenuState && reviewPopoverRef.current && !reviewPopoverRef.current.contains(target)) {
        setReviewMenuState(null);
      }
      if (resolveMenuState && resolvePopoverRef.current && !resolvePopoverRef.current.contains(target)) {
        setResolveMenuState(null);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setReviewMenuState(null);
        setResolveMenuState(null);
      }
    }
    const handleScroll = () => {
      setReviewMenuState(null);
      setResolveMenuState(null);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [reviewMenuState, resolveMenuState]);

  function openReviewDropdown(e: React.MouseEvent<HTMLButtonElement>, order: CutOffOrder) {
    e.stopPropagation();
    setResolveMenuState(null);
    if (reviewMenuState?.order.id === order.id) {
      setReviewMenuState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setReviewNoteInput(order.management_note ?? '');
    setReviewMenuState({
      order,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    });
  }

  function openResolveDropdown(e: React.MouseEvent<HTMLButtonElement>, order: CutOffOrder) {
    e.stopPropagation();
    setReviewMenuState(null);
    if (resolveMenuState?.order.id === order.id) {
      setResolveMenuState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const presets = getPicResponsePresets(order.channel);
    const existingNote = (order.management_resolved_note ?? '').trim();
    const isCustomExisting = existingNote !== '' && !presets.includes(existingNote);
    setResolveOtherMode(isCustomExisting);
    setResolveCustomNote(isCustomExisting ? existingNote : '');
    setResolveMenuState({
      order,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    });
  }

  function handleSaveReview(orderId: number, flag: ManagementFlagKey | null, note: string) {
    setSavingReviewOrderId(orderId);
    router.post(
      `/cut-off-orders/${orderId}/review`,
      {
        management_flag: flag,
        management_note: flag ? note.trim() : null,
      },
      {
        preserveScroll: true,
        preserveState: true,
        onSuccess: () => {
          setReviewMenuState(null);
        },
        onFinish: () => {
          setSavingReviewOrderId(null);
        },
      }
    );
  }

  function handleResolveReview(orderId: number, resolved: boolean, resolutionNote?: string | null) {
    setResolvingOrderId(orderId);
    router.post(
      `/cut-off-orders/${orderId}/review/resolve`,
      {
        resolved,
        resolution_note: resolved ? (resolutionNote?.trim() || null) : null,
      },
      {
        preserveScroll: true,
        preserveState: true,
        onSuccess: () => {
          setResolveMenuState(null);
        },
        onFinish: () => {
          setResolvingOrderId(null);
        },
      }
    );
  }
  
  // Live Monitor State (30s background auto-refresh & real-time clock)
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [liveCountdown, setLiveCountdown] = useState(30);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  // Menu Dropdown "Aksi Lainnya" State
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    }
    if (isMoreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreMenuOpen]);

  function renderManagementReviewStripRow(order: CutOffOrder, isCancelled: boolean) {
    if (!canSeeReview || !order.management_flag) return null;
    const meta = getManagementFlagMeta(order.management_flag);
    if (!meta) return null;

    const isResolved = Boolean(order.management_resolved_at);
    const isResolvingThis = resolvingOrderId === order.id;

    return (
      <tr className="!border-t-0 bg-white">
        <td
          colSpan={showAksiColumn ? 9 : 8}
          className={`px-3 pt-0 pb-2.5 ${
            isCancelled
              ? 'border-l-4 border-l-rose-600'
              : isResolved
              ? 'border-l-4 border-l-emerald-500'
              : meta.leftBorderClass
          }`}
        >
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] ${
              isResolved
                ? 'bg-emerald-50/50 border-emerald-200/80'
                : 'bg-slate-50/90 border-slate-200/90'
            }`}
          >
            {/* Sisi Kiri: Flag Direktur & Catatan Direktur */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${meta.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                {meta.label}
              </span>

              {order.management_note && (
                <span className="text-slate-700 font-medium break-words">
                  &ldquo;{order.management_note}&rdquo;
                </span>
              )}

              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                {order.management_reviewed_by_name || 'Direktur'}
                {formatTime(order.management_reviewed_at) ? ` · ${formatTime(order.management_reviewed_at)}` : ''}
              </span>
            </div>

            {/* Sisi Kanan: Tanggapan PIC / Tombol Tanggapi */}
            <div className="flex items-center gap-2 shrink-0">
              {isResolved ? (
                <>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-600 shrink-0">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    <span>
                      {order.management_resolved_note ? (
                        <>
                          <strong>{order.management_resolved_note}</strong>
                          <span className="font-normal text-emerald-700"> · {order.management_resolved_by_name || 'PIC'}</span>
                        </>
                      ) : (
                        <>Selesai · {order.management_resolved_by_name || 'PIC'}</>
                      )}
                    </span>
                  </span>

                  {canResolveReview && (
                    <button
                      type="button"
                      disabled={isResolvingThis}
                      onClick={(e) => openResolveDropdown(e, order)}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 underline cursor-pointer disabled:opacity-50"
                    >
                      Ubah
                    </button>
                  )}
                </>
              ) : canResolveReview ? (
                <button
                  type="button"
                  disabled={isResolvingThis}
                  onClick={(e) => openResolveDropdown(e, order)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0B132B] hover:bg-slate-800 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                  <span>{isResolvingThis ? 'Menyimpan...' : 'Tanggapi'}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3 h-3 opacity-80">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              ) : (
                <span className="text-[10px] font-medium text-slate-400 italic">
                  Menunggu tanggapan PIC
                </span>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

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
    variation_name: '',
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

  // Live Monitor: Langsung reload data saat halaman pertama dibuka (tanpa delay 30 detik)
  useEffect(() => {
    if (!isLiveActive) return;
    // Reload sekali saat mount agar data langsung up-to-date
    router.reload({ only: ['orders', 'summary', 'reviewSummary'] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live Monitor: Real-time clock tick & silent periodic background refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());

      if (!isLiveActive) return;

      // Don't auto-refresh if user has any modal/form active
      if (editingOrder || isCreateModalOpen || isImportModalOpen || isImportJlModalOpen || reviewMenuState || resolveMenuState) {
        return;
      }

      setLiveCountdown((prev) => {
        if (prev <= 1) {
          router.reload({ only: ['orders', 'summary', 'reviewSummary'] });
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLiveActive, editingOrder, isCreateModalOpen, isImportModalOpen, isImportJlModalOpen, reviewMenuState, resolveMenuState]);

  function parseIndonesianNumber(val: any): number {
    if (val === '' || val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val).trim();
    if (!str || str === '-') return 0;
    if (str.includes(',') && str.includes('.')) {
      if (str.indexOf('.') < str.indexOf(',')) {
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        return parseFloat(str.replace(/,/g, '')) || 0;
      }
    } else if (str.includes('.')) {
      const parts = str.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        return parseFloat(str.replace(/\./g, '')) || 0;
      }
    } else if (str.includes(',')) {
      return parseFloat(str.replace(',', '.')) || 0;
    }
    return parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;
  }

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

        const rawHeaders = (rows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
        const isShopeeExport = rawHeaders.includes('no. pesanan') && (
          rawHeaders.includes('subtotal pesanan') ||
          rawHeaders.includes('total harga produk') ||
          rawHeaders.includes('voucher ditanggung penjual') ||
          rawHeaders.includes('nomor referensi sku') ||
          rawHeaders.includes('opsi pengiriman')
        );

        const parsed: any[] = [];

        if (isShopeeExport) {
          // Format Ekspor Asli Shopee Seller Center (Order.all...xlsx / Order.toship...xlsx)
          const noPesananIdx = rawHeaders.indexOf('no. pesanan');
          const statusPesananIdx = rawHeaders.indexOf('status pesanan');
          const opsiPengirimanIdx = rawHeaders.indexOf('opsi pengiriman');
          const waktuDibuatIdx = rawHeaders.indexOf('waktu pesanan dibuat');
          const namaProdukIdx = rawHeaders.indexOf('nama produk');
          const namaVariasiIdx = rawHeaders.indexOf('nama variasi');
          const refSkuIdx = rawHeaders.indexOf('nomor referensi sku');
          const skuIndukIdx = rawHeaders.indexOf('sku induk');
          const jumlahIdx = rawHeaders.indexOf('jumlah');
          const totalHargaProdukIdx = rawHeaders.findIndex((h: string) => h.includes('total harga produk'));
          const subtotalIdx = rawHeaders.indexOf('subtotal pesanan');
          const voucherPenjualIdx = rawHeaders.indexOf('voucher ditanggung penjual');
          const usernameIdx = rawHeaders.indexOf('username (pembeli)');
          const cancelReasonIdx = rawHeaders.indexOf('alasan pembatalan');

          const orderMap = new Map<string, any>();
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || noPesananIdx === -1 || !row[noPesananIdx]) continue;
            const sn = String(row[noPesananIdx]).trim();
            const subtotal = subtotalIdx !== -1 ? parseIndonesianNumber(row[subtotalIdx]) : 0;
            const itemSubtotal = subtotal > 0 ? subtotal : (totalHargaProdukIdx !== -1 ? parseIndonesianNumber(row[totalHargaProdukIdx]) : 0);
            const voucher = voucherPenjualIdx !== -1 ? parseIndonesianNumber(row[voucherPenjualIdx]) : 0;
            const qty = jumlahIdx !== -1 ? (parseInt(String(row[jumlahIdx]), 10) || 1) : 1;
            const itemName = namaProdukIdx !== -1 && row[namaProdukIdx] ? String(row[namaProdukIdx]).trim() : 'Produk Shopee';
            const itemVariation = namaVariasiIdx !== -1 && row[namaVariasiIdx] ? String(row[namaVariasiIdx]).trim() : null;
            const itemSku = (refSkuIdx !== -1 && row[refSkuIdx] ? String(row[refSkuIdx]).trim() : '') || (skuIndukIdx !== -1 && row[skuIndukIdx] ? String(row[skuIndukIdx]).trim() : null);

            if (!orderMap.has(sn)) {
              let orderDate = '';
              const rawDate = waktuDibuatIdx !== -1 ? row[waktuDibuatIdx] : '';
              if (typeof rawDate === 'number') {
                const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
                if (!isNaN(d.getTime())) orderDate = d.toISOString().split('T')[0];
              } else if (typeof rawDate === 'string' && rawDate.trim()) {
                orderDate = rawDate.trim().split(' ')[0];
              }

              orderMap.set(sn, {
                order_date: orderDate || new Date().toISOString().split('T')[0],
                channel: 'SH',
                order_number: sn,
                jl_number: null,
                buyer_username: usernameIdx !== -1 && row[usernameIdx] ? String(row[usernameIdx]).trim() : null,
                shipping_courier: opsiPengirimanIdx !== -1 && row[opsiPengirimanIdx] ? String(row[opsiPengirimanIdx]).trim() : null,
                sku_utama: itemSku,
                sku_pengganti: null,
                product_name: itemName,
                variation_name: itemVariation,
                qty: qty,
                recheck_qty: null,
                package_count: '1',
                info_gudang: null,
                order_status: statusPesananIdx !== -1 && row[statusPesananIdx] ? String(row[statusPesananIdx]).trim() : 'Perlu Dikirim',
                keterangan_solutif: cancelReasonIdx !== -1 && row[cancelReasonIdx] ? String(row[cancelReasonIdx]).trim() : null,
                subtotal: subtotal,
                voucher: voucher,
                sheet_dpp: null,
                dpp_number: null,
                items: [
                  {
                    name: itemName,
                    variation: itemVariation,
                    sku: itemSku,
                    qty,
                    subtotal: itemSubtotal,
                  },
                ],
              });
            } else {
              const existing = orderMap.get(sn);
              existing.qty += qty;
              existing.subtotal += subtotal;
              existing.voucher = Math.max(existing.voucher, voucher);
              existing.items.push({
                name: itemName,
                variation: itemVariation,
                sku: itemSku,
                qty,
                subtotal: itemSubtotal,
              });
            }
          }

          for (const item of orderMap.values()) {
            // Rumus Resmi ERP: Est. Bersih = (Subtotal Pesanan - Voucher Ditanggung Penjual) * 79%
            const itemCount = Math.max(1, item.items.length);
            const exactVoucherPerItem = item.voucher / itemCount;
            const voucherPerItem = Math.round(exactVoucherPerItem * 100) / 100;
            const netBase = Math.max(0, item.subtotal - item.voucher);
            const estBersih = Math.round(netBase * 0.79);
            const isCancelledOrder = String(item.order_status || '').toLowerCase().includes('batal');
            const variationDisplay = item.items.length > 1 && item.variation_name
              ? `${item.variation_name} (+${item.items.length - 1} item)`
              : item.variation_name;

            parsed.push({
              order_date: item.order_date,
              channel: item.channel,
              order_number: item.order_number,
              jl_number: item.jl_number,
              buyer_username: item.buyer_username,
              shipping_courier: item.shipping_courier,
              sku_utama: item.sku_utama,
              sku_pengganti: item.sku_pengganti,
              product_name: item.product_name,
              variation_name: variationDisplay,
              qty: item.qty,
              recheck_qty: item.recheck_qty,
              package_count: String(item.items.length || 1),
              info_gudang: item.info_gudang,
              order_status: item.order_status,
              keterangan_solutif: item.keterangan_solutif,
              est_net_income: estBersih,
              marketplace_net_payout: estBersih,
              sheet_dpp: item.sheet_dpp,
              dpp_number: item.dpp_number,
              financial_breakdown: {
                subtotal_order: Math.round(item.subtotal * 100) / 100,
                seller_voucher: Math.round(item.voucher * 100) / 100,
                voucher_per_item: voucherPerItem,
                item_count: itemCount,
                net_base: Math.round(netBase * 100) / 100,
                fee_rate: 0.79,
                is_cancelled: isCancelledOrder,
                est_net_income: estBersih,
                items: item.items.map((prod: any) => {
                  const netBeforeFee = Math.max(0, prod.subtotal - exactVoucherPerItem);
                  return {
                    ...prod,
                    voucher_share: voucherPerItem,
                    net_before_fee: Math.round(netBeforeFee * 100) / 100,
                    est_net_income: Math.round(netBeforeFee * 0.79),
                  };
                }),
              },
            });
          }
        } else {
          // Format Spreadsheet Cut Off (CUT OFF 2026 / Format Admin)
          // Deteksi header dinamis berdasarkan nama kolom
          const tglIdx = rawHeaders.findIndex((h: string) => h === 'tgl' || h.includes('tanggal') || h.includes('date'));
          const tokoIdx = rawHeaders.findIndex((h: string) => h === 'toko' || h.includes('channel') || h.includes('marketplace'));
          const orderIdx = rawHeaders.findIndex((h: string) => h.includes('no. pesanan') || h.includes('no pesanan') || h.includes('no.pesanan') || h.includes('order'));
          const jlIdx = rawHeaders.findIndex((h: string) => h.includes('data jl') || h.includes('no jl') || h.includes('jl'));
          const statusIdx = rawHeaders.findIndex((h: string) => h.includes('status pesanan') || h.includes('status'));
          const sheetDppIdx = rawHeaders.findIndex((h: string) => h.includes('sheet to dpp') || h.includes('sheet dpp'));
          const dppNumIdx = rawHeaders.findIndex((h: string) => h.includes('no dp') || h.includes('dpp'));
          const namaBarangIdx = rawHeaders.findIndex((h: string) => h.includes('nama barang') || h.includes('nama produk') || h.includes('produk'));
          const skuUtamaIdx = rawHeaders.findIndex((h: string) => h.includes('sku utama') || h === 'sku' || (h.includes('sku') && !h.includes('pengganti')));
          const skuPenggantiIdx = rawHeaders.findIndex((h: string) => h.includes('sku pengganti'));
          const qtyIdx = rawHeaders.findIndex((h: string) => h === 'qty' || h.includes('qty'));
          const recheckQtyIdx = rawHeaders.findIndex((h: string) => h.includes('jumlah produk') || h.includes('recheck'));
          const paketResiIdx = rawHeaders.findIndex((h: string) => h.includes('paket') || h.includes('resi'));
          const buyerIdx = rawHeaders.findIndex((h: string) => h.includes('username') || h.includes('pembeli') || h.includes('buyer'));
          const estBersihIdx = rawHeaders.findIndex((h: string) => h.includes('est bersih') || h.includes('est. bersih') || h.includes('est netto') || h.includes('est_net') || h.includes('bersih'));
          const pengirimanIdx = rawHeaders.findIndex((h: string) => h.includes('pengiriman') || h.includes('opsi pengiriman') || h.includes('kurir'));
          const infoGudangIdx = rawHeaders.findIndex((h: string) => h.includes('info gudang') || h.includes('gudang'));
          const ketSolutifIdx = rawHeaders.findIndex((h: string) => h.includes('keterangan') || h.includes('solutif'));

          // Jika ada header yang cocok, mulai dari baris 1; jika tidak ada header sama sekali, mulai dari 0
          const hasMatchedHeaders = orderIdx !== -1 || estBersihIdx !== -1 || skuUtamaIdx !== -1;
          const startIdx = hasMatchedHeaders ? 1 : 0;

          // Default fallback indeks jika header tidak terdeteksi (format CUT OFF 2026: TGL=0, NO=1, TOKO=2, NO_PESANAN=3, JL=4, STATUS=5, SHEET_DPP=6, NETTO=7, NO_DP=8, NAMA=9, SKU=10, SKU_PENG=11, QTY=12, JML_PESAN=13, PAKET=14, BUYER=15, EST_BERSIH=16, PENGIRIMAN=17)
          const effOrderIdx = orderIdx !== -1 ? orderIdx : 3;
          const effTglIdx = tglIdx !== -1 ? tglIdx : 0;
          const effTokoIdx = tokoIdx !== -1 ? tokoIdx : 2;
          const effJlIdx = jlIdx !== -1 ? jlIdx : 4;
          const effStatusIdx = statusIdx !== -1 ? statusIdx : 5;
          const effSheetDppIdx = sheetDppIdx !== -1 ? sheetDppIdx : 6;
          const effDppNumIdx = dppNumIdx !== -1 ? dppNumIdx : 8;
          const effNamaBarangIdx = namaBarangIdx !== -1 ? namaBarangIdx : 9;
          const effSkuUtamaIdx = skuUtamaIdx !== -1 ? skuUtamaIdx : 10;
          const effSkuPenggantiIdx = skuPenggantiIdx !== -1 ? skuPenggantiIdx : 11;
          const effQtyIdx = qtyIdx !== -1 ? qtyIdx : 12;
          const effRecheckQtyIdx = recheckQtyIdx !== -1 ? recheckQtyIdx : 13;
          const effPaketResiIdx = paketResiIdx !== -1 ? paketResiIdx : 14;
          const effBuyerIdx = buyerIdx !== -1 ? buyerIdx : 15;
          const effEstBersihIdx = estBersihIdx !== -1 ? estBersihIdx : 16;
          const effPengirimanIdx = pengirimanIdx !== -1 ? pengirimanIdx : 17;

          for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[effOrderIdx]) continue;

            const orderNum = String(row[effOrderIdx]).trim();
            if (!orderNum || orderNum.toLowerCase() === 'no. pesanan' || orderNum.toLowerCase() === 'no pesanan') continue;

            let orderDate = '';
            const rawDateVal = effTglIdx !== -1 ? row[effTglIdx] : '';
            if (typeof rawDateVal === 'number') {
              const d = new Date(Math.round((rawDateVal - 25569) * 86400 * 1000));
              if (!isNaN(d.getTime())) orderDate = d.toISOString().split('T')[0];
            } else if (typeof rawDateVal === 'string' && rawDateVal.trim()) {
              const strDate = rawDateVal.trim();
              // Parse Indonesian date format dd-mm-yy or dd-mm-yyyy or dd/mm/yyyy
              const dmyMatch = strDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
              if (dmyMatch) {
                const day = dmyMatch[1].padStart(2, '0');
                const month = dmyMatch[2].padStart(2, '0');
                let year = dmyMatch[3];
                if (year.length === 2) year = '20' + year;
                orderDate = `${year}-${month}-${day}`;
              } else {
                orderDate = strDate.split(' ')[0];
              }
            }

            const estBersihVal = effEstBersihIdx !== -1 && row[effEstBersihIdx] !== undefined && row[effEstBersihIdx] !== null
              ? parseIndonesianNumber(row[effEstBersihIdx])
              : null;

            parsed.push({
              order_date: orderDate || new Date().toISOString().split('T')[0],
              channel: effTokoIdx !== -1 && row[effTokoIdx] ? String(row[effTokoIdx]).trim() : 'MANUAL',
              order_number: orderNum,
              jl_number: effJlIdx !== -1 && row[effJlIdx] ? String(row[effJlIdx]).trim() : null,
              buyer_username: effBuyerIdx !== -1 && row[effBuyerIdx] ? String(row[effBuyerIdx]).trim() : null,
              sku_utama: effSkuUtamaIdx !== -1 && row[effSkuUtamaIdx] ? String(row[effSkuUtamaIdx]).trim() : null,
              sku_pengganti: effSkuPenggantiIdx !== -1 && row[effSkuPenggantiIdx] ? String(row[effSkuPenggantiIdx]).trim() : null,
              product_name: effNamaBarangIdx !== -1 && row[effNamaBarangIdx] ? String(row[effNamaBarangIdx]).trim() : null,
              variation_name: effNamaBarangIdx !== -1 && row[effNamaBarangIdx] ? String(row[effNamaBarangIdx]).trim() : null,
              qty: effQtyIdx !== -1 && row[effQtyIdx] ? (parseInt(String(row[effQtyIdx]), 10) || 1) : 1,
              recheck_qty: effRecheckQtyIdx !== -1 && row[effRecheckQtyIdx] ? parseInt(String(row[effRecheckQtyIdx]), 10) || null : null,
              package_count: effPaketResiIdx !== -1 && row[effPaketResiIdx] ? String(row[effPaketResiIdx]).trim() : '1',
              info_gudang: infoGudangIdx !== -1 && row[infoGudangIdx] ? String(row[infoGudangIdx]).trim() : null,
              order_status: effStatusIdx !== -1 && row[effStatusIdx] ? String(row[effStatusIdx]).trim() : 'Dikirim',
              keterangan_solutif: ketSolutifIdx !== -1 && row[ketSolutifIdx] ? String(row[ketSolutifIdx]).trim() : null,
              est_net_income: estBersihVal,
              marketplace_net_payout: estBersihVal,
              sheet_dpp: effSheetDppIdx !== -1 && row[effSheetDppIdx] ? String(row[effSheetDppIdx]).trim() : null,
              shipping_courier: effPengirimanIdx !== -1 && row[effPengirimanIdx] ? String(row[effPengirimanIdx]).trim() : null,
              dpp_number: effDppNumIdx !== -1 && row[effDppNumIdx] ? String(row[effDppNumIdx]).trim() : null,
            });
          }
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

  // Live Monitor Pill to place in top header navbar beside Super Admin
  const liveMonitorButton = (
    <button
      onClick={() => setIsLiveActive((prev) => !prev)}
      className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer shadow-2xs whitespace-nowrap ${
        isLiveActive
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 ring-1 ring-emerald-400/30'
          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
      }`}
      title={
        isLiveActive
          ? `Live Monitor Aktif: Data otomatis diperbarui dalam ${liveCountdown} detik. Klik untuk menjeda.`
          : 'Live Monitor Dijeda. Klik untuk mengaktifkan kembali.'
      }
    >
      <span className="relative flex h-2 w-2">
        {isLiveActive && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isLiveActive ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
        ></span>
      </span>
      <span>
        {isLiveActive ? (
          <>
            Live: <strong className="font-mono">{liveCountdown}s</strong>
          </>
        ) : (
          'Live: Jeda'
        )}
      </span>
    </button>
  );

  return (
    <AppLayout headerRight={liveMonitorButton}>
      <Head title="Pesanan Cut Off 2026" />

      <div className="space-y-4 sm:space-y-6 w-full max-w-[1700px] mx-auto">
        {/* Header Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Pesanan Cut Off 2026
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Kelola {summary.total_orders.toLocaleString('id-ID')} pesanan multi-channel, monitoring gudang (OOS & substitusi SKU), dan tracking pelunasan DPP.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {isDirektur && (
              <span className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xs">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-amber-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                </svg>
                Mode Direktur (Review Manajemen)
              </span>
            )}

            {isManagement && (
              <span className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Akses Management (Read-Only)
              </span>
            )}

            {/* Export Excel (.xlsx) */}
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
              title="Export data Pesanan Cut Off ke file Excel (.xlsx)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export Excel
            </button>

            {canManage && (
              <>
                {/* Upload Excel (.xlsx) */}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
                  title="Upload dan import data pesanan dari file Excel (.xlsx) 15 kolom"
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

            {/* Dropdown Menu Opsi Lanjutan / Aksi Lainnya (Super Admin) */}
            {canManage && isSuperAdmin && (
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  title="Opsi & Aksi Tambahan"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                  <span className="hidden md:inline">Opsi</span>
                </button>

                {isMoreMenuOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-40">
                    <div className="px-3 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Sinkronisasi Data
                    </div>
                    <button
                      onClick={handleSyncShopeeRecent}
                      disabled={isSyncingShopee}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`w-4 h-4 text-blue-600 shrink-0 ${isSyncingShopee ? 'animate-spin' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {isSyncingShopee ? 'Menyinkronkan Shopee...' : 'Sinkron & Hitung Ulang Shopee (7 Hari)'}
                        </p>
                        <p className="text-[10px] text-slate-400">Perbarui voucher penjual, rincian produk & Est. Bersih</p>
                      </div>
                    </button>

                    <div className="my-1.5 border-t border-slate-100" />

                    <div className="px-3 py-1 text-[11px] font-bold text-rose-500 uppercase tracking-wider">
                      Zona Bahaya
                    </div>
                    <button
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        handleTruncate();
                      }}
                      disabled={isTruncating}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-rose-600 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      <div>
                        <p className="font-semibold text-rose-700">Kosongkan Seluruh Data</p>
                        <p className="text-[10px] text-rose-400">Hapus semua pesanan Cut Off</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 4 Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Total Pesanan</span>
              <span className="p-1.5 sm:p-2 bg-blue-50 text-blue-700 rounded-xl shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <p className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-2 sm:mt-3">{summary.total_orders.toLocaleString('id-ID')}</p>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">Data sheet Cut Off 2026</p>
          </div>

          {/* Card 2: Pesanan Harian (jumlah qty produk laku dari pesanan Cut Off yang telah diproses) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Pesanan Harian</span>
              <span className="p-1.5 sm:p-2 bg-sky-50 text-sky-700 rounded-xl shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5">
              <p className="text-lg sm:text-2xl font-extrabold text-slate-900">{safeSummary.daily_products.toLocaleString('id-ID')}</p>
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500">produk</span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
              {safeSummary.daily_date_label || 'Hari Ini'} · {safeSummary.daily_orders.toLocaleString('id-ID')} order
            </p>
          </div>

          {/* Card 3: Est. Bersih Hari Ini (Finansial) ATAU Retur Jual (Gudang/Non-Finansial) */}
          {canViewFinancial ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Est. Bersih Hari Ini</span>
                <span className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-base sm:text-xl font-extrabold text-emerald-700 mt-2 sm:mt-3 truncate">
                {formatRupiah(safeSummary.daily_est_income ?? 0)}
              </p>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                {safeSummary.daily_date_label || 'Hari Ini'} · {safeSummary.daily_orders.toLocaleString('id-ID')} order
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Retur Jual</span>
                <span className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-amber-600 mt-2 sm:mt-3">{safeSummary.total_rj.toLocaleString('id-ID')}</p>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">Pesanan retur</p>
            </div>
          )}

          {/* Card 4: Total Est. Bersih (Khusus Super Admin, Direktur, PIC & Management) ATAU Monitoring Gudang */}
          {canViewFinancial ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Total Est. Bersih</span>
                <span className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </span>
              </div>
              <p className="text-base sm:text-xl font-extrabold text-slate-900 mt-2 sm:mt-3 truncate">{formatRupiah(safeSummary.total_est_income)}</p>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">{(safeSummary.total_has_dpp || 0).toLocaleString('id-ID')} cair (DPP)</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Monitoring Gudang</span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <p className="text-2xl font-extrabold text-slate-900">{(safeSummary.total_ready || 0).toLocaleString('id-ID')}</p>
                <span className="text-xs font-semibold text-emerald-600">Ready</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {(safeSummary.total_oos || 0).toLocaleString('id-ID')} OOS (Habis) · {(safeSummary.total_substitusi || 0).toLocaleString('id-ID')} Substitusi
              </p>
            </div>
          )}
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
              Semua Toko ({safeSummary.total_orders.toLocaleString('id-ID')})
            </button>
            {safeChannels.map((ch) => (
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
                {safeCouriers.length > 0 && (
                  <optgroup label="Layanan Kurir Lengkap">
                    {safeCouriers.map((c) => (
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
                <option value="diproses">Diproses</option>
                <option value="dikirim">Dikirim / Dalam Pengiriman</option>
                <option value="selesai">Transaksi Selesai</option>
                <option value="rj">Retur Jual (RJ)</option>
                <option value="batal">Dibatalkan Pembeli</option>
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

          {/* Banner Ringkasan Review Manajemen — Hanya tampil saat masih ada temuan yang belum ditanggapi */}
          {canSeeReview && ((reviewSummary?.total_unresolved ?? 0) > 0 || selectedReview !== 'all') && (() => {
            const activeFlags = MANAGEMENT_FLAG_OPTIONS.filter(
              (opt) => (reviewSummary ? Number(reviewSummary[opt.key] ?? 0) : 0) > 0
            );
            return (
              <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-900 text-amber-400 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                  </span>
                  <div>
                    <span className="font-bold text-slate-900">Perlu Tindak Lanjut</span>
                    <span className="text-slate-500 ml-1.5">
                      {(reviewSummary?.total_unresolved ?? 0) > 0
                        ? `${reviewSummary?.total_unresolved} pesanan ditandai Direktur`
                        : 'Filter review aktif'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeFlags.map((opt) => {
                    const count = reviewSummary ? Number(reviewSummary[opt.key] ?? 0) : 0;
                    const active = selectedReview === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          const next = active ? 'all' : opt.key;
                          setSelectedReview(next);
                          applyFilters({ management_review: next });
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                          active ? opt.pillActiveClass : `${opt.badgeClass} hover:opacity-85`
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : opt.dotClass}`} />
                        <span>{opt.shortLabel}</span>
                        <span className={`px-1 rounded text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-white/80 text-slate-800'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  {selectedReview !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReview('all');
                        applyFilters({ management_review: 'all' });
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Tampilkan Semua
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Data Container: Mobile Cards (HP) + Desktop Table (Laptop) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Mobile Card List (< md screens) */}
          <div className="md:hidden divide-y divide-slate-100">
            {orderList.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <p className="text-sm font-semibold text-slate-700">Tabel Pesanan Cut Off Kosong</p>
                <p className="text-xs text-slate-400 mt-1">Tidak ada pesanan yang sesuai dengan filter.</p>
              </div>
            ) : (
              orderList.map((order, index) => {
                const currentPage = orders?.current_page ?? 1;
                const perPage = orders?.per_page ?? 25;
                const rowNumber = (currentPage - 1) * perPage + index + 1;
                const shippingTier = getShippingTier(order.shipping_courier);
                const displayDate = order.processed_at || order.order_date;
                const orderStatusLower = (order.order_status ?? '').toLowerCase();
                const isCancelled = orderStatusLower.includes('batal') || orderStatusLower.includes('cancel');
                const flagMeta = canSeeReview ? getManagementFlagMeta(order.management_flag) : null;
                const isResolved = Boolean(order.management_resolved_at);
                const isResolvingThis = resolvingOrderId === order.id;

                return (
                  <div
                    key={`mobile-${order.id}`}
                    className={`p-3.5 space-y-2.5 ${
                      isCancelled
                        ? 'bg-rose-50/40 border-l-4 border-l-rose-600'
                        : flagMeta
                        ? `${isResolved ? 'border-l-4 border-l-emerald-500' : flagMeta.leftBorderClass}`
                        : ''
                    }`}
                  >
                    {/* Top Row: No, Channel, Time, Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] font-bold text-slate-400">#{rowNumber}</span>
                        <span className="inline-block px-2 py-0.5 rounded-md bg-[#0B132B] text-white font-bold text-[10px]">
                          {order.channel}
                        </span>
                        <span className="text-[11px] font-medium text-slate-600 truncate">
                          {formatDate(displayDate)}
                          {formatTime(displayDate) ? ` · ${formatTime(displayDate)}` : ''}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          isCancelled
                            ? 'bg-rose-600 text-white'
                            : orderStatusLower.includes('selesai')
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isCancelled ? 'DIBATALKAN' : order.order_status || 'Diproses'}
                      </span>
                    </div>

                    {/* Order Number, Buyer & Courier */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-slate-900 select-all">{order.order_number}</p>
                        {order.buyer_username && (
                          <p className="text-[11px] text-slate-500 truncate">@{order.buyer_username}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${shippingTier.badgeClass}`}>
                          {shippingTier.label}
                        </span>
                        {order.shipping_courier && (
                          <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {order.shipping_courier}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product & SKU */}
                    <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-100 space-y-1">
                      <p className="text-xs font-semibold text-slate-900 leading-snug">
                        {order.variation_name || order.product_name || '—'}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span className="font-mono truncate">SKU: {order.sku_utama || '—'}</span>
                        <span>QTY: <strong className="text-slate-900">{order.qty}</strong></span>
                      </div>
                      {(order.info_gudang || order.sku_pengganti) && (
                        <div className="pt-1 flex flex-wrap gap-1.5 text-[10px]">
                          {order.info_gudang && (
                            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700">
                              Gudang: {order.info_gudang}
                            </span>
                          )}
                          {order.sku_pengganti && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 font-semibold text-emerald-700">
                              Pengganti: {order.sku_pengganti}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Financial + Action Row */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      {canViewFinancial ? (
                        <div>
                          <p className={`text-sm font-extrabold ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                            {formatRupiah(order.est_net_income)}
                          </p>
                          <div className="flex items-center gap-2 text-[10px]">
                            {Boolean(order.financial_breakdown && Number(order.financial_breakdown.seller_voucher) > 0) && (
                              <span className="text-rose-600 font-medium">
                                Voucher -{formatBreakdownCurrency(Number(order.financial_breakdown?.seller_voucher || 0))}
                              </span>
                            )}
                            <span className="text-slate-400">{order.dpp_number || 'Belum DPP'}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] font-mono text-slate-500">
                          {order.jl_number ? `Resi: ${order.jl_number}` : 'Belum Ada Resi'}
                        </span>
                      )}

                      {showAksiColumn && (
                        canFlagReview ? (
                          <button
                            type="button"
                            onClick={(e) => openReviewDropdown(e, order)}
                            disabled={savingReviewOrderId === order.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                              flagMeta
                                ? flagMeta.badgeClass
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-[#0B132B] hover:text-white'
                            }`}
                          >
                            <span>{flagMeta ? flagMeta.shortLabel : 'Review'}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEditModal(order)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-[#0B132B] hover:text-white"
                          >
                            Edit
                          </button>
                        )
                      )}
                    </div>

                    {/* Review Strip on Mobile */}
                    {flagMeta && (
                      <div className={`p-2.5 rounded-xl border text-[11px] space-y-1.5 ${
                        isResolved ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold ${flagMeta.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${flagMeta.dotClass}`} />
                            {flagMeta.label}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {order.management_reviewed_by_name || 'Direktur'}
                          </span>
                        </div>
                        {order.management_note && (
                          <p className="text-slate-700 font-medium">&ldquo;{order.management_note}&rdquo;</p>
                        )}
                        {isResolved ? (
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-emerald-700 font-semibold">
                              ✓ {order.management_resolved_note || 'Selesai'} · {order.management_resolved_by_name || 'PIC'}
                            </span>
                            {canResolveReview && (
                              <button
                                type="button"
                                disabled={isResolvingThis}
                                onClick={(e) => openResolveDropdown(e, order)}
                                className="text-[10px] font-semibold text-slate-500 underline"
                              >
                                Ubah
                              </button>
                            )}
                          </div>
                        ) : canResolveReview ? (
                          <button
                            type="button"
                            disabled={isResolvingThis}
                            onClick={(e) => openResolveDropdown(e, order)}
                            className="w-full py-1.5 rounded-lg bg-[#0B132B] text-white font-semibold text-[11px]"
                          >
                            Tanggapi ▾
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap">
                  <th className="py-2.5 px-2 text-center w-10">No</th>
                  <th className="py-2.5 px-3">Toko & Tanggal</th>
                  <th className="py-2.5 px-3">Pesanan & Pengiriman</th>
                  <th className="py-2.5 px-3">Barang</th>
                  <th className="py-2.5 px-2.5">SKU Pengganti</th>
                  <th className="py-2.5 px-2.5">Info Gudang</th>
                  <th className="py-2.5 px-3">Status Pesanan</th>
                  {canViewFinancial ? (
                    <th className="py-2.5 px-3">EST Bersih</th>
                  ) : (
                    <th className="py-2.5 px-3">Kesiapan Kirim</th>
                  )}
                  {showAksiColumn && (
                    <th className={`py-2.5 px-2 text-center ${canFlagReview ? 'min-w-[116px]' : 'w-12'} sticky right-0 bg-slate-900 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]`}>
                      Aksi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderList.length === 0 ? (
                  <tr>
                    <td colSpan={showAksiColumn ? 9 : 8} className="py-16 text-center">
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
                  orderList.map((order, index) => {
                    const currentPage = orders?.current_page ?? 1;
                    const perPage = orders?.per_page ?? 25;
                    const rowNumber = (currentPage - 1) * perPage + index + 1;
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
                    const displayDate = order.processed_at || order.order_date;
                    const relativeTime = getRelativeTime(displayDate, currentTimeMs);
                    const isInstantOrder = shippingTier.label === 'INSTAN' || shippingTier.label === 'SAMEDAY';
                    const orderStatusLower = (order.order_status ?? '').toLowerCase();
                    const isProcessed = orderStatusLower.includes('diproses') || orderStatusLower === 'processed';
                    const isCancelled = orderStatusLower.includes('batal') || orderStatusLower.includes('cancel');
                    const isCompleted = orderStatusLower.includes('selesai') || orderStatusLower.includes('delivered');
                    const isShipped =
                      orderStatusLower.includes('shipped') ||
                      orderStatusLower.includes('sedang dikirim') ||
                      orderStatusLower.includes('dalam pengiriman') ||
                      (orderStatusLower.includes('dikirim') && !orderStatusLower.includes('perlu') && !orderStatusLower.includes('siap') && !orderStatusLower.includes('belum'));
                    const isPendingInstant = isInstantOrder && !isCancelled && !isCompleted && !isShipped;
                    const flagMeta = canSeeReview ? getManagementFlagMeta(order.management_flag) : null;

                    return (
                      <React.Fragment key={order.id}>
                      <tr
                        className={`group transition-colors ${
                          isCancelled
                            ? 'bg-rose-50/50 hover:bg-rose-100/60'
                            : isPendingInstant
                            ? 'bg-amber-50/30 hover:bg-amber-50/50'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* No */}
                        <td className={`py-2.5 px-2 text-center text-xs font-bold whitespace-nowrap w-10 ${
                          isCancelled
                            ? 'text-rose-600 border-l-4 border-l-rose-600 bg-rose-50/60'
                            : flagMeta
                            ? `${order.management_resolved_at ? 'border-l-4 border-l-emerald-500' : flagMeta.leftBorderClass} text-slate-700`
                            : 'text-slate-500'
                        }`}>
                          {rowNumber}
                        </td>

                        {/* Toko & Tanggal */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-[#0B132B] text-white font-bold text-[10px] tracking-wide">
                              {order.channel}
                            </span>
                            {formatTime(displayDate) && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                                title={`Pukul ${formatTime(displayDate)}${order.processed_at ? ' (Waktu Diproses)' : ''}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-slate-400">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatTime(displayDate)}
                              </span>
                            )}
                          </div>
                          <p
                            className="text-slate-800 text-xs font-semibold"
                            title={order.order_date && order.processed_at && order.order_date !== order.processed_at ? `Waktu Masuk Pesanan: ${formatDate(order.order_date)} ${formatTime(order.order_date) || ''}` : undefined}
                          >
                            {formatDate(displayDate)}
                          </p>
                          {/* Relative Time Badge */}
                          {relativeTime && (
                            <div className="mt-1 flex items-center gap-1.5">
                              {relativeTime.isRecent && (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-medium ${
                                  relativeTime.isRecent ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                                }`}
                              >
                                {relativeTime.label}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Pesanan & Pengiriman */}
                        <td className="py-2.5 px-3 font-mono max-w-[190px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p
                              className={`font-bold transition-colors select-all truncate ${
                                isCancelled ? 'text-rose-800 line-through' : 'text-slate-900 hover:text-blue-600 cursor-pointer'
                              }`}
                              title={order.order_number}
                            >
                              {order.order_number}
                            </p>
                            {isCancelled && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-600 text-white tracking-wider uppercase">
                                BATAL
                              </span>
                            )}
                          </div>
                          {order.jl_number && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <p
                                className={`font-semibold text-[11px] truncate ${
                                  isCancelled ? 'text-rose-600 line-through' : 'text-blue-700'
                                }`}
                                title={order.jl_number}
                              >
                                {order.jl_number}
                              </p>
                              {isCancelled && (
                                <span className="text-[10px] font-extrabold text-rose-600 tracking-tight">
                                  (JANGAN KIRIM)
                                </span>
                              )}
                            </div>
                          )}
                          {order.buyer_username && (
                            <p className="text-slate-500 font-sans text-[11px] truncate mt-0.5" title={order.buyer_username}>
                              @{order.buyer_username}
                            </p>
                          )}

                          {/* Ekspedisi & Tipe Layanan Badge */}
                          {order.shipping_courier ? (
                            <div className="flex flex-col gap-1 mt-1 font-sans">
                              <div className="flex flex-wrap items-center gap-1">
                                {/* Tipe Layanan Badge (Instan / Sameday / Reguler / Hemat / Kargo) */}
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md border tracking-wide whitespace-nowrap ${shippingTier.badgeClass}`}
                                  title={`Tipe Pengiriman: ${shippingTier.label}`}
                                >
                                  <span>{shippingTier.icon}</span>
                                  <span>{shippingTier.label}</span>
                                </span>

                                {/* Nama Kurir */}
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 max-w-[120px] truncate"
                                  title={`Ekspedisi: ${order.shipping_courier}`}
                                >
                                  <span className="truncate">{order.shipping_courier}</span>
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-sans text-[10px] block mt-1">— Kurir belum ada</span>
                          )}
                        </td>

                        {/* Kolom Barang (Variasi, SKU, QTY) */}
                        <td className="py-2.5 px-3 min-w-[175px] max-w-[260px]">
                          {Array.isArray(order.financial_breakdown?.items) && order.financial_breakdown.items.length > 1 ? (
                            <div className="space-y-1.5">
                              {order.financial_breakdown.items.map((item, itemIdx) => (
                                <div
                                  key={`${order.id}-item-${itemIdx}`}
                                  className={itemIdx > 0 ? 'pt-1.5 border-t border-slate-100' : ''}
                                >
                                  <p
                                    className="font-semibold text-slate-900 text-xs leading-snug truncate"
                                    title={item.variation || item.name || undefined}
                                  >
                                    {itemIdx + 1}. {item.variation || item.name || '—'}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                                    {item.sku ? (
                                      <span className="font-mono font-medium text-slate-700 truncate select-all" title={item.sku}>
                                        {item.sku}
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-medium">Tanpa SKU</span>
                                    )}
                                    <span className="text-slate-300">·</span>
                                    <span className="shrink-0">
                                      QTY: <strong className="text-slate-900 font-semibold">{item.qty}</strong>
                                    </span>
                                  </div>
                                </div>
                              ))}
                              <div className="pt-1 border-t border-dashed border-slate-200 flex items-center gap-2 text-[11px] text-slate-500">
                                <span>
                                  Qty : <strong className="text-slate-900 font-semibold">{order.qty}</strong>
                                </span>
                                {order.recheck_qty !== null && (
                                  <span className="text-emerald-600 font-medium">Recheck: {order.recheck_qty}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* 1. Variasi */}
                              <div className="mb-0.5">
                                <p className="font-semibold text-slate-900 text-xs leading-snug truncate" title={order.variation_name || order.product_name || undefined}>
                                  {order.variation_name || order.product_name || '—'}
                                </p>
                              </div>

                              {/* 2. SKU Utama */}
                              <div className="flex items-center gap-1.5 my-0.5">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">SKU:</span>
                                {order.sku_utama && order.sku_utama.trim() !== '' && order.sku_utama !== '-' ? (
                                  <span className="font-mono text-[11px] font-medium text-slate-700 truncate select-all" title={order.sku_utama}>
                                    {order.sku_utama}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Tanpa SKU
                                  </span>
                                )}
                              </div>

                              {/* 3. QTY */}
                              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <span>QTY: <strong className="text-slate-900 font-semibold">{order.qty}</strong></span>
                                {order.recheck_qty !== null && (
                                  <span className="text-emerald-600 font-medium">Recheck: {order.recheck_qty}</span>
                                )}
                              </div>
                            </>
                          )}
                        </td>

                        {/* SKU Pengganti */}
                        <td className="py-2.5 px-2.5 max-w-[130px]">
                          {order.sku_pengganti ? (
                            <p
                              className={`font-semibold text-emerald-700 truncate ${canManage ? 'cursor-pointer hover:underline' : ''}`}
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
                        <td className="py-2.5 px-2.5 max-w-[120px]">
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
                            <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 max-w-[120px]" title={order.keterangan_solutif}>
                              {order.keterangan_solutif}
                            </p>
                          )}
                        </td>

                        {/* Status Pesanan */}
                        <td className="py-2.5 px-3 max-w-[170px] align-top">
                          {order.order_status ? (
                            <div>
                              <span
                                className={`inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  isCancelled
                                    ? 'bg-rose-600 text-white border border-rose-700 shadow-xs font-extrabold tracking-wide'
                                    : isRj
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : orderStatusLower.includes('selesai')
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : isOrderCod
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-bold'
                                    : isInstantOrder && isProcessed
                                    ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isCancelled ? (
                                  <>
                                    <span>🛑</span>
                                    <span>DIBATALKAN PEMBELI</span>
                                  </>
                                ) : isOrderCod && (order.order_status === 'Belum Bayar' || orderStatusLower.includes('belum bayar')) ? (
                                  'Perlu Dikirim [COD]'
                                ) : isInstantOrder && isProcessed ? (
                                  'Menunggu Kurir'
                                ) : (
                                  order.order_status
                                )}
                              </span>

                              {isCancelled && (
                                <div className="mt-1 font-extrabold text-[10px] text-rose-700 uppercase tracking-tight flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span>JANGAN DIKIRIM KE KURIR</span>
                                </div>
                              )}

                              {/* Label Keterangan Metode Pembayaran */}
                              {!isCancelled && (
                                isOrderCod ? (
                                  <span className="block mt-0.5 text-[10px] font-bold text-amber-700 tracking-tight whitespace-nowrap">
                                    💵 COD
                                  </span>
                                ) : order.payment_method ? (
                                  <span className="block mt-0.5 text-[10px] text-slate-500 font-medium truncate max-w-[130px]" title={order.payment_method}>
                                    💳 {order.payment_method}
                                  </span>
                                ) : null
                              )}

                              {(order.cancel_reason || order.cancel_by) && (
                                <div
                                  className="mt-1 text-[10px] text-rose-600 leading-snug whitespace-normal break-words max-w-[150px]"
                                  title={order.cancel_reason || ''}
                                >
                                  {order.cancel_by && <span className="font-bold text-rose-700">[{order.cancel_by}] </span>}
                                  <span className="whitespace-normal break-words">{order.cancel_reason || 'Pesanan dibatalkan'}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Keuangan & DPP (Super Admin & Management) ATAU Kesiapan Kirim (Admin & Gudang) */}
                        {canViewFinancial ? (
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div
                              className="inline-flex flex-col items-start group/bd cursor-help"
                              onMouseEnter={(e) => openBreakdownTooltip(e, order)}
                              onMouseLeave={() => setHoveredBreakdown(null)}
                            >
                              <div className="inline-flex items-center gap-1">
                                <span className={`font-semibold underline decoration-dotted underline-offset-4 transition-colors ${
                                  isCancelled ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900 decoration-slate-300 group-hover/bd:text-blue-700 group-hover/bd:decoration-blue-400'
                                }`}>
                                  {formatRupiah(order.est_net_income)}
                                </span>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  strokeWidth={1.8}
                                  stroke="currentColor"
                                  className="w-3.5 h-3.5 text-slate-400 group-hover/bd:text-blue-600 transition-colors"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                </svg>
                              </div>
                              {Boolean(order.financial_breakdown && Number(order.financial_breakdown.seller_voucher) > 0) && (
                                <span className="text-[10px] font-medium text-rose-600 mt-0.5 tabular-nums">
                                  Voucher -{formatBreakdownCurrency(Number(order.financial_breakdown?.seller_voucher || 0))}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {order.dpp_number ? (
                                <span className="inline-block font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 w-fit">
                                  {order.dpp_number}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Belum DPP</span>
                              )}
                            </div>
                          </td>
                        ) : (
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              {order.info_gudang && order.info_gudang.includes('OOS') ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  Stok Habis (OOS)
                                </span>
                              ) : order.info_gudang && order.info_gudang.includes('SUBSTITUSI') ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  Substitusi SKU
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Siap Kirim
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 font-mono">
                                {order.jl_number ? `Resi: ${order.jl_number}` : 'Belum Ada Resi'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Aksi */}
                        {showAksiColumn && (
                          <td
                            className={`py-2.5 px-2 text-center ${canFlagReview ? 'min-w-[116px]' : 'w-12'} sticky right-0 ${
                              isPendingInstant ? 'bg-[#fffdf7] group-hover:bg-[#fff8ea]' : 'bg-white group-hover:bg-slate-50'
                            } transition-colors shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] z-10`}
                          >
                            {canFlagReview ? (
                              <button
                                type="button"
                                onClick={(e) => openReviewDropdown(e, order)}
                                disabled={savingReviewOrderId === order.id}
                                className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                                  flagMeta
                                    ? `${flagMeta.badgeClass} hover:opacity-90`
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-[#0B132B] hover:text-white hover:border-[#0B132B]'
                                }`}
                                title="Beri catatan atau tanda review manajemen"
                              >
                                {flagMeta ? (
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${flagMeta.dotClass}`} />
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                                  </svg>
                                )}
                                <span>{flagMeta ? flagMeta.shortLabel : 'Review'}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3 h-3 shrink-0 opacity-75">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => openEditModal(order)}
                                className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-[#0B132B] transition-all border border-slate-200"
                                title="Edit info pesanan / solusi gudang"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                </svg>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {renderManagementReviewStripRow(order, Boolean(isCancelled))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50">
            <span className="text-slate-500">
              Menampilkan {orders?.from ?? 0}–{orders?.to ?? 0} dari {(orders?.total ?? 0).toLocaleString('id-ID')} pesanan
            </span>

            <div className="flex items-center gap-1">
              {paginationLinks.map((link, idx) => {
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
                {/* Informasi Barang & Variasi */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Barang & Variasi</span>
                    <span className="font-semibold text-slate-900 text-xs truncate block" title={editingOrder.variation_name || editingOrder.product_name || ''}>
                      {editingOrder.variation_name || editingOrder.product_name || '—'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-medium text-slate-500 uppercase">SKU:</span>
                      <span className="font-mono text-[11px] font-medium text-slate-700 select-all">
                        {editingOrder.sku_utama || 'Tanpa SKU'}
                      </span>
                    </div>
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

                <div className={`grid ${canViewFinancial ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
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

                  {canViewFinancial && (
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
                  )}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Nama Barang */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Nama Barang / Produk</label>
                    <input
                      type="text"
                      value={createForm.data.product_name}
                      onChange={(e) => createForm.setData('product_name', e.target.value)}
                      placeholder="Nama barang atau seri produk..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Variasi / Model */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Variasi / Model</label>
                    <input
                      type="text"
                      value={createForm.data.variation_name}
                      onChange={(e) => createForm.setData('variation_name', e.target.value)}
                      placeholder="Warna, Ukuran (misal: HITAM, 36)..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className={`grid grid-cols-1 ${canViewFinancial ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
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

                  {/* Est Net Income (Khusus Super Admin & Management) */}
                  {canViewFinancial && (
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
                  )}
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

      {/* Portal Tooltip: Rincian Perhitungan Est. Bersih */}
      {hoveredBreakdown && typeof document !== 'undefined' && createPortal(
        (() => {
          const { order, breakdown, isEstimatedFallback, rect } = hoveredBreakdown;
          const openUpward = rect.bottom + 280 > window.innerHeight && rect.top > 240;
          const topPos = openUpward ? Math.max(12, rect.top - 8) : rect.bottom + 8;
          const rightPos = Math.max(12, window.innerWidth - rect.right);
          const isTiktok = (order.channel ?? '').toUpperCase().includes('TT') || (order.channel ?? '').toUpperCase().includes('TIKTOK');
          const feePct = Math.round((breakdown.fee_rate ?? (isTiktok ? 0.75 : 0.79)) * 100);
          const itemCount = breakdown.items.length;

          return (
            <div
              className="fixed z-[9999] pointer-events-none w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3.5 text-left text-slate-800 shadow-lg"
              style={{
                top: `${topPos}px`,
                right: `${rightPos}px`,
                transform: openUpward ? 'translateY(-100%)' : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Rincian Est. Bersih ({order.order_number})
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isTiktok ? 'Rumus: Order Amount × 75%' : `Rumus: (Subtotal - Voucher Penjual) × ${feePct}%`}
                  </div>
                </div>
                {itemCount > 1 && (
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    {itemCount} Produk
                  </span>
                )}
              </div>

              <div className="mt-2.5 space-y-2 max-h-56 overflow-hidden">
                {breakdown.items.map((item, idx) => (
                  <div
                    key={`${item.sku || item.name}-${idx}`}
                    className="rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-[11px]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">
                          {itemCount > 1 ? `${idx + 1}. ` : ''}
                          {item.variation || item.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {item.sku ? `SKU: ${item.sku}` : item.name} · Qty {item.qty}
                        </div>
                      </div>
                      <div className="shrink-0 font-semibold text-slate-900 tabular-nums">
                        {formatBreakdownCurrency(item.est_net_income)}
                      </div>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-600 tabular-nums">
                      {isTiktok ? (
                        <>
                          <span>Order Amount {formatBreakdownCurrency(item.subtotal)}</span>
                          <span className="text-slate-400">× 75%</span>
                        </>
                      ) : (
                        <>
                          <span>Subtotal {formatBreakdownCurrency(item.subtotal)}</span>
                          {breakdown.seller_voucher > 0 && (
                            <span className="text-rose-600">
                              - Voucher {formatBreakdownCurrency(item.voucher_share)}
                            </span>
                          )}
                          <span className="text-slate-400">× {feePct}%</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1 text-[11px] tabular-nums">
                {isTiktok ? (
                  <>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Order Amount</span>
                      <span className="font-medium text-slate-900">
                        {formatBreakdownCurrency(breakdown.subtotal_order || breakdown.net_base)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Potongan Platform (25%)</span>
                      <span className="font-medium text-rose-600">
                        -{formatBreakdownCurrency(Math.round((breakdown.subtotal_order || breakdown.net_base) * 0.25))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Dasar Bersih (75%)</span>
                      <span className="font-medium text-slate-800">
                        {formatBreakdownCurrency(breakdown.net_base || (breakdown.subtotal_order ? Math.round(breakdown.subtotal_order * 0.75) : 0))}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Subtotal Pesanan</span>
                      <span className="font-medium text-slate-900">{formatBreakdownCurrency(breakdown.subtotal_order)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>
                        Voucher Ditanggung Penjual
                        {breakdown.seller_voucher > 0 && itemCount > 1
                          ? ` (÷ ${itemCount} = ${formatBreakdownCurrency(breakdown.voucher_per_item)})`
                          : ''}
                      </span>
                      <span className={breakdown.seller_voucher > 0 ? 'font-medium text-rose-600' : 'text-slate-400'}>
                        -{formatBreakdownCurrency(breakdown.seller_voucher)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Dasar Perhitungan ({feePct}%)</span>
                      <span className="font-medium text-slate-800">{formatBreakdownCurrency(breakdown.net_base)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200 text-xs font-bold text-slate-950">
                  <span>Total Est. Bersih</span>
                  <span className="text-emerald-700">{formatRupiah(Number(order.est_net_income ?? breakdown.est_net_income ?? 0))}</span>
                </div>
                {isEstimatedFallback && (
                  <div className="text-[10px] text-amber-600 pt-0.5">
                    {isTiktok
                      ? 'Data lama sebelum sinkron breakdown — sinkron ulang di Pesanan TikTok untuk rincian terbaru.'
                      : 'Data lama sebelum sinkron breakdown — jalankan Sinkron & Hitung Ulang Shopee di menu Opsi untuk rincian per item.'}
                  </div>
                )}
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Dropdown Popover Review Manajemen (Khusus Direktur) */}
      {canFlagReview && reviewMenuState && typeof document !== 'undefined' && createPortal(
        (() => {
          const { order, rect } = reviewMenuState;
          const menuWidth = 288;
          const estimatedHeight = 295;
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
          const top = openUpward
            ? Math.max(12, rect.top - estimatedHeight - 6)
            : Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 6);
          const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
          const isSaving = savingReviewOrderId === order.id;

          return (
            <div
              ref={reviewPopoverRef}
              style={{ top: `${top}px`, left: `${left}px`, width: `${menuWidth}px` }}
              className="fixed z-[9998] bg-white rounded-2xl border border-slate-200 shadow-xl p-3.5 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Review Manajemen</p>
                  <p className="text-xs font-bold text-slate-900 font-mono truncate">#{order.order_number}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewMenuState(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-2.5">
                <textarea
                  value={reviewNoteInput}
                  onChange={(e) => setReviewNoteInput(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Catatan singkat untuk PIC / Super Admin (opsional)..."
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0B132B] focus:bg-white resize-none"
                />
              </div>

              <div className="mt-2.5 space-y-1.5">
                {MANAGEMENT_FLAG_OPTIONS.map((opt) => {
                  const isSelected = order.management_flag === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveReview(order.id, opt.key, reviewNoteInput)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? `${opt.badgeClass} ring-1 ring-inset ring-current/25`
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotClass}`} />
                        <span className="leading-snug">{opt.label}</span>
                      </span>
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {order.management_flag && (
                <div className="mt-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveReview(order.id, null, '')}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Hapus Tanda Review
                  </button>
                </div>
              )}
            </div>
          );
        })(),
        document.body
      )}

      {/* Dropdown Popover Tanggapan PIC / Super Admin (Sesuai Platform) */}
      {canResolveReview && resolveMenuState && typeof document !== 'undefined' && createPortal(
        (() => {
          const { order, rect } = resolveMenuState;
          const presets = getPicResponsePresets(order.channel);
          const menuWidth = 288;
          const estimatedHeight = resolveOtherMode ? 330 : 260;
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
          const top = openUpward
            ? Math.max(12, rect.top - estimatedHeight - 6)
            : Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 6);
          const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
          const isSaving = resolvingOrderId === order.id;

          return (
            <div
              ref={resolvePopoverRef}
              style={{ top: `${top}px`, left: `${left}px`, width: `${menuWidth}px` }}
              className="fixed z-[9998] bg-white rounded-2xl border border-slate-200 shadow-xl p-3.5 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tanggapan PIC</p>
                  <p className="text-xs font-bold text-slate-900 font-mono truncate">
                    #{order.order_number} · {order.channel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResolveMenuState(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-2.5 space-y-1.5">
                {presets.map((preset) => {
                  const isSelected = order.management_resolved_at && order.management_resolved_note === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleResolveReview(order.id, true, preset)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span>{preset}</span>
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-600 shrink-0">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setResolveOtherMode(true)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                    resolveOtherMode
                      ? 'bg-blue-50 border-blue-300 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>Lainnya (Isi Sendiri)</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>

              {resolveOtherMode && (
                <div className="mt-2.5 space-y-2 pt-2 border-t border-slate-100">
                  <textarea
                    value={resolveCustomNote}
                    onChange={(e) => setResolveCustomNote(e.target.value)}
                    rows={2}
                    maxLength={500}
                    autoFocus
                    placeholder="Tulis tanggapan Anda di sini..."
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0B132B] focus:bg-white resize-none"
                  />
                  <button
                    type="button"
                    disabled={isSaving || resolveCustomNote.trim() === ''}
                    onClick={() => handleResolveReview(order.id, true, resolveCustomNote)}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Menyimpan...' : 'Simpan Tanggapan'}
                  </button>
                </div>
              )}

              {order.management_resolved_at && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleResolveReview(order.id, false)}
                    className="w-full px-3 py-1.5 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Batalkan Status Selesai
                  </button>
                </div>
              )}
            </div>
          );
        })(),
        document.body
      )}

      <CutOffOrderExportModal
        show={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filters={filters}
        canViewFinancial={canViewFinancial}
      />
    </AppLayout>
  );
}
