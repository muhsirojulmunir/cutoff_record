import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Product { id: number; name: string; sku: string; }
interface OrderItem {
    id: number; external_sku: string | null; product_name: string;
    product_sku?: string | null;
    quantity: number; unit_price: string; subtotal: string;
    product: Product | null;
    raw_payload?: { variation_name?: string } | null;
}
interface StockReservation {
    id: number; quantity: number; status: string;
    reserved_at: string; released_at: string | null; consumed_at: string | null;
    product: Product | null;
}
interface SalesOrder {
    id: number; so_number: string; status: string; grand_total: string;
    estimated_payout?: string | number | null;
    admin_fee?: string | number | null;
    other_fee?: string | number | null;
    shipping_cost?: string | number | null;
    discount_amount?: string | number | null;
    invoice: { id: number; invoice_number: string; status: string; } | null;
}
interface Warehouse { id: number; name: string; }
interface Account { id: number; account_name: string; marketplace: string; }
interface TimelineEvent { label: string; at: string | null; done: boolean; }

interface Order {
    id: number;
    marketplace: string;
    external_order_id: string;
    external_order_number: string | null;
    internal_status: string;
    workflow_status: string;
    conversion_status: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    shipping_address: string | null;
    province: string | null;
    city: string | null;
    district: string | null;
    postal_code: string | null;
    tracking_number: string | null;
    courier_name: string | null;
    subtotal: string;
    discount: string;
    voucher_discount: string;
    shipping_fee: string;
    service_fee: string;
    tax: string;
    total_amount: string;
    order_date: string;
    shipped_at: string | null;
    completed_at: string | null;
    converted_at: string | null;
    items: OrderItem[];
    sales_order: SalesOrder | null;
    warehouse: Warehouse | null;
    account: Account;
    stock_reservations: StockReservation[];
    raw_payload?: {
        estimated_payout?: number;
        grand_total?: number;
        admin_fee?: number;
        service_fee?: number;
        other_fee?: number;
        voucher_discount?: number;
        fee_details?: {
            platform_fee?: number;
            service_fee?: number;
            extra_shipping_fee?: number;
            promo_fee?: number;
            voucher_subsidy?: number;
        };
    } | null;
}

interface Props {
    order: Order;
    canViewPayload: boolean;
    timeline: TimelineEvent[];
}

const WORKFLOW_COLORS: Record<string, string> = {
    pending:            'bg-gray-200/50 text-gray-500',
    ready_to_process:   'bg-blue-500/20 text-blue-400',
    converted_to_so:    'bg-cyan-500/20 text-cyan-400',
    stock_reserved:     'bg-teal-500/20 text-teal-400',
    processing:         'bg-orange-50 text-orange-600',
    shipped:            'bg-sky-500/20 text-sky-400',
    completed:          'bg-emerald-500/20 text-emerald-400',
    cancelled:          'bg-red-500/20 text-red-400',
    failed:             'bg-red-700/20 text-red-500',
    stock_insufficient: 'bg-rose-500/20 text-rose-400',
    mapping_required:   'bg-orange-50 text-orange-600',
};

const WORKFLOW_LABELS: Record<string, string> = {
    pending:            'Pending',
    ready_to_process:   'Siap Diproses',
    converted_to_so:    'Dikonversi ke SO',
    stock_reserved:     'Stok Di-Reserve',
    processing:         'Dalam Proses',
    shipped:            'Dikirim',
    completed:          'Selesai',
    cancelled:          'Dibatalkan',
    failed:             'Gagal',
    stock_insufficient: 'Stok Tidak Cukup',
    mapping_required:   'Perlu Mapping SKU',
};

const RESERVE_STATUS_COLORS: Record<string, string> = {
    reserved:  'text-teal-400',
    released:  'text-gray-500',
    consumed:  'text-emerald-400',
    cancelled: 'text-red-400',
};

const MP_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok_shop: 'TikTok Shop' };

const fmt = (v: string | number) => Number(v).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fmtDate = (v: string | null) => v ? new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

interface FulfillModalProps {
    order: Order;
    onClose: () => void;
}

function FulfillModal({ order, onClose }: FulfillModalProps) {
    const [form, setForm] = useState({ tracking_number: order.tracking_number ?? '', courier_name: order.courier_name ?? '' });
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        router.post(`/marketplace/orders/${order.id}/fulfill`, form);
        onClose();
    };
    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-gray-50 border border-gray-300 rounded-2xl p-6 w-full max-w-md">
                <h3 className="text-gray-900 font-semibold mb-4">Proses Fulfillment / Kirim Order</h3>
                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="block text-gray-500 text-xs mb-1">Nomor Resi</label>
                        <input type="text" value={form.tracking_number}
                            onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-teal-500"
                            placeholder="Masukkan nomor resi pengiriman" />
                    </div>
                    <div>
                        <label className="block text-gray-500 text-xs mb-1">Nama Kurir</label>
                        <input type="text" value={form.courier_name}
                            onChange={e => setForm(f => ({ ...f, courier_name: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-teal-500"
                            placeholder="JNE / J&T / SiCepat / dll" />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-2 bg-gray-200 hover:bg-slate-600 text-gray-900 rounded-xl text-sm transition-colors">
                            Batal
                        </button>
                        <button type="submit"
                            className="flex-1 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-teal-200/40">
                            Kirim & Potong Stok
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function MarketplaceOrderShow({ order, canViewPayload, timeline }: Props) {
    const { props } = usePage<{ flash?: { success?: string; error?: string } }>();
    const flash = props.flash ?? {};
    const [showFulfill, setShowFulfill] = useState(false);

    const canConvert     = order.conversion_status !== 'converted' && order.internal_status !== 'cancelled';
    const canReserve     = order.conversion_status === 'converted' && order.workflow_status !== 'stock_reserved' && order.workflow_status !== 'shipped' && order.workflow_status !== 'completed';
    const hasActiveRes   = order.stock_reservations.some(r => r.status === 'reserved');
    const canFulfill     = order.conversion_status === 'converted' && order.workflow_status !== 'shipped' && order.workflow_status !== 'completed' && order.internal_status !== 'cancelled';

    const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
    const toggleDetail = (key: string) => setOpenDetails(p => ({ ...p, [key]: !p[key] }));

    // Nilai rincian keuangan
    const subtotal = Number(order.subtotal || 0);
    const shippingFee = Number(order.shipping_fee || order.sales_order?.shipping_cost || 0);
    const voucherDiscount = Number(order.voucher_discount || order.discount || order.sales_order?.discount_amount || 0);

    // Estimasi total penghasilan bersih yang dilepaskan marketplace
    const estimatedPayout = Number(
        order.sales_order?.estimated_payout ||
        order.raw_payload?.estimated_payout ||
        order.total_amount || 0
    );

    // Detail potongan biaya marketplace
    const rawFeeDetails = order.raw_payload?.fee_details;
    const rawPlatformFee = Number(order.raw_payload?.admin_fee || order.sales_order?.admin_fee || rawFeeDetails?.platform_fee || 0);
    const rawServiceFee = Number(order.service_fee || order.raw_payload?.service_fee || rawFeeDetails?.service_fee || 0);
    const rawExtraShippingFee = Number(rawFeeDetails?.extra_shipping_fee || 0);
    const rawPromoFee = Number(order.raw_payload?.other_fee || order.sales_order?.other_fee || rawFeeDetails?.promo_fee || 0);

    // Hitung selisih biaya platform jika belum terinci terpisah
    let platformFee = rawPlatformFee;
    let serviceFee = rawServiceFee;
    let extraShippingFee = rawExtraShippingFee;
    let promoFee = rawPromoFee;

    const totalKnownDeduction = platformFee + serviceFee + extraShippingFee + promoFee;
    const expectedDeductions = Math.max(0, (subtotal + shippingFee - voucherDiscount) - estimatedPayout);

    if (totalKnownDeduction === 0 && expectedDeductions > 0 && estimatedPayout > 0) {
        platformFee = expectedDeductions;
    }

    return (
        <AppLayout>
            <Head title={`Order ${order.external_order_id}`} />
            {showFulfill && <FulfillModal order={order} onClose={() => setShowFulfill(false)} />}

            <div className="min-h-screen bg-white p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <Link href="/marketplace/orders" className="text-gray-400 text-sm hover:text-gray-700 transition-colors mb-1 inline-block">
                            ← Kembali ke Daftar Order
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-900 font-mono">{order.external_order_id}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-gray-500 text-sm">{MP_LABELS[order.marketplace] ?? order.marketplace}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-500 text-sm">{order.account.account_name}</span>
                            <span className="text-gray-400">•</span>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WORKFLOW_COLORS[order.workflow_status] ?? 'bg-gray-200 text-gray-700'}`}>
                                {WORKFLOW_LABELS[order.workflow_status] ?? order.workflow_status}
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {canConvert && (
                            <button id="btn-convert-so"
                                onClick={() => router.post(`/marketplace/orders/${order.id}/convert`, {})}
                                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm rounded-xl transition-colors font-medium shadow-lg shadow-teal-200/40">
                                Konversi ke Sales Order
                            </button>
                        )}
                        {canReserve && (
                            <button id="btn-reserve-stock"
                                onClick={() => router.post(`/marketplace/orders/${order.id}/reserve-stock`, {})}
                                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm rounded-xl transition-colors font-medium shadow-lg shadow-teal-200/40">
                                Reserve Stok
                            </button>
                        )}
                        {hasActiveRes && (
                            <button id="btn-release-stock"
                                onClick={() => router.post(`/marketplace/orders/${order.id}/release-stock`, {})}
                                className="px-4 py-2 bg-gray-200 hover:bg-slate-600 text-gray-900 text-sm rounded-xl transition-colors">
                                Release Reservasi
                            </button>
                        )}
                        {canFulfill && (
                            <button id="btn-fulfill"
                                onClick={() => setShowFulfill(true)}
                                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm rounded-xl transition-colors font-medium shadow-lg shadow-teal-200/40">
                                Proses Fulfillment
                            </button>
                        )}
                    </div>
                </div>

                {flash.success && <div className="mb-5 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{flash.success}</div>}
                {flash.error   && <div className="mb-5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{flash.error}</div>}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Order Info */}
                        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                            <h2 className="text-gray-900 font-semibold mb-4">Informasi Order</h2>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Nomor Pesanan', value: order.external_order_number ?? order.external_order_id },
                                    { label: 'Tanggal Order', value: fmtDate(order.order_date) },
                                    { label: 'Platform', value: MP_LABELS[order.marketplace] ?? order.marketplace },
                                    { label: 'Akun', value: order.account.account_name },
                                    { label: 'Status API', value: order.internal_status },
                                    { label: 'Gudang', value: order.warehouse?.name ?? '—' },
                                ].map(({ label, value }) => (
                                    <div key={label}>
                                        <p className="text-gray-400 text-xs">{label}</p>
                                        <p className="text-gray-900 text-sm mt-0.5 capitalize">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Informasi Pembayaran Card (Sesuai Rincian Marketplace Shopee & TikTok) */}
                        <div className="bg-white border border-gray-300 rounded-2xl overflow-hidden shadow-sm">
                            {/* Card Header */}
                            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 text-sm shadow-sm">
                                        💳
                                    </span>
                                    <div>
                                        <h2 className="text-gray-900 font-bold text-base">Informasi Pembayaran</h2>
                                        <p className="text-gray-500 text-xs mt-0.5">Rincian produk, potongan platform, dan estimasi pelepasan dana {MP_LABELS[order.marketplace] ?? order.marketplace}</p>
                                    </div>
                                </div>
                                {order.sales_order && (
                                    <Link
                                        href={`/sales-orders/${order.sales_order.id}`}
                                        className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 transition-colors"
                                    >
                                        Lihat Sales Order &rarr;
                                    </Link>
                                )}
                            </div>

                            {/* Item Products Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200 bg-gray-50/70 text-gray-500 text-[11px] font-bold uppercase tracking-wider">
                                            <th className="text-center w-12 px-4 py-3">No.</th>
                                            <th className="text-left px-4 py-3">Produk</th>
                                            <th className="text-right px-4 py-3">Harga Satuan</th>
                                            <th className="text-center px-4 py-3">Jumlah</th>
                                            <th className="text-right px-4 py-3">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {order.items.map((item, idx) => {
                                            const varName = item.raw_payload?.variation_name;
                                            return (
                                                <tr key={item.id} className="hover:bg-gray-50/40 transition-colors">
                                                    <td className="text-center px-4 py-4 text-xs font-medium text-gray-400">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400 overflow-hidden">
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                                                                </svg>
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-gray-900 font-semibold text-sm leading-snug">{item.product_name}</p>
                                                                {varName && (
                                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                                        <span className="font-medium text-gray-600">Variasi:</span> {varName}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                                        Kode: {item.product_sku || item.external_sku || '—'}
                                                                    </span>
                                                                    {item.product ? (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                            Mapped: {item.product.sku}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                                            Belum Di-map
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-right px-4 py-4 text-xs font-semibold text-gray-800">
                                                        {fmt(item.unit_price)}
                                                    </td>
                                                    <td className="text-center px-4 py-4 text-xs font-medium text-gray-600">
                                                        {item.quantity}
                                                    </td>
                                                    <td className="text-right px-4 py-4 text-sm font-bold text-gray-900">
                                                        {fmt(item.subtotal)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Rincian Pemotongan & Estimasi Penghasilan (Sesuai Screenshot) */}
                            <div className="p-6 bg-gray-50/70 border-t border-gray-200 flex flex-col items-end">
                                <div className="w-full max-w-md space-y-2.5">
                                    {/* Subtotal Pesanan */}
                                    <div className="flex items-center justify-between text-xs">
                                        <button
                                            type="button"
                                            onClick={() => toggleDetail('subtotal')}
                                            className="text-gray-600 font-medium hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                        >
                                            <span>Subtotal Pesanan</span>
                                            <span className="text-gray-400 text-[10px]">{openDetails['subtotal'] ? '▲' : '▼'}</span>
                                        </button>
                                        <span className="font-semibold text-gray-900">{fmt(subtotal)}</span>
                                    </div>
                                    {openDetails['subtotal'] && (
                                        <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                            Total nilai produk sebelum potongan dan biaya platform.
                                        </p>
                                    )}

                                    {/* Estimasi Subtotal Ongkos Kirim */}
                                    <div className="flex items-center justify-between text-xs">
                                        <button
                                            type="button"
                                            onClick={() => toggleDetail('shipping')}
                                            className="text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                        >
                                            <span>Estimasi Subtotal Ongkos Kirim</span>
                                            <span className="text-gray-400 text-[10px]">{openDetails['shipping'] ? '▲' : '▼'}</span>
                                        </button>
                                        <span className="font-semibold text-gray-700">{fmt(shippingFee)}</span>
                                    </div>
                                    {openDetails['shipping'] && (
                                        <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                            Ongkos kirim pesanan dibayar pembeli / disubsidi platform.
                                        </p>
                                    )}

                                    {/* Voucher & Subsidi */}
                                    {voucherDiscount > 0 && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDetail('voucher')}
                                                    className="text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span>Voucher &amp; Subsidi</span>
                                                    <span className="text-gray-400 text-[10px]">{openDetails['voucher'] ? '▲' : '▼'}</span>
                                                </button>
                                                <span className="font-semibold text-rose-600">-{fmt(voucherDiscount)}</span>
                                            </div>
                                            {openDetails['voucher'] && (
                                                <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                                    Diskon dan potongan voucher yang ditanggung penjual.
                                                </p>
                                            )}
                                        </>
                                    )}

                                    {/* Biaya Platform */}
                                    {platformFee > 0 && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDetail('platform')}
                                                    className="text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        Biaya Platform
                                                        <span className="text-gray-400 text-[11px]">🛈</span>
                                                    </span>
                                                    <span className="text-gray-400 text-[10px]">{openDetails['platform'] ? '▲' : '▼'}</span>
                                                </button>
                                                <span className="font-semibold text-rose-600">-{fmt(platformFee)}</span>
                                            </div>
                                            {openDetails['platform'] && (
                                                <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                                    Biaya administrasi dan komisi resmi platform {MP_LABELS[order.marketplace] ?? order.marketplace}.
                                                </p>
                                            )}
                                        </>
                                    )}

                                    {/* Biaya Gratis Ongkir XTRA (jika ada) */}
                                    {extraShippingFee > 0 && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDetail('extraShipping')}
                                                    className="text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        Biaya Gratis Ongkir XTRA
                                                        <span className="text-gray-400 text-[11px]">🛈</span>
                                                    </span>
                                                    <span className="text-gray-400 text-[10px]">{openDetails['extraShipping'] ? '▲' : '▼'}</span>
                                                </button>
                                                <span className="font-semibold text-rose-600">-{fmt(extraShippingFee)}</span>
                                            </div>
                                            {openDetails['extraShipping'] && (
                                                <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                                    Biaya keikutsertaan program Gratis Ongkir XTRA marketplace.
                                                </p>
                                            )}
                                        </>
                                    )}

                                    {/* Biaya Layanan */}
                                    {serviceFee > 0 && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDetail('service')}
                                                    className="text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        Biaya Layanan
                                                        <span className="text-gray-400 text-[11px]">🛈</span>
                                                    </span>
                                                    <span className="text-gray-400 text-[10px]">{openDetails['service'] ? '▲' : '▼'}</span>
                                                </button>
                                                <span className="font-semibold text-rose-600">-{fmt(serviceFee)}</span>
                                            </div>
                                            {openDetails['service'] && (
                                                <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                                    Biaya layanan pemrosesan transaksi dari platform marketplace.
                                                </p>
                                            )}
                                        </>
                                    )}

                                    {/* Biaya Promosi / Lainnya */}
                                    {promoFee > 0 && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDetail('promo')}
                                                    className="text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        Biaya Promosi
                                                        <span className="text-gray-400 text-[11px]">🛈</span>
                                                    </span>
                                                    <span className="text-gray-400 text-[10px]">{openDetails['promo'] ? '▲' : '▼'}</span>
                                                </button>
                                                <span className="font-semibold text-rose-600">-{fmt(promoFee)}</span>
                                            </div>
                                            {openDetails['promo'] && (
                                                <p className="text-[11px] text-gray-400 pl-2 pb-1 border-l-2 border-gray-300">
                                                    Biaya program promosi atau afiliasi penjual.
                                                </p>
                                            )}
                                        </>
                                    )}

                                    {/* Subtotal Biaya Layanan Tambahan */}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-400">Subtotal Biaya Layanan Tambahan</span>
                                        <span className="font-medium text-gray-400">{fmt(0)}</span>
                                    </div>

                                    {/* Estimasi Total Penghasilan */}
                                    <div className="pt-3 border-t-2 border-gray-200 flex items-baseline justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-bold text-gray-900">Estimasi Total Penghasilan</span>
                                            <span className="text-gray-400 cursor-help text-xs" title="Total dana bersih yang akan dilepaskan marketplace ke saldo rekening seller setelah dipotong semua biaya">🛈</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-2xl font-black text-orange-600 tracking-tight">
                                                {fmt(estimatedPayout)}
                                            </span>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Pelepasan dana bersih ke saldo toko</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stock Reservations */}
                        {order.stock_reservations.length > 0 && (
                            <div className="bg-gray-50 border border-gray-300 rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-300">
                                    <h2 className="text-gray-900 font-semibold">Reservasi Stok</h2>
                                </div>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-300">
                                            {['Produk', 'Qty', 'Status', 'Waktu Reserved', 'Waktu Consume/Release'].map(h => (
                                                <th key={h} className="text-left px-5 py-3 text-gray-500 text-xs font-medium">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200/50">
                                        {order.stock_reservations.map(r => (
                                            <tr key={r.id}>
                                                <td className="px-5 py-3">
                                                    <p className="text-gray-900 text-sm">{r.product?.name ?? '—'}</p>
                                                    <p className="text-gray-400 text-xs">{r.product?.sku}</p>
                                                </td>
                                                <td className="px-5 py-3 text-gray-700 text-sm">{r.quantity}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`text-xs font-medium capitalize ${RESERVE_STATUS_COLORS[r.status] ?? 'text-gray-500'}`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(r.reserved_at)}</td>
                                                <td className="px-5 py-3 text-gray-500 text-xs">
                                                    {fmtDate(r.consumed_at ?? r.released_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Right Column */}
                    <div className="space-y-5">
                        {/* Timeline */}
                        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                            <h2 className="text-gray-900 font-semibold mb-4">Timeline Proses</h2>
                            <ol className="relative border-l border-gray-300 pl-4 space-y-4">
                                {timeline.map((event, i) => (
                                    <li key={i} className="relative">
                                        <span className={`absolute -left-[21px] top-0.5 w-3 h-3 rounded-full border-2 ${
                                            event.done
                                                ? 'bg-emerald-500 border-emerald-500'
                                                : 'bg-gray-100 border-gray-400'
                                        }`} />
                                        <p className={`text-sm font-medium ${event.done ? 'text-gray-900' : 'text-gray-400'}`}>
                                            {event.label}
                                        </p>
                                        {event.at && event.done && (
                                            <p className="text-xs text-gray-400">{fmtDate(event.at)}</p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>

                        {/* Sales Order Traceability */}
                        {order.sales_order && (
                            <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                                <h2 className="text-gray-900 font-semibold mb-4">Sales Order Terhubung</h2>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 text-sm">Nomor SO</span>
                                        <Link href={`/sales-orders/${order.sales_order.id}`}
                                            className="text-teal-400 hover:text-teal-600 text-sm font-mono font-medium">
                                            {order.sales_order.so_number}
                                        </Link>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 text-sm">Status SO</span>
                                        <span className="text-gray-700 text-sm capitalize">{order.sales_order.status}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 text-sm">Grand Total</span>
                                        <span className="text-gray-900 text-sm font-medium">{fmt(order.sales_order.grand_total)}</span>
                                    </div>
                                    {order.sales_order.invoice && (
                                        <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                                            <span className="text-gray-500 text-sm">Invoice</span>
                                            <Link href={`/invoices/${order.sales_order.invoice.id}`}
                                                className="text-sky-400 hover:text-sky-300 text-sm font-mono">
                                                {order.sales_order.invoice.invoice_number}
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pengiriman */}
                        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                            <h2 className="text-gray-900 font-semibold mb-4">Informasi Pengiriman</h2>
                            <div className="space-y-2">
                                {[
                                    { label: 'No. Resi', value: order.tracking_number ?? '—' },
                                    { label: 'Kurir', value: order.courier_name ?? '—' },
                                    { label: 'Dikirim', value: fmtDate(order.shipped_at) },
                                    { label: 'Selesai', value: fmtDate(order.completed_at) },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex justify-between">
                                        <span className="text-gray-500 text-sm">{label}</span>
                                        <span className="text-gray-700 text-sm font-mono">{value}</span>
                                    </div>
                                ))}
                                {(order.province || order.city || order.district) && (
                                    <div className="pt-2 border-t border-gray-300">
                                        <p className="text-gray-500 text-xs mb-1">Alamat Pengiriman</p>
                                        <p className="text-gray-700 text-sm">{order.shipping_address}</p>
                                        <p className="text-gray-500 text-xs mt-1">
                                            {[order.district, order.city, order.province, order.postal_code].filter(Boolean).join(', ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Customer */}
                        <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                            <h2 className="text-gray-900 font-semibold mb-4">Pelanggan</h2>
                            <div className="space-y-2">
                                {[
                                    { label: 'Nama', value: order.customer_name ?? '—' },
                                    { label: 'Telepon', value: order.customer_phone ?? '—' },
                                    { label: 'Email', value: order.customer_email ?? '—' },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex justify-between">
                                        <span className="text-gray-500 text-sm">{label}</span>
                                        <span className="text-gray-700 text-sm">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
