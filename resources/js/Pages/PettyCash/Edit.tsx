import React, { FormEvent } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

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

interface Transaction {
    id: number;
    transaction_number: string;
    transaction_date: string;
    expense_category_id: number;
    payment_method: string;
    amount: string;
    vendor_name: string | null;
    reference_number: string | null;
    description: string;
    attachment: string | null;
    status: string;
    category: Category;
    cash_bank_account_id: number | null;
}

interface Props {
    transaction: Transaction;
    categories: Category[];
    paymentMethods: PaymentMethod[];
    cashBankAccounts: CashBankAccount[];
}

const inputClass = (error?: string) =>
    `w-full px-3 py-2 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all placeholder:text-slate-600 ${
        error ? 'border-rose-500/60' : 'border-slate-800'
    }`;

const labelClass = 'block text-xs font-semibold text-slate-400 mb-1.5';

export default function PettyCashEdit({ transaction, categories, paymentMethods, cashBankAccounts }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        transaction_date:    transaction.transaction_date,
        expense_category_id: String(transaction.expense_category_id),
        payment_method:      transaction.payment_method,
        cash_bank_account_id: transaction.cash_bank_account_id ? String(transaction.cash_bank_account_id) : '',
        amount:              transaction.amount,
        vendor_name:         transaction.vendor_name ?? '',
        reference_number:    transaction.reference_number ?? '',
        description:         transaction.description,
        attachment:          transaction.attachment ?? '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        put(`/petty-cash/${transaction.id}`);
    };

    return (
        <AppLayout>
            <Head title={`Edit ${transaction.transaction_number}`} />

            <div className="space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link
                        href={`/petty-cash/${transaction.id}`}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Edit Transaksi Petty Cash</h1>
                        <p className="text-slate-400 text-xs mt-0.5 font-mono">Keuangan / Petty Cash / {transaction.transaction_number}</p>
                    </div>
                </div>

                {transaction.status !== 'draft' && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-sm text-amber-400">Transaksi ini tidak dapat diedit karena statusnya bukan Draft.</p>
                    </div>
                )}

                <form id="form-edit-petty-cash" onSubmit={handleSubmit} className="space-y-5">
                    <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
                        <div className="px-6 py-4 border-b border-slate-900 bg-slate-950/60">
                            <h2 className="font-semibold text-slate-200 text-sm">Informasi Transaksi</h2>
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
                                <input
                                    id="amount"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={data.amount}
                                    onChange={e => setData('amount', e.target.value)}
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
                                    className={`${inputClass(errors.description)} resize-none`}
                                />
                                {errors.description && <p className="text-rose-400 text-xs mt-1">{errors.description}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3">
                        <Link
                            href={`/petty-cash/${transaction.id}`}
                            className="px-4 py-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all"
                        >
                            Batal
                        </Link>
                        <button
                            id="btn-submit-edit"
                            type="submit"
                            disabled={processing || transaction.status !== 'draft'}
                            className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-violet-900/30"
                        >
                            {processing ? 'Menyimpan...' : 'Perbarui Transaksi'}
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
