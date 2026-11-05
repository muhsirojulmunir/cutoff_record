import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Head, Link, router, usePage } from '@inertiajs/react';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface MasterStockItem {
  id: number;
  warehouse: 'G' | 'A';
  item_code: string;
  item_name: string | null;
  unit: string;
  raw_qty: number | string;
  qty_pcs: number;
  last_imported_at: string | null;
  warehouse_label?: string;
}

interface PaginationLinks {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginatedStocks {
  data: MasterStockItem[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  links: PaginationLinks[];
}

interface SummaryData {
  total_items_g: number;
  total_pcs_g: number;
  last_imported_g: string | null;
  total_items_a: number;
  total_pcs_a: number;
  last_imported_a: string | null;
  total_pcs_all: number;
  total_rows_all: number;
}

interface Props {
  stocks: PaginatedStocks;
  summary: SummaryData;
  filters: {
    warehouse: string;
    search: string;
    stock_status: string;
    sort: string;
  };
}

export default function MasterStockIndex({ stocks, summary, filters }: Props) {
  const { flash } = usePage<PageProps>().props;

  // Search & Filter state
  const [search, setSearch] = useState(filters.search || '');
  const [warehouse, setWarehouse] = useState(filters.warehouse || 'all');
  const [stockStatus, setStockStatus] = useState(filters.stock_status || 'all');
  const [sort, setSort] = useState(filters.sort || 'code_asc');

  // Modal Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [targetWarehouse, setTargetWarehouse] = useState<'G' | 'A'>('G');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  function applyFilters(newWarehouse = warehouse, newStockStatus = stockStatus, newSort = sort) {
    router.get(
      '/master-stock',
      {
        search: search.trim(),
        warehouse: newWarehouse,
        stock_status: newStockStatus,
        sort: newSort,
      },
      { preserveState: true, replace: true }
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters();
  }

  function handleResetFilters() {
    setSearch('');
    setWarehouse('all');
    setStockStatus('all');
    setSort('code_asc');
    router.get('/master-stock', {}, { preserveState: true, replace: true });
  }

  // Open import modal for specific warehouse
  function openImportModal(wh: 'G' | 'A') {
    setTargetWarehouse(wh);
    setValidationError(null);
    setImportFileName(null);
    setImportSuccessMessage(null);
    setIsImportModalOpen(true);
  }

  // Handle Excel Upload & Cross-Warehouse Validation
  async function handleFileUpload(file: File) {
    setIsParsing(true);
    setValidationError(null);
    setImportFileName(file.name);
    setImportSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length <= 1) {
          setValidationError('File Excel kosong atau tidak memiliki baris data.');
          setIsParsing(false);
          return;
        }

        // 1. Deteksi Tipe Laporan (Gudang A vs Gudang G)
        const fileUpper = file.name.toUpperCase();
        let contentIsG = false;
        let contentIsA = false;

        for (let r = 0; r < Math.min(8, rows.length); r++) {
          const rowStr = JSON.stringify(rows[r] || '').toUpperCase();
          if (rowStr.includes('GUDANG G')) contentIsG = true;
          if (rowStr.includes('GUDANG A')) contentIsA = true;
        }

        if (fileUpper.includes('GUDANG G') || fileUpper.includes('GUDANG_G') || fileUpper.includes('GUDANG-G')) contentIsG = true;
        if (fileUpper.includes('GUDANG A') || fileUpper.includes('GUDANG_A') || fileUpper.includes('GUDANG-A')) contentIsA = true;

        if (!contentIsG && !contentIsA) {
          let lsnCount = 0;
          let psgCount = 0;
          for (let r = 5; r < Math.min(30, rows.length); r++) {
            const rowStr = JSON.stringify(rows[r] || '').toUpperCase();
            if (rowStr.includes('LSN')) lsnCount++;
            if (rowStr.includes('PSG')) psgCount++;
          }
          if (lsnCount > psgCount) contentIsA = true;
          else if (psgCount > lsnCount) contentIsG = true;
        }

        // 2. Proteksi Validasi Silang (Strict Cross-Validation)
        if (targetWarehouse === 'G' && contentIsA && !contentIsG) {
          setValidationError(
            '⚠️ File Ditolak! Anda mengunggah file Laporan GUDANG A (Lusinan) di mode Gudang G. File ini tidak diizinkan di mode Gudang G agar data stok eceran tidak kacau.'
          );
          setIsParsing(false);
          return;
        }

        if (targetWarehouse === 'A' && contentIsG && !contentIsA) {
          setValidationError(
            '⚠️ File Ditolak! Anda mengunggah file Laporan GUDANG G (Eceran/Pcs) di mode Gudang A. File ini tidak diizinkan di mode Gudang A agar data stok grosir tidak kacau.'
          );
          setIsParsing(false);
          return;
        }

        // Auto-detect header row
        let skuColIdx = -1;
        let nameColIdx = -1;
        let stockColIdx = -1;
        let startRow = 1;

        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim().toLowerCase();
            if (
              cellVal.includes('kode barang') ||
              cellVal.includes('kode item') ||
              cellVal.includes('kode sku') ||
              cellVal === 'kode' ||
              cellVal === 'sku'
            ) {
              skuColIdx = c;
            }
            if (
              cellVal.includes('nama barang') ||
              cellVal.includes('deskripsi') ||
              cellVal.includes('nama item') ||
              cellVal === 'nama'
            ) {
              nameColIdx = c;
            }
            if (
              cellVal.includes('total quantity') ||
              cellVal.includes('qty') ||
              cellVal.includes('stok') ||
              cellVal.includes('quantity') ||
              cellVal.includes('saldo akhir')
            ) {
              stockColIdx = c;
            }
          }

          if (skuColIdx !== -1 && stockColIdx !== -1) {
            startRow = r + 1;
            break;
          }
        }

        if (skuColIdx === -1 || stockColIdx === -1) {
          skuColIdx = 1;
          nameColIdx = 4;
          stockColIdx = 6;
          startRow = 4;
        }

        const extractedItems: Array<{
          sku: string;
          name?: string;
          raw_qty: number;
          unit: string;
          stock: number;
        }> = [];

        for (let r = startRow; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const rawSku = String(row[skuColIdx] || '').trim();
          if (!rawSku || rawSku.toLowerCase().includes('total') || rawSku.toLowerCase().includes('halaman')) {
            continue;
          }

          const rawName = nameColIdx !== -1 && row[nameColIdx] ? String(row[nameColIdx]).trim() : '';
          const rawQty = row[stockColIdx];
          let qtyNum = 0;
          let unit = targetWarehouse === 'A' ? 'LSN' : 'PSG';
          let isLusin = targetWarehouse === 'A';

          if (typeof rawQty === 'number') {
            qtyNum = rawQty;
          } else if (typeof rawQty === 'string') {
            const match = rawQty.match(/([0-9.-]+)\s*([A-Za-z]+)?/);
            if (match) {
              qtyNum = parseFloat(match[1]) || 0;
              if (match[2]) {
                const foundUnit = match[2].toUpperCase();
                unit = foundUnit;
                if (foundUnit === 'LSN' || foundUnit === 'LUSIN') isLusin = true;
                if (foundUnit === 'PSG' || foundUnit === 'PCS') isLusin = false;
              }
            }
          }

          const stockPcs = isLusin ? Math.round(qtyNum * 12) : Math.round(qtyNum);

          extractedItems.push({
            sku: rawSku,
            name: rawName,
            raw_qty: qtyNum,
            unit: unit,
            stock: stockPcs,
          });
        }

        if (extractedItems.length === 0) {
          setValidationError('Tidak ada baris SKU dan kuantitas stok yang berhasil dibaca dari file Excel ini.');
          setIsParsing(false);
          return;
        }

        // Kirim ke server untuk batch replace master_stocks
        setIsSubmitting(true);
        const csrfToken =
          document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

        const response = await fetch('/master-stock/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            Accept: 'application/json',
          },
          body: JSON.stringify({
            warehouse: targetWarehouse,
            items: extractedItems,
          }),
        });

        const resData = await response.json();
        setIsParsing(false);
        setIsSubmitting(false);

        if (!response.ok || resData.status !== 'success') {
          setValidationError(resData.message || 'Gagal menyimpan Master Stok ke server.');
          return;
        }

        setImportSuccessMessage(resData.message);
        // Refresh data Inertia
        router.reload({ only: ['stocks', 'summary'] });
      } catch (err: any) {
        setValidationError(`Terjadi kesalahan saat memproses file: ${err.message}`);
        setIsParsing(false);
        setIsSubmitting(false);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function formatDate(dStr: string | null) {
    if (!dStr) return '—';
    try {
      const d = new Date(dStr);
      return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dStr;
    }
  }

  return (
    <AppLayout>
      <Head title="Master Stok (Gudang A & G)" />

      <div className="space-y-6">
        {/* Flash Message Banner */}
        {flash?.success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between text-sm shadow-xs">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{flash.success}</span>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Master Stok (Gudang A & G)</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                Pusat Stok Fisik
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Pusat penyimpanan data stok fisik Gudang G (Eceran) dan Gudang A (Grosir Lusinan). Terhubung langsung
              sebagai acuan ketersediaan stok di marketplace Shopee.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Tombol Import Gudang G */}
            <button
              onClick={() => openImportModal('G')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <span>Import Gudang G (Pcs)</span>
            </button>

            {/* Tombol Import Gudang A */}
            <button
              onClick={() => openImportModal('A')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <span>Import Gudang A (Lusin)</span>
            </button>

            {/* Tombol Langsung ke Stok Shopee */}
            <Link
              href="/shopee-products"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>Audit & Kosongkan Shopee</span>
            </Link>

            {/* Export CSV */}
            <a
              href={`/master-stock/export?warehouse=${warehouse}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors shadow-2xs"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Gudang G Card */}
          <div className="bg-white border border-blue-200/80 rounded-2xl p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                  🏷️ Gudang G (Eceran / Pcs)
                </span>
                <p className="text-2xl font-black text-slate-900 mt-2">
                  {summary.total_pcs_g.toLocaleString('id-ID')} <span className="text-xs font-medium text-slate-500">Pcs</span>
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                  <span>{summary.total_items_g.toLocaleString('id-ID')} SKU barang</span>
                  <span>•</span>
                  <span>Update: {formatDate(summary.last_imported_g)}</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Gudang A Card */}
          <div className="bg-white border border-purple-200/80 rounded-2xl p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">
                  📦 Gudang A (Grosir / Lusin)
                </span>
                <p className="text-2xl font-black text-slate-900 mt-2">
                  {summary.total_pcs_a.toLocaleString('id-ID')} <span className="text-xs font-medium text-slate-500">Pcs (x12)</span>
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                  <span>{summary.total_items_a.toLocaleString('id-ID')} SKU barang</span>
                  <span>•</span>
                  <span>Update: {formatDate(summary.last_imported_a)}</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Total Gabungan Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 text-white shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-slate-700/80 text-amber-300">
                  ⚡ Total Stok Fisik ERP
                </span>
                <p className="text-2xl font-black text-white mt-2">
                  {summary.total_pcs_all.toLocaleString('id-ID')}{' '}
                  <span className="text-xs font-normal text-slate-400">Pcs Gabungan</span>
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                  <span>{summary.total_rows_all.toLocaleString('id-ID')} Total Baris SKU</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">Tersinkron dengan Shopee</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-800 text-amber-400 flex items-center justify-center shrink-0 border border-slate-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Filter Gudang */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => {
              setWarehouse('all');
              applyFilters('all');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              warehouse === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Semua Gudang ({summary.total_rows_all})
          </button>
          <button
            onClick={() => {
              setWarehouse('G');
              applyFilters('G');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              warehouse === 'G'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
            }`}
          >
            <span>🏷️ Gudang G (Eceran / Pcs)</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                warehouse === 'G' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {summary.total_items_g}
            </span>
          </button>
          <button
            onClick={() => {
              setWarehouse('A');
              applyFilters('A');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              warehouse === 'A'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50'
            }`}
          >
            <span>📦 Gudang A (Grosir / Lusin)</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                warehouse === 'A' ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {summary.total_items_a}
            </span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Cari Kode Barang (8 digit), Nama Barang..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-900 placeholder:text-slate-400"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={stockStatus}
                onChange={(e) => {
                  setStockStatus(e.target.value);
                  applyFilters(warehouse, e.target.value);
                }}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              >
                <option value="all">Semua Status Stok</option>
                <option value="in_stock">Tersedia (&gt; 0)</option>
                <option value="out_of_stock">Stok Habis (= 0)</option>
              </select>

              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  applyFilters(warehouse, stockStatus, e.target.value);
                }}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              >
                <option value="code_asc">Kode Barang (A-Z)</option>
                <option value="stock_desc">Stok Terbanyak</option>
                <option value="stock_asc">Stok Tersedikit</option>
                <option value="name_asc">Nama Barang (A-Z)</option>
                <option value="updated_desc">Terakhir Diupdate</option>
              </select>

              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors shrink-0"
              >
                Filter
              </button>

              {(search || warehouse !== 'all' || stockStatus !== 'all' || sort !== 'code_asc') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Master Stock Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-900/5 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="py-3.5 px-4 w-12 text-center">No</th>
                  <th className="py-3.5 px-4 w-32">Gudang</th>
                  <th className="py-3.5 px-4 w-44">Kode Barang</th>
                  <th className="py-3.5 px-4">Nama Barang</th>
                  <th className="py-3.5 px-4 w-28 text-right">Satuan Asli</th>
                  <th className="py-3.5 px-4 w-36 text-right">Stok Efektif (Pcs)</th>
                  <th className="py-3.5 px-4 w-44">Terakhir Diimpor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stocks.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-600">Belum ada data Master Stok</p>
                        <p className="text-xs text-slate-400 max-w-sm">
                          Silakan klik tombol <strong>Import Gudang G</strong> atau <strong>Import Gudang A</strong> di
                          atas untuk mengunggah file spreadsheet stok gudang Anda.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  stocks.data.map((item, index) => {
                    const rowNo = (stocks.current_page - 1) * stocks.per_page + index + 1;
                    const isGudangG = item.warehouse === 'G';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-mono">{rowNo}</td>
                        <td className="py-3 px-4">
                          {isGudangG ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                              🏷️ Gudang G
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                              📦 Gudang A
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {item.item_code}
                        </td>
                        <td className="py-3 px-4 text-slate-800">
                          <span className="font-medium">{item.item_name || '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {Number(item.raw_qty).toLocaleString('id-ID')} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold font-mono text-xs ${
                              item.qty_pcs <= 0
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : item.qty_pcs <= 3
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : isGudangG
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-purple-50 text-purple-800 border border-purple-200'
                            }`}
                          >
                            {item.qty_pcs.toLocaleString('id-ID')} pcs
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {formatDate(item.last_imported_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {stocks.last_page > 1 && (
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Menampilkan{' '}
                <span className="font-semibold text-slate-700">
                  {(stocks.current_page - 1) * stocks.per_page + 1}
                </span>{' '}
                sampai{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(stocks.current_page * stocks.per_page, stocks.total)}
                </span>{' '}
                dari <span className="font-semibold text-slate-700">{stocks.total}</span> data
              </div>

              <div className="flex items-center gap-1">
                {stocks.links.map((link, idx) => (
                  <button
                    key={idx}
                    disabled={!link.url}
                    onClick={() => link.url && router.visit(link.url, { preserveState: true })}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      link.active
                        ? 'bg-indigo-600 text-white font-bold'
                        : link.url
                        ? 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        : 'text-slate-300 cursor-not-allowed'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL IMPORT EXCEL (DENGAN STRICT CROSS-VALIDATION) */}
      {isImportModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-fade-in">
              {/* Modal Header */}
              <div
                className={`p-5 border-b flex items-center justify-between text-white ${
                  targetWarehouse === 'G'
                    ? 'bg-gradient-to-r from-blue-700 to-blue-600 border-blue-800'
                    : 'bg-gradient-to-r from-purple-700 to-purple-600 border-purple-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {targetWarehouse === 'G' ? '🏷️' : '📦'}
                    </span>
                    <h3 className="text-base font-bold text-white">
                      Import Master Stok {targetWarehouse === 'G' ? 'Gudang G (Eceran / Pcs)' : 'Gudang A (Grosir / Lusin)'}
                    </h3>
                  </div>
                  <p className="text-xs text-white/80 mt-0.5">
                    {targetWarehouse === 'G'
                      ? 'Laporan stok eceran pasang per variasi ukuran'
                      : 'Laporan grosir lusinan (otomatis dikali 12 ke Pcs)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Switcher Gudang di dalam Modal */}
                <div className="p-1 bg-slate-100 rounded-xl flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetWarehouse('G');
                      setValidationError(null);
                      setImportSuccessMessage(null);
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      targetWarehouse === 'G'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🏷️ Gudang G (Eceran)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetWarehouse('A');
                      setValidationError(null);
                      setImportSuccessMessage(null);
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      targetWarehouse === 'A'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📦 Gudang A (Lusin x12)</span>
                  </button>
                </div>

                {/* Alert Penolakan / Error Validasi Silang */}
                {validationError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2 animate-fade-in">
                    <div className="flex items-start gap-2.5">
                      <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div className="flex-1">
                        <p className="font-semibold text-rose-900">{validationError}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-rose-200/60 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetWarehouse(targetWarehouse === 'G' ? 'A' : 'G');
                          setValidationError(null);
                        }}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg transition-colors"
                      >
                        Ganti ke Mode Gudang {targetWarehouse === 'G' ? 'A' : 'G'} & Coba Lagi
                      </button>
                    </div>
                  </div>
                )}

                {/* Alert Sukses */}
                {importSuccessMessage && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-fade-in">
                    <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p className="font-semibold text-emerald-900">{importSuccessMessage}</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Data Master Stok telah diperbarui dan langsung tersambung ke stok Shopee.
                      </p>
                    </div>
                  </div>
                )}

                {/* Upload Zone */}
                <div
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                    targetWarehouse === 'G'
                      ? 'border-blue-300 hover:border-blue-500 bg-blue-50/30'
                      : 'border-purple-300 hover:border-purple-500 bg-purple-50/30'
                  }`}
                >
                  <input
                    type="file"
                    id="excelMasterInput"
                    accept=".xlsx, .xls, .csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    disabled={isParsing || isSubmitting}
                    className="hidden"
                  />
                  <label htmlFor="excelMasterInput" className="cursor-pointer space-y-3 block">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto transition-transform hover:scale-105 ${
                        targetWarehouse === 'G' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {isParsing || isSubmitting ? (
                        <svg
                          className={`animate-spin h-7 w-7 ${
                            targetWarehouse === 'G' ? 'text-blue-600' : 'text-purple-600'
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {isParsing || isSubmitting
                          ? 'Menyimpan Master Stok ke Database...'
                          : targetWarehouse === 'G'
                          ? 'Pilih File STOCK GUDANG G (.xls / .xlsx)'
                          : 'Pilih File STOCK GUDANG A (.xls / .xlsx)'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        {targetWarehouse === 'G' ? (
                          <>
                            Khusus file <strong>GUDANG G</strong> (Eceran/Pcs per ukuran). File Gudang A otomatis ditolak.
                          </>
                        ) : (
                          <>
                            Khusus file <strong>GUDANG A</strong> (Grosir/Lusin otomatis dikali 12). File Gudang G otomatis ditolak.
                          </>
                        )}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors ${
                        targetWarehouse === 'G'
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-purple-600 hover:bg-purple-700'
                      }`}
                    >
                      Pilih Spreadsheet {targetWarehouse === 'G' ? 'Gudang G' : 'Gudang A'}
                    </span>
                  </label>
                </div>

                {importFileName && (
                  <p className="text-center text-xs text-slate-500 font-mono">
                    File: <span className="font-semibold text-slate-700">{importFileName}</span>
                  </p>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Data otomatis menggantikan snapshot stok gudang sebelumnya
                </span>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
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

