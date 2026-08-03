import React from 'react';
import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/Layouts/AppLayout';

interface Account { id: number; account_code: string; account_name: string; type_label: string; }

interface Transaction {
    id: number; transaction_number: string; transaction_date: string;
    transaction_type: string; type_label: string; direction: string;
    amount: string; balance_before: string; balance_after: string;
    description: string; reference_number: string | null; status: string;
    account: Account;
    creator: { name: string; };
    created_at: string;
}

interface Props {
    transaction: Transaction;
    source: any;
    sourceType: string | null;
}

const fmt = (n: string | number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n));

const dirBadge: Record<string, string> = {
    in:  'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    out: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const statusBadge: Record<string, string> = {
    posted:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
    reversed: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{label}</dt>
            <dd className="text-sm text-gray-800">{children}</dd>
        </div>
    );
}

function SourceInfo({ source, sourceType }: { source: any; sourceType: string | null }) {
    if (!source || !sourceType) return null;

    if (sourceType === 'App\\Models\\Payment') {
        const inv   = source.allocations?.[0]?.invoice;
        const fr    = source.allocations?.[0]?.factory_receivable;
        const party = inv?.sales_order?.customer?.name ?? fr?.supplier?.name ?? '—';
        return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h2 className="font-semibold text-gray-800 text-sm">Sumber: Payment</h2>
                </div>
                <div className="p-6">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <DetailRow label="No. Payment"><span className="font-mono text-teal-400">{source.payment_number}</span></DetailRow>
                        <DetailRow label="Tipe">{source.payment_type === 'customer_invoice' ? 'Pembayaran Customer' : 'Pembayaran Supplier'}</DetailRow>
                        <DetailRow label="Pihak">{party}</DetailRow>
                        {inv && <DetailRow label="Invoice"><span className="font-mono text-blue-400">{inv.invoice_number}</span></DetailRow>}
                        {fr  && <DetailRow label="Piutang Pabrik"><span className="font-mono text-amber-400">{fr.receivable_number}</span></DetailRow>}
                    </dl>
                </div>
            </div>
        );
    }

    if (sourceType === 'App\\Models\\PettyCashTransaction') {
        return (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h2 className="font-semibold text-gray-800 text-sm">Sumber: Petty Cash</h2>
                </div>
                <div className="p-6">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <DetailRow label="No. Transaksi"><span className="font-mono text-teal-400">{source.transaction_number}</span></DetailRow>
                        <DetailRow label="Kategori">{source.category?.name ?? '—'}</DetailRow>
                        <DetailRow label="Deskripsi">{source.description}</DetailRow>
                        <DetailRow label="Dibuat Oleh">{source.creator?.name}</DetailRow>
                    </dl>
                </div>
            </div>
        );
    }

    return null;
}

export default function TransactionShow({ transaction, source, sourceType }: Props) {
    return (
        <AppLayout>
            <Head title={transaction.transaction_number} />
            <div className="space-y-6 max-w-4xl">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href="/cash-bank/transactions" className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 rounded-lg transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-mono">{transaction.transaction_number}</h1>
                            <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase ${dirBadge[transaction.direction] ?? ''}`}>
                                {transaction.direction === 'in' ? '▲ IN' : '▼ OUT'}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-[10px] font-bold uppercase ${statusBadge[transaction.status] ?? ''}`}>
                                {transaction.status}
                            </span>
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">Kas & Bank / Ledger / {transaction.transaction_number}</p>
                    </div>
                </div>

                {/* Amount Hero */}
                <div className={`rounded-2xl p-6 text-white shadow-xl ${transaction.direction === 'in' ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 shadow-emerald-900/30' : 'bg-gradient-to-br from-rose-600 to-rose-800 shadow-rose-900/30'}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">
                        {transaction.direction === 'in' ? 'Uang Masuk' : 'Uang Keluar'} — {transaction.type_label}
                    </p>
                    <p className="text-4xl font-extrabold">
                        {transaction.direction === 'in' ? '+' : '-'}{fmt(transaction.amount)}
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-70">Saldo Sebelum</p>
                            <p className="text-lg font-bold">{fmt(transaction.balance_before)}</p>
                        </div>
                        <div className="flex items-center justify-center text-3xl opacity-60">→</div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-70">Saldo Sesudah</p>
                            <p className="text-lg font-bold">{fmt(transaction.balance_after)}</p>
                        </div>
                    </div>
                </div>

                {/* Detail Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-5">
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
                            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                                <h2 className="font-semibold text-gray-800 text-sm">Detail Transaksi</h2>
                            </div>
                            <div className="p-6">
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <DetailRow label="No. Transaksi"><span className="font-mono text-teal-400">{transaction.transaction_number}</span></DetailRow>
                                    <DetailRow label="Tanggal">{new Date(transaction.transaction_date).toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'})}</DetailRow>
                                    <DetailRow label="Jenis Transaksi">{transaction.type_label}</DetailRow>
                                    <DetailRow label="Rekening">
                                        <Link href={`/cash-bank/accounts/${transaction.account.id}`} className="text-blue-400 hover:text-blue-300 font-mono transition-colors">
                                            {transaction.account.account_code} – {transaction.account.account_name}
                                        </Link>
                                    </DetailRow>
                                    <div className="sm:col-span-2">
                                        <DetailRow label="Keterangan">{transaction.description}</DetailRow>
                                    </div>
                                    {transaction.reference_number && (
                                        <DetailRow label="Referensi"><span className="font-mono">{transaction.reference_number}</span></DetailRow>
                                    )}
                                </dl>
                            </div>
                        </div>

                        <SourceInfo source={source} sourceType={sourceType} />
                    </div>

                    {/* Right sidebar */}
                    <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
                            <h3 className="font-semibold text-gray-800 text-sm mb-4">Informasi Teknis</h3>
                            <div className="space-y-3 text-xs">
                                <div>
                                    <p className="text-gray-400 uppercase tracking-wider font-bold">Saldo Sebelum</p>
                                    <p className="font-mono text-gray-700 mt-0.5">{fmt(transaction.balance_before)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 uppercase tracking-wider font-bold">Saldo Sesudah</p>
                                    <p className="font-mono text-gray-700 mt-0.5">{fmt(transaction.balance_after)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 uppercase tracking-wider font-bold">Dibuat</p>
                                    <p className="text-gray-700 mt-0.5">{new Date(transaction.created_at).toLocaleString('id-ID')}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 uppercase tracking-wider font-bold">Oleh</p>
                                    <p className="text-gray-700 mt-0.5">{transaction.creator?.name}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
