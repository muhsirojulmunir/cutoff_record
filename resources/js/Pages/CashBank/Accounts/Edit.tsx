import React, { FormEvent } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Account {
    id: number; account_code: string; account_name: string; account_type: string;
    account_number: string | null; bank_name: string | null; account_holder: string | null;
    opening_balance: string; current_balance: string; allow_negative_balance: boolean;
    status: string; notes: string | null;
}
interface AccountType { value: string; label: string; }
interface Props { account: Account; accountTypes: AccountType[]; }

const inputClass = (err?: string) =>
    `w-full px-3 py-2 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none placeholder:text-gray-400 transition-all ${err ? 'border-rose-500/60' : 'border-gray-300'}`;
const lbl = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function AccountsEdit({ account, accountTypes }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        account_name:   account.account_name,
        account_type:   account.account_type,
        account_number: account.account_number ?? '',
        bank_name:      account.bank_name ?? '',
        account_holder: account.account_holder ?? '',
        notes:          account.notes ?? '',
    });

    const handleSubmit = (e: FormEvent) => { e.preventDefault(); put(`/cash-bank/accounts/${account.id}`); };

    return (
        <AppLayout>
            <Head title={`Edit ${account.account_code}`} />
            <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-3">
                    <Link href={`/cash-bank/accounts/${account.id}`} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Edit Rekening</h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-mono">Kas & Bank / {account.account_code}</p>
                    </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl px-4 py-3 flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Kode rekening ({account.account_code}) dan saldo tidak dapat diubah melalui form ini. Gunakan fitur Adjustment untuk mengubah saldo.
                </div>

                <form id="form-edit-account" onSubmit={handleSubmit} className="space-y-5">
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <h2 className="font-semibold text-gray-800 text-sm">Informasi Rekening</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className={lbl}>Nama Rekening <span className="text-rose-400">*</span></label>
                                <input id="account_name" type="text" value={data.account_name} onChange={e => setData('account_name', e.target.value)} className={inputClass(errors.account_name)} />
                                {errors.account_name && <p className="text-rose-400 text-xs mt-1">{errors.account_name}</p>}
                            </div>
                            <div>
                                <label className={lbl}>Jenis Rekening <span className="text-rose-400">*</span></label>
                                <select id="account_type" value={data.account_type} onChange={e => setData('account_type', e.target.value)} className={inputClass(errors.account_type)}>
                                    <option value="">-- Pilih Jenis --</option>
                                    {accountTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={lbl}>Nama Bank</label>
                                <input id="bank_name" type="text" value={data.bank_name} onChange={e => setData('bank_name', e.target.value)} placeholder="Opsional" className={inputClass()} />
                            </div>
                            <div>
                                <label className={lbl}>Nomor Rekening</label>
                                <input id="account_number" type="text" value={data.account_number} onChange={e => setData('account_number', e.target.value)} placeholder="Opsional" className={inputClass()} />
                            </div>
                            <div>
                                <label className={lbl}>Nama Pemilik</label>
                                <input id="account_holder" type="text" value={data.account_holder} onChange={e => setData('account_holder', e.target.value)} placeholder="Opsional" className={inputClass()} />
                            </div>
                            <div className="sm:col-span-2">
                                <label className={lbl}>Catatan</label>
                                <textarea id="notes" rows={2} value={data.notes} onChange={e => setData('notes', e.target.value)} className={`${inputClass()} resize-none`} />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                        <Link href={`/cash-bank/accounts/${account.id}`} className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">Batal</Link>
                        <button id="btn-submit-edit" type="submit" disabled={processing}
                            className="px-6 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40">
                            {processing ? 'Menyimpan...' : 'Perbarui Rekening'}
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
