import React, { FormEvent } from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
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

interface Transaction {
    id: number;
    transaction_number: string;
    transaction_date: string;
    fund_type: string;
    expense_category_id: number;
    coa_code: string | null;
    payment_method: string;
    amount: string;
    vendor_name: string | null;
    reference_number: string | null;
    description: string;
    attachment: string | null;
    attachment_name: string | null;
    attachment_link: string | null;
    status: string;
    category: Category;
    cash_bank_account_id: number | null;
}

interface Props {
    transaction: Transaction;
    categories: Category[];
    fundTypes: Record<string, string>;
    driveEnabled: boolean;
    paymentMethods: PaymentMethod[];
    cashBankAccounts: CashBankAccount[];
}

const inputClass = (error?: string) =>
    `w-full px-3 py-2 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400 ${
        error ? 'border-rose-500/60' : 'border-gray-300'
    }`;

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function PettyCashEdit({ transaction, categories, fundTypes, driveEnabled, paymentMethods, cashBankAccounts }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        transaction_date:    transaction.transaction_date,
        fund_type:           transaction.fund_type,
        expense_category_id: String(transaction.expense_category_id),
        coa_code:            transaction.coa_code ?? '',
        payment_method:      transaction.payment_method,
        cash_bank_account_id: transaction.cash_bank_account_id ? String(transaction.cash_bank_account_id) : '',
        amount:              transaction.amount,
        vendor_name:         transaction.vendor_name ?? '',
        reference_number:    transaction.reference_number ?? '',
        description:         transaction.description,
        attachment:          transaction.attachment ?? '',
        attachment_file:     null as File | null,
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        router.post(`/petty-cash/${transaction.id}`, {
            ...data,
            _method: 'put',
        }, { forceFormData: true });
    };

    return (
        <AppLayout>
            <Head title={`Edit ${transaction.transaction_number}`} />

            <div className="space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link
                        href={`/petty-cash/${transaction.id}`}
                        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Edit Transaksi Petty Cash</h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-mono">Keuangan / Petty Cash / {transaction.transaction_number}</p>
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
                                    className={`${inputClass(errors.description)} resize-none`}
                                />
                                {errors.description && <p className="text-rose-400 text-xs mt-1">{errors.description}</p>}
                            </div>

                            {/* Bukti Pembayaran */}
                            <div className="sm:col-span-2">
                                <label htmlFor="attachment_file" className={labelClass}>Bukti Pembayaran</label>
                                {transaction.attachment_link && (
                                    <p className="text-xs text-gray-500 mb-1.5">
                                        Bukti saat ini:{' '}
                                        <a href={transaction.attachment_link} target="_blank" rel="noreferrer" className="text-teal-600 font-semibold hover:underline">
                                            {transaction.attachment_name ?? 'Lihat berkas'}
                                        </a>
                                    </p>
                                )}
                                <input
                                    id="attachment_file"
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.pdf"
                                    onChange={e => setData('attachment_file', e.target.files?.[0] ?? null)}
                                    className="w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:text-xs file:font-semibold hover:file:bg-teal-100 cursor-pointer"
                                />
                                <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                                    {driveEnabled
                                        ? 'Unggah berkas baru bila ingin mengganti bukti — otomatis masuk folder Google Drive minggu berjalan.'
                                        : 'Google Drive belum dikonfigurasi — berkas sementara disimpan di server.'}
                                </p>
                                {errors.attachment_file && <p className="text-rose-400 text-xs mt-1">{errors.attachment_file}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3">
                        <Link
                            href={`/petty-cash/${transaction.id}`}
                            className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
                        >
                            Batal
                        </Link>
                        <button
                            id="btn-submit-edit"
                            type="submit"
                            disabled={processing || transaction.status !== 'draft'}
                            className="px-6 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40"
                        >
                            {processing ? 'Menyimpan...' : 'Perbarui Transaksi'}
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
