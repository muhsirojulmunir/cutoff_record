import React from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Supplier { id: number; name: string; supplier_code: string; phone: string | null; }
interface PO { id: number; po_number: string; }
interface FactoryReceivable { id: number; receivable_number: string; status: string; remaining_amount: string; }
interface FactoryInvoiceItem { id: number; product_name: string; product_code: string | null; quantity: number; unit: string; unit_price: string; discount_amount: string; tax_amount: string; subtotal: string; notes: string | null; }
interface FactoryInvoice {
  id: number;
  invoice_number: string;
  supplier_invoice_number: string | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_cost: string;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  notes: string | null;
  created_at: string;
  supplier: Supplier | null;
  purchase_order: PO | null;
  factory_receivable: FactoryReceivable | null;
  creator: { id: number; name: string } | null;
  items: FactoryInvoiceItem[];
}

const statusColor: Record<string, string> = {
  unpaid: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-orange-50 border-orange-200 text-orange-600',
  paid: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue: 'bg-red-600/10 border-red-600/20 text-red-400',
  cancelled: 'bg-gray-200 border-gray-400 text-gray-500',
};
const statusLabel: Record<string, string> = {
  unpaid: 'Belum Bayar', partially_paid: 'Sebagian Terbayar', paid: 'Lunas', overdue: 'Jatuh Tempo', cancelled: 'Dibatalkan',
};
const fmt = (n: string | number | null) => n !== null && n !== undefined ? Number(n).toLocaleString('id-ID') : '0';

export default function Show({ invoice }: { invoice: FactoryInvoice }) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];
  const canCancel = permissions.includes('factory_receivable.cancel');
  const [cancelling, setCancelling] = React.useState(false);

  function handleCancel() {
    if (!confirm('Yakin ingin membatalkan invoice ini?')) return;
    setCancelling(true);
    router.post(`/factory-invoices/${invoice.id}/cancel`, {}, {
      onFinish: () => setCancelling(false),
    });
  }

  return (
    <AppLayout>
      <Head title={`Invoice Pabrik: ${invoice.invoice_number}`} />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/factory-invoices" className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor[invoice.status] ?? 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                {statusLabel[invoice.status] ?? invoice.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Invoice dari {invoice.supplier?.name} • Dibuat {new Date(invoice.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} oleh {invoice.creator?.name}</p>
          </div>
        </div>
        {canCancel && ['unpaid', 'overdue'].includes(invoice.status) && (
          <button onClick={handleCancel} disabled={cancelling}
            className="px-4 py-2 bg-gray-50 hover:bg-rose-50 text-rose-500 border border-gray-300 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
            {cancelling ? 'Memproses...' : '🚫 Batalkan Invoice'}
          </button>
        )}
      </div>

      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Supplier</h3>
              <p className="font-bold text-gray-900 text-base">{invoice.supplier?.name ?? '—'}</p>
              <p className="text-sm text-gray-500 mt-1">Kode: {invoice.supplier?.supplier_code}</p>
              {invoice.supplier?.phone && <p className="text-sm text-gray-500">Tlp: {invoice.supplier.phone}</p>}
            </div>
            <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl space-y-2.5">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Detail Invoice</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-gray-400">No. Invoice Supplier</p><p className="text-gray-800 font-medium mt-0.5">{invoice.supplier_invoice_number ?? '—'}</p></div>
                <div><p className="text-xs text-gray-400">Tgl Invoice</p><p className="text-gray-800 font-medium mt-0.5">{new Date(invoice.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                <div><p className="text-xs text-gray-400">Jatuh Tempo</p><p className="text-gray-800 font-medium mt-0.5">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                <div><p className="text-xs text-gray-400">Ref. PO</p><p className="text-teal-400 font-medium mt-0.5">{invoice.purchase_order ? <Link href={`/purchase-orders/${invoice.purchase_order.id}`} className="hover:underline">{invoice.purchase_order.po_number}</Link> : '—'}</p></div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white border border-gray-300/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200"><h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Rincian Item</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                    <th className="py-3 px-5">Produk / Item</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4 text-right">Harga/Unit</th>
                    <th className="py-3 px-4 text-right">Diskon</th>
                    <th className="py-3 px-4 text-right">Pajak</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/60 text-sm text-gray-700">
                  {invoice.items.map(item => (
                    <tr key={item.id} className="hover:bg-teal-50/60">
                      <td className="py-3.5 px-5">
                        <span className="font-semibold text-gray-800 block">{item.product_name}</span>
                        {item.product_code && <span className="text-[10px] text-gray-400">{item.product_code}</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold">{item.quantity} <span className="text-[10px] text-gray-400">{item.unit}</span></td>
                      <td className="py-3.5 px-4 text-right">Rp {fmt(item.unit_price)}</td>
                      <td className="py-3.5 px-4 text-right text-rose-400">{Number(item.discount_amount) > 0 ? `-Rp ${fmt(item.discount_amount)}` : '—'}</td>
                      <td className="py-3.5 px-4 text-right text-emerald-400">{Number(item.tax_amount) > 0 ? `+Rp ${fmt(item.tax_amount)}` : '—'}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-gray-900">Rp {fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {invoice.notes && (
            <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Catatan</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right — Summary */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ringkasan Biaya</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-semibold text-gray-800">Rp {fmt(invoice.subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Diskon</span><span className="font-semibold text-rose-400">{Number(invoice.discount_amount) > 0 ? `-Rp ${fmt(invoice.discount_amount)}` : 'Rp 0'}</span></div>
              <div className="flex justify-between text-gray-500"><span>Pajak</span><span className="font-semibold text-emerald-400">{Number(invoice.tax_amount) > 0 ? `+Rp ${fmt(invoice.tax_amount)}` : 'Rp 0'}</span></div>
              <div className="flex justify-between text-gray-500"><span>Ongkir</span><span className="font-semibold text-gray-800">Rp {fmt(invoice.shipping_cost)}</span></div>
              <div className="border-t border-gray-200 pt-2.5 flex justify-between items-center">
                <span className="font-bold text-gray-900">Total Invoice</span>
                <span className="text-lg font-extrabold text-emerald-400">Rp {fmt(invoice.total_amount)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Status Pembayaran</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500"><span>Sudah Dibayar</span><span className="font-bold text-emerald-400">Rp {fmt(invoice.paid_amount)}</span></div>
              <div className="flex justify-between items-center border-t border-gray-200 pt-2.5">
                <span className="font-bold text-gray-900">Sisa Tagihan</span>
                <span className="text-lg font-extrabold text-rose-400">Rp {fmt(invoice.remaining_amount)}</span>
              </div>
            </div>
          </div>

          {invoice.factory_receivable && (
            <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-4 shadow-xl">
              <h3 className="text-xs font-bold text-teal-400 uppercase tracking-widest mb-2">Piutang Pabrik Terkait</h3>
              <p className="text-sm font-semibold text-gray-800">{invoice.factory_receivable.receivable_number}</p>
              <p className="text-xs text-gray-500 mt-1">Sisa: Rp {fmt(invoice.factory_receivable.remaining_amount)}</p>
              <Link href={`/factory-receivables/${invoice.factory_receivable.id}`} className="text-xs text-teal-400 hover:text-teal-600 font-semibold mt-2 block">Lihat Piutang →</Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
