import React, { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface CashBank { id: number; account_name: string; account_type: string; account_number: string | null; bank_name: string | null; balance: number; total_in: number; total_out: number; }
interface ReceivableRow {
    id: number; invoice_number: string; due_date: string | null; grand_total: string; paid_amount: string; status: string;
    customer: { id: number; name: string; customer_code: string; } | null;
}
interface PayableRow {
    id: number; fp_number: string; amount: string; paid_amount: string; due_date: string | null; status: string;
    supplier: { id: number; name: string; } | null;
}

interface Props {
    summary: {
        total_receivables: number; overdue_receivables: number; unpaid_invoices_count: number; overdue_invoices_count: number;
        total_payables: number; total_cash_balance: number; petty_cash_approved: number; petty_cash_pending: number;
        estimated_revenue: number; estimated_cogs: number; operating_expenses: number; estimated_gross_profit: number;
    };
    receivables: { data: ReceivableRow[] };
    payables: { data: PayableRow[] };
    cashBank: CashBank[];
    filters: { date_from?: string; date_to?: string };
}

const fmt = (v: number | string) => 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function FinancialReport({ summary, receivables, payables, cashBank, filters }: Props) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]     = useState(filters.date_to ?? '');

    const applyFilter = () => {
        router.get('/reports/financial', { date_from: dateFrom, date_to: dateTo }, { preserveState: true });
    };

    return (
        <AppLayout>
            <Head title="Laporan Keuangan ERP" />
            <div className="min-h-screen bg-white p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <Link href="/dashboard" className="text-gray-400 text-xs hover:text-gray-700">← Kembali ke Dashboard</Link>
                        <h1 className="text-2xl font-bold text-gray-900 mt-1">Laporan Keuangan &amp; Ringkasan Kas</h1>
                        <p className="text-gray-500 text-sm">Piutang Customer, Hutang Pabrik, Saldo Kas &amp; Bank, serta Estimasi Laba Kotor</p>
                    </div>
                </div>

                {/* Filter Date Range */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-xs focus:outline-none focus:border-teal-500" />
                        <span className="text-gray-400 text-xs">s/d</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-xs focus:outline-none focus:border-teal-500" />
                    </div>
                    <button onClick={applyFilter}
                        className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-xs font-medium transition-colors shadow-lg shadow-teal-200/40">
                        Terapkan Filter
                    </button>
                </div>

                {/* Top Financial Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Total Piutang Customer</p>
                        <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmt(summary.total_receivables)}</p>
                        <p className="text-rose-400 text-xs mt-1">Overdue: {fmt(summary.overdue_receivables)}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Total Hutang Pabrik / Supplier</p>
                        <p className="text-2xl font-extrabold text-cyan-400 mt-1">{fmt(summary.total_payables)}</p>
                        <p className="text-gray-400 text-xs mt-1">Factory Receivable</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Total Saldo Kas &amp; Bank</p>
                        <p className="text-2xl font-extrabold text-emerald-400 mt-1">{fmt(summary.total_cash_balance)}</p>
                        <p className="text-gray-400 text-xs mt-1">{cashBank.length} Rekening Aktif</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                        <p className="text-gray-500 text-xs">Pengeluaran Petty Cash</p>
                        <p className="text-2xl font-extrabold text-orange-600 mt-1">{fmt(summary.petty_cash_approved)}</p>
                        <p className="text-gray-400 text-xs mt-1">Pending: {fmt(summary.petty_cash_pending)}</p>
                    </div>
                </div>

                {/* Estimated Gross Profit Explanation Box */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h2 className="text-gray-900 font-semibold text-sm">Estimasi Laba Kotor (Estimated Gross Profit)</h2>
                            <p className="text-gray-400 text-xs mt-0.5">Formula: Revenue - Purchase Cost (COGS) - Operating Expenses (Petty Cash)</p>
                        </div>
                        <span className="text-xs font-mono font-bold px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl">
                            {fmt(summary.estimated_gross_profit)}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-300 text-xs">
                        <div className="p-3 bg-white rounded-xl">
                            <span className="text-gray-500">Total Omset Sales Order</span>
                            <p className="text-gray-900 font-bold font-mono text-sm mt-1">{fmt(summary.estimated_revenue)}</p>
                        </div>
                        <div className="p-3 bg-white rounded-xl">
                            <span className="text-gray-500">Total Pembelian PO (COGS)</span>
                            <p className="text-rose-400 font-bold font-mono text-sm mt-1">-{fmt(summary.estimated_cogs)}</p>
                        </div>
                        <div className="p-3 bg-white rounded-xl">
                            <span className="text-gray-500">Total Beban Operasional Petty Cash</span>
                            <p className="text-orange-600 font-bold font-mono text-sm mt-1">-{fmt(summary.operating_expenses)}</p>
                        </div>
                    </div>
                </div>

                {/* Cash & Bank Breakdown */}
                <div className="bg-gray-50 border border-gray-300 rounded-2xl p-5">
                    <h2 className="text-gray-900 font-semibold text-sm mb-4">Rincian Saldo Rekening Kas &amp; Bank</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {cashBank.map(c => (
                            <div key={c.id} className="p-4 bg-white border border-gray-300 rounded-xl">
                                <p className="text-gray-900 text-sm font-semibold">{c.account_name}</p>
                                <p className="text-gray-400 text-xs font-mono">{c.bank_name} {c.account_number}</p>
                                <p className="text-emerald-400 font-bold font-mono text-base mt-2">{fmt(c.balance)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
