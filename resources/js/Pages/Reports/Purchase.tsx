import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface TopSupplier { supplier_name: string; order_count: number; total_amount: number; }

interface Props {
    summary: {
        total_orders: number; total_amount: number;
        status_breakdown: Record<string, number>;
        top_suppliers: TopSupplier[];
    };
    filters: { date_from?: string; date_to?: string };
}

const fmt = (v: number) => 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function PurchaseReport({ summary, filters }: Props) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]     = useState(filters.date_to ?? '');

    const applyFilter = () => {
        router.get('/reports/purchase', { date_from: dateFrom, date_to: dateTo }, { preserveState: true });
    };

    return (
        <AppLayout>
            <Head title="Laporan Pembelian ERP" />
            <div className="min-h-screen bg-slate-950 p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link href="/dashboard" className="text-slate-500 text-xs hover:text-slate-300">← Kembali ke Dashboard</Link>
                        <h1 className="text-2xl font-bold text-white mt-1">Laporan Pembelian / Purchase Analytics</h1>
                        <p className="text-slate-400 text-sm">Analisis pengadaan barang, supplier, dan Purchase Order</p>
                    </div>
                </div>

                {/* Filter Date Range */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-violet-500" />
                        <span className="text-slate-500 text-xs">s/d</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-violet-500" />
                    </div>
                    <button onClick={applyFilter}
                        className="w-full sm:w-auto px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-medium transition-colors">
                        Terapkan Filter
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <p className="text-slate-400 text-xs font-medium">Total Nilai Pembelian (PO)</p>
                        <p className="text-2xl font-extrabold text-white mt-1">{fmt(summary.total_amount)}</p>
                        <p className="text-slate-500 text-xs mt-2">{summary.total_orders} Total Purchase Orders</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <h3 className="text-slate-400 text-xs font-medium mb-3">Status Purchase Order</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(summary.status_breakdown).map(([st, cnt]) => (
                                <div key={st} className="p-2 bg-slate-950 border border-slate-800 rounded-xl">
                                    <p className="text-slate-500 text-[10px] capitalize">{st}</p>
                                    <p className="text-sm font-bold text-white">{cnt}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Top Suppliers */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h2 className="text-white font-semibold text-sm mb-4">Supplier Dengan Volume Pembelian Terbesar</h2>
                    {summary.top_suppliers.length === 0 ? (
                        <p className="text-slate-500 text-xs py-6 text-center">Belum ada transaksi supplier.</p>
                    ) : (
                        <div className="space-y-3">
                            {summary.top_suppliers.map(s => (
                                <div key={s.supplier_name} className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-xl">
                                    <div>
                                        <p className="text-white text-sm font-medium">{s.supplier_name}</p>
                                        <p className="text-slate-500 text-xs">{s.order_count} Purchase Orders</p>
                                    </div>
                                    <p className="text-indigo-400 font-bold font-mono text-sm">{fmt(s.total_amount)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
