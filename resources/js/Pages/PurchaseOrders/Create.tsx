import React, { useEffect, useState } from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';
import { PageProps } from '../../Types';

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
}

interface Warehouse {
  id: number;
  code: string;
  name: string;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  purchase_price: string;
  unit: string | null;
}

interface PurchaseOrderCreateProps {
  suppliers: Supplier[];
  warehouses: Warehouse[];
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

export default function Create({ suppliers, warehouses, products }: PurchaseOrderCreateProps) {
  const { flash } = usePage<PageProps>().props;

  const { data, setData, post, processing, errors } = useForm({
    supplier_id: '',
    warehouse_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    source: 'manual',
    notes: '',
    discount_amount: 0,
    tax_amount: 0,
    shipping_cost: 0,
    items: [] as OrderItemInput[],
  });

  const [localItems, setLocalItems] = useState<OrderItemInput[]>([]);

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
        item.price = Number(selectedProduct.purchase_price);
      } else {
        item.product_id = '';
        item.sku = '—';
        item.unit = 'pcs';
        item.price = 0;
      }
    } else {
      (item as any)[key] = value;
    }

    // Calculate subtotal for preview: (Price * Qty) - Discount + Tax
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
    post('/purchase-orders');
  }

  return (
    <AppLayout>
      <Head title="Buat Purchase Order Baru" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/purchase-orders"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Buat Purchase Order</h1>
            <p className="text-slate-400 text-xs mt-0.5">Transaksi / Purchase Orders / Tambah</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Header Fields & Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Fields Card */}
            <div className="bg-slate-950 border border-slate-800/85 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Informasi Utama</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Supplier / Pabrik <span className="text-rose-500">*</span></label>
                  <select
                    value={data.supplier_id}
                    onChange={(e) => setData('supplier_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="">Pilih Supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>
                    ))}
                  </select>
                  {errors.supplier_id && <p className="text-rose-500 text-xs">{errors.supplier_id}</p>}
                </div>

                {/* Warehouse */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Gudang Penerimaan</label>
                  <select
                    value={data.warehouse_id}
                    onChange={(e) => setData('warehouse_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="">Pilih Gudang (Opsional)...</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                  {errors.warehouse_id && <p className="text-rose-500 text-xs">{errors.warehouse_id}</p>}
                </div>

                {/* Order Date */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Tanggal Order <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={data.order_date}
                    onChange={(e) => setData('order_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                  {errors.order_date && <p className="text-rose-500 text-xs">{errors.order_date}</p>}
                </div>

                {/* Expected Delivery Date */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Estimasi Pengiriman</label>
                  <input
                    type="date"
                    value={data.expected_delivery_date}
                    onChange={(e) => setData('expected_delivery_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                  {errors.expected_delivery_date && <p className="text-rose-500 text-xs">{errors.expected_delivery_date}</p>}
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">Sumber PO</label>
                  <select
                    value={data.source}
                    onChange={(e) => setData('source', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="manual">Manual</option>
                    <option value="other">Lainnya</option>
                  </select>
                  {errors.source && <p className="text-rose-500 text-xs">{errors.source}</p>}
                </div>
              </div>
            </div>

            {/* Items Table Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Daftar Barang (Items)</h2>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Barang
                </button>
              </div>

              {errors.items && <p className="text-rose-500 text-xs font-semibold">{errors.items}</p>}

              {localItems.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm">
                  Belum ada barang ditambahkan. Klik tombol "Tambah Barang" di atas.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Table Header (Desktop) */}
                  <div className="hidden md:grid grid-cols-12 gap-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3.5 py-2.5 bg-slate-900/80 border border-slate-800/80 rounded-xl">
                    <div className="col-span-3">Produk</div>
                    <div className="col-span-1">Qty</div>
                    <div className="col-span-2">Harga Satuan</div>
                    <div className="col-span-2">Diskon Item</div>
                    <div className="col-span-2">Pajak Item</div>
                    <div className="col-span-2 text-right">Subtotal &amp; Aksi</div>
                  </div>

                  {localItems.map((item, index) => {
                    const displayUnit = item.unit && isNaN(Number(item.unit)) ? item.unit : 'pcs';
                    return (
                      <div key={index} className="p-3.5 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-3 md:space-y-0">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                          {/* Product Selector */}
                          <div className="md:col-span-3 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-slate-400">Produk</label>
                            <select
                              value={item.product_id}
                              onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-200 text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer truncate"
                            >
                              <option value="">Pilih Produk...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                            <div className="text-[10px] text-slate-400 font-mono px-1 flex justify-between">
                              <span className="truncate">SKU: <strong className="text-slate-300">{item.sku}</strong></span>
                              <span className="shrink-0 ml-1">Satuan: <strong className="text-slate-300">{displayUnit}</strong></span>
                            </div>
                            {errors[`items.${index}.product_id`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.product_id`]}</p>}
                          </div>

                          {/* Quantity */}
                          <div className="md:col-span-1 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-slate-400">Kuantitas (Qty)</label>
                            <CurrencyInput
                              hidePrefix
                              value={item.quantity}
                              onChange={(v) => handleItemChange(index, 'quantity', v)}
                              placeholder="1"
                              className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-200 text-xs text-center focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all font-mono"
                            />
                            {errors[`items.${index}.quantity`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.quantity`]}</p>}
                          </div>

                          {/* Unit Price */}
                          <div className="md:col-span-2 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-slate-400">Harga Satuan (Rp)</label>
                            <div className="flex rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                              <span className="px-2 py-2 text-[10px] font-bold text-slate-500 bg-slate-800/50 border-r border-slate-700/80 flex items-center shrink-0">Rp</span>
                              <CurrencyInput
                                hidePrefix
                                value={item.price}
                                onChange={(v) => handleItemChange(index, 'price', v)}
                                placeholder="0"
                                className="w-full px-2 py-2 bg-transparent text-slate-200 text-xs font-mono focus:outline-none min-w-0"
                              />
                            </div>
                            {errors[`items.${index}.price`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.price`]}</p>}
                          </div>

                          {/* Discount */}
                          <div className="md:col-span-2 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-slate-400">Diskon Item (Rp)</label>
                            <div className="flex rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                              <span className="px-2 py-2 text-[10px] font-bold text-slate-500 bg-slate-800/50 border-r border-slate-700/80 flex items-center shrink-0">Rp</span>
                              <CurrencyInput
                                hidePrefix
                                value={item.discount_amount}
                                onChange={(v) => handleItemChange(index, 'discount_amount', v)}
                                placeholder="0"
                                className="w-full px-2 py-2 bg-transparent text-slate-200 text-xs font-mono focus:outline-none min-w-0"
                              />
                            </div>
                            {errors[`items.${index}.discount_amount`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.discount_amount`]}</p>}
                          </div>

                          {/* Tax */}
                          <div className="md:col-span-2 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-slate-400">Pajak Item (Rp)</label>
                            <div className="flex rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                              <span className="px-2 py-2 text-[10px] font-bold text-slate-500 bg-slate-800/50 border-r border-slate-700/80 flex items-center shrink-0">Rp</span>
                              <CurrencyInput
                                hidePrefix
                                value={item.tax_amount}
                                onChange={(v) => handleItemChange(index, 'tax_amount', v)}
                                placeholder="0"
                                className="w-full px-2 py-2 bg-transparent text-slate-200 text-xs font-mono focus:outline-none min-w-0"
                              />
                            </div>
                            {errors[`items.${index}.tax_amount`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.tax_amount`]}</p>}
                          </div>

                          {/* Subtotal & Delete Action */}
                          <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                            <div className="text-left md:text-right overflow-hidden">
                              <span className="block md:hidden text-[10px] uppercase font-bold text-slate-500">Subtotal</span>
                              <span className="text-xs font-extrabold text-emerald-400 font-mono block truncate" title={`Rp ${item.subtotal.toLocaleString('id-ID')}`}>
                                Rp {item.subtotal.toLocaleString('id-ID')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              title="Hapus Baris"
                              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all border border-slate-800 hover:border-rose-500/30 shrink-0"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>

          {/* Right Panel: Live Calculation & Notes */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Kalkulasi & Summary</h2>

              {/* Live Totals */}
              <div className="space-y-3.5 divide-y divide-slate-900/80">
                {/* Subtotal */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Subtotal</span>
                  <span className="text-slate-200 font-semibold">Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>

                {/* Discount Header */}
                <div className="flex justify-between items-center pt-3">
                  <span className="text-slate-400">Diskon PO</span>
                  <CurrencyInput
                    hidePrefix
                    value={data.discount_amount}
                    onChange={(v) => setData('discount_amount', v)}
                    className="w-32 px-3 py-1 bg-slate-900 border border-slate-800 text-slate-200 text-sm text-right rounded-lg focus:ring-1 focus:ring-violet-500 focus:outline-none"
                  />
                </div>

                {/* Tax Header */}
                <div className="flex justify-between items-center pt-3">
                  <span className="text-slate-400">Pajak PO</span>
                  <CurrencyInput
                    hidePrefix
                    value={data.tax_amount}
                    onChange={(v) => setData('tax_amount', v)}
                    className="w-32 px-3 py-1 bg-slate-900 border border-slate-800 text-slate-200 text-sm text-right rounded-lg focus:ring-1 focus:ring-violet-500 focus:outline-none"
                  />
                </div>

                {/* Shipping Header */}
                <div className="flex justify-between items-center pt-3">
                  <span className="text-slate-400">Biaya Pengiriman</span>
                  <CurrencyInput
                    hidePrefix
                    value={data.shipping_cost}
                    onChange={(v) => setData('shipping_cost', v)}
                    className="w-32 px-3 py-1 bg-slate-900 border border-slate-800 text-slate-200 text-sm text-right rounded-lg focus:ring-1 focus:ring-violet-500 focus:outline-none"
                  />
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

              {/* Notes */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-sm font-semibold text-slate-300">Catatan Internal</label>
                <textarea
                  rows={4}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-900">
                <Link
                  href="/purchase-orders"
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
                  ) : (
                    <>Simpan Draft</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
