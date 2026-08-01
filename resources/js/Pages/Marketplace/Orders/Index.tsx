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
    pending:            'bg-amber-500/20 text-amber-400',
    paid:               'bg-blue-500/20 text-blue-400',
    processing:         'bg-violet-500/20 text-violet-400',
    shipped:            'bg-sky-500/20 text-sky-400',
    completed:          'bg-emerald-500/20 text-emerald-400',
    cancelled:          'bg-red-500/20 text-red-400',
    returned:           'bg-rose-500/20 text-rose-400',
    failed:             'bg-red-700/20 text-red-500',
};

const WORKFLOW_COLORS: Record<string, string> = {
    pending:              'bg-slate-700/50 text-slate-400',
    ready_to_process:     'bg-blue-500/20 text-blue-400',
    converted_to_so:      'bg-indigo-500/20 text-indigo-400',
    stock_reserved:       'bg-violet-500/20 text-violet-400',
    processing:           'bg-amber-500/20 text-amber-400',
    shipped:              'bg-sky-500/20 text-sky-400',
    completed:            'bg-emerald-500/20 text-emerald-400',
    cancelled:            'bg-red-500/20 text-red-400',
    failed:               'bg-red-700/20 text-red-500',
    stock_insufficient:   'bg-rose-500/20 text-rose-400',
    mapping_required:     'bg-orange-500/20 text-orange-400',
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
    not_converted: 'bg-slate-700/50 text-slate-400',
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
const MP_COLORS: Record<string, string> = { shopee: 'text-orange-400', tiktok_shop: 'text-pink-400' };

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
            <div className="min-h-screen bg-slate-950 p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Order Marketplace</h1>
                        <p className="text-slate-400 text-sm mt-1">Staging & fulfillment order dari Shopee & TikTok Shop</p>
                    </div>
                    {activeFilterCount > 0 && (
                        <button onClick={resetFilters}
                            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 border border-slate-700 rounded-lg transition-colors">
                            Reset Filter ({activeFilterCount})
                        </button>
                    )}
                </div>

                {flash.success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">{flash.success}</div>}
                {flash.error   && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{flash.error}</div>}

                {/* Filters */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <input type="text" placeholder="Cari order / nomor resi..."
                            value={localFilters.search ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, search: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500" />

                        <select value={localFilters.account_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, account_id: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Akun</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                        </select>

                        <select value={localFilters.workflow_status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, workflow_status: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Workflow</option>
                            {workflowStatuses.map(s => <option key={s} value={s}>{WORKFLOW_LABELS[s] ?? s}</option>)}
                        </select>

                        <select value={localFilters.conversion_status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, conversion_status: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Konversi</option>
                            {conversionStatuses.map(s => <option key={s} value={s}>{CONV_LABELS[s] ?? s}</option>)}
                        </select>

                        <select value={localFilters.internal_status ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, internal_status: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Status API</option>
                            {internalStatuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </select>

                        <select value={localFilters.warehouse_id ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, warehouse_id: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500">
                            <option value="">Semua Gudang</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>

                        <input type="date" value={localFilters.date_from ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, date_from: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500" />

                        <input type="date" value={localFilters.date_to ?? ''}
                            onChange={e => setLocalFilters(f => ({ ...f, date_to: e.target.value }))}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-violet-500" />
                    </div>
                    <div className="flex justify-end mt-3">
                        <button onClick={applyFilters}
                            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors text-sm font-medium">
                            Terapkan Filter
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    {orders.data.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-slate-400">Tidak ada order ditemukan.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    {['Order ID', 'Platform', 'Pelanggan', 'Gudang', 'No Resi / Kurir', 'Total', 'Workflow', 'Konversi', 'Aksi'].map(h => (
                                        <th key={h} className="text-left px-4 py-4 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {orders.data.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="text-white text-xs font-mono">{order.external_order_id}</p>
                                            {order.external_order_number && (
                                                <p className="text-slate-500 text-xs">{order.external_order_number}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-medium ${MP_COLORS[order.marketplace] ?? 'text-slate-400'}`}>
                                                {MP_LABELS[order.marketplace] ?? order.marketplace}
                                            </span>
                                            <p className="text-slate-500 text-xs">{order.account.account_name}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300 text-sm">{order.customer_name ?? '-'}</td>
                                        <td className="px-4 py-3">
                                            {order.warehouse
                                                ? <span className="text-slate-300 text-xs">{order.warehouse.name}</span>
                                                : <span className="text-slate-600 text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-white text-xs font-mono">{order.tracking_number ?? '—'}</p>
                                            {order.courier_name && <p className="text-slate-400 text-xs">{order.courier_name}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-white text-sm font-medium">{fmt(order.total_amount)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WORKFLOW_COLORS[order.workflow_status] ?? 'bg-slate-700 text-slate-300'}`}>
                                                {WORKFLOW_LABELS[order.workflow_status] ?? order.workflow_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {order.sales_order ? (
                                                <Link href={`/sales-orders/${order.sales_order.id}`}
                                                    className="text-xs text-violet-400 hover:text-violet-300 font-mono font-medium">
                                                    {order.sales_order.so_number}
                                                </Link>
                                            ) : (
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${CONV_COLORS[order.conversion_status] ?? 'bg-slate-700 text-slate-400'}`}>
                                                    {CONV_LABELS[order.conversion_status] ?? order.conversion_status}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/marketplace/orders/${order.id}`}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors text-xs">
                                                Detail
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {orders.last_page > 1 && (
                        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
                            <p className="text-slate-400 text-sm">Total {orders.total} order</p>
                            <div className="flex items-center gap-2">
                                {orders.current_page > 1 && (
                                    <Link href={`/marketplace/orders?page=${orders.current_page - 1}`}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">&laquo;</Link>
                                )}
                                <span className="text-slate-400 text-sm">{orders.current_page} / {orders.last_page}</span>
                                {orders.current_page < orders.last_page && (
                                    <Link href={`/marketplace/orders?page=${orders.current_page + 1}`}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">&raquo;</Link>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
