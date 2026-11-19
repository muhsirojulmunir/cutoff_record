import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal';
import {
  ShopeeDropoffBranch,
  ShopeeDropoffSlug,
  ShopeeFulfillmentMethod,
  ShopeeMassShipResult,
  ShopeeOrderRecord,
  ShopeePickupAddress,
  ShopeePickupTimeSlot,
  ShopeeShipResult,
  ShopeeShippingParameterResponse,
} from '../../Types/shopeeOrder';
import {
  SpinnerIcon,
  formatFulfillmentMethod,
  getCsrfToken,
  isShippableOrderStatus,
  isWaybillBlockedStatus,
  useOverlayScrollLockAndEscape,
} from './overlayHelpers';

export interface ShipOrderModalProps {
  show: boolean;
  mode: 'single' | 'mass';
  baseRoute?: string;
  order?: ShopeeOrderRecord | null;
  orders?: ShopeeOrderRecord[];
  onClose: () => void;
  onShipped?: (result: ShopeeShipResult) => void;
  onMassShipped?: (result: ShopeeMassShipResult) => void;
  onSuccess?: (result: ShopeeShipResult | ShopeeMassShipResult) => void;
  onPrintWaybill?: (order: ShopeeOrderRecord) => void;
  onPrintMassWaybill?: (orders: ShopeeOrderRecord[]) => Promise<void> | void;
}

type MassPreferredMethod = 'auto' | 'pickup' | 'dropoff';

interface ParsedJsonResponse<T> {
  data: T | null;
  rawText: string;
  cleanError?: string;
}

async function parseJsonSafe<T>(response: Response): Promise<ParsedJsonResponse<T>> {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    return { data: null, rawText: '', cleanError: 'Tidak dapat membaca respons dari server.' };
  }

  if (!rawText || !rawText.trim()) {
    return { data: null, rawText: '', cleanError: 'Respons server kosong.' };
  }

  // 1. Coba parse langsung sebagai JSON
  try {
    return { data: JSON.parse(rawText) as T, rawText };
  } catch {
    // 2. Jika ada PHP notice/warning sebelum atau sesudah JSON, coba cari substring {...}
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const jsonSlice = rawText.slice(firstBrace, lastBrace + 1);
        return { data: JSON.parse(jsonSlice) as T, rawText };
      } catch {
        // Abaikan dan lanjut ke ekstraksi teks error
      }
    }

    // 3. Ekstrak pesan bersih dari HTML bila server mengembalikan halaman HTML (misal 500/419/Fatal)
    let cleanError = '';
    const titleMatch = rawText.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      cleanError = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    if (!cleanError) {
      cleanError = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    }

    return { data: null, rawText, cleanError };
  }
}

function extractErrorMessage(
  payload: Record<string, unknown> | null,
  status: number,
  fallback: string,
  cleanError?: string
): string {
  if (payload) {
    // 1. Validation errors object or string
    if (typeof payload.errors === 'string' && payload.errors.trim()) {
      return payload.errors;
    }
    if (payload.errors && typeof payload.errors === 'object') {
      const firstFieldErrors = Object.values(payload.errors as Record<string, unknown>)[0];
      if (Array.isArray(firstFieldErrors) && typeof firstFieldErrors[0] === 'string' && firstFieldErrors[0].trim()) {
        return firstFieldErrors[0];
      }
    }
    // 2. Direct message
    if (typeof payload.message === 'string' && payload.message.trim() !== '') {
      return payload.message;
    }
    // 3. Direct error string
    if (typeof payload.error === 'string' && payload.error.trim() !== '') {
      return payload.error;
    }
    // 4. Failed array from batch results (Shopee/TikTok)
    if (Array.isArray(payload.failed) && payload.failed.length > 0) {
      const firstFailed = payload.failed[0] as Record<string, unknown>;
      const msg =
        typeof firstFailed?.message === 'string' && firstFailed.message.trim() !== ''
          ? firstFailed.message
          : typeof firstFailed?.error === 'string' && firstFailed.error.trim() !== ''
            ? firstFailed.error
            : '';
      if (msg) {
        return firstFailed.order_sn ? `${firstFailed.order_sn}: ${msg}` : msg;
      }
    }
  }

  if (cleanError && cleanError.trim()) {
    return `${fallback}: ${cleanError}`;
  }

  return `${fallback} (HTTP ${status})`;
}

function formatPickupAddressLabel(addr: ShopeePickupAddress): string {
  const parts = [addr.address, addr.district, addr.city, addr.state, addr.zipcode]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Alamat Penjemputan Toko';
}

function formatPickupSlotLabel(slot: ShopeePickupTimeSlot, includeDate: boolean = true): string {
  let timeText = typeof slot.time_text === 'string' ? slot.time_text.trim() : '';

  // Jika time_text kosong dari Shopee API, periksa apakah pickup_time_id berupa unix timestamp
  if (!timeText && slot.pickup_time_id) {
    const idNum = Number(slot.pickup_time_id);
    if (Number.isFinite(idNum) && idNum > 1_000_000_000) {
      const ms = idNum > 10_000_000_000 ? idNum : idNum * 1000;
      timeText = 'Pukul ' + new Date(ms).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      }).replace('.', ':') + ' WIB';
    }
  }

  let dateLabel = '';
  if (includeDate && slot.date !== undefined && slot.date !== null && slot.date !== '') {
    const num = Number(slot.date);
    if (Number.isFinite(num) && num > 1_000_000_000) {
      const ms = num > 10_000_000_000 ? num : num * 1000;
      dateLabel = new Date(ms).toLocaleDateString('id-ID', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      });
    } else if (typeof slot.date === 'string') {
      dateLabel = slot.date.trim();
    }
  }

  if (dateLabel && timeText) return `${dateLabel} — ${timeText}`;
  return timeText || dateLabel || (slot.pickup_time_id ? `Slot ${slot.pickup_time_id}` : 'Slot Terdekat');
}

function formatDropoffBranchLabel(branch: ShopeeDropoffBranch): string {
  const title = branch.branch_name?.trim() || `Cabang #${branch.branch_id}`;
  const loc = [branch.address, branch.district, branch.city]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(', ');
  return loc ? `${title} — ${loc}` : title;
}

function formatOrderDate(dateVal?: string | number | null): string {
  if (!dateVal) return '-';
  const num = Number(dateVal);
  const dateObj =
    Number.isFinite(num) && num > 1_000_000_000
      ? new Date(num > 10_000_000_000 ? num : num * 1000)
      : new Date(String(dateVal));
  if (isNaN(dateObj.getTime())) return String(dateVal);
  return dateObj
    .toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    })
    .replace(/\./g, ':');
}

function pickInitialMethod(params: ShopeeShippingParameterResponse): ShopeeFulfillmentMethod | null {
  const addresses = params.pickup?.address_list ?? [];
  if (params.pickup_supported && (addresses.length > 0 || !params.dropoff_supported)) {
    return 'pickup';
  }
  if (params.dropoff_supported) {
    return 'dropoff';
  }
  if (params.pickup_supported) {
    return 'pickup';
  }
  if (params.non_integrated_supported) {
    return 'non_integrated';
  }
  return null;
}

function pickDefaultAddress(addresses: ShopeePickupAddress[]): ShopeePickupAddress | null {
  if (addresses.length === 0) return null;
  const preferred = addresses.find((a) => {
    const flags = Array.isArray(a.address_flag) ? a.address_flag : [];
    return flags.includes('default_address') || Boolean(a.default) || Boolean(a.is_default);
  });
  return preferred ?? addresses[0];
}

function TruckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V4.875A1.125 1.125 0 0013.125 3.75h-8.25A1.125 1.125 0 003.75 4.875v9.375m10.5-5.25H20.25" />
    </svg>
  );
}

function StoreIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.25A2.25 2.25 0 010 18.75V10.5m18 10.5h3.75a2.25 2.25 0 002.25-2.25V10.5M3.75 21h16.5M3.75 9h16.5m-16.5 0a2.25 2.25 0 01-2.25-2.25V4.5a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 4.5v2.25a2.25 2.25 0 01-2.25 2.25m-16.5 0a2.25 2.25 0 002.25 2.25h12a2.25 2.25 0 002.25-2.25" />
    </svg>
  );
}

function PackageIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function PrinterIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
    </svg>
  );
}

export default function ShipOrderModal({
  show,
  mode,
  baseRoute = '/shopee-orders',
  order = null,
  orders = [],
  onClose,
  onShipped,
  onMassShipped,
  onSuccess,
  onPrintWaybill,
  onPrintMassWaybill,
}: ShipOrderModalProps) {
  const isTiktok = baseRoute.includes('tiktok');
  const platformName = isTiktok ? 'TikTok Shop' : 'Shopee';

  const isMountedRef = useRef(true);
  const singleShippedSnRef = useRef<string | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const submitSeqRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      submitAbortRef.current?.abort();
      submitAbortRef.current = null;
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // Single-mode parameter & form state
  const [loadingParams, setLoadingParams] = useState(false);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [shippingParams, setShippingParams] = useState<ShopeeShippingParameterResponse | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<ShopeeFulfillmentMethod>('pickup');
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [showOtherAddresses, setShowOtherAddresses] = useState(false);
  const [selectedPickupTimeId, setSelectedPickupTimeId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [manualBranchId, setManualBranchId] = useState<string>('');
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [senderRealName, setSenderRealName] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [singleResult, setSingleResult] = useState<ShopeeShipResult | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  // Mass-mode dynamic state
  const [pendingMassOrders, setPendingMassOrders] = useState<ShopeeOrderRecord[]>([]);
  const [activeCourier, setActiveCourier] = useState<string>('');
  const [selectedMassSns, setSelectedMassSns] = useState<string[]>([]);
  const [courierParamsCache, setCourierParamsCache] = useState<
    Record<string, ShopeeShippingParameterResponse | null>
  >({});
  const [loadingCourierParams, setLoadingCourierParams] = useState(false);
  const [courierParamsError, setCourierParamsError] = useState<string | null>(null);

  const [massAddressId, setMassAddressId] = useState<number | null>(null);
  const [showMassAddressPicker, setShowMassAddressPicker] = useState(false);
  const [massPickupDate, setMassPickupDate] = useState<string>('');
  const [massPickupTimeId, setMassPickupTimeId] = useState<string>('');
  const [massBranchId, setMassBranchId] = useState<number | null>(null);
  const [massSenderName, setMassSenderName] = useState<string>('');
  const [massExecutingMethod, setMassExecutingMethod] = useState<'pickup' | 'dropoff' | null>(null);
  const [massResult, setMassResult] = useState<ShopeeMassShipResult | null>(null);
  const [printedOrderSns, setPrintedOrderSns] = useState<Set<string>>(new Set());
  const [isPreparingWaybill, setIsPreparingWaybill] = useState(false);
  const [waybillLoadingMessage, setWaybillLoadingMessage] = useState<string | null>(null);
  const [shipSuccessNotice, setShipSuccessNotice] = useState<string | null>(null);

  // Shared submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  submittingRef.current = submitting;

  // Reference-counted scroll lock + LIFO topmost-only Escape handler
  useOverlayScrollLockAndEscape(show, onClose, {
    canClose: () => !submittingRef.current,
  });

  // Reset modal state on target switch
  useEffect(() => {
    submitSeqRef.current += 1;
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }

    singleShippedSnRef.current = null;
    submittingRef.current = false;
    setSubmitting(false);
    setSubmitError(null);
    setParamsError(null);
    setSingleResult(null);
    setMassResult(null);
    setCopiedTracking(false);
    setSelectedSlug('');
    setSenderRealName('');
    setTrackingNumber('');
    setManualBranchId('');
    setMassSenderName('');
    setShowOtherAddresses(false);
    setShowMassAddressPicker(false);
    setMassExecutingMethod(null);
    setPrintedOrderSns(new Set());
    setIsPreparingWaybill(false);
    setShipSuccessNotice(null);
  }, [show, mode, order?.order_sn]);

  // Synchronize orders when opening mass shipment
  useEffect(() => {
    if (show && mode === 'mass') {
      setPendingMassOrders(orders);
      setMassResult(null);
      setSubmitError(null);
      setShipSuccessNotice(null);
      setPrintedOrderSns(new Set());
      setIsPreparingWaybill(false);
    }
  }, [show, mode, orders]);

  // Fetch single-order shipping parameters
  useEffect(() => {
    if (!show || mode !== 'single' || !order?.order_sn) {
      setShippingParams(null);
      setLoadingParams(false);
      return;
    }

    if (singleShippedSnRef.current === order.order_sn) {
      return;
    }

    const controller = new AbortController();
    const orderSn = order.order_sn;
    const pkgQuery = order.package_number
      ? `?package_number=${encodeURIComponent(order.package_number)}`
      : '';

    setLoadingParams(true);
    setParamsError(null);
    setShippingParams(null);

    fetch(`${baseRoute}/${encodeURIComponent(orderSn)}/shipping-parameters${pkgQuery}`, {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then(async (res) => {
        const { data, cleanError } = await parseJsonSafe<ShopeeShippingParameterResponse & Record<string, unknown>>(res);
        if (!res.ok || !data || data.status === 'error') {
          throw new Error(
            extractErrorMessage(
              data as Record<string, unknown> | null,
              res.status,
              `Gagal memuat parameter pengiriman dari ${platformName}`,
              cleanError
            )
          );
        }
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted || !isMountedRef.current) return;
        setShippingParams(data);

        const initial = pickInitialMethod(data);
        if (initial) {
          setSelectedMethod(initial);
        }

        const addresses = data.pickup?.address_list ?? [];
        const defaultAddr = pickDefaultAddress(addresses);
        setSelectedAddressId(defaultAddr ? defaultAddr.address_id : null);
        const firstSlot = defaultAddr?.time_slot_list?.[0]?.pickup_time_id ?? '';
        setSelectedPickupTimeId(firstSlot);

        const branches = data.dropoff?.branch_list ?? [];
        setSelectedBranchId(branches[0]?.branch_id ?? null);
        const slugs = data.dropoff?.slug_list ?? [];
        setSelectedSlug(slugs[0]?.slug ?? '');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || !isMountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setParamsError(
          err instanceof Error ? err.message : 'Terjadi kendala jaringan saat mengambil parameter pengiriman.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted && isMountedRef.current) {
          setLoadingParams(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [show, mode, order?.order_sn, order?.package_number, retryCounter, baseRoute, platformName]);

  const pickupAddresses = shippingParams?.pickup?.address_list ?? [];
  const defaultAddress = useMemo(() => pickDefaultAddress(pickupAddresses), [pickupAddresses]);
  const otherAddresses = useMemo(
    () => pickupAddresses.filter((a) => a.address_id !== defaultAddress?.address_id),
    [pickupAddresses, defaultAddress]
  );
  const selectedAddress = useMemo(
    () => pickupAddresses.find((a) => a.address_id === selectedAddressId) ?? defaultAddress ?? null,
    [pickupAddresses, selectedAddressId, defaultAddress]
  );
  const pickupTimeSlots = selectedAddress?.time_slot_list ?? [];

  const dropoffBranches = shippingParams?.dropoff?.branch_list ?? [];
  const dropoffSlugs: ShopeeDropoffSlug[] = shippingParams?.dropoff?.slug_list ?? [];

  const pickupInfoNeeded = useMemo(
    () => (shippingParams?.info_needed?.pickup ?? []).map((s) => String(s).toLowerCase()),
    [shippingParams]
  );
  const dropoffInfoNeeded = useMemo(
    () => (shippingParams?.info_needed?.dropoff ?? []).map((s) => String(s).toLowerCase()),
    [shippingParams]
  );
  const nonIntegratedInfoNeeded = useMemo(
    () => (shippingParams?.info_needed?.non_integrated ?? []).map((s) => String(s).toLowerCase()),
    [shippingParams]
  );

  const needsSenderRealName =
    dropoffInfoNeeded.includes('sender_real_name') ||
    Boolean(shippingParams?.dropoff?.sender_real_name_required);

  const needsDropoffTrackingNo =
    dropoffInfoNeeded.includes('tracking_no') ||
    dropoffInfoNeeded.includes('tracking_number') ||
    Boolean(shippingParams?.dropoff?.tracking_no_required);

  const needsPickupTrackingNo =
    pickupInfoNeeded.includes('tracking_no') ||
    pickupInfoNeeded.includes('tracking_number') ||
    Boolean(shippingParams?.pickup?.tracking_no_required);

  const needsNonIntegratedTrackingNo =
    nonIntegratedInfoNeeded.includes('tracking_no') ||
    nonIntegratedInfoNeeded.includes('tracking_number');

  const needsBranchId = dropoffInfoNeeded.includes('branch_id') || dropoffBranches.length > 0;
  const needsSlug = dropoffInfoNeeded.includes('slug') || dropoffSlugs.length > 0;

  const supportedTabs = useMemo(() => {
    if (!shippingParams) return [];
    const tabs: Array<{ key: ShopeeFulfillmentMethod; label: string; hint: string }> = [];
    if (shippingParams.pickup_supported) {
      tabs.push({
        key: 'pickup',
        label: 'Pick-up (Jemput Kurir)',
        hint: 'Kurir menjemput paket ke alamat toko',
      });
    }
    if (shippingParams.dropoff_supported) {
      tabs.push({
        key: 'dropoff',
        label: 'Antar ke Counter (Drop-off)',
        hint: 'Serahkan paket ke gerai kurir terdekat',
      });
    }
    if (shippingParams.non_integrated_supported) {
      tabs.push({
        key: 'non_integrated',
        label: 'Non-Integrated',
        hint: 'Input nomor resi manual',
      });
    }
    return tabs;
  }, [shippingParams]);

  // Mass mode: Grouping by courier & shippable orders
  const eligibleMassOrders = useMemo(
    () =>
      pendingMassOrders.filter(
        (o) =>
          o.order_status !== 'CANCELLED' &&
          o.order_status !== 'UNPAID' &&
          (isShippableOrderStatus(o.order_status) ||
            o.order_status === 'PROCESSED' ||
            Boolean(o.tracking_number))
      ),
    [pendingMassOrders]
  );

  const isOrderPrinted = useCallback(
    (o: ShopeeOrderRecord) =>
      printedOrderSns.has(o.order_sn) || Number(o.label_print_count) > 0,
    [printedOrderSns]
  );

  const courierGroups = useMemo(() => {
    const groups: Record<string, ShopeeOrderRecord[]> = {};
    for (const o of eligibleMassOrders) {
      const carrier = (o.shipping_carrier || 'Lainnya').trim();
      if (!groups[carrier]) groups[carrier] = [];
      groups[carrier].push(o);
    }
    return groups;
  }, [eligibleMassOrders]);

  const courierKeys = useMemo(() => Object.keys(courierGroups), [courierGroups]);

  const getCourierStats = useCallback(
    (carrier: string) => {
      const list = carrier === 'all' ? eligibleMassOrders : (courierGroups[carrier] ?? []);
      const total = list.length;
      const printed = list.filter((o) => isOrderPrinted(o)).length;
      const unprinted = total - printed;
      const needsArrange = list.filter((o) => !o.tracking_number && isShippableOrderStatus(o.order_status)).length;
      const isAllPrinted = total > 0 && unprinted === 0;
      return { total, printed, unprinted, needsArrange, isAllPrinted };
    },
    [eligibleMassOrders, courierGroups, isOrderPrinted]
  );

  const allMassStats = useMemo(() => getCourierStats('all'), [getCourierStats]);
  const isAllMassCompleted = eligibleMassOrders.length > 0 && allMassStats.unprinted === 0;

  // Set active courier to the first courier group if not set or invalid
  useEffect(() => {
    if (mode !== 'mass') return;
    if (courierKeys.length > 0) {
      if (!activeCourier || !courierKeys.includes(activeCourier)) {
        setActiveCourier(courierKeys[0]);
      }
    } else {
      setActiveCourier('');
    }
  }, [mode, courierKeys, activeCourier]);

  // Orders displayed in the active view
  const displayedMassOrders = useMemo(() => {
    if (!activeCourier) return eligibleMassOrders;
    return courierGroups[activeCourier] ?? eligibleMassOrders;
  }, [activeCourier, eligibleMassOrders, courierGroups]);

  // Auto-select all displayed orders on active courier change
  useEffect(() => {
    if (mode !== 'mass') return;
    setSelectedMassSns(displayedMassOrders.slice(0, 50).map((o) => o.order_sn));
  }, [mode, activeCourier, displayedMassOrders]);

  const targetOrdersToShip = useMemo(
    () => displayedMassOrders.filter((o) => selectedMassSns.includes(o.order_sn)).slice(0, 50),
    [displayedMassOrders, selectedMassSns]
  );

  const isAllVisibleSelected =
    displayedMassOrders.length > 0 &&
    displayedMassOrders.slice(0, 50).every((o) => selectedMassSns.includes(o.order_sn));

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      const visibleSns = new Set(displayedMassOrders.map((o) => o.order_sn));
      setSelectedMassSns((prev) => prev.filter((sn) => !visibleSns.has(sn)));
    } else {
      const visibleSns = displayedMassOrders.slice(0, 50).map((o) => o.order_sn);
      setSelectedMassSns((prev) => Array.from(new Set([...prev, ...visibleSns])));
    }
  };

  const toggleOrderSelection = (sn: string) => {
    setSelectedMassSns((prev) =>
      prev.includes(sn) ? prev.filter((item) => item !== sn) : [...prev, sn]
    );
  };

  // Sample order to fetch courier parameters for active courier
  const sampleOrderForCourier = useMemo(
    () => displayedMassOrders[0] ?? eligibleMassOrders[0] ?? null,
    [displayedMassOrders, eligibleMassOrders]
  );

  useEffect(() => {
    if (!show || mode !== 'mass' || !sampleOrderForCourier?.order_sn) return;
    const courierKey = activeCourier;
    if (courierParamsCache[courierKey] !== undefined) return;

    const controller = new AbortController();
    const orderSn = sampleOrderForCourier.order_sn;
    const pkgQuery = sampleOrderForCourier.package_number
      ? `?package_number=${encodeURIComponent(sampleOrderForCourier.package_number)}`
      : '';

    setLoadingCourierParams(true);
    setCourierParamsError(null);

    fetch(`${baseRoute}/${encodeURIComponent(orderSn)}/shipping-parameters${pkgQuery}`, {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then(async (res) => {
        const { data, cleanError } = await parseJsonSafe<ShopeeShippingParameterResponse>(res);
        if (controller.signal.aborted || !isMountedRef.current) return;
        if (res.ok && data) {
          setCourierParamsCache((prev) => ({ ...prev, [courierKey]: data }));
        } else {
          setCourierParamsError(
            extractErrorMessage(
              data as Record<string, unknown> | null,
              res.status,
              'Gagal memuat parameter kurir.',
              cleanError
            )
          );
        }
      })
      .catch(() => {
        if (controller.signal.aborted || !isMountedRef.current) return;
        setCourierParamsError('Gagal menghubungi server.');
      })
      .finally(() => {
        if (!controller.signal.aborted && isMountedRef.current) {
          setLoadingCourierParams(false);
        }
      });

    return () => controller.abort();
  }, [
    show,
    mode,
    activeCourier,
    sampleOrderForCourier?.order_sn,
    sampleOrderForCourier?.package_number,
    baseRoute,
    courierParamsCache,
  ]);

  const activeShippingParams = courierParamsCache[activeCourier] ?? null;

  useEffect(() => {
    if (!activeShippingParams) return;

    const addresses = activeShippingParams.pickup?.address_list ?? [];
    const defaultAddr = pickDefaultAddress(addresses);
    if (defaultAddr) {
      setMassAddressId(defaultAddr.address_id);
      const slots = defaultAddr.time_slot_list ?? [];
      if (slots.length > 0) {
        setMassPickupTimeId(slots[0].pickup_time_id);
        setMassPickupDate(String(slots[0].date ?? ''));
      }
    }

    const branches = activeShippingParams.dropoff?.branch_list ?? [];
    if (branches.length > 0) {
      setMassBranchId(branches[0].branch_id);
    }
  }, [activeShippingParams]);

  const currentMassAddress = useMemo(() => {
    const list = activeShippingParams?.pickup?.address_list ?? [];
    if (massAddressId !== null) {
      const found = list.find((a) => a.address_id === massAddressId);
      if (found) return found;
    }
    return pickDefaultAddress(list);
  }, [activeShippingParams, massAddressId]);

  const availableMassSlots = useMemo(() => {
    return currentMassAddress?.time_slot_list ?? [];
  }, [currentMassAddress]);

  const massDateOptions = useMemo(() => {
    const datesMap: Record<string, { value: string; label: string }> = {};
    for (const slot of availableMassSlots) {
      const rawDate = slot.date;
      if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
        const num = Number(rawDate);
        const formatted =
          Number.isFinite(num) && num > 1_000_000_000
            ? new Date(num > 10_000_000_000 ? num : num * 1000).toLocaleDateString('id-ID', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Jakarta',
              })
            : String(rawDate);
        const valStr = String(rawDate);
        if (!datesMap[valStr]) {
          datesMap[valStr] = { value: valStr, label: formatted };
        }
      }
    }
    const result = Object.values(datesMap);
    if (result.length === 0) {
      return [{ value: 'today', label: 'Hari Ini' }];
    }
    return result;
  }, [availableMassSlots]);

  const filteredMassSlots = useMemo(() => {
    if (!massPickupDate || massPickupDate === 'today') return availableMassSlots;
    return availableMassSlots.filter((s) => String(s.date) === massPickupDate);
  }, [availableMassSlots, massPickupDate]);

  const nearestBranch = useMemo(() => {
    const list = activeShippingParams?.dropoff?.branch_list ?? [];
    if (massBranchId !== null) {
      const found = list.find((b) => b.branch_id === massBranchId);
      if (found) return found;
    }
    return list[0] ?? null;
  }, [activeShippingParams, massBranchId]);

  const massDropoffNeedsSenderRealName = Boolean(
    activeShippingParams?.info_needed?.dropoff?.includes('sender_real_name')
  );

  const handleAddressChange = (nextAddressId: number) => {
    setSelectedAddressId(nextAddressId);
    const nextAddr = pickupAddresses.find((a) => a.address_id === nextAddressId);
    setSelectedPickupTimeId(nextAddr?.time_slot_list?.[0]?.pickup_time_id ?? '');
  };

  const handleCopyTracking = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      if (!isMountedRef.current) return;
      setCopiedTracking(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        if (isMountedRef.current) setCopiedTracking(false);
      }, 2000);
    } catch {
      // Clipboard blocked
    }
  };

  async function submitJsonPost<T extends { status?: string }>(
    url: string,
    payload: Record<string, unknown>,
    fallbackError: string,
    networkError: string
  ): Promise<{ data: T; isStale: () => boolean } | null> {
    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;
    const seq = ++submitSeqRef.current;
    const isStale = () => controller.signal.aborted || !isMountedRef.current || seq !== submitSeqRef.current;

    setSubmitting(true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(payload),
      });

      const { data, cleanError } = await parseJsonSafe<T & Record<string, unknown>>(response);
      if (isStale()) return null;

      // Hasil batch pengiriman massal yang memiliki total dan array succeeded/failed
      // dianggap hasil batch valid meskipun beberapa/semua pesanan di dalamnya gagal
      const isMassShipResult =
        data &&
        typeof data === 'object' &&
        'total' in data &&
        (Array.isArray((data as Record<string, unknown>).succeeded) ||
          Array.isArray((data as Record<string, unknown>).failed));

      if (!response.ok || !data || (data.status === 'error' && !isMassShipResult)) {
        setSubmitError(
          extractErrorMessage(data as Record<string, unknown> | null, response.status, fallbackError, cleanError)
        );
        return null;
      }

      return { data, isStale };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      if (!isStale()) {
        setSubmitError(err instanceof Error ? err.message : networkError);
      }
      return null;
    } finally {
      if (submitAbortRef.current === controller) {
        submitAbortRef.current = null;
      }
      if (!isStale()) {
        setSubmitting(false);
      }
    }
  }

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !shippingParams || submitting) return;

    setSubmitError(null);

    const payload: Record<string, unknown> = {
      method: selectedMethod,
    };
    const packageList = Array.isArray(order.package_list_json) ? order.package_list_json : [];
    const isSplitOrder = packageList.length > 1;
    if (isSplitOrder && (shippingParams.package_number || order.package_number)) {
      payload.package_number = shippingParams.package_number || order.package_number;
    }

    if (selectedMethod === 'pickup') {
      if (pickupAddresses.length === 0) {
        setSubmitError(`Alamat penjemputan (Pick-up) belum tersedia di akun ${platformName}. Gunakan Antar ke Counter jika tersedia.`);
        return;
      }
      if (selectedAddressId === null || !selectedAddress) {
        setSubmitError('Silakan pilih alamat penjemputan kurir terlebih dahulu.');
        return;
      }
      payload.address_id = selectedAddressId;

      if (pickupTimeSlots.length > 0 && !selectedPickupTimeId) {
        setSubmitError('Silakan pilih slot waktu penjemputan kurir.');
        return;
      }
      if (selectedPickupTimeId) {
        payload.pickup_time_id = selectedPickupTimeId;
      }
      if (needsPickupTrackingNo && trackingNumber.trim()) {
        payload.tracking_number = trackingNumber.trim();
      }
    } else if (selectedMethod === 'dropoff') {
      if (dropoffBranches.length > 0) {
        if (selectedBranchId !== null) {
          payload.branch_id = selectedBranchId;
        } else if (dropoffInfoNeeded.includes('branch_id')) {
          setSubmitError('Silakan pilih cabang drop-off kurir.');
          return;
        }
      } else if (dropoffInfoNeeded.includes('branch_id')) {
        const parsedBranch = Number(manualBranchId.trim());
        if (!manualBranchId.trim() || !Number.isInteger(parsedBranch) || parsedBranch <= 0) {
          setSubmitError('ID Cabang (branch_id) wajib diisi angka valid.');
          return;
        }
        payload.branch_id = parsedBranch;
      }

      const normalizedSlug = selectedSlug.trim();
      if (needsSlug && normalizedSlug) {
        payload.slug = normalizedSlug;
      } else if (dropoffInfoNeeded.includes('slug') && !normalizedSlug) {
        setSubmitError(
          dropoffSlugs.length > 0
            ? 'Slug drop-off kurir wajib dipilih.'
            : 'Slug drop-off kurir wajib diisi.'
        );
        return;
      }

      if (needsSenderRealName) {
        if (!senderRealName.trim()) {
          setSubmitError('Nama lengkap pengirim wajib diisi sesuai ketentuan kurir.');
          return;
        }
        payload.sender_real_name = senderRealName.trim();
      }

      if (needsDropoffTrackingNo) {
        if (!trackingNumber.trim()) {
          setSubmitError('Nomor resi wajib diisi untuk metode kurir ini.');
          return;
        }
        payload.tracking_number = trackingNumber.trim();
      }
    } else {
      if (needsNonIntegratedTrackingNo && !trackingNumber.trim()) {
        setSubmitError('Nomor resi wajib diisi untuk pengiriman Non-Integrated.');
        return;
      }
      if (trackingNumber.trim()) {
        payload.tracking_number = trackingNumber.trim();
      }
    }

    const result = await submitJsonPost<ShopeeShipResult>(
      `${baseRoute}/${encodeURIComponent(order.order_sn)}/ship`,
      payload,
      'Gagal mengatur pengiriman pesanan',
      'Gagal menghubungi server saat mengatur pengiriman.'
    );
    if (!result || result.isStale()) return;

    singleShippedSnRef.current = result.data.order_sn;
    setSingleResult(result.data);
    onShipped?.(result.data);
    onSuccess?.(result.data);

    // Langsung buka dokumen cetak resi otomatis
    const targetOrder: ShopeeOrderRecord = result.data.order ?? {
      id: order.id,
      shopee_account_id: order.shopee_account_id,
      order_sn: result.data.order_sn,
      package_number: order.package_number,
      order_status: result.data.order_status || 'PROCESSED',
      logistics_status: order.logistics_status,
      shipping_carrier: order.shipping_carrier,
      tracking_number: result.data.tracking_number || order.tracking_number,
      fulfillment_method: result.data.fulfillment_method || selectedMethod,
      buyer_user_id: order.buyer_user_id,
      buyer_username: order.buyer_username,
      buyer_note: order.buyer_note,
      recipient_data: order.recipient_data,
      items_json: order.items_json,
      package_list_json: order.package_list_json,
      payment_method: order.payment_method,
      is_cod: order.is_cod,
      total_amount: order.total_amount,
      estimated_shipping_fee: order.estimated_shipping_fee,
      cancel_by: order.cancel_by,
      cancel_reason: order.cancel_reason,
      buyer_cancel_reason: order.buyer_cancel_reason,
      order_created_at: order.order_created_at,
      ship_by_date: order.ship_by_date,
      shipping_arranged_at: new Date().toISOString(),
      label_document_status: 'READY',
      label_printed_at: order.label_printed_at,
      label_print_count: order.label_print_count,
      last_synced_at: order.last_synced_at,
    };
    onPrintWaybill?.(targetOrder);
  };

  const handleExecuteMassShip = async (method: 'pickup' | 'dropoff') => {
    if (submitting || targetOrdersToShip.length === 0) return;

    setSubmitError(null);
    setMassExecutingMethod(method);

    const payload: Record<string, unknown> = {
      order_sns: targetOrdersToShip.map((o) => o.order_sn),
      preferred_method: method,
    };

    if (method === 'pickup') {
      if (massAddressId !== null) payload.address_id = massAddressId;
      if (massPickupTimeId) payload.pickup_time_id = massPickupTimeId;
    } else if (method === 'dropoff') {
      if (massBranchId !== null) payload.branch_id = massBranchId;
      if (massSenderName.trim()) payload.sender_real_name = massSenderName.trim();
    }

    const result = await submitJsonPost<ShopeeMassShipResult>(
      `${baseRoute}/mass-ship`,
      payload,
      `Gagal mengatur pengiriman massal (${method})`,
      'Gagal menghubungi server saat proses pengiriman massal.'
    );

    setMassExecutingMethod(null);
    if (!result || result.isStale()) return;

    if (result.data.succeeded && result.data.succeeded.length > 0) {
      const succeededMap = new Map(result.data.succeeded.map((s) => [s.order_sn, s]));

      // 1. Kumpulkan pesanan yang baru saja berhasil diatur pengirimannya
      const succeededOrdersToPrint: ShopeeOrderRecord[] = targetOrdersToShip
        .filter((o) => succeededMap.has(o.order_sn))
        .map((o) => {
          const resItem = succeededMap.get(o.order_sn);
          return {
            ...o,
            order_status: resItem?.order_status || 'PROCESSED',
            tracking_number: resItem?.tracking_number || o.tracking_number,
            fulfillment_method: resItem?.fulfillment_method || method,
          };
        });

      // 2. Update orders in pendingMassOrders with their new status and tracking_number
      setPendingMassOrders((prev) =>
        prev.map((o) => {
          const resItem = succeededMap.get(o.order_sn);
          if (!resItem) return o;
          return {
            ...o,
            order_status: resItem.order_status || 'PROCESSED',
            tracking_number: resItem.tracking_number || o.tracking_number,
            fulfillment_method: resItem.fulfillment_method || method,
          };
        })
      );

      // Keep succeeded orders selected
      const succeededSns = result.data.succeeded.map((s) => s.order_sn);
      setSelectedMassSns(succeededSns);

      if (result.data.failed && result.data.failed.length > 0) {
        setMassResult(result.data);
      } else {
        setMassResult(null);
      }

      // 3. AUTO CETAK RESI + TAMPILKAN LOADING DI TENGAH LAYAR
      if (succeededOrdersToPrint.length > 0 && onPrintMassWaybill) {
        setIsPreparingWaybill(true);
        setWaybillLoadingMessage(
          `Pengiriman berhasil diatur! Sedang memuat resi thermal untuk ${succeededOrdersToPrint.length} pesanan... Mohon tunggu sebentar.`
        );
        try {
          await onPrintMassWaybill(succeededOrdersToPrint);
          setPrintedOrderSns((prev) => {
            const next = new Set(prev);
            succeededOrdersToPrint.forEach((o) => next.add(o.order_sn));
            return next;
          });
          setShipSuccessNotice(
            `Pengiriman berhasil diatur dan resi thermal (${succeededOrdersToPrint.length} pesanan) telah dibuka untuk dicetak. Selesai cetak Anda tetap berada di halaman pengiriman massal.`
          );
        } catch (err: any) {
          console.error('Auto print waybill error:', err);
          setSubmitError(err instanceof Error ? err.message : 'Gagal menyiapkan PDF resi thermal otomatis.');
        } finally {
          setIsPreparingWaybill(false);
          setWaybillLoadingMessage(null);
        }
      } else {
        setShipSuccessNotice(
          `Pengiriman ${result.data.succeeded.length} pesanan berhasil diatur! Nomor resi telah terbit.`
        );
      }
    } else {
      setMassResult(result.data);
    }

    onMassShipped?.(result.data);
    onSuccess?.(result.data);
  };

  const handlePrintSelectedOrders = async () => {
    const ordersToPrint = targetOrdersToShip.filter(
      (o) => Boolean(o.tracking_number) || o.order_status === 'PROCESSED'
    );
    if (ordersToPrint.length === 0 || isPreparingWaybill) return;

    setIsPreparingWaybill(true);
    setWaybillLoadingMessage(
      `Sedang memuat dokumen resi thermal untuk ${ordersToPrint.length} pesanan... Mohon tunggu sebentar.`
    );
    setSubmitError(null);
    try {
      await onPrintMassWaybill?.(ordersToPrint);
      setPrintedOrderSns((prev) => {
        const next = new Set(prev);
        ordersToPrint.forEach((o) => next.add(o.order_sn));
        return next;
      });
      setShipSuccessNotice(
        `PDF Resi Thermal (${ordersToPrint.length} pesanan) berhasil disiapkan. Selesai mencetak, Anda tetap berada di halaman pengiriman massal.`
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal menyiapkan PDF resi thermal.');
    } finally {
      setIsPreparingWaybill(false);
      setWaybillLoadingMessage(null);
    }
  };

  const modalTitle =
    mode === 'mass'
      ? `Pengiriman Massal ${platformName}`
      : order
        ? `Atur Pengiriman — ${order.order_sn}`
        : `Atur Pengiriman ${platformName}`;

  const canPrintAfterSingleShip = Boolean(
    singleResult &&
      onPrintWaybill &&
      !isWaybillBlockedStatus(singleResult.order_status, order?.shipping_carrier)
  );

  return (
    <Modal
      show={show}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={modalTitle}
      maxWidth={mode === 'mass' ? '6xl' : 'lg'}
    >
      {mode === 'single' ? (
        !order ? (
          <div className="py-6 text-center text-sm text-slate-500">
            Tidak ada pesanan yang dipilih untuk diatur pengirimannya.
          </div>
        ) : singleResult ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-bold text-emerald-900">Pengiriman Berhasil Diatur</p>
                  <p className="text-xs text-emerald-800">{singleResult.message}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">No. Pesanan</span>
                <span className="font-mono font-semibold text-slate-900">{singleResult.order_sn}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Metode Fulfillment</span>
                <span className="font-semibold text-slate-800">
                  {formatFulfillmentMethod(singleResult.fulfillment_method, '-')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">No. Resi Resmi</span>
                {singleResult.tracking_number ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{singleResult.tracking_number}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyTracking(singleResult.tracking_number ?? '')}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {copiedTracking ? 'Tersalin!' : 'Salin'}
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-500 italic">Dihasilkan oleh kurir / sedang diproses</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {canPrintAfterSingleShip && (
                <button
                  type="button"
                  onClick={() => {
                    const fallbackOrder: ShopeeOrderRecord = {
                      id: order.id,
                      shopee_account_id: order.shopee_account_id,
                      order_sn: singleResult.order_sn,
                      package_number: order.package_number,
                      order_status: singleResult.order_status,
                      logistics_status: order.logistics_status,
                      shipping_carrier: order.shipping_carrier,
                      tracking_number: singleResult.tracking_number ?? order.tracking_number,
                      fulfillment_method: singleResult.fulfillment_method,
                      buyer_user_id: order.buyer_user_id,
                      buyer_username: order.buyer_username,
                      buyer_note: order.buyer_note,
                      recipient_data: order.recipient_data,
                      items_json: order.items_json,
                      package_list_json: order.package_list_json,
                      payment_method: order.payment_method,
                      is_cod: order.is_cod,
                      total_amount: order.total_amount,
                      estimated_shipping_fee: order.estimated_shipping_fee,
                      cancel_by: order.cancel_by,
                      cancel_reason: order.cancel_reason,
                      buyer_cancel_reason: order.buyer_cancel_reason,
                      order_created_at: order.order_created_at,
                      ship_by_date: order.ship_by_date,
                      shipping_arranged_at: new Date().toISOString(),
                      label_document_status: 'READY',
                      label_printed_at: order.label_printed_at,
                      label_print_count: order.label_print_count,
                      last_synced_at: order.last_synced_at,
                    };
                    onPrintWaybill?.(singleResult.order ?? fallbackOrder);
                  }}
                  className="rounded-xl border border-[#EE4D2D] bg-orange-50 px-4 py-2 text-xs font-semibold text-[#EE4D2D] hover:bg-orange-100"
                >
                  Cetak Dokumen Pengiriman (Resi)
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            {loadingParams ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-2">
                <SpinnerIcon className="h-6 w-6 text-[#EE4D2D]" />
                <p className="text-xs text-slate-500">Mengambil opsi pengiriman dari {platformName}...</p>
              </div>
            ) : paramsError ? (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                <div className="flex items-start gap-2.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                    className="h-4 w-4 shrink-0 text-rose-600 mt-0.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-rose-900">Gagal Memuat Parameter Pengiriman</p>
                    <p className="mt-1">{paramsError}</p>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setRetryCounter((c) => c + 1)}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-50"
                  >
                    Coba Lagi
                  </button>
                </div>
              </div>
            ) : shippingParams ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Kurir Pengiriman</span>
                    <span className="font-semibold text-slate-900">{order.shipping_carrier || 'Kurir Standar'}</span>
                  </div>
                  {order.buyer_username && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Pembeli</span>
                      <span className="text-slate-700">@{order.buyer_username}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Pilih Metode Pengiriman
                  </label>
                  {supportedTabs.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      Tidak ada opsi metode pengiriman yang didukung oleh kurir ini melalui API.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {supportedTabs.map((tab) => {
                        const active = selectedMethod === tab.key;
                        return (
                          <label
                            key={tab.key}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition-colors ${
                              active
                                ? 'border-[#EE4D2D] bg-orange-50/50 ring-1 ring-[#EE4D2D]'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="fulfillment_method"
                              checked={active}
                              onChange={() => setSelectedMethod(tab.key)}
                              className="mt-0.5 accent-[#EE4D2D]"
                            />
                            <div>
                              <div className={`font-bold ${active ? 'text-[#EE4D2D]' : 'text-slate-900'}`}>
                                {tab.label}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">{tab.hint}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedMethod === 'pickup' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <span>Alamat Penjemputan Toko</span>
                        {otherAddresses.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowOtherAddresses(!showOtherAddresses)}
                            className="text-xs font-semibold text-[#EE4D2D] hover:underline"
                          >
                            {showOtherAddresses ? 'Selesai' : 'Ganti Alamat'}
                          </button>
                        )}
                      </div>
                      {selectedAddress ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700">
                          <p className="font-semibold text-slate-900">{selectedAddress.address}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {[selectedAddress.district, selectedAddress.city, selectedAddress.state, selectedAddress.zipcode]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-rose-600">Alamat penjemputan belum diatur pada toko ini.</p>
                      )}
                      {showOtherAddresses && otherAddresses.length > 0 && (
                        <select
                          value={selectedAddressId ?? ''}
                          onChange={(e) => handleAddressChange(Number(e.target.value))}
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                        >
                          {pickupAddresses.map((a) => (
                            <option key={a.address_id} value={a.address_id}>
                              {formatPickupAddressLabel(a)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {pickupTimeSlots.length > 0 && (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Slot Waktu Pickup
                        </label>
                        <select
                          value={selectedPickupTimeId}
                          onChange={(e) => setSelectedPickupTimeId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                        >
                          {pickupTimeSlots.map((slot) => (
                            <option key={slot.pickup_time_id} value={slot.pickup_time_id}>
                              {formatPickupSlotLabel(slot)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {selectedMethod === 'dropoff' && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                    {dropoffBranches.length > 0 ? (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Pilih Cabang / Gerai Drop-off
                        </label>
                        <select
                          value={selectedBranchId ?? ''}
                          onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                        >
                          {dropoffBranches.map((b) => (
                            <option key={b.branch_id} value={b.branch_id}>
                              {formatDropoffBranchLabel(b)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-600">
                        Anda dapat menyerahkan paket ke counter atau gerai {order.shipping_carrier || 'kurir'} terdekat dari lokasi Anda.
                      </div>
                    )}

                    {needsSenderRealName && (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Nama Pengirim (Wajib)
                        </label>
                        <input
                          type="text"
                          value={senderRealName}
                          onChange={(e) => setSenderRealName(e.target.value)}
                          placeholder="Nama lengkap pengirim toko"
                          className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                        />
                      </div>
                    )}
                  </div>
                )}

                {submitError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                    {submitError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onClose}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || supportedTabs.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#EE4D2D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d94122] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting && <SpinnerIcon className="h-3.5 w-3.5" />}
                    {submitting ? 'Memproses...' : 'Konfirmasi & Buat No. Resi'}
                  </button>
                </div>
              </>
            ) : null}
          </form>
        )
      ) : (
        /* Mass Ship Configuration View (Shopee Seller Centre Style) */
        <div className="space-y-4">
          {/* Banner Selesai Semua (Tetap berada di halaman pengiriman massal dengan tombol manual) */}
          {isAllMassCompleted && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">Semua Pengiriman Massal Selesai!</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Seluruh {eligibleMassOrders.length} pesanan telah berhasil diatur dan dicetak label thermal resinya.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#0B132B] hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Selesai & Kembali ke Daftar Pesanan
              </button>
            </div>
          )}

          {/* Banner Notifikasi Berhasil Atur / Resi Terbit */}
          {shipSuccessNotice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start justify-between gap-2 text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">✓</span>
                <span>{shipSuccessNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setShipSuccessNotice(null)}
                className="text-emerald-600 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Banner Jika Ada Pesanan yang Gagal Diatur */}
          {massResult && massResult.failed && massResult.failed.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-rose-800 font-bold">
                <span>{massResult.failed.length} pesanan gagal diatur pengirimannya:</span>
                <button
                  type="button"
                  onClick={() => setMassResult(null)}
                  className="text-rose-600 hover:text-rose-900 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {massResult.failed.map((f) => (
                  <div key={f.order_sn} className="text-[11px] text-rose-700 font-mono">
                    <span className="font-bold">{f.order_sn}:</span> {f.message || 'Gagal mengatur pengiriman'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ekspedisi / Jasa Kirim Filter Chips dengan Logika Warna Kontras & Pudar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>Pilih Jasa Kirim / Ekspedisi</span>
              <span className="text-slate-400 font-normal">
                {allMassStats.printed} / {eligibleMassOrders.length} resi selesai dicetak
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {courierKeys.map((courier) => {
                const stats = getCourierStats(courier);
                const isActive = activeCourier === courier;
                return (
                  <button
                    key={courier}
                    type="button"
                    onClick={() => setActiveCourier(courier)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors cursor-pointer ${
                      stats.isAllPrinted
                        ? isActive
                          ? 'border-slate-300 bg-slate-100 text-slate-500 font-medium'
                          : 'border-slate-200 bg-slate-50 text-slate-400 opacity-60 font-normal'
                        : isActive
                          ? 'border-[#EE4D2D] bg-[#FFF5F2] text-[#EE4D2D] font-bold shadow-2xs'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 font-medium'
                    }`}
                  >
                    <span>{courier}</span>
                    {stats.isAllPrinted ? (
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-medium text-slate-500">
                        ✓ Selesai
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
                          isActive
                            ? 'bg-[#EE4D2D] text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {stats.unprinted}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2-Column Layout: Left Order Table & Right Action Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Daftar Paket Pesanan */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>
                  Menampilkan <strong className="text-slate-900">{displayedMassOrders.length}</strong> pesanan
                  {activeCourier ? ` (${activeCourier})` : ''}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  <strong className="text-[#EE4D2D]">{targetOrdersToShip.length}</strong> dipilih
                </span>
              </div>

              {displayedMassOrders.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
                  Tidak ada pesanan siap kirim pada kategori jasa kirim ini.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={isAllVisibleSelected}
                              onChange={toggleSelectAllVisible}
                              className="rounded border-slate-300 text-[#EE4D2D] focus:ring-[#EE4D2D] accent-[#EE4D2D] cursor-pointer"
                              title="Pilih Semua Pesanan di Tampilan Ini"
                            />
                          </th>
                          <th className="py-2.5 px-3">Produk</th>
                          <th className="py-2.5 px-3">No. Pesanan & Pembeli</th>
                          <th className="py-2.5 px-3">Jasa Kirim</th>
                          <th className="py-2.5 px-3">No. Resi</th>
                          <th className="py-2.5 px-3">Batas Kirim</th>
                          <th className="py-2.5 px-3">Status Cetak</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedMassOrders.map((item) => {
                          const isChecked = selectedMassSns.includes(item.order_sn);
                          const firstItem = item.items_json?.[0];
                          const hasTracking = Boolean(item.tracking_number);
                          const isPrinted = isOrderPrinted(item);
                          return (
                            <tr
                              key={item.order_sn}
                              className={`transition-colors hover:bg-slate-50/80 ${
                                isChecked ? 'bg-orange-50/20' : ''
                              } ${isPrinted ? 'opacity-75 bg-slate-50/30' : ''}`}
                            >
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleOrderSelection(item.order_sn)}
                                  className="rounded border-slate-300 text-[#EE4D2D] focus:ring-[#EE4D2D] accent-[#EE4D2D] cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-3 min-w-[170px]">
                                <div className="flex items-center gap-2.5">
                                  {firstItem?.image_url ? (
                                    <img
                                      src={firstItem.image_url}
                                      alt={firstItem.item_name || 'Produk'}
                                      className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200 bg-white"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                      <PackageIcon className="h-5 w-5" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className="truncate font-medium text-slate-900 text-xs"
                                      title={firstItem?.item_name || 'Produk Pesanan'}
                                    >
                                      {firstItem?.item_name || 'Produk Pesanan'}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {firstItem?.model_name ? `Variasi: ${firstItem.model_name}` : ''}
                                      {item.items_json && item.items_json.length > 1
                                        ? ` (+${item.items_json.length - 1} item)`
                                        : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 min-w-[130px]">
                                <div className="font-mono font-bold text-slate-900">{item.order_sn}</div>
                                {item.buyer_username && (
                                  <div className="text-[11px] text-slate-500 truncate">
                                    @{item.buyer_username}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                  {item.shipping_carrier || 'Standar'}
                                </span>
                              </td>
                              {/* Kolom No. Resi */}
                              <td className="py-2.5 px-3 min-w-[130px]">
                                {hasTracking ? (
                                  <div>
                                    <div className="font-mono font-bold text-slate-900 text-xs select-all">
                                      {item.tracking_number}
                                    </div>
                                    <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                                      Resi Siap
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-amber-600 font-medium italic">
                                    Belum Diatur
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-600">
                                <div>{formatOrderDate(item.ship_by_date || item.order_created_at)}</div>
                                <div className="text-[10px] text-amber-600 font-medium">Siap Dikirim</div>
                              </td>
                              {/* Kolom Status Cetak */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {isPrinted ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ Dicetak
                                  </span>
                                ) : hasTracking ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    Belum Cetak
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500">
                                    Perlu Atur
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Buat Dokumen Pengiriman Sidebar (Shopee-Style Cards) */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-3.5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Buat Dokumen Pengiriman</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pilih pesanan untuk mengatur pengiriman dan membuat dokumen label resi thermal.
                  </p>
                </div>

                {/* Box 1: Pilihan Format Dokumen (Ala Shopee) */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={true}
                        readOnly
                        className="rounded border-slate-300 text-[#EE4D2D] focus:ring-[#EE4D2D] accent-[#EE4D2D]"
                      />
                      <span>Label Pengiriman</span>
                    </label>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Format Resmi
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-700">
                    <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-not-allowed">
                      <input type="radio" name="massFormat" disabled className="text-slate-300" />
                      <span>Normal</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-[#EE4D2D]">
                      <input
                        type="radio"
                        name="massFormat"
                        checked={true}
                        readOnly
                        className="text-[#EE4D2D] focus:ring-[#EE4D2D] accent-[#EE4D2D]"
                      />
                      <span>Thermal (100×150 mm)</span>
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    Format resmi Thermal A6 (100×150 mm) khusus printer thermal (Kassen/sejenisnya).
                  </p>
                </div>

                {/* Box 2: Cetak Resi & Simpan (Tampil jika ada pesanan terpilih yang sudah ada No. Resi) */}
                {(() => {
                  const selectedReadyToPrint = targetOrdersToShip.filter(
                    (o) => Boolean(o.tracking_number) || o.order_status === 'PROCESSED'
                  );
                  const selectedUnprinted = selectedReadyToPrint.filter((o) => !isOrderPrinted(o));

                  if (selectedReadyToPrint.length === 0) return null;

                  return (
                    <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3.5 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#EE4D2D] text-white flex items-center justify-center shrink-0">
                            <PrinterIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-900">Rincian Hasil Dokumen</h5>
                            <p className="text-[10px] text-slate-500">Label Pengiriman Thermal</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#EE4D2D] border border-orange-200">
                          {selectedReadyToPrint.length} Pesanan
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500">Ekspedisi:</span>
                          <strong className="text-slate-900">
                            {activeCourier === 'all' ? 'Semua Jasa Kirim' : activeCourier}
                          </strong>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500">Belum Dicetak:</span>
                          <strong className="text-[#EE4D2D]">{selectedUnprinted.length} pesanan</strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isPreparingWaybill || selectedReadyToPrint.length === 0}
                        onClick={handlePrintSelectedOrders}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#EE4D2D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#d94122] disabled:cursor-not-allowed disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
                      >
                        {isPreparingWaybill ? (
                          <>
                            <SpinnerIcon className="h-4 w-4 text-white" />
                            <span>Menyiapkan Resi ({selectedReadyToPrint.length})... Tunggu sebentar</span>
                          </>
                        ) : (
                          <>
                            <PrinterIcon className="h-4 w-4" />
                            <span>Cetak Resi & Simpan ({selectedReadyToPrint.length})</span>
                          </>
                        )}
                      </button>

                      <p className="text-[10px] text-slate-500 text-center leading-normal">
                        Saat klik Cetak Resi & Simpan, resi disiapkan lalu dibuka di preview cetak. Selesai cetak akan kembali ke pengiriman massal.
                      </p>
                    </div>
                  );
                })()}

                {/* Box 3: Atur Pengiriman Massal (Tampil jika ada pesanan terpilih yang belum diatur) */}
                {(() => {
                  const selectedNeedArrange = targetOrdersToShip.filter(
                    (o) => !o.tracking_number && isShippableOrderStatus(o.order_status)
                  );

                  return (
                    <div className="space-y-3.5">
                      {selectedNeedArrange.length > 0 && (
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700 pt-1 border-t border-slate-200">
                          <span>Atur Pengiriman Baru</span>
                          <span className="text-[#EE4D2D] font-mono text-[11px]">
                            {selectedNeedArrange.length} Belum Diatur
                          </span>
                        </div>
                      )}

                      {courierParamsError && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                          {courierParamsError}
                        </div>
                      )}

                      {/* Sub-Box: Pick-up (Jemput Kurir) */}
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                            <TruckIcon className="h-4 w-4 text-[#EE4D2D]" />
                            <span>Pick-up</span>
                            <span className="text-[11px] text-slate-400 font-normal">(Jemput Kurir)</span>
                          </div>
                          {activeShippingParams?.pickup_supported === false ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              Tidak Didukung
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                              Tersedia
                            </span>
                          )}
                        </div>

                        {activeShippingParams?.pickup_supported === false ? (
                          <p className="text-xs text-slate-500 italic">
                            Kurir {activeCourier !== 'all' ? activeCourier : 'ini'} tidak mendukung penjemputan (Pick-up). Silakan gunakan Drop-off di bawah.
                          </p>
                        ) : (
                          <>
                            {/* Alamat Toko */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <span>Alamat Toko</span>
                                {(activeShippingParams?.pickup?.address_list?.length ?? 0) > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowMassAddressPicker(!showMassAddressPicker)}
                                    className="text-xs font-semibold text-[#EE4D2D] hover:underline cursor-pointer"
                                  >
                                    {showMassAddressPicker ? 'Selesai' : 'Ganti'}
                                  </button>
                                )}
                              </div>
                              {currentMassAddress ? (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs text-slate-700 leading-relaxed">
                                  <p className="font-semibold text-slate-900">
                                    {currentMassAddress.address || 'Alamat Toko Utama'}
                                  </p>
                                  <p className="text-[11px] text-slate-600 mt-0.5">
                                    {[
                                      currentMassAddress.district,
                                      currentMassAddress.city,
                                      currentMassAddress.state,
                                      currentMassAddress.zipcode,
                                    ]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">Memuat alamat toko utama...</p>
                              )}
                              {showMassAddressPicker && (
                                <select
                                  value={massAddressId ?? ''}
                                  onChange={(e) => setMassAddressId(Number(e.target.value))}
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                                >
                                  {(activeShippingParams?.pickup?.address_list ?? []).map((addr) => (
                                    <option key={addr.address_id} value={addr.address_id}>
                                      {formatPickupAddressLabel(addr)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {/* Tanggal & Waktu Slot */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Tanggal
                                </label>
                                <select
                                  value={massPickupDate}
                                  onChange={(e) => {
                                    setMassPickupDate(e.target.value);
                                    const matchedSlot = availableMassSlots.find(
                                      (s) => String(s.date) === e.target.value
                                    );
                                    if (matchedSlot) setMassPickupTimeId(matchedSlot.pickup_time_id);
                                  }}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                                >
                                  {massDateOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Waktu Slot
                                </label>
                                <select
                                  value={massPickupTimeId}
                                  onChange={(e) => setMassPickupTimeId(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                                >
                                  {filteredMassSlots.length > 0 ? (
                                    filteredMassSlots.map((slot) => (
                                      <option key={slot.pickup_time_id} value={slot.pickup_time_id}>
                                        {formatPickupSlotLabel(slot, false)}
                                      </option>
                                    ))
                                  ) : (
                                    <option value="">Slot Terdekat</option>
                                  )}
                                </select>
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-500 leading-normal">
                              Jam Pickup oleh Kurir digunakan Kurir agar mengetahui waktu yang tersedia untuk mengambil pesananmu.
                            </p>

                            <button
                              type="button"
                              disabled={submitting || targetOrdersToShip.length === 0}
                              onClick={() => handleExecuteMassShip('pickup')}
                              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#EE4D2D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#d94122] disabled:cursor-not-allowed disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
                            >
                              {submitting && massExecutingMethod === 'pickup' ? (
                                <>
                                  <SpinnerIcon className="h-4 w-4" />
                                  <span>Memproses Pickup...</span>
                                </>
                              ) : (
                                <span>Atur Pickup Massal ({targetOrdersToShip.length})</span>
                              )}
                            </button>
                          </>
                        )}
                      </div>

                      {/* Sub-Box: Drop off (Antar ke Counter) */}
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                            <StoreIcon className="h-4 w-4 text-[#EE4D2D]" />
                            <span>Drop off</span>
                            <span className="text-[11px] text-slate-400 font-normal">(Antar ke Counter)</span>
                          </div>
                          {activeShippingParams?.dropoff_supported === false ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              Tidak Didukung
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                              Tersedia
                            </span>
                          )}
                        </div>

                        {activeShippingParams?.dropoff_supported === false ? (
                          <p className="text-xs text-slate-500 italic">
                            Kurir {activeCourier !== 'all' ? activeCourier : 'ini'} tidak mendukung antar counter (Drop-off). Silakan gunakan Pick-up di atas.
                          </p>
                        ) : (
                          <>
                            {/* Cabang Terdekat / Info Counter */}
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                Cabang Terdekat / Gerai Counter
                              </label>
                              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs text-slate-700 leading-relaxed">
                                {nearestBranch ? (
                                  <>
                                    <p className="font-semibold text-slate-900">{nearestBranch.branch_name}</p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      {[nearestBranch.address, nearestBranch.district, nearestBranch.city]
                                        .filter(Boolean)
                                        .join(', ')}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-slate-600">
                                    Serahkan paket ke gerai atau counter kurir{' '}
                                    <strong>{activeCourier !== 'all' ? activeCourier : 'terpilih'}</strong> terdekat.
                                  </p>
                                )}
                              </div>
                            </div>

                            {massDropoffNeedsSenderRealName && (
                              <div className="space-y-1">
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Nama Pengirim (Wajib untuk kurir ini)
                                </label>
                                <input
                                  type="text"
                                  maxLength={120}
                                  value={massSenderName}
                                  onChange={(e) => setMassSenderName(e.target.value)}
                                  placeholder="Nama pengirim toko"
                                  className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#EE4D2D] focus:ring-1 focus:ring-[#EE4D2D]"
                                />
                              </div>
                            )}

                            <p className="text-[11px] text-slate-500 leading-normal">
                              Bawa paket yang sudah ditempel label pengiriman (resi) ke counter atau gerai kurir terdekat dari lokasi Anda.
                            </p>

                            <button
                              type="button"
                              disabled={submitting || targetOrdersToShip.length === 0}
                              onClick={() => handleExecuteMassShip('dropoff')}
                              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#EE4D2D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#d94122] disabled:cursor-not-allowed disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
                            >
                              {submitting && massExecutingMethod === 'dropoff' ? (
                                <>
                                  <SpinnerIcon className="h-4 w-4" />
                                  <span>Memproses Drop-off...</span>
                                </>
                              ) : (
                                <span>Atur Antar ke Counter Massal ({targetOrdersToShip.length})</span>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {submitError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
                    {submitError}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Bar Pengiriman Massal: Selalu Berada di Pengiriman Massal */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs">
            <div className="text-slate-500">
              Selesai Dicetak:{' '}
              <strong className="text-slate-900 tabular-nums">
                {allMassStats.printed}
              </strong>{' '}
              dari <span className="tabular-nums font-semibold">{eligibleMassOrders.length}</span> pesanan
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Tutup & Kembali ke Pesanan
            </button>
          </div>
        </div>
      )}

      {/* Overlay Loading di Tengah Layar saat Tunggu Cetak Resi */}
      {isPreparingWaybill && (
        <div className="fixed inset-0 z-[10001] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 max-w-sm w-full text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 text-[#EE4D2D] mx-auto flex items-center justify-center">
              <SpinnerIcon className="h-7 w-7 text-[#EE4D2D]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Menyiapkan Cetak Resi Thermal
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {waybillLoadingMessage || 'Sedang menyiapkan dokumen label resi thermal, mohon tunggu sebentar...'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 text-[11px] text-slate-600 font-medium">
              Pratinjau cetak akan terbuka otomatis. Selesai mencetak Anda tetap berada di halaman pengiriman massal.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
