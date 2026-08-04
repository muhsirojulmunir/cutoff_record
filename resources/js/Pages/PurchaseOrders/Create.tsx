import React, { useEffect, useState } from 'react';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';
import * as XLSX from 'xlsx';
import { DP_50_RATIO, PO_PAYMENT_TERMS } from '@/Constants/purchaseOrder';
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
  subtotal: number;
}

export default function Create({ suppliers, warehouses, products }: PurchaseOrderCreateProps) {
  const { flash } = usePage<PageProps>().props;

  const { data, setData, post, processing, errors } = useForm({
    supplier_id: '',
    warehouse_id: '',
    order_date: new Date().toISOString().split('T')[0],
    payment_terms: 'cash',
    is_free_shipping: true,
    notes: '',
    items: [] as OrderItemInput[],
  });

  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);

  const [localItems, setLocalItems] = useState<OrderItemInput[]>([
    {
      product_id: '',
      sku: '',
      unit: 'pcs',
      price: 0,
      quantity: 1,
      subtotal: 0,
    },
  ]);

  /** Cocokkan SKU tanpa peduli huruf besar/kecil maupun spasi berlebih. */
  function findProductBySku(sku: string): Product | undefined {
    const needle = String(sku ?? '').trim().toLowerCase();
    if (needle === '') return undefined;
    return products.find((p) => p.sku.trim().toLowerCase() === needle);
  }

  // Sync local items with useForm items
  useEffect(() => {
    setData('items', localItems);
  }, [localItems]);

  function handleAddItem() {
    setLocalItems([
      ...localItems,
      {
        product_id: '',
        sku: '',
        unit: 'pcs',
        price: 0,
        quantity: 1,
        subtotal: 0,
      },
    ]);
  }

  /** Unduh template Excel: SKU, QTY, HARGA. */
  function handleDownloadTemplate() {
    const rows = [
      ['SKU', 'QTY', 'HARGA'],
      ...products.slice(0, 3).map((p) => [p.sku, 1, Number(p.purchase_price) || 0]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 16 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Item PO');
    XLSX.writeFile(workbook, 'Template_Item_PO.xlsx');
  }

  /** Baca file Excel dan isi daftar barang. Baris tanpa SKU dilewati. */
  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportInfo(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!raw || raw.length === 0) {
          setImportError('File Excel kosong atau tidak dapat dibaca.');
          return;
        }

        // Lewati baris header bila kolom pertama bertuliskan "sku".
        const startIndex = String(raw[0]?.[0] ?? '').trim().toLowerCase() === 'sku' ? 1 : 0;

        const parsed: OrderItemInput[] = [];
        const unknown: string[] = [];

        for (let i = startIndex; i < raw.length; i++) {
          const cols = raw[i];
          const sku = String(cols?.[0] ?? '').trim();
          if (sku === '') continue;

          const product = findProductBySku(sku);
          if (!product) unknown.push(sku);

          const quantity = Math.max(1, parseInt(String(cols?.[1] ?? 1), 10) || 1);
          const priceRaw = String(cols?.[2] ?? '').replace(/[^0-9]/g, '');
          const price = priceRaw === ''
            ? Number(product?.purchase_price) || 0
            : Number(priceRaw);

          parsed.push({
            product_id: product ? String(product.id) : '',
            sku,
            unit: 'pcs',
            price,
            quantity,
            subtotal: price * quantity,
          });
        }

        if (parsed.length === 0) {
          setImportError('Tidak ada baris berisi SKU pada file ini.');
          return;
        }

        setLocalItems(parsed);
        setImportInfo(
          unknown.length > 0
            ? `${parsed.length} baris dimuat. SKU tidak dikenal: ${unknown.join(', ')} — perbaiki dulu sebelum menyimpan.`
            : `${parsed.length} baris berhasil dimuat dari Excel.`
        );
      } catch (err: any) {
        setImportError('Gagal membaca file Excel: ' + (err?.message ?? err));
      }
    };

    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function handleRemoveItem(index: number) {
    const updated = [...localItems];
    updated.splice(index, 1);
    setLocalItems(updated);
  }

  function handleItemChange(index: number, key: keyof OrderItemInput, value: any) {
    const updated = [...localItems];
    const item = { ...updated[index] };

    if (key === 'sku') {
      // SKU boleh diketik atau ditempel; produk dicocokkan otomatis.
      const typed = String(value);
      const selectedProduct = findProductBySku(typed);

      item.sku = typed;
      item.unit = 'pcs';

      if (selectedProduct) {
        item.product_id = String(selectedProduct.id);
        // Harga beli terakhir jadi usulan, tapi tetap bisa diubah manual.
        if (!item.price) item.price = Number(selectedProduct.purchase_price) || 0;
      } else {
        item.product_id = '';
      }
    } else if (key === 'product_id') {
      const prodId = Number(value);
      const selectedProduct = products.find((p) => p.id === prodId);
      if (selectedProduct) {
        item.product_id = value;
        item.sku = selectedProduct.sku;
        item.unit = 'pcs';
        item.price = Number(selectedProduct.purchase_price);
      } else {
        item.product_id = '';
        item.sku = '';
        item.unit = 'pcs';
        item.price = 0;
      }
    } else {
      (item as any)[key] = value;
    }

    // Calculate subtotal for preview: (Price * Qty) - Discount + Tax
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    item.subtotal = price * qty;

    updated[index] = item;
    setLocalItems(updated);
  }

  // Calculate live summary
  const subtotal = localItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const grandTotal = subtotal;

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
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Buat Purchase Order</h1>
            <p className="text-gray-500 text-xs mt-0.5">Transaksi / Purchase Orders / Tambah</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Header Fields & Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Fields Card */}
            <div className="bg-white border border-gray-300/85 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Informasi Utama</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Supplier / Pabrik <span className="text-rose-500">*</span></label>
                  <select
                    value={data.supplier_id}
                    onChange={(e) => setData('supplier_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
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
                  <label className="block text-sm font-semibold text-gray-700">Gudang Penerimaan</label>
                  <select
                    value={data.warehouse_id}
                    onChange={(e) => setData('warehouse_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
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
                  <label className="block text-sm font-semibold text-gray-700">Tanggal Order <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={data.order_date}
                    onChange={(e) => setData('order_date', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  {errors.order_date && <p className="text-rose-500 text-xs">{errors.order_date}</p>}
                </div>

                {/* Pembayaran */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Pembayaran <span className="text-rose-500">*</span></label>
                  <select
                    value={data.payment_terms}
                    onChange={(e) => setData('payment_terms', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    {PO_PAYMENT_TERMS.map((term) => (
                      <option key={term.value} value={term.value}>{term.label}</option>
                    ))}
                  </select>
                  {data.payment_terms === 'dp_50' && grandTotal > 0 && (
                    <p className="text-[11px] text-gray-500">
                      Uang muka 50% ={' '}
                      <span className="font-mono font-bold text-gray-700">
                        Rp {Math.round(grandTotal * DP_50_RATIO).toLocaleString('id-ID')}
                      </span>
                    </p>
                  )}
                  {errors.payment_terms && <p className="text-rose-500 text-xs">{errors.payment_terms}</p>}
                </div>
              </div>
            </div>

            {/* Items Table Card */}
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4 shadow-xl">
              {/* Daftar SKU untuk autocomplete saat mengetik */}
              <datalist id="po-sku-options">
                {products.map((p) => (
                  <option key={p.id} value={p.sku}>{p.name}</option>
                ))}
              </datalist>

              <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Daftar Barang (Items)</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl border border-gray-300 transition-all"
                  >
                    Unduh Template
                  </button>
                  <label className="px-3.5 py-2 bg-white hover:bg-teal-50 text-teal-700 text-xs font-semibold rounded-xl border border-teal-300 transition-all cursor-pointer">
                    Import Excel
                    <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
                  </label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-blue-500/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Tambah Barang
                </button>
                </div>
              </div>

              {importError && (
                <p className="text-rose-600 text-xs font-semibold bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{importError}</p>
              )}
              {importInfo && (
                <p className="text-gray-600 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">{importInfo}</p>
              )}

              {errors.items && <p className="text-rose-500 text-xs font-semibold">{errors.items}</p>}

              {localItems.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-300 rounded-2xl text-gray-400 text-sm">
                  Belum ada barang ditambahkan. Klik tombol "Tambah Barang" di atas.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Table Header (Desktop) */}
                  <div className="hidden md:grid grid-cols-12 gap-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider px-3.5 py-2.5 bg-gray-50/80 border border-gray-300/80 rounded-xl">
                    <div className="col-span-3">SKU</div>
                    <div className="col-span-3">Nama Produk</div>
                    <div className="col-span-2">Qty</div>
                    <div className="col-span-2">Harga</div>
                    <div className="col-span-2 text-right">Aksi</div>
                  </div>

                  {localItems.map((item, index) => {
                    const matched = findProductBySku(item.sku);
                    return (
                      <div key={index} className="p-3.5 bg-gray-50 border border-gray-300/80 rounded-xl space-y-3 md:space-y-0">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                          {/* SKU — boleh diketik atau tempel langsung */}
                          <div className="md:col-span-3 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-gray-500">SKU</label>
                            <input
                              list="po-sku-options"
                              value={item.sku}
                              onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                              placeholder="Ketik / tempel SKU"
                              autoComplete="off"
                              className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300/80 text-gray-800 text-xs font-mono focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            />
                            {errors[`items.${index}.product_id`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.product_id`]}</p>}
                          </div>

                          {/* Nama produk terisi otomatis dari SKU */}
                          <div className="md:col-span-3 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-gray-500">Nama Produk</label>
                            <div className={`px-3 py-2 rounded-xl border text-xs truncate ${
                              matched
                                ? 'bg-gray-50 border-gray-300/80 text-gray-800'
                                : 'bg-rose-50 border-rose-200 text-rose-600'
                            }`}
                              title={matched?.name ?? 'SKU tidak ditemukan'}
                            >
                              {item.sku.trim() === ''
                                ? <span className="text-gray-400">Menunggu SKU…</span>
                                : (matched?.name ?? 'SKU tidak ditemukan')}
                            </div>
                          </div>

                          {/* Quantity */}
                          <div className="md:col-span-2 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-gray-500">Kuantitas (Qty)</label>
                            <CurrencyInput
                              hidePrefix
                              value={item.quantity}
                              onChange={(v) => handleItemChange(index, 'quantity', v)}
                              placeholder="1"
                              className="w-full px-2.5 py-2 rounded-xl bg-gray-50 border border-gray-300/80 text-gray-800 text-xs text-center focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all font-mono"
                            />
                            {errors[`items.${index}.quantity`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.quantity`]}</p>}
                          </div>

                          {/* Unit Price */}
                          <div className="md:col-span-2 space-y-1">
                            <label className="block md:hidden text-xs font-semibold text-gray-500">Harga Satuan (Rp)</label>
                            <div className="flex rounded-xl bg-gray-50 border border-gray-300/80 overflow-hidden focus-within:ring-2 focus-within:ring-teal-500">
                              <span className="px-2 py-2 text-[10px] font-bold text-gray-400 bg-gray-100/50 border-r border-gray-300/80 flex items-center shrink-0">Rp</span>
                              <CurrencyInput
                                hidePrefix
                                value={item.price}
                                onChange={(v) => handleItemChange(index, 'price', v)}
                                placeholder="0"
                                className="w-full px-2 py-2 bg-transparent text-gray-800 text-xs font-mono focus:outline-none min-w-0"
                              />
                            </div>
                            {errors[`items.${index}.price`] && <p className="text-rose-400 text-[10px]">{errors[`items.${index}.price`]}</p>}
                          </div>

                          {/* Subtotal & Delete Action */}
                          <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-gray-300">
                            <div className="text-left md:text-right overflow-hidden">
                              <span className="block md:hidden text-[10px] uppercase font-bold text-gray-400">Subtotal</span>
                              <span className="text-xs font-extrabold text-emerald-400 font-mono block truncate" title={`Rp ${item.subtotal.toLocaleString('id-ID')}`}>
                                Rp {item.subtotal.toLocaleString('id-ID')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              title="Hapus Baris"
                              className="p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all border border-gray-300 hover:border-rose-500/30 shrink-0"
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
            <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4 shadow-xl">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Kalkulasi & Summary</h2>

              {/* Live Totals */}
              <div className="space-y-3.5 divide-y divide-gray-100/80">
                {/* Subtotal */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-800 font-semibold">Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>

                {/* Ongkir */}
                <div className="pt-3 space-y-2">
                  <span className="text-gray-500">Ongkir</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: true, label: 'Free Ongkir' },
                      { value: false, label: 'Tidak Free' },
                    ].map((option) => (
                      <button
                        key={String(option.value)}
                        type="button"
                        onClick={() => setData('is_free_shipping', option.value)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all
                          ${data.is_free_shipping === option.value
                            ? 'bg-teal-50 border-teal-400 text-teal-700'
                            : 'bg-gray-50 border-gray-300 text-gray-500 hover:border-gray-400'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {data.is_free_shipping
                      ? 'Ongkir ditanggung pabrik, tidak menambah tagihan.'
                      : 'Nominal ongkir diisi admin saat penerimaan barang, karena ongkir dibayar ke kurir waktu barang datang.'}
                  </p>
                  {errors.is_free_shipping && <p className="text-rose-500 text-xs">{errors.is_free_shipping}</p>}
                </div>

                {/* Grand Total */}
                <div className="flex justify-between items-center pt-4">
                  <span className="text-base font-bold text-gray-900">Total Barang</span>
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
                <label className="block text-sm font-semibold text-gray-700">Catatan Internal</label>
                <textarea
                  rows={4}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <Link
                  href="/purchase-orders"
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
