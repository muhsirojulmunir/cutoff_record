import React, { FormEvent, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';
import { PageProps } from '../../../Types';

interface Transaction {
    id: number; transaction_number: string; transaction_date: string;
    transaction_type: string; direction: string; amount: string;
    balance_before: string; balance_after: string; description: string;
    status: string; type_label: string;
    creator: { name: string };
}

interface Account {
    id: number; account_code: string; account_name: string; account_type: string;
    type_label: string; account_number: string | null; bank_name: string | null;
    account_holder: string | null; opening_balance: string; current_balance: string;
    allow_negative_balance: boolean; status: string; notes: string | null;
    creator: { name: string };
}

interface Props {
    account: Account;
    totalIn: number; totalOut: number; txnCount: number;
    recentTransactions: Transaction[];
    canEdit: boolean; canAdjust: boolean; canDeactivate: boolean;
}

const fmt = (n: string | number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n));

const typeBadge: Record<string, string> = {
    cash:     'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    bank:     'bg-blue-500/10 border-blue-500/20 text-blue-400',
    e_wallet: 'bg-teal-500/10 border-teal-500/20 text-teal-400',
};

const dirBadge: Record<string, string> = {
    in:  'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    out: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const inputCls = `w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none placeholder:text-gray-400 transition-all`;
const lbl = 'block text-xs font-semibold text-gray-500 mb-1.5';

function AdjustModal({ accountId, onClose }: { accountId: number; onClose: () => void }) {
    const [form, setForm] = useState({ account_id: accountId, transaction_date: new Date().toISOString().slice(0,10), amount: '', direction: 'in', description: '', reference_number: '' });
    const [processing, setProcessing] = useState(false);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setProcessing(true);
        router.post('/cash-bank/transactions/adjustment', form, { onFinish: () => { setProcessing(false); onClose(); } });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Adjustment Saldo</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className={lbl}>Tanggal <span className="text-rose-400">*</span></label>
                        <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({...f, transaction_date: e.target.value}))} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={lbl}>Arah <span className="text-rose-400">*</span></label>
                            <select value={form.direction} onChange={e => setForm(f => ({...f, direction: e.target.value}))} className={inputCls}>
                                <option value="in">Tambah (+)</option>
                                <option value="out">Kurang (-)</option>
                            </select>
                        </div>
                        <div>
                            <label className={lbl}>Nominal (Rp) <span className="text-rose-400">*</span></label>
                            <CurrencyInput value={form.amount} onChange={v => setForm(f => ({...f, amount: String(v)}))} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className={lbl}>Keterangan <span className="text-rose-400">*</span></label>
                        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Alasan adjustment..." className={`${inputCls} resize-none`} />
                    </div>
                    <div>
                        <label className={lbl}>Referensi</label>
                        <input type="text" value={form.reference_number} onChange={e => setForm(f => ({...f, reference_number: e.target.value}))} placeholder="Opsional" className={inputCls} />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">Batal</button>
                        <button type="submit" disabled={processing} className="px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40">
                            {processing ? 'Memproses...' : 'Simpan Adjustment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function CashInOutModal({ accountId, type, onClose }: { accountId: number; type: 'cash-in' | 'cash-out'; onClose: () => void }) {
    const [form, setForm] = useState({ account_id: accountId, transaction_date: new Date().toISOString().slice(0,10), amount: '', description: '', reference_number: '' });
    const [processing, setProcessing] = useState(false);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setProcessing(true);
        router.post(`/cash-bank/transactions/${type}`, form, { onFinish: () => { setProcessing(false); onClose(); } });
    };

    const title = type === 'cash-in' ? 'Cash In (Pemasukan)' : 'Cash Out (Pengeluaran)';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={lbl}>Tanggal <span className="text-rose-400">*</span></label>
                            <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({...f, transaction_date: e.target.value}))} className={inputCls} />
                        </div>
                        <div>
                            <label className={lbl}>Nominal (Rp) <span className="text-rose-400">*</span></label>
                            <CurrencyInput value={form.amount} onChange={v => setForm(f => ({...f, amount: String(v)}))} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className={lbl}>Keterangan <span className="text-rose-400">*</span></label>
                        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Keterangan transaksi..." className={`${inputCls} resize-none`} />
                    </div>
                    <div>
                        <label className={lbl}>Referensi</label>
                        <input type="text" value={form.reference_number} onChange={e => setForm(f => ({...f, reference_number: e.target.value}))} placeholder="Opsional" className={inputCls} />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">Batal</button>
                        <button type="submit" disabled={processing} className={`px-5 py-2 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-all ${type === 'cash-in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                            {processing ? 'Memproses...' : `Simpan ${title}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</dt>
            <dd className="text-sm text-gray-800">{children}</dd>
        </div>
    );
}

export default function AccountsShow({ account, totalIn, totalOut, txnCount, recentTransactions, canEdit, canAdjust, canDeactivate }: Props) {
    const { flash } = usePage<PageProps>().props;
    const [showAdjust, setShowAdjust]   = useState(false);
    const [showCashIn, setShowCashIn]   = useState(false);
    const [showCashOut, setShowCashOut] = useState(false);

    const handleDeactivate = () => {
        if (!confirm(account.status === 'active' ? 'Nonaktifkan rekening ini?' : 'Aktifkan kembali rekening ini?')) return;
        const url = account.status === 'active'
            ? `/cash-bank/accounts/${account.id}/deactivate`
            : `/cash-bank/accounts/${account.id}/activate`;
        router.post(url);
    };

    return (
        <AppLayout>
            <Head title={`${account.account_code} – ${account.account_name}`} />

            {showAdjust   && <AdjustModal    accountId={account.id} onClose={() => { setShowAdjust(false);   router.reload(); }} />}
            {showCashIn   && <CashInOutModal  accountId={account.id} type="cash-in"  onClose={() => { setShowCashIn(false);   router.reload(); }} />}
            {showCashOut  && <CashInOutModal  accountId={account.id} type="cash-out" onClose={() => { setShowCashOut(false);  router.reload(); }} />}

            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Link href="/cash-bank/accounts" className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-mono">{account.account_code}</h1>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-full text-[10px] font-bold uppercase ${typeBadge[account.account_type] ?? ''}`}>
                                    {account.type_label}
                                </span>
                                {account.status === 'inactive' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-[10px] font-bold uppercase">⛔ Tidak Aktif</span>
                                )}
                            </div>
                            <p className="text-gray-500 text-sm mt-0.5 font-semibold">{account.account_name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {canEdit && (
                            <Link href={`/cash-bank/accounts/${account.id}/edit`} id="btn-edit"
                                className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">Edit</Link>
                        )}
                        {account.status === 'active' && (
                            <>
                                <button id="btn-cash-in" onClick={() => setShowCashIn(true)}
                                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-semibold transition-all">+ Cash In</button>
                                <button id="btn-cash-out" onClick={() => setShowCashOut(true)}
                                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-all">- Cash Out</button>
                            </>
                        )}
                        {canAdjust && account.status === 'active' && (
                            <button id="btn-adjustment" onClick={() => setShowAdjust(true)}
                                className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold transition-all">Adjustment</button>
                        )}
                        {canDeactivate && (
                            <button id="btn-toggle-status" onClick={handleDeactivate}
                                className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all">
                                {account.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                        )}
                    </div>
                </div>

                {flash?.success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl px-4 py-3">{flash.success}</div>}
                {flash?.error   && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl px-4 py-3">{flash.error}</div>}

                {/* Balance hero */}
                <div className="bg-gradient-to-br from-teal-600 to-violet-800 rounded-2xl p-6 text-white shadow-xl shadow-violet-900/30">
                    <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider mb-1">Saldo Saat Ini</p>
                    <p className="text-4xl font-extrabold">{fmt(account.current_balance)}</p>
                    <div className="mt-4 grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-teal-600 text-[10px] uppercase tracking-wider">Saldo Awal</p>
                            <p className="text-lg font-bold">{fmt(account.opening_balance)}</p>
                        </div>
                        <div>
                            <p className="text-emerald-300 text-[10px] uppercase tracking-wider">Total Masuk</p>
                            <p className="text-lg font-bold text-emerald-300">+{fmt(totalIn)}</p>
                        </div>
                        <div>
                            <p className="text-rose-300 text-[10px] uppercase tracking-wider">Total Keluar</p>
                            <p className="text-lg font-bold text-rose-300">-{fmt(totalOut)}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Account info */}
                    <div className="lg:col-span-2 space-y-5">
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                                <h2 className="font-semibold text-gray-800 text-sm">Informasi Rekening</h2>
                            </div>
                            <div className="p-6">
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <DetailRow label="Kode Rekening"><span className="font-mono text-teal-400">{account.account_code}</span></DetailRow>
                                    <DetailRow label="Jenis">{account.type_label}</DetailRow>
                                    {account.bank_name && <DetailRow label="Bank">{account.bank_name}</DetailRow>}
                                    {account.account_number && <DetailRow label="Nomor Rekening"><span className="font-mono">{account.account_number}</span></DetailRow>}
                                    {account.account_holder && <DetailRow label="Pemilik Rekening">{account.account_holder}</DetailRow>}
                                    {account.notes && <div className="sm:col-span-2"><DetailRow label="Catatan">{account.notes}</DetailRow></div>}
                                </dl>
                            </div>
                        </div>

                        {/* Recent Transactions */}
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                                <h2 className="font-semibold text-gray-800 text-sm">Transaksi Terbaru</h2>
                                <Link href={`/cash-bank/transactions?account_id=${account.id}`} className="text-teal-400 hover:text-teal-600 text-xs font-semibold transition-colors">Lihat Semua →</Link>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-white/80">
                                            <th className="py-2.5 px-5">No. Transaksi</th>
                                            <th className="py-2.5 px-5">Tanggal</th>
                                            <th className="py-2.5 px-5">Jenis</th>
                                            <th className="py-2.5 px-5 text-center">Arah</th>
                                            <th className="py-2.5 px-5 text-right">Nominal</th>
                                            <th className="py-2.5 px-5 text-right">Saldo Akhir</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                                        {recentTransactions.length === 0 ? (
                                            <tr><td colSpan={6} className="text-center py-8 text-gray-400">Belum ada transaksi</td></tr>
                                        ) : recentTransactions.map(t => (
                                            <tr key={t.id} className="hover:bg-teal-50/60">
                                                <td className="py-2.5 px-5 font-mono font-bold text-teal-400">
                                                    <Link href={`/cash-bank/transactions/${t.id}`} className="hover:text-teal-600">{t.transaction_number}</Link>
                                                </td>
                                                <td className="py-2.5 px-5">{new Date(t.transaction_date).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'})}</td>
                                                <td className="py-2.5 px-5">{t.type_label}</td>
                                                <td className="py-2.5 px-5 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-[10px] font-bold uppercase ${dirBadge[t.direction] ?? ''}`}>
                                                        {t.direction === 'in' ? '▲ IN' : '▼ OUT'}
                                                    </span>
                                                </td>
                                                <td className={`py-2.5 px-5 text-right font-bold ${t.direction === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {t.direction === 'in' ? '+' : '-'}{fmt(t.amount)}
                                                </td>
                                                <td className="py-2.5 px-5 text-right font-mono text-gray-700">{fmt(t.balance_after)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar stats */}
                    <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                            <h3 className="font-semibold text-gray-800 text-sm mb-4">Statistik</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                    <span className="text-gray-500 text-xs">Total Transaksi</span>
                                    <span className="font-bold text-gray-900">{txnCount}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                    <span className="text-emerald-400 text-xs">Total Masuk</span>
                                    <span className="font-bold text-emerald-400">{fmt(totalIn)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-rose-400 text-xs">Total Keluar</span>
                                    <span className="font-bold text-rose-400">{fmt(totalOut)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                            <h3 className="font-semibold text-gray-800 text-sm mb-3">Dibuat Oleh</h3>
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                                    <span className="text-teal-400 font-bold text-sm">{account.creator?.name?.charAt(0).toUpperCase()}</span>
                                </div>
                                <p className="text-sm font-semibold text-gray-800">{account.creator?.name}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
