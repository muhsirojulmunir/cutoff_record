import React from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import CurrencyInput from '../../Components/CurrencyInput';
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
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: string;
  customer: Customer | null;
  sales_order: SalesOrder | null;
}

interface CashBankAccount {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface CreateInvoicePaymentProps {
  invoice: Invoice;
  cashBankAccounts: CashBankAccount[];
}

export default function CreateInvoicePayment({ invoice, cashBankAccounts }: CreateInvoicePaymentProps) {
  const { flash } = usePage<PageProps>().props;

  const { data, setData, post, processing, errors } = useForm({
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    amount: invoice.remaining_amount,
    reference_number: '',
    bank_account: '',
    cash_bank_account_id: '',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post(`/invoices/${invoice.id}/pay`);
  }

  return (
    <AppLayout>
      <Head title={`Catat Pembayaran Invoice: ${invoice.invoice_number}`} />

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
            <h1 className="text-2xl font-bold text-gray-900">Catat Penerimaan Dana</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Invoice: {invoice.invoice_number} • Customer: {invoice.customer?.name}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Form Input */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Formulir Pembayaran</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payment Date */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Tanggal Pembayaran</label>
                  <input
                    type="date"
                    value={data.payment_date}
                    onChange={(e) => setData('payment_date', e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  {errors.payment_date && <p className="text-rose-500 text-xs">{errors.payment_date}</p>}
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Metode Pembayaran</label>
                  <select
                    value={data.payment_method}
                    onChange={(e) => setData('payment_method', e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                  >
                    <option value="bank_transfer">Transfer Bank</option>
                    <option value="cash">Tunai / Cash</option>
                    <option value="credit_card">Kartu Kredit</option>
                    <option value="debit_card">Kartu Debit</option>
                    <option value="e_wallet">E-Wallet</option>
                    <option value="other">Lainnya</option>
                  </select>
                  {errors.payment_method && <p className="text-rose-500 text-xs">{errors.payment_method}</p>}
                </div>

                {/* Cash/Bank Account */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Rekening Kas / Bank Penerima</label>
                  <select
                    id="cash_bank_account_id"
                    value={data.cash_bank_account_id}
                    onChange={(e) => setData('cash_bank_account_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                  >
                    <option value="">-- Pilih Rekening Kas / Bank --</option>
                    {cashBankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        [{account.account_code}] {account.account_name} ({account.account_type.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  {errors.cash_bank_account_id && <p className="text-rose-500 text-xs">{errors.cash_bank_account_id}</p>}
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Jumlah Bayar (Rupiah)</label>
                  <CurrencyInput
                    value={data.amount}
                    onChange={(v) => setData('amount', String(v))}
                    max={Number(invoice.remaining_amount)}
                    required
                    className="w-full pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all font-semibold"
                  />
                  {errors.amount && <p className="text-rose-500 text-xs">{errors.amount}</p>}
                </div>

                {/* Reference Number */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Nomor Referensi / Ref (Opsional)</label>
                  <input
                    type="text"
                    value={data.reference_number}
                    onChange={(e) => setData('reference_number', e.target.value)}
                    placeholder="Contoh: No. Resi transfer bank"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  {errors.reference_number && <p className="text-rose-500 text-xs">{errors.reference_number}</p>}
                </div>

                {/* Bank Account */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Akun Bank Penerima (Manual / Catatan)</label>
                  <input
                    type="text"
                    value={data.bank_account}
                    onChange={(e) => setData('bank_account', e.target.value)}
                    placeholder="Contoh: BCA 123456789"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  {errors.bank_account && <p className="text-rose-500 text-xs">{errors.bank_account}</p>}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-sm font-semibold text-gray-700">Catatan / Memo Pembayaran</label>
                <textarea
                  rows={4}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Catatan tambahan pembayaran..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400 resize-none"
                />
                {errors.notes && <p className="text-rose-500 text-xs">{errors.notes}</p>}
              </div>
            </div>
          </div>

          {/* Right Panel: Source Summary */}
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Tagihan Invoice</h2>

              <div className="space-y-3.5 text-sm border-b border-gray-200 pb-4">
                <div>
                  <span className="text-gray-500 block text-xs">Customer</span>
                  <span className="font-semibold text-gray-800 block mt-0.5">{invoice.customer ? invoice.customer.name : '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">No. Invoice</span>
                  <span className="font-semibold text-gray-800 block mt-0.5">{invoice.invoice_number}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Total Tagihan</span>
                  <span className="font-bold text-gray-900 block mt-0.5">
                    Rp {Number(invoice.total_amount).toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Telah Dibayar</span>
                  <span className="font-semibold text-emerald-400 block mt-0.5">
                    Rp {Number(invoice.paid_amount).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <span className="text-gray-500 block text-xs">Sisa Kewajiban</span>
                  <span className="font-extrabold text-rose-400 text-lg block mt-0.5">
                    Rp {Number(invoice.remaining_amount).toLocaleString('id-ID')}
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
                  {processing ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
