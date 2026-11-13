import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import DualCalendarRangePicker, { formatDateIndo } from '../../Components/DualCalendarRangePicker';
import ShipOrderModal from '../../Components/Shopee/ShipOrderModal';
import WaybillPreviewModal from '../../Components/Shopee/WaybillPreviewModal';
import OrderDetailDrawer from '../../Components/Shopee/OrderDetailDrawer';
import {
  ACTIVE_DEADLINE_STATUSES,
  SpinnerIcon,
  formatCurrencyIDR,
  formatFulfillmentMethod,
  formatOrderTimestampWIB,
  getCourierAcceptanceMeta,
  getCsrfToken,
  getOrderStatusMeta,
  isShippableOrderStatus,
  isWaybillBlockedStatus,
  normalizeOrderStatus,
  parseWibDate,
  useOverlayScrollLockAndEscape,
} from '../../Components/Shopee/overlayHelpers';
import {
  ShopeeAutoSyncResponse,
  ShopeeBuyerCancellationResult,
  ShopeeLogisticsFilter,
  ShopeeMainTab,
  ShopeeMassShipResult,
  ShopeeOrderFilters,
  ShopeeOrderItem,
  ShopeeOrderRecord,
  ShopeeOrderSort,
  ShopeeOrderType,
  ShopeeOrdersPageProps,
  ShopeePrintStatusFilter,
  ShopeeRefreshDetailResponse,
  ShopeeShipResult,
  ShopeeSubTab,
  ShopeeSyncChunkResponse,
} from '../../Types/shopeeOrder';

const MAX_SHOPEE_BATCH = 50;
const URGENT_DEADLINE_MS = 6 * 60 * 60 * 1000;
const LIVE_AUTO_SYNC_INTERVAL_SEC = 30;
const INITIAL_AUTO_SYNC_STALE_MS = 20_000;

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ChunkProgressState {
  current: number;
  total: number;
  date: string;
}

interface SafeJsonResult<T> {
  ok: boolean;
  authOrSessionExpired: boolean;
  nonJsonOrServerHtml: boolean;
  status: number;
  data: T | null;
  errorMessage: string;
}

interface ShipModalState {
  show: boolean;
  mode: 'single' | 'mass';
  order: ShopeeOrderRecord | null;
  orders: ShopeeOrderRecord[];
}

interface WaybillModalState {
  show: boolean;
  pdfUrl: string | null;
  title: string;
  filename: string;
  orderCount: number;
  warnings: string[];
}

interface CancelTargetState {
  order: ShopeeOrderRecord;
  operation: 'ACCEPT' | 'REJECT';
}

function isInstantCarrier(carrier: string | null | undefined): boolean {
  if (!carrier) return false;
  return /instan|instant|same\s*day|sameday|gosend|grab/i.test(carrier);
}

function resolveItemQty(item: ShopeeOrderItem): number {
  const raw = item.model_quantity_purchased ?? (item as Record<string, unknown>).qty ?? 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

function resolveItemUnitPrice(item: ShopeeOrderItem): number {
  const raw =
    item.model_discounted_price ??
    (item as Record<string, unknown>).discounted_price ??
    item.model_original_price ??
    (item as Record<string, unknown>).original_price ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function extractFilenameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/["']/g, '').trim()) || fallback;
    } catch {
      return fallback;
    }
  }
  const basicMatch = header.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1]?.trim() || fallback;
}

function formatPaginationLabel(rawLabel: string): string {
  if (rawLabel.includes('Previous') || rawLabel.includes('&laquo;')) {
    return '‹ Sebelumnya';
  }
  if (rawLabel.includes('Next') || rawLabel.includes('&raquo;')) {
    return 'Berikutnya ›';
  }
  return rawLabel;
}

interface DeadlineStateResult {
  label: string;
  badgeText: string | null;
  badgeClass: string;
  textClass: string;
  countdownText: string | null;
  courierStatusText: string | null;
}

/**
 * Format durasi hitung mundur ringkas ala Shopee Seller Centre (contoh: "5m 44d", "28m 10d", "1j 15m").
 */
function formatShopeeInstantDuration(diffSec: number): string {
  if (diffSec <= 0) return '0d';
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;

  if (hours > 0) {
    return `${hours}j ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}d`;
  }
  return `${seconds}d`;
}

function getDeadlineState(
  shipByDate: string | null,
  orderCreatedAt: string | null,
  normalizedStatus: string,
  isInstant: boolean,
  nowMs: number
): DeadlineStateResult {
  const formatted = formatOrderTimestampWIB(shipByDate);
  const parsedShipBy = parseWibDate(shipByDate);
  const parsedCreated = parseWibDate(orderCreatedAt);

  // Jika pesanan Instant:
  if (isInstant) {
    // 1. Jika pesanan sudah diatur pickup / diproses:
    if (normalizedStatus === 'PROCESSED') {
      return {
        label: formatted,
        badgeText: 'Instant',
        badgeClass: 'border-orange-200 bg-orange-50 text-[#EE4D2D]',
        textClass: 'text-slate-700',
        countdownText: null,
        courierStatusText: 'Mencari Kurir',
      };
    }

    // 2. Jika pesanan belum diatur pickup (READY_TO_SHIP / RETRY_SHIP):
    if (normalizedStatus === 'READY_TO_SHIP' || normalizedStatus === 'RETRY_SHIP') {
      // Shopee Instant memiliki jeda persiapan / batas Cari Kurir Otomatis 30 menit (1.800 detik) sejak pesanan dibuat
      const autoSearchCourierMs = parsedCreated ? parsedCreated.getTime() + 30 * 60 * 1000 : null;
      const systemSlaDeadlineMs = parsedShipBy ? parsedShipBy.getTime() : null;

      if (autoSearchCourierMs) {
        const diffSec = Math.floor((autoSearchCourierMs - nowMs) / 1000);
        if (diffSec > 0) {
          const durationStr = formatShopeeInstantDuration(diffSec);
          return {
            label: formatted,
            badgeText: 'Instant',
            badgeClass: 'border-orange-200 bg-orange-50 text-[#EE4D2D]',
            textClass: 'text-[#EE4D2D] font-semibold',
            countdownText: `Mencari Kurir dalam ${durationStr}`,
            courierStatusText: null,
          };
        } else {
          // Setelah 30 menit jeda persiapan lewat, sistem Shopee otomatis masuk status "Mencari Kurir"
          const slaDiffSec = systemSlaDeadlineMs ? Math.floor((systemSlaDeadlineMs - nowMs) / 1000) : null;
          if (slaDiffSec !== null && slaDiffSec <= 0) {
            return {
              label: formatted,
              badgeText: 'Lewat Tenggat',
              badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
              textClass: 'text-rose-700 font-bold',
              countdownText: null,
              courierStatusText: 'Batas kirim terlewati',
            };
          }

          return {
            label: formatted,
            badgeText: 'Instant',
            badgeClass: 'border-orange-200 bg-orange-50 text-[#EE4D2D]',
            textClass: 'text-slate-700',
            countdownText: null,
            courierStatusText: 'Mencari Kurir',
          };
        }
      }
    }
  }

  // Untuk pesanan reguler / status lainnya:
  if (!parsedShipBy || !ACTIVE_DEADLINE_STATUSES.has(normalizedStatus)) {
    return {
      label: formatted,
      badgeText: null,
      badgeClass: '',
      textClass: 'text-slate-700',
      countdownText: null,
      courierStatusText: null,
    };
  }

  const diffMs = parsedShipBy.getTime() - nowMs;
  if (diffMs < 0) {
    return {
      label: formatted,
      badgeText: 'Lewat Tenggat',
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
      textClass: 'text-rose-700 font-bold',
      countdownText: 'Batas kirim terlewati',
      courierStatusText: null,
    };
  }
  if (diffMs <= URGENT_DEADLINE_MS) {
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return {
      label: formatted,
      badgeText: 'Segera Kirim',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
      textClass: 'text-amber-800 font-bold',
      countdownText: hours > 0 ? `Kirim dalam ${hours}j ${minutes}m` : `Kirim dalam ${minutes}m`,
      courierStatusText: null,
    };
  }

  return {
    label: formatted,
    badgeText: null,
    badgeClass: '',
    textClass: 'text-slate-700',
    countdownText: null,
    courierStatusText: null,
  };
}

function getTodayWibYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getWibDateDaysAgo(todayYmd: string, daysAgo: number): string {
  const [y, m, d] = todayYmd.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d - daysAgo));
  const yy = utcDate.getUTCFullYear();
  const mm = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function buildWibDateRangeAscending(days: number): string[] {
  const todayYmd = getTodayWibYmd();
  const safeDays = Math.max(1, Math.trunc(days));
  const result: string[] = [];
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    result.push(getWibDateDaysAgo(todayYmd, offset));
  }
  return result;
}

function readXsrfCookieToken(): string {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function buildJsonPostHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const metaToken = getCsrfToken().trim();
  const xsrfToken = readXsrfCookieToken().trim();
  if (metaToken) {
    headers['X-CSRF-TOKEN'] = metaToken;
  }
  if (xsrfToken) {
    headers['X-XSRF-TOKEN'] = xsrfToken;
  }
  return headers;
}

function formatLastSyncedDisplay(
  localFormatted: string | null,
  accountLastSyncedAt: string | null | undefined
): string {
  if (localFormatted && localFormatted.trim() !== '') {
    const trimmed = localFormatted.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return formatOrderTimestampWIB(trimmed);
    }
    return /WIB$/i.test(trimmed) ? trimmed : `${trimmed} WIB`;
  }
  return formatOrderTimestampWIB(accountLastSyncedAt);
}

async function safeJsonFetch<T>(url: string, init: RequestInit): Promise<SafeJsonResult<T>> {
  const response = await fetch(url, init);
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const isJson = contentType.includes('application/json');

  if (response.redirected || response.status === 401 || response.status === 419) {
    return {
      ok: false,
      authOrSessionExpired: true,
      nonJsonOrServerHtml: !isJson,
      status: response.status,
      data: null,
      errorMessage:
        response.status === 419
          ? 'Sesi atau token keamanan kedaluwarsa. Muat ulang halaman untuk melanjutkan sinkronisasi.'
          : 'Sesi login telah berakhir atau dialihkan. Silakan masuk kembali untuk melanjutkan sinkronisasi.',
    };
  }

  if (response.ok && !response.redirected && isJson) {
    const data = (await response.json()) as T;
    return {
      ok: true,
      authOrSessionExpired: false,
      nonJsonOrServerHtml: false,
      status: response.status,
      data,
      errorMessage: '',
    };
  }

  if (!isJson) {
    return {
      ok: false,
      authOrSessionExpired: response.status === 403,
      nonJsonOrServerHtml: true,
      status: response.status,
      data: null,
      errorMessage: `Server mengembalikan respons non-JSON (HTTP ${response.status}).`,
    };
  }

  let parsedError: (T & { message?: string }) | null = null;
  try {
    const rawText = await response.text();
    if (rawText.trim() !== '') {
      parsedError = JSON.parse(rawText) as T & { message?: string };
    }
  } catch {
    parsedError = null;
  }

  return {
    ok: false,
    authOrSessionExpired: false,
    nonJsonOrServerHtml: false,
    status: response.status,
    data: parsedError,
    errorMessage:
      parsedError?.message || `Permintaan sinkronisasi gagal (HTTP ${response.status}).`,
  };
}

function buildFilterParams(next: ShopeeOrderFilters): Record<string, string> {
  const params: Record<string, string> = {
    tab: next.tab,
    sort: next.sort,
  };
  if (next.tab === 'to_ship') {
    params.sub_tab = next.sub_tab;
  }
  if (next.order_type !== 'all') {
    params.order_type = next.order_type;
  }
  if (next.print_status !== 'all') {
    params.print_status = next.print_status;
  }
  if (next.logistics_status && next.logistics_status !== 'all') {
    params.logistics_status = next.logistics_status;
  }
  if (next.search.trim() !== '') {
    params.search = next.search.trim();
  }
  if (next.courier !== '') {
    params.courier = next.courier;
  }
  if (next.date_from !== '') {
    params.date_from = next.date_from;
  }
  if (next.date_to !== '') {
    params.date_to = next.date_to;
  }
  return params;
}

export default function ShopeeOrdersPage({
  account,
  orders,
  tabCounts,
  orderTypeCounts,
  carriers,
  filters,
}: ShopeeOrdersPageProps) {
  const { flash } = usePage<ShopeeOrdersPageProps>().props;

  const isMountedRef = useRef(true);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const searchTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const waybillAbortRef = useRef<AbortController | null>(null);
  const autoSyncAbortRef = useRef<AbortController | null>(null);
  const chunkAbortRef = useRef<AbortController | null>(null);
  const autoSyncInFlightRef = useRef(false);
  const consecutiveAutoSyncFailuresRef = useRef(0);
  const chunkSyncInFlightRef = useRef(false);
  const navSequenceRef = useRef(0);
  const countdownRef = useRef<number>(LIVE_AUTO_SYNC_INTERVAL_SEC);
  const initialAutoSyncAttemptedRef = useRef(false);
  const syncMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);

  // Sync & UI state
  const [isLiveAutoSync, setIsLiveAutoSync] = useState(true);
  const [liveCountdown, setLiveCountdown] = useState(LIVE_AUTO_SYNC_INTERVAL_SEC);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [isChunkSyncing, setIsChunkSyncing] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgressState | null>(null);
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const [localLastSyncedAt, setLocalLastSyncedAt] = useState<string | null>(null);
  const [syncAlert, setSyncAlert] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Banner & toast state
  const [dismissedFlashKey, setDismissedFlashKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Bulk selection state
  const [selectedOrderSns, setSelectedOrderSns] = useState<string[]>([]);

  // Overlay & action state
  const [drawerOrder, setDrawerOrder] = useState<ShopeeOrderRecord | null>(null);
  const [drawerAutoTrack, setDrawerAutoTrack] = useState(false);

  const openOrderDrawer = useCallback((order: ShopeeOrderRecord, autoTrack = false) => {
    setDrawerAutoTrack(autoTrack);
    setDrawerOrder(order);
  }, []);
  const [shipModal, setShipModal] = useState<ShipModalState>({
    show: false,
    mode: 'single',
    order: null,
    orders: [],
  });
  const [waybillModal, setWaybillModal] = useState<WaybillModalState>({
    show: false,
    pdfUrl: null,
    title: 'Preview Resi A4 Shopee',
    filename: 'resi-shopee-A4.pdf',
    orderCount: 0,
    warnings: [],
  });
  const [cancelTarget, setCancelTarget] = useState<CancelTargetState | null>(null);

  const [printingTarget, setPrintingTarget] = useState<string | null>(null);
  const [refreshingOrderSn, setRefreshingOrderSn] = useState<string | null>(null);
  const [cancellingOrderSn, setCancellingOrderSn] = useState<string | null>(null);

  const revokeActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      autoSyncInFlightRef.current = false;
      chunkSyncInFlightRef.current = false;
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      waybillAbortRef.current?.abort();
      waybillAbortRef.current = null;
      autoSyncAbortRef.current?.abort();
      autoSyncAbortRef.current = null;
      chunkAbortRef.current?.abort();
      chunkAbortRef.current = null;
      revokeActiveBlobUrl();
    };
  }, [revokeActiveBlobUrl]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    if (!isMountedRef.current) return;
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), type, message });
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      if (isMountedRef.current) {
        setToast(null);
      }
    }, 5500);
  }, []);

  // Keep search input synchronized with server-resolved filters
  useEffect(() => {
    setSearchInput(filters.search ?? '');
  }, [filters.search]);

  // Reset local formatted timestamp whenever Inertia account prop refreshes
  useEffect(() => {
    setLocalLastSyncedAt(null);
  }, [account?.last_synced_at]);

  // Reset flash dismissal whenever a new flash arrives
  const flashSignature = `${flash?.success ?? ''}::${flash?.error ?? ''}`;
  useEffect(() => {
    setDismissedFlashKey(null);
  }, [flashSignature]);

  // Clear selections on tab/filter/page navigation and prune stale order_sn values on reload
  const filterScopeKey = JSON.stringify({
    tab: filters.tab,
    sub_tab: filters.sub_tab,
    order_type: filters.order_type ?? 'all',
    print_status: filters.print_status,
    search: filters.search,
    courier: filters.courier,
    date_from: filters.date_from,
    date_to: filters.date_to,
    sort: filters.sort,
    page: orders.current_page,
  });

  useEffect(() => {
    setSelectedOrderSns([]);
  }, [filterScopeKey]);

  useEffect(() => {
    const visibleSet = new Set(orders.data.map((o) => o.order_sn));
    setSelectedOrderSns((prev) => {
      const next = prev.filter((sn) => visibleSet.has(sn));
      return next.length === prev.length ? prev : next;
    });
  }, [orders.data]);

  // Sync open drawer record when Inertia reloads orders list
  useEffect(() => {
    setDrawerOrder((current) => {
      if (!current) return null;
      const fresh = orders.data.find((o) => o.order_sn === current.order_sn);
      return fresh ?? current;
    });
  }, [orders.data]);

  // Escape + scroll-lock for inline buyer cancellation confirmation dialog
  const closeCancelConfirm = useCallback(() => {
    if (cancellingOrderSn) return;
    setCancelTarget(null);
  }, [cancellingOrderSn]);

  useOverlayScrollLockAndEscape(Boolean(cancelTarget), closeCancelConfirm, {
    canClose: () => !cancellingOrderSn,
  });

  // Close Sinkron Ulang dropdown on outside click or Escape
  useEffect(() => {
    if (!isSyncMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) {
        setIsSyncMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSyncMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSyncMenuOpen]);

  const isShopeeConnected = Boolean(
    account &&
      account.has_credentials &&
      account.has_tokens &&
      Boolean(account.shop_id) &&
      account.connection_status !== 'disconnected'
  );

  const isAnyOverlayOpen = Boolean(
    drawerOrder ||
      shipModal.show ||
      waybillModal.show ||
      cancelTarget ||
      isDatePickerOpen ||
      isSyncMenuOpen
  );

  const isShopeeConnectedRef = useRef(isShopeeConnected);
  isShopeeConnectedRef.current = isShopeeConnected;
  const isLiveAutoSyncRef = useRef(isLiveAutoSync);
  isLiveAutoSyncRef.current = isLiveAutoSync;
  const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
  isAnyOverlayOpenRef.current = isAnyOverlayOpen;
  const selectedCountRef = useRef(selectedOrderSns.length);
  selectedCountRef.current = selectedOrderSns.length;

  const resetLiveCountdown = useCallback(() => {
    countdownRef.current = LIVE_AUTO_SYNC_INTERVAL_SEC;
    if (isMountedRef.current) {
      setLiveCountdown(LIVE_AUTO_SYNC_INTERVAL_SEC);
    }
  }, []);

  const reloadAfterSync = useCallback(() => {
    router.reload({
      only: ['orders', 'tabCounts', 'orderTypeCounts', 'account', 'carriers'],
    });
  }, []);

  const invalidateAutoSyncForNavigation = useCallback(() => {
    navSequenceRef.current += 1;
    autoSyncAbortRef.current?.abort();
  }, []);

  const runAutoSync = useCallback(
    async (options?: { silentError?: boolean }) => {
      if (
        !isShopeeConnectedRef.current ||
        autoSyncInFlightRef.current ||
        chunkSyncInFlightRef.current
      ) {
        return;
      }

      const startNavSeq = navSequenceRef.current;
      autoSyncAbortRef.current?.abort();
      const controller = new AbortController();
      autoSyncAbortRef.current = controller;
      autoSyncInFlightRef.current = true;
      if (isMountedRef.current) {
        setIsAutoSyncing(true);
      }

      try {
        const result = await safeJsonFetch<ShopeeAutoSyncResponse>(
          '/shopee-orders/auto-sync',
          {
            method: 'POST',
            credentials: 'same-origin',
            signal: controller.signal,
            headers: buildJsonPostHeaders(),
            body: JSON.stringify({}),
          }
        );

        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          navSequenceRef.current !== startNavSeq
        ) {
          return;
        }

        if (!result.ok || !result.data) {
          if (result.authOrSessionExpired) {
            isLiveAutoSyncRef.current = false;
            setIsLiveAutoSync(false);
            setSyncAlert(result.errorMessage);
            showToast('error', result.errorMessage);
            return;
          }

          // Jangan hentikan Live Auto-Sync saat terjadi HTTP 5xx / timeout sementara (503, dll):
          // biarkan countdown tetap jalan dan coba ulang otomatis seperti Pesanan Cut Off.
          consecutiveAutoSyncFailuresRef.current += 1;
          if (
            !options?.silentError ||
            consecutiveAutoSyncFailuresRef.current >= 3
          ) {
            setSyncAlert(result.errorMessage);
          }
          return;
        }

        const payload = result.data;
        if (payload.status === 'error') {
          consecutiveAutoSyncFailuresRef.current += 1;
          if (
            !options?.silentError ||
            consecutiveAutoSyncFailuresRef.current >= 3
          ) {
            setSyncAlert(payload.message || 'Gagal menyegarkan pesanan Shopee secara otomatis.');
          }
          return;
        }

        consecutiveAutoSyncFailuresRef.current = 0;
        setSyncAlert(null);
        if (payload.last_synced_at) {
          setLocalLastSyncedAt(payload.last_synced_at);
        }

        if (
          payload.status === 'success' &&
          (payload.changed_orders ?? 0) > 0 &&
          navSequenceRef.current === startNavSeq &&
          isLiveAutoSyncRef.current &&
          !isAnyOverlayOpenRef.current &&
          selectedCountRef.current === 0
        ) {
          reloadAfterSync();
          showToast(
            'success',
            `Live Auto-Sync: ${payload.changed_orders} pesanan diperbarui.`
          );
        }
      } catch (err: unknown) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          navSequenceRef.current !== startNavSeq
        ) {
          return;
        }
        if (!isMountedRef.current) return;
        consecutiveAutoSyncFailuresRef.current += 1;
        if (
          !options?.silentError ||
          consecutiveAutoSyncFailuresRef.current >= 3
        ) {
          setSyncAlert('Koneksi ke server sempat terputus; Live Auto-Sync akan mencoba ulang otomatis.');
        }
      } finally {
        if (autoSyncAbortRef.current === controller) {
          autoSyncAbortRef.current = null;
        }
        autoSyncInFlightRef.current = false;
        if (isMountedRef.current) {
          setIsAutoSyncing(false);
          resetLiveCountdown();
        }
      }
    },
    [reloadAfterSync, resetLiveCountdown, showToast]
  );

  // Silent initial auto-sync on page mount if last sync is empty or >= 20s old
  useEffect(() => {
    if (!isShopeeConnected || initialAutoSyncAttemptedRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const lastSyncedMs = parseWibDate(account?.last_synced_at)?.getTime() ?? 0;
    if (lastSyncedMs > 0 && Date.now() - lastSyncedMs < INITIAL_AUTO_SYNC_STALE_MS) {
      initialAutoSyncAttemptedRef.current = true;
      return;
    }

    const startNavSeq = navSequenceRef.current;
    const timer = window.setTimeout(() => {
      initialAutoSyncAttemptedRef.current = true;
      if (
        isMountedRef.current &&
        navSequenceRef.current === startNavSeq &&
        isLiveAutoSyncRef.current &&
        !isAnyOverlayOpenRef.current &&
        selectedCountRef.current === 0
      ) {
        void runAutoSync({ silentError: true });
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isShopeeConnected, account?.last_synced_at, runAutoSync]);

  // 30-second Live Auto-Sync countdown loop with interaction & visibility guards
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isShopeeConnectedRef.current || !isLiveAutoSyncRef.current) return;
      if (autoSyncInFlightRef.current || chunkSyncInFlightRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isAnyOverlayOpenRef.current) return;
      if (selectedCountRef.current > 0) return;

      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const activeTag = activeEl?.tagName ?? '';
      const isFocusedFormField =
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' ||
        (activeTag === 'INPUT' && (activeEl as HTMLInputElement).type !== 'checkbox');
      if (isFocusedFormField) return;

      if (countdownRef.current <= 1) {
        countdownRef.current = LIVE_AUTO_SYNC_INTERVAL_SEC;
        setLiveCountdown(LIVE_AUTO_SYNC_INTERVAL_SEC);
        void runAutoSync({ silentError: true });
      } else {
        countdownRef.current -= 1;
        setLiveCountdown(countdownRef.current);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [runAutoSync]);

  const cancelChunkSync = useCallback(() => {
    chunkAbortRef.current?.abort();
  }, []);

  const runChunkedSync = useCallback(
    async (days: number) => {
      if (!isShopeeConnectedRef.current || chunkSyncInFlightRef.current) return;

      setIsSyncMenuOpen(false);
      autoSyncAbortRef.current?.abort();

      chunkAbortRef.current?.abort();
      const controller = new AbortController();
      chunkAbortRef.current = controller;
      chunkSyncInFlightRef.current = true;

      const dateList = buildWibDateRangeAscending(days);
      let totalSynced = 0;
      let totalChanged = 0;
      let latestSyncedAt: string | null = null;

      if (isMountedRef.current) {
        setIsChunkSyncing(true);
        setSyncAlert(null);
        setChunkProgress({ current: 1, total: dateList.length, date: dateList[0] });
      }

      try {
        for (let i = 0; i < dateList.length; i += 1) {
          if (controller.signal.aborted || !isMountedRef.current) return;

          const dayStr = dateList[i];
          setChunkProgress({ current: i + 1, total: dateList.length, date: dayStr });

          const result = await safeJsonFetch<ShopeeSyncChunkResponse>(
            '/shopee-orders/sync-chunk',
            {
              method: 'POST',
              credentials: 'same-origin',
              signal: controller.signal,
              headers: buildJsonPostHeaders(),
              body: JSON.stringify({
                start_date: dayStr,
                end_date: dayStr,
              }),
            }
          );

          if (controller.signal.aborted || !isMountedRef.current) return;

          if (!result.ok || !result.data || result.data.status === 'error') {
            const errMsg =
              result.data?.message ||
              result.errorMessage ||
              `Gagal sinkronisasi tanggal ${dayStr}.`;
            if (result.authOrSessionExpired) {
              setIsLiveAutoSync(false);
            }
            const progressPrefix =
              i > 0 ? `Berhenti pada hari ${i + 1}/${dateList.length} (${dayStr}): ` : '';
            const fullError = `${progressPrefix}${errMsg}`;
            setSyncAlert(fullError);
            showToast('error', fullError);
            if (totalSynced > 0 || totalChanged > 0) {
              reloadAfterSync();
            }
            return;
          }

          totalSynced += result.data.synced_orders ?? 0;
          totalChanged += result.data.changed_orders ?? 0;
          if (result.data.last_synced_at) {
            latestSyncedAt = result.data.last_synced_at;
            setLocalLastSyncedAt(result.data.last_synced_at);
          }
        }

        if (!isMountedRef.current) return;
        if (latestSyncedAt) {
          setLocalLastSyncedAt(latestSyncedAt);
        }
        resetLiveCountdown();
        reloadAfterSync();
        showToast(
          'success',
          `Sinkron ulang ${dateList.length} hari selesai: ${totalSynced} pesanan diperiksa, ${totalChanged} pembaruan.`
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (isMountedRef.current) {
            showToast('info', 'Sinkron ulang dibatalkan.');
            if (totalSynced > 0 || totalChanged > 0) {
              reloadAfterSync();
            }
          }
          return;
        }
        if (isMountedRef.current) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Kendala jaringan saat sinkron ulang pesanan Shopee.';
          setSyncAlert(msg);
          showToast('error', msg);
        }
      } finally {
        if (chunkAbortRef.current === controller) {
          chunkAbortRef.current = null;
        }
        chunkSyncInFlightRef.current = false;
        if (isMountedRef.current) {
          setIsChunkSyncing(false);
          setChunkProgress(null);
          resetLiveCountdown();
        }
      }
    },
    [reloadAfterSync, resetLiveCountdown, showToast]
  );

  const navigateWithFilters = useCallback(
    (patch: Partial<ShopeeOrderFilters>) => {
      const base = filtersRef.current;
      const next: ShopeeOrderFilters = {
        tab: patch.tab ?? base.tab,
        sub_tab: patch.sub_tab ?? base.sub_tab,
        order_type: patch.order_type ?? base.order_type ?? 'all',
        print_status: patch.print_status ?? base.print_status,
        logistics_status: patch.logistics_status ?? base.logistics_status ?? 'all',
        search: patch.search ?? base.search,
        courier: patch.courier ?? base.courier,
        date_from: patch.date_from ?? base.date_from,
        date_to: patch.date_to ?? base.date_to,
        sort: patch.sort ?? base.sort,
      };
      if (next.tab !== 'to_ship') {
        next.sub_tab = 'all';
      }

      invalidateAutoSyncForNavigation();

      router.get('/shopee-orders', buildFilterParams(next), {
        preserveState: true,
        preserveScroll: true,
        replace: true,
      });
    },
    [invalidateAutoSyncForNavigation]
  );

  // Debounced search submission
  useEffect(() => {
    const trimmedInput = searchInput.trim();
    const trimmedFilter = (filtersRef.current.search ?? '').trim();
    if (trimmedInput === trimmedFilter) return;

    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      if (searchInput.trim() !== (filtersRef.current.search ?? '').trim()) {
        navigateWithFilters({ search: searchInput.trim() });
      }
    }, 400);

    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [searchInput, navigateWithFilters]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    navigateWithFilters({ search: searchInput.trim() });
  };

  const handleResetFilters = () => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setSearchInput('');
    setIsDatePickerOpen(false);
    navigateWithFilters({
      sub_tab: filtersRef.current.tab === 'to_ship' ? 'unprocessed' : 'all',
      order_type: 'all',
      print_status: 'all',
      logistics_status: 'all',
      search: '',
      courier: '',
      date_from: '',
      date_to: '',
      sort: 'ship_by_asc',
    });
  };

  const handleCopyText = async (key: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (!isMountedRef.current) return;
      setCopiedKey(key);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        if (isMountedRef.current) setCopiedKey(null);
      }, 2000);
      showToast('success', `${label} ${value} disalin ke clipboard.`);
    } catch {
      showToast('error', 'Gagal menyalin ke clipboard. Salin secara manual.');
    }
  };

  // Selection computed sets
  const selectedSet = useMemo(() => new Set(selectedOrderSns), [selectedOrderSns]);
  const selectedOrders = useMemo(
    () => orders.data.filter((o) => selectedSet.has(o.order_sn)),
    [orders.data, selectedSet]
  );
  const selectedShippableOrders = useMemo(
    () => selectedOrders.filter((o) => isShippableOrderStatus(o.order_status)),
    [selectedOrders]
  );
  const selectedPrintableOrders = useMemo(
    () => selectedOrders.filter((o) => !isWaybillBlockedStatus(o.order_status)),
    [selectedOrders]
  );

  const visibleSelectedCount = selectedOrders.length;
  const allVisibleSelected = orders.data.length > 0 && visibleSelectedCount === orders.data.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectAllVisible = () => {
    if (orders.data.length === 0) return;
    if (allVisibleSelected) {
      setSelectedOrderSns([]);
    } else {
      setSelectedOrderSns(orders.data.map((o) => o.order_sn));
    }
  };

  const toggleOrderSelection = (orderSn: string) => {
    setSelectedOrderSns((prev) =>
      prev.includes(orderSn) ? prev.filter((sn) => sn !== orderSn) : [...prev, orderSn]
    );
  };

  // Waybill PDF fetching + Blob URL management
  const closeWaybillModal = useCallback(() => {
    revokeActiveBlobUrl();
    setWaybillModal((prev) => ({
      ...prev,
      show: false,
      pdfUrl: null,
      warnings: [],
    }));
  }, [revokeActiveBlobUrl]);

  const openWaybillPdfStream = useCallback(
    async (targetOrders: ShopeeOrderRecord[], isMass: boolean) => {
      if (printingTarget !== null) return;

      const eligible = targetOrders.filter((o) => !isWaybillBlockedStatus(o.order_status));
      if (eligible.length === 0) {
        showToast('error', 'Pesanan yang dipilih belum diproses atau dibatalkan sehingga resi belum dapat dicetak.');
        return;
      }

      const capped = eligible.slice(0, MAX_SHOPEE_BATCH);
      const skippedIneligible = targetOrders.length - eligible.length;
      const truncatedCount = Math.max(0, eligible.length - MAX_SHOPEE_BATCH);

      const warnings: string[] = [];
      if (skippedIneligible > 0) {
        warnings.push(`${skippedIneligible} pesanan dilewati karena belum diproses atau dibatalkan.`);
      }
      if (truncatedCount > 0) {
        warnings.push(
          `Shopee membatasi maksimal ${MAX_SHOPEE_BATCH} pesanan per PDF massal; ${truncatedCount} pesanan sisanya tidak disertakan pada batch ini.`
        );
      }

      waybillAbortRef.current?.abort();
      const controller = new AbortController();
      waybillAbortRef.current = controller;

      const marker = isMass ? 'MASS' : capped[0].order_sn;
      setPrintingTarget(marker);

      try {
        const response = isMass
          ? await fetch('/shopee-orders/mass-waybill-a4', {
              method: 'POST',
              credentials: 'same-origin',
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/pdf, application/json',
                'X-CSRF-TOKEN': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: JSON.stringify({
                order_sns: capped.map((o) => o.order_sn),
              }),
            })
          : await fetch(`/shopee-orders/${encodeURIComponent(capped[0].order_sn)}/waybill-a4`, {
              method: 'GET',
              credentials: 'same-origin',
              signal: controller.signal,
              headers: {
                Accept: 'application/pdf, application/json',
                'X-Requested-With': 'XMLHttpRequest',
              },
            });

        if (controller.signal.aborted || !isMountedRef.current) return;

        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
          let errMessage = `Gagal menyiapkan PDF Resi Shopee (HTTP ${response.status}).`;
          try {
            const payload = (await response.json()) as { message?: string };
            if (payload?.message) errMessage = payload.message;
          } catch {
            // Non-JSON response
          }
          showToast('error', errMessage);
          return;
        }

        const blob = await response.blob();
        if (controller.signal.aborted || !isMountedRef.current) return;
        if (blob.size === 0) {
          showToast('error', 'Dokumen PDF Resi kosong dari Shopee.');
          return;
        }

        const fallbackFilename = isMass
          ? `resi-shopee-massal-${capped.length}-pesanan-thermal.pdf`
          : `resi-shopee-${capped[0].order_sn}-thermal-100x150.pdf`;
        const filename = extractFilenameFromHeader(
          response.headers.get('content-disposition'),
          fallbackFilename
        );
        const headerCount = Number(response.headers.get('x-shopee-orders-count'));
        const resolvedCount = Number.isFinite(headerCount) && headerCount > 0 ? headerCount : capped.length;

        revokeActiveBlobUrl();
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrlRef.current = blobUrl;

        setWaybillModal({
          show: true,
          pdfUrl: blobUrl,
          title: isMass
            ? `Resi Thermal Massal (${resolvedCount} Pesanan)`
            : `Resi Thermal — ${capped[0].order_sn}`,
          filename,
          orderCount: resolvedCount,
          warnings,
        });

        showToast(
          'success',
          isMass
            ? `PDF Resi Thermal 100x150mm berhasil disiapkan untuk ${resolvedCount} pesanan.`
            : `PDF Resi Thermal 100x150mm untuk ${capped[0].order_sn} siap dicetak.`
        );

        router.reload({ only: ['orders', 'tabCounts'] });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (isMountedRef.current) {
          showToast(
            'error',
            err instanceof Error ? err.message : 'Kendala jaringan saat mengunduh PDF Resi.'
          );
        }
      } finally {
        if (waybillAbortRef.current === controller) {
          waybillAbortRef.current = null;
        }
        if (isMountedRef.current) {
          setPrintingTarget(null);
        }
      }
    },
    [printingTarget, revokeActiveBlobUrl, showToast]
  );

  const handlePrintSingleWaybill = useCallback(
    (order: ShopeeOrderRecord) => {
      void openWaybillPdfStream([order], false);
    },
    [openWaybillPdfStream]
  );

  const handlePrintMassWaybill = () => {
    void openWaybillPdfStream(selectedPrintableOrders, true);
  };

  // Refresh single order live from Shopee API
  const handleRefreshSingleOrder = useCallback(
    async (order: ShopeeOrderRecord) => {
      if (refreshingOrderSn) return;
      setRefreshingOrderSn(order.order_sn);

      try {
        const res = await fetch(`/shopee-orders/${encodeURIComponent(order.order_sn)}/refresh`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': getCsrfToken(),
            'X-Requested-With': 'XMLHttpRequest',
          },
        });

        const payload = (await res.json().catch(() => null)) as
          | (ShopeeRefreshDetailResponse & { message?: string })
          | null;

        if (!isMountedRef.current) return;

        if (!res.ok || !payload || payload.status === 'error') {
          showToast('error', payload?.message || `Gagal memperbarui detail pesanan (HTTP ${res.status}).`);
          return;
        }

        if (payload.order) {
          setDrawerOrder((cur) => (cur?.order_sn === payload.order.order_sn ? payload.order : cur));
        }
        showToast('success', payload.message || `Detail ${order.order_sn} diperbarui.`);
        router.reload({ only: ['orders', 'tabCounts', 'orderTypeCounts', 'carriers'] });
      } catch (err: unknown) {
        if (isMountedRef.current) {
          showToast(
            'error',
            err instanceof Error ? err.message : 'Gagal menghubungi server saat refresh detail pesanan.'
          );
        }
      } finally {
        if (isMountedRef.current) {
          setRefreshingOrderSn(null);
        }
      }
    },
    [refreshingOrderSn, showToast]
  );

  // Confirm & execute buyer cancellation decision
  const executeBuyerCancellation = async () => {
    if (!cancelTarget || cancellingOrderSn) return;
    const { order, operation } = cancelTarget;
    setCancellingOrderSn(order.order_sn);

    try {
      const res = await fetch(`/shopee-orders/${encodeURIComponent(order.order_sn)}/handle-cancel`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ operation }),
      });

      const payload = (await res.json().catch(() => null)) as
        | (ShopeeBuyerCancellationResult & { message?: string })
        | null;

      if (!isMountedRef.current) return;

      if (!res.ok || !payload || payload.status === 'error') {
        showToast(
          'error',
          payload?.message || `Gagal memproses pembatalan pesanan (HTTP ${res.status}).`
        );
        return;
      }

      if (payload.order) {
        setDrawerOrder((cur) => (cur?.order_sn === payload.order.order_sn ? payload.order : cur));
      }
      setCancelTarget(null);
      showToast('success', payload.message);
      router.reload({ only: ['orders', 'tabCounts', 'orderTypeCounts', 'carriers'] });
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showToast(
          'error',
          err instanceof Error ? err.message : 'Gagal menghubungi server saat memproses pembatalan.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setCancellingOrderSn(null);
      }
    }
  };

  // Ship modal handlers
  const openSingleShipModal = (order: ShopeeOrderRecord) => {
    setShipModal({
      show: true,
      mode: 'single',
      order,
      orders: [],
    });
  };

  const openMassShipModal = () => {
    if (selectedShippableOrders.length === 0) return;
    setShipModal({
      show: true,
      mode: 'mass',
      order: null,
      orders: selectedShippableOrders,
    });
  };

  const handleSingleShipped = (result: ShopeeShipResult) => {
    if (result.order) {
      setDrawerOrder((cur) => (cur?.order_sn === result.order_sn ? result.order : cur));
    }
    showToast('success', result.message || `Pengiriman ${result.order_sn} berhasil diatur.`);
    router.reload({ only: ['orders', 'tabCounts', 'orderTypeCounts', 'carriers'] });
  };

  const handleMassShipped = (result: ShopeeMassShipResult) => {
    const failedCount = result.failed?.length ?? 0;
    const succeededCount = result.succeeded?.length ?? 0;
    const toastType: ToastMessage['type'] =
      succeededCount > 0 && failedCount === 0 ? 'success' : succeededCount === 0 ? 'error' : 'info';

    showToast(toastType, result.message);
    if (succeededCount > 0) {
      const succeededSet = new Set(result.succeeded.map((s) => s.order_sn));
      setSelectedOrderSns((prev) => prev.filter((sn) => !succeededSet.has(sn)));
    }
    router.reload({ only: ['orders', 'tabCounts', 'orderTypeCounts', 'carriers'] });
  };

  const activeOrderType: ShopeeOrderType = filters.order_type ?? 'all';
  const todayWib = getTodayWibYmd();
  const isTodayFilterActive = filters.date_from === todayWib && filters.date_to === todayWib;
  const lastSyncedLabel = formatLastSyncedDisplay(localLastSyncedAt, account?.last_synced_at);

  const mainTabs: Array<{ key: ShopeeMainTab; label: string; count: number }> = [
    { key: 'all', label: 'Semua', count: tabCounts?.all ?? 0 },
    { key: 'unpaid', label: 'Belum Bayar', count: tabCounts?.unpaid ?? 0 },
    { key: 'to_ship', label: 'Perlu Dikirim', count: tabCounts?.to_ship ?? 0 },
    { key: 'shipped', label: 'Dikirim', count: tabCounts?.shipped ?? 0 },
    { key: 'completed', label: 'Selesai', count: tabCounts?.completed ?? 0 },
    { key: 'cancelled', label: 'Pengembalian/Pembatalan', count: tabCounts?.cancelled ?? 0 },
  ];

  const orderTypeOptions: Array<{ key: ShopeeOrderType; label: string }> = [
    { key: 'all', label: 'Semua' },
    {
      key: 'regular',
      label: `Pesanan Reguler (${(orderTypeCounts?.regular ?? 0).toLocaleString('id-ID')})`,
    },
    {
      key: 'instant',
      label: `Instant (${(orderTypeCounts?.instant ?? 0).toLocaleString('id-ID')})`,
    },
    {
      key: 'kilat',
      label: `Pengiriman Kilat (${(orderTypeCounts?.kilat ?? 0).toLocaleString('id-ID')})`,
    },
  ];

  const subTabs: Array<{ key: ShopeeSubTab; label: string }> = [
    { key: 'all', label: 'Semua' },
    {
      key: 'unprocessed',
      label: `Perlu diproses (${(tabCounts?.to_ship_unprocessed ?? 0).toLocaleString('id-ID')})`,
    },
    {
      key: 'processed',
      label: `Telah diproses (${(tabCounts?.to_ship_processed ?? 0).toLocaleString('id-ID')})`,
    },
  ];

  const printStatusOptions: Array<{ key: ShopeePrintStatusFilter; label: string; count: number | null }> = [
    { key: 'all', label: 'Semua', count: null },
    { key: 'unprinted', label: 'Belum Dicetak', count: tabCounts?.unprinted ?? 0 },
    { key: 'printed', label: 'Sudah Dicetak', count: tabCounts?.printed ?? 0 },
  ];

  const activeLogisticsStatus: ShopeeLogisticsFilter = filters.logistics_status ?? 'all';
  const logisticsStatusOptions: Array<{
    key: ShopeeLogisticsFilter;
    label: string;
    count: number | null;
  }> = [
    { key: 'all', label: 'Semua', count: null },
    {
      key: 'pending_pickup',
      label: 'Belum Diterima Ekspedisi',
      count: tabCounts?.logistics_pending_pickup ?? 0,
    },
    {
      key: 'handed_over',
      label: 'Sudah Diterima Ekspedisi',
      count: tabCounts?.logistics_handed_over ?? 0,
    },
    {
      key: 'issue',
      label: 'Kendala Kurir',
      count: tabCounts?.logistics_issue ?? 0,
    },
  ];

  const defaultSubTab: ShopeeSubTab = filters.tab === 'to_ship' ? 'unprocessed' : 'all';
  const hasActiveFilters =
    filters.sub_tab !== defaultSubTab ||
    activeOrderType !== 'all' ||
    filters.print_status !== 'all' ||
    activeLogisticsStatus !== 'all' ||
    filters.search !== '' ||
    filters.courier !== '' ||
    filters.date_from !== '' ||
    filters.date_to !== '' ||
    filters.sort !== 'ship_by_asc';

  const showPrintPills =
    filters.tab === 'to_ship' ||
    filters.tab === 'shipped' ||
    filters.tab === 'all' ||
    filters.print_status !== 'all';

  const showFlash = Boolean((flash?.success || flash?.error) && dismissedFlashKey !== flashSignature);

  return (
    <AppLayout>
      <Head title="Pesanan Saya Shopee - Koding ERP" />

      <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-12">
        {/* Flash Alerts */}
        {showFlash && flash?.success && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-xs font-semibold text-emerald-800 shadow-xs">
            <div className="flex items-center gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4 shrink-0 text-emerald-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{flash.success}</span>
            </div>
            <button
              type="button"
              onClick={() => setDismissedFlashKey(flashSignature)}
              aria-label="Tutup pesan sukses"
              className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {showFlash && flash?.error && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-xs font-semibold text-rose-800 shadow-xs">
            <div className="flex items-center gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4 shrink-0 text-rose-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span>{flash.error}</span>
            </div>
            <button
              type="button"
              onClick={() => setDismissedFlashKey(flashSignature)}
              aria-label="Tutup pesan error"
              className="rounded-lg p-1 text-rose-600 hover:bg-rose-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Floating Dismissible Toast Banner (visible over cards & drawer without layout shift) */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed top-5 right-5 z-[10000] flex w-[calc(100vw-2.5rem)] max-w-md items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-md ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : toast.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {toast.type === 'success' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              <span className="leading-relaxed">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Tutup notifikasi"
              className="shrink-0 cursor-pointer rounded-lg p-1 opacity-70 hover:bg-black/5 hover:opacity-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Header Card */}
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B132B] text-white shadow-xs">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.75}
                stroke="currentColor"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
                />
              </svg>
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  Pesanan Saya
                </h1>

                {isShopeeConnected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Terhubung
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Belum Terhubung
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {account ? (
                  <>
                    <span className="font-semibold text-slate-700">{account.account_name}</span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Shop ID:{' '}
                      <span className="font-mono font-semibold text-slate-700">
                        {account.shop_id || '-'}
                      </span>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="tabular-nums">
                      Sinkron terakhir:{' '}
                      <span className="font-medium text-slate-700">
                        {lastSyncedLabel}
                      </span>
                    </span>
                  </>
                ) : (
                  <span>Belum ada akun toko Shopee yang dikonfigurasi pada sistem.</span>
                )}
              </div>
            </div>
          </div>

          {/* Live Auto-Sync Pill + Chunked Sinkron Ulang Menu */}
          <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0">
            <button
              type="button"
              disabled={!isShopeeConnected}
              onClick={() => {
                if (!isShopeeConnected) return;
                const nextActive = !isLiveAutoSync;
                isLiveAutoSyncRef.current = nextActive;
                setIsLiveAutoSync(nextActive);
                if (!nextActive) {
                  autoSyncAbortRef.current?.abort();
                }
                resetLiveCountdown();
              }}
              title={
                !isShopeeConnected
                  ? 'Hubungkan akun Shopee terlebih dahulu di Integrasi Shopee'
                  : isLiveAutoSync
                    ? `Live Auto-Sync aktif: menyegarkan otomatis tiap ${LIVE_AUTO_SYNC_INTERVAL_SEC} detik. Klik untuk menjeda.`
                    : 'Live Auto-Sync dijeda. Klik untuk mengaktifkan kembali.'
              }
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
                !isShopeeConnected
                  ? 'border-slate-200 bg-slate-100 text-slate-500'
                  : isLiveAutoSync
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isAutoSyncing ? (
                <>
                  <SpinnerIcon className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Menyegarkan otomatis...</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    {isShopeeConnected && isLiveAutoSync && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        isShopeeConnected && isLiveAutoSync ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                  </span>
                  {!isShopeeConnected ? (
                    <span>Live Auto-Sync: Nonaktif</span>
                  ) : isLiveAutoSync ? (
                    <span className="tabular-nums">
                      Live Auto-Sync:{' '}
                      <strong className="font-mono font-bold">{liveCountdown}s</strong>
                    </span>
                  ) : (
                    <span>Live Auto-Sync: Jeda</span>
                  )}
                </>
              )}
            </button>

            {isChunkSyncing && chunkProgress ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-[#0B132B] px-3.5 py-2 text-xs font-semibold text-white shadow-xs">
                <SpinnerIcon className="h-4 w-4 text-white" />
                <span className="tabular-nums">
                  Sinkron hari {chunkProgress.current}/{chunkProgress.total}...
                </span>
                <button
                  type="button"
                  onClick={cancelChunkSync}
                  className="ml-1 cursor-pointer rounded-lg bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/25"
                >
                  Batal
                </button>
              </div>
            ) : (
              <div className="relative" ref={syncMenuRef}>
                <button
                  type="button"
                  disabled={!isShopeeConnected}
                  onClick={() => setIsSyncMenuOpen((prev) => !prev)}
                  aria-expanded={isSyncMenuOpen}
                  aria-haspopup="menu"
                  title={
                    isShopeeConnected
                      ? 'Pilih rentang hari untuk sinkron ulang bertahap (anti-timeout)'
                      : 'Hubungkan akun Shopee terlebih dahulu di Integrasi Shopee'
                  }
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0B132B] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  <span>Sinkron Ulang</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className={`h-3.5 w-3.5 transition-transform ${isSyncMenuOpen ? 'rotate-180' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {isSyncMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Preset rentang Sinkron Ulang"
                    className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white py-2 shadow-lg"
                  >
                    <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Sinkron Bertahap (Anti-503)
                    </div>
                    {[
                      {
                        days: 1,
                        label: 'Hari Ini (1 Hari)',
                        desc: 'Tarik pesanan hari ini (WIB)',
                      },
                      {
                        days: 3,
                        label: '3 Hari Terakhir',
                        desc: 'Proses bertahap 1 hari per request',
                      },
                      {
                        days: 7,
                        label: '7 Hari Terakhir',
                        desc: 'Sinkron penuh 7 hari tanpa timeout',
                      },
                    ].map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        role="menuitem"
                        onClick={() => void runChunkedSync(preset.days)}
                        className="flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-slate-50"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.8}
                          stroke="currentColor"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#EE4D2D]"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                          />
                        </svg>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{preset.label}</p>
                          <p className="text-[11px] text-slate-500">{preset.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Non-blocking Sync Alert Banner (e.g. session expired / non-JSON response) */}
        {syncAlert && (
          <section
            role="alert"
            className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-xs text-amber-900 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <span className="font-semibold leading-relaxed">{syncAlert}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isShopeeConnected && !isLiveAutoSync && (
                <button
                  type="button"
                  onClick={() => {
                    setSyncAlert(null);
                    setIsLiveAutoSync(true);
                    resetLiveCountdown();
                  }}
                  className="cursor-pointer rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                >
                  Aktifkan Live
                </button>
              )}
              <button
                type="button"
                onClick={() => setSyncAlert(null)}
                aria-label="Tutup peringatan sinkronisasi"
                className="cursor-pointer rounded-lg p-1 text-amber-700 hover:bg-amber-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </section>
        )}

        {/* Disconnected Alert CTA */}
        {!isShopeeConnected && (
          <section className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <div className="text-xs text-amber-900">
                <p className="font-bold">Koneksi Toko Shopee Belum Aktif</p>
                <p className="mt-0.5 text-amber-800">
                  Kredensial atau otorisasi toko Shopee belum tersedia. Hubungkan akun toko untuk menyinkronkan pesanan, mengatur pengiriman, dan mencetak resi resmi.
                </p>
              </div>
            </div>
            <Link
              href="/marketplace/shopee"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              <span>Buka Integrasi Shopee</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </section>
        )}

        {/* Seller Center Tabs, Filters & Bulk Action Deck */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          {/* Main Seller Center Tabs */}
          <div className="overflow-x-auto border-b border-slate-200 px-3 sm:px-5">
            <nav className="flex min-w-max items-center gap-1 sm:gap-2" aria-label="Status pesanan Shopee">
              {mainTabs.map((t) => {
                const isActive = filters.tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() =>
                      navigateWithFilters({
                        tab: t.key,
                        sub_tab: t.key === 'to_ship' ? 'unprocessed' : 'all',
                        order_type: 'all',
                        print_status: 'all',
                        logistics_status: 'all',
                      })
                    }
                    className={`relative inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-3.5 text-xs transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-[#EE4D2D] font-bold text-[#EE4D2D]'
                        : 'border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800'
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        isActive
                          ? 'border-orange-200 bg-[#FFF5F2] text-[#EE4D2D]'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {t.count.toLocaleString('id-ID')}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Row 1: Tipe Pesanan (Shopee Seller Center Gambar 2) */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tipe Pesanan
            </span>
            {orderTypeOptions.map((opt) => {
              const active = activeOrderType === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => navigateWithFilters({ order_type: opt.key, sub_tab: 'all' })}
                  className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs transition-colors tabular-nums ${
                    active
                      ? 'border-[#EE4D2D] bg-[#FFF5F2] font-semibold text-[#EE4D2D]'
                      : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Row 2: Status Pesanan (tab to_ship) & Status Cetak */}
          {(filters.tab === 'to_ship' || showPrintPills) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/40 px-4 py-2.5 sm:px-5">
              {filters.tab === 'to_ship' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Status Pesanan
                  </span>
                  {subTabs.map((st) => {
                    const active = filters.sub_tab === st.key;
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => navigateWithFilters({ sub_tab: st.key })}
                        className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs transition-colors tabular-nums ${
                          active
                            ? 'border-[#EE4D2D] bg-[#FFF5F2] font-semibold text-[#EE4D2D]'
                            : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {showPrintPills && (
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Status Cetak
                  </span>
                  {printStatusOptions.map((opt) => {
                    const active = filters.print_status === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => navigateWithFilters({ print_status: opt.key })}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? 'border-[#EE4D2D] bg-[#FFF5F2] font-semibold text-[#EE4D2D]'
                            : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {opt.count !== null && (
                          <span
                            className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                              active ? 'bg-orange-100 text-[#EE4D2D]' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {opt.count.toLocaleString('id-ID')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Row 2b: Status Ekspedisi (Konfirmasi Penerimaan Kurir) */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/30 px-4 py-2.5 sm:px-5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Status Ekspedisi
            </span>
            {logisticsStatusOptions.map((opt) => {
              const active = activeLogisticsStatus === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => navigateWithFilters({ logistics_status: opt.key })}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? 'border-[#EE4D2D] bg-[#FFF5F2] font-semibold text-[#EE4D2D]'
                      : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.count !== null && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                        active ? 'bg-orange-100 text-[#EE4D2D]' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {opt.count.toLocaleString('id-ID')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter Inputs + Bulk Selection Bar */}
          <div className="space-y-3.5 p-4 sm:px-5">
            <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
              {/* Search Box */}
              <div className="relative md:col-span-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari No. Pesanan, No. Resi, Pembeli, Produk, atau SKU..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#EE4D2D] focus:bg-white focus:outline-none"
                />
                {searchInput !== '' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      navigateWithFilters({ search: '' });
                    }}
                    aria-label="Hapus kata kunci pencarian"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Courier Filter */}
              <div className="md:col-span-2">
                <select
                  aria-label="Filter jasa kirim"
                  value={filters.courier}
                  onChange={(e) => navigateWithFilters({ courier: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#EE4D2D] focus:bg-white focus:outline-none"
                >
                  <option value="">Semua Kurir</option>
                  {carriers.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dual Calendar Range Picker + Quick Hari Ini Toggle */}
              <div className="relative md:col-span-4">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setIsDatePickerOpen((o) => !o)}
                    className={`flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      filters.date_from || filters.date_to
                        ? 'border-orange-300 bg-orange-50/60 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.75}
                        stroke="currentColor"
                        className="h-4 w-4 shrink-0 text-slate-500"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                        />
                      </svg>
                      <span className="truncate tabular-nums">
                        {filters.date_from || filters.date_to
                          ? `${formatDateIndo(filters.date_from || null)} – ${formatDateIndo(filters.date_to || null)}`
                          : 'Rentang Tanggal Order'}
                      </span>
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-3.5 w-3.5 shrink-0 text-slate-400"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {(filters.date_from || filters.date_to) && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setIsDatePickerOpen(false);
                        navigateWithFilters({ date_from: '', date_to: '' });
                      }}
                      title="Hapus filter tanggal"
                      aria-label="Hapus filter tanggal"
                      className="shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}

                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      setIsDatePickerOpen(false);
                      if (isTodayFilterActive) {
                        navigateWithFilters({ date_from: '', date_to: '' });
                      } else {
                        navigateWithFilters({ date_from: todayWib, date_to: todayWib });
                      }
                    }}
                    title="Filter cepat pesanan hari ini (WIB)"
                    className={`shrink-0 cursor-pointer rounded-xl border px-3 py-2.5 text-xs transition-colors whitespace-nowrap ${
                      isTodayFilterActive
                        ? 'border-[#EE4D2D] bg-[#FFF5F2] font-semibold text-[#EE4D2D]'
                        : 'border-slate-200 bg-slate-50 font-medium text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Hari Ini
                  </button>
                </div>

                <DualCalendarRangePicker
                  isOpen={isDatePickerOpen}
                  onClose={() => setIsDatePickerOpen(false)}
                  initialStartDate={filters.date_from}
                  initialEndDate={filters.date_to}
                  allowFuture={false}
                  align="right"
                  onApply={(start, end) => navigateWithFilters({ date_from: start, date_to: end })}
                />
              </div>

              {/* Sort Select */}
              <div className="flex items-center gap-2 md:col-span-2">
                <select
                  aria-label="Urutkan pesanan"
                  value={filters.sort}
                  onChange={(e) => navigateWithFilters({ sort: e.target.value as ShopeeOrderSort })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#EE4D2D] focus:bg-white focus:outline-none"
                >
                  <option value="ship_by_asc">Batas Kirim Terdekat</option>
                  <option value="newest">Pesanan Terbaru</option>
                  <option value="oldest">Pesanan Terlama</option>
                </select>
              </div>
            </form>

            {/* Active Filter Reset + Bulk Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 select-none">
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={orders.data.length === 0}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-slate-300 text-[#EE4D2D] focus:ring-[#EE4D2D]"
                  />
                  <span>Pilih Semua di Halaman Ini</span>
                </label>

                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                  {visibleSelectedCount} / {orders.data.length} dipilih
                </span>

                {visibleSelectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedOrderSns([])}
                    className="cursor-pointer text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                  >
                    Batal Pilih
                  </button>
                )}

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 text-slate-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reset Filter
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {(selectedShippableOrders.length > MAX_SHOPEE_BATCH ||
                  selectedPrintableOrders.length > MAX_SHOPEE_BATCH) && (
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                    Batas API Shopee maks. {MAX_SHOPEE_BATCH} pesanan/batch (50 teratas diproses)
                  </span>
                )}

                <button
                  type="button"
                  disabled={selectedShippableOrders.length === 0}
                  onClick={openMassShipModal}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#EE4D2D] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#d94122] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                    />
                  </svg>
                  <span className="tabular-nums">
                    Atur Pengiriman Massal
                    {selectedShippableOrders.length > 0 &&
                      ` (${Math.min(selectedShippableOrders.length, MAX_SHOPEE_BATCH)}${
                        selectedShippableOrders.length > MAX_SHOPEE_BATCH ? `/${MAX_SHOPEE_BATCH}` : ''
                      })`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={selectedPrintableOrders.length === 0 || printingTarget !== null}
                  onClick={handlePrintMassWaybill}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0B132B] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {printingTarget === 'MASS' ? (
                    <SpinnerIcon className="h-4 w-4 text-white" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                      />
                    </svg>
                  )}
                  <span className="tabular-nums">
                    {printingTarget === 'MASS'
                      ? 'Menyiapkan Resi...'
                      : `Cetak Resi Massal${
                          selectedPrintableOrders.length > 0
                            ? ` (${Math.min(selectedPrintableOrders.length, MAX_SHOPEE_BATCH)}${
                                selectedPrintableOrders.length > MAX_SHOPEE_BATCH
                                  ? `/${MAX_SHOPEE_BATCH}`
                                  : ''
                              })`
                            : ''
                        }`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Orders List / Empty State */}
        {orders.data.length === 0 ? (
          <section className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-xs">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-7 w-7"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">
              {hasActiveFilters
                ? 'Tidak Ada Pesanan yang Cocok dengan Filter'
                : 'Belum Ada Pesanan pada Tab Ini'}
            </h2>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              {hasActiveFilters
                ? 'Coba ubah kata kunci pencarian, kurir, atau rentang tanggal pesanan untuk melihat data lainnya.'
                : 'Gunakan tombol Sinkron Ulang di atas untuk menarik pesanan terbaru langsung dari toko Shopee Anda.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset Filter
                </button>
              )}
              {isShopeeConnected && (
                <button
                  type="button"
                  disabled={isChunkSyncing}
                  onClick={() => void runChunkedSync(3)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isChunkSyncing && <SpinnerIcon className="h-3.5 w-3.5 text-white" />}
                  <span>
                    {isChunkSyncing && chunkProgress
                      ? `Sinkron hari ${chunkProgress.current}/${chunkProgress.total}...`
                      : 'Sinkron Ulang (3 Hari Terakhir)'}
                  </span>
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="space-y-3.5" aria-label="Daftar pesanan Shopee">
            {orders.data.map((order) => {
              const normalizedStatus = normalizeOrderStatus(order.order_status);
              const statusMeta = getOrderStatusMeta(normalizedStatus);
              const items = Array.isArray(order.items_json) ? order.items_json : [];
              const totalQty = items.reduce((sum, it) => sum + resolveItemQty(it), 0);
              const isSelected = selectedSet.has(order.order_sn);
              const canShip = isShippableOrderStatus(normalizedStatus);
              const isProcessed = normalizedStatus === 'PROCESSED';
              const isShipped = normalizedStatus === 'SHIPPED';
              const isInCancel = normalizedStatus === 'IN_CANCEL';
              const isPrintingThis = printingTarget === order.order_sn;
              const isInstant = isInstantCarrier(order.shipping_carrier);
              const deadline = getDeadlineState(
                order.ship_by_date,
                order.order_created_at,
                normalizedStatus,
                isInstant,
                currentTimeMs
              );
              const snCopyKey = `sn:${order.order_sn}`;
              const resiCopyKey = `resi:${order.order_sn}`;

              return (
                <article
                  key={order.order_sn}
                  className={`overflow-hidden rounded-2xl border bg-white shadow-xs transition-colors ${
                    isSelected ? 'border-[#EE4D2D] ring-1 ring-[#EE4D2D]/30' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header Strip */}
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOrderSelection(order.order_sn)}
                        aria-label={`Pilih pesanan ${order.order_sn}`}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#EE4D2D] focus:ring-[#EE4D2D]"
                      />

                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.75}
                          stroke="currentColor"
                          className="h-4 w-4 text-slate-400"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                          />
                        </svg>
                        <span>
                          {order.buyer_username ? `@${order.buyer_username}` : 'Pembeli Shopee'}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          order.is_cod
                            ? 'border-orange-200 bg-orange-50 text-[#EE4D2D]'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {order.is_cod ? 'COD' : 'Non-COD'}
                      </span>

                      {order.label_print_count > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">
                          Dicetak {order.label_print_count}x
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                          Belum Dicetak
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.classes}`}
                      >
                        {statusMeta.label}
                      </span>
                      {isInstant && deadline.countdownText && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#EE4D2D]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#EE4D2D] animate-pulse" />
                          {deadline.countdownText}
                        </span>
                      )}
                      {isInstant && !deadline.countdownText && (isProcessed || deadline.courierStatusText === 'Mencari Kurir') && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Mencari Kurir
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                        <span className="text-[11px] text-slate-400">No. Pesanan</span>
                        <button
                          type="button"
                          onClick={() => openOrderDrawer(order, false)}
                          title="Klik untuk melihat Rincian Pesanan"
                          className="cursor-pointer font-mono text-xs font-bold text-slate-900 transition-colors hover:text-[#EE4D2D] hover:underline"
                        >
                          {order.order_sn}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyText(snCopyKey, order.order_sn, 'No. Pesanan');
                          }}
                          title="Salin No. Pesanan"
                          className="ml-0.5 cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                          {copiedKey === snCopyKey ? (
                            <span className="text-emerald-700">Disalin</span>
                          ) : (
                            'Salin'
                          )}
                        </button>
                      </div>

                      <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                        {formatOrderTimestampWIB(order.order_created_at)}
                      </span>
                    </div>
                  </header>

                  {/* Card Body: 12-col Seller Center Grid */}
                  <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-12">
                    {/* Col 1: Products + Buyer Note / Cancellation Reason */}
                    <div className="space-y-3 lg:col-span-5">
                      {items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-3 text-xs text-slate-500">
                          Daftar item produk belum tersedia pada data pesanan ini.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {items.map((item, idx) => {
                            const imgKey = `${order.order_sn}-${idx}-${item.image_url ?? ''}`;
                            const skuText = item.sku || item.model_sku || item.item_sku;
                            const qty = resolveItemQty(item);
                            const unitPrice = resolveItemUnitPrice(item);
                            const showImage = Boolean(item.image_url && !failedImages[imgKey]);

                            return (
                              <div key={imgKey} className="flex items-start gap-3">
                                {showImage ? (
                                  <img
                                    src={item.image_url!}
                                    alt={item.item_name}
                                    loading="lazy"
                                    onError={() =>
                                      setFailedImages((prev) => ({
                                        ...prev,
                                        [imgKey]: true,
                                      }))
                                    }
                                    className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-slate-100 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth={1.5}
                                      stroke="currentColor"
                                      className="h-6 w-6"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                                      />
                                    </svg>
                                  </div>
                                )}

                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="text-xs font-semibold leading-snug text-slate-900">
                                    {item.item_name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    {item.model_name && (
                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                        {item.model_name}
                                      </span>
                                    )}
                                    {skuText && (
                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">
                                        SKU: {skuText}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-medium text-slate-600 tabular-nums">
                                    {formatCurrencyIDR(unitPrice)}{' '}
                                    <span className="font-bold text-slate-900">× {qty}</span>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {order.buyer_note && order.buyer_note.trim() !== '' && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                          <span className="font-bold text-amber-800">Catatan Pembeli: </span>
                          <span>{order.buyer_note}</span>
                        </div>
                      )}

                      {(order.buyer_cancel_reason || order.cancel_reason) && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                          <span className="font-bold text-rose-800">
                            {isInCancel ? 'Alasan Pengajuan Batal: ' : 'Alasan Pembatalan: '}
                          </span>
                          <span>{order.buyer_cancel_reason || order.cancel_reason}</span>
                        </div>
                      )}
                    </div>

                    {/* Col 2: Total Amount & Payment Method */}
                    <div className="space-y-1 lg:col-span-2 lg:border-l lg:border-slate-100 lg:pl-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Pesanan
                      </p>
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatCurrencyIDR(order.total_amount)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {order.payment_method || (order.is_cod ? 'Cash on Delivery (COD)' : '-')}
                      </p>
                      {items.length > 0 && (
                        <p className="text-[11px] font-medium text-slate-400 tabular-nums">
                          {items.length} item • {totalQty} pcs
                        </p>
                      )}
                    </div>

                    {/* Col 3: Carrier, Tracking Number, Fulfillment & Ship-By Deadline */}
                    <div className="space-y-2 lg:col-span-3 lg:border-l lg:border-slate-100 lg:pl-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Jasa Kirim & Resi
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">
                          {order.shipping_carrier || 'Kurir belum ditentukan'}
                        </span>
                        {isInstantCarrier(order.shipping_carrier) && (
                          <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-[#EE4D2D]">
                            INSTAN
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[11px] text-slate-400">No. Resi</span>
                        {order.tracking_number ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {order.tracking_number}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyText(resiCopyKey, order.tracking_number!, 'No. Resi')
                              }
                              title="Salin No. Resi"
                              className="cursor-pointer rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            >
                              {copiedKey === resiCopyKey ? (
                                <span className="text-emerald-700">Disalin</span>
                              ) : (
                                'Salin'
                              )}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs italic text-slate-400">Resi belum dibuat</p>
                        )}
                      </div>

                      {order.fulfillment_method && (
                        <p className="text-[11px] text-slate-500">
                          Metode:{' '}
                          <span className="font-semibold text-slate-700">
                            {formatFulfillmentMethod(order.fulfillment_method)}
                          </span>
                        </p>
                      )}

                      {(() => {
                        const courierMeta = getCourierAcceptanceMeta(
                          order.order_status,
                          order.logistics_status
                        );
                        const canCheckTracking = Boolean(
                          order.tracking_number ||
                            normalizedStatus === 'PROCESSED' ||
                            normalizedStatus === 'SHIPPED' ||
                            normalizedStatus === 'TO_CONFIRM_RECEIVE'
                        );
                        return (
                          <div className="space-y-1 pt-0.5">
                            <span className="text-[11px] text-slate-400">Status Ekspedisi</span>
                            <div>
                              <span
                                title={courierMeta.detail}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${courierMeta.badgeClasses}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${courierMeta.dotClasses}`} />
                                <span>{courierMeta.label}</span>
                              </span>
                            </div>
                            <p className="text-[11px] leading-snug text-slate-500">
                              {courierMeta.detail}
                            </p>
                            {canCheckTracking && (
                              <button
                                type="button"
                                onClick={() => openOrderDrawer(order, true)}
                                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#EE4D2D] hover:underline"
                              >
                                <span>Lacak Ekspedisi Live</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      <div className="space-y-0.5 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Batas Kirim</span>
                          {deadline.badgeText && (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${deadline.badgeClass}`}
                            >
                              {deadline.badgeText}
                            </span>
                          )}
                        </div>
                        {deadline.countdownText ? (
                          <p className="text-xs font-bold text-rose-600 animate-pulse">
                            ⏱ {deadline.countdownText}
                          </p>
                        ) : deadline.courierStatusText ? (
                          <p className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            🛵 {deadline.courierStatusText}
                          </p>
                        ) : null}
                        <p className={`text-[11px] tabular-nums ${deadline.textClass}`}>
                          {deadline.label}
                        </p>
                      </div>
                    </div>

                    {/* Col 4: Contextual Seller Actions */}
                    <div className="flex flex-col gap-2 lg:col-span-2 lg:border-l lg:border-slate-100 lg:pl-4">
                      {canShip && (
                        <button
                          type="button"
                          onClick={() => openSingleShipModal(order)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#EE4D2D] px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#d94122]"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                            />
                          </svg>
                          <span>Atur Pengiriman</span>
                        </button>
                      )}

                      {isProcessed && (
                        <button
                          type="button"
                          disabled={printingTarget !== null}
                          onClick={() => handlePrintSingleWaybill(order)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0B132B] px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPrintingThis ? (
                            <SpinnerIcon className="h-4 w-4 text-white" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                              />
                            </svg>
                          )}
                          <span>
                            {isPrintingThis
                              ? 'Menyiapkan...'
                              : order.label_print_count > 0
                                ? 'Cetak Ulang Resi'
                                : 'Cetak Resi'}
                          </span>
                        </button>
                      )}

                      {isShipped && (
                        <button
                          type="button"
                          disabled={printingTarget !== null}
                          onClick={() => handlePrintSingleWaybill(order)}
                          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPrintingThis ? (
                            <SpinnerIcon className="h-4 w-4 text-slate-700" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4 text-slate-600">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                              />
                            </svg>
                          )}
                          <span>{isPrintingThis ? 'Menyiapkan...' : 'Cetak Ulang Resi'}</span>
                        </button>
                      )}

                      {isInCancel && (
                        <>
                          <button
                            type="button"
                            disabled={cancellingOrderSn === order.order_sn}
                            onClick={() => setCancelTarget({ order, operation: 'ACCEPT' })}
                            className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
                          >
                            Setujui Batal
                          </button>
                          <button
                            type="button"
                            disabled={cancellingOrderSn === order.order_sn}
                            onClick={() => setCancelTarget({ order, operation: 'REJECT' })}
                            className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
                          >
                            Tolak (Kirim)
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => openOrderDrawer(order, false)}
                        className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4 text-slate-500">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Rincian</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* Pagination */}
        {orders.last_page > 1 && (
          <nav
            aria-label="Navigasi halaman pesanan"
            className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500 shadow-xs sm:flex-row"
          >
            <div className="tabular-nums">
              Menampilkan{' '}
              <strong className="font-bold text-slate-900">
                {orders.from ?? (orders.current_page - 1) * orders.per_page + 1}
              </strong>{' '}
              s/d{' '}
              <strong className="font-bold text-slate-900">
                {orders.to ?? Math.min(orders.current_page * orders.per_page, orders.total)}
              </strong>{' '}
              dari{' '}
              <strong className="font-bold text-slate-900">
                {orders.total.toLocaleString('id-ID')}
              </strong>{' '}
              pesanan
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {orders.links.map((link, i) => {
                const label = formatPaginationLabel(link.label);
                if (!link.url) {
                  return (
                    <span
                      key={i}
                      className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-400"
                    >
                      {label}
                    </span>
                  );
                }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      invalidateAutoSyncForNavigation();
                      router.get(link.url!, {}, { preserveScroll: true, preserveState: true });
                    }}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 font-medium transition-colors tabular-nums ${
                      link.active
                        ? 'border-[#0B132B] bg-[#0B132B] font-bold text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>

      {/* Ship Order Modal (Single & Mass) */}
      <ShipOrderModal
        show={shipModal.show}
        mode={shipModal.mode}
        order={shipModal.order}
        orders={shipModal.orders}
        onClose={() =>
          setShipModal((prev) => ({
            ...prev,
            show: false,
          }))
        }
        onShipped={handleSingleShipped}
        onMassShipped={handleMassShipped}
        onPrintWaybill={handlePrintSingleWaybill}
      />

      {/* A4 PDF Waybill Preview Modal */}
      <WaybillPreviewModal
        show={waybillModal.show}
        pdfUrl={waybillModal.pdfUrl}
        title={waybillModal.title}
        filename={waybillModal.filename}
        orderCount={waybillModal.orderCount}
        warnings={waybillModal.warnings}
        onClose={closeWaybillModal}
      />

      {/* Order Detail Slide-Over Drawer */}
      <OrderDetailDrawer
        order={drawerOrder}
        onClose={() => {
          setDrawerOrder(null);
          setDrawerAutoTrack(false);
        }}
        onOpenShip={(targetOrder) => openSingleShipModal(targetOrder)}
        onPrintWaybill={handlePrintSingleWaybill}
        onRefresh={handleRefreshSingleOrder}
        onHandleCancel={(targetOrder, operation) =>
          setCancelTarget({ order: targetOrder, operation })
        }
        onOrderUpdated={(updatedOrder) => {
          const prevLog = drawerOrder?.logistics_status ?? null;
          const prevStatus = drawerOrder?.order_status ?? null;
          setDrawerOrder(updatedOrder);
          if (
            updatedOrder.logistics_status !== prevLog ||
            updatedOrder.order_status !== prevStatus
          ) {
            router.reload({ only: ['orders', 'tabCounts'] });
          }
        }}
        autoLoadTracking={drawerAutoTrack}
        isRefreshing={Boolean(drawerOrder && refreshingOrderSn === drawerOrder.order_sn)}
        isPrinting={Boolean(
          drawerOrder && (printingTarget === drawerOrder.order_sn || printingTarget === 'MASS')
        )}
        isCancelling={Boolean(drawerOrder && cancellingOrderSn === drawerOrder.order_sn)}
      />

      {/* Inline Buyer Cancellation Confirmation Dialog (Above Drawer z-[9998]) */}
      {cancelTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi keputusan pembatalan Shopee"
          >
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
              onClick={closeCancelConfirm}
            />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                <h3 className="text-sm font-bold text-slate-900">
                  {cancelTarget.operation === 'ACCEPT'
                    ? 'Setujui Pengajuan Pembatalan?'
                    : 'Tolak Pengajuan Pembatalan?'}
                </h3>
                <button
                  type="button"
                  disabled={Boolean(cancellingOrderSn)}
                  onClick={closeCancelConfirm}
                  aria-label="Tutup dialog"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3 p-5 text-xs text-slate-700">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">No. Pesanan</span>
                    <span className="font-mono font-bold text-slate-900">
                      {cancelTarget.order.order_sn}
                    </span>
                  </div>
                  {cancelTarget.order.buyer_username && (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-slate-500">Pembeli</span>
                      <span className="font-semibold text-slate-800">
                        @{cancelTarget.order.buyer_username}
                      </span>
                    </div>
                  )}
                </div>

                {cancelTarget.order.buyer_cancel_reason && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-rose-900">
                    <span className="font-bold">Alasan Pembeli: </span>
                    <span>{cancelTarget.order.buyer_cancel_reason}</span>
                  </div>
                )}

                <p className="leading-relaxed text-slate-600">
                  {cancelTarget.operation === 'ACCEPT'
                    ? 'Pesanan akan langsung dibatalkan di Shopee Open Platform dan status pesanan lokal akan diperbarui menjadi Dibatalkan.'
                    : 'Pengajuan pembatalan pembeli akan ditolak di Shopee Open Platform dan Anda wajib melanjutkan proses pengiriman pesanan ini.'}
                </p>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={Boolean(cancellingOrderSn)}
                    onClick={closeCancelConfirm}
                    className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(cancellingOrderSn)}
                    onClick={executeBuyerCancellation}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
                      cancelTarget.operation === 'ACCEPT'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-[#0B132B] hover:bg-slate-800'
                    }`}
                  >
                    {cancellingOrderSn && <SpinnerIcon className="h-3.5 w-3.5 text-white" />}
                    <span>
                      {cancellingOrderSn
                        ? 'Memproses...'
                        : cancelTarget.operation === 'ACCEPT'
                          ? 'Ya, Setujui Batal'
                          : 'Ya, Tolak & Lanjut Kirim'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </AppLayout>
  );
}
