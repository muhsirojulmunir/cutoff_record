import React, { useEffect, useRef } from 'react';
import { ShopeeOrderStatus } from '../../Types/shopeeOrder';

/**
 * Status pesanan Shopee yang dapat diatur pengirimannya (belum diproses).
 */
export const SHIPPABLE_STATUSES = new Set<string>(['READY_TO_SHIP', 'RETRY_SHIP']);

/**
 * Status pesanan Shopee yang dilarang untuk cetak resi A4 (harus sudah diproses & tidak batal).
 */
export const WAYBILL_BLOCKED_STATUSES = new Set<string>([
  'UNPAID',
  'READY_TO_SHIP',
  'RETRY_SHIP',
  'CANCELLED',
]);

/**
 * Status aktif yang masih memiliki tenggat pengiriman.
 */
export const ACTIVE_DEADLINE_STATUSES = new Set<string>([
  'READY_TO_SHIP',
  'RETRY_SHIP',
  'PROCESSED',
]);

export interface OrderStatusMeta {
  label: string;
  classes: string;
}

export const ORDER_STATUS_META: Record<string, OrderStatusMeta> = {
  UNPAID: {
    label: 'Belum Bayar',
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  READY_TO_SHIP: {
    label: 'Perlu Dikirim (Belum Diproses)',
    classes: 'border-orange-200 bg-orange-50 text-[#EE4D2D]',
  },
  RETRY_SHIP: {
    label: 'Perlu Atur Ulang Pengiriman',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  PROCESSED: {
    label: 'Telah Diproses (Siap Cetak Resi)',
    classes: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  SHIPPED: {
    label: 'Dikirim',
    classes: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  },
  TO_CONFIRM_RECEIVE: {
    label: 'Pesanan Tiba',
    classes: 'border-teal-200 bg-teal-50 text-teal-800',
  },
  COMPLETED: {
    label: 'Selesai',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  IN_CANCEL: {
    label: 'Pengajuan Pembatalan',
    classes: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  CANCELLED: {
    label: 'Dibatalkan',
    classes: 'border-rose-300 bg-rose-100 text-rose-800',
  },
  TO_RETURN: {
    label: 'Pengembalian',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

export const FULFILLMENT_METHOD_LABELS: Record<string, string> = {
  pickup: 'Pick-up (Jemput Kurir)',
  dropoff: 'Antar ke Counter (Drop-off)',
  non_integrated: 'Kurir Non-Integrated',
};

export function normalizeOrderStatus(status: ShopeeOrderStatus | null | undefined): string {
  return String(status ?? '').trim().toUpperCase();
}

export function isShippableOrderStatus(status: ShopeeOrderStatus | null | undefined): boolean {
  return SHIPPABLE_STATUSES.has(normalizeOrderStatus(status));
}

export function isWaybillBlockedStatus(status: ShopeeOrderStatus | null | undefined): boolean {
  return WAYBILL_BLOCKED_STATUSES.has(normalizeOrderStatus(status));
}

export function getOrderStatusMeta(status: ShopeeOrderStatus | null | undefined): OrderStatusMeta {
  const normalized = normalizeOrderStatus(status);
  return (
    ORDER_STATUS_META[normalized] ?? {
      label: normalized || '-',
      classes: 'border-slate-200 bg-slate-100 text-slate-700',
    }
  );
}

export function formatFulfillmentMethod(
  method: string | null | undefined,
  emptyLabel = 'Belum diatur'
): string {
  const key = String(method ?? '').trim().toLowerCase();
  if (!key) return emptyLabel;
  return FULFILLMENT_METHOD_LABELS[key] ?? String(method);
}

export function formatCurrencyIDR(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return `Rp ${Math.round(safe).toLocaleString('id-ID')}`;
}

export function parseWibDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}+07:00`
    : trimmed;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatOrderTimestampWIB(raw: string | null | undefined): string {
  const date = parseWibDate(raw);
  if (!date) return '-';
  const formatted = date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  });
  return `${formatted} WIB`;
}

export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export function SpinnerIcon({ className = 'h-4 w-4' }: { className?: string }): React.ReactElement {
  return React.createElement(
    'svg',
    {
      className: `animate-spin ${className}`,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
    },
    React.createElement('circle', {
      className: 'opacity-25',
      cx: 12,
      cy: 12,
      r: 10,
      stroke: 'currentColor',
      strokeWidth: 3,
    }),
    React.createElement('path', {
      className: 'opacity-75',
      fill: 'currentColor',
      d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z',
    })
  );
}

// ---------------------------------------------------------------------------
// Reference-counted body scroll lock & LIFO topmost-only Escape stack
// ---------------------------------------------------------------------------

let scrollLockCount = 0;
let savedOriginalOverflow: string | null = null;
const ACTIVE_OVERLAY_STACK: symbol[] = [];

export function acquireScrollLock(): void {
  if (typeof document === 'undefined') return;
  if (scrollLockCount === 0) {
    savedOriginalOverflow = document.body.style.overflow;
  }
  scrollLockCount += 1;
  document.body.dataset.shopeeScrollLocks = String(scrollLockCount);
  document.body.style.overflow = 'hidden';
}

export function releaseScrollLock(): void {
  if (typeof document === 'undefined') return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount > 0) {
    document.body.dataset.shopeeScrollLocks = String(scrollLockCount);
    // Keep body locked if a lower overlay remains active even if a nested child modal touched style.overflow
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => {
      if (scrollLockCount > 0 && typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
      }
    });
    return;
  }

  delete document.body.dataset.shopeeScrollLocks;
  document.body.style.overflow = savedOriginalOverflow ?? '';
  savedOriginalOverflow = null;
}

export interface OverlayHookOptions {
  lockScroll?: boolean;
  canClose?: () => boolean;
}

/**
 * Mengelola scroll-lock reference-counted dan handler tombol Escape khusus overlay teratas (LIFO),
 * sehingga menutup modal di atas drawer tidak mengaktifkan layer di bawahnya.
 */
export function useOverlayScrollLockAndEscape(
  active: boolean,
  onClose: () => void,
  options?: OverlayHookOptions
): void {
  const lockScroll = options?.lockScroll ?? true;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const canCloseRef = useRef(options?.canClose);
  canCloseRef.current = options?.canClose;

  useEffect(() => {
    if (!active) return;

    const overlayId = Symbol('shopee-overlay');
    ACTIVE_OVERLAY_STACK.push(overlayId);

    if (lockScroll) {
      acquireScrollLock();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ACTIVE_OVERLAY_STACK[ACTIVE_OVERLAY_STACK.length - 1] !== overlayId) return;
      if (canCloseRef.current && !canCloseRef.current()) return;
      e.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      const idx = ACTIVE_OVERLAY_STACK.lastIndexOf(overlayId);
      if (idx !== -1) {
        ACTIVE_OVERLAY_STACK.splice(idx, 1);
      }
      window.removeEventListener('keydown', handleKeyDown);
      if (lockScroll) {
        releaseScrollLock();
      }
    };
  }, [active, lockScroll]);
}
