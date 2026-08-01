import React, { FormEvent } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';

interface AccountType { value: string; label: string; }
interface Props { accountTypes: AccountType[]; }

const inputClass = (err?: string) =>
    `w-full px-3 py-2 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none placeholder:text-slate-600 transition-all ${err ? 'border-rose-500/60' : 'border-slate-800'}`;
const label = 'block text-xs font-semibold text-slate-400 mb-1.5';

export default function AccountsCreate({ accountTypes }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        account_name:           '',
        account_type:           '',
        account_number:         '',
        bank_name:              '',
        account_holder:         '',
        opening_balance:        '0',
        allow_negative_balance: false,
        notes:                  '',
    });

    const handleSubmit = (e: FormEvent) => { e.preventDefault(); post('/cash-bank/accounts'); };

    return (
        <AppLayout>
            <Head title="Tambah Rekening Kas & Bank" />
            <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-3">
                    <Link href="/cash-bank/accounts" className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded-lg transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Tambah Rekening Kas & Bank</h1>
                        <p className="text-slate-400 text-xs mt-0.5">Kas & Bank / Rekening / Baru — Kode dibuat otomatis</p>
                    </div>
                </div>

                <form id="form-create-account" onSubmit={handleSubmit} className="space-y-5">
                    <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
                        <div className="px-6 py-4 border-b border-slate-900 bg-slate-950/60">
                            <h2 className="font-semibold text-slate-200 text-sm">Informasi Rekening</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className={label}>Nama Rekening <span className="text-rose-400">*</span></label>
                                <input id="account_name" type="text" value={data.account_name} onChange={e => setData('account_name', e.target.value)} placeholder="Contoh: Kas Utama / Bank BCA" className={inputClass(errors.account_name)} />
                                {errors.account_name && <p className="text-rose-400 text-xs mt-1">{errors.account_name}</p>}
                            </div>
                            <div>
                                <label className={label}>Jenis Rekening <span className="text-rose-400">*</span></label>
                                <select id="account_type" value={data.account_type} onChange={e => setData('account_type', e.target.value)} className={inputClass(errors.account_type)}>
                                    <option value="">-- Pilih Jenis --</option>
                                    {accountTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                {errors.account_type && <p className="text-rose-400 text-xs mt-1">{errors.account_type}</p>}
                            </div>
                            <div>
                                <label className={label}>Nama Bank</label>
                                <input id="bank_name" type="text" value={data.bank_name} onChange={e => setData('bank_name', e.target.value)} placeholder="BCA, Mandiri, GoPay, dll." className={inputClass()} />
                            </div>
                            <div>
                                <label className={label}>Nomor Rekening</label>
                                <input id="account_number" type="text" value={data.account_number} onChange={e => setData('account_number', e.target.value)} placeholder="Opsional" className={inputClass()} />
                            </div>
                            <div>
                                <label className={label}>Nama Pemilik Rekening</label>
                                <input id="account_holder" type="text" value={data.account_holder} onChange={e => setData('account_holder', e.target.value)} placeholder="Opsional" className={inputClass()} />
                            </div>
                            <div>
                                <label className={label}>Saldo Awal (Rp) <span className="text-rose-400">*</span></label>
                                <CurrencyInput id="opening_balance" value={data.opening_balance} onChange={v => setData('opening_balance', String(v))} className={inputClass(errors.opening_balance)} />
                                {errors.opening_balance && <p className="text-rose-400 text-xs mt-1">{errors.opening_balance}</p>}
                            </div>
                            <div className="sm:col-span-2">
                                <label className={label}>Catatan</label>
                                <textarea id="notes" rows={2} value={data.notes} onChange={e => setData('notes', e.target.value)} placeholder="Opsional" className={`${inputClass()} resize-none`} />
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-3">
                                <input id="allow_negative_balance" type="checkbox" checked={data.allow_negative_balance} onChange={e => setData('allow_negative_balance', e.target.checked)}
                                    className="w-4 h-4 accent-violet-500 cursor-pointer" />
                                <label htmlFor="allow_negative_balance" className="text-xs text-slate-400 cursor-pointer">
                                    Izinkan saldo negatif pada rekening ini
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                        <Link href="/cash-bank/accounts" className="px-4 py-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold transition-all">Batal</Link>
                        <button id="btn-submit-create" type="submit" disabled={processing}
                            className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-violet-900/30">
                            {processing ? 'Menyimpan...' : 'Simpan Rekening'}
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
