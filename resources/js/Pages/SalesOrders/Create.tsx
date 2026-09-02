import React, { useEffect, useMemo, useState } from 'react';
import { Head, Link, useForm, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import CurrencyInput from '@/Components/CurrencyInput';
import * as XLSX from 'xlsx';
import { PageProps } from '../../Types';
import { downloadGrosirTemplateExcel } from '../../Utils/salesOrderExcel';

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

/**
 * Urutan baku 17 kolom Excel Sales Order (indeks 0-based):
 * 0 Resi/AWB · 1 Waktu Pembayaran · 2 Nama Penerima · 3 Nama Akun · 4 SKU ·
 * 5 QTY · 6 Satuan Harga · 7 Voucher · 8 Pajak · 9 Total Berat Barang ·
 * 10 Alamat Penerima · 11 No. Telp · 12 Kota · 13 Provinsi ·
 * 14 Biaya Admin · 15 Biaya Lain-lain · 16 DP
 */
const COL = {
  resi: 0, date: 1, name: 2, account: 3, sku: 4, qty: 5, price: 6,
  voucher: 7, tax: 8, weight: 9, address: 10, phone: 11, city: 12, province: 13,
  admin: 14, other_fee: 15, dp: 16,
} as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getColIdx(headers: string[], keywords: string[], fallbackIdx: number, taken: Set<number>): number {
  if (!headers || headers.length === 0) return fallbackIdx;

  const normalized = headers.map(normalizeHeader);
  const keys = keywords.map(normalizeHeader).filter(Boolean);

  const findBy = (predicate: (header: string) => boolean): number =>
    normalized.findIndex((header, idx) => header !== '' && !taken.has(idx) && predicate(header));

  let idx = findBy((header) => keys.some((key) => header === key));
  if (idx === -1) idx = findBy((header) => keys.some((key) => header.startsWith(key)));
  if (idx === -1) idx = findBy((header) => keys.some((key) => new RegExp(`\\b${escapeRegExp(key)}\\b`).test(header)));

  return idx !== -1 ? idx : fallbackIdx;
}

function parseWeight(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

function parseMoney(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str === 'N' || str === 'n' || str === 'Y' || str === 'y') return 0;
  const cleaned = str.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  
  const str = String(val).trim();
  if (!str) return new Date().toISOString().slice(0, 10);

  if (!isNaN(Number(str)) && Number(str) > 30000) {
    const excelDate = XLSX.SSF.parse_date_code(Number(str));
    if (excelDate) {
      const y = excelDate.y;
      const m = String(excelDate.m).padStart(2, '0');
      const d = String(excelDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().slice(0, 10);
  }

  return str;
}

export default function Create({ customers, products }: SalesOrderCreateProps) {
  const { flash } = usePage<PageProps>().props;

  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('manual');
  const [excelError, setExcelError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Manual Form State
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

  function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    post('/sales-orders');
  }

  function handleDownloadTemplate() {
    const availableSkus = products.map((p) => p.sku);
    downloadGrosirTemplateExcel(availableSkus);
  }

  // Excel Upload & Parsing
  const unknownSkuRows = useMemo(() => {
    const skus = products.map((p) => p.sku.toLowerCase());

    return parsedRows
      .map((row, idx) => ({ row, no: idx + 1 }))
      .filter(({ row }) => {
        const sku = String(row.sku ?? '').trim().toLowerCase();
        if (!sku) return true;
        return !skus.some((known) => known === sku || known.includes(sku));
      });
  }, [parsedRows, products]);

  const hasUnknownSku = unknownSkuRows.length > 0;

  function handleExcelFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setExcelError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rawData || rawData.length === 0) {
          setExcelError('File Excel kosong atau tidak dapat dibaca.');
          setParsedRows([]);
          return;
        }

        let headerRow: string[] = [];
        let startIdx = 0;

        if (rawData.length > 0 && Array.isArray(rawData[0])) {
          const firstLineStr = rawData[0].map((c) => String(c || '').toLowerCase()).join(' ');
          if (
            firstLineStr.includes('sku') ||
            firstLineStr.includes('resi') ||
            firstLineStr.includes('penerima') ||
            firstLineStr.includes('waktu') ||
            firstLineStr.includes('admin')
          ) {
            headerRow = rawData[0].map((c) => String(c || '').trim());
            startIdx = 1;
          }
        }

        const taken = new Set<number>();
        const resolve = (keywords: string[], fallbackIdx: number): number => {
          const idx = getColIdx(headerRow, keywords, fallbackIdx, taken);
          taken.add(idx);
          return idx;
        };

        const resiIdx     = resolve(['resi', 'awb', 'no resi', 'tracking'], COL.resi);
        const dateIdx     = resolve(['waktu pembayaran', 'waktu', 'tanggal bayar', 'tanggal'], COL.date);
        const nameIdx     = resolve(['nama penerima', 'penerima', 'customer'], COL.name);
        const accountIdx  = resolve(['nama akun', 'akun', 'channel'], COL.account);
        const skuIdx      = resolve(['sku', 'kode barang', 'kode'], COL.sku);
        const qtyIdx      = resolve(['qty', 'jumlah', 'kuantitas'], COL.qty);
        const priceIdx    = resolve(['satuan harga', 'harga satuan', 'harga'], COL.price);
        const voucherIdx  = resolve(['voucher', 'diskon', 'potongan'], COL.voucher);
        const taxIdx      = resolve(['pajak', 'ppn'], COL.tax);
        const weightIdx   = resolve(['total berat barang', 'berat', 'weight'], COL.weight);
        const addressIdx  = resolve(['alamat penerima', 'alamat'], COL.address);
        const phoneIdx    = resolve(['no telp', 'telp', 'telepon', 'no hp', 'hp', 'whatsapp', 'wa'], COL.phone);
        const cityIdx     = resolve(['kota', 'kabupaten'], COL.city);
        const provinceIdx = resolve(['provinsi', 'propinsi'], COL.province);
        const adminIdx    = resolve(['biaya admin', 'admin fee', 'admin', 'penanganan'], COL.admin);
        const otherFeeIdx = resolve(['biaya lain lain', 'biaya lain', 'biaya lainnya', 'other fee', 'lain lain', 'lainnya'], COL.other_fee);
        const dpIdx       = resolve(['dp', 'uang muka', 'down payment', 'dibayar'], COL.dp);

        const rows: any[] = [];

        for (let i = startIdx; i < rawData.length; i++) {
          const cols = rawData[i];
          if (!cols || cols.length < 3) continue;

          const rawSku = cols[skuIdx];
          const skuVal = rawSku !== null && rawSku !== undefined ? String(rawSku).trim() : '';
          if (!skuVal) continue;

          const trackingNo = cols[resiIdx] !== undefined ? String(cols[resiIdx]).trim() : '';
          const payDate = parseExcelDate(cols[dateIdx]);
          const recipientName = cols[nameIdx] !== undefined ? String(cols[nameIdx]).trim() : 'Customer Sales Order';
          const accountName = cols[accountIdx] !== undefined ? String(cols[accountIdx]).trim() : 'Manual';
          const quantity = Math.max(1, parseInt(String(cols[qtyIdx] || 1)) || 1);
          const unitPrice = parseMoney(cols[priceIdx]);
          const voucher = parseMoney(cols[voucherIdx]);
          const tax = parseMoney(cols[taxIdx]);
          const totalWeight = parseWeight(cols[weightIdx]);
          const shippingAddress = cols[addressIdx] !== undefined ? String(cols[addressIdx]).trim() : '';
          const customerPhone = cols[phoneIdx] !== undefined ? String(cols[phoneIdx]).trim() : '';
          const city = cols[cityIdx] !== undefined ? String(cols[cityIdx]).trim() : '';
          const province = cols[provinceIdx] !== undefined ? String(cols[provinceIdx]).trim() : '';
          const adminFeeVal = parseMoney(cols[adminIdx]);
          const otherFeeVal = parseMoney(cols[otherFeeIdx]);
          const dpVal = parseMoney(cols[dpIdx]);

          rows.push({
            tracking_number: trackingNo,
            payment_date: payDate,
            recipient_name: recipientName,
            account_name: accountName,
            sku: skuVal,
            quantity: quantity,
            unit_price: unitPrice,
            voucher: voucher,
            tax: tax,
            admin_fee: adminFeeVal,
            other_fee: otherFeeVal,
            dp_amount: dpVal,
            total_weight: totalWeight,
            shipping_address: shippingAddress,
            customer_phone: customerPhone,
            city: city,
            province: province,
          });
        }

        if (rows.length === 0) {
          setExcelError('Tidak ditemukan baris data valid dengan kolom SKU pada file Excel ini.');
        }
        setParsedRows(rows);
      } catch (err: any) {
        setExcelError('Gagal membaca file Excel: ' + (err.message || err));
        setParsedRows([]);
      }
    };
    reader.readAsBinaryString(file);
  }

  function handleSubmitBatch() {
    if (parsedRows.length === 0 || hasUnknownSku || submittingBatch) return;

    setSubmittingBatch(true);
    setExcelError(null);

    router.post(
      '/sales-orders/grosir/store',
      { orders: parsedRows },
      {
        onError: (errs) => {
          const message = Object.values(errs)[0];
          setExcelError(message ?? 'Gagal mengirim data. Periksa kembali isi file Excel.');
        },
        onFinish: () => setSubmittingBatch(false),
      }
    );
  }

  return (
    <AppLayout>
      <Head title="Buat Sales Order / Import Excel" />

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
              <p className="text-gray-500 text-xs mt-0.5">Transaksi / Sales Orders / Tambah</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center justify-center gap-2 px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold border border-emerald-300 hover:border-emerald-400 transition-all shadow-sm cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Template Excel (17 Kolom)
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-300 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'manual'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            📝 Form Manual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('excel')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'excel'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            📊 Import File Excel (.xlsx / .xls - 17 Kolom)
          </button>
        </div>

        {/* TAB 1: FORM MANUAL */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSubmitManual} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        )}

        {/* TAB 2: UPLOAD & IMPORT FILE EXCEL */}
        {activeTab === 'excel' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Upload File Excel Pesanan Sales Order (.xlsx / .xls)
                </h2>
                <p className="text-xs text-gray-500">
                  Format Urutan 17 Kolom Header Excel:
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Unduh Format Template
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 leading-relaxed font-mono overflow-x-auto">
              Resi / AWB | Waktu Pembayaran | Nama Penerima | Nama Akun | SKU | QTY | Satuan Harga | Voucher | Pajak | Total Berat Barang | Alamat Penerima | No. Telp | Kota | Provinsi | <strong className="text-teal-700">Biaya Admin</strong> | <strong className="text-teal-700">Biaya Lain-lain</strong> | <strong className="text-orange-600">DP</strong>
            </div>

            {/* Excel Upload Area */}
            <div className="border-2 border-dashed border-gray-300 hover:border-emerald-500/50 rounded-2xl p-8 text-center transition-all bg-teal-50/40">
              <div className="mx-auto w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <label htmlFor="excel-file-input" className="cursor-pointer block">
                <span className="text-sm font-bold text-emerald-700 hover:underline">Pilih / Upload File Excel</span>
                <span className="text-xs text-gray-500 block mt-1">Format file didukung: .xlsx atau .xls (Gunakan template 17 kolom yang disediakan)</span>
                <input
                  id="excel-file-input"
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleExcelFileUpload}
                  className="hidden"
                />
              </label>
              {fileName && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs font-semibold rounded-lg">
                  📄 {fileName}
                </div>
              )}
            </div>

            {excelError && <Alert message={excelError} type="error" />}

            {hasUnknownSku && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                <p className="text-sm font-semibold text-rose-600">
                  {unknownSkuRows.length} baris memakai SKU yang tidak ada di master produk
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Perbaiki SKU berikut di file Excel, lalu upload ulang. Data belum dikirim.
                </p>
                <ul className="mt-2.5 space-y-1">
                  {unknownSkuRows.slice(0, 10).map(({ row, no }) => (
                    <li key={no} className="text-xs text-gray-700">
                      Baris <span className="font-mono text-gray-900">{no}</span> —{' '}
                      <span className="font-mono text-rose-600 font-bold">{row.sku || '(SKU kosong)'}</span>
                      <span className="text-gray-400"> · {row.recipient_name || 'tanpa nama penerima'}</span>
                    </li>
                  ))}
                  {unknownSkuRows.length > 10 && (
                    <li className="text-xs text-gray-400">…dan {unknownSkuRows.length - 10} baris lainnya.</li>
                  )}
                </ul>
              </div>
            )}

            {/* Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Preview Data Excel ({parsedRows.length} Pesanan SIAP DITERBITKAN)
                  </h3>
                  <button
                    type="button"
                    onClick={handleSubmitBatch}
                    disabled={submittingBatch || hasUnknownSku}
                    title={hasUnknownSku ? 'Masih ada SKU yang tidak dikenali' : undefined}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-200/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {submittingBatch
                      ? 'Mengirim & Menerbitkan...'
                      : `Submit & Buat ${parsedRows.length} Sales Order`}
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-teal-50/60 text-gray-600 text-[10px] font-bold uppercase border-b border-gray-200">
                      <tr>
                        <th className="p-2.5">No</th>
                        <th className="p-2.5">Resi</th>
                        <th className="p-2.5">Penerima</th>
                        <th className="p-2.5">Akun</th>
                        <th className="p-2.5">SKU</th>
                        <th className="p-2.5 text-center">QTY</th>
                        <th className="p-2.5 text-right">Harga</th>
                        <th className="p-2.5 text-right">Voucher</th>
                        <th className="p-2.5 text-right">Pajak</th>
                        <th className="p-2.5 text-right text-teal-700">Admin</th>
                        <th className="p-2.5 text-right text-teal-700">Lain-lain</th>
                        <th className="p-2.5 text-right text-orange-600">DP</th>
                        <th className="p-2.5 text-right">Grand Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {parsedRows.map((r, idx) => {
                        const total = Math.max(
                          0,
                          (r.quantity * r.unit_price) - (r.voucher || 0) + (r.tax || 0) + (r.admin_fee || 0) + (r.other_fee || 0)
                        );
                        return (
                          <tr key={idx} className="hover:bg-teal-50/30 transition-colors">
                            <td className="p-2.5 font-mono">{idx + 1}</td>
                            <td className="p-2.5 font-mono text-teal-600">{r.tracking_number || '—'}</td>
                            <td className="p-2.5 font-semibold text-gray-900">{r.recipient_name}</td>
                            <td className="p-2.5 text-gray-500">{r.account_name}</td>
                            <td className="p-2.5 font-mono text-blue-600 font-bold">{r.sku}</td>
                            <td className="p-2.5 text-center font-bold">{r.quantity}</td>
                            <td className="p-2.5 text-right">Rp {r.unit_price.toLocaleString('id-ID')}</td>
                            <td className="p-2.5 text-right text-orange-600">Rp {(r.voucher || 0).toLocaleString('id-ID')}</td>
                            <td className="p-2.5 text-right text-rose-500">Rp {(r.tax || 0).toLocaleString('id-ID')}</td>
                            <td className="p-2.5 text-right text-teal-700 font-semibold">Rp {(r.admin_fee || 0).toLocaleString('id-ID')}</td>
                            <td className="p-2.5 text-right text-teal-700 font-semibold">Rp {(r.other_fee || 0).toLocaleString('id-ID')}</td>
                            <td className="p-2.5 text-right text-orange-600 font-semibold">Rp {(r.dp_amount || 0).toLocaleString('id-ID')}</td>
                            <td className="p-2.5 text-right font-extrabold text-emerald-600">
                              Rp {total.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
