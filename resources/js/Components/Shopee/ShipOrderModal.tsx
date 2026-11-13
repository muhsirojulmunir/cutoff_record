import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  order?: ShopeeOrderRecord | null;
  orders?: ShopeeOrderRecord[];
  onClose: () => void;
  onShipped?: (result: ShopeeShipResult) => void;
  onMassShipped?: (result: ShopeeMassShipResult) => void;
  onSuccess?: (result: ShopeeShipResult | ShopeeMassShipResult) => void;
  onPrintWaybill?: (order: ShopeeOrderRecord) => void;
}

type MassPreferredMethod = 'auto' | 'pickup' | 'dropoff';

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: Record<string, unknown> | null, status: number, fallback: string): string {
  if (payload) {
    if (payload.errors && typeof payload.errors === 'object') {
      const firstFieldErrors = Object.values(payload.errors as Record<string, unknown>)[0];
      if (Array.isArray(firstFieldErrors) && typeof firstFieldErrors[0] === 'string' && firstFieldErrors[0].trim()) {
        return firstFieldErrors[0];
      }
    }
    if (typeof payload.message === 'string' && payload.message.trim() !== '') {
      return payload.message;
    }
  }
  return `${fallback} (HTTP ${status})`;
}

function formatPickupAddressLabel(addr: ShopeePickupAddress): string {
  const parts = [addr.address, addr.district, addr.city, addr.state, addr.zipcode]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Alamat Penjemputan Toko';
}

function formatPickupSlotLabel(slot: ShopeePickupTimeSlot): string {
  const timeText = typeof slot.time_text === 'string' ? slot.time_text.trim() : '';
  let dateLabel = '';
  if (slot.date !== undefined && slot.date !== null && slot.date !== '') {
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
  return timeText || dateLabel || `Slot ${slot.pickup_time_id}`;
}

function formatDropoffBranchLabel(branch: ShopeeDropoffBranch): string {
  const title = branch.branch_name?.trim() || `Cabang #${branch.branch_id}`;
  const loc = [branch.address, branch.district, branch.city]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(', ');
  return loc ? `${title} — ${loc}` : title;
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

export default function ShipOrderModal({
  show,
  mode,
  order = null,
  orders = [],
  onClose,
  onShipped,
  onMassShipped,
  onSuccess,
  onPrintWaybill,
}: ShipOrderModalProps) {
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

  // Mass-mode state
  const [massMethod, setMassMethod] = useState<MassPreferredMethod>('auto');
  const [massSenderName, setMassSenderName] = useState<string>('');
  const [massResult, setMassResult] = useState<ShopeeMassShipResult | null>(null);

  // Shared submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  submittingRef.current = submitting;

  // Reference-counted scroll lock + LIFO topmost-only Escape handler
  useOverlayScrollLockAndEscape(show, onClose, {
    canClose: () => !submittingRef.current,
  });

  // Reset modal state and abort/invalidate any in-flight submission on close or target switch
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
    setMassMethod('auto');
    setMassSenderName('');
    setShowOtherAddresses(false);
  }, [show, mode, order?.order_sn]);

  // Fetch single-order shipping parameters with AbortController stale guard
  useEffect(() => {
    if (!show || mode !== 'single' || !order?.order_sn) {
      setShippingParams(null);
      setLoadingParams(false);
      return;
    }

    // Do not refetch shipping parameters after single-ship succeeded for the same open session
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

    fetch(`/shopee-orders/${encodeURIComponent(orderSn)}/shipping-parameters${pkgQuery}`, {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then(async (res) => {
        const data = await parseJsonSafe<ShopeeShippingParameterResponse & Record<string, unknown>>(res);
        if (!res.ok || !data || data.status === 'error') {
          throw new Error(
            extractErrorMessage(
              data as Record<string, unknown> | null,
              res.status,
              'Gagal memuat parameter pengiriman dari Shopee'
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
  }, [show, mode, order?.order_sn, order?.package_number, retryCounter]);

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

  // Mass mode: pisahkan pesanan berstatus valid vs batas API Shopee Open Platform v2 (maks 50 per batch)
  const eligibleMassOrders = useMemo(
    () => orders.filter((o) => isShippableOrderStatus(o.order_status)),
    [orders]
  );
  const targetMassOrders = useMemo(
    () => eligibleMassOrders.slice(0, 50),
    [eligibleMassOrders]
  );
  const ineligibleMassCount = orders.length - eligibleMassOrders.length;
  const truncatedMassCount = Math.max(0, eligibleMassOrders.length - 50);

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
      // Clipboard API blocked
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

      const data = await parseJsonSafe<T & Record<string, unknown>>(response);
      if (isStale()) return null;

      if (!response.ok || !data || data.status === 'error') {
        setSubmitError(
          extractErrorMessage(data as Record<string, unknown> | null, response.status, fallbackError)
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
        setSubmitError('Alamat penjemputan (Pick-up) belum tersedia di akun Shopee. Gunakan Antar ke Counter jika tersedia.');
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
      if (needsPickupTrackingNo) {
        if (!trackingNumber.trim()) {
          setSubmitError('Nomor resi wajib diisi untuk metode kurir ini.');
          return;
        }
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
      `/shopee-orders/${encodeURIComponent(order.order_sn)}/ship`,
      payload,
      'Gagal mengatur pengiriman pesanan',
      'Gagal menghubungi server saat mengatur pengiriman.'
    );
    if (!result || result.isStale()) return;

    singleShippedSnRef.current = result.data.order_sn;
    setSingleResult(result.data);
    onShipped?.(result.data);
    onSuccess?.(result.data);
  };

  const handleMassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || targetMassOrders.length === 0) return;

    setSubmitError(null);

    const payload: Record<string, unknown> = {
      order_sns: targetMassOrders.map((o) => o.order_sn),
      preferred_method: massMethod,
    };
    if (massMethod === 'dropoff' && massSenderName.trim()) {
      payload.sender_real_name = massSenderName.trim();
    }

    const result = await submitJsonPost<ShopeeMassShipResult>(
      '/shopee-orders/mass-ship',
      payload,
      'Gagal menjalankan atur pengiriman massal',
      'Gagal menghubungi server saat proses pengiriman massal.'
    );
    if (!result || result.isStale()) return;

    setMassResult(result.data);
    onMassShipped?.(result.data);
    onSuccess?.(result.data);
  };

  const modalTitle =
    mode === 'mass'
      ? `Atur Pengiriman Massal (${targetMassOrders.length} Pesanan)`
      : order
        ? `Atur Pengiriman — ${order.order_sn}`
        : 'Atur Pengiriman Shopee';

  const canPrintAfterSingleShip = Boolean(
    singleResult &&
      onPrintWaybill &&
      !isWaybillBlockedStatus(singleResult.order_status)
  );

  return (
    <Modal
      show={show}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={modalTitle}
      maxWidth="lg"
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
                      onClick={() => handleCopyTracking(singleResult.tracking_number!)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {copiedTracking ? 'Disalin' : 'Salin'}
                    </button>
                  </div>
                ) : (
                  <span className="font-medium text-amber-700">Sedang diproses kurir</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
              {canPrintAfterSingleShip && (
                <button
                  type="button"
                  onClick={() => {
                    const target = singleResult.order ?? order;
                    onClose();
                    onPrintWaybill?.(target);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                    />
                  </svg>
                  Cetak Resi Sekarang
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            {/* Ringkasan pesanan target */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{order.order_sn}</span>
                    {order.package_number && (
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                        {order.package_number}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600">
                    Pembeli: <span className="font-semibold text-slate-800">{order.buyer_username ? `@${order.buyer_username}` : '-'}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-800">
                    {order.shipping_carrier || 'Kurir Shopee'}
                  </span>
                </div>
              </div>
            </div>

            {loadingParams ? (
              <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white py-10 text-center">
                <SpinnerIcon className="h-6 w-6 text-[#EE4D2D]" />
                <p className="text-xs font-medium text-slate-600">
                  Mengambil parameter alamat & jadwal kurir dari Shopee API...
                </p>
              </div>
            ) : paramsError ? (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-start gap-2.5 text-xs text-rose-800">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                    className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <span>{paramsError}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetryCounter((c) => c + 1)}
                    className="rounded-xl bg-[#0B132B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Coba Muat Ulang
                  </button>
                </div>
              </div>
            ) : shippingParams ? (
              <>
                {supportedTabs.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    Shopee tidak mengembalikan metode pengiriman (Pick-up / Drop-off / Non-Integrated) untuk pesanan ini.
                  </div>
                ) : (
                  <>
                    {/* Tab Seller Center */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {supportedTabs.map((tab) => {
                        const active = selectedMethod === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                              setSelectedMethod(tab.key);
                              setSubmitError(null);
                            }}
                            className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                              active
                                ? 'border-[#EE4D2D] bg-orange-50/60 ring-1 ring-[#EE4D2D]'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-bold ${active ? 'text-[#EE4D2D]' : 'text-slate-900'}`}>
                                {tab.label}
                              </span>
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  active ? 'bg-[#EE4D2D]' : 'border border-slate-300 bg-white'
                                }`}
                              />
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">{tab.hint}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Konten metode Pick-up */}
                    {selectedMethod === 'pickup' && (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        {pickupAddresses.length === 0 ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            Alamat penjemputan belum diatur pada akun Seller Centre Shopee Anda.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Alamat Penjemputan
                                </label>
                                {otherAddresses.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowOtherAddresses((v) => !v)}
                                    className="cursor-pointer text-[11px] font-semibold text-[#EE4D2D] hover:underline"
                                  >
                                    {showOtherAddresses
                                      ? 'Tampilkan Alamat Utama Saja'
                                      : `Pilih alamat lain (${otherAddresses.length})`}
                                  </button>
                                )}
                              </div>

                              {!showOtherAddresses && selectedAddress ? (
                                <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-3 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                      </svg>
                                      Alamat Utama
                                    </span>
                                    {selectedAddress.address_id !== defaultAddress?.address_id && (
                                      <span className="text-[10px] font-semibold text-slate-500">(Alamat Pilihan)</span>
                                    )}
                                  </div>
                                  <p className="mt-1 font-medium leading-relaxed text-slate-800">
                                    {formatPickupAddressLabel(selectedAddress)}
                                  </p>
                                </div>
                              ) : (
                                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                                  {pickupAddresses.map((addr) => {
                                    const isSelected = addr.address_id === selectedAddressId;
                                    const flags = Array.isArray(addr.address_flag) ? addr.address_flag : [];
                                    const isDefault =
                                      flags.includes('default_address') || Boolean(addr.default) || Boolean(addr.is_default);
                                    return (
                                      <label
                                        key={addr.address_id}
                                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-colors ${
                                          isSelected
                                            ? 'border-[#EE4D2D] bg-orange-50/40'
                                            : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name="shopee_pickup_address"
                                          checked={isSelected}
                                          onChange={() => handleAddressChange(addr.address_id)}
                                          className="mt-0.5 accent-[#EE4D2D]"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            {isDefault ? (
                                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                                Alamat Utama
                                              </span>
                                            ) : (
                                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                                Alamat Alternatif
                                              </span>
                                            )}
                                          </div>
                                          <p className="mt-0.5 text-slate-800">{formatPickupAddressLabel(addr)}</p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label
                                htmlFor="shopee-pickup-slot"
                                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                              >
                                Slot Waktu Penjemputan
                              </label>
                              {pickupTimeSlots.length > 0 ? (
                                <select
                                  id="shopee-pickup-slot"
                                  value={selectedPickupTimeId}
                                  onChange={(e) => setSelectedPickupTimeId(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 tabular-nums focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                                >
                                  {pickupTimeSlots.map((slot) => (
                                    <option key={slot.pickup_time_id} value={slot.pickup_time_id}>
                                      {formatPickupSlotLabel(slot)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  Kurir akan menjemput pada jadwal otomatis terdekat (tanpa pilihan slot manual).
                                </p>
                              )}
                            </div>

                            {needsPickupTrackingNo && (
                              <div className="space-y-1.5">
                                <label
                                  htmlFor="shopee-pickup-tracking"
                                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                                >
                                  Nomor Resi
                                </label>
                                <input
                                  id="shopee-pickup-tracking"
                                  type="text"
                                  value={trackingNumber}
                                  onChange={(e) => setTrackingNumber(e.target.value)}
                                  placeholder="Masukkan nomor resi kurir"
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Konten metode Drop-off */}
                    {selectedMethod === 'dropoff' && (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        {needsBranchId && (
                          <div className="space-y-1.5">
                            <label
                              htmlFor="shopee-dropoff-branch"
                              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                            >
                              Cabang / Counter Drop-off
                            </label>
                            {dropoffBranches.length > 0 ? (
                              <select
                                id="shopee-dropoff-branch"
                                value={selectedBranchId ?? ''}
                                onChange={(e) =>
                                  setSelectedBranchId(e.target.value ? Number(e.target.value) : null)
                                }
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                              >
                                {!dropoffInfoNeeded.includes('branch_id') && (
                                  <option value="">-- Otomatis / Counter Terdekat --</option>
                                )}
                                {dropoffBranches.map((branch) => (
                                  <option key={branch.branch_id} value={branch.branch_id}>
                                    {formatDropoffBranchLabel(branch)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id="shopee-dropoff-branch"
                                type="number"
                                min={1}
                                value={manualBranchId}
                                onChange={(e) => setManualBranchId(e.target.value)}
                                placeholder="Masukkan ID Cabang (branch_id)"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                              />
                            )}
                          </div>
                        )}

                        {needsSlug && (
                          <div className="space-y-1.5">
                            <label
                              htmlFor="shopee-dropoff-slug"
                              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                            >
                              Layanan Counter (Slug)
                            </label>
                            {dropoffSlugs.length > 0 ? (
                              <select
                                id="shopee-dropoff-slug"
                                value={selectedSlug}
                                onChange={(e) => setSelectedSlug(e.target.value)}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                              >
                                {dropoffSlugs.map((s) => (
                                  <option key={s.slug} value={s.slug}>
                                    {s.slug_name || s.slug}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id="shopee-dropoff-slug"
                                type="text"
                                value={selectedSlug}
                                onChange={(e) => setSelectedSlug(e.target.value)}
                                placeholder="Masukkan slug counter kurir (mis. jne_reg)"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                              />
                            )}
                          </div>
                        )}

                        {needsSenderRealName && (
                          <div className="space-y-1.5">
                            <label
                              htmlFor="shopee-sender-name"
                              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                            >
                              Nama Asli Pengirim
                            </label>
                            <input
                              id="shopee-sender-name"
                              type="text"
                              maxLength={120}
                              value={senderRealName}
                              onChange={(e) => setSenderRealName(e.target.value)}
                              placeholder="Nama pengirim di gerai kurir"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                            />
                          </div>
                        )}

                        {needsDropoffTrackingNo && (
                          <div className="space-y-1.5">
                            <label
                              htmlFor="shopee-dropoff-tracking"
                              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                            >
                              Nomor Resi
                            </label>
                            <input
                              id="shopee-dropoff-tracking"
                              type="text"
                              maxLength={100}
                              value={trackingNumber}
                              onChange={(e) => setTrackingNumber(e.target.value)}
                              placeholder="Masukkan nomor resi kurir"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                            />
                          </div>
                        )}

                        {!needsBranchId && !needsSlug && !needsSenderRealName && !needsDropoffTrackingNo && (
                          <p className="text-xs leading-relaxed text-slate-600">
                            Serahkan paket ke counter kurir terdekat setelah nomor resi terbit. Tidak ada parameter tambahan yang diminta oleh kurir ini.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Konten metode Non-Integrated */}
                    {selectedMethod === 'non_integrated' && (
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                        <label
                          htmlFor="shopee-nonint-tracking"
                          className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                        >
                          Nomor Resi Pengiriman {needsNonIntegratedTrackingNo ? '(Wajib)' : '(Opsional)'}
                        </label>
                        <input
                          id="shopee-nonint-tracking"
                          type="text"
                          maxLength={100}
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          placeholder="Masukkan nomor resi kurir non-integrated"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
                        />
                      </div>
                    )}
                  </>
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
      ) : massResult ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total</p>
              <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{massResult.total}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Berhasil</p>
              <p className="mt-1 text-lg font-bold text-emerald-800 tabular-nums">{massResult.succeeded.length}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Gagal</p>
              <p className="mt-1 text-lg font-bold text-rose-800 tabular-nums">{massResult.failed.length}</p>
            </div>
          </div>

          <p className="text-xs font-medium text-slate-700">{massResult.message}</p>

          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {massResult.succeeded.map((item) => (
              <div
                key={`ok-${item.order_sn}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono font-bold text-slate-900">{item.order_sn}</span>
                  <span className="ml-2 text-[11px] text-emerald-700">
                    {formatFulfillmentMethod(item.fulfillment_method, '-')}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-emerald-800">
                  {item.tracking_number || 'Resi diproses'}
                </span>
              </div>
            ))}
            {massResult.failed.map((item) => (
              <div
                key={`fail-${item.order_sn}`}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs"
              >
                <div className="font-mono font-bold text-rose-900">{item.order_sn}</div>
                <div className="mt-0.5 text-[11px] text-rose-700">{item.message}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-1">
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
        <form onSubmit={handleMassSubmit} className="space-y-4">
          {(ineligibleMassCount > 0 || truncatedMassCount > 0) && (
            <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              {ineligibleMassCount > 0 && (
                <p>
                  <span className="font-semibold tabular-nums">{ineligibleMassCount}</span> pesanan dilewati
                  karena statusnya bukan Belum Diproses / Atur Ulang.
                </p>
              )}
              {truncatedMassCount > 0 && (
                <p>
                  Shopee membatasi maksimal 50 pesanan per batch.{' '}
                  <span className="font-semibold tabular-nums">{truncatedMassCount}</span> pesanan valid
                  lainnya tidak disertakan dalam batch ini.
                </p>
              )}
            </div>
          )}

          {/* Pilihan preferensi metode massal */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Preferensi Metode Pengiriman Massal
            </label>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  key: 'auto' as MassPreferredMethod,
                  title: 'Otomatis / Pick-up Slot Terdekat',
                  desc: 'Prioritaskan Pick-up dengan alamat utama & slot terdekat; otomatis pakai Drop-off bila kurir tidak mendukung Pick-up.',
                },
                {
                  key: 'pickup' as MassPreferredMethod,
                  title: 'Pick-up (Jemput Kurir)',
                  desc: 'Paksa penjemputan kurir ke alamat utama toko untuk seluruh pesanan terpilih.',
                },
                {
                  key: 'dropoff' as MassPreferredMethod,
                  title: 'Antar ke Counter (Drop-off)',
                  desc: 'Paksa serahkan paket ke gerai/cabang kurir terdekat.',
                },
              ].map((opt) => {
                const active = massMethod === opt.key;
                return (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition-colors ${
                      active
                        ? 'border-[#EE4D2D] bg-orange-50/50 ring-1 ring-[#EE4D2D]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="shopee_mass_method"
                      checked={active}
                      onChange={() => setMassMethod(opt.key)}
                      className="mt-0.5 accent-[#EE4D2D]"
                    />
                    <div>
                      <div className={`font-bold ${active ? 'text-[#EE4D2D]' : 'text-slate-900'}`}>
                        {opt.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{opt.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {massMethod === 'dropoff' && (
            <div className="space-y-1.5">
              <label
                htmlFor="shopee-mass-sender"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
              >
                Nama Pengirim (Opsional, bila diminta kurir Drop-off)
              </label>
              <input
                id="shopee-mass-sender"
                type="text"
                maxLength={120}
                value={massSenderName}
                onChange={(e) => setMassSenderName(e.target.value)}
                placeholder="Kosongkan jika tidak diperlukan"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#EE4D2D] focus:outline-none focus:ring-1 focus:ring-[#EE4D2D]"
              />
            </div>
          )}

          {/* Daftar ringkas order terpilih */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>Pesanan Akan Diproses</span>
              <span className="tabular-nums">{targetMassOrders.length} pesanan</span>
            </div>
            {targetMassOrders.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                Tidak ada pesanan berstatus Perlu Dikirim (Belum Diproses) yang valid untuk diproses.
              </div>
            ) : (
              <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60">
                {targetMassOrders.map((item) => (
                  <div key={item.order_sn} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900">{item.order_sn}</span>
                      {item.buyer_username && (
                        <span className="ml-2 text-slate-500">@{item.buyer_username}</span>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-slate-600">
                      {item.shipping_carrier || 'Kurir'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
              disabled={submitting || targetMassOrders.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#EE4D2D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d94122] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <SpinnerIcon className="h-3.5 w-3.5" />}
              {submitting ? 'Memproses Batch...' : `Proses ${targetMassOrders.length} Pengiriman`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
