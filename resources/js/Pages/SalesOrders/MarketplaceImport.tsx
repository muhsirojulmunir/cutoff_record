import React, { useMemo, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import * as XLSX from 'xlsx';
import { PageProps } from '../../Types';
import {
  ParsedMarketplaceOrder,
  parseShopeeExcel,
  parseTikTokExcel,
  downloadShopeeTemplateExcel,
  downloadTikTokTemplateExcel,
} from '../../Utils/marketplaceExcel';

interface Product {
  id: number;
  sku: string;
  name: string;
  selling_price: string;
}

interface MarketplaceImportProps {
  products: Product[];
}

export default function MarketplaceImport({ products }: MarketplaceImportProps) {
  const { flash } = usePage<PageProps>().props;

  const [activeTab, setActiveTab] = useState<'shopee' | 'tiktok'>('shopee');
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedOrders, setParsedOrders] = useState<ParsedMarketplaceOrder[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Daftar SKU yang ada di database (huruf kecil untuk pencocokan)
  const knownSkus = useMemo(() => {
    return products.map((p) => p.sku.toLowerCase().trim());
  }, [products]);

  // Validasi apakah ada SKU yang tidak ditemukan di master data
  const invalidSkuItems = useMemo(() => {
    const invalid: { orderId: string; recipient: string; sku: string; productName: string }[] = [];

    parsedOrders.forEach((order) => {
      order.items.forEach((item) => {
        const itemSku = item.sku.toLowerCase().trim();
        if (!itemSku || itemSku === 'no-sku') {
          invalid.push({
            orderId: order.external_order_id,
            recipient: order.recipient_name,
            sku: item.sku,
            productName: item.product_name,
          });
        } else {
          const match = knownSkus.some((k) => k === itemSku || k.includes(itemSku));
          if (!match) {
            invalid.push({
              orderId: order.external_order_id,
              recipient: order.recipient_name,
              sku: item.sku,
              productName: item.product_name,
            });
          }
        }
      });
    });

    return invalid;
  }, [parsedOrders, knownSkus]);

  const hasInvalidSku = invalidSkuItems.length > 0;

  function handleTabChange(tab: 'shopee' | 'tiktok') {
    setActiveTab(tab);
    setFileName(null);
    setErrorMessage(null);
    setParsedOrders([]);
  }

  function handleDownloadTemplate() {
    const availableSkus = products.map((p) => p.sku);
    if (activeTab === 'shopee') {
      downloadShopeeTemplateExcel(availableSkus);
    } else {
      downloadTikTokTemplateExcel(availableSkus);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rawData || rawData.length === 0) {
          setErrorMessage('File Excel kosong atau tidak dapat dibaca.');
          setParsedOrders([]);
          return;
        }

        let orders: ParsedMarketplaceOrder[] = [];
        if (activeTab === 'shopee') {
          orders = parseShopeeExcel(rawData);
        } else {
          orders = parseTikTokExcel(rawData);
        }

        if (orders.length === 0) {
          setErrorMessage(
            `Tidak ditemukan data pesanan valid untuk template ${
              activeTab === 'shopee' ? 'Shopee' : 'TikTok Shop'
            }. Pastikan menggunakan file ekspor resmi dari Seller Center.`
          );
        }

        setParsedOrders(orders);
      } catch (err: any) {
        setErrorMessage('Gagal memproses file: ' + (err.message || err));
        setParsedOrders([]);
      }
    };
    reader.readAsBinaryString(file);
  }

  function handleSubmitBatch() {
    if (parsedOrders.length === 0 || hasInvalidSku || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    router.post(
      '/sales-orders/marketplace/import',
      { orders: parsedOrders as any },
      {
        onError: (errs) => {
          const firstErr = Object.values(errs)[0];
          setErrorMessage(firstErr ?? 'Gagal mengimpor pesanan. Periksa kembali isi file.');
        },
        onFinish: () => setIsSubmitting(false),
      }
    );
  }

  const totalItemsCount = parsedOrders.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
  const totalNominal = parsedOrders.reduce((sum, o) => sum + o.grand_total, 0);

  return (
    <AppLayout>
      <Head title="Import Pesanan Marketplace (Shopee / TikTok)" />

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
              <h1 className="text-2xl font-bold text-gray-900">Import Pesanan Marketplace</h1>
              <p className="text-gray-500 text-xs mt-0.5">Transaksi / Sales Orders / Import Shopee & TikTok</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center justify-center gap-2 px-3.5 py-2 bg-white hover:bg-orange-50 text-orange-700 rounded-xl text-xs font-semibold border border-orange-300 hover:border-orange-400 transition-all shadow-sm cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-orange-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Unduh Format Template ({activeTab === 'shopee' ? 'Shopee 50 Kolom' : 'TikTok Shop'})
            </button>
            <Link
              href="/sales-orders/create"
              className="flex items-center justify-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl border border-gray-300 transition-all cursor-pointer"
            >
              Form SO Manual
            </Link>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-300 gap-6">
          <button
            type="button"
            onClick={() => handleTabChange('shopee')}
            className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'shopee'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
            🛍️ Shopee Seller Center (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('tiktok')}
            className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'tiktok'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-900 inline-block"></span>
            🎵 TikTok Shop Seller Center (.xlsx / .csv)
          </button>
        </div>

        {/* Upload Container */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-1">
                Upload File Ekspor Pesanan {activeTab === 'shopee' ? 'Shopee' : 'TikTok Shop'}
              </h2>
              <p className="text-xs text-gray-500">
                {activeTab === 'shopee'
                  ? 'Gunakan file hasil unduhan langsung dari Shopee Seller Center (Menu Pesanan Saya → Ekspor).'
                  : 'Gunakan file hasil unduhan langsung dari TikTok Shop Seller Center (Menu Kelola Pesanan → Ekspor).'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-300 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Template {activeTab === 'shopee' ? 'Shopee' : 'TikTok'}
            </button>
          </div>

          {/* Drag & Drop File Zone */}
          <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            activeTab === 'shopee'
              ? 'border-orange-200 hover:border-orange-400 bg-orange-50/30'
              : 'border-gray-300 hover:border-gray-500 bg-gray-50/50'
          }`}>
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
              activeTab === 'shopee' ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-800'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <label htmlFor="marketplace-file-input" className="cursor-pointer block">
              <span className={`text-sm font-bold hover:underline ${
                activeTab === 'shopee' ? 'text-orange-600' : 'text-gray-900'
              }`}>
                Pilih / Upload File Excel {activeTab === 'shopee' ? 'Shopee' : 'TikTok'}
              </span>
              <span className="text-xs text-gray-500 block mt-1">
                Format didukung: .xlsx, .xls, .csv (Sistem akan otomatis mengenali kolom header)
              </span>
              <input
                id="marketplace-file-input"
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {fileName && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-white border border-gray-300 text-gray-800 text-xs font-semibold rounded-lg shadow-sm">
                📄 {fileName}
              </div>
            )}
          </div>

          {errorMessage && <Alert message={errorMessage} type="error" />}

          {/* SKU Validation Warning */}
          {hasInvalidSku && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-700">
                {invalidSkuItems.length} item memakai SKU yang belum terdaftar di Master Produk ERP:
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Pastikan SKU di file sama dengan SKU yang ada di master produk, lalu upload ulang file ini.
              </p>
              <ul className="mt-2.5 space-y-1">
                {invalidSkuItems.slice(0, 10).map((inv, idx) => (
                  <li key={idx} className="text-xs text-gray-800">
                    Pesanan <span className="font-mono font-bold text-gray-900">{inv.orderId}</span> ({inv.recipient}) —{' '}
                    SKU: <span className="font-mono text-rose-600 font-bold">{inv.sku || '(SKU Kosong)'}</span> ({inv.productName})
                  </li>
                ))}
                {invalidSkuItems.length > 10 && (
                  <li className="text-xs text-gray-400">…dan {invalidSkuItems.length - 10} item lainnya.</li>
                )}
              </ul>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedOrders.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Preview Data Pesanan ({parsedOrders.length} Sales Order · {totalItemsCount} Total Pcs · Rp {totalNominal.toLocaleString('id-ID')})
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Data di bawah sudah dikelompokkan per Nomor Pesanan secara rapi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSubmitBatch}
                  disabled={isSubmitting || hasInvalidSku}
                  className={`px-5 py-2.5 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeTab === 'shopee'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-200/50'
                      : 'bg-gradient-to-r from-neutral-800 to-neutral-900 hover:from-neutral-700 hover:to-neutral-800 shadow-gray-200/50'
                  }`}
                >
                  {isSubmitting
                    ? 'Memproses & Menyimpan...'
                    : `Submit & Buat ${parsedOrders.length} Sales Order ${activeTab === 'shopee' ? 'Shopee' : 'TikTok'}`}
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 text-[10px] font-bold uppercase border-b border-gray-200">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">No. Pesanan</th>
                      <th className="p-2.5">Resi / Kurir</th>
                      <th className="p-2.5">Penerima & Alamat</th>
                      <th className="p-2.5">Item Produk (SKU x Qty)</th>
                      <th className="p-2.5 text-right">Ongkir</th>
                      <th className="p-2.5 text-right">Diskon</th>
                      <th className="p-2.5 text-right">Total Pembayaran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {parsedOrders.map((order, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                        <td className="p-2.5 font-mono text-gray-400">{idx + 1}</td>
                        <td className="p-2.5 font-mono text-gray-900 font-bold">
                          {order.external_order_id}
                          <span className="block text-[10px] text-gray-400 font-normal">{order.order_date}</span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-mono text-blue-600 font-semibold">{order.tracking_number || '—'}</span>
                          <span className="block text-[10px] text-gray-400">{order.courier_name || activeTab}</span>
                        </td>
                        <td className="p-2.5">
                          <div className="font-semibold text-gray-900">{order.recipient_name}</div>
                          <div className="text-[10px] text-gray-500 truncate max-w-xs">{order.shipping_address || `${order.city}, ${order.province}`}</div>
                        </td>
                        <td className="p-2.5 space-y-1">
                          {order.items.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-1.5 text-xs">
                              <span className="font-mono font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                                {item.sku}
                              </span>
                              <span className="text-gray-800">x{item.quantity}</span>
                              <span className="text-gray-400 text-[10px]">(@Rp {item.price.toLocaleString('id-ID')})</span>
                            </div>
                          ))}
                        </td>
                        <td className="p-2.5 text-right text-gray-600">Rp {order.shipping_cost.toLocaleString('id-ID')}</td>
                        <td className="p-2.5 text-right text-orange-600">Rp {order.discount_amount.toLocaleString('id-ID')}</td>
                        <td className="p-2.5 text-right font-extrabold text-emerald-600">
                          Rp {order.grand_total.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
