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

interface DBOrderItem {
  id: number;
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  subtotal: string;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  status: string;
  grand_total: string;
  items: DBOrderItem[];
}

interface Supplier {
  id: number;
  name: string;
  supplier_code: string;
  phone: string | null;
  address: string | null;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface Creator {
  id: number;
  name: string;
}

interface StockMovement {
  id: number;
  product_id: number;
  warehouse_id: number | null;
  movement_type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reference_number: string | null;
  created_at: string;
  product: Product | null;
  warehouse: Warehouse | null;
}

interface FactoryReceivable {
  id: number;
  receivable_number: string;
  supplier_id: number;
  purchase_order_id: number;
  warehouse_id: number | null;
  transaction_date: string;
  due_date: string | null;
  original_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  notes: string | null;
  created_at: string;
  supplier: Supplier | null;
  purchase_order: PurchaseOrder | null;
  warehouse: Warehouse | null;
  creator: Creator | null;
}

interface FactoryReceivableShowProps {
  factoryReceivable: FactoryReceivable;
  stockMovements: StockMovement[];
}

const statusBadgeColor: Record<string, string> = {
  unpaid:         'bg-rose-500/10 border-rose-500/20 text-rose-400',
  partially_paid: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  paid:           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  overdue:        'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse font-bold',
  cancelled:      'bg-slate-800 border-slate-700 text-slate-400',
};

const statusLabel: Record<string, string> = {
  unpaid:         'Belum Lunas',
  partially_paid: 'Dibayar Sebagian',
  paid:           'Lunas',
  overdue:        'Jatuh Tempo (Overdue)',
  cancelled:      'Dibatalkan',
};

export default function Show({ factoryReceivable, stockMovements }: FactoryReceivableShowProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canCancel = permissions.includes('factory_receivable.cancel');
  const canEdit   = permissions.includes('factory_receivable.edit');
  const canViewPo = permissions.includes('purchase_order.view');

  function handleCancel() {
    setActionLoading(true);
    router.post(`/factory-receivables/${factoryReceivable.id}/cancel`, {}, {
      onFinish: () => {
        setActionLoading(false);
        setCancelModalOpen(false);
      },
    });
  }

  return (
    <AppLayout>
      <Head title={`Detail Piutang: ${factoryReceivable.receivable_number}`} />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/factory-receivables"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">{factoryReceivable.receivable_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[factoryReceivable.status]}`}>
                {statusLabel[factoryReceivable.status]}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Tgl Transaksi: {new Date(factoryReceivable.transaction_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} • Operator: {factoryReceivable.creator?.name || 'System'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {permissions.includes('payment.create') && factoryReceivable.status !== 'paid' && factoryReceivable.status !== 'cancelled' && (
            <Link
              href={`/factory-receivables/${factoryReceivable.id}/pay`}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md"
            >
              Bayar Piutang
            </Link>
          )}
          {canEdit && factoryReceivable.status !== 'cancelled' && (
            <Link
              href={`/factory-receivables/${factoryReceivable.id}/edit`}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 rounded-xl text-sm font-semibold transition-all"
            >
              Edit Piutang
            </Link>
          )}
          {canCancel && factoryReceivable.status !== 'cancelled' && factoryReceivable.status !== 'paid' && (
            <button
              onClick={() => setCancelModalOpen(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-rose-950/20 text-rose-500 border border-slate-800 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all"
            >
              Batalkan Piutang
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* Info Traceability Map */}
      <div className="mb-6 bg-slate-950/40 border border-slate-900 rounded-2xl p-4 shadow-xl">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Alur Traceability</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span className="font-semibold text-violet-400">Piutang: {factoryReceivable.receivable_number}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {factoryReceivable.purchase_order && (
            <>
              {canViewPo ? (
                <Link
                  href={`/purchase-orders/${factoryReceivable.purchase_order_id}`}
                  className="hover:underline text-slate-200 font-semibold"
                >
                  PO: {factoryReceivable.purchase_order.po_number}
                </Link>
              ) : (
                <span className="text-slate-300 font-semibold">PO: {factoryReceivable.purchase_order.po_number}</span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </>
          )}
          {factoryReceivable.supplier && (
            <>
              <span className="text-slate-200 font-semibold">Supplier: {factoryReceivable.supplier.name}</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-slate-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </>
          )}
          <span className="text-slate-500 font-semibold">Stok & Movements ({stockMovements.length})</span>
        </div>
      </div>

      {/* Grid Info & Amount */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Detail Piutang */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2.5">Detail Hutang</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Tgl Transaksi</span>
              <span className="font-semibold text-slate-200">
                {new Date(factoryReceivable.transaction_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Jatuh Tempo</span>
              <span className={`font-semibold ${factoryReceivable.status === 'overdue' ? 'text-red-400 font-bold' : 'text-slate-200'}`}>
                {factoryReceivable.due_date
                  ? new Date(factoryReceivable.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Gudang</span>
              <span className="font-semibold text-slate-200">
                {factoryReceivable.warehouse ? factoryReceivable.warehouse.name : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Supplier Info */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2.5">Supplier / Pabrik</h3>
          {factoryReceivable.supplier ? (
            <div className="space-y-1.5 text-sm">
              <h4 className="text-base font-bold text-white">{factoryReceivable.supplier.name}</h4>
              <p className="text-slate-400">Kode: {factoryReceivable.supplier.supplier_code}</p>
              {factoryReceivable.supplier.phone && <p className="text-slate-400">Tlp: {factoryReceivable.supplier.phone}</p>}
            </div>
          ) : (
            <p className="text-slate-500">—</p>
          )}
        </div>

        {/* Keuangan/Balance */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2.5">Rincian Nominal</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Original Amount</span>
              <span className="font-semibold text-slate-200">
                Rp {Number(factoryReceivable.original_amount).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Paid Amount</span>
              <span className="font-semibold text-emerald-400">
                Rp {Number(factoryReceivable.paid_amount).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-900 pt-2 flex-wrap items-center">
              <span className="text-base font-bold text-white">Sisa Kewajiban</span>
              <span className={`text-base font-extrabold ${factoryReceivable.status === 'paid' ? 'text-emerald-400' : 'text-rose-400'}`}>
                Rp {Number(factoryReceivable.remaining_amount).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items purchase order */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items PO */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-900 bg-slate-950">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Rincian Barang yang Dibeli (PO Items)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                    <th className="py-3 px-6">Produk</th>
                    <th className="py-3 px-6 text-center">Kuantitas</th>
                    <th className="py-3 px-6 text-right">Harga Unit</th>
                    <th className="py-3 px-6 text-right">Diskon</th>
                    <th className="py-3 px-6 text-right">Pajak</th>
                    <th className="py-3 px-6 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-sm text-slate-300">
                  {factoryReceivable.purchase_order?.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-slate-200 block">{item.product_name}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">{item.product_code}</span>
                      </td>
                      <td className="py-3.5 px-6 text-center font-semibold text-slate-200">
                        {item.quantity} <span className="text-[11px] text-slate-500 font-normal">{item.unit}</span>
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
                      <td className="py-3.5 px-6 text-right font-bold text-white">
                        Rp {Number(item.subtotal).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Related Stock Movements */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-900 bg-slate-950">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Histori Stok Masuk (Stock Movements)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                    <th className="py-3 px-6">Tanggal</th>
                    <th className="py-3 px-6">Produk</th>
                    <th className="py-3 px-6">Gudang</th>
                    <th className="py-3 px-6 text-center">Qty</th>
                    <th className="py-3 px-6 text-center">Sebelum</th>
                    <th className="py-3 px-6 text-center">Sesudah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-sm text-slate-300">
                  {stockMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-500 font-medium">
                        Tidak ada histori pergerakan stok terkait.
                      </td>
                    </tr>
                  ) : (
                    stockMovements.map((movement) => (
                      <tr key={movement.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3.5 px-6 whitespace-nowrap text-xs text-slate-400">
                          {new Date(movement.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="font-semibold text-slate-200 block">
                            {movement.product ? movement.product.name : '—'}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5 block">
                            SKU: {movement.product ? movement.product.sku : '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-medium text-slate-300">
                          {movement.warehouse ? movement.warehouse.name : '—'}
                        </td>
                        <td className="py-3.5 px-6 text-center font-bold text-slate-100">
                          {movement.quantity.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3.5 px-6 text-center text-slate-500">
                          {movement.stock_before.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3.5 px-6 text-center font-semibold text-slate-200">
                          {movement.stock_after.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Notes */}
        <div className="space-y-6">
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Catatan Internal</h3>
            <div className="text-sm text-slate-300 leading-relaxed bg-slate-900/10 p-3.5 rounded-xl border border-slate-900 whitespace-pre-line">
              {factoryReceivable.notes || 'Tidak ada catatan.'}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-white">Konfirmasi Pembatalan</h3>
            <p className="text-sm text-slate-400 mt-2">
              Apakah Anda yakin ingin membatalkan Piutang Pabrik <span className="font-semibold text-white">{factoryReceivable.receivable_number}</span>? Nilai kewajiban ini akan dinonaktifkan.
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
                {actionLoading ? 'Menyimpan...' : 'Batalkan Piutang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
