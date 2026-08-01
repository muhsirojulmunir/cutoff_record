import React, { useEffect, useState } from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';
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
  unit: string | null;
}

interface DBOrderItem {
  product_id: number;
  sku: string;
  unit: string;
  price: string;
  quantity: number;
  discount_amount: string;
  tax_amount: string;
  subtotal: string;
}

interface DBSalesOrder {
  id: number;
  so_number: string;
  customer_id: number | null;
  order_date: string;
  source: string;
  sales_channel: string;
  notes: string | null;
  discount_amount: string;
  tax_amount: string;
  shipping_cost: string;
  grand_total: string;
  items: DBOrderItem[];
}

interface SalesOrderEditProps {
  salesOrder: DBSalesOrder;
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

export default function Edit({ salesOrder, customers, products }: SalesOrderEditProps) {
  const { flash } = usePage<PageProps>().props;

  // Map DB items to input items structure
  const initialItems: OrderItemInput[] = salesOrder.items.map((item) => ({
    product_id: item.product_id.toString(),
    sku: item.sku,
    unit: item.unit,
    price: Number(item.price),
    quantity: item.quantity,
    discount_amount: Number(item.discount_amount),
    tax_amount: Number(item.tax_amount),
    subtotal: Number(item.subtotal),
  }));

  const { data, setData, put, processing, errors } = useForm({
    customer_id: salesOrder.customer_id?.toString() ?? '',
    order_date: salesOrder.order_date.split('T')[0],
    source: salesOrder.source,
    sales_channel: salesOrder.sales_channel,
    notes: salesOrder.notes ?? '',
    discount_amount: Number(salesOrder.discount_amount),
    tax_amount: Number(salesOrder.tax_amount),
    shipping_cost: Number(salesOrder.shipping_cost),
    items: initialItems,
  });

  const [localItems, setLocalItems] = useState<OrderItemInput[]>(initialItems);

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
        item.unit = selectedProduct.unit ?? 'pcs';
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

    // Recalculate item subtotal
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const discount = Number(item.discount_amount) || 0;
    const tax = Number(item.tax_amount) || 0;
    item.subtotal = (price * qty) - discount + tax;

    updated[index] = item;
    setLocalItems(updated);
  }

  // Calculate live summary
  const subtotal = localItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountHeader = Number(data.discount_amount) || 0;
  const taxHeader = Number(data.tax_amount) || 0;
  const shippingHeader = Number(data.shipping_cost) || 0;
  const grandTotal = subtotal - discountHeader + taxHeader + shippingHeader;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    put(`/sales-orders/${salesOrder.id}`);
  }

  return (
    <AppLayout>
      <Head title={`Edit Sales Order — ${salesOrder.so_number}`} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href={`/sales-orders/${salesOrder.id}`}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Sales Order</h1>
            <p className="text-slate-400 text-xs mt-0.5">Transaksi / Sales Orders / {salesOrder.so_number} / Edit</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Header Fields & Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Fields Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Informasi Utama</h2>
                <span className="text-xs font-mono font-bold px-2.5 py-1 bg-violet-600/10 text-violet-400 border border-violet-500/20 rounded-lg">
                  {salesOrder.so_number}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Customer</label>
                  <select
                    value={data.customer_id}
                    onChange={(e) => setData('customer_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="">Pilih customer (Walk-in / Umum)...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>
                    ))}
                  </select>
                  {errors.customer_id && <p className="text-rose-400 text-xs mt-1">{errors.customer_id}</p>}
                </div>

                {/* Tanggal */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    Tanggal Order <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={data.order_date}
                    onChange={(e) => setData('order_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                    required
                  />
                  {errors.order_date && <p className="text-rose-400 text-xs mt-1">{errors.order_date}</p>}
                </div>

                {/* Sumber */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    Sumber Order <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={data.source}
                    onChange={(e) => setData('source', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                    required
                  >
                    <option value="manual">Manual</option>
                    <option value="marketplace">Marketplace</option>
                    <option value="website">Website</option>
                    <option value="other">Lainnya</option>
                  </select>
                  {errors.source && <p className="text-rose-400 text-xs mt-1">{errors.source}</p>}
                </div>

                {/* Channel */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    Sales Channel <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={data.sales_channel}
                    onChange={(e) => setData('sales_channel', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                    required
                  >
                    <option value="manual">Manual</option>
                    <option value="shopee">Shopee</option>
                    <option value="tiktok">TikTok Shop</option>
                    <option value="website">Website</option>
                    <option value="other">Lainnya</option>
                  </select>
                  {errors.sales_channel && <p className="text-rose-400 text-xs mt-1">{errors.sales_channel}</p>}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-sm font-semibold text-slate-300">Catatan</label>
                <textarea
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
                  placeholder="Masukkan instruksi pengiriman atau catatan penting..."
                />
                {errors.notes && <p className="text-rose-400 text-xs mt-1">{errors.notes}</p>}
              </div>
            </div>

            {/* Dynamic Items Table Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Item Transaksi</h2>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/10 hover:bg-violet-600/20 active:scale-95 text-violet-400 border border-violet-500/20 text-xs font-semibold rounded-lg transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Baris
                </button>
              </div>

              {errors.items && <p className="text-rose-400 text-xs">{errors.items}</p>}

              {localItems.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-sm">Belum ada item yang ditambahkan.</p>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-violet-400 font-semibold hover:underline mt-2 inline-block"
                  >
                    Tambah item pertama Anda
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {localItems.map((item, idx) => (
                    <div key={idx} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-4">
                      {/* Product Selector Row */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2 space-y-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Produk</label>
                          <select
                            value={item.product_id}
                            onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                          >
                            <option value="">Pilih Produk...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                          {errors[`items.${idx}.product_id` as any] && (
                            <p className="text-rose-400 text-[10px]">{errors[`items.${idx}.product_id` as any]}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">SKU / Unit</label>
                          <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-xs min-h-[34px] flex items-center justify-between">
                            <span>{item.sku}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-600 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                              {item.unit}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Calculations Row */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Kuantitas</label>
                          <CurrencyInput
                            hidePrefix
                            value={item.quantity}
                            onChange={(v) => handleItemChange(idx, 'quantity', v)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                            min="1"
                            required
                          />
                          {errors[`items.${idx}.quantity` as any] && (
                            <p className="text-rose-400 text-[10px]">{errors[`items.${idx}.quantity` as any]}</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Harga Satuan</label>
                          <CurrencyInput
                            hidePrefix
                            value={item.price}
                            onChange={(v) => handleItemChange(idx, 'price', v)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                            min="0"
                            required
                          />
                          {errors[`items.${idx}.price` as any] && (
                            <p className="text-rose-400 text-[10px]">{errors[`items.${idx}.price` as any]}</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Diskon Item</label>
                          <CurrencyInput
                            hidePrefix
                            value={item.discount_amount}
                            onChange={(v) => handleItemChange(idx, 'discount_amount', v)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                            min="0"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Pajak Item</label>
                          <CurrencyInput
                            hidePrefix
                            value={item.tax_amount}
                            onChange={(v) => handleItemChange(idx, 'tax_amount', v)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                            min="0"
                          />
                        </div>

                        <div className="col-span-2 md:col-span-2 flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Subtotal</label>
                            <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400 font-bold font-mono text-xs min-h-[32px] flex items-center justify-end whitespace-nowrap overflow-x-auto">
                              Rp {(item.subtotal || 0).toLocaleString('id-ID')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 transition-all shrink-0"
                            title="Hapus baris"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
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
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Ringkasan Biaya</h2>

              <div className="space-y-3 divide-y divide-slate-800/60 text-sm">
                {/* Subtotal */}
                <div className="flex justify-between items-center pb-3">
                  <span className="text-slate-500">Subtotal Item</span>
                  <span className="font-semibold text-slate-300">Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>

                {/* Diskon */}
                <div className="pt-3 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-500">Diskon Transaksi (Header)</label>
                  </div>
                  <CurrencyInput
                    hidePrefix
                    value={data.discount_amount}
                    onChange={(v) => setData('discount_amount', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.discount_amount && <p className="text-rose-400 text-xs">{errors.discount_amount}</p>}
                </div>

                {/* Pajak */}
                <div className="pt-3 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-500">Pajak Transaksi (Header)</label>
                  </div>
                  <CurrencyInput
                    hidePrefix
                    value={data.tax_amount}
                    onChange={(v) => setData('tax_amount', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.tax_amount && <p className="text-rose-400 text-xs">{errors.tax_amount}</p>}
                </div>

                {/* Ongkir */}
                <div className="pt-3 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-500">Biaya Pengiriman</label>
                  </div>
                  <CurrencyInput
                    hidePrefix
                    value={data.shipping_cost}
                    onChange={(v) => setData('shipping_cost', v)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    min="0"
                  />
                  {errors.shipping_cost && <p className="text-rose-400 text-xs">{errors.shipping_cost}</p>}
                </div>

                {/* Grand Total */}
                <div className="flex justify-between items-center pt-4">
                  <span className="text-base font-bold text-white">Grand Total</span>
                  <span className="text-base font-extrabold text-emerald-400">Rp {grandTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {flash.error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-lg text-rose-400 text-xs font-semibold leading-relaxed">
                  {flash.error}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-800/80">
                <Link
                  href={`/sales-orders/${salesOrder.id}`}
                  className="flex-1 text-center py-2.5 bg-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all border border-slate-800"
                >
                  Batal
                </Link>
                <button
                  type="submit"
                  disabled={processing || localItems.length === 0}
                  className="flex-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white font-semibold rounded-xl text-sm shadow-md shadow-violet-900/20 transition-all disabled:opacity-50"
                >
                  {processing ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
