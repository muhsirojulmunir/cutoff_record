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
  partially_paid: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  paid: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue: 'bg-red-600/10 border-red-600/20 text-red-400',
  cancelled: 'bg-slate-700 border-slate-600 text-slate-400',
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
          <Link href="/factory-invoices" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white">{invoice.invoice_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor[invoice.status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {statusLabel[invoice.status] ?? invoice.status}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">Invoice dari {invoice.supplier?.name} • Dibuat {new Date(invoice.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} oleh {invoice.creator?.name}</p>
          </div>
        </div>
        {canCancel && ['unpaid', 'overdue'].includes(invoice.status) && (
          <button onClick={handleCancel} disabled={cancelling}
            className="px-4 py-2 bg-slate-900 hover:bg-rose-950/20 text-rose-500 border border-slate-800 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
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
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Supplier</h3>
              <p className="font-bold text-white text-base">{invoice.supplier?.name ?? '—'}</p>
              <p className="text-sm text-slate-400 mt-1">Kode: {invoice.supplier?.supplier_code}</p>
              {invoice.supplier?.phone && <p className="text-sm text-slate-400">Tlp: {invoice.supplier.phone}</p>}
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-2.5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Detail Invoice</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-slate-500">No. Invoice Supplier</p><p className="text-slate-200 font-medium mt-0.5">{invoice.supplier_invoice_number ?? '—'}</p></div>
                <div><p className="text-xs text-slate-500">Tgl Invoice</p><p className="text-slate-200 font-medium mt-0.5">{new Date(invoice.invoice_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                <div><p className="text-xs text-slate-500">Jatuh Tempo</p><p className="text-slate-200 font-medium mt-0.5">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                <div><p className="text-xs text-slate-500">Ref. PO</p><p className="text-violet-400 font-medium mt-0.5">{invoice.purchase_order ? <Link href={`/purchase-orders/${invoice.purchase_order.id}`} className="hover:underline">{invoice.purchase_order.po_number}</Link> : '—'}</p></div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-900"><h3 className="text-sm font-bold text-white uppercase tracking-wider">Rincian Item</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                    <th className="py-3 px-5">Produk / Item</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4 text-right">Harga/Unit</th>
                    <th className="py-3 px-4 text-right">Diskon</th>
                    <th className="py-3 px-4 text-right">Pajak</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
                  {invoice.items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-900/30">
                      <td className="py-3.5 px-5">
                        <span className="font-semibold text-slate-200 block">{item.product_name}</span>
                        {item.product_code && <span className="text-[10px] text-slate-500">{item.product_code}</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold">{item.quantity} <span className="text-[10px] text-slate-500">{item.unit}</span></td>
                      <td className="py-3.5 px-4 text-right">Rp {fmt(item.unit_price)}</td>
                      <td className="py-3.5 px-4 text-right text-rose-400">{Number(item.discount_amount) > 0 ? `-Rp ${fmt(item.discount_amount)}` : '—'}</td>
                      <td className="py-3.5 px-4 text-right text-emerald-400">{Number(item.tax_amount) > 0 ? `+Rp ${fmt(item.tax_amount)}` : '—'}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-white">Rp {fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {invoice.notes && (
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Catatan</h3>
              <p className="text-sm text-slate-300 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right — Summary */}
        <div className="space-y-5">
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ringkasan Biaya</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="font-semibold text-slate-200">Rp {fmt(invoice.subtotal)}</span></div>
              <div className="flex justify-between text-slate-400"><span>Diskon</span><span className="font-semibold text-rose-400">{Number(invoice.discount_amount) > 0 ? `-Rp ${fmt(invoice.discount_amount)}` : 'Rp 0'}</span></div>
              <div className="flex justify-between text-slate-400"><span>Pajak</span><span className="font-semibold text-emerald-400">{Number(invoice.tax_amount) > 0 ? `+Rp ${fmt(invoice.tax_amount)}` : 'Rp 0'}</span></div>
              <div className="flex justify-between text-slate-400"><span>Ongkir</span><span className="font-semibold text-slate-200">Rp {fmt(invoice.shipping_cost)}</span></div>
              <div className="border-t border-slate-900 pt-2.5 flex justify-between items-center">
                <span className="font-bold text-white">Total Invoice</span>
                <span className="text-lg font-extrabold text-emerald-400">Rp {fmt(invoice.total_amount)}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status Pembayaran</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>Sudah Dibayar</span><span className="font-bold text-emerald-400">Rp {fmt(invoice.paid_amount)}</span></div>
              <div className="flex justify-between items-center border-t border-slate-900 pt-2.5">
                <span className="font-bold text-white">Sisa Tagihan</span>
                <span className="text-lg font-extrabold text-rose-400">Rp {fmt(invoice.remaining_amount)}</span>
              </div>
            </div>
          </div>

          {invoice.factory_receivable && (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-2xl p-4 shadow-xl">
              <h3 className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-2">Piutang Pabrik Terkait</h3>
              <p className="text-sm font-semibold text-slate-200">{invoice.factory_receivable.receivable_number}</p>
              <p className="text-xs text-slate-400 mt-1">Sisa: Rp {fmt(invoice.factory_receivable.remaining_amount)}</p>
              <Link href={`/factory-receivables/${invoice.factory_receivable.id}`} className="text-xs text-violet-400 hover:text-violet-300 font-semibold mt-2 block">Lihat Piutang →</Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
