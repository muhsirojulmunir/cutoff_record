import React from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Customer {
  id: number;
  name: string;
  customer_code: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  sales_order_id: number;
  due_date: string | null;
  total_amount: string;
  status: string;
  notes: string | null;
  customer: Customer | null;
  sales_order: SalesOrder | null;
}

interface InvoiceEditProps {
  invoice: Invoice;
}

export default function Edit({ invoice }: InvoiceEditProps) {
  const { flash } = usePage<PageProps>().props;

  const { data, setData, put, processing, errors } = useForm({
    due_date: invoice.due_date ? invoice.due_date.split('T')[0] : '',
    notes: invoice.notes ?? '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    put(`/invoices/${invoice.id}`);
  }

  return (
    <AppLayout>
      <Head title={`Edit Invoice: ${invoice.invoice_number}`} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href={`/invoices/${invoice.id}`}
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Invoice</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              No: {invoice.invoice_number} • Status: {invoice.status}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Form Fields */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Informasi Tambahan</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Due Date */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Tanggal Jatuh Tempo</label>
                  <input
                    type="date"
                    value={data.due_date}
                    onChange={(e) => setData('due_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  {errors.due_date && <p className="text-rose-500 text-xs">{errors.due_date}</p>}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-sm font-semibold text-gray-700">Keterangan / Catatan Internal</label>
                <textarea
                  rows={5}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Keterangan tambahan invoice..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400 resize-none"
                />
                {errors.notes && <p className="text-rose-500 text-xs">{errors.notes}</p>}
              </div>
            </div>
          </div>

          {/* Right Panel: Read-Only Info */}
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Data Terkunci</h2>

              <div className="space-y-3.5 text-sm border-b border-gray-200 pb-4">
                <div>
                  <span className="text-gray-500 block text-xs">Customer</span>
                  <span className="font-semibold text-gray-800 block mt-0.5">
                    {invoice.customer ? invoice.customer.name : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Sales Order Sumber</span>
                  <span className="font-semibold text-gray-800 block mt-0.5">
                    {invoice.sales_order ? invoice.sales_order.so_number : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Total Tagihan</span>
                  <span className="font-bold text-gray-900 block mt-0.5">
                    Rp {Number(invoice.total_amount).toLocaleString('id-ID')}
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
                  href={`/invoices/${invoice.id}`}
                  className="flex-1 text-center py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-all border border-gray-300"
                >
                  Batal
                </Link>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {processing ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-gray-900" fill="none" viewBox="0 0 24 24">
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
