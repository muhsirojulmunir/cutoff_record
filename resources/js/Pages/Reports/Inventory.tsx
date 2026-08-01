import React from 'react';
import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface StockRow {
    id: number; sku: string; name: string; category_name: string;
    physical_stock: number; reserved_stock: number; available_stock: number;
    minimum_stock: number; status: string; unit: string;
}

interface Props {
    summary: {
        total_products: number; total_physical: number;
        total_reserved: number; available_stock: number;
        out_of_stock_count: number; low_stock_count: number;
    };
    overview: {
        data: StockRow[];
        current_page: number;
        last_page: number;
        total: number;
    };
    movements: {
        total_in: number; total_out: number;
        top_moved_out: { product_name: string; sku: string; total_qty: number }[];
    };
}

const STATUS_COLORS: Record<string, string> = {
    out_of_stock: 'bg-red-500/20 text-red-400 border-red-500/30',
    low_stock:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    normal:       'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    overstock:    'bg-sky-500/20 text-sky-400 border-sky-500/30',
};

const STATUS_LABELS: Record<string, string> = {
    out_of_stock: 'Stok Habis',
    low_stock:    'Stok Rendah',
    normal:       'Normal',
    overstock:    'Overstock',
};

export default function InventoryReport({ summary, overview, movements }: Props) {
    return (
        <AppLayout>
            <Head title="Laporan Inventory & Stok ERP" />
            <div className="min-h-screen bg-slate-950 p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link href="/dashboard" className="text-slate-500 text-xs hover:text-slate-300">← Kembali ke Dashboard</Link>
                        <h1 className="text-2xl font-bold text-white mt-1">Laporan Inventory &amp; Stok</h1>
                        <p className="text-slate-400 text-sm">Analisis fisik stok, reservasi order marketplace, dan available stock</p>
                    </div>

                    <a href="/reports/export/inventory"
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-2">
                        Export CSV
                    </a>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <p className="text-slate-400 text-xs">Total Physical Stock</p>
                        <p className="text-2xl font-extrabold text-white mt-1">{summary.total_physical}</p>
                        <p className="text-slate-500 text-xs mt-1">{summary.total_products} SKU Produk</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <p className="text-slate-400 text-xs">Reserved Stock</p>
                        <p className="text-2xl font-extrabold text-violet-400 mt-1">{summary.total_reserved}</p>
                        <p className="text-slate-500 text-xs mt-1">Di-reserve Marketplace</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <p className="text-slate-400 text-xs">Available Stock</p>
                        <p className="text-2xl font-extrabold text-emerald-400 mt-1">{summary.available_stock}</p>
                        <p className="text-slate-500 text-xs mt-1">Siap Dijual / Kirim</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <p className="text-slate-400 text-xs">Alert Stok</p>
                        <p className="text-2xl font-extrabold text-rose-400 mt-1">{summary.out_of_stock_count + summary.low_stock_count}</p>
                        <p className="text-slate-500 text-xs mt-1">{summary.out_of_stock_count} Habis, {summary.low_stock_count} Rendah</p>
                    </div>
                </div>

                {/* Stock Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-800">
                        <h2 className="text-white font-semibold text-sm">Status Stok Per Produk (Available = Physical - Reserved)</h2>
                    </div>
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-800">
                                {['SKU', 'Nama Produk', 'Kategori', 'Fisik', 'Reserved', 'Available', 'Status'].map(h => (
                                    <th key={h} className="text-left px-5 py-3.5 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {overview.data.map(p => (
                                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-5 py-3 font-mono text-xs text-white">{p.sku}</td>
                                    <td className="px-5 py-3 text-sm text-slate-200">{p.name}</td>
                                    <td className="px-5 py-3 text-xs text-slate-400">{p.category_name}</td>
                                    <td className="px-5 py-3 text-sm text-slate-300 font-mono">{p.physical_stock}</td>
                                    <td className="px-5 py-3 text-sm text-violet-400 font-mono">{p.reserved_stock}</td>
                                    <td className="px-5 py-3 text-sm text-emerald-400 font-bold font-mono">{p.available_stock}</td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-block px-2.5 py-0.5 border rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-slate-800 text-slate-300'}`}>
                                            {STATUS_LABELS[p.status] ?? p.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppLayout>
    );
}
