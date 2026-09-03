import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Order {
    id: number;
    marketplace: string;
    external_order_id: string;
    external_order_number: string | null;
    internal_status: string;
    workflow_status: string;
    conversion_status: string;
    customer_name: string | null;
    tracking_number: string | null;
    courier_name: string | null;
    total_amount: string;
    order_date: string;
    account: { id: number; account_name: string };
    warehouse: { id: number; name: string } | null;
    sales_order: { id: number; so_number: string } | null;
}

interface Account { id: number; account_name: string; marketplace: string; }
interface Warehouse { id: number; name: string; }

interface Props {
    orders: { data: Order[]; current_page: number; last_page: number; total: number; };
    accounts: Account[];
    warehouses: Warehouse[];
    filters: Record<string, string>;
    internalStatuses: string[];
    workflowStatuses: string[];
    conversionStatuses: string[];
}

const STATUS_COLORS: Record<string, string> = {
    pending:            'bg-orange-50 text-orange-600',
    paid:               'bg-blue-500/20 text-blue-400',
    processing:         'bg-teal-500/20 text-teal-400',
    shipped:            'bg-sky-500/20 text-sky-400',
    completed:          'bg-emerald-500/20 text-emerald-400',
    cancelled:          'bg-red-500/20 text-red-400',
    returned:           'bg-rose-500/20 text-rose-400',
    failed:             'bg-red-700/20 text-red-500',
};

const WORKFLOW_COLORS: Record<string, string> = {
    pending:              'bg-gray-200/50 text-gray-500',
    ready_to_process:     'bg-blue-500/20 text-blue-400',
    converted_to_so:      'bg-cyan-500/20 text-cyan-400',
    stock_reserved:       'bg-teal-500/20 text-teal-400',
    processing:           'bg-orange-50 text-orange-600',
    shipped:              'bg-sky-500/20 text-sky-400',
    completed:            'bg-emerald-500/20 text-emerald-400',
    cancelled:            'bg-red-500/20 text-red-400',
    failed:               'bg-red-700/20 text-red-500',
    stock_insufficient:   'bg-rose-500/20 text-rose-400',
    mapping_required:     'bg-orange-50 text-orange-600',
};

const WORKFLOW_LABELS: Record<string, string> = {
    pending:              'Pending',
    ready_to_process:     'Siap Proses',
    converted_to_so:      'Konversi SO',
    stock_reserved:       'Stok Reserved',
    processing:           'Diproses',
    shipped:              'Dikirim',
    completed:            'Selesai',
    cancelled:            'Dibatalkan',
    failed:               'Gagal',
    stock_insufficient:   'Stok Kurang',
    mapping_required:     'Perlu Mapping',
};

const CONV_COLORS: Record<string, string> = {
    not_converted: 'bg-gray-200/50 text-gray-500',
    ready:         'bg-blue-500/20 text-blue-400',
    converted:     'bg-emerald-500/20 text-emerald-400',
    failed:        'bg-red-500/20 text-red-400',
};

const CONV_LABELS: Record<string, string> = {
    not_converted: 'Belum Siap',
    ready:         'Siap Konversi',
    converted:     'Sudah Konversi',
    failed:        'Gagal',
};

const MP_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok_shop: 'TikTok' };
const MP_COLORS: Record<string, string> = { shopee: 'text-orange-600', tiktok_shop: 'text-pink-400' };

export default function MarketplaceOrdersIndex({
    orders, accounts, warehouses, filters,
    internalStatuses, workflowStatuses, conversionStatuses,
}: Props) {
    const [localFilters, setLocalFilters] = useState({ ...filters });
    const { props } = usePage<{ flash?: { success?: string; error?: string } }>();
    const flash = props.flash ?? {};

    const applyFilters = () => {
        router.get('/marketplace/orders', localFilters as Record<string, string>, { preserveState: true });
    };

    const resetFilters = () => {
        const empty = {} as Record<string, string>;
        setLocalFilters(empty);
        router.get('/marketplace/orders', {}, { preserveState: false });
    };

    const fmt = (v: string) => Number(v).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

    const activeFilterCount = Object.values(localFilters).filter(v => v && v !== '').length;

    return (
        <AppLayout>
            <Head title="Order Marketplace" />
            <div className="min-h-screen bg-white p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Order Marketplace</h1>
                        <p className="text-gray-500 text-sm mt-1">Pesanan penjualan dari Shopee &amp; TikTok Shop (Manual Excel &amp; API)</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {activeFilterCount > 0 && (
                            <button onClick={resetFilters}
                                className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 border border-gray-300 rounded-lg transition-colors cursor-pointer">
                                Reset Filter ({activeFilterCount})
                            </button>
                        )}
                        <Link
                            href="/sales-orders/marketplace/import"
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition-all cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                            Import Excel (Shopee / TikTok)
                        </Link>
                    </div>
                </div>

                {flash.success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{flash.success}</div>}
                {flash.error   && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{flash.error}</div>}

                {/* Filters */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4 mb-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <input type="text" placeholder="Cari order / nomor resi..."
                            value={localFilters.search ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, search: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-teal-500" />

                        <select value={localFilters.account_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, account_id: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Akun</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                        </select>

                        <select value={localFilters.workflow_status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, workflow_status: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Workflow</option>
                            {workflowStatuses.map(s => <option key={s} value={s}>{WORKFLOW_LABELS[s] ?? s}</option>)}
                        </select>

                        <select value={localFilters.conversion_status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, conversion_status: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Konversi</option>
                            {conversionStatuses.map(s => <option key={s} value={s}>{CONV_LABELS[s] ?? s}</option>)}
                        </select>

                        <select value={localFilters.internal_status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, internal_status: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Status API</option>
                            {internalStatuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </select>

                        <select value={localFilters.warehouse_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, warehouse_id: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500">
                            <option value="">Semua Gudang</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>

                        <input type="date" value={localFilters.date_from ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, date_from: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500" />

                        <input type="date" value={localFilters.date_to ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, date_to: e.target.value }))}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-teal-500" />
                    </div>
                    <div className="flex justify-end mt-3">
                        <button onClick={applyFilters}
                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl transition-colors text-sm font-medium shadow-lg shadow-teal-200/40">
                            Terapkan Filter
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl overflow-hidden">
                    {orders.data.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-gray-500">Tidak ada order ditemukan.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-300">
                                    {['Order ID', 'Platform', 'Pelanggan', 'Gudang', 'No Resi / Kurir', 'Total', 'Workflow', 'Konversi', 'Aksi'].map(h => (
                                        <th key={h} className="text-left px-4 py-4 text-gray-500 text-xs font-medium uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/50">
                                {orders.data.map(order => (
                                    <tr key={order.id} className="hover:bg-gray-100/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="text-gray-900 text-xs font-mono">{order.external_order_id}</p>
                                            {order.external_order_number && (
                                                <p className="text-gray-400 text-xs">{order.external_order_number}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-medium ${MP_COLORS[order.marketplace] ?? 'text-gray-500'}`}>
                                                {MP_LABELS[order.marketplace] ?? order.marketplace}
                                            </span>
                                            <p className="text-gray-400 text-xs">{order.account.account_name}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 text-sm">{order.customer_name ?? '-'}</td>
                                        <td className="px-4 py-3">
                                            {order.warehouse
                                                ? <span className="text-gray-700 text-xs">{order.warehouse.name}</span>
                                                : <span className="text-gray-400 text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-gray-900 text-xs font-mono">{order.tracking_number ?? '—'}</p>
                                            {order.courier_name && <p className="text-gray-500 text-xs">{order.courier_name}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-900 text-sm font-medium">{fmt(order.total_amount)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WORKFLOW_COLORS[order.workflow_status] ?? 'bg-gray-200 text-gray-700'}`}>
                                                {WORKFLOW_LABELS[order.workflow_status] ?? order.workflow_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {order.sales_order ? (
                                                <Link href={`/sales-orders/${order.sales_order.id}`}
                                                    className="text-xs text-teal-400 hover:text-teal-600 font-mono font-medium">
                                                    {order.sales_order.so_number}
                                                </Link>
                                            ) : (
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${CONV_COLORS[order.conversion_status] ?? 'bg-gray-200 text-gray-500'}`}>
                                                    {CONV_LABELS[order.conversion_status] ?? order.conversion_status}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/marketplace/orders/${order.id}`}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 rounded-lg transition-colors text-xs">
                                                Detail
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {orders.last_page > 1 && (
                        <div className="px-5 py-4 border-t border-gray-300 flex items-center justify-between">
                            <p className="text-gray-500 text-sm">Total {orders.total} order</p>
                            <div className="flex items-center gap-2">
                                {orders.current_page > 1 && (
                                    <Link href={`/marketplace/orders?page=${orders.current_page - 1}`}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">&laquo;</Link>
                                )}
                                <span className="text-gray-500 text-sm">{orders.current_page} / {orders.last_page}</span>
                                {orders.current_page < orders.last_page && (
                                    <Link href={`/marketplace/orders?page=${orders.current_page + 1}`}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">&raquo;</Link>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
