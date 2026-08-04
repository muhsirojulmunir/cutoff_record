import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Product {
  id: number;
  sku: string;
  name: string;
}

interface InvoiceItem {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string;
  quantity: number;
  unit: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  subtotal: string;
  product: Product | null;
}

interface SalesOrder {
  id: number;
  so_number: string;
  order_date: string;
  sales_channel: string;
}

interface Customer {
  id: number;
  name: string;
  customer_code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface Creator {
  id: number;
  name: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  sales_order_id: number;
  customer_id: number;
  invoice_date: string;
  due_date: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_cost: string;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  notes: string | null;
  customer: Customer | null;
  sales_order: SalesOrder | null;
  creator: Creator | null;
  items: InvoiceItem[];
}

interface InvoiceShowProps {
  invoice: Invoice;
}

const statusBadgeColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-orange-50 border-orange-200 text-orange-600',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue:        'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse font-bold',
  cancelled:      'bg-gray-100 border-gray-300 text-gray-500',
};

const statusLabel: Record<string, string> = {
  unpaid:         'Belum Lunas',
  partially_paid: 'Dibayar Sebagian',
  paid:           'Lunas',
  overdue:        'Jatuh Tempo (Overdue)',
  cancelled:      'Dibatalkan',
};

const channelLabel: Record<string, string> = {
  manual: 'Manual (Sales)',
  shopee: 'Shopee Marketplace',
  tiktok: 'TikTok Shop',
  website: 'Website / Online Store',
};

export default function Show({ invoice }: InvoiceShowProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canCancel = permissions.includes('invoice.cancel');
  const canEdit   = permissions.includes('invoice.edit');
  const canViewSo = permissions.includes('sales_order.view');

  function handleCancel() {
    setActionLoading(true);
    router.post(`/invoices/${invoice.id}/cancel`, {}, {
      onFinish: () => {
        setActionLoading(false);
        setCancelModalOpen(false);
      },
    });
  }

  return (
    <AppLayout>
      <Head title={`Detail Invoice: ${invoice.invoice_number}`} />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/invoices"
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{invoice.invoice_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[invoice.status]}`}>
                {statusLabel[invoice.status]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Tgl Invoice: {new Date(invoice.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} • Dibuat oleh: {invoice.creator?.name || 'System'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {/* Download & Print Buttons */}
          <a
            href={`/invoices/${invoice.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-gray-900 rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-900/30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Cetak / PDF & Excel
          </a>

          {permissions.includes('payment.create') && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <Link
              href={`/invoices/${invoice.id}/pay`}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-gray-900 rounded-xl text-sm font-semibold transition-all shadow-md"
            >
              Buat Pembayaran
            </Link>
          )}
          {canEdit && invoice.status === 'unpaid' && Number(invoice.paid_amount) === 0 && (
            <Link
              href={`/invoices/${invoice.id}/edit`}
              className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-300 hover:border-gray-300 rounded-xl text-sm font-semibold transition-all"
            >
              Edit Invoice
            </Link>
          )}
          {canCancel && invoice.status !== 'cancelled' && invoice.status !== 'paid' && Number(invoice.paid_amount) === 0 && (
            <button
              onClick={() => setCancelModalOpen(true)}
              className="px-4 py-2 bg-gray-50 hover:bg-rose-50 text-rose-500 border border-gray-300 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all"
            >
              Batalkan Invoice
            </button>
          )}
        </div>
      </div>


      {/* Alerts */}
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* Info Traceability Map */}
      <div className="mb-6 bg-white/80 border border-gray-200 rounded-2xl p-4 shadow-xl">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Alur Traceability</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="font-semibold text-teal-400">Invoice: {invoice.invoice_number}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {invoice.sales_order && (
            <>
              {canViewSo ? (
                <Link
                  href={`/sales-orders/${invoice.sales_order_id}`}
                  className="hover:underline text-gray-800 font-semibold"
                >
                  SO: {invoice.sales_order.so_number}
                </Link>
              ) : (
                <span className="text-gray-700 font-semibold">SO: {invoice.sales_order.so_number}</span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </>
          )}
          {invoice.customer && (
            <>
              <span className="text-gray-800 font-semibold">Customer: {invoice.customer.name}</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </>
          )}
          <span className="text-gray-400 font-semibold">Products ({invoice.items.length})</span>
        </div>
      </div>

      {/* Grid Info & Amount */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Detail Invoice */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2.5">Detail Tagihan</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Tgl Invoice</span>
              <span className="font-semibold text-gray-800">
                {new Date(invoice.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Jatuh Tempo</span>
              <span className={`font-semibold ${invoice.status === 'overdue' ? 'text-red-400 font-bold' : 'text-gray-800'}`}>
                {invoice.due_date
                  ? new Date(invoice.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            {invoice.sales_order && (
              <div className="flex justify-between">
                <span className="text-gray-500">Sales Channel</span>
                <span className="font-semibold text-gray-800">
                  {channelLabel[invoice.sales_order.sales_channel] ?? invoice.sales_order.sales_channel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2.5">Data Pelanggan (Customer)</h3>
          {invoice.customer ? (
            <div className="space-y-1 text-sm">
              <h4 className="text-base font-bold text-gray-900">{invoice.customer.name}</h4>
              <p className="text-gray-500 text-xs">Kode: {invoice.customer.customer_code}</p>
              {invoice.customer.phone && <p className="text-gray-500 text-xs">Nomor Telepon: <span className="font-mono">{invoice.customer.phone}</span></p>}
              {invoice.customer.email && <p className="text-gray-500 text-xs">Email: {invoice.customer.email}</p>}
              {invoice.customer.address && <p className="text-gray-500 text-xs mt-1 bg-gray-50 p-2 border border-gray-200 rounded-xl leading-relaxed">{invoice.customer.address}</p>}
            </div>
          ) : (
            <p className="text-gray-400">—</p>
          )}
        </div>

        {/* Keuangan/Balance Summary */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2.5">Ikhtisar Pembayaran</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total Tagihan</span>
              <span className="font-semibold text-gray-800">
                Rp {Number(invoice.total_amount).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Telah Dibayar</span>
              <span className="font-semibold text-emerald-400">
                Rp {Number(invoice.paid_amount).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 flex-wrap items-center">
              <span className="text-base font-bold text-gray-900">Sisa Tagihan</span>
              <span className={`text-base font-extrabold ${invoice.status === 'paid' ? 'text-emerald-400' : 'text-rose-400'}`}>
                Rp {Number(invoice.remaining_amount).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Table Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 bg-white">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Rincian Barang (Invoice Items Snapshot)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                    <th className="py-3 px-6">Produk</th>
                    <th className="py-3 px-6 text-center">Kuantitas</th>
                    <th className="py-3 px-6 text-right">Harga Unit</th>
                    <th className="py-3 px-6 text-right">Diskon</th>
                    <th className="py-3 px-6 text-right">Pajak</th>
                    <th className="py-3 px-6 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-teal-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-gray-800 block">{item.product_name}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5 block">{item.sku}</span>
                      </td>
                      <td className="py-3.5 px-6 text-center font-semibold text-gray-800">
                        {item.quantity} <span className="text-[11px] text-gray-400 font-normal">{item.unit}</span>
                      </td>
                      <td className="py-3.5 px-6 text-right font-medium">
                        Rp {Number(item.unit_price).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-right text-rose-400">
                        {Number(item.discount_amount) > 0 ? `-Rp ${Number(item.discount_amount).toLocaleString('id-ID')}` : '—'}
                      </td>
                      <td className="py-3.5 px-6 text-right text-emerald-400">
                        {Number(item.tax_amount) > 0 ? `+Rp ${Number(item.tax_amount).toLocaleString('id-ID')}` : '—'}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-gray-900">
                        Rp {Number(item.subtotal).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Summary & Notes */}
        <div className="space-y-6">
          {/* Summary Calculator Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl space-y-3.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-200">Summary Biaya</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-gray-800">Rp {Number(invoice.subtotal).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Diskon</span>
                <span className="font-semibold text-rose-400">
                  {Number(invoice.discount_amount) > 0 ? `-Rp ${Number(invoice.discount_amount).toLocaleString('id-ID')}` : 'Rp 0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pajak</span>
                <span className="font-semibold text-emerald-400">
                  {Number(invoice.tax_amount) > 0 ? `+Rp ${Number(invoice.tax_amount).toLocaleString('id-ID')}` : 'Rp 0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Biaya Kirim</span>
                <span className="font-semibold text-gray-800">
                  {Number(invoice.shipping_cost) > 0 ? `+Rp ${Number(invoice.shipping_cost).toLocaleString('id-ID')}` : 'Rp 0'}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 flex-wrap items-center">
                <span className="text-sm font-bold text-gray-900">Total Tagihan</span>
                <span className="text-base font-extrabold text-gray-900">Rp {Number(invoice.total_amount).toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Catatan / Keterangan</h3>
            <div className="text-sm text-gray-700 leading-relaxed bg-gray-50/10 p-3.5 rounded-xl border border-gray-200 whitespace-pre-line">
              {invoice.notes || 'Tidak ada catatan.'}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-gray-900">Konfirmasi Pembatalan</h3>
            <p className="text-sm text-gray-500 mt-2">
              Apakah Anda yakin ingin membatalkan Invoice <span className="font-semibold text-gray-900">{invoice.invoice_number}</span>? Dokumen ini akan dinonaktifkan dan tidak dapat menerima pembayaran.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setCancelModalOpen(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-300 hover:border-teal-400 transition-all border border-gray-300"
              >
                Batal
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-200/40"
              >
                {actionLoading ? 'Menyimpan...' : 'Batalkan Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
