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

  function openImportModal(wh: 'G' | 'A') {
    setTargetWarehouse(wh);
    setValidationError(null);
    setImportFileName(null);
    setImportSuccessMessage(null);
    setIsImportModalOpen(true);
  }

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

        if (targetWarehouse === 'G' && contentIsA && !contentIsG) {
          setValidationError(
            'File ditolak: Anda memilih mode Gudang G (Eceran), namun mengunggah laporan Gudang A (Grosir Lusinan).'
          );
          setIsParsing(false);
          return;
        }

        if (targetWarehouse === 'A' && contentIsG && !contentIsA) {
          setValidationError(
            'File ditolak: Anda memilih mode Gudang A (Grosir), namun mengunggah laporan Gudang G (Eceran Satuan).'
          );
          setIsParsing(false);
          return;
        }

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
      <Head title="Master Stok Gudang - Koding ERP" />

      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Flash Message Banner */}
        {flash?.success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-2xs">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
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

        {/* Header Title Banner - Konsisten dengan Cut Off Orders */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Stok Gudang</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Inventori Fisik ERP
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Pusat penyimpanan data stok fisik Gudang G (Eceran / Pcs) dan Gudang A (Grosir / Lusinan). Terhubung
              langsung sebagai acuan ketersediaan stok di marketplace Shopee.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Import Gudang G */}
            <button
              type="button"
              onClick={() => openImportModal('G')}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
              title="Upload laporan stok Gudang G (Eceran / Pcs per ukuran)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-sky-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.386a3.75 3.75 0 001.378-1.378c.486-.827.313-1.908-.386-2.607L7.258 7.569A2.25 2.25 0 016.598 5.978V5.25A2.25 2.25 0 018.848 3h.72" />
              </svg>
              <span>Import Gudang G (Pcs)</span>
            </button>

            {/* Import Gudang A */}
            <button
              type="button"
              onClick={() => openImportModal('A')}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
              title="Upload laporan stok Gudang A (Grosir / Lusinan dikalikan 12)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-teal-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span>Import Gudang A (Lusin)</span>
            </button>

            {/* Audit & Kosongkan Shopee */}
            <Link
              href="/shopee-products?audit=master"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap active:scale-98"
              title="Cocokkan stok fisik dengan toko Shopee dan kosongkan produk yang habis"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-amber-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              <span>Audit & Kosongkan Shopee</span>
            </Link>

            {/* Export CSV */}
            <a
              href={`/master-stock/export?warehouse=${warehouse}`}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs"
              title="Download seluruh data stok ke file CSV"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        {/* 3 Metric Summary Cards - High-End Minimalist, Anti AI-Slop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Gudang G */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Gudang G (Eceran / Pcs)
              </span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-sky-50 text-sky-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.386a3.75 3.75 0 001.378-1.378c.486-.827.313-1.908-.386-2.607L7.258 7.569A2.25 2.25 0 016.598 5.978V5.25A2.25 2.25 0 018.848 3h.72" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {summary.total_pcs_g.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-medium text-slate-500 font-sans">Pcs</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                <span>{summary.total_items_g.toLocaleString('id-ID')} SKU • Update: {formatDate(summary.last_imported_g)}</span>
              </p>
            </div>
          </div>

          {/* Card 2: Gudang A */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Gudang A (Grosir / Lusin)
              </span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-teal-50 text-teal-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {summary.total_pcs_a.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-medium text-slate-500 font-sans">Pcs (x12)</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                <span>{summary.total_items_a.toLocaleString('id-ID')} SKU • Update: {formatDate(summary.last_imported_a)}</span>
              </p>
            </div>
          </div>

          {/* Card 3: Total Gabungan ERP */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Stok Fisik ERP
              </span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {summary.total_pcs_all.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-medium text-slate-500 font-sans">Pcs Gabungan</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>{summary.total_rows_all.toLocaleString('id-ID')} Total Baris SKU • Tersinkron Shopee</span>
              </p>
            </div>
          </div>
        </div>

        {/* Filter Pills & Controls Section */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          {/* Tab Filter Gudang */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                setWarehouse('all');
                applyFilters('all');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                warehouse === 'all'
                  ? 'bg-[#0B132B] text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              Semua Gudang ({summary.total_rows_all})
            </button>

            <button
              type="button"
              onClick={() => {
                setWarehouse('G');
                applyFilters('G');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                warehouse === 'G'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-blue-50/60 text-slate-600 border border-slate-200'
              }`}
            >
              <span>Gudang G (Eceran / Pcs)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  warehouse === 'G' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {summary.total_items_g}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setWarehouse('A');
                applyFilters('A');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                warehouse === 'A'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-teal-50/60 text-slate-600 border border-slate-200'
              }`}
            >
              <span>Gudang A (Grosir / Lusin)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  warehouse === 'A' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {summary.total_items_a}
              </span>
            </button>
          </div>

          {/* Search Bar & Dropdowns */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 pt-1 border-t border-slate-100">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Cari Kode Barang (8 digit), Nama Barang..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-slate-400 focus:ring-0 transition-all text-slate-900 placeholder:text-slate-400"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-3"
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

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={stockStatus}
                onChange={(e) => {
                  setStockStatus(e.target.value);
                  applyFilters(warehouse, e.target.value);
                }}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-slate-400 focus:ring-0"
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
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-slate-400 focus:ring-0"
              >
                <option value="code_asc">Kode Barang (A-Z)</option>
                <option value="stock_desc">Stok Terbanyak</option>
                <option value="stock_asc">Stok Tersedikit</option>
                <option value="name_asc">Nama Barang (A-Z)</option>
                <option value="updated_desc">Terakhir Diupdate</option>
              </select>

              <button
                type="submit"
                className="px-4 py-2.5 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shrink-0 shadow-xs cursor-pointer"
              >
                Filter
              </button>

              {(search || warehouse !== 'all' || stockStatus !== 'all' || sort !== 'code_asc') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors shrink-0 cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Master Stock Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">Belum ada data Master Stok</p>
                        <p className="text-xs text-slate-400 max-w-sm">
                          Klik tombol <strong>Import Gudang G (Pcs)</strong> atau <strong>Import Gudang A (Lusin)</strong> di
                          atas untuk mengunggah spreadsheet stok fisik gudang Anda.
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
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                              Gudang G
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                              Gudang A
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {item.item_code}
                        </td>
                        <td className="py-3 px-4 text-slate-800">
                          <span className="font-medium">{item.item_name || '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                          {Number(item.raw_qty).toLocaleString('id-ID')} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-xs font-bold ${
                              item.qty_pcs <= 0
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : item.qty_pcs <= 3
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
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
                <strong className="text-slate-900 font-bold">
                  {(stocks.current_page - 1) * stocks.per_page + 1}
                </strong>{' '}
                s/d{' '}
                <strong className="text-slate-900 font-bold">
                  {Math.min(stocks.current_page * stocks.per_page, stocks.total)}
                </strong>{' '}
                dari <strong className="text-slate-900 font-bold">{stocks.total.toLocaleString('id-ID')}</strong> SKU
              </div>

              <div className="flex items-center gap-1">
                {stocks.links.map((link, idx) => (
                  <button
                    key={idx}
                    disabled={!link.url}
                    onClick={() => link.url && router.visit(link.url, { preserveState: true })}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                      link.active
                        ? 'bg-[#0B132B] text-white border-[#0B132B] font-bold'
                        : link.url
                        ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        : 'text-slate-300 border-slate-100 cursor-not-allowed'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL IMPORT EXCEL (ANTI AI-SLOP, CLEAN & STRUCTURED) */}
      {isImportModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-fade-in">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Import Master Stok {targetWarehouse === 'G' ? 'Gudang G (Eceran / Pcs)' : 'Gudang A (Grosir / Lusin)'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {targetWarehouse === 'G'
                      ? 'Format stok eceran pasang per variasi ukuran'
                      : 'Format grosir lusinan (otomatis dikali 12 ke Pcs)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Switcher Gudang */}
                <div className="p-1 bg-slate-100 rounded-xl flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetWarehouse('G');
                      setValidationError(null);
                      setImportSuccessMessage(null);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      targetWarehouse === 'G'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Gudang G (Eceran / Pcs)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetWarehouse('A');
                      setValidationError(null);
                      setImportSuccessMessage(null);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      targetWarehouse === 'A'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Gudang A (Grosir / Lusin)
                  </button>
                </div>

                {/* Alert Penolakan Validasi Silang */}
                {validationError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2 animate-fade-in">
                    <div className="flex items-start gap-2.5">
                      <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
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

                    <div className="pt-2 border-t border-rose-200/60 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetWarehouse(targetWarehouse === 'G' ? 'A' : 'G');
                          setValidationError(null);
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Beralih ke Gudang {targetWarehouse === 'G' ? 'A' : 'G'} & Coba Lagi
                      </button>
                    </div>
                  </div>
                )}

                {/* Alert Sukses */}
                {importSuccessMessage && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-fade-in">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p className="font-semibold text-emerald-900">{importSuccessMessage}</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Snapshot data stok gudang telah diperbarui.
                      </p>
                    </div>
                  </div>
                )}

                {/* Upload Zone */}
                <div className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors">
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
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center mx-auto shadow-2xs">
                      {isParsing || isSubmitting ? (
                        <svg className="animate-spin h-6 w-6 text-slate-700" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {isParsing || isSubmitting
                          ? 'Menyimpan Master Stok ke Database...'
                          : targetWarehouse === 'G'
                          ? 'Pilih File STOCK GUDANG G (.xls / .xlsx)'
                          : 'Pilih File STOCK GUDANG A (.xls / .xlsx)'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        Mendukung format spreadsheet hasil export sistem persediaan (.xlsx, .xls, .csv).
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer">
                      Pilih File {targetWarehouse === 'G' ? 'Gudang G' : 'Gudang A'}
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
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Data otomatis menggantikan snapshot stok gudang sebelumnya
                </span>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
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
