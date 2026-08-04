import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';
import { downloadSingleSalesOrder } from '../../Utils/salesOrderExcel';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface Creator {
  id: number;
  name: string;
}

interface DBProduct {
  id: number;
  name: string;
  sku: string;
}

interface SalesOrderItem {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  quantity: number;
  unit: string;
  price: string;
  discount_amount: string;
  tax_amount: string;
  subtotal: string;
  product: DBProduct | null;
}

interface SalesOrder {
  id: number;
  so_number: string;
  tracking_number?: string | null;
  recipient_name?: string | null;
  customer_phone?: string | null;
  shipping_address?: string | null;
  city?: string | null;
  province?: string | null;
  total_weight?: string | null;
  dp_amount?: string | null;
  customer_id: number | null;
  order_date: string;
  payment_date?: string | null;
  source: 'manual' | 'marketplace' | 'website' | 'other';

  sales_channel: 'manual' | 'grosir' | 'shopee' | 'tiktok' | 'website' | 'other';
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'completed' | 'cancelled';
  payment_status: 'unpaid' | 'partially_paid' | 'paid' | 'refunded';
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_cost: string;
  grand_total: string;
  notes: string | null;
  created_at: string;
  customer: Customer | null;
  creator: Creator | null;
  items: SalesOrderItem[];
  invoice?: {
    id: number;
    invoice_number: string;
    status: string;
  } | null;
  submitted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  submitter: ActorInfo | null;
  approver: ActorInfo | null;
  completer: ActorInfo | null;
}

interface ActorInfo {
  id: number;
  name: string;
  role: { id: number; name: string } | null;
}

interface SalesOrderShowProps {
  salesOrder: SalesOrder;
  /** Nama role yang berhak menyetujui SO, dibaca dari permission di database. */
  approverRoles: string[];
}

const statusBadgeColor: Record<string, string> = {
  draft:            'bg-gray-100 border-gray-300 text-gray-500',
  pending_approval: 'bg-orange-50 border-orange-200 text-orange-600',
  approved:         'bg-blue-500/10 border-blue-500/20 text-blue-400',
  processing:       'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  completed:        'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  cancelled:        'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const statusLabel: Record<string, string> = {
  draft:            'Draft',
  pending_approval: 'Menunggu Approval Finance',
  approved:         'Disetujui',
  processing:       'Diproses',
  completed:        'Selesai',
  cancelled:        'Dibatalkan',
};

const paymentBadgeColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-orange-50 border-orange-200 text-orange-600',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  refunded:       'bg-gray-100 border-gray-300 text-gray-400',
};

const paymentLabel: Record<string, string> = {
  unpaid:         'Belum Bayar',
  partially_paid: 'Sebagian',
  paid:           'Lunas',
  refunded:       'Refund',
};

const sourceLabel: Record<string, string> = {
  manual:      'Manual',
  marketplace: 'Marketplace',
  website:     'Website',
  other:       'Lainnya',
};

const channelLabel: Record<string, string> = {
  manual:  'Manual',
  grosir:  'Grosir (Offline)',
  shopee:  'Shopee',
  tiktok:  'TikTok Shop',
  website: 'Website',
  other:   'Lainnya',
};


export default function Show({ salesOrder, approverRoles }: SalesOrderShowProps) {
  const { flash, auth, errors } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const canEdit = permissions.includes('sales_order.edit');
  const canDelete = permissions.includes('sales_order.delete');
  const canApprove = permissions.includes('sales_order.approve');
  const canCreateInvoice = permissions.includes('invoice.create');
  const canViewInvoice = permissions.includes('invoice.view');

  // Invoice state
  const hasActiveInvoice = salesOrder.invoice && salesOrder.invoice.status !== 'cancelled';
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // Delivery & Tracking Resi state
  const [trackingNumber, setTrackingNumber] = useState(salesOrder.tracking_number ?? '');
  const [isEditingResi, setIsEditingResi] = useState(false);
  const [resiLoading, setResiLoading] = useState(false);

  function handleDownloadExcel() {
    downloadSingleSalesOrder(
      {
        so_number: salesOrder.so_number,
        order_date: salesOrder.order_date?.split('T')[0] ?? null,
        customer_code: salesOrder.customer?.customer_code ?? null,
        customer_name: salesOrder.customer?.name ?? null,
        recipient_name: salesOrder.recipient_name ?? null,
        city: salesOrder.city ?? null,
        province: salesOrder.province ?? null,
        source: salesOrder.source,
        sales_channel: salesOrder.sales_channel,
        status: salesOrder.status,
        payment_status: salesOrder.payment_status,
        tracking_number: salesOrder.tracking_number ?? null,
        subtotal: Number(salesOrder.subtotal),
        discount_amount: Number(salesOrder.discount_amount),
        tax_amount: Number(salesOrder.tax_amount),
        shipping_cost: Number(salesOrder.shipping_cost),
        grand_total: Number(salesOrder.grand_total),
        dp_amount: Number(salesOrder.dp_amount ?? 0),
        remaining_amount: Math.max(0, Number(salesOrder.grand_total) - Number(salesOrder.dp_amount ?? 0)),
        total_weight: Number(salesOrder.total_weight ?? 0),
        created_by: salesOrder.creator?.name ?? null,
        notes: salesOrder.notes ?? null,
      },
      salesOrder.items.map((item) => ({
        so_number: salesOrder.so_number,
        order_date: salesOrder.order_date?.split('T')[0] ?? null,
        customer_name: salesOrder.customer?.name ?? null,
        sku: item.sku,
        product_name: item.product_name,
        quantity: item.quantity,
        price: Number(item.price),
        discount_amount: Number(item.discount_amount),
        tax_amount: Number(item.tax_amount),
        subtotal: Number(item.subtotal),
      })),
    );
  }

  function handleSaveResi(e: React.FormEvent) {
    e.preventDefault();
    setResiLoading(true);
    router.post(`/sales-orders/${salesOrder.id}/update-tracking`, {
      tracking_number: trackingNumber,
    }, {
      onFinish: () => {
        setResiLoading(false);
        setIsEditingResi(false);
      }
    });
  }

  function handleCreateInvoice() {
    setInvoiceLoading(true);
    router.post('/invoices', {
      sales_order_id: salesOrder.id,
    }, {
      onFinish: () => setInvoiceLoading(false),
    });
  }


  function handleAction(url: string) {
    setLoading(true);
    router.post(url, {}, {
      onFinish: () => setLoading(false)
    });
  }

  function handleDelete() {
    setLoading(true);
    router.delete(`/sales-orders/${salesOrder.id}`, {
      onFinish: () => {
        setLoading(false);
        setDeleteConfirmOpen(false);
      }
    });
  }

  // Alur SO: Draft → Pending Approval → Disetujui → Diproses (resi terbit) → Selesai.
  // 'processing' wajib ikut di sini; tanpa itu indexOf mengembalikan -1 dan
  // progress bar justru kosong begitu No. Resi diisi.
  const steps = ['draft', 'pending_approval', 'approved', 'processing', 'completed'];
  const currentStepIdx = steps.indexOf(salesOrder.status);

  // SO yang sudah lunas tinggal menunggu resi; bila memang tidak pakai resi
  // (mis. grosir ambil di tempat), penutupan dilakukan manual di sini.
  const isPaidOff = salesOrder.invoice
    ? salesOrder.invoice.status === 'paid'
    : salesOrder.payment_status === 'paid';
  const canMarkComplete =
    ['approved', 'processing'].includes(salesOrder.status) && isPaidOff && canApprove;

  const approverRoleLabel = approverRoles.length > 0 ? approverRoles.join(' / ') : 'role berwenang';

  // SO sudah disetujui tapi resinya belum diisi — inilah yang menahan tahap "Diproses".
  const needsResi = ['approved', 'processing'].includes(salesOrder.status) && !salesOrder.tracking_number;

  const fmtStamp = (value: string | null) =>
    value
      ? new Date(value).toLocaleString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : null;

  /** Siapa yang mengerjakan tahap ini, atau siapa yang sedang ditunggu. */
  const stepTooltip = (step: string, isPassed: boolean): string => {
    const actorLine = (actor: ActorInfo | null, at: string | null, verb: string) => {
      const stamp = fmtStamp(at) ? ` — ${fmtStamp(at)}` : '';

      // SO lama dibuat sebelum jejak persetujuan dicatat, jadi pelakunya kosong.
      if (!actor) return `${verb} — pelaku tidak tercatat${stamp}`;

      const role = actor.role?.name ? ` (${actor.role.name})` : '';
      return `${verb} ${actor.name}${role}${stamp}`;
    };

    switch (step) {
      case 'draft':
        return actorLine(salesOrder.creator as ActorInfo | null, salesOrder.created_at, 'Dibuat oleh');

      case 'pending_approval':
        return isPassed
          ? actorLine(salesOrder.submitter, salesOrder.submitted_at, 'Diajukan oleh')
          : 'Belum diajukan untuk persetujuan';

      case 'approved':
        return isPassed
          ? actorLine(salesOrder.approver, salesOrder.approved_at, 'Disetujui oleh')
          : `Menunggu approve dari ${approverRoleLabel}`;

      case 'processing':
        if (isPassed) {
          return salesOrder.tracking_number
            ? `Barang dikirim — No. Resi ${salesOrder.tracking_number}`
            : 'Sedang diproses';
        }
        return 'Isi No. Resi / AWB di kartu "Delivery Order & Resi" untuk memulai tahap ini';

      case 'completed':
        if (isPassed) {
          return salesOrder.completer
            ? actorLine(salesOrder.completer, salesOrder.completed_at, 'Ditandai selesai oleh')
            : `Selesai otomatis (lunas & resi terbit)${fmtStamp(salesOrder.completed_at) ? ` — ${fmtStamp(salesOrder.completed_at)}` : ''}`;
        }
        return isPaidOff
          ? 'Menunggu No. Resi diisi agar otomatis selesai'
          : 'Menunggu pelunasan pembayaran dan pengiriman barang';

      default:
        return '';
    }
  };

  return (
    <AppLayout>
      <Head title={`Detail Sales Order — ${salesOrder.so_number}`} />
      <Alert message={flash.success ?? null} type="success" />
      {/* Aksi approve/cancel mengembalikan pesan lewat withErrors, bukan flash.
          Tanpa baris errors.error di bawah, kegagalan approve tidak terlihat
          sama sekali dan tombolnya seolah tidak berfungsi. */}
      {flash.error && <Alert message={flash.error} type="error" />}
      {errors?.error && <Alert message={errors.error} type="error" />}

      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/sales-orders"
              className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-gray-900">{salesOrder.so_number}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[salesOrder.status]}`}>
                  {statusLabel[salesOrder.status]}
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-1">Transaksi / Sales Orders / Detail</p>
            </div>
          </div>

          {/* Contextual Action Buttons */}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 border border-teal-400 hover:border-teal-500 rounded-xl text-sm font-semibold transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Excel
            </button>

            {salesOrder.status === 'draft' && (
              <>
                {canEdit && (
                  <Link
                    href={`/sales-orders/${salesOrder.id}/edit`}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded-xl text-sm font-semibold transition-all"
                  >
                    Edit Draft
                  </Link>
                )}
                {canEdit && (
                  <button
                    onClick={() => handleAction(`/sales-orders/${salesOrder.id}/submit-approval`)}
                    disabled={loading}
                    className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40 disabled:opacity-50"
                  >
                    Ajukan Approval
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    Hapus
                  </button>
                )}
              </>
            )}

            {salesOrder.status === 'pending_approval' && (
              <>
                {canApprove && (
                  <button
                    onClick={() => handleAction(`/sales-orders/${salesOrder.id}/approve`)}
                    disabled={loading}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-200/40 disabled:opacity-50"
                  >
                    Setujui (Approve)
                  </button>
                )}
                <button
                  onClick={() => handleAction(`/sales-orders/${salesOrder.id}/cancel`)}
                  disabled={loading}
                  className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                >
                  Batalkan Order
                </button>
              </>
            )}

            {canMarkComplete && (
              <button
                onClick={() => handleAction(`/sales-orders/${salesOrder.id}/complete`)}
                disabled={loading}
                title="Tutup Sales Order ini tanpa menunggu No. Resi"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Tandai Selesai
              </button>
            )}

            {['approved', 'processing'].includes(salesOrder.status) && (
              <button
                onClick={() => handleAction(`/sales-orders/${salesOrder.id}/cancel`)}
                disabled={loading}
                className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              >
                Batalkan Order
              </button>
            )}

            {/* Invoice Button — Show if SO is approved/processing/completed */}
            {['approved', 'processing', 'completed'].includes(salesOrder.status) && (
              hasActiveInvoice ? (
                canViewInvoice && (
                  <Link
                    href={`/invoices/${salesOrder.invoice!.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-sm font-semibold transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Lihat Invoice ({salesOrder.invoice!.invoice_number})
                  </Link>
                )
              ) : (
                canCreateInvoice && (
                  <button
                    onClick={handleCreateInvoice}
                    disabled={invoiceLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40 disabled:opacity-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    {invoiceLoading ? 'Menerbitkan...' : 'Terbitkan Invoice'}
                  </button>
                )
              )
            )}
          </div>
        </div>

        {/* Timeline Status */}
        {salesOrder.status !== 'cancelled' && (
          <div className="bg-white border border-gray-300 rounded-2xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-6">Status Timeline</h3>
            <div className="relative flex items-center justify-between">
              {/* Line in background */}
              <div className="absolute left-0 right-0 h-1 bg-gray-100 z-0 top-3" />
              <div
                className="absolute left-0 h-1 bg-gradient-to-r from-teal-600 to-cyan-500 z-0 top-3 transition-all duration-300"
                style={{ width: `${(Math.max(0, currentStepIdx) / (steps.length - 1)) * 100}%` }}
              />

              {steps.map((step, idx) => {
                const isPassed = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;

                return (
                  <div key={step} className="relative z-10 flex flex-col items-center group">
                    {/* Tooltip: pelaku tahap ini, atau siapa yang sedang ditunggu */}
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30"
                    >
                      <div className="whitespace-nowrap rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-xs text-gray-800">
                        {stepTooltip(step, isPassed)}
                      </div>
                      <div className="mx-auto h-2 w-2 -mt-1 rotate-45 border-b border-r border-gray-300 bg-gray-100" />
                    </div>

                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 cursor-help
                        ${isPassed
                          ? 'bg-white border-teal-500 text-teal-400'
                          : 'bg-gray-50 border-gray-300 text-gray-400'
                        }
                        ${isCurrent ? 'ring-4 ring-teal-500/20 scale-110' : ''}
                      `}
                    >
                      {isPassed && idx < currentStepIdx ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider mt-2.5 transition-colors duration-300 ${isPassed ? 'text-gray-800' : 'text-gray-400'}`}>
                      {statusLabel[step]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Order details */}
            <div className="bg-white border border-gray-300 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Informasi Customer</h3>
                {salesOrder.customer ? (
                  <div className="space-y-1.5">
                    <p className="text-gray-900 font-bold text-base">{salesOrder.customer.name}</p>
                    <p className="text-gray-500 text-xs font-mono">{salesOrder.customer.customer_code}</p>
                    {salesOrder.customer.phone && <p className="text-gray-500 text-xs">📞 {salesOrder.customer.phone}</p>}
                    {salesOrder.customer.email && <p className="text-gray-500 text-xs">✉️ {salesOrder.customer.email}</p>}
                    {salesOrder.customer.address && (
                      <p className="text-gray-500 text-xs leading-relaxed mt-2 border-t border-gray-200 pt-2">
                        📍 {salesOrder.customer.address}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic">Customer Umum / Walk-in</p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Detail Transaksi</h3>
                  <div className="grid grid-cols-2 gap-y-2.5 text-xs text-gray-700">
                    <span className="text-gray-400">Tanggal Order</span>
                    <span className="font-semibold">{new Date(salesOrder.order_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>

                    {salesOrder.payment_date && (
                      <>
                        <span className="text-gray-400">Waktu Pembayaran</span>
                        <span className="font-semibold text-emerald-400">
                          {new Date(salesOrder.payment_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </>
                    )}

                    <span className="text-gray-400">Sumber Order</span>
                    <span className="font-semibold">{sourceLabel[salesOrder.source] ?? salesOrder.source}</span>


                    <span className="text-gray-400">Sales Channel</span>
                    <span className="font-semibold">{channelLabel[salesOrder.sales_channel] ?? salesOrder.sales_channel}</span>

                    <span className="text-gray-400">Status Bayar</span>
                    <span className="font-semibold">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${paymentBadgeColor[salesOrder.payment_status]}`}>
                        {paymentLabel[salesOrder.payment_status]}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-3">
                  <span className="text-gray-400 text-xs block mb-1">Catatan Transaksi</span>
                  <p className="text-gray-500 text-xs leading-relaxed italic">{salesOrder.notes ?? 'Tidak ada catatan.'}</p>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="bg-white border border-gray-300 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-gray-300">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Daftar Item</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-teal-50/60">
                      <th className="px-6 py-3">Produk</th>
                      <th className="px-6 py-3 text-right">Harga</th>
                      <th className="px-6 py-3 text-center">Qty</th>
                      <th className="px-6 py-3 text-right">Diskon</th>
                      <th className="px-6 py-3 text-right">Pajak</th>
                      <th className="px-6 py-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/60 text-xs">
                    {salesOrder.items.map((item) => (
                      <tr key={item.id} className="hover:bg-teal-50/40 transition-all">
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-800">{item.product_name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{item.sku}</p>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">
                          Rp {Number(item.price).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 text-center text-gray-700 whitespace-nowrap">
                          {item.quantity} <span className="text-[10px] text-gray-400 uppercase font-bold ml-0.5">{item.unit}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-rose-400">
                          {Number(item.discount_amount) > 0 ? `-Rp ${Number(item.discount_amount).toLocaleString('id-ID')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">
                          {Number(item.tax_amount) > 0 ? `+Rp ${Number(item.tax_amount).toLocaleString('id-ID')}` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-400">
                          Rp {Number(item.subtotal).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Panel: Cost Summary & Audit */}
          <div className="space-y-6">
            {/* Cost Summary Card */}
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Ringkasan Biaya</h3>

              <div className="space-y-3 divide-y divide-gray-200/60 text-xs">
                {/* Subtotal */}
                <div className="flex justify-between items-center pb-3">
                  <span className="text-gray-400">Subtotal Item</span>
                  <span className="font-semibold text-gray-700">Rp {Number(salesOrder.subtotal).toLocaleString('id-ID')}</span>
                </div>

                {/* Diskon */}
                <div className="flex justify-between items-center pt-3 pb-3">
                  <span className="text-gray-400">Diskon Transaksi</span>
                  <span className="font-semibold text-rose-400">-Rp {Number(salesOrder.discount_amount).toLocaleString('id-ID')}</span>
                </div>

                {/* Pajak */}
                <div className="flex justify-between items-center pt-3 pb-3">
                  <span className="text-gray-400">Pajak Transaksi</span>
                  <span className="font-semibold text-gray-700">+Rp {Number(salesOrder.tax_amount).toLocaleString('id-ID')}</span>
                </div>

                {/* Ongkir */}
                <div className="flex justify-between items-center pt-3 pb-3">
                  <span className="text-gray-400">Biaya Pengiriman</span>
                  <span className="font-semibold text-gray-700">+Rp {Number(salesOrder.shipping_cost).toLocaleString('id-ID')}</span>
                </div>

                {/* DP / Uang Muka — tampil di atas total agar mudah dibaca */}
                {Number(salesOrder.dp_amount ?? 0) > 0 && (
                  <div className="flex justify-between items-center pt-3 pb-3">
                    <span className="text-gray-400">DP / Uang Muka</span>
                    <span className="font-semibold text-teal-600">-Rp {Number(salesOrder.dp_amount).toLocaleString('id-ID')}</span>
                  </div>
                )}

                {/* Grand Total */}
                <div className="flex justify-between items-center pt-4">
                  <span className="text-sm font-bold text-gray-900">Grand Total</span>
                  <span className="text-base font-extrabold text-emerald-500">Rp {Number(salesOrder.grand_total).toLocaleString('id-ID')}</span>
                </div>

                {/* Sisa tagihan setelah DP */}
                {Number(salesOrder.dp_amount ?? 0) > 0 && (
                  <div className="flex justify-between items-center pt-3">
                    <span className="text-sm font-bold text-gray-700">Sisa Tagihan</span>
                    <span className="text-base font-extrabold text-rose-500">
                      Rp {Math.max(0, Number(salesOrder.grand_total) - Number(salesOrder.dp_amount)).toLocaleString('id-ID')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Order & Tracking Resi Card */}
            <div className={`bg-white rounded-2xl p-6 space-y-4 border ${needsResi ? 'border-teal-400 ring-2 ring-teal-100' : 'border-gray-300'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Delivery Order &amp; Resi / AWB</h3>
                <button
                  type="button"
                  onClick={() => setIsEditingResi(!isEditingResi)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                >
                  {isEditingResi ? 'Batal' : salesOrder.tracking_number ? 'Ubah Resi' : 'Isi Resi'}
                </button>
              </div>

              {/* Petunjuk tahap "Diproses" — muncul selama resi belum diisi. */}
              {needsResi && (
                <div className="rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-3 text-[11px] text-teal-800 leading-relaxed">
                  <p className="font-bold mb-1">Cara memproses order ini (tahap 4 — Diproses)</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-teal-700">
                    <li>Kemas barang, lalu ambil No. Resi / AWB dari kurir.</li>
                    <li>Klik <span className="font-semibold">Isi Resi</span> di atas dan simpan nomornya.</li>
                    <li>Status otomatis berubah ke <span className="font-semibold">Diproses</span>, dan menjadi
                      <span className="font-semibold"> Selesai</span> begitu pembayaran lunas.</li>
                  </ol>
                </div>
              )}

              {isEditingResi ? (
                <form onSubmit={handleSaveResi} className="space-y-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Input No. Resi / AWB (Bukti Dikirim)</label>
                    <input
                      type="text"
                      required
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Masukkan No. Resi..."
                      className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resiLoading}
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-200/40"
                  >
                    {resiLoading ? 'Menyimpan...' : 'Simpan No. Resi'}
                  </button>
                </form>
              ) : (
                <div className="space-y-2 text-xs text-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">No. Resi / AWB</span>
                    <span className="font-mono font-bold text-teal-600">{salesOrder.tracking_number || 'Belum Diisi'}</span>
                  </div>
                  {salesOrder.tracking_number && (
                    <a
                      href={`/sales-orders/${salesOrder.id}/label`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-white hover:bg-teal-50 text-teal-700 border border-teal-400 hover:border-teal-500 text-xs font-bold transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
                      </svg>
                      Cetak Label Resi / AWB
                    </a>
                  )}
                  {salesOrder.recipient_name && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Penerima</span>
                      <span className="font-semibold">{salesOrder.recipient_name}</span>
                    </div>
                  )}
                  {salesOrder.customer_phone && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">No. Telp</span>
                      <span className="font-mono">{salesOrder.customer_phone}</span>
                    </div>
                  )}
                  {salesOrder.shipping_address && (
                    <div className="border-t border-gray-200 pt-2 text-gray-500 text-[11px] leading-relaxed">
                      📍 {salesOrder.shipping_address} {salesOrder.city ? `, ${salesOrder.city}` : ''} {salesOrder.province ? `, ${salesOrder.province}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Audit Log Card */}
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-3">

              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Informasi Audit</h3>
              <div className="space-y-2.5 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Dibuat Oleh</span>
                  <span className="text-gray-800 font-medium">{salesOrder.creator?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal Dibuat</span>
                  <span className="text-gray-800 font-medium">
                    {new Date(salesOrder.created_at).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-50 backdrop-blur-sm" onClick={() => setDeleteConfirmOpen(false)} />
          <div className="relative bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-rose-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-gray-900 font-semibold">Konfirmasi Hapus</h3>
                <p className="text-gray-500 text-xs">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>
            <p className="text-gray-700 text-sm mb-6">
              Hapus Sales Order <span className="font-bold text-gray-900">{salesOrder.so_number}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-all"
                disabled={loading}
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-200/40"
                disabled={loading}
              >
                {loading ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
