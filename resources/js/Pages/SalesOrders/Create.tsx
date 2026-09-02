import React, { useEffect, useState } from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Customer {
  id: number;
  customer_code: string;
  name: string;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  selling_price: string;
}

interface SalesOrderCreateProps {
  customers: Customer[];
  products: Product[];
}

interface OrderItemInput {
  product_id: string;
  sku: string;
  unit: string;
  price: number;
  quantity: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
}

export default function Create({ customers, products }: SalesOrderCreateProps) {
  const { flash } = usePage<PageProps>().props;

  const { data, setData, post, processing, errors } = useForm({
    customer_id: '',
    order_date: new Date().toISOString().split('T')[0],
    payment_terms: 'cash',
    source: 'manual',
    sales_channel: 'shopee',
    notes: '',
    discount_amount: 0,
    tax_amount: 0,
    shipping_cost: 0,
    admin_fee: 0,
    other_fee: 0,
    dp_amount: 0,
    items: [] as OrderItemInput[],
  });

  const [localItems, setLocalItems] = useState<OrderItemInput[]>([
    {
      product_id: '',
      sku: '—',
      unit: 'pcs',
      price: 0,
      quantity: 1,
      discount_amount: 0,
      tax_amount: 0,
      subtotal: 0,
    },
  ]);

  // Sync local items with useForm items
  useEffect(() => {
    setData('items', localItems);
  }, [localItems]);

  function handleAddItem() {
    setLocalItems([
      ...localItems,
      {
        product_id: '',
        sku: '—',
        unit: 'pcs',
        price: 0,
        quantity: 1,
        discount_amount: 0,
        tax_amount: 0,
        subtotal: 0,
      },
    ]);
  }

  function handleRemoveItem(index: number) {
    const updated = [...localItems];
    updated.splice(index, 1);
    setLocalItems(updated);
  }

  function handleItemChange(index: number, key: keyof OrderItemInput, value: any) {
    const updated = [...localItems];
    const item = { ...updated[index] };

    if (key === 'product_id') {
      const prodId = Number(value);
      const selectedProduct = products.find((p) => p.id === prodId);
      if (selectedProduct) {
        item.product_id = value;
        item.sku = selectedProduct.sku;
        item.unit = 'pcs';
        item.price = Number(selectedProduct.selling_price);
      } else {
        item.product_id = '';
        item.sku = '—';
        item.unit = 'pcs';
        item.price = 0;
      }
    } else {
      (item as any)[key] = value;
    }

    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    item.subtotal = price * qty;

    updated[index] = item;
    setLocalItems(updated);
  }

  // Calculate live summary
  const subtotal = localItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountHeader = Number(data.discount_amount) || 0;
  const taxHeader = Number(data.tax_amount) || 0;
  const shippingHeader = Number(data.shipping_cost) || 0;
  const adminFeeHeader = Number(data.admin_fee) || 0;
  const otherFeeHeader = Number(data.other_fee) || 0;
  const dpAmount = Number(data.dp_amount) || 0;

  const grandTotal = Math.max(0, subtotal - discountHeader + taxHeader + shippingHeader + adminFeeHeader + otherFeeHeader);
  const sisaTagihan = Math.max(0, grandTotal - dpAmount);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/sales-orders');
  }

  return (
    <AppLayout>
      <Head title="Buat Sales Order Baru" />

      <div className="space-y-6">
        <Alert message={flash.success ?? null} type="success" />
        {flash.error && <Alert message={flash.error} type="error" />}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/sales-orders"
              className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Buat Sales Order</h1>
              <p className="text-gray-500 text-xs mt-0.5">Transaksi / Sales Orders / Tambah Manual</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/sales-orders/marketplace/import"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-semibold text-xs rounded-xl transition-all shadow-lg shadow-orange-200/40 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Import Excel Shopee / TikTok
            </Link>
            <Link
              href="/sales-orders/grosir/create"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl transition-all shadow-lg shadow-emerald-200/40 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Form Grosir (Offline)
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Header Fields & Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Fields Card */}
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Informasi Utama</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Customer</label>
                  <select
                    value={data.customer_id}
                    onChange={(e) => setData('customer_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="">Pilih customer (Walk-in / Umum)...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>
                    ))}
                  </select>
                  {errors.customer_id && <p className="text-rose-400 text-xs mt-1">{errors.customer_id}</p>}
                </div>

                {/* Order Date */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Tanggal Order</label>
                  <input
                    type="date"
                    value={data.order_date}
                    onChange={(e) => setData('order_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  {errors.order_date && <p className="text-rose-400 text-xs mt-1">{errors.order_date}</p>}
                </div>

                {/* Sales Channel */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Sales Channel</label>
                  <select
                    value={data.sales_channel}
                    onChange={(e) => setData('sales_channel', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="shopee">Shopee</option>
                    <option value="tiktok">TikTok Shop</option>
                    <option value="vip">VIP / Reseller</option>
                    <option value="grosir">Grosir Offline</option>
                    <option value="manual">Manual / Toko Fisik</option>
                    <option value="website">Website</option>
                    <option value="other">Lainnya</option>
                  </select>
                  {errors.sales_channel && <p className="text-rose-400 text-xs mt-1">{errors.sales_channel}</p>}
                </div>

                {/* Payment Terms */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Termin Pembayaran</label>
                  <select
                    value={data.payment_terms}
                    onChange={(e) => setData('payment_terms', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="cash">Cash / Tunai Langsung</option>
                    <option value="cod">COD (Bayar di Tempat)</option>
                    <option value="tempo_7">Tempo 7 Hari</option>
                    <option value="tempo_14">Tempo 14 Hari</option>
                    <option value="tempo_30">Tempo 30 Hari</option>
                  </select>
                  {errors.payment_terms && <p className="text-rose-400 text-xs mt-1">{errors.payment_terms}</p>}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">Catatan Pesanan</label>
                <textarea
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  rows={2}
                  placeholder="Instruksi khusus pengiriman / catatan pelanggan..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                />
                {errors.notes && <p className="text-rose-400 text-xs mt-1">{errors.notes}</p>}
              </div>
            </div>

            {/* Items Card */}
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Item Pesanan</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Pilih produk dan tentukan kuantitas pesanan</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-xs font-semibold border border-teal-300 hover:border-teal-400 transition-all cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Baris
                </button>
              </div>

              {errors.items && <p className="text-rose-400 text-xs">{errors.items}</p>}

              {localItems.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-xl">
                  <p className="text-sm text-gray-400">Belum ada item pesanan.</p>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="mt-2 text-xs text-teal-600 hover:underline font-semibold"
                  >
                    + Tambah item pertama
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {localItems.map((item, index) => (
                    <div key={index} className="p-4 rounded-xl bg-gray-50 border border-gray-300 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-bold text-gray-400 font-mono">#{index + 1}</span>
                        <div className="flex-1">
                          <select
                            value={item.product_id}
                            onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                          >
                            <option value="">Pilih produk...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
                          title="Hapus baris"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">SKU</label>
                          <input
                            type="text"
                            value={item.sku}
                            disabled
                            className="w-full px-3 py-1.5 rounded-lg bg-gray-200/50 border border-gray-300 text-gray-500 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Qty</label>
                          <CurrencyInput
                            hidePrefix
                            value={item.quantity}
                            onChange={(v) => handleItemChange(index, 'quantity', v)}
                            className="w-full px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            min="1"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Harga Satuan (Rp)</label>
                          <CurrencyInput
                            value={item.price}
                            onChange={(v) => handleItemChange(index, 'price', v)}
                            className="w-full px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Subtotal Item (Rp)</label>
                          <input
                            type="text"
                            value={`Rp ${(item.subtotal || 0).toLocaleString('id-ID')}`}
                            disabled
                            className="w-full px-3 py-1.5 rounded-lg bg-gray-200/50 border border-gray-300 text-emerald-600 font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Summary & Submit */}
          <div className="space-y-6">
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Ringkasan Biaya</h2>

              <div className="space-y-3 divide-y divide-gray-200/60 text-sm">
                {/* Subtotal */}
                <div className="flex justify-between items-center pb-3">
                  <span className="text-gray-400">Subtotal Item</span>
                  <span className="font-semibold text-gray-700">Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>

                {/* Ongkir — Opsional */}
                <div className="pt-3 space-y-1.5">
                  <label className="text-gray-400">Biaya Pengiriman <span className="text-gray-300 text-[10px]">(opsional)</span></label>
                  <CurrencyInput
                    hidePrefix
                    value={data.shipping_cost}
                    onChange={(v) => setData('shipping_cost', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-300 text-gray-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.shipping_cost && <p className="text-rose-400 text-xs">{errors.shipping_cost}</p>}
                </div>

                {/* Biaya Admin — Opsional */}
                <div className="pt-3 space-y-1.5">
                  <label className="text-teal-700 font-semibold text-xs">Biaya Admin <span className="text-gray-400 text-[10px]">(opsional)</span></label>
                  <CurrencyInput
                    hidePrefix
                    value={data.admin_fee}
                    onChange={(v) => setData('admin_fee', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border border-teal-300 text-gray-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.admin_fee && <p className="text-rose-400 text-xs">{errors.admin_fee}</p>}
                </div>

                {/* Biaya Lain-lain — Opsional */}
                <div className="pt-3 space-y-1.5">
                  <label className="text-teal-700 font-semibold text-xs">Biaya Lain-lain <span className="text-gray-400 text-[10px]">(opsional)</span></label>
                  <CurrencyInput
                    hidePrefix
                    value={data.other_fee}
                    onChange={(v) => setData('other_fee', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border border-teal-300 text-gray-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.other_fee && <p className="text-rose-400 text-xs">{errors.other_fee}</p>}
                </div>

                {/* Grand Total */}
                <div className="flex justify-between items-center pt-4">
                  <span className="text-base font-bold text-gray-900">Grand Total</span>
                  <span className="text-base font-extrabold text-emerald-600">Rp {grandTotal.toLocaleString('id-ID')}</span>
                </div>

                {/* DP / Uang Muka */}
                <div className="pt-3 space-y-1.5 border-t border-gray-200/60">
                  <div className="flex justify-between items-center">
                    <label className="text-gray-500 font-semibold text-sm">DP / Uang Muka</label>
                  </div>
                  <CurrencyInput
                    hidePrefix
                    value={data.dp_amount}
                    onChange={(v) => setData('dp_amount', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-300 text-gray-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.dp_amount && <p className="text-rose-400 text-xs">{errors.dp_amount}</p>}
                </div>

                {/* Sisa Tagihan */}
                {dpAmount > 0 && (
                  <div className="flex justify-between items-center p-3 rounded-xl bg-teal-50 border border-teal-200">
                    <span className="text-teal-700 font-bold text-sm">Sisa Tagihan</span>
                    <span className="text-teal-700 font-extrabold text-sm">Rp {sisaTagihan.toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-300/80">
                <Link
                  href="/sales-orders"
                  className="flex-1 text-center py-2.5 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-300 transition-all"
                >
                  Batal
                </Link>
                <button
                  type="submit"
                  disabled={processing || localItems.length === 0}
                  className="flex-2 px-6 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-95 text-white font-semibold rounded-xl text-sm shadow-lg shadow-teal-200/40 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {processing ? 'Menyimpan...' : 'Simpan SO'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
