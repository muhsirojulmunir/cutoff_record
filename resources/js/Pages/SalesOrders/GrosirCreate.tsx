import React, { useMemo, useState } from 'react';
import { Head, Link, useForm, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import CurrencyInput from '../../Components/CurrencyInput';
import DecimalInput from '../../Components/DecimalInput';
import * as XLSX from 'xlsx';
import { downloadGrosirTemplateExcel } from '../../Utils/salesOrderExcel';

import { PageProps } from '../../Types';

interface Product {
  id: number;
  name: string;
  sku: string;
  selling_price: string;
  unit: string;
}

interface GrosirCreateProps {
  products: Product[];
}

/**
 * Urutan baku 17 kolom Excel Grosir (indeks 0-based):
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

/** Samakan penulisan header: huruf kecil, tanda baca jadi spasi tunggal. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cari indeks kolom dari baris header. Pencocokan bertingkat — sama persis,
 * lalu diawali kata kunci, baru mengandung kata kunci utuh. Kolom yang sudah
 * terpakai dilewati agar tidak tertukar.
 */
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

// Helper to parse numeric weight from strings like "15kg", "15.5 kg", "15"
function parseWeight(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

// Helper to parse numeric currency/prices from strings like "43200", "43.200", "Rp 43,200", "N"
function parseMoney(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str === 'N' || str === 'n' || str === 'Y' || str === 'y') return 0;
  const cleaned = str.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

// Helper to parse dates like "03-Sep-22", "03/09/2022", "2022-09-03", or Excel serial numbers
function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  
  const str = String(val).trim();
  if (!str) return new Date().toISOString().slice(0, 10);

  // If numeric Excel serial number (e.g. 44807)
  if (!isNaN(Number(str)) && Number(str) > 30000) {
    const excelDate = XLSX.SSF.parse_date_code(Number(str));
    if (excelDate) {
      const y = excelDate.y;
      const m = String(excelDate.m).padStart(2, '0');
      const d = String(excelDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // If text date like "03-Sep-22" or "03-Sep-2022"
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().slice(0, 10);
  }

  return str;
}

export default function GrosirCreate({ products }: GrosirCreateProps) {
  const { flash } = usePage<PageProps>().props;

  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('manual');
  const [excelError, setExcelError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [submittingBatch, setSubmittingBatch] = useState(false);

  /**
   * Cocokkan SKU seperti yang dilakukan server: sama persis dulu, baru cocok
   * sebagian. Baris dengan SKU tak dikenal ditolak sejak di layar.
   */
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

  // Manual Form
  const { data, setData, post, processing, errors } = useForm({
    tracking_number: '',
    payment_date: new Date().toISOString().slice(0, 10),
    recipient_name: '',
    account_name: 'Grosir Offline',
    sku: '',
    quantity: 1,
    unit_price: 0,
    voucher: 0,
    tax: 0,
    shipping_cost: 0,
    admin_fee: 0,
    other_fee: 0,
    total_weight: 0,
    shipping_address: '',
    customer_phone: '',
    city: '',
    province: '',
    dp_amount: 0,
  });

  // Calculate Auto Total: (QTY * Satuan Harga) - Voucher + Pajak + Ongkir + Biaya Admin + Biaya Lain-lain
  const qty = Number(data.quantity) || 0;
  const unitPrice = Number(data.unit_price) || 0;
  const voucher = Number(data.voucher) || 0;
  const tax = Number(data.tax) || 0;
  const shippingCost = Number(data.shipping_cost) || 0;
  const adminFee = Number(data.admin_fee) || 0;
  const otherFee = Number(data.other_fee) || 0;
  const autoGrandTotal = Math.max(0, (qty * unitPrice) - voucher + tax + shippingCost + adminFee + otherFee);

  function handleProductSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedSku = e.target.value;
    const prod = products.find((p) => p.sku === selectedSku);
    if (prod) {
      setData((prev) => ({
        ...prev,
        sku: prod.sku,
        unit_price: Number(prod.selling_price) || 0,
      }));
    } else {
      setData('sku', selectedSku);
    }
  }

  function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    post('/sales-orders/grosir/store');
  }

  function handleDownloadTemplate() {
    const availableSkus = products.map((p) => p.sku);
    downloadGrosirTemplateExcel(availableSkus);
  }

  // Parse Native Excel File (.xlsx / .xls)
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

        // Header detection
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

        // Dipetakan sesuai urutan baku 17 kolom
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
          const recipientName = cols[nameIdx] !== undefined ? String(cols[nameIdx]).trim() : 'Customer Grosir';
          const accountName = cols[accountIdx] !== undefined ? String(cols[accountIdx]).trim() : 'Grosir Offline';
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
      <Head title="Input Form Pesanan Grosir & Import Excel" />

      <div className="space-y-6 max-w-5xl mx-auto">
        <Alert message={flash.error ?? null} type="error" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Form Pesanan Grosir &amp; Import Excel</h1>
            <p className="text-gray-500 text-xs mt-1">
              Cust Deal $\rightarrow$ Submit Form / Upload File Excel (17 Kolom) $\rightarrow$ Auto Invoice Terbit $\rightarrow$ Masuk Finance &amp; Delivery Order
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold border border-emerald-300 hover:border-emerald-400 transition-all shadow-sm cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Template Excel (17 Kolom)
            </button>
            <Link
              href="/sales-orders"
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-xs font-semibold border border-teal-300 hover:border-teal-400 transition-all"
            >
              ← Kembali ke Sales Orders
            </Link>
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
            📝 Form Manual (Presisi Kolom)
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
            📊 Upload File Excel (.xlsx / .xls)
          </button>
        </div>

        {/* TAB 1: FORM MANUAL */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSubmitManual} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200 pb-3">
              Data Transaksi &amp; Pengiriman
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Resi / AWB */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">1. Resi / AWB (Opsional)</label>
                <input
                  type="text"
                  value={data.tracking_number}
                  onChange={(e) => setData('tracking_number', e.target.value)}
                  placeholder="Contoh: JNT12345678"
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 2. Waktu Pembayaran */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">2. Waktu Pembayaran</label>
                <input
                  type="date"
                  value={data.payment_date}
                  onChange={(e) => setData('payment_date', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 3. Nama Penerima */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">3. Nama Penerima *</label>
                <input
                  type="text"
                  required
                  value={data.recipient_name}
                  onChange={(e) => setData('recipient_name', e.target.value)}
                  placeholder="Nama Customer Grosir"
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
                {errors.recipient_name && <p className="text-rose-400 text-xs mt-1">{errors.recipient_name}</p>}
              </div>

              {/* 4. Nama Akun */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">4. Nama Akun / Store Channel</label>
                <input
                  type="text"
                  value={data.account_name}
                  onChange={(e) => setData('account_name', e.target.value)}
                  placeholder="Grosir Offline / Toko Utama"
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 5. SKU */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">5. Pilih Produk / SKU *</label>
                <select
                  value={data.sku}
                  onChange={handleProductSelect}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                >
                  <option value="">-- Pilih dari Master Produk --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.sku}>
                      {p.sku} - {p.name} (Rp {Number(p.selling_price).toLocaleString('id-ID')})
                    </option>
                  ))}
                </select>
                {errors.sku && <p className="text-rose-400 text-xs mt-1">{errors.sku}</p>}
              </div>

              {/* 6. QTY */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">6. QTY *</label>
                <CurrencyInput
                  hidePrefix
                  placeholder="1"
                  required
                  value={data.quantity}
                  onChange={(v) => setData('quantity', v)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 7. Satuan Harga */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">7. Satuan Harga (Rp) *</label>
                <CurrencyInput
                  required
                  value={data.unit_price}
                  onChange={(v) => setData('unit_price', v)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 8. Voucher */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">8. Voucher / Diskon (Rp)</label>
                <CurrencyInput
                  value={data.voucher}
                  onChange={(v) => setData('voucher', v)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 9. Pajak */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">9. Pajak (Rp)</label>
                <CurrencyInput
                  value={data.tax}
                  onChange={(v) => setData('tax', v)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 10. Ongkir */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">10. Ongkir (Rp)</label>
                <CurrencyInput
                  value={data.shipping_cost}
                  onChange={(v) => setData('shipping_cost', v)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 11. Biaya Admin */}
              <div>
                <label className="block text-xs font-medium text-teal-700 mb-1">11. Biaya Admin (Rp)</label>
                <CurrencyInput
                  value={data.admin_fee}
                  onChange={(v) => setData('admin_fee', v)}
                  placeholder="0"
                  className="w-full bg-gray-50 border border-teal-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 12. Biaya Lain-lain */}
              <div>
                <label className="block text-xs font-medium text-teal-700 mb-1">12. Biaya Lain-lain (Rp)</label>
                <CurrencyInput
                  value={data.other_fee}
                  onChange={(v) => setData('other_fee', v)}
                  placeholder="0"
                  className="w-full bg-gray-50 border border-teal-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 13. Total Berat Barang */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">13. Total Berat Barang (Kg)</label>
                <DecimalInput
                  suffix="Kg"
                  value={data.total_weight}
                  onChange={(v) => setData('total_weight', v)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 14. No. Telp */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">14. No. Telp Customer</label>
                <input
                  type="text"
                  value={data.customer_phone}
                  onChange={(e) => setData('customer_phone', e.target.value)}
                  placeholder="0812xxxx"
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 15. Kota */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">15. Kota</label>
                <input
                  type="text"
                  value={data.city}
                  onChange={(e) => setData('city', e.target.value)}
                  placeholder="Kota / Kabupaten"
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 16. Provinsi */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">16. Provinsi</label>
                <input
                  type="text"
                  value={data.province}
                  onChange={(e) => setData('province', e.target.value)}
                  placeholder="Provinsi"
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* 17. DP Amount */}
              <div>
                <label className="block text-xs font-medium text-orange-600 mb-1">17. Uang Muka / DP Dibayar (Rp)</label>
                <CurrencyInput
                  value={data.dp_amount}
                  onChange={(v) => setData('dp_amount', v)}
                  placeholder="0 (Jika DP, sisa jadi Piutang)"
                  className="w-full bg-gray-50 border border-orange-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-orange-200"
                />
                <p className="text-[10px] text-gray-500 mt-1">Jika diisi DP, sisa tagihan masuk ke Finance Piutang Customer.</p>
              </div>
            </div>

            {/* Alamat Penerima */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Alamat Penerima Lengkap</label>
              <textarea
                rows={2}
                value={data.shipping_address}
                onChange={(e) => setData('shipping_address', e.target.value)}
                placeholder="Alamat lengkap pengiriman barang..."
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* AUTO Total Summary Banner */}
            <div className="bg-gray-50/80 border border-gray-300 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Auto Grand Total</span>
                <span className="text-2xl font-extrabold text-emerald-600">
                  Rp {autoGrandTotal.toLocaleString('id-ID')}
                </span>
                <span className="text-xs text-gray-500 block mt-0.5">
                  Formula: ({qty} x Rp {unitPrice.toLocaleString('id-ID')}) - Voucher Rp {voucher.toLocaleString('id-ID')} + Pajak Rp {tax.toLocaleString('id-ID')} + Ongkir Rp {shippingCost.toLocaleString('id-ID')} + Admin Rp {adminFee.toLocaleString('id-ID')} + Lain-lain Rp {otherFee.toLocaleString('id-ID')}
                </span>
              </div>
              <button
                type="submit"
                disabled={processing}
                className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-bold border border-teal-500/30 transition-all shadow-lg hover:shadow-teal-200/40 cursor-pointer disabled:opacity-60"
              >
                {processing ? 'Memproses...' : 'Submit & Terbitkan Invoice Grosir'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: UPLOAD FILE EXCEL (.xlsx / .xls) */}
        {activeTab === 'excel' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Upload File Excel Pesanan Sales Order / Grosir (.xlsx / .xls)
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
                <span className="text-xs text-gray-500 block mt-1">Format file didukung: .xlsx atau .xls (Bisa pakai template yang telah disediakan)</span>
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
                      : `Submit & Buat ${parsedRows.length} Sales Order Grosir`}
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
