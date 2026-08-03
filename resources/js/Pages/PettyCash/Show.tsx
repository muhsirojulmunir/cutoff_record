import React, { FormEvent, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface User {
    id: number;
    name: string;
}

interface Category {
    id: number;
    name: string;
    code: string;
}

interface CashBankAccount {
    id: number;
    account_code: string;
    account_name: string;
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
    status: string;
    category: Category;
    creator: User;
    submitter: User | null;
    submitted_at: string | null;
    approver: User | null;
    approved_at: string | null;
    rejector: User | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    canceller: User | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    created_at: string;
    cash_bank_account: CashBankAccount | null;
}

interface PaymentMethod {
    value: string;
    label: string;
}

interface Props {
    transaction: Transaction;
    canEdit: boolean;
    canSubmit: boolean;
    canLeaderApprove: boolean;
    canFinanceApprove: boolean;
    canReject: boolean;
    canCancel: boolean;
    paymentMethods: PaymentMethod[];
}

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
    draft:                     { label: 'Draft',                     badge: 'bg-slate-500/10 border-slate-500/20 text-gray-500',     dot: 'bg-slate-400' },
    pending_leader_approval:   { label: '⏳ Menunggu Leader',         badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',     dot: 'bg-amber-400' },
    pending_finance_approval:  { label: '⏳ Menunggu Finance',        badge: 'bg-orange-500/10 border-orange-500/20 text-orange-400',  dot: 'bg-orange-400' },
    approved:                  { label: '✅ Disetujui (Siap Cair)',   badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
    paid:                      { label: '💰 Sudah Dibayar',          badge: 'bg-teal-500/10 border-teal-500/20 text-teal-400',       dot: 'bg-teal-400' },
    rejected:                  { label: '❌ Ditolak',                badge: 'bg-rose-500/10 border-rose-500/20 text-rose-400',        dot: 'bg-rose-400' },
    cancelled:                 { label: 'Dibatalkan',                badge: 'bg-slate-500/10 border-slate-500/20 text-gray-400',     dot: 'bg-slate-500' },
};

const formatCurrency = (amount: string | number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(amount));

const formatDateTime = (dt: string | null) => {
    if (!dt) return '-';
    return new Date(dt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dt: string) =>
    new Date(dt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

// ─── Reason Modal ────────────────────────────────────────────────────────────
function ReasonModal({
    title,
    label,
    onSubmit,
    onClose,
    processing,
    inputId,
    confirmClass = 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400',
}: {
    title: string;
    label: string;
    onSubmit: (reason: string) => void;
    onClose: () => void;
    processing: boolean;
    inputId: string;
    confirmClass?: string;
}) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!reason.trim() || reason.trim().length < 5) {
            setError('Alasan minimal 5 karakter.');
            return;
        }
        onSubmit(reason);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-white border border-gray-300 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-300">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label htmlFor={inputId} className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                        <textarea
                            id={inputId}
                            rows={3}
                            value={reason}
                            onChange={e => { setReason(e.target.value); setError(''); }}
                            placeholder="Masukkan alasan..."
                            className={`w-full px-3 py-2 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all resize-none placeholder:text-gray-400 ${error ? 'border-rose-500/60' : 'border-gray-300'}`}
                        />
                        {error && <p className="text-rose-400 text-xs mt-1">{error}</p>}
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={processing}
                            className={`${confirmClass} disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all`}
                        >
                            {processing ? 'Memproses...' : 'Konfirmasi'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────
const timelineDot: Record<string, string> = {
    blue:   'bg-blue-500',
    yellow: 'bg-amber-400',
    green:  'bg-emerald-500',
    red:    'bg-rose-500',
    slate:  'bg-slate-500',
};

function TimelineItem({ icon, title, user, date, color }: {
    icon: string;
    title: string;
    user?: string;
    date: string;
    color: string;
}) {
    return (
        <li className="relative">
            <div className={`absolute -left-[21px] w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${timelineDot[color] ?? 'bg-slate-400'}`} />
            <p className="text-xs font-semibold text-gray-700">{icon} {title}</p>
            {user && <p className="text-xs text-gray-400 mt-0.5">{user}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{date}</p>
        </li>
    );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</dt>
            <dd className="text-sm text-gray-800">{children}</dd>
        </div>
    );
}

export default function PettyCashShow({
    transaction,
    canEdit,
    canSubmit,
    canLeaderApprove,
    canFinanceApprove,
    canReject,
    canCancel,
    paymentMethods,
}: Props) {
    const [showRejectModal, setShowRejectModal]   = useState(false);
    const [showCancelModal, setShowCancelModal]   = useState(false);
    const [modalProcessing, setModalProcessing]   = useState(false);

    const statusInfo  = statusConfig[transaction.status] ?? { label: transaction.status, badge: 'bg-slate-500/10 border-slate-500/20 text-gray-500', dot: 'bg-slate-400' };
    const methodLabel = paymentMethods.find(m => m.value === transaction.payment_method)?.label ?? transaction.payment_method;

    const handleSubmit = () => {
        if (!confirm('Ajukan transaksi ini untuk persetujuan Leader?')) return;
        router.post(`/petty-cash/${transaction.id}/submit`);
    };

    const handleLeaderApprove = () => {
        if (!confirm('Setujui transaksi ini sebagai Leader? Transaksi akan diteruskan ke Finance.')) return;
        router.post(`/petty-cash/${transaction.id}/leader-approve`);
    };

    const handleFinanceApprove = () => {
        if (!confirm('Setujui transaksi ini sebagai Finance? Transaksi siap untuk dicairkan.')) return;
        router.post(`/petty-cash/${transaction.id}/finance-approve`);
    };

    const handleDisburse = () => {
        if (!confirm('Cairkan dana transaksi ini? Saldo kas/bank akan berkurang.')) return;
        router.post(`/petty-cash/${transaction.id}/disburse`);
    };

    const handleReject = (reason: string) => {
        setModalProcessing(true);
        router.post(`/petty-cash/${transaction.id}/reject`, { rejection_reason: reason }, {
            onFinish: () => { setModalProcessing(false); setShowRejectModal(false); },
        });
    };

    const handleCancel = (reason: string) => {
        setModalProcessing(true);
        router.post(`/petty-cash/${transaction.id}/cancel`, { cancellation_reason: reason }, {
            onFinish: () => { setModalProcessing(false); setShowCancelModal(false); },
        });
    };

    return (
        <AppLayout>
            <Head title={transaction.transaction_number} />

            {showRejectModal && (
                <ReasonModal
                    title="Tolak Transaksi"
                    label="Alasan Penolakan *"
                    inputId="rejection-reason-input"
                    onSubmit={handleReject}
                    onClose={() => setShowRejectModal(false)}
                    processing={modalProcessing}
                    confirmClass="bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400"
                />
            )}

            {showCancelModal && (
                <ReasonModal
                    title="Batalkan Transaksi"
                    label="Alasan Pembatalan *"
                    inputId="cancellation-reason-input"
                    onSubmit={handleCancel}
                    onClose={() => setShowCancelModal(false)}
                    processing={modalProcessing}
                    confirmClass="bg-gradient-to-r from-slate-600 to-slate-500 hover:from-slate-500 hover:to-slate-400"
                />
            )}

            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-mono">{transaction.transaction_number}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-gray-500 text-xs">Keuangan / Petty Cash / Detail</p>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider ${statusInfo.badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                    {statusInfo.label}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {canEdit && (
                            <Link
                                id="btn-edit"
                                href={`/petty-cash/${transaction.id}/edit`}
                                className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
                            >
                                Edit
                            </Link>
                        )}
                        {canSubmit && transaction.status === 'draft' && (
                            <button
                                id="btn-submit-approval"
                                onClick={handleSubmit}
                                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40"
                            >
                                Ajukan ke Leader
                            </button>
                        )}
                        {canLeaderApprove && transaction.status === 'pending_leader_approval' && (
                            <button
                                id="btn-leader-approve"
                                onClick={handleLeaderApprove}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-emerald-200/40"
                            >
                                ✅ Approve (Leader)
                            </button>
                        )}
                        {canFinanceApprove && transaction.status === 'pending_finance_approval' && (
                            <button
                                id="btn-finance-approve"
                                onClick={handleFinanceApprove}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-emerald-200/40"
                            >
                                ✅ Approve (Finance)
                            </button>
                        )}
                        {canFinanceApprove && transaction.status === 'approved' && (
                            <button
                                id="btn-disburse"
                                onClick={handleDisburse}
                                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40"
                            >
                                💰 Cairkan Dana
                            </button>
                        )}
                        {canReject && ['pending_leader_approval', 'pending_finance_approval'].includes(transaction.status) && (
                            <button
                                id="btn-reject"
                                onClick={() => setShowRejectModal(true)}
                                className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 font-semibold rounded-xl text-xs transition-all"
                            >
                                ❌ Tolak
                            </button>
                        )}
                        {canCancel && (
                            <button
                                id="btn-cancel"
                                onClick={() => setShowCancelModal(true)}
                                className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 font-semibold rounded-xl text-xs transition-all"
                            >
                                Batalkan
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Amount Summary */}
                        <div className="bg-gradient-to-br from-teal-600 to-violet-800 rounded-2xl p-6 text-white shadow-xl shadow-violet-900/30">
                            <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider mb-1">Total Pengeluaran</p>
                            <p className="text-3xl font-extrabold">{formatCurrency(transaction.amount)}</p>
                            <div className="mt-4 flex items-center gap-3">
                                <span className="bg-white/15 text-gray-900 text-xs font-semibold px-2.5 py-1 rounded-full border border-white/10">
                                    {transaction.category?.name ?? '-'}
                                </span>
                                <span className="text-teal-200 text-xs">{methodLabel}</span>
                            </div>
                        </div>

                        {/* Transaction Info */}
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                                <h2 className="font-semibold text-gray-800 text-sm">Informasi Transaksi</h2>
                            </div>
                            <div className="p-6">
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                                    <DetailRow label="Nomor Transaksi">
                                        <span className="font-mono text-teal-400">{transaction.transaction_number}</span>
                                    </DetailRow>
                                    <DetailRow label="Tanggal Transaksi">
                                        {formatDate(transaction.transaction_date)}
                                    </DetailRow>
                                    <DetailRow label="Kategori">
                                        <span className="inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 border-blue-500/20 text-blue-400">
                                            [{transaction.category?.code}] {transaction.category?.name}
                                        </span>
                                    </DetailRow>
                                    <DetailRow label="Metode Pembayaran">
                                        {methodLabel}
                                    </DetailRow>
                                    {transaction.cash_bank_account && (
                                        <DetailRow label="Rekening Kas / Bank">
                                            <Link href={`/cash-bank/accounts/${transaction.cash_bank_account.id}`} className="text-blue-450 hover:text-blue-300 font-mono transition-colors">
                                                [{transaction.cash_bank_account.account_code}] {transaction.cash_bank_account.account_name}
                                            </Link>
                                        </DetailRow>
                                    )}
                                    {transaction.vendor_name && (
                                        <DetailRow label="Vendor / Supplier">
                                            {transaction.vendor_name}
                                        </DetailRow>
                                    )}
                                    {transaction.reference_number && (
                                        <DetailRow label="Nomor Referensi">
                                            <span className="font-mono text-gray-700">{transaction.reference_number}</span>
                                        </DetailRow>
                                    )}
                                    <div className="sm:col-span-2">
                                        <DetailRow label="Deskripsi">
                                            <span className="text-gray-700 leading-relaxed">{transaction.description}</span>
                                        </DetailRow>
                                    </div>
                                </dl>
                            </div>
                        </div>

                        {/* Rejection / Cancellation Notes */}
                        {(transaction.rejection_reason || transaction.cancellation_reason) && (
                            <div className={`rounded-2xl border p-5 ${transaction.rejection_reason ? 'bg-rose-500/10 border-rose-500/20' : 'bg-gray-50 border-gray-300'}`}>
                                <h3 className={`font-semibold text-sm mb-2 ${transaction.rejection_reason ? 'text-rose-400' : 'text-gray-500'}`}>
                                    {transaction.rejection_reason ? '❌ Alasan Penolakan' : '🚫 Alasan Pembatalan'}
                                </h3>
                                <p className={`text-sm ${transaction.rejection_reason ? 'text-rose-300' : 'text-gray-500'}`}>
                                    {transaction.rejection_reason || transaction.cancellation_reason}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Right Column — Approval Timeline */}
                    <div className="space-y-4">
                        {/* Timeline */}
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                                <h2 className="font-semibold text-gray-800 text-sm">Timeline Persetujuan</h2>
                            </div>
                            <div className="p-5">
                                <ol className="relative border-l border-gray-300 space-y-6 pl-5">
                                    <TimelineItem
                                        icon="✏️"
                                        title="Dibuat"
                                        user={transaction.creator?.name}
                                        date={formatDateTime(transaction.created_at)}
                                        color="blue"
                                    />
                                    {transaction.submitted_at && (
                                        <TimelineItem
                                            icon="📤"
                                            title="Diajukan"
                                            user={transaction.submitter?.name}
                                            date={formatDateTime(transaction.submitted_at)}
                                            color="yellow"
                                        />
                                    )}
                                    {transaction.approved_at && (
                                        <TimelineItem
                                            icon="✅"
                                            title="Disetujui"
                                            user={transaction.approver?.name}
                                            date={formatDateTime(transaction.approved_at)}
                                            color="green"
                                        />
                                    )}
                                    {transaction.rejected_at && (
                                        <TimelineItem
                                            icon="❌"
                                            title="Ditolak"
                                            user={transaction.rejector?.name}
                                            date={formatDateTime(transaction.rejected_at)}
                                            color="red"
                                        />
                                    )}
                                    {transaction.cancelled_at && (
                                        <TimelineItem
                                            icon="🚫"
                                            title="Dibatalkan"
                                            user={transaction.canceller?.name}
                                            date={formatDateTime(transaction.cancelled_at)}
                                            color="slate"
                                        />
                                    )}
                                </ol>
                            </div>
                        </div>

                        {/* Created By */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                            <h3 className="font-semibold text-gray-800 text-sm mb-3">Dibuat Oleh</h3>
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                                    <span className="text-teal-400 font-bold text-sm">
                                        {transaction.creator?.name?.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">{transaction.creator?.name}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
