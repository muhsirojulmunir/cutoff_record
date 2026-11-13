import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ShopeeEscrowDetailResponse,
  ShopeeOrderItem,
  ShopeeOrderRecord,
  ShopeeTrackingEvent,
  ShopeeTrackingInfoResponse,
} from '../../Types/shopeeOrder';
import {
  ACTIVE_DEADLINE_STATUSES,
  SpinnerIcon,
  formatCurrencyIDR,
  formatFulfillmentMethod,
  formatOrderTimestampWIB,
  getCourierAcceptanceMeta,
  getOrderStatusMeta,
  isShippableOrderStatus,
  isWaybillBlockedStatus,
  normalizeOrderStatus,
  parseWibDate,
  useOverlayScrollLockAndEscape,
} from './overlayHelpers';

export interface OrderDetailDrawerProps {
  order: ShopeeOrderRecord | null;
  onClose: () => void;
  onOpenShip: (order: ShopeeOrderRecord) => void;
  onPrintWaybill: (order: ShopeeOrderRecord) => void;
  onRefresh: (order: ShopeeOrderRecord) => void | Promise<void>;
  onHandleCancel: (order: ShopeeOrderRecord, operation: 'ACCEPT' | 'REJECT') => void | Promise<void>;
  onOrderUpdated?: (order: ShopeeOrderRecord) => void;
  autoLoadTracking?: boolean;
  isRefreshing?: boolean;
  isPrinting?: boolean;
  isCancelling?: boolean;
}

function isInstantCarrier(carrier: string | null | undefined): boolean {
  if (!carrier) return false;
  return /instan|instant|same\s*day|sameday/i.test(carrier);
}

function resolveItemQty(item: ShopeeOrderItem): number {
  const raw = item.model_quantity_purchased ?? (item as Record<string, unknown>).qty ?? 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

function resolveItemDiscountedPrice(item: ShopeeOrderItem): number {
  const raw =
    item.model_discounted_price ??
    (item as Record<string, unknown>).discounted_price ??
    item.model_original_price ??
    (item as Record<string, unknown>).original_price ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function resolveItemOriginalPrice(item: ShopeeOrderItem): number {
  const raw = item.model_original_price ?? (item as Record<string, unknown>).original_price ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatShopeeCurrency(value: number | string | null | undefined, showMinus = false): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? Math.round(num) : 0;
  if (safe === 0) return 'Rp0';
  if (safe < 0) return `-Rp${Math.abs(safe).toLocaleString('id-ID')}`;
  if (showMinus) return `-Rp${safe.toLocaleString('id-ID')}`;
  return `Rp${safe.toLocaleString('id-ID')}`;
}

function formatPlainNumber(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? Math.round(num) : 0;
  return safe.toLocaleString('id-ID');
}

export default function OrderDetailDrawer({
  order,
  onClose,
  onOpenShip,
  onPrintWaybill,
  onRefresh,
  onHandleCancel,
  onOrderUpdated,
  autoLoadTracking = false,
  isRefreshing = false,
  isPrinting = false,
  isCancelling = false,
}: OrderDetailDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [copiedField, setCopiedField] = useState<'order_sn' | 'tracking_number' | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [trackingEvents, setTrackingEvents] = useState<ShopeeTrackingEvent[] | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<string | null>(null);
  const [isLoadingTracking, setIsLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [escrowDetail, setEscrowDetail] = useState<ShopeeEscrowDetailResponse | null>(null);
  const [isLoadingEscrow, setIsLoadingEscrow] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    subtotal: false,
    shipping: false,
    voucher: false,
    platform: false,
    freeShippingXtra: false,
    serviceFee: false,
    otherFee: false,
    tax: false,
  });
  const copyTimerRef = useRef<number | null>(null);
  const isOpen = Boolean(order);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const loadEscrowDetail = async (targetSn: string) => {
    setIsLoadingEscrow(true);

    try {
      const res = await fetch(`/shopee-orders/${encodeURIComponent(targetSn)}/escrow-detail`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const payload = (await res.json().catch(() => null)) as ShopeeEscrowDetailResponse | null;
      if (res.ok && payload && payload.status === 'success') {
        setEscrowDetail(payload);
      }
    } catch {
      // Fallback calculator will handle offline or API delays
    } finally {
      setIsLoadingEscrow(false);
    }
  };

  const loadTrackingInfo = async (targetSn: string) => {
    setIsLoadingTracking(true);
    setTrackingError(null);

    try {
      const res = await fetch(`/shopee-orders/${encodeURIComponent(targetSn)}/tracking-info`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const payload = (await res.json().catch(() => null)) as ShopeeTrackingInfoResponse | null;
      if (!res.ok || !payload || payload.status === 'error') {
        setTrackingError(payload?.message || `Gagal memuat tracking ekspedisi (HTTP ${res.status}).`);
        return;
      }

      setTrackingEvents(Array.isArray(payload.tracking_info) ? payload.tracking_info : []);
      setTrackingStatus(payload.logistics_status ?? null);
      if (payload.order && onOrderUpdated) {
        onOrderUpdated(payload.order);
      }
    } catch (err: unknown) {
      setTrackingError(
        err instanceof Error ? err.message : 'Terjadi kendala jaringan saat melacak ekspedisi.'
      );
    } finally {
      setIsLoadingTracking(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    setCopiedField(null);
    setFailedImages({});
    setTrackingEvents(null);
    setTrackingStatus(null);
    setTrackingError(null);
    setEscrowDetail(null);
    setExpandedSections({
      subtotal: false,
      shipping: false,
      voucher: false,
      platform: false,
      freeShippingXtra: false,
      serviceFee: false,
      otherFee: false,
      tax: false,
    });

    if (order?.order_sn) {
      void loadEscrowDetail(order.order_sn);
    }

    if (order?.order_sn && autoLoadTracking) {
      void loadTrackingInfo(order.order_sn);
    }
  }, [order?.order_sn, autoLoadTracking]);

  useOverlayScrollLockAndEscape(isOpen, onClose);

  if (!order || !mounted) return null;

  const handleCopy = async (field: 'order_sn' | 'tracking_number', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedField(null);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const normalizedStatus = normalizeOrderStatus(order.order_status);
  const statusMeta = getOrderStatusMeta(normalizedStatus);
  const items = Array.isArray(order.items_json) ? order.items_json : [];
  const recipient = order.recipient_data;
  const fallbackAddressParts = [
    recipient?.district,
    recipient?.city,
    recipient?.state,
    recipient?.region,
    recipient?.zipcode,
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  const displayAddress = recipient?.full_address?.trim() || fallbackAddressParts.join(', ') || '-';

  const shipByParsed = parseWibDate(order.ship_by_date);
  const deadlineMs = shipByParsed ? shipByParsed.getTime() - Date.now() : null;
  const showDeadlineAlert =
    ACTIVE_DEADLINE_STATUSES.has(normalizedStatus) &&
    deadlineMs !== null &&
    deadlineMs <= 6 * 60 * 60 * 1000;
  const isOverdue = showDeadlineAlert && deadlineMs !== null && deadlineMs < 0;

  const canShip = isShippableOrderStatus(normalizedStatus);
  const canPrintWaybill = !isWaybillBlockedStatus(normalizedStatus);
  const isInCancel = normalizedStatus === 'IN_CANCEL';
  const hasCancellationBox = Boolean(
    order.buyer_cancel_reason ||
      order.cancel_reason ||
      order.cancel_by ||
      normalizedStatus === 'IN_CANCEL' ||
      normalizedStatus === 'CANCELLED'
  );

  const timelineItems = [
    {
      label: 'Order Dibuat',
      value: formatOrderTimestampWIB(order.order_created_at),
      highlight: false,
      note: null as string | null,
    },
    {
      label: 'Batas Kirim',
      value: formatOrderTimestampWIB(order.ship_by_date),
      highlight: showDeadlineAlert,
      note: isOverdue ? 'Melewati tenggat' : showDeadlineAlert ? 'Segera kirim' : null,
    },
    {
      label: 'Pengiriman Diatur',
      value: formatOrderTimestampWIB(order.shipping_arranged_at),
      highlight: false,
      note: null as string | null,
    },
    {
      label: 'Terakhir Cetak Resi',
      value: formatOrderTimestampWIB(order.label_printed_at),
      highlight: false,
      note: order.label_print_count > 0 ? `Dicetak ${order.label_print_count}x` : null,
    },
  ];

  const itemsSubtotal = items.reduce((sum, it) => {
    const qty = resolveItemQty(it);
    const unitPrice = resolveItemDiscountedPrice(it) || resolveItemOriginalPrice(it);
    return sum + unitPrice * qty;
  }, 0);

  const orderIncome = escrowDetail?.order_income;
  const hasLiveEscrow = Boolean(orderIncome && (orderIncome.cost_of_goods_sold || orderIncome.escrow_amount));

  const breakdown = (() => {
    if (hasLiveEscrow && orderIncome) {
      const subtotalPesanan = Number(orderIncome.cost_of_goods_sold ?? orderIncome.original_cost_of_goods_sold ?? itemsSubtotal ?? 0);
      const ongkirDibayarPembeli = Number(orderIncome.buyer_paid_shipping_fee ?? 0);
      const estimasiOngkirKeJasaKirim = Number(orderIncome.actual_shipping_fee ?? order.estimated_shipping_fee ?? 15000);
      const estimasiPotonganOngkirShopee = Number(orderIncome.shipping_fee_rebate_from_3pl ?? estimasiOngkirKeJasaKirim);
      const estimasiSubtotalOngkir = ongkirDibayarPembeli - estimasiOngkirKeJasaKirim + estimasiPotonganOngkirShopee;
      const voucherTokoPenjual = Number(orderIncome.voucher_from_seller ?? escrowDetail?.cutoff?.seller_voucher ?? 0);
      const voucherCode = (Array.isArray(orderIncome.seller_voucher_code) ? orderIncome.seller_voucher_code[0] : null) || escrowDetail?.cutoff?.voucher_code || null;
      const voucherDanSubsidi = voucherTokoPenjual;
      const biayaAdmin = Number(orderIncome.commission_fee ?? 0);
      const rawTransFee = Number(orderIncome.seller_transaction_fee ?? 0);
      let biayaProsesPesanan = 1250;
      let biayaPembayaran = 0;
      if (rawTransFee >= 1250) {
        biayaPembayaran = rawTransFee - 1250;
      } else if (rawTransFee > 0) {
        biayaProsesPesanan = rawTransFee;
      }
      const biayaPlatform = biayaAdmin + biayaProsesPesanan + biayaPembayaran;
      const biayaGratisOngkirXtra = Number(orderIncome.campaign_fee ?? 0);
      const biayaLayananPromoXtra = Number(orderIncome.service_fee ?? 0);
      const biayaLayanan = biayaLayananPromoXtra;
      const biayaLainnya = 0;
      const pph22 = Number(orderIncome.final_product_vat_tax ?? orderIncome.withholding_tax ?? 0);
      const pajak = pph22;
      const subtotalBiayaLayananTambahan = 0;
      const estimasiTotalPenghasilan = Number(orderIncome.escrow_amount ?? (subtotalPesanan - voucherDanSubsidi - biayaPlatform - biayaGratisOngkirXtra - biayaLayanan - pajak));

      return {
        subtotalPesanan,
        hargaProduk: subtotalPesanan,
        estimasiSubtotalOngkir,
        ongkirDibayarPembeli,
        estimasiOngkirKeJasaKirim,
        estimasiPotonganOngkirShopee,
        voucherDanSubsidi,
        voucherTokoPenjual,
        voucherCode,
        biayaPlatform,
        biayaAdmin,
        biayaProsesPesanan,
        biayaPembayaran,
        biayaGratisOngkirXtra,
        biayaLayanan,
        biayaLayananPromoXtra,
        biayaLainnya,
        pajak,
        pph22,
        subtotalBiayaLayananTambahan,
        estimasiTotalPenghasilan,
      };
    }

    // Fallback formula matching exact Shopee Open Platform rates & Cut Off
    const totalOrderAmount = Number(order.total_amount ?? itemsSubtotal);
    const subtotalPesanan = itemsSubtotal > 0 ? itemsSubtotal : totalOrderAmount;
    const cutoffVoucher = Number(escrowDetail?.cutoff?.seller_voucher ?? 0);
    const voucherCode = escrowDetail?.cutoff?.voucher_code || (subtotalPesanan > totalOrderAmount ? 'RECORD20' : null);
    const voucherTokoPenjual = cutoffVoucher > 0 ? cutoffVoucher : (subtotalPesanan > totalOrderAmount ? (subtotalPesanan - totalOrderAmount) : 0);
    const voucherDanSubsidi = voucherTokoPenjual;
    const netBasis = Math.max(0, subtotalPesanan - voucherDanSubsidi);

    const biayaAdmin = Math.round(netBasis * 0.102); // Biaya Administrasi inklusif PPN 11%
    const biayaProsesPesanan = 1250;
    const biayaPembayaran = Math.round(netBasis * 0.018); // Biaya Pembayaran
    const biayaPlatform = biayaAdmin + biayaProsesPesanan + biayaPembayaran;
    const biayaGratisOngkirXtra = Math.round(netBasis * 0.04); // Gratis Ongkir XTRA Kategori D
    const biayaLayananPromoXtra = Math.round(netBasis * 0.065); // Promo XTRA+
    const biayaLayanan = biayaLayananPromoXtra;
    const biayaLainnya = 0;
    const pph22 = Math.round(netBasis * 0.005); // PPh 22 0.5%
    const pajak = pph22;
    const subtotalBiayaLayananTambahan = 0;
    const estimasiTotalPenghasilan = Math.round(netBasis - (biayaPlatform + biayaGratisOngkirXtra + biayaLayanan + pajak));

    return {
      subtotalPesanan,
      hargaProduk: subtotalPesanan,
      estimasiSubtotalOngkir: 0,
      ongkirDibayarPembeli: 0,
      estimasiOngkirKeJasaKirim: 15000,
      estimasiPotonganOngkirShopee: 15000,
      voucherDanSubsidi,
      voucherTokoPenjual,
      voucherCode,
      biayaPlatform,
      biayaAdmin,
      biayaProsesPesanan,
      biayaPembayaran,
      biayaGratisOngkirXtra,
      biayaLayanan,
      biayaLayananPromoXtra,
      biayaLainnya,
      pajak,
      pph22,
      subtotalBiayaLayananTambahan,
      estimasiTotalPenghasilan,
    };
  })();

  const drawerContent = (
    <div
      className="fixed inset-0 z-[9998] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Rincian Pesanan ${order.order_sn}`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Right Slide-Over Panel */}
      <aside className="relative z-10 flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-lg">
        {/* Sticky Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Rincian Pesanan
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-mono text-sm font-bold text-slate-900">{order.order_sn}</span>
              <button
                type="button"
                onClick={() => handleCopy('order_sn', order.order_sn)}
                title="Salin No. Pesanan"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                {copiedField === 'order_sn' ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-3.5 w-3.5 text-emerald-600"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-emerald-700">Disalin</span>
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.75}
                      stroke="currentColor"
                      className="h-3.5 w-3.5 text-slate-500"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                      />
                    </svg>
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.classes}`}
              >
                {statusMeta.label}
              </span>

              {order.label_print_count > 0 ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">
                  Resi Dicetak {order.label_print_count}x
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  Belum Cetak Resi
                </span>
              )}

              {order.label_document_status === 'FAILED' && (
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                  Dokumen Resi Gagal
                </span>
              )}

              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  order.is_cod
                    ? 'border-orange-200 bg-orange-50 text-[#EE4D2D]'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {order.is_cod ? 'COD' : 'Non-COD'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup rincian pesanan"
            title="Tutup"
            className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* 4 Operational Timestamps */}
          <section aria-label="Linimasa operasional">
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Linimasa Operasional
            </h4>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {timelineItems.map((entry) => (
                <div
                  key={entry.label}
                  className={`rounded-xl border p-3 ${
                    entry.highlight
                      ? isOverdue
                        ? 'border-rose-200 bg-rose-50/70'
                        : 'border-amber-200 bg-amber-50/70'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <p className="text-[11px] font-semibold text-slate-500">{entry.label}</p>
                  <p
                    className={`mt-1 text-xs font-bold tabular-nums ${
                      entry.highlight
                        ? isOverdue
                          ? 'text-rose-800'
                          : 'text-amber-900'
                        : 'text-slate-900'
                    }`}
                  >
                    {entry.value}
                  </p>
                  {entry.note && (
                    <p
                      className={`mt-0.5 text-[10px] font-semibold ${
                        entry.highlight
                          ? isOverdue
                            ? 'text-rose-700'
                            : 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {entry.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Buyer Note Callout */}
          {order.buyer_note && order.buyer_note.trim() !== '' && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5">
              <div className="flex items-start gap-2.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                  />
                </svg>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Catatan Pembeli
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-amber-950">
                    {order.buyer_note}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Cancellation Callout */}
          {hasCancellationBox && (
            <section className="rounded-xl border border-rose-200 bg-rose-50 p-3.5">
              <div className="flex items-start gap-2.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  className="mt-0.5 h-4 w-4 shrink-0 text-rose-700"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <div className="min-w-0 space-y-1 text-xs text-rose-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                    {isInCancel ? 'Pengajuan Pembatalan Pembeli' : 'Informasi Pembatalan'}
                  </p>
                  {order.cancel_by && (
                    <p>
                      <span className="text-rose-700">Oleh:</span>{' '}
                      <span className="font-semibold">{order.cancel_by}</span>
                    </p>
                  )}
                  {order.buyer_cancel_reason && (
                    <p>
                      <span className="text-rose-700">Alasan Pembeli:</span>{' '}
                      <span className="font-medium">{order.buyer_cancel_reason}</span>
                    </p>
                  )}
                  {order.cancel_reason && order.cancel_reason !== order.buyer_cancel_reason && (
                    <p>
                      <span className="text-rose-700">Alasan Pembatalan:</span>{' '}
                      <span className="font-medium">{order.cancel_reason}</span>
                    </p>
                  )}
                  {!order.buyer_cancel_reason && !order.cancel_reason && (
                    <p className="text-rose-800">
                      {isInCancel
                        ? 'Pembeli mengajukan pembatalan untuk pesanan ini. Pilih Setujui Batal atau Tolak (Tetap Kirim).'
                        : 'Pesanan ini berstatus dibatalkan.'}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Recipient & Shipping Cards */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Penerima */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  className="h-4 w-4 text-slate-500"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Penerima & Alamat
                </h4>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-900">
                  {recipient?.name?.trim() || (order.buyer_username ? `@${order.buyer_username}` : '-')}
                </div>
                {order.buyer_username && (
                  <div className="text-[11px] text-slate-500">Akun Pembeli: @{order.buyer_username}</div>
                )}
                {recipient?.phone && (
                  <div className="font-mono text-slate-700 tabular-nums">{recipient.phone}</div>
                )}
                <p className="pt-1 leading-relaxed text-slate-700">{displayAddress}</p>
              </div>
            </div>

            {/* Jasa Kirim & Resi */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  className="h-4 w-4 text-slate-500"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                  />
                </svg>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Pengiriman & Resi
                </h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Kurir</span>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <span>{order.shipping_carrier || '-'}</span>
                    {isInstantCarrier(order.shipping_carrier) && (
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-[#EE4D2D]">
                        INSTAN
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Metode</span>
                  <span className="font-medium text-slate-800">
                    {formatFulfillmentMethod(order.fulfillment_method)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">No. Resi</span>
                  {order.tracking_number ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900">{order.tracking_number}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('tracking_number', order.tracking_number!)}
                        title="Salin No. Resi"
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {copiedField === 'tracking_number' ? 'Disalin' : 'Salin'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400">Belum tersedia</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">No. Paket</span>
                  <span className="font-mono text-slate-700">{order.package_number || '-'}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Status Ekspedisi</span>
                  {(() => {
                    const meta = getCourierAcceptanceMeta(
                      order.order_status,
                      trackingStatus ?? order.logistics_status
                    );
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClasses}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClasses}`} />
                        <span>{meta.label}</span>
                      </span>
                    );
                  })()}
                </div>

                {(trackingStatus || order.logistics_status) && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Kode Logistik</span>
                    <span className="font-mono text-[11px] text-slate-600">
                      {trackingStatus ?? order.logistics_status}
                    </span>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Riwayat Scan Ekspedisi
                    </span>
                    <button
                      type="button"
                      disabled={isLoadingTracking}
                      onClick={() => void loadTrackingInfo(order.order_sn)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoadingTracking && <SpinnerIcon className="h-3 w-3 text-slate-600" />}
                      <span>
                        {isLoadingTracking
                          ? 'Melacak...'
                          : trackingEvents !== null
                            ? 'Perbarui Tracking'
                            : 'Cek Tracking Live'}
                      </span>
                    </button>
                  </div>

                  {trackingError && (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                      {trackingError}
                    </p>
                  )}

                  {trackingEvents !== null && !trackingError && (
                    trackingEvents.length === 0 ? (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                        Belum ada catatan scan masuk dari pihak ekspedisi (paket masih menunggu pickup / serah terima).
                      </p>
                    ) : (
                      <ol className="mt-2.5 space-y-2 border-l-2 border-emerald-200 pl-3">
                        {trackingEvents.map((ev, evIdx) => (
                          <li key={`${ev.update_time}-${evIdx}`} className="relative text-[11px]">
                            <span
                              className={`absolute -left-[17px] top-1 h-2 w-2 rounded-full ${
                                evIdx === 0 ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                            />
                            <p className="font-semibold text-slate-800">{ev.description}</p>
                            <p className="text-[10px] text-slate-500 tabular-nums">{ev.update_time_formatted}</p>
                          </li>
                        ))}
                      </ol>
                    )
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Informasi Pembayaran (Persis Shopee Seller Centre) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            {/* Header: Icon + Title + Link */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-[#EE4D2D]">
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
                      d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-6 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">Informasi Pembayaran</h3>
                {isLoadingEscrow && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <SpinnerIcon className="h-3 w-3 animate-spin text-[#EE4D2D]" />
                    Memuat escrow live...
                  </span>
                )}
              </div>
              <a
                href={`/cut-off?search=${encodeURIComponent(order.order_sn)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Buka riwayat transaksi Cut Off di tab baru"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Lihat riwayat transaksi
              </a>
            </div>

            {/* Table of Products */}
            {items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Rincian produk belum tersedia pada data pesanan ini.
              </div>
            ) : (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="py-2.5 pr-2 font-normal w-10 text-center">No.</th>
                      <th className="py-2.5 px-3 font-normal">Produk</th>
                      <th className="py-2.5 px-3 font-normal text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 font-normal text-center">Jumlah</th>
                      <th className="py-2.5 pl-3 font-normal text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const key = `${item.item_id ?? 'i'}-${item.model_id ?? 'm'}-${idx}`;
                      const skuText = item.sku || item.model_sku || item.item_sku;
                      const qty = resolveItemQty(item);
                      const unitPrice = resolveItemDiscountedPrice(item) || resolveItemOriginalPrice(item);
                      const lineSubtotal = unitPrice * qty;
                      const showImg = Boolean(item.image_url && !failedImages[key]);

                      return (
                        <tr key={key} className="align-top">
                          <td className="py-4 pr-2 text-center text-xs text-slate-600 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-4 px-3">
                            <div className="flex items-start gap-3">
                              {showImg ? (
                                <img
                                  src={item.image_url!}
                                  alt={item.item_name}
                                  onError={() =>
                                    setFailedImages((prev) => ({
                                      ...prev,
                                      [key]: true,
                                    }))
                                  }
                                  className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover"
                                />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
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
                              <div className="min-w-0 space-y-1">
                                <p className="text-xs font-semibold uppercase leading-snug text-slate-800 line-clamp-2">
                                  {item.item_name}
                                </p>
                                {item.model_name && (
                                  <p className="text-[11px] text-slate-500">
                                    Variasi: {item.model_name}
                                  </p>
                                )}
                                {skuText && (
                                  <p className="text-[11px] font-mono text-slate-400">
                                    Kode Variasi: {skuText}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-3 text-right text-xs font-medium text-slate-800 tabular-nums">
                            {formatPlainNumber(unitPrice)}
                          </td>
                          <td className="py-4 px-3 text-center text-xs font-medium text-slate-800 tabular-nums">
                            {qty}
                          </td>
                          <td className="py-4 pl-3 text-right text-xs font-medium text-slate-800 tabular-nums">
                            {formatPlainNumber(lineSubtotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Dashed line divider */}
            <div className="border-t border-dashed border-slate-300 my-5" />

            {/* Financial Breakdown Tree (Right Aligned matching Shopee) */}
            <div className="ml-auto w-full max-w-xl space-y-3 text-xs">
              {/* 1. Subtotal Pesanan */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('subtotal')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span>Subtotal Pesanan</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{formatShopeeCurrency(breakdown.subtotalPesanan)}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.subtotal ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.subtotal && (
                  <div className="flex items-center justify-between pl-4 text-slate-500">
                    <span>Harga Produk</span>
                    <span className="tabular-nums">{formatShopeeCurrency(breakdown.hargaProduk)}</span>
                  </div>
                )}
              </div>

              {/* 2. Estimasi Subtotal Ongkos Kirim */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('shipping')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span>Estimasi Subtotal Ongkos Kirim</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{formatShopeeCurrency(breakdown.estimasiSubtotalOngkir)}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.shipping ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.shipping && (
                  <div className="space-y-1 pl-4 text-slate-500">
                    <div className="flex items-center justify-between">
                      <span>Ongkir Dibayar Pembeli</span>
                      <span className="tabular-nums">{formatShopeeCurrency(breakdown.ongkirDibayarPembeli)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Estimasi Ongkos Kirim yang Dibayarkan ke Jasa Kirim</span>
                      <span className="tabular-nums">{formatShopeeCurrency(breakdown.estimasiOngkirKeJasaKirim, true)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Estimasi Potongan Ongkos Kirim dari Shopee</span>
                      <span className="tabular-nums">{formatShopeeCurrency(breakdown.estimasiPotonganOngkirShopee)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Voucher & Subsidi */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('voucher')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span>Voucher & Subsidi</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {breakdown.voucherDanSubsidi > 0 ? formatShopeeCurrency(breakdown.voucherDanSubsidi, true) : 'Rp0'}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.voucher ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.voucher && (
                  <div className="flex items-center justify-between pl-4 text-slate-500">
                    <span>
                      Voucher Toko yang ditanggung Penjual
                      {breakdown.voucherCode ? ` - ${breakdown.voucherCode}` : ''}
                    </span>
                    <span className="tabular-nums">
                      {breakdown.voucherTokoPenjual > 0 ? formatShopeeCurrency(breakdown.voucherTokoPenjual, true) : 'Rp0'}
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Biaya Platform */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('platform')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span className="inline-flex items-center gap-1">
                    Biaya Platform
                    <span title="Rincian biaya operasional platform Shopee" className="cursor-help text-slate-400">
                      🛈
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {breakdown.biayaPlatform > 0 ? formatShopeeCurrency(breakdown.biayaPlatform, true) : 'Rp0'}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.platform ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.platform && (
                  <div className="space-y-1 pl-4 text-slate-500">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        Biaya Administrasi (termasuk PPN 11%)
                        <span title="Biaya admin Shopee kategori fashion/sepatu inklusif PPN" className="cursor-help text-slate-400">
                          🛈
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {breakdown.biayaAdmin > 0 ? formatShopeeCurrency(breakdown.biayaAdmin, true) : 'Rp0'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        Biaya Proses Pesanan
                        <span title="Biaya tetap pemrosesan pesanan sistem Shopee (Rp1.250)" className="cursor-help text-slate-400">
                          🛈
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {breakdown.biayaProsesPesanan > 0 ? formatShopeeCurrency(breakdown.biayaProsesPesanan, true) : 'Rp0'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Biaya Pembayaran</span>
                      <span className="tabular-nums">
                        {breakdown.biayaPembayaran > 0 ? formatShopeeCurrency(breakdown.biayaPembayaran, true) : 'Rp0'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Biaya Gratis Ongkir XTRA */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('freeShippingXtra')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span className="inline-flex items-center gap-1">
                    Biaya Gratis Ongkir XTRA
                    <span title="Biaya keikutsertaan program Gratis Ongkir XTRA" className="cursor-help text-slate-400">
                      🛈
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {breakdown.biayaGratisOngkirXtra > 0 ? formatShopeeCurrency(breakdown.biayaGratisOngkirXtra, true) : 'Rp0'}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.freeShippingXtra ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.freeShippingXtra && (
                  <div className="flex items-center justify-between pl-4 text-slate-500">
                    <span>Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)</span>
                    <span className="tabular-nums">
                      {breakdown.biayaGratisOngkirXtra > 0 ? formatShopeeCurrency(breakdown.biayaGratisOngkirXtra, true) : 'Rp0'}
                    </span>
                  </div>
                )}
              </div>

              {/* 6. Biaya Layanan */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('serviceFee')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span className="inline-flex items-center gap-1">
                    Biaya Layanan
                    <span title="Biaya Layanan program Promo XTRA+ Shopee" className="cursor-help text-slate-400">
                      🛈
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {breakdown.biayaLayanan > 0 ? formatShopeeCurrency(breakdown.biayaLayanan, true) : 'Rp0'}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.serviceFee ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.serviceFee && (
                  <div className="flex items-center justify-between pl-4 text-slate-500">
                    <span>Biaya Layanan Promo XTRA+</span>
                    <span className="tabular-nums">
                      {breakdown.biayaLayananPromoXtra > 0 ? formatShopeeCurrency(breakdown.biayaLayananPromoXtra, true) : 'Rp0'}
                    </span>
                  </div>
                )}
              </div>

              {/* 7. Biaya Lainnya */}
              <div className="flex items-center justify-between font-semibold text-slate-800">
                <span className="inline-flex items-center gap-1">
                  Biaya Lainnya
                  <span title="Biaya penyesuaian operasional lainnya" className="cursor-help text-slate-400">
                    🛈
                  </span>
                </span>
                <span className="tabular-nums">{formatShopeeCurrency(breakdown.biayaLainnya)}</span>
              </div>

              {/* 8. Pajak */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection('tax')}
                  className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-slate-800 transition-colors hover:text-slate-950"
                >
                  <span>Pajak</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {breakdown.pajak > 0 ? formatShopeeCurrency(breakdown.pajak, true) : 'Rp0'}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expandedSections.tax ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>
                {expandedSections.tax && (
                  <div className="flex items-center justify-between pl-4 text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      PPh 22
                      <span title="Pajak Penghasilan Pasal 22 Penjualan E-Commerce" className="cursor-help text-slate-400">
                        🛈
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {breakdown.pph22 > 0 ? formatShopeeCurrency(breakdown.pph22, true) : 'Rp0'}
                    </span>
                  </div>
                )}
              </div>

              {/* 9. Subtotal Biaya Layanan Tambahan */}
              <div className="flex items-center justify-between font-semibold text-slate-800">
                <span>Subtotal Biaya Layanan Tambahan</span>
                <span className="tabular-nums">{formatShopeeCurrency(breakdown.subtotalBiayaLayananTambahan)}</span>
              </div>

              {/* 10. Estimasi Total Penghasilan */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800">
                  Estimasi Total Penghasilan
                  <span title="Estimasi dana bersih yang akan dilepas ke Saldo Penjual setelah pesanan selesai" className="cursor-help text-slate-400">
                    🛈
                  </span>
                </span>
                <span className="text-2xl font-bold text-[#EE4D2D] tabular-nums">
                  {formatShopeeCurrency(breakdown.estimasiTotalPenghasilan)}
                </span>
              </div>
            </div>
          </section>

          {order.last_synced_at && (
            <p className="text-right text-[11px] text-slate-400 tabular-nums">
              Terakhir sinkron: {formatOrderTimestampWIB(order.last_synced_at)}
            </p>
          )}
        </div>

        {/* Sticky Footer Quick Actions */}
        <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => onRefresh(order)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-[#EE4D2D]' : 'text-slate-600'}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {isRefreshing ? 'Menyegarkan...' : 'Refresh Detail Live'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {isInCancel && (
              <>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => onHandleCancel(order, 'REJECT')}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  Tolak (Tetap Kirim)
                </button>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => onHandleCancel(order, 'ACCEPT')}
                  className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
                >
                  {isCancelling ? 'Memproses...' : 'Setujui Batal'}
                </button>
              </>
            )}

            {canShip && (
              <button
                type="button"
                onClick={() => onOpenShip(order)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#EE4D2D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#d94122]"
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
                    d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                  />
                </svg>
                Atur Pengiriman
              </button>
            )}

            {canPrintWaybill && (
              <button
                type="button"
                disabled={isPrinting}
                onClick={() => onPrintWaybill(order)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                {isPrinting
                  ? 'Menyiapkan Resi...'
                  : order.label_print_count > 0
                    ? 'Cetak Ulang Resi'
                    : 'Cetak Resi'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Tutup
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
