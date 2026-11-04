import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Head, router, usePage } from '@inertiajs/react';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface ProductItem {
  id: number;
  item_id: number;
  model_id: number | null;
  item_name: string;
  model_name: string | null;
  sku: string | null;
  stock: number;
  reserved_stock: number;
  price: string | number;
  item_status: string;
  has_model: boolean;
  last_synced_at: string | null;
}

interface PaginationLinks {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginatedProducts {
  data: ProductItem[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: PaginationLinks[];
}

interface SummaryData {
  total_skus: number;
  total_stock: number;
  in_stock_skus: number;
  out_of_stock_skus: number;
  last_synced_at: string | null;
}

interface Props {
  products: PaginatedProducts;
  filters: {
    search: string;
    stock_status: string;
    sort: string;
  };
  summary: SummaryData;
  account: {
    id: number;
    account_name: string;
    shop_id: string | null;
    is_connected: boolean;
  } | null;
}

interface AuditItem {
  id: number | null;
  item_id: number | null;
  model_id: number | null;
  sku: string;
  item_name: string;
  model_name: string | null;
  warehouse_stock: number;
  shopee_stock: number;
  reserved_stock: number;
  diff: number;
  status: 'CRITICAL' | 'LOW_STOCK' | 'DISCREPANCY' | 'MATCHED' | 'UNMATCHED';
  is_shopee_found: boolean;
}

interface AuditSummary {
  total_rows: number;
  critical_count: number;
  low_stock_count: number;
  discrepancy_count: number;
  matched_count: number;
  unmatched_count: number;
}

export default function ShopeeProductsIndex({ products, filters, summary, account }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [stockStatus, setStockStatus] = useState(filters.stock_status ?? 'all');
  const [sort, setSort] = useState(filters.sort ?? 'stock_desc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [zeroingOutId, setZeroingOutId] = useState<number | null>(null);

  // States untuk Modal Import Stok Internal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [detectedWarehouse, setDetectedWarehouse] = useState<'A' | 'G' | 'GENERAL' | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[] | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'CRITICAL' | 'LOW_STOCK' | 'DISCREPANCY' | 'MATCHED' | 'UNMATCHED'>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [isZeroingOutAll, setIsZeroingOutAll] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [zeroOutSuccessMessage, setZeroOutSuccessMessage] = useState<string | null>(null);

  function handleFilter(newSearch = search, newStatus = stockStatus, newSort = sort) {
    router.get(
      '/shopee-products',
      {
        search: newSearch || undefined,
        stock_status: newStatus !== 'all' ? newStatus : undefined,
        sort: newSort !== 'stock_desc' ? newSort : undefined,
      },
      {
        preserveState: true,
        preserveScroll: true,
      }
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleFilter(search, stockStatus, sort);
  }

  function handleSync() {
    if (!account?.is_connected) {
      alert('Toko Shopee belum terhubung dengan token aktif. Harap hubungkan toko terlebih dahulu di menu Integrasi Shopee.');
      return;
    }

    if (
      !confirm(
        'Tarik seluruh data produk, SKU, dan stok fisik dari Shopee sekarang?\n\nSistem akan mengambil seluruh produk aktif dari toko Shopee Anda dan memperbarui stok terkini.'
      )
    ) {
      return;
    }

    setIsSyncing(true);
    router.post(
      '/shopee-products/sync',
      {},
      {
        preserveScroll: true,
        onFinish: () => setIsSyncing(false),
      }
    );
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (stockStatus !== 'all') params.set('stock_status', stockStatus);
    if (sort !== 'stock_desc') params.set('sort', sort);

    window.location.href = `/shopee-products/export?${params.toString()}`;
  }

  // Parse Excel file dan bandingkan langsung via API
  async function handleFileUpload(file: File) {
    setIsParsing(true);
    setImportFileName(file.name);
    setZeroOutSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length <= 1) {
          alert('File Excel kosong atau tidak memiliki baris data.');
          setIsParsing(false);
          return;
        }

        // Deteksi tipe laporan gudang (Gudang A / Gudang G)
        let whType: 'A' | 'G' | 'GENERAL' = 'GENERAL';
        for (let r = 0; r < Math.min(6, rows.length); r++) {
          const rowStr = JSON.stringify(rows[r] || '').toUpperCase();
          if (rowStr.includes('GUDANG A')) {
            whType = 'A';
            break;
          } else if (rowStr.includes('GUDANG G')) {
            whType = 'G';
            break;
          }
        }
        setDetectedWarehouse(whType);

        // Auto-detect header row
        let skuColIdx = -1;
        let stockColIdx = -1;
        let headerRowIdx = -1;

        for (let r = 0; r < Math.min(25, rows.length); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();

            if (skuColIdx === -1 && (
              val === 'sku' || val === 'kode' || val === 'kode barang' || val === 'kode_barang' ||
              val === 'barcode' || val === 'model_sku' || val === 'item_sku' || val === 'article' || val === 'art'
            )) {
              skuColIdx = c;
              headerRowIdx = r;
            }

            if (stockColIdx === -1 && (
              val === 'stok' || val === 'stock' || val === 'qty' || val === 'jumlah' ||
              val === 'kuantitas' || val === 'fisik' || val === 'stok fisik' || val === 'stok_fisik' ||
              val === 'total quantity' || val === 'total_quantity' ||
              val === 'stok akhir' || val === 'stok_akhir' || val === 'sisa' || val === 'total stock' || val === 'saldo'
            )) {
              stockColIdx = c;
              headerRowIdx = r;
            }
          }

          if (skuColIdx !== -1 && stockColIdx !== -1) {
            break;
          }
        }

        // Fallback jika tidak terdeteksi nama kolom: coba kolom 2 (Kode Barang) & 7 (Total Quantity) seperti format Jaya Mandiri
        if (skuColIdx === -1) skuColIdx = 2;
        if (stockColIdx === -1) stockColIdx = 7;
        if (headerRowIdx === -1) headerRowIdx = 4;

        const extractedItems: { sku: string; warehouse_stock: number }[] = [];
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;
          const rawSku = String(row[skuColIdx] || '').trim();

          // Abaikan baris kosong, header berulang di tengah sheet, atau baris total
          if (
            !rawSku ||
            rawSku.toLowerCase() === 'total' ||
            rawSku.toLowerCase() === 'grand total' ||
            rawSku.toLowerCase().includes('kode barang') ||
            rawSku.toLowerCase().includes('laporan posisi')
          ) {
            continue;
          }

          const rawQty = row[stockColIdx];
          let qtyNum = 0;
          let isLusin = whType === 'A';

          if (typeof rawQty === 'number') {
            qtyNum = rawQty;
          } else if (rawQty) {
            // Tangani string seperti "1.00 PSG ", "0.50 LSN ", "91.00 PSG ", "-1.00 LBR "
            const match = String(rawQty).trim().match(/([0-9.-]+)\s*([A-Za-z]+)?/);
            if (match) {
              qtyNum = parseFloat(match[1]) || 0;
              const unit = (match[2] || '').toUpperCase();
              if (unit === 'LSN') {
                isLusin = true;
              } else if (unit === 'PSG' || unit === 'PCS' || unit === 'BJ') {
                isLusin = false;
              }
            }
          }

          // Jika satuan Lusin (Gudang A), otomatis konversi ke Pcs (1 lusin = 12 pasang / pcs)
          if (isLusin) {
            qtyNum = Math.round(qtyNum * 12);
          }

          extractedItems.push({
            sku: rawSku,
            warehouse_stock: Math.max(0, qtyNum),
          });
        }

        if (extractedItems.length === 0) {
          alert('Tidak ada baris SKU dan kuantitas stok yang berhasil dibaca dari file Excel ini.');
          setIsParsing(false);
          return;
        }

        // Kirim ke backend untuk audit perbandingan dengan katalog Shopee
        setIsComparing(true);
        const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
        const resp = await fetch('/shopee-products/compare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            'Accept': 'application/json',
          },
          body: JSON.stringify({ items: extractedItems }),
        });

        const resJson = await resp.json();
        if (resJson.status === 'success') {
          setAuditSummary(resJson.summary);
          setAuditItems(resJson.items);
          if (resJson.summary.critical_count > 0) {
            setAuditFilter('CRITICAL');
          } else if (resJson.summary.discrepancy_count > 0) {
            setAuditFilter('DISCREPANCY');
          } else {
            setAuditFilter('all');
          }
        } else {
          alert(resJson.message || 'Gagal membandingkan stok dengan Shopee.');
        }
      } catch (err: any) {
        console.error(err);
        alert('Gagal memproses file Excel: ' + (err.message || 'Format tidak valid'));
      } finally {
        setIsParsing(false);
        setIsComparing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Kosongkan SEMUA SKU Kritis (Gudang = 0 & Shopee > 0)
  async function handleZeroOutAllCritical() {
    if (!auditItems) return;
    const criticalItems = auditItems.filter(i => i.status === 'CRITICAL' && i.id && i.shopee_stock > 0);
    if (criticalItems.length === 0) {
      alert('Tidak ada produk berstatus Kritis dengan stok Shopee > 0.');
      return;
    }

    if (!confirm(
      `Konfirmasi: Kosongkan stok ${criticalItems.length} produk KRITIS di Shopee sekarang?\n\n` +
      `Stok produk ini di gudang fisik Anda sudah HABIS (0). Sistem akan langsung mengatur stok Shopee menjadi 0 via API resmi agar tidak terjadi pesanan yang tidak dapat dipenuhi (overselling).`
    )) {
      return;
    }

    setIsZeroingOutAll(true);
    setZeroOutSuccessMessage(null);

    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
      const productIds = criticalItems.map(i => i.id!);
      const resp = await fetch('/shopee-products/zero-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ product_ids: productIds }),
      });

      const resJson = await resp.json();
      if (resJson.status === 'success') {
        setZeroOutSuccessMessage(resJson.message || `Berhasil mengosongkan stok ${resJson.updated_count} produk di Shopee!`);

        // Update status audit item di modal
        setAuditItems(prev => prev ? prev.map(item => {
          if (productIds.includes(item.id!)) {
            return {
              ...item,
              shopee_stock: 0,
              diff: 0,
              status: 'MATCHED',
            };
          }
          return item;
        }) : null);

        if (auditSummary) {
          setAuditSummary({
            ...auditSummary,
            critical_count: 0,
            matched_count: auditSummary.matched_count + resJson.updated_count,
          });
        }

        router.reload({ only: ['products', 'summary'] });
      } else {
        alert(resJson.message || 'Gagal mengosongkan stok di Shopee.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsZeroingOutAll(false);
    }
  }

  // Kosongkan 1 produk tertentu (baik dari modal maupun dari tabel utama)
  async function handleZeroOutSingle(id: number, sku: string) {
    if (!confirm(`Konfirmasi: Atur stok untuk SKU "${sku}" di Shopee menjadi 0 sekarang?`)) {
      return;
    }

    setZeroingOutId(id);
    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
      const resp = await fetch('/shopee-products/zero-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ product_ids: [id] }),
      });

      const resJson = await resp.json();
      if (resJson.status === 'success') {
        // Update di modal jika terbuka
        setAuditItems(prev => prev ? prev.map(item => {
          if (item.id === id) {
            const newStatus = item.warehouse_stock <= 0 ? 'MATCHED' : (item.warehouse_stock <= 3 ? 'LOW_STOCK' : 'DISCREPANCY');
            return {
              ...item,
              shopee_stock: 0,
              diff: item.warehouse_stock,
              status: newStatus,
            };
          }
          return item;
        }) : null);

        router.reload({ only: ['products', 'summary'] });
      } else {
        alert(resJson.message || 'Gagal mengosongkan stok di Shopee.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setZeroingOutId(null);
    }
  }

  // Salin semua SKU Kritis ke clipboard
  function handleCopyCriticalSkus() {
    if (!auditItems) return;
    const critical = auditItems.filter(i => i.status === 'CRITICAL');
    if (critical.length === 0) {
      alert('Tidak ada SKU Kritis untuk disalin.');
      return;
    }

    const text = critical.map(i => i.sku).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    });
  }

  // Download Laporan Audit Selisih Stok ke Excel (.xlsx)
  function handleDownloadAuditReport() {
    if (!auditItems || auditItems.length === 0) return;

    const exportData = auditItems.map((item, idx) => ({
      'No': idx + 1,
      'SKU': item.sku,
      'Nama Produk Shopee': item.item_name,
      'Variasi': item.model_name || 'Single',
      'Stok Fisik Gudang': item.warehouse_stock,
      'Stok Tersedia Shopee': item.shopee_stock,
      'Stok Terkunci Shopee': item.reserved_stock,
      'Selisih (Gudang - Shopee)': item.diff,
      'Status Audit': item.status === 'CRITICAL' ? '🔴 KRITIS (OOS di Gudang)' :
                      item.status === 'LOW_STOCK' ? '🟡 Stok Menipis' :
                      item.status === 'DISCREPANCY' ? '🔵 Selisih Stok' :
                      item.status === 'UNMATCHED' ? '⚪ Tidak di Shopee' : '🟢 Sesuai',
      'Rekomendasi Tindakan': item.status === 'CRITICAL' ? 'Wajib Kosongkan di Shopee Segera' :
                              item.status === 'LOW_STOCK' ? 'Segera Restock Gudang' :
                              item.status === 'DISCREPANCY' ? 'Sinkronkan Jumlah Stok' :
                              item.status === 'UNMATCHED' ? 'Cek Apakah SKU Terdaftar' : 'Aman',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil Audit Stok');
    const nowStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Laporan_Audit_Stok_Shopee_${nowStr}.xlsx`);
  }

  const isConnected = Boolean(account?.is_connected);

  // Filter audit items
  const filteredAuditItems = (auditItems || []).filter(item => {
    if (auditFilter !== 'all' && item.status !== auditFilter) {
      return false;
    }
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      return (
        item.sku.toLowerCase().includes(q) ||
        item.item_name.toLowerCase().includes(q) ||
        (item.model_name && item.model_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <AppLayout>
      <Head title="Stok Produk Shopee - Koding ERP" />

      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Flash Notifications */}
        {flash?.success && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{flash.success}</span>
            </div>
          </div>
        )}
        {flash?.error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>{flash.error}</span>
            </div>
          </div>
        )}

        {/* Header Title Banner - Konsisten dengan Cut Off & Returan */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>Stok Produk Shopee</span>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Terhubung
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Belum Terhubung
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Kelola dan pantau {(summary?.total_skus ?? 0).toLocaleString('id-ID')} SKU variasi produk aktif dan kuantitas stok fisik dari Shopee Open Platform.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Import Stok Internal (.xlsx) - Permintaan Khusus User */}
            <button
              type="button"
              onClick={() => {
                setIsImportModalOpen(true);
                setZeroOutSuccessMessage(null);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
              title="Bandingkan stok fisik internal gudang dengan stok Shopee"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-indigo-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span>Import Stok Internal (.xlsx)</span>
            </button>

            {/* Export CSV / Excel */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
              title="Download seluruh data SKU & Stok ke file CSV / Excel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>Export CSV</span>
            </button>

            {/* Tarik Stok Shopee (API) */}
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap active:scale-98 ${
                isSyncing
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-[#EE4D2D] hover:bg-[#d83f21] text-white'
              }`}
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Menarik Stok Shopee...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  <span>Tarik Stok Shopee (API)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4 Metric Summary Cards - Konsisten dengan Cut Off */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total SKU */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total SKU Variasi</span>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3 font-mono">
              {(summary?.total_skus ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Item SKU terdaftar di Shopee</p>
          </div>

          {/* Card 2: Total Stok Fisik */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Stok Fisik</span>
              <span className="p-2 bg-orange-50 text-[#EE4D2D] rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3 font-mono">
              {(summary?.total_stock ?? 0).toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-500">pcs</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Total kuantitas stok tersedia</p>
          </div>

          {/* Card 3: SKU Ada Stok */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">SKU Ada Stok</span>
              <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 mt-3 font-mono">
              {(summary?.in_stock_skus ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Siap dijual di toko Shopee</p>
          </div>

          {/* Card 4: SKU Habis (0) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">SKU Stok Habis (0)</span>
              <span className="p-2 bg-rose-50 text-rose-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-rose-600 mt-3 font-mono">
              {(summary?.out_of_stock_skus ?? 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Produk dengan stok fisik 0</p>
          </div>
        </div>

        {/* Filter & Search Bar - Konsisten dengan Cut Off */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
            <div className="relative w-full">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, Nama Produk, ID Item..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-[#0B132B]"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    handleFilter('', stockStatus, sort);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Cari
            </button>
          </form>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Filter Status Stok */}
            <select
              value={stockStatus}
              onChange={(e) => {
                const val = e.target.value;
                setStockStatus(val);
                handleFilter(search, val, sort);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B] cursor-pointer"
            >
              <option value="all">Semua Status Stok</option>
              <option value="in_stock">Ada Stok (&gt; 0)</option>
              <option value="out_of_stock">Stok Habis (0)</option>
            </select>

            {/* Sort Selector */}
            <select
              value={sort}
              onChange={(e) => {
                const val = e.target.value;
                setSort(val);
                handleFilter(search, stockStatus, val);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B] cursor-pointer"
            >
              <option value="stock_desc">Urutkan: Stok Terbanyak</option>
              <option value="stock_asc">Urutkan: Stok Tersedikit</option>
              <option value="sku_asc">Urutkan: SKU (A-Z)</option>
              <option value="name_asc">Urutkan: Nama Produk (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Data Table Container - Konsisten dengan Cut Off & Returan */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {products.data.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Tabel Stok Produk Shopee Kosong</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Silakan klik tombol <strong className="text-[#EE4D2D]">"Tarik Stok Shopee (API)"</strong> di atas untuk mengambil data SKU dan kuantitas stok produk terkini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap">
                    <th className="py-3 px-3 text-center w-12">No</th>
                    <th className="py-3 px-4">SKU Utama / Variasi</th>
                    <th className="py-3 px-4">Nama Barang</th>
                    <th className="py-3 px-4">Variasi / Model</th>
                    <th className="py-3 px-4 text-right">Stok Tersedia</th>
                    <th className="py-3 px-4 text-right">Stok Terkunci</th>
                    <th className="py-3 px-4 text-right">Harga</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {products.data.map((p, idx) => {
                    const rowNumber = (products.current_page - 1) * products.per_page + idx + 1;
                    const hasStock = (p.stock ?? 0) > 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-3 text-center text-xs font-bold text-slate-500 whitespace-nowrap">
                          {rowNumber}
                        </td>

                        {/* SKU */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {p.sku ? (
                            <span className="font-mono font-bold text-slate-900 select-all tracking-tight">
                              {p.sku}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">— tanpa SKU —</span>
                          )}
                        </td>

                        {/* Nama Produk */}
                        <td className="py-3.5 px-4 max-w-md">
                          <p className="font-semibold text-slate-900 line-clamp-1" title={p.item_name}>
                            {p.item_name}
                          </p>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            ID Produk: {p.item_id}
                          </div>
                        </td>

                        {/* Variasi */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {p.model_name ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                              {p.model_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Single (Tanpa Variasi)</span>
                          )}
                        </td>

                        {/* Stok Tersedia */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                              hasStock
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {(p.stock ?? 0).toLocaleString('id-ID')}
                          </span>
                        </td>

                        {/* Stok Terkunci */}
                        <td className="py-3.5 px-4 text-right font-mono text-slate-500 whitespace-nowrap">
                          {(p.reserved_stock ?? 0).toLocaleString('id-ID')}
                        </td>

                        {/* Harga */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          Rp {Math.round(Number(p.price) || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Aksi: Kosongkan di Shopee */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {hasStock ? (
                            <button
                              type="button"
                              onClick={() => handleZeroOutSingle(p.id, p.sku || p.item_name)}
                              disabled={zeroingOutId === p.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                              title="Kosongkan stok produk ini di Shopee menjadi 0 via API"
                            >
                              {zeroingOutId === p.id ? (
                                <span className="w-3 h-3 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-rose-600">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              )}
                              <span>Kosongkan</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400">0 (Habis)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar - Konsisten dengan Cut Off */}
          {products.last_page > 1 && (
            <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Menampilkan{' '}
                <strong className="text-slate-900 font-bold">
                  {(products.current_page - 1) * products.per_page + 1}
                </strong>{' '}
                s/d{' '}
                <strong className="text-slate-900 font-bold">
                  {Math.min(products.current_page * products.per_page, products.total)}
                </strong>{' '}
                dari <strong className="text-slate-900 font-bold">{products.total.toLocaleString('id-ID')}</strong> SKU
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {products.links.map((link, i) => {
                  if (!link.url) {
                    return (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed"
                        dangerouslySetInnerHTML={{ __html: link.label }}
                      />
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => router.get(link.url!, {}, { preserveScroll: true, preserveState: true })}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer border ${
                        link.active
                          ? 'bg-[#0B132B] text-white border-[#0B132B] font-bold'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DIALOG: Import & Audit Stok Internal (.xlsx) */}
      {isImportModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => {
            if (!isZeroingOutAll && !isComparing) {
              setIsImportModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                    <span>Audit & Sinkronisasi Stok Gudang ke Shopee</span>
                    {detectedWarehouse === 'A' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        📦 Gudang A (Lusinan • Otomatis x12 Pcs)
                      </span>
                    )}
                    {detectedWarehouse === 'G' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        🏷️ Gudang G (Eceran Satuan • Pcs)
                      </span>
                    )}
                    {importFileName && (
                      <span className="text-xs font-mono font-medium text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
                        {importFileName}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bandingkan stok fisik internal gudang dari file Excel dengan stok aktif di Shopee untuk mencegah overselling.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isZeroingOutAll}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 grow">
              {/* Notifikasi Toast Sukses Kosongkan */}
              {zeroOutSuccessMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fade-in">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{zeroOutSuccessMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZeroOutSuccessMessage(null)}
                    className="text-emerald-600 hover:text-emerald-900 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Toast Disalin */}
              {copiedToast && (
                <div className="p-3 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>Daftar SKU Kritis berhasil disalin ke clipboard!</span>
                </div>
              )}

              {/* Upload Zone jika belum ada data */}
              {!auditItems || auditItems.length === 0 ? (
                <div className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-10 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="excelInternalInput"
                    accept=".xlsx, .xls, .csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="hidden"
                  />
                  <label htmlFor="excelInternalInput" className="cursor-pointer space-y-3 block">
                    <div className="w-14 h-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center mx-auto transition-transform hover:scale-105">
                      {isParsing || isComparing ? (
                        <svg className="animate-spin h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-7 h-7">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {isParsing || isComparing ? 'Memproses dan Membandingkan Stok...' : 'Klik untuk Pilih File Excel Stok Gudang'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Mendukung format <strong>.xlsx, .xls, .csv</strong> dari sistem internal gudang Anda.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors">
                      Pilih Spreadsheet Excel
                    </span>
                  </label>
                </div>
              ) : (
                /* Tampilan Hasil Audit & Action */
                <div className="space-y-4">
                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {/* 1. Kritis */}
                    <div
                      onClick={() => setAuditFilter('CRITICAL')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'CRITICAL'
                          ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300'
                          : 'bg-white border-rose-200 hover:bg-rose-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">🔴 Kritis (OOS)</span>
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                      </div>
                      <p className="text-2xl font-extrabold text-rose-700 mt-1 font-mono">
                        {auditSummary?.critical_count ?? 0}
                      </p>
                      <p className="text-[10px] text-rose-600 font-medium">Gudang = 0 & Shopee &gt; 0</p>
                    </div>

                    {/* 2. Menipis */}
                    <div
                      onClick={() => setAuditFilter('LOW_STOCK')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'LOW_STOCK'
                          ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                          : 'bg-white border-amber-200 hover:bg-amber-50/50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">🟡 Menipis</span>
                      <p className="text-2xl font-extrabold text-amber-700 mt-1 font-mono">
                        {auditSummary?.low_stock_count ?? 0}
                      </p>
                      <p className="text-[10px] text-amber-600 font-medium">Stok fisik 1 s/d 3 pcs</p>
                    </div>

                    {/* 3. Selisih */}
                    <div
                      onClick={() => setAuditFilter('DISCREPANCY')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'DISCREPANCY'
                          ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300'
                          : 'bg-white border-blue-200 hover:bg-blue-50/50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">🔵 Selisih Stok</span>
                      <p className="text-2xl font-extrabold text-blue-700 mt-1 font-mono">
                        {auditSummary?.discrepancy_count ?? 0}
                      </p>
                      <p className="text-[10px] text-blue-600 font-medium">Gudang ≠ Shopee</p>
                    </div>

                    {/* 4. Sesuai */}
                    <div
                      onClick={() => setAuditFilter('MATCHED')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'MATCHED'
                          ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300'
                          : 'bg-white border-emerald-200 hover:bg-emerald-50/50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">🟢 Sesuai</span>
                      <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
                        {auditSummary?.matched_count ?? 0}
                      </p>
                      <p className="text-[10px] text-emerald-600 font-medium">Gudang = Shopee</p>
                    </div>

                    {/* 5. Tidak di Shopee */}
                    <div
                      onClick={() => setAuditFilter('UNMATCHED')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'UNMATCHED'
                          ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-300'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">⚪ Non-Shopee</span>
                      <p className="text-2xl font-extrabold text-slate-700 mt-1 font-mono">
                        {auditSummary?.unmatched_count ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Tidak terdaftar di toko</p>
                    </div>
                  </div>

                  {/* Primary Action Banner: Kosongkan di Shopee */}
                  {(auditSummary?.critical_count ?? 0) > 0 && (
                    <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-rose-600 text-white rounded-xl shrink-0 animate-bounce">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-rose-900">
                            Peringatan: Ditemukan {auditSummary?.critical_count} SKU Kritis (Habis di Gudang tapi Masih Aktif di Shopee)
                          </p>
                          <p className="text-xs text-rose-700 mt-0.5">
                            Segera kosongkan stok di Shopee sekarang agar pembeli tidak checkout barang yang kosong di gudang.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        {/* Tombol Salin SKU Kritis */}
                        <button
                          type="button"
                          onClick={handleCopyCriticalSkus}
                          className="px-3 py-2 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap active:scale-98"
                        >
                          Salin SKU Kritis
                        </button>

                        {/* Tombol Kosongkan SEMUA di Shopee */}
                        <button
                          type="button"
                          onClick={handleZeroOutAllCritical}
                          disabled={isZeroingOutAll}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 active:scale-98 disabled:opacity-50"
                        >
                          {isZeroingOutAll ? (
                            <>
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Mengosongkan di Shopee...</span>
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              <span>Kosongkan Semua di Shopee</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Filter Tabs & Search Bar dalam Modal */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-xs">
                      <button
                        type="button"
                        onClick={() => setAuditFilter('all')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        Semua ({auditSummary?.total_rows ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('CRITICAL')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'CRITICAL'
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                        }`}
                      >
                        🔴 Kritis ({auditSummary?.critical_count ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('LOW_STOCK')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'LOW_STOCK'
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                        }`}
                      >
                        🟡 Menipis ({auditSummary?.low_stock_count ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('DISCREPANCY')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'DISCREPANCY'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                        }`}
                      >
                        🔵 Selisih ({auditSummary?.discrepancy_count ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('MATCHED')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'MATCHED'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        🟢 Sesuai ({auditSummary?.matched_count ?? 0})
                      </button>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        placeholder="Filter tabel..."
                        className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-full sm:w-48"
                      />

                      {/* Export Excel Laporan */}
                      <button
                        type="button"
                        onClick={handleDownloadAuditReport}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                        title="Download Laporan Audit ke File Excel"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        <span>Unduh .xlsx</span>
                      </button>

                      {/* Ganti File */}
                      <label
                        htmlFor="excelInternalInputReplace"
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Ganti File
                        <input
                          type="file"
                          id="excelInternalInputReplace"
                          accept=".xlsx, .xls, .csv"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Tabel Perbandingan Audit */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap">
                          <th className="py-2.5 px-3 text-center w-10">No</th>
                          <th className="py-2.5 px-3">SKU</th>
                          <th className="py-2.5 px-3">Nama Produk Shopee</th>
                          <th className="py-2.5 px-3 text-right">Stok Gudang</th>
                          <th className="py-2.5 px-3 text-right">Stok Shopee</th>
                          <th className="py-2.5 px-3 text-right">Selisih</th>
                          <th className="py-2.5 px-3 text-center">Status Audit</th>
                          <th className="py-2.5 px-3 text-center">Aksi Shopee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredAuditItems.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                              Tidak ada data yang sesuai dengan filter audit ini.
                            </td>
                          </tr>
                        ) : (
                          filteredAuditItems.map((item, idx) => {
                            const isCritical = item.status === 'CRITICAL';
                            const isLow = item.status === 'LOW_STOCK';
                            const isDiscrepancy = item.status === 'DISCREPANCY';
                            const isMatched = item.status === 'MATCHED';

                            return (
                              <tr
                                key={idx}
                                className={`transition-colors ${
                                  isCritical
                                    ? 'bg-rose-50/50 hover:bg-rose-50'
                                    : isLow
                                    ? 'bg-amber-50/30 hover:bg-amber-50/60'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                                  {idx + 1}
                                </td>

                                {/* SKU */}
                                <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-slate-900 select-all">
                                  {item.sku}
                                </td>

                                {/* Nama Produk & Variasi */}
                                <td className="py-2.5 px-3 max-w-xs">
                                  <p className="font-semibold text-slate-800 line-clamp-1" title={item.item_name}>
                                    {item.item_name}
                                  </p>
                                  {item.model_name && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">
                                      {item.model_name}
                                    </span>
                                  )}
                                </td>

                                {/* Stok Gudang */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                                      item.warehouse_stock === 0
                                        ? 'bg-rose-100 text-rose-800'
                                        : item.warehouse_stock <= 3
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-800'
                                    }`}
                                  >
                                    {item.warehouse_stock}
                                  </span>
                                </td>

                                {/* Stok Shopee */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold">
                                  {item.is_shopee_found ? (
                                    <span className={item.shopee_stock > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                                      {item.shopee_stock}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-normal italic text-[10px]">—</span>
                                  )}
                                </td>

                                {/* Selisih */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-semibold">
                                  {item.diff === 0 ? (
                                    <span className="text-slate-400">0</span>
                                  ) : item.diff > 0 ? (
                                    <span className="text-blue-600">+{item.diff}</span>
                                  ) : (
                                    <span className="text-rose-600">{item.diff}</span>
                                  )}
                                </td>

                                {/* Status Audit */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {isCritical && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                      🔴 KRITIS (OOS)
                                    </span>
                                  )}
                                  {isLow && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      🟡 Menipis ({item.warehouse_stock})
                                    </span>
                                  )}
                                  {isDiscrepancy && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                      🔵 Selisih Stok
                                    </span>
                                  )}
                                  {isMatched && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      🟢 Sesuai
                                    </span>
                                  )}
                                  {item.status === 'UNMATCHED' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                      ⚪ Non-Shopee
                                    </span>
                                  )}
                                </td>

                                {/* Aksi Shopee */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {item.id && item.shopee_stock > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => handleZeroOutSingle(item.id!, item.sku)}
                                      disabled={zeroingOutId === item.id}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                                      title="Set stok Shopee menjadi 0 via API"
                                    >
                                      {zeroingOutId === item.id ? (
                                        <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                      ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                      )}
                                      <span>Kosongkan</span>
                                    </button>
                                  ) : item.is_shopee_found ? (
                                    <span className="text-[10px] text-slate-400">0 di Shopee</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500">
                {auditSummary ? (
                  <span>
                    Total <strong className="text-slate-900 font-bold">{auditSummary.total_rows}</strong> SKU diproses
                    {auditSummary.critical_count > 0 && (
                      <span className="text-rose-600 font-bold ml-1.5">
                        • {auditSummary.critical_count} SKU Kritis
                      </span>
                    )}
                  </span>
                ) : (
                  <span>Format yang didukung: Excel (.xlsx, .xls) & CSV</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AppLayout>
  );
}
