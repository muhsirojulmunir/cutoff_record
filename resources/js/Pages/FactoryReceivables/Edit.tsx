import React from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

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
  supplier_id: number;
  purchase_order_id: number;
  due_date: string | null;
  original_amount: string;
  status: string;
  notes: string | null;
  supplier: Supplier | null;
  purchase_order: PurchaseOrder | null;
}

interface FactoryReceivableEditProps {
  factoryReceivable: FactoryReceivable;
}

export default function Edit({ factoryReceivable }: FactoryReceivableEditProps) {
  const { flash } = usePage<PageProps>().props;

  const { data, setData, put, processing, errors } = useForm({
    due_date: factoryReceivable.due_date ? factoryReceivable.due_date.split('T')[0] : '',
    notes: factoryReceivable.notes ?? '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    put(`/factory-receivables/${factoryReceivable.id}`);
  }

  return (
    <AppLayout>
      <Head title={`Edit Piutang Pabrik: ${factoryReceivable.receivable_number}`} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href={`/factory-receivables/${factoryReceivable.id}`}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Piutang Pabrik</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              No: {factoryReceivable.receivable_number} • Status: {factoryReceivable.status}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Form Fields */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Informasi Tambahan</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Due Date */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Tanggal Jatuh Tempo</label>
                  <input
                    type="date"
                    value={data.due_date}
                    onChange={(e) => setData('due_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                  {errors.due_date && <p className="text-rose-500 text-xs">{errors.due_date}</p>}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-sm font-semibold text-slate-300">Catatan Internal</label>
                <textarea
                  rows={5}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all placeholder:text-slate-600 resize-none"
                />
                {errors.notes && <p className="text-rose-500 text-xs">{errors.notes}</p>}
              </div>
            </div>
          </div>

          {/* Right Panel: Read-Only Info */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Data Tidak Dapat Diubah</h2>

              <div className="space-y-3.5 text-sm border-b border-slate-900 pb-4">
                <div>
                  <span className="text-slate-400 block">Supplier</span>
                  <span className="font-semibold text-slate-200 block mt-0.5">
                    {factoryReceivable.supplier ? factoryReceivable.supplier.name : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Purchase Order</span>
                  <span className="font-semibold text-slate-200 block mt-0.5">
                    {factoryReceivable.purchase_order ? factoryReceivable.purchase_order.po_number : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Original Amount</span>
                  <span className="font-bold text-white block mt-0.5">
                    Rp {Number(factoryReceivable.original_amount).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {flash.error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-lg text-rose-400 text-xs font-semibold leading-relaxed">
                  {flash.error}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <Link
                  href={`/factory-receivables/${factoryReceivable.id}`}
                  className="flex-1 text-center py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all border border-slate-800"
                >
                  Batal
                </Link>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-950/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {processing ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Menyimpan...
                    </>
                  ) : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
