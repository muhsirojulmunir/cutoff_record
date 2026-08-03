import React, { FormEvent } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';

interface Category {
    id: number;
    name: string;
    code: string;
}

interface PaymentMethod {
    value: string;
    label: string;
}

interface CashBankAccount {
    id: number;
    account_code: string;
    account_name: string;
    account_type: string;
}

interface FundSummary {
    period_label: string;
    allocated: number;
    used: number;
    remaining: number;
    over_budget: boolean;
}

interface Props {
    categories: Category[];
    fundTypes: Record<string, string>;
    driveEnabled: boolean;
    summaries: Record<string, FundSummary>;
    paymentMethods: PaymentMethod[];
    cashBankAccounts: CashBankAccount[];
}

const inputClass = (error?: string) =>
    `w-full px-3 py-2 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400 ${
        error ? 'border-rose-500/60' : 'border-gray-300'
    }`;

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function PettyCashCreate({ categories, fundTypes, driveEnabled, summaries, paymentMethods, cashBankAccounts }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        transaction_date:    new Date().toISOString().split('T')[0],
        fund_type:           'petty_cash',
        expense_category_id: '',
        coa_code:            '',
        payment_method:      '',
        cash_bank_account_id:'',
        amount:              '',
        vendor_name:         '',
        reference_number:    '',
        description:         '',
        attachment:          '',
        attachment_file:     null as File | null,
    });

    const summary = summaries[data.fund_type];

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post('/petty-cash', { forceFormData: true });
    };

    return (
        <AppLayout>
            <Head title="Tambah Petty Cash" />

            <div className="space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link
                        href="/petty-cash"
                        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tambah Transaksi Petty Cash</h1>
                        <p className="text-gray-500 text-xs mt-0.5">Keuangan / Petty Cash / Baru — Nomor akan dibuat otomatis</p>
                    </div>
                </div>

                <form id="form-create-petty-cash" onSubmit={handleSubmit} className="space-y-5">
                    {/* Main Card */}
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <h2 className="font-semibold text-gray-800 text-sm">Informasi Transaksi</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {/* Transaction Date */}
                            <div>
                                <label htmlFor="transaction_date" className={labelClass}>
                                    Tanggal Transaksi <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    id="transaction_date"
                                    type="date"
                                    value={data.transaction_date}
                                    onChange={e => setData('transaction_date', e.target.value)}
                                    className={inputClass(errors.transaction_date)}
                                />
                                {errors.transaction_date && <p className="text-rose-400 text-xs mt-1">{errors.transaction_date}</p>}
                            </div>

                            {/* Fund Type */}
                            <div>
                                <label htmlFor="fund_type" className={labelClass}>
                                    Jenis Dana <span className="text-rose-400">*</span>
                                </label>
                                <select
                                    id="fund_type"
                                    value={data.fund_type}
                                    onChange={e => setData('fund_type', e.target.value)}
                                    className={inputClass(errors.fund_type)}
                                >
                                    {Object.entries(fundTypes).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                {errors.fund_type && <p className="text-rose-400 text-xs mt-1">{errors.fund_type}</p>}
                            </div>

                            {/* Expense Category */}
                            <div>
                                <label htmlFor="expense_category_id" className={labelClass}>
                                    Kategori Biaya <span className="text-rose-400">*</span>
                                </label>
                                <select
                                    id="expense_category_id"
                                    value={data.expense_category_id}
                                    onChange={e => setData('expense_category_id', e.target.value)}
                                    className={inputClass(errors.expense_category_id)}
                                >
                                    <option value="">-- Pilih Kategori --</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
                                    ))}
                                </select>
                                {errors.expense_category_id && <p className="text-rose-400 text-xs mt-1">{errors.expense_category_id}</p>}
                            </div>

                            {/* Kode COA */}
                            <div>
                                <label htmlFor="coa_code" className={labelClass}>
                                    Kode COA <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    id="coa_code"
                                    type="text"
                                    value={data.coa_code}
                                    onChange={e => setData('coa_code', e.target.value)}
                                    placeholder="Contoh: 5101"
                                    className={`${inputClass(errors.coa_code)} font-mono`}
                                />
                                {errors.coa_code && <p className="text-rose-400 text-xs mt-1">{errors.coa_code}</p>}
                            </div>

                            {/* Payment Method */}
                            <div>
                                <label htmlFor="payment_method" className={labelClass}>
                                    Metode Pembayaran <span className="text-rose-400">*</span>
                                </label>
                                <select
                                    id="payment_method"
                                    value={data.payment_method}
                                    onChange={e => setData('payment_method', e.target.value)}
                                    className={inputClass(errors.payment_method)}
                                >
                                    <option value="">-- Pilih Metode --</option>
                                    {paymentMethods.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                                {errors.payment_method && <p className="text-rose-400 text-xs mt-1">{errors.payment_method}</p>}
                            </div>

                            {/* Cash/Bank Account */}
                            <div>
                                <label htmlFor="cash_bank_account_id" className={labelClass}>Rekening Kas / Bank Pembayar</label>
                                <select
                                    id="cash_bank_account_id"
                                    value={data.cash_bank_account_id}
                                    onChange={e => setData('cash_bank_account_id', e.target.value)}
                                    className={inputClass(errors.cash_bank_account_id)}
                                >
                                    <option value="">-- Pilih Rekening Kas / Bank --</option>
                                    {cashBankAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            [{account.account_code}] {account.account_name} ({account.account_type.toUpperCase()})
                                        </option>
                                    ))}
                                </select>
                                {errors.cash_bank_account_id && <p className="text-rose-400 text-xs mt-1">{errors.cash_bank_account_id}</p>}
                            </div>

                            {/* Amount */}
                            <div>
                                <label htmlFor="amount" className={labelClass}>
                                    Jumlah (Rp) <span className="text-rose-400">*</span>
                                </label>
                                <CurrencyInput
                                    id="amount"
                                    value={data.amount}
                                    onChange={v => setData('amount', String(v))}
                                    className={inputClass(errors.amount)}
                                />
                                {errors.amount && <p className="text-rose-400 text-xs mt-1">{errors.amount}</p>}
                            </div>

                            {/* Vendor Name */}
                            <div>
                                <label htmlFor="vendor_name" className={labelClass}>Nama Vendor</label>
                                <input
                                    id="vendor_name"
                                    type="text"
                                    value={data.vendor_name}
                                    onChange={e => setData('vendor_name', e.target.value)}
                                    placeholder="Opsional"
                                    className={inputClass()}
                                />
                            </div>

                            {/* Reference Number */}
                            <div>
                                <label htmlFor="reference_number" className={labelClass}>Nomor Referensi</label>
                                <input
                                    id="reference_number"
                                    type="text"
                                    value={data.reference_number}
                                    onChange={e => setData('reference_number', e.target.value)}
                                    placeholder="Nota, kwitansi, dll."
                                    className={inputClass()}
                                />
                            </div>

                            {/* Description */}
                            <div className="sm:col-span-2">
                                <label htmlFor="description" className={labelClass}>
                                    Deskripsi <span className="text-rose-400">*</span>
                                </label>
                                <textarea
                                    id="description"
                                    rows={3}
                                    value={data.description}
                                    onChange={e => setData('description', e.target.value)}
                                    placeholder="Keterangan pengeluaran..."
                                    className={`${inputClass(errors.description)} resize-none`}
                                />
                                {errors.description && <p className="text-rose-400 text-xs mt-1">{errors.description}</p>}
                            </div>

                            {/* Bukti Pembayaran */}
                            <div className="sm:col-span-2">
                                <label htmlFor="attachment_file" className={labelClass}>Bukti Pembayaran</label>
                                <input
                                    id="attachment_file"
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.pdf"
                                    onChange={e => setData('attachment_file', e.target.files?.[0] ?? null)}
                                    className="w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:text-xs file:font-semibold hover:file:bg-teal-100 cursor-pointer"
                                />
                                <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                                    {driveEnabled
                                        ? 'JPG, PNG, atau PDF maksimal 5 MB. File otomatis masuk ke folder Google Drive minggu berjalan.'
                                        : 'JPG, PNG, atau PDF maksimal 5 MB. Google Drive belum dikonfigurasi — file sementara disimpan di server.'}
                                </p>
                                {errors.attachment_file && <p className="text-rose-400 text-xs mt-1">{errors.attachment_file}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Sisa dana minggu berjalan */}
                    {summary && (
                        <div className={`rounded-2xl border p-4 ${summary.over_budget ? 'bg-rose-50 border-rose-200' : 'bg-teal-50/60 border-teal-200'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        Dana {fundTypes[data.fund_type]} — {summary.period_label}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Diisi Rp {summary.allocated.toLocaleString('id-ID')} • Terpakai Rp {summary.used.toLocaleString('id-ID')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Sisa Dana</p>
                                    <p className={`text-lg font-bold font-mono ${summary.over_budget ? 'text-rose-600' : 'text-teal-700'}`}>
                                        Rp {summary.remaining.toLocaleString('id-ID')}
                                    </p>
                                </div>
                            </div>
                            {summary.over_budget && (
                                <p className="text-xs text-rose-600 font-semibold mt-2">
                                    Pengeluaran minggu ini sudah melebihi dana yang diisi.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3">
                        <Link
                            href="/petty-cash"
                            className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
                        >
                            Batal
                        </Link>
                        <button
                            id="btn-submit-create"
                            type="submit"
                            disabled={processing}
                            className="px-6 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40"
                        >
                            {processing ? 'Menyimpan...' : 'Simpan Transaksi'}
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
