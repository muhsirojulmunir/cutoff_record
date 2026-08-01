import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
  sales_channel: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  sales_order_id: number;
  sales_order: SalesOrder | null;
  customer: Customer | null;
}

interface Supplier {
  id: number;
  name: string;
  supplier_code: string;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
}

interface FactoryReceivable {
  id: number;
  receivable_number: string;
  purchase_order_id: number;
  purchase_order: PurchaseOrder | null;
  supplier: Supplier | null;
}

interface PaymentAllocation {
  id: number;
  payment_id: number;
  invoice_id: number | null;
  factory_receivable_id: number | null;
  allocated_amount: string;
  invoice: Invoice | null;
  factory_receivable: FactoryReceivable | null;
}

interface Creator {
  id: number;
  name: string;
}

interface Payment {
  id: number;
  payment_number: string;
  payment_date: string;
  payment_type: 'customer_invoice' | 'factory_receivable';
  payment_method: 'cash' | 'bank_transfer' | 'credit_card' | 'debit_card' | 'e_wallet' | 'other';
  amount: string;
  reference_number: string | null;
  bank_account: string | null;
  cash_account: string | null;
  notes: string | null;
  status: 'posted' | 'cancelled';
  creator: Creator | null;
  allocations: PaymentAllocation[];
}

interface PaymentShowProps {
  payment: Payment;
}

const statusBadgeColor: Record<string, string> = {
  posted:    'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  cancelled: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const statusLabel: Record<string, string> = {
  posted:    'Posted (Sukses)',
  cancelled: 'Batal (Cancelled)',
};

const typeLabel: Record<string, string> = {
  customer_invoice:   'Invoice Customer (Masuk)',
  factory_receivable: 'Piutang Pabrik (Keluar)',
};

const methodLabel: Record<string, string> = {
  cash:          'Tunai / Cash',
  bank_transfer: 'Transfer Bank',
  credit_card:   'Kartu Kredit',
  debit_card:    'Kartu Debit',
  e_wallet:      'E-Wallet',
  other:         'Lainnya',
};

const channelLabel: Record<string, string> = {
  manual:  'Manual (Sales)',
  shopee:  'Shopee Marketplace',
  tiktok:  'TikTok Shop',
  website: 'Website / Online Store',
};

export default function Show({ payment }: PaymentShowProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canCancel = permissions.includes('payment.cancel');

  function handleCancel() {
    setActionLoading(true);
    router.post(`/payments/${payment.id}/cancel`, {}, {
      onFinish: () => {
        setActionLoading(false);
        setCancelModalOpen(false);
      },
    });
  }

  const allocation = payment.allocations[0] ?? null;

  return (
    <AppLayout>
      <Head title={`Detail Pembayaran: ${payment.payment_number}`} />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/payments"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">{payment.payment_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[payment.status]}`}>
                {statusLabel[payment.status]}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Tgl Transaksi: {new Date(payment.payment_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} • Operator: {payment.creator?.name || 'System'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {canCancel && payment.status === 'posted' && (
          <button
            onClick={() => setCancelModalOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-rose-950/20 text-rose-500 border border-slate-800 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all"
          >
            Batalkan Pembayaran
          </button>
        )}
      </div>

      {/* Alerts */}
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* Traceability Map */}
      <div className="mb-6 bg-slate-950/40 border border-slate-900 rounded-2xl p-4 shadow-xl">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Alur Traceability</h3>
        
        {payment.payment_type === 'customer_invoice' && allocation && allocation.invoice ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span className="font-semibold text-emerald-400">Payment: {payment.payment_number}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <Link href={`/invoices/${allocation.invoice_id}`} className="hover:underline text-slate-200 font-semibold">
              Invoice: {allocation.invoice.invoice_number}
            </Link>
            {allocation.invoice.sales_order && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <Link href={`/sales-orders/${allocation.invoice.sales_order_id}`} className="hover:underline text-slate-200 font-semibold">
                  SO: {allocation.invoice.sales_order.so_number}
                </Link>
              </>
            )}
            {allocation.invoice.customer && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <span className="text-slate-300">Customer: {allocation.invoice.customer.name}</span>
              </>
            )}
          </div>
        ) : payment.payment_type === 'factory_receivable' && allocation && allocation.factory_receivable ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span className="font-semibold text-amber-400">Payment: {payment.payment_number}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <Link href={`/factory-receivables/${allocation.factory_receivable_id}`} className="hover:underline text-slate-200 font-semibold">
              Piutang: {allocation.factory_receivable.receivable_number}
            </Link>
            {allocation.factory_receivable.purchase_order && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <Link href={`/purchase-orders/${allocation.factory_receivable.purchase_order_id}`} className="hover:underline text-slate-200 font-semibold">
                  PO: {allocation.factory_receivable.purchase_order.po_number}
                </Link>
              </>
            )}
            {allocation.factory_receivable.supplier && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <span className="text-slate-300">Supplier: {allocation.factory_receivable.supplier.name}</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-slate-500 font-semibold text-xs">Alur tidak terdefinisi (Alokasi Kosong)</span>
        )}
      </div>

      {/* Main Grid Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Detail Pembayaran */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2.5">Rincian Pembayaran</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Tipe Transaksi</span>
              <span className="font-semibold text-slate-200">{typeLabel[payment.payment_type]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Metode</span>
              <span className="font-semibold text-slate-200">{methodLabel[payment.payment_method]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Nominal Transaksi</span>
              <span className="font-bold text-white text-base">
                Rp {Number(payment.amount).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>

        {/* Informasi Akun Finansial */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2.5">Data Akun & Ref</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">No. Referensi / Memo</span>
              <span className="font-semibold text-slate-200">{payment.reference_number || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Akun Bank</span>
              <span className="font-semibold text-slate-200">{payment.bank_account || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Akun Kas / Tunai</span>
              <span className="font-semibold text-slate-200">{payment.cash_account || '—'}</span>
            </div>
          </div>
        </div>

        {/* Summary Dokumen Terkait */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2.5">Alokasi Dokumen</h3>
          {payment.payment_type === 'customer_invoice' && allocation && allocation.invoice ? (
            <div className="space-y-1.5 text-sm">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wide">Invoice Terkait</span>
              <h4 className="text-base font-bold text-violet-400">
                <Link href={`/invoices/${allocation.invoice_id}`} className="hover:underline">
                  {allocation.invoice.invoice_number}
                </Link>
              </h4>
              <p className="text-slate-300 text-xs mt-1">
                Customer: {allocation.invoice.customer ? allocation.invoice.customer.name : '—'}
              </p>
              {allocation.invoice.sales_order && (
                <p className="text-slate-400 text-xs">
                  Sales Order: {allocation.invoice.sales_order.so_number} ({channelLabel[allocation.invoice.sales_order.sales_channel] ?? allocation.invoice.sales_order.sales_channel})
                </p>
              )}
            </div>
          ) : payment.payment_type === 'factory_receivable' && allocation && allocation.factory_receivable ? (
            <div className="space-y-1.5 text-sm">
              <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wide">Piutang Terkait</span>
              <h4 className="text-base font-bold text-amber-400">
                <Link href={`/factory-receivables/${allocation.factory_receivable_id}`} className="hover:underline">
                  {allocation.factory_receivable.receivable_number}
                </Link>
              </h4>
              <p className="text-slate-300 text-xs mt-1">
                Supplier: {allocation.factory_receivable.supplier ? allocation.factory_receivable.supplier.name : '—'}
              </p>
              {allocation.factory_receivable.purchase_order && (
                <p className="text-slate-400 text-xs">
                  Purchase Order: {allocation.factory_receivable.purchase_order.po_number}
                </p>
              )}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">—</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Catatan Transaksi</h3>
        <div className="text-sm text-slate-300 leading-relaxed bg-slate-900/10 p-3.5 rounded-xl border border-slate-900 whitespace-pre-line">
          {payment.notes || 'Tidak ada catatan.'}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-white">Konfirmasi Pembatalan</h3>
            <p className="text-sm text-slate-400 mt-2">
              Apakah Anda yakin ingin membatalkan Pembayaran <span className="font-semibold text-white">{payment.payment_number}</span>? Nominal sebesar <span className="font-bold text-white">Rp {Number(payment.amount).toLocaleString('id-ID')}</span> akan dikembalikan ke saldo tagihan awal.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setCancelModalOpen(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all border border-slate-800"
              >
                Batal
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-950/40"
              >
                {actionLoading ? 'Menyimpan...' : 'Batalkan Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
