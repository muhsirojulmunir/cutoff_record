import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Head, Link, router, usePage } from '@inertiajs/react';
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
  // Warehouse & Reconciliation fields
  warehouse_stock?: number;
  stock_g?: number;
  stock_a?: number;
  matched_code?: string | null;
  match_type?: 'EXACT_CODE' | 'SMART_MATCH' | 'SIZE_MISMATCH' | 'CODE_NOT_FOUND' | 'NO_CODE' | 'MANUAL_MAPPED';
  is_critical_oos?: boolean;
  is_campaign_locked?: boolean;
  is_campaign_unlocked?: boolean;
  locked_campaign_qty?: number;
  was_campaign_locked?: boolean;
  suggested_code?: string | null;
  suggested_name?: string | null;
  warning_message?: string | null;
  is_safe_to_zero?: boolean;
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
  critical_oos_count?: number;
  campaign_locked_count?: number;
  campaign_unlocked_count?: number;
  gudang_ready_count?: number;
  critical_oos_ids?: number[];
  campaign_unlocked_ids?: number[];
  last_synced_at: string | null;
}

interface RestockVariantItem {
  id: number;
  item_id: number;
  model_id: number;
  sku: string;
  item_name: string;
  model_name: string;
  current_stock: number;
  reserved_stock: number;
  warehouse_stock: number;
  stock_g: number;
  stock_a: number;
  matched_code?: string;
  input_qty?: number;
  new_stock: number;
  isSelected: boolean;
}

interface RestockModalState {
  isOpen: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  searchQuery: string;
  selectedItemId: number | null;
  productTitle: string;
  variants: RestockVariantItem[];
  batchQty: number;
  batchMode: 'set' | 'add';
}

interface MasterStockSummary {
  total_g_items: number;
  total_g_pcs: number;
  last_imported_g: string | null;
  total_a_items: number;
  total_a_pcs: number;
  last_imported_a: string | null;
  has_master_stock: boolean;
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
  master_stock_summary?: MasterStockSummary;
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
  manual_item_code?: string | null;
  match_type?: 'EXACT_CODE' | 'SMART_MATCH' | 'SIZE_MISMATCH' | 'CODE_NOT_FOUND' | 'NO_CODE' | 'MANUAL_MAPPED';
  matched_code?: string | null;
  suggested_code?: string | null;
  suggested_name?: string | null;
  warning_message?: string | null;
  is_safe_to_zero?: boolean;
}

interface AuditSummary {
  total_rows: number;
  critical_count: number;
  low_stock_count: number;
  discrepancy_count: number;
  matched_count: number;
  unmatched_count: number;
}

interface ConfirmModalState {
  isOpen: boolean;
  type: 'ZERO_SINGLE' | 'ZERO_ALL' | 'SYNC_CATALOG';
  title: string;
  message?: string;
  sku?: string;
  productName?: string;
  modelName?: string;
  count?: number;
  skusList?: string[];
  targetId?: number;
  reservedStock?: number;
  isCampaignLocked?: boolean;
  isCampaignUnlocked?: boolean;
}

/**
 * Memainkan suara alarm lembut (chime audio) dengan Web Audio API sintetis
 * Bebas dependensi file audio eksternal dan 100% responsif.
 */
function playAlarmChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // Nada 1: D5 (587 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.22);

    // Nada 2: A5 (880 Hz) - nada bel peringatan tajam dan jernih
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {
    // Abaikan jika browser membatasi autoplay
  }
}

export default function ShopeeProductsIndex({
  products,
  filters,
  summary,
  account,
  master_stock_summary,
}: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [stockStatus, setStockStatus] = useState(filters.stock_status ?? 'all');
  const [sort, setSort] = useState(filters.sort ?? 'stock_desc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [zeroingOutId, setZeroingOutId] = useState<number | null>(null);

  // States untuk Modal Import Stok Internal & Master Stok
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [auditSource, setAuditSource] = useState<'EXCEL' | 'MASTER'>('MASTER');
  const [masterWarehouseFilter, setMasterWarehouseFilter] = useState<'ALL' | 'G' | 'A'>('ALL');
  const [targetWarehouse, setTargetWarehouse] = useState<'G' | 'A'>('G');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [detectedWarehouse, setDetectedWarehouse] = useState<'A' | 'G' | 'GENERAL' | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[] | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'CRITICAL' | 'LOW_STOCK' | 'DISCREPANCY' | 'MATCHED' | 'UNMATCHED'>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [isZeroingOutAll, setIsZeroingOutAll] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [zeroOutSuccessMessage, setZeroOutSuccessMessage] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Auto hide toast notice after 4 seconds
  React.useEffect(() => {
    if (!toastNotice) return;
    const t = setTimeout(() => setToastNotice(null), 4000);
    return () => clearTimeout(t);
  }, [toastNotice]);

  // State Dialog Alarm & Konfirmasi Aksi Kritis (Anti Native Browser Popup)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    type: 'ZERO_SINGLE',
    title: '',
  });

  // States untuk Fitur Isi / Tambah Stok Shopee Cepat (Quick Restock)
  const [restockModal, setRestockModal] = useState<RestockModalState>({
    isOpen: false,
    isLoading: false,
    isSubmitting: false,
    searchQuery: '',
    selectedItemId: null,
    productTitle: '',
    variants: [],
    batchQty: 10,
    batchMode: 'set',
  });

  function extractArticleFromProduct(item: ProductItem): string {
    if (item.sku) {
      const parts = item.sku.split(/[-_ ]+/);
      const ignore = ['RECORD', 'SPT', 'SEPATU', 'SHOES', 'REC', 'ANAK', 'PRIA', 'WANITA'];
      const articlePart = parts.find(p => {
        const u = p.toUpperCase().trim();
        return u.length >= 3 && !ignore.includes(u) && !/^\d+$/.test(u);
      });
      if (articlePart) return articlePart;
    }

    if (item.model_name) {
      const parts = item.model_name.split(/[\s,/-]+/);
      const ignore = ['HITAM', 'PUTIH', 'MERAH', 'BIRU', 'ABU', 'HP', 'HH', 'MO', 'BO', 'BA', 'STANDAR'];
      const articlePart = parts.find(p => {
        const u = p.toUpperCase().trim();
        return u.length >= 3 && !ignore.includes(u) && !/^\d+$/.test(u);
      });
      if (articlePart) return articlePart;
    }

    return item.item_name;
  }

  async function openRestockModal(targetProduct?: ProductItem | null, customQuery?: string) {
    const query = customQuery !== undefined
      ? customQuery
      : (targetProduct ? extractArticleFromProduct(targetProduct) : '');
    const title = targetProduct?.item_name || query;

    setRestockModal({
      isOpen: true,
      isLoading: true,
      isSubmitting: false,
      searchQuery: query,
      selectedItemId: targetProduct?.item_id || null,
      productTitle: title || '',
      variants: [],
      batchQty: 10,
      batchMode: 'set',
    });

    try {
      const params = new URLSearchParams();
      if (targetProduct?.item_id) {
        params.set('item_id', String(targetProduct.item_id));
      }
      if (query.trim()) {
        params.set('q', query.trim());
      }
      const resp = await fetch(`/shopee-products/variants?${params.toString()}`);
      const res = await resp.json();
      if (res.status === 'success') {
        const items = (res.variants || []).map((v: any) => ({
          ...v,
          input_qty: restockModal.batchMode === 'add' ? 0 : v.current_stock,
          new_stock: v.current_stock,
          isSelected: true,
        }));
        setRestockModal(prev => ({
          ...prev,
          isLoading: false,
          variants: items,
          productTitle: items.length > 0 ? items[0].item_name : (title || ''),
        }));
      } else {
        setRestockModal(prev => ({ ...prev, isLoading: false }));
        setToastNotice({ message: res.message || 'Gagal memuat variasi produk.', type: 'error' });
      }
    } catch (e: any) {
      setRestockModal(prev => ({ ...prev, isLoading: false }));
      setToastNotice({ message: 'Terjadi kesalahan: ' + e.message, type: 'error' });
    }
  }

  async function handleSearchRestockVariants(q: string) {
    if (!q.trim()) return;
    setRestockModal(prev => ({
      ...prev,
      searchQuery: q,
      isLoading: true,
      productTitle: `Artikel: ${q.toUpperCase().trim()}`,
      selectedItemId: null, // Reset item_id agar pencarian mencakup seluruh SKU katalog
    }));
    try {
      const resp = await fetch(`/shopee-products/variants?q=${encodeURIComponent(q.trim())}`);
      const res = await resp.json();
      if (res.status === 'success') {
        const items = (res.variants || []).map((v: any) => ({
          ...v,
          input_qty: restockModal.batchMode === 'add' ? 0 : v.current_stock,
          new_stock: v.current_stock,
          isSelected: true,
        }));
        setRestockModal(prev => ({
          ...prev,
          isLoading: false,
          variants: items,
          productTitle: items.length > 0 ? `Artikel: ${q.toUpperCase().trim()}` : `Pencarian: ${q}`,
        }));
      } else {
        setRestockModal(prev => ({ ...prev, isLoading: false }));
        setToastNotice({ message: res.message || 'Gagal memuat variasi.', type: 'error' });
      }
    } catch (e: any) {
      setRestockModal(prev => ({ ...prev, isLoading: false }));
    }
  }

  function applyBatchRestockQty(overrideQty?: number) {
    const qty = overrideQty !== undefined ? overrideQty : (Number(restockModal.batchQty) || 0);
    const cleanQty = Math.max(0, qty);
    setRestockModal(prev => ({
      ...prev,
      batchQty: cleanQty,
      variants: prev.variants.map(v => {
        if (!v.isSelected) return v;
        const targetStock = prev.batchMode === 'set' ? cleanQty : Math.max(0, v.current_stock + cleanQty);
        return {
          ...v,
          input_qty: cleanQty,
          new_stock: targetStock,
        };
      }),
    }));
  }

  function toggleAllRestockSelect(checked: boolean) {
    setRestockModal(prev => ({
      ...prev,
      variants: prev.variants.map(v => ({ ...v, isSelected: checked })),
    }));
  }

  function toggleRestockItemSelect(productId: number) {
    setRestockModal(prev => ({
      ...prev,
      variants: prev.variants.map(v => v.id === productId ? { ...v, isSelected: !v.isSelected } : v),
    }));
  }

  function updateVariantInputQty(productId: number, val: number) {
    const num = Math.max(0, val);
    setRestockModal(prev => ({
      ...prev,
      variants: prev.variants.map(v => {
        if (v.id !== productId) return v;
        const targetStock = prev.batchMode === 'set'
          ? num
          : Math.max(0, v.current_stock + num);
        return {
          ...v,
          input_qty: num,
          new_stock: targetStock,
        };
      }),
    }));
  }

  async function submitRestockToShopee() {
    const selectedVariants = restockModal.variants.filter(v => v.isSelected);
    if (selectedVariants.length === 0) {
      setToastNotice({ message: 'Pilih setidaknya 1 variasi ukuran untuk diupdate ke Shopee.', type: 'info' });
      return;
    }

    setRestockModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const payload = {
        updates: selectedVariants.map(v => ({
          product_id: v.id,
          stock: Math.max(0, Number(v.new_stock) || 0),
        })),
      };

      const resp = await fetch('/shopee-products/update-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const res = await resp.json();
      if (res.status === 'success') {
        playAlarmChime();
        setRestockModal(prev => ({ ...prev, isOpen: false, isSubmitting: false }));
        setToastNotice({
          message: res.message || `Berhasil memperbarui stok ${selectedVariants.length} variasi di Shopee!`,
          type: 'success',
        });
        router.reload({ only: ['products', 'summary'] });
      } else {
        setRestockModal(prev => ({ ...prev, isSubmitting: false }));
        setToastNotice({ message: res.message || 'Gagal mengubah stok di Shopee.', type: 'error' });
      }
    } catch (e: any) {
      setRestockModal(prev => ({ ...prev, isSubmitting: false }));
      setToastNotice({ message: 'Terjadi kesalahan: ' + e.message, type: 'error' });
    }
  }

  // States untuk fitur Mapping Manual Kode Barang ke Master Stok
  const [mappingModalItem, setMappingModalItem] = useState<AuditItem | null>(null);
  const [mappingSearchQuery, setMappingSearchQuery] = useState('');
  const [mappingSearchResults, setMappingSearchResults] = useState<any[]>([]);
  const [isSearchingMaster, setIsSearchingMaster] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);

  async function handleSearchMaster(query: string) {
    setMappingSearchQuery(query);
    if (!query.trim()) {
      setMappingSearchResults([]);
      return;
    }
    setIsSearchingMaster(true);
    try {
      const resp = await fetch(`/shopee-products/search-master?q=${encodeURIComponent(query.trim())}`);
      const resJson = await resp.json();
      if (resJson.status === 'success') {
        setMappingSearchResults(resJson.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingMaster(false);
    }
  }

  async function handleSaveMapping(productId: number, targetCode: string) {
    setIsSavingMapping(true);
    try {
      const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const resp = await fetch('/shopee-products/map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Accept: 'application/json',
        },
        body: JSON.stringify({ product_id: productId, item_code: targetCode }),
      });
      const resJson = await resp.json();
      if (resJson.status === 'success') {
        setMappingModalItem(null);
        setToastNotice({ message: 'Mapping kode barang berhasil disimpan!', type: 'success' });
        // Refresh audit master stok langsung agar perubahan terlihat seketika
        if (auditSource === 'MASTER') {
          runMasterAudit(masterWarehouseFilter);
        }
      } else {
        setToastNotice({ message: resJson.message || 'Gagal menyimpan mapping.', type: 'error' });
      }
    } catch (e: any) {
      setToastNotice({ message: 'Terjadi kesalahan: ' + e.message, type: 'error' });
    } finally {
      setIsSavingMapping(false);
    }
  }

  // Auto trigger audit jika ada query ?audit=master
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('audit') === 'master') {
      runMasterAudit('ALL');
    }
  }, []);

  // Jalankan audit langsung ke data Master Stok (Database ERP)
  async function runMasterAudit(targetWh: 'ALL' | 'G' | 'A' = 'ALL') {
    setIsComparing(true);
    setAuditSource('MASTER');
    setMasterWarehouseFilter(targetWh);
    setIsImportModalOpen(true);
    setValidationError(null);
    setZeroOutSuccessMessage(null);

    try {
      const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const res = await fetch('/shopee-products/audit-master', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          Accept: 'application/json',
        },
        body: JSON.stringify({ warehouse: targetWh }),
      });
      const data = await res.json();
      setIsComparing(false);

      if (!res.ok || data.status !== 'success') {
        setValidationError(data.message || 'Gagal membandingkan dengan Master Stok.');
        return;
      }

      setAuditSummary(data.summary);
      setAuditItems(data.items);
      if (data.summary.critical_count > 0) {
        playAlarmChime();
      }
    } catch (err: any) {
      setIsComparing(false);
      setValidationError(`Gagal menghubungi server: ${err.message}`);
    }
  }

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

  function promptSync() {
    if (!account?.is_connected) {
      setToastNotice({ message: 'Toko Shopee belum terhubung dengan token aktif. Harap hubungkan toko terlebih dahulu di menu Integrasi Shopee.', type: 'error' });
      return;
    }
    playAlarmChime();
    setConfirmModal({
      isOpen: true,
      type: 'SYNC_CATALOG',
      title: 'Tarik Seluruh Katalog Produk Shopee',
      message: 'Sistem akan mengambil seluruh produk aktif dari toko Shopee Anda dan memperbarui stok terkini via Open API.',
    });
  }

  function executeSync() {
    setIsSyncing(true);
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
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
    setValidationError(null);
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

        // Cek juga satuan data jika belum pasti
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

        setDetectedWarehouse(targetWarehouse);

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
          let isLusin = targetWarehouse === 'A';

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
          setValidationError('Tidak ada baris SKU dan kuantitas stok yang berhasil dibaca dari file Excel ini.');
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
          setValidationError(resJson.message || 'Gagal membandingkan stok dengan Shopee.');
        }
      } catch (err: any) {
        console.error(err);
        setValidationError('Gagal memproses file Excel: ' + (err.message || 'Format tidak valid'));
      } finally {
        setIsParsing(false);
        setIsComparing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Trigger dialog alarm konfirmasi untuk SEMUA produk kritis dari Audit Modal (Anti Browser Confirm)
  function promptZeroOutAll() {
    if (!auditItems) return;
    const criticalItems = auditItems.filter(
      i => i.status === 'CRITICAL' && i.id && i.shopee_stock > 0 && i.is_safe_to_zero !== false
    );
    if (criticalItems.length === 0) {
      setToastNotice({ message: 'Tidak ada produk berstatus Kritis dengan stok Shopee > 0.', type: 'info' });
      return;
    }

    playAlarmChime();
    setConfirmModal({
      isOpen: true,
      type: 'ZERO_ALL',
      title: 'Alarm Peringatan: Kosongkan Stok Kritis Shopee',
      count: criticalItems.length,
      skusList: criticalItems.slice(0, 5).map(i => i.sku),
    });
  }

  // Trigger dialog alarm konfirmasi untuk SEMUA produk kritis dari Banner Peringatan Halaman Utama
  function promptZeroOutAllCriticalFromBanner() {
    const ids = summary?.critical_oos_ids ?? [];
    if (ids.length === 0) {
      setToastNotice({ message: 'Tidak ada SKU berstatus kritis untuk dikosongkan.', type: 'info' });
      return;
    }

    playAlarmChime();
    setConfirmModal({
      isOpen: true,
      type: 'ZERO_ALL',
      title: 'Peringatan Super Admin: Kosongkan Seluruh SKU Kritis Shopee',
      count: ids.length,
      message: `Sistem mendeteksi ${ids.length} SKU yang stok fisik gudangnya sudah 0 pcs. Atur stok di Shopee menjadi 0 sekarang agar pembeli tidak checkout?`,
    });
  }

  // Eksekusi pengosongan SEMUA SKU Kritis via Shopee API (bisa dari Modal atau dari Banner Utama)
  async function executeZeroOutAll() {
    let productIds: number[] = [];
    if (auditItems && auditItems.length > 0) {
      const criticalItems = auditItems.filter(
        i => i.status === 'CRITICAL' && i.id && i.shopee_stock > 0 && i.is_safe_to_zero !== false
      );
      productIds = criticalItems.map(i => i.id!);
    } else {
      productIds = summary?.critical_oos_ids ?? [];
    }

    if (productIds.length === 0) return;

    setIsZeroingOutAll(true);
    setZeroOutSuccessMessage(null);

    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '';
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
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setZeroOutSuccessMessage(resJson.message || `Berhasil mengosongkan stok ${resJson.updated_count} produk di Shopee!`);
        setToastNotice({ message: resJson.message || `Berhasil mengosongkan stok ${resJson.updated_count} SKU di Shopee!`, type: 'success' });

        // Update status audit item di modal jika sedang dibuka
        if (auditItems) {
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
        }

        if (auditSummary) {
          setAuditSummary({
            ...auditSummary,
            critical_count: 0,
            matched_count: auditSummary.matched_count + resJson.updated_count,
          });
        }

        router.reload({ only: ['products', 'summary'] });
      } else {
        setToastNotice({ message: resJson.message || 'Gagal mengosongkan stok di Shopee.', type: 'error' });
      }
    } catch (err: any) {
      setToastNotice({ message: 'Terjadi kesalahan: ' + err.message, type: 'error' });
    } finally {
      setIsZeroingOutAll(false);
    }
  }

  // Trigger dialog alarm konfirmasi untuk 1 produk (Anti Browser Confirm)
  function promptZeroOutSingle(item: {
    id: number;
    sku: string;
    item_name?: string;
    model_name?: string | null;
    reserved_stock?: number;
    is_campaign_locked?: boolean;
    is_campaign_unlocked?: boolean;
  }) {
    playAlarmChime();
    setConfirmModal({
      isOpen: true,
      type: 'ZERO_SINGLE',
      title: item.is_campaign_unlocked
        ? 'Peringatan: Kosongkan Stok Promo Terbuka'
        : (item.reserved_stock && item.reserved_stock > 0
          ? 'Peringatan: Mentokkan Stok ke Kuota Promo'
          : 'Peringatan: Kosongkan Stok Shopee'),
      sku: item.sku,
      productName: item.item_name,
      modelName: item.model_name || undefined,
      targetId: item.id,
      reservedStock: item.reserved_stock,
      isCampaignLocked: item.is_campaign_locked,
      isCampaignUnlocked: item.is_campaign_unlocked,
    });
  }

  // Eksekusi pengosongan 1 produk via Shopee API
  async function executeZeroOutSingle(id: number) {
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
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setZeroOutSuccessMessage(resJson.message || 'Berhasil mengosongkan stok di Shopee!');
        setToastNotice({ message: resJson.message || 'Berhasil mengosongkan stok di Shopee!', type: 'success' });

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
        setToastNotice({ message: resJson.message || 'Gagal mengosongkan stok di Shopee.', type: 'error' });
      }
    } catch (err: any) {
      setToastNotice({ message: 'Terjadi kesalahan: ' + err.message, type: 'error' });
    } finally {
      setZeroingOutId(null);
    }
  }

  // Salin semua SKU Kritis ke clipboard
  function handleCopyCriticalSkus() {
    if (!auditItems) return;
    const critical = auditItems.filter(i => i.status === 'CRITICAL');
    if (critical.length === 0) {
      setToastNotice({ message: 'Tidak ada SKU Kritis untuk disalin.', type: 'info' });
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
      'Status Audit': item.status === 'CRITICAL' ? 'KRITIS (OOS di Gudang)' :
                      item.status === 'LOW_STOCK' ? 'Stok Menipis' :
                      item.status === 'DISCREPANCY' ? 'Selisih Stok' :
                      item.status === 'UNMATCHED' ? 'Tidak di Shopee' : 'Sesuai',
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
            {master_stock_summary && (
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 flex-wrap">
                <span className="font-semibold text-slate-700">Master Stok Gudang:</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  Gudang G: {master_stock_summary.total_g_pcs.toLocaleString('id-ID')} Pcs ({master_stock_summary.total_g_items} SKU)
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  Gudang A: {master_stock_summary.total_a_pcs.toLocaleString('id-ID')} Pcs ({master_stock_summary.total_a_items} SKU)
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Tombol Isi / Tambah Stok Shopee Cepat */}
            <button
              type="button"
              onClick={() => openRestockModal(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap active:scale-98"
              title="Isi atau tambah stok produk Shopee langsung via API (misal ada stok baru datang)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>+ Isi / Tambah Stok</span>
            </button>

            {/* Tombol Audit Stok Gudang */}
            <button
              type="button"
              onClick={() => runMasterAudit('ALL')}
              disabled={isComparing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap active:scale-98 disabled:opacity-50"
              title="Audit otomatis seluruh SKU Shopee terhadap data Master Stok (Gudang G & A)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-slate-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>Audit Stok Gudang</span>
            </button>

            {/* Export CSV / Excel */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
              title="Download seluruh data SKU & Stok ke file CSV / Excel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>Export CSV</span>
            </button>

            {/* Tarik Stok Shopee (API) */}
            <button
              type="button"
              onClick={promptSync}
              disabled={isSyncing}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap active:scale-98 ${
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

        {/* 4 Metric Summary Cards - High-End Anti AI-Slop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total SKU */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total SKU Variasi</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {(summary?.total_skus ?? 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Item SKU terdaftar di Shopee</span>
              </p>
            </div>
          </div>

          {/* Card 2: Total Stok Fisik */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Stok Fisik</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {(summary?.total_stock ?? 0).toLocaleString('id-ID')} <span className="text-xs font-medium text-slate-500 font-sans">pcs</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Total kuantitas stok tersedia</span>
              </p>
            </div>
          </div>

          {/* Card 3: SKU Ada Stok */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">SKU Ada Stok</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-emerald-600 tracking-tight font-mono">
                {(summary?.in_stock_skus ?? 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Siap dijual di toko Shopee</span>
              </p>
            </div>
          </div>

          {/* Card 4: SKU Habis (0) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">SKU Stok Habis (0)</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50 text-rose-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-rose-600 tracking-tight font-mono">
                {(summary?.out_of_stock_skus ?? 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span>Produk dengan stok fisik 0</span>
              </p>
            </div>
          </div>
        </div>

        {/* Banner Peringatan Otomatis OOS Kritis & Kuota Promo Terbuka (Anti AI-Slop) */}
        {(Boolean(summary?.critical_oos_count && summary.critical_oos_count > 0) || Boolean(summary?.campaign_unlocked_count && summary.campaign_unlocked_count > 0)) && (
          <div className="bg-slate-950 border border-rose-900/60 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-center shrink-0 text-rose-400 relative">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold tracking-tight text-white">
                    Peringatan: {summary.critical_oos_count ?? 0} SKU Habis di Gudang tetapi Masih Dijual di Shopee!
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-900/60 text-rose-300 border border-rose-700/60">
                    Persetujuan Super Admin
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Stok fisik di Master Stok Gudang tercatat <strong>0 pcs</strong>. Kosongkan stok di Shopee sekarang agar pembeli tidak dapat memesan barang kosong dan menghindari penalti toko.
                  {Boolean(summary.campaign_unlocked_count && summary.campaign_unlocked_count > 0) && (
                    <span className="block mt-1 text-amber-300 font-semibold">
                      🔓 Termasuk {summary.campaign_unlocked_count} SKU promo yang kuotanya telah terbuka kembali dan wajib segera dinolkan!
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 flex-wrap">
              {stockStatus !== 'oos_critical' && (
                <button
                  type="button"
                  onClick={() => {
                    setStockStatus('oos_critical');
                    handleFilter(search, 'oos_critical', sort);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  Lihat SKU Kritis
                </button>
              )}

              <button
                type="button"
                onClick={promptZeroOutAllCriticalFromBanner}
                disabled={isZeroingOutAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span>Kosongkan Semua di Shopee</span>
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Bar - High-End Minimalist */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
            <div className="relative w-full">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, Nama Produk, ID Item..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
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

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            {/* Filter Status Stok */}
            <select
              value={stockStatus}
              onChange={(e) => {
                const val = e.target.value;
                setStockStatus(val);
                handleFilter(search, val, sort);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 text-xs focus:outline-none focus:border-slate-800 focus:bg-white transition-all cursor-pointer font-medium"
            >
              <option value="all">Semua Status Stok</option>
              <option value="in_stock">Ada Stok (&gt; 0)</option>
              <option value="out_of_stock">Stok Habis (0)</option>
              {Boolean(summary?.critical_oos_count && summary.critical_oos_count > 0) && (
                <option value="oos_critical">⚠️ Kritis: Habis di Gudang ({summary.critical_oos_count})</option>
              )}
              {Boolean(summary?.campaign_unlocked_count && summary.campaign_unlocked_count > 0) && (
                <option value="campaign_unlocked">🔓 Promo Terbuka ({summary.campaign_unlocked_count})</option>
              )}
              {Boolean(summary?.campaign_locked_count && summary.campaign_locked_count > 0) && (
                <option value="campaign_locked">🔒 Terkunci Promo ({summary.campaign_locked_count})</option>
              )}
              {Boolean(summary?.gudang_ready_count && summary.gudang_ready_count > 0) && (
                <option value="gudang_ready">📦 Siap Jual: Gudang Ada tapi Shopee 0 ({summary.gudang_ready_count})</option>
              )}
            </select>

            {/* Sort Selector */}
            <select
              value={sort}
              onChange={(e) => {
                const val = e.target.value;
                setSort(val);
                handleFilter(search, stockStatus, val);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B] cursor-pointer font-medium"
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
                    <th className="py-3 px-4 text-right">Stok Gudang (ERP)</th>
                    <th className="py-3 px-4 text-right">Stok Shopee</th>
                    <th className="py-3 px-4 text-center">Status Audit</th>
                    <th className="py-3 px-4 text-right">Harga</th>
                    <th className="py-3 px-4 text-center">Aksi Shopee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {products.data.map((p, idx) => {
                    const rowNumber = (products.current_page - 1) * products.per_page + idx + 1;
                    const hasStock = (p.stock ?? 0) > 0;
                    const isCritical = Boolean(p.is_critical_oos);
                    const isPromoUnlocked = Boolean(p.is_campaign_unlocked);
                    const isPromoLocked = Boolean(p.is_campaign_locked);

                    const rowClass = isCritical
                      ? 'bg-rose-50/70 hover:bg-rose-100/60 border-l-4 border-l-rose-500 transition-colors'
                      : isPromoUnlocked
                      ? 'bg-amber-50/70 hover:bg-amber-100/60 border-l-4 border-l-amber-500 transition-colors'
                      : 'hover:bg-slate-50/80 transition-colors';

                    return (
                      <tr key={p.id} className={rowClass}>
                        <td className="py-3.5 px-3 text-center text-xs font-bold text-slate-500 whitespace-nowrap">
                          {rowNumber}
                        </td>

                        {/* SKU */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {p.sku ? (
                            <div>
                              <span className="font-mono font-bold text-slate-900 select-all tracking-tight">
                                {p.sku}
                              </span>
                              {p.matched_code && (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  Gudang: {p.matched_code}
                                </div>
                              )}
                            </div>
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

                        {/* Stok Gudang (ERP: G + A) */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {p.warehouse_stock !== undefined ? (
                            p.warehouse_stock <= 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono font-bold text-xs bg-rose-100 text-rose-800 border border-rose-300">
                                  0 pcs
                                </span>
                                <span className="text-[10px] text-rose-600 font-medium mt-0.5">
                                  G: {(p.stock_g ?? 0).toLocaleString('id-ID')} | A: {(p.stock_a ?? 0).toLocaleString('id-ID')}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200">
                                  {p.warehouse_stock.toLocaleString('id-ID')} pcs
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                                  G: {(p.stock_g ?? 0).toLocaleString('id-ID')} | A: {(p.stock_a ?? 0).toLocaleString('id-ID')}
                                </span>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Stok Shopee (Tersedia & Terkunci) */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                                hasStock
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}
                            >
                              {(p.stock ?? 0).toLocaleString('id-ID')}
                            </span>
                            {(p.reserved_stock ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-mono mt-0.5" title="Stok terkunci promo/campaign Shopee">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-400">
                                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                </svg>
                                <span>{p.reserved_stock.toLocaleString('id-ID')} promo</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status Audit */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isPromoUnlocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-amber-700">
                                <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5a3 3 0 116 0v.5a.75.75 0 001.5 0V5.5A4.5 4.5 0 0014.5 1z" clipRule="evenodd" />
                              </svg>
                              Promo Terbuka
                            </span>
                          ) : isCritical ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-900 border border-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                              KRITIS (Gudang 0)
                            </span>
                          ) : isPromoLocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-500">
                                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                              </svg>
                              Terkunci Promo
                            </span>
                          ) : p.match_type === 'SIZE_MISMATCH' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200" title={p.warning_message || undefined}>
                              Cek Ukuran
                            </span>
                          ) : p.match_type === 'CODE_NOT_FOUND' || p.match_type === 'NO_CODE' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Belum Terhubung
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-medium">Sesuai</span>
                          )}
                        </td>

                        {/* Harga */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          Rp {Math.round(Number(p.price) || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Aksi Shopee */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isCritical || isPromoUnlocked ? (
                            <button
                              type="button"
                              onClick={() => promptZeroOutSingle({
                                id: p.id,
                                sku: p.sku || p.item_name,
                                item_name: p.item_name,
                                model_name: p.model_name,
                                reserved_stock: p.reserved_stock,
                                is_campaign_locked: isPromoLocked,
                                is_campaign_unlocked: isPromoUnlocked,
                              })}
                              disabled={zeroingOutId === p.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 active:scale-95"
                              title="Setujui pengosongan stok produk ini di Shopee sekarang"
                            >
                              {zeroingOutId === p.id ? (
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              )}
                              <span>Set 0 di Shopee</span>
                            </button>
                          ) : hasStock ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openRestockModal(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold transition-colors cursor-pointer active:scale-95"
                                title="Tambah / ubah stok variasi ini atau seluruh ukuran model ini"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3 h-3 text-emerald-600">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                <span>+ Isi</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => promptZeroOutSingle({
                                  id: p.id,
                                  sku: p.sku || p.item_name,
                                  item_name: p.item_name,
                                  model_name: p.model_name,
                                  reserved_stock: p.reserved_stock,
                                })}
                                disabled={zeroingOutId === p.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                                title="Kosongkan stok produk ini di Shopee via API"
                              >
                                {zeroingOutId === p.id ? (
                                  <span className="w-3 h-3 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></span>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-slate-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                )}
                                <span>0</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              {(p.warehouse_stock ?? 0) > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title={`Stok fisik di gudang: ${p.warehouse_stock} pcs`}>
                                  Gdg: {p.warehouse_stock}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => openRestockModal(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer active:scale-95"
                                title="Isi atau tambah stok untuk variasi ini atau semua ukuran model ini"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3 h-3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                <span>+ Isi Stok</span>
                              </button>
                            </div>
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
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                        <span>Gudang A (Grosir Lusinan • Otomatis x12 Pcs)</span>
                      </span>
                    )}
                    {detectedWarehouse === 'G' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                        <span>Gudang G (Eceran Satuan • Pcs)</span>
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
              {/* Switcher Sumber Audit: Master Stok ERP vs Upload Excel Manual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-100/90 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 ml-1">Sumber Audit:</span>
                  <div className="inline-flex items-center p-1 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        setAuditSource('MASTER');
                        runMasterAudit(masterWarehouseFilter);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        auditSource === 'MASTER'
                          ? 'bg-[#0B132B] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span>Master Stok ERP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuditSource('EXCEL');
                        setAuditItems(null);
                        setAuditSummary(null);
                        setValidationError(null);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        auditSource === 'EXCEL'
                          ? 'bg-[#0B132B] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span>Upload Excel Manual</span>
                    </button>
                  </div>
                </div>

                {auditSource === 'MASTER' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-600">Pilih Gudang:</span>
                    <div className="inline-flex items-center p-1 bg-white rounded-xl border border-slate-200 shadow-2xs text-xs">
                      <button
                        type="button"
                        onClick={() => runMasterAudit('ALL')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          masterWarehouseFilter === 'ALL'
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Semua (G + A)
                      </button>
                      <button
                        type="button"
                        onClick={() => runMasterAudit('G')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          masterWarehouseFilter === 'G'
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Gudang G
                      </button>
                      <button
                        type="button"
                        onClick={() => runMasterAudit('A')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          masterWarehouseFilter === 'A'
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Gudang A
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => runMasterAudit(masterWarehouseFilter)}
                      disabled={isComparing}
                      className="p-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                      title="Refresh Audit Master Stok"
                    >
                      <svg
                        className={`w-4 h-4 ${isComparing ? 'animate-spin text-amber-600' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-700 ml-1">Pilih Gudang Target:</span>
                    <div className="inline-flex items-center p-1 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetWarehouse('G');
                          setValidationError(null);
                          setAuditItems(null);
                          setImportFileName(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          targetWarehouse === 'G'
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span>Gudang G</span>
                        <span className="text-[10px] font-normal opacity-90">(Eceran / Pcs)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTargetWarehouse('A');
                          setValidationError(null);
                          setAuditItems(null);
                          setImportFileName(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          targetWarehouse === 'A'
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span>Gudang A</span>
                        <span className="text-[10px] font-normal opacity-90">(Grosir / Lusin x12)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Alert Penolakan Jika File Tertukar */}
              {validationError && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-rose-600 text-white rounded-xl shrink-0 mt-0.5 sm:mt-0">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-rose-900">{validationError}</p>
                      <p className="text-[11px] text-rose-700 mt-0.5">
                        Sistem membatasi agar laporan tidak tertukar karena Gudang G dihitung dalam <strong>Pcs satuan per ukuran</strong> sedangkan Gudang A dihitung dalam <strong>Lusinan (x12)</strong>.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const opposite = targetWarehouse === 'G' ? 'A' : 'G';
                      setTargetWarehouse(opposite);
                      setValidationError(null);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 text-xs font-bold whitespace-nowrap shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    Beralih ke Gudang {targetWarehouse === 'G' ? 'A (Lusin)' : 'G (Pcs)'} ➜
                  </button>
                </div>
              )}

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

              {/* Upload Zone / Master Audit Trigger jika belum ada data */}
              {!auditItems || auditItems.length === 0 ? (
                auditSource === 'MASTER' ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center bg-slate-50/50 space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
                      {isComparing ? (
                        <svg className="animate-spin h-7 w-7 text-slate-700" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7 text-slate-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        {isComparing
                          ? 'Sedang Membandingkan Seluruh SKU Shopee dengan Master Stok...'
                          : 'Siap Mengaudit Stok Shopee terhadap Master Stok ERP'}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        Sistem akan mencocokkan kode barang fisik dari Master Stok (Gudang G & A) dengan SKU Shopee dan mendeteksi stok kosong yang masih aktif di marketplace.
                      </p>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => runMasterAudit(masterWarehouseFilter)}
                        disabled={isComparing}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isComparing ? 'Memproses Audit...' : 'Jalankan Audit Sekarang'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
                      targetWarehouse === 'G'
                        ? 'border-blue-300 hover:border-blue-500 bg-blue-50/30'
                        : 'border-teal-300 hover:border-teal-500 bg-teal-50/30'
                    }`}
                  >
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
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto transition-transform hover:scale-105 ${
                          targetWarehouse === 'G'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}
                      >
                        {isParsing || isComparing ? (
                          <svg
                            className={`animate-spin h-7 w-7 ${
                              targetWarehouse === 'G' ? 'text-blue-600' : 'text-teal-600'
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                          >
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
                          {isParsing || isComparing
                            ? 'Memproses dan Memvalidasi Stok...'
                            : targetWarehouse === 'G'
                            ? 'Klik untuk Pilih File STOCK GUDANG G (.xls / .xlsx)'
                            : 'Klik untuk Pilih File STOCK GUDANG A (.xls / .xlsx)'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          {targetWarehouse === 'G' ? (
                            <>
                              Khusus format <strong>GUDANG G</strong> (Eceran / Pcs per ukuran). File Gudang A otomatis ditolak.
                            </>
                          ) : (
                            <>
                              Khusus format <strong>GUDANG A</strong> (Grosir / Lusinan otomatis dikalikan 12 ke Pcs). File Gudang G otomatis ditolak.
                            </>
                          )}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors ${
                          targetWarehouse === 'G'
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-teal-600 hover:bg-teal-700'
                        }`}
                      >
                        Pilih Spreadsheet {targetWarehouse === 'G' ? 'Gudang G' : 'Gudang A'}
                      </span>
                    </label>
                  </div>
                )
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
                        <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Kritis (OOS)
                        </span>
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
                          ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Menipis
                      </span>
                      <p className="text-2xl font-extrabold text-amber-800 mt-1 font-mono">
                        {auditSummary?.low_stock_count ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Stok fisik 1 s/d 3 pcs</p>
                    </div>

                    {/* 3. Selisih */}
                    <div
                      onClick={() => setAuditFilter('DISCREPANCY')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'DISCREPANCY'
                          ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                        Selisih Stok
                      </span>
                      <p className="text-2xl font-extrabold text-sky-800 mt-1 font-mono">
                        {auditSummary?.discrepancy_count ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Gudang ≠ Shopee</p>
                    </div>

                    {/* 4. Sesuai */}
                    <div
                      onClick={() => setAuditFilter('MATCHED')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'MATCHED'
                          ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Sesuai
                      </span>
                      <p className="text-2xl font-extrabold text-emerald-800 mt-1 font-mono">
                        {auditSummary?.matched_count ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium">Gudang = Shopee</p>
                    </div>

                    {/* 5. Tidak di Shopee */}
                    <div
                      onClick={() => setAuditFilter('UNMATCHED')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        auditFilter === 'UNMATCHED'
                          ? 'bg-slate-100 border-slate-300 ring-2 ring-slate-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        Non-Shopee
                      </span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">
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
                          onClick={promptZeroOutAll}
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
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                        }`}
                      >
                        Kritis ({auditSummary?.critical_count ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('LOW_STOCK')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'LOW_STOCK'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                        }`}
                      >
                        Menipis ({auditSummary?.low_stock_count ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('DISCREPANCY')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'DISCREPANCY'
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'bg-sky-50 hover:bg-sky-100 text-sky-800'
                        }`}
                      >
                        Selisih ({auditSummary?.discrepancy_count ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('MATCHED')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                          auditFilter === 'MATCHED'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        Sesuai ({auditSummary?.matched_count ?? 0})
                      </button>
                      {(auditSummary?.unmatched_count ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setAuditFilter('UNMATCHED')}
                          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            auditFilter === 'UNMATCHED'
                              ? 'bg-slate-800 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <span>Cek Typo SKU ({auditSummary?.unmatched_count ?? 0})</span>
                        </button>
                      )}
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
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="font-mono font-bold text-slate-900 select-all">
                                    {item.sku}
                                  </div>

                                  {/* Smart Fallback & Typo Indicators */}
                                  {item.match_type === 'SMART_MATCH' && item.suggested_code && (
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-medium" title={item.suggested_name || ''}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-sky-600 shrink-0">
                                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                        </svg>
                                        Cocok: <strong className="font-mono">{item.suggested_code}</strong>
                                      </span>
                                      {item.id && (
                                        <button
                                          type="button"
                                          onClick={() => handleSaveMapping(item.id!, item.suggested_code!)}
                                          disabled={isSavingMapping}
                                          className="text-[10px] text-sky-700 hover:text-sky-900 underline font-semibold cursor-pointer"
                                        >
                                          Kunci Relasi
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {item.match_type === 'MANUAL_MAPPED' && (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-emerald-600 shrink-0">
                                          <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                          <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                        </svg>
                                        Terhubung: <strong className="font-mono">{item.manual_item_code}</strong>
                                      </span>
                                    </div>
                                  )}

                                  {(item.match_type === 'CODE_NOT_FOUND' || item.match_type === 'SIZE_MISMATCH' || item.status === 'UNMATCHED') && (
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium" title={item.warning_message || ''}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-amber-600 shrink-0">
                                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                        </svg>
                                        {item.match_type === 'SIZE_MISMATCH' ? 'Salah Ukuran' : 'Kode Tidak Ada'}
                                      </span>
                                      {item.id && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setMappingModalItem(item);
                                            handleSearchMaster(item.sku.replace(/_\d+$/, '').split(/[-_ ]+/).find(p => p.length >= 3 && !['RECORD','SPT'].includes(p.toUpperCase())) || '');
                                          }}
                                          className="text-[10px] text-amber-800 hover:text-amber-950 underline font-semibold cursor-pointer"
                                        >
                                          Hubungkan Manual
                                        </button>
                                      )}
                                    </div>
                                  )}
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
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                      KRITIS (OOS)
                                    </span>
                                  )}
                                  {isLow && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                      Menipis ({item.warehouse_stock})
                                    </span>
                                  )}
                                  {isDiscrepancy && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                                      Selisih Stok
                                    </span>
                                  )}
                                  {isMatched && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      Sesuai
                                    </span>
                                  )}
                                  {item.status === 'UNMATCHED' && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                      Butuh Cek SKU
                                    </span>
                                  )}
                                </td>

                                {/* Aksi Shopee */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {item.status === 'UNMATCHED' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="Stok Shopee tidak akan dikosongkan karena kode SKU ini salah atau tidak terdaftar di gudang">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-amber-600">
                                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                      </svg>
                                      Diproteksi
                                    </span>
                                  ) : item.id && item.shopee_stock > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => promptZeroOutSingle({ id: item.id!, sku: item.sku, item_name: item.item_name, model_name: item.model_name })}
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

      {/* Modal Hubungkan Manual SKU ke Master Stok */}
      {mappingModalItem && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hubungkan Manual SKU ke Stok Gudang</h3>
                  <p className="text-[11px] text-slate-500 font-mono font-semibold">{mappingModalItem.sku}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMappingModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <p className="text-slate-600">
                  Produk Shopee: <strong className="text-slate-900">{mappingModalItem.item_name}</strong>
                  {mappingModalItem.model_name && ` (${mappingModalItem.model_name})`}
                </p>
                {mappingModalItem.warning_message && (
                  <p className="text-amber-800 mt-1 font-semibold text-[11px]">
                    ⚠️ {mappingModalItem.warning_message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Cari Barang di Gudang (Ketik Nama / Kode 8 Digit):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={mappingSearchQuery}
                    onChange={(e) => handleSearchMaster(e.target.value)}
                    placeholder="Contoh: KYLIE, FOGO, BLANCO, 01224738..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:border-slate-800 focus:bg-white focus:outline-none transition-all"
                    autoFocus
                  />
                  {isSearchingMaster && (
                    <span className="absolute right-3 top-2.5 w-3.5 h-3.5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin"></span>
                  )}
                </div>
              </div>

              {/* Hasil Pencarian */}
              <div className="max-h-52 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-1.5 bg-slate-50/50">
                {mappingSearchResults.length === 0 ? (
                  <p className="p-5 text-center text-xs text-slate-400">
                    {mappingSearchQuery.trim()
                      ? 'Tidak ada barang yang cocok di Master Stok.'
                      : 'Ketik nama artikel atau kode barang untuk mencari.'}
                  </p>
                ) : (
                  mappingSearchResults.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate" title={m.item_name}>
                          {m.item_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono">
                          <span>Kode: <strong className="text-slate-800">{m.item_code}</strong></span>
                          <span>•</span>
                          <span>Gudang {m.warehouse}</span>
                          <span>•</span>
                          <span className="text-emerald-700 font-bold">Stok: {m.total_pcs} Pcs</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveMapping(mappingModalItem.id!, m.item_code)}
                        disabled={isSavingMapping}
                        className="px-3 py-1.5 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {isSavingMapping ? 'Menghubungkan...' : 'Hubungkan'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Relasi ini disimpan permanen di ERP tanpa mengubah SKU Shopee.
              </span>
              <button
                type="button"
                onClick={() => setMappingModalItem(null)}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dialog Alarm & Konfirmasi Aksi Kritis (Anti AI-Slop, Anti Browser Alert) */}
      {confirmModal.isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10001] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 pb-4 border-b border-slate-100 flex items-start gap-3.5 bg-slate-50/70">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0 relative">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                    Peringatan Tindakan
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 cursor-pointer transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-1">
                  {confirmModal.title}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3.5 text-xs">
              {confirmModal.type === 'ZERO_SINGLE' && (
                <>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target SKU</span>
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">Stok Gudang: 0</span>
                    </div>
                    <p className="font-mono font-bold text-slate-900 text-xs bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 select-all break-all">
                      {confirmModal.sku}
                    </p>
                    {confirmModal.productName && (
                      <p className="text-slate-700 font-semibold line-clamp-1">
                        {confirmModal.productName}
                      </p>
                    )}
                    {confirmModal.modelName && (
                      <p className="text-[11px] text-slate-500 font-mono">
                        Variasi: {confirmModal.modelName}
                      </p>
                    )}
                  </div>

                  {confirmModal.reservedStock && confirmModal.reservedStock > 0 ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                      <p className="font-bold text-xs flex items-center gap-1.5 text-amber-800">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-600 shrink-0">
                          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                        </svg>
                        Proteksi Kuota Promo / Flash Sale:
                      </p>
                      <p className="text-[11px] leading-relaxed text-amber-800">
                        Produk ini memiliki stok promosi terkunci sebanyak <strong>{confirmModal.reservedStock} pcs</strong>. Sistem akan menolkan stok reguler yang bisa dibeli bebas (stok Shopee mentok di {confirmModal.reservedStock} pcs promo) sehingga pembeli reguler tidak dapat membeli barang yang kosong di gudang.
                      </p>
                    </div>
                  ) : confirmModal.isCampaignUnlocked ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                      <p className="font-bold text-xs flex items-center gap-1.5 text-amber-800">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-600 shrink-0">
                          <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5a3 3 0 116 0v.5a.75.75 0 001.5 0V5.5A4.5 4.5 0 0014.5 1z" clipRule="evenodd" />
                        </svg>
                        Peringatan: Kuota Promosi Terbuka Kembali!
                      </p>
                      <p className="text-[11px] leading-relaxed text-amber-800">
                        Masa promosi Shopee telah selesai dan kuota promo yang tersisa telah terbuka kembali menjadi stok normal. Karena stok fisik di gudang masih 0 pcs, segera setujui agar stok Shopee kembali 0 pcs dan mencegah pembeli checkout barang kosong.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                      <p className="font-semibold text-[11px] flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-rose-600 shrink-0">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        Dampak Persetujuan Ini:
                      </p>
                      <p className="text-[11px] leading-relaxed text-rose-700">
                        Stok variasi ini di Shopee akan langsung diubah menjadi <strong>0 (Habis)</strong> via Shopee Open API agar pembeli tidak dapat memesan barang kosong di gudang.
                      </p>
                    </div>
                  )}
                </>
              )}

              {confirmModal.type === 'ZERO_ALL' && (
                <>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Pengosongan</span>
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">
                        {confirmModal.count} SKU KRITIS
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">
                      Sistem akan mengosongkan seluruh SKU berikut di Shopee:
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px]">
                      {confirmModal.skusList?.map((s, idx) => (
                        <div key={idx} className="bg-white px-2 py-1 rounded border border-slate-200 text-slate-800 truncate">
                          {s}
                        </div>
                      ))}
                      {(confirmModal.count ?? 0) > (confirmModal.skusList?.length ?? 0) && (
                        <p className="text-[10px] text-slate-400 italic pt-0.5">
                          + {(confirmModal.count ?? 0) - (confirmModal.skusList?.length ?? 0)} SKU kritis lainnya...
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                    <p className="font-semibold text-[11px] flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-rose-600 shrink-0">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                      </svg>
                      Perlindungan Toko:
                    </p>
                    <p className="text-[11px] leading-relaxed text-rose-700">
                      Seluruh produk di atas sudah 0 Pcs di stok fisik gudang. Pengosongan ini mencegah keterlambatan pengiriman dan penalti poin di Shopee.
                    </p>
                  </div>
                </>
              )}

              {confirmModal.type === 'SYNC_CATALOG' && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-slate-600">
                  <p className="text-slate-800 font-semibold text-xs">
                    {confirmModal.message}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Proses ini akan memperbarui daftar produk, harga, variasi SKU, dan stok terkini langsung dari server Shopee.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                disabled={isZeroingOutAll || zeroingOutId !== null || isSyncing}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              {confirmModal.type === 'ZERO_SINGLE' && (
                <button
                  type="button"
                  onClick={() => executeZeroOutSingle(confirmModal.targetId!)}
                  disabled={zeroingOutId !== null}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                >
                  {zeroingOutId !== null ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Mengosongkan di Shopee...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>Ya, Kosongkan Stok Shopee</span>
                    </>
                  )}
                </button>
              )}

              {confirmModal.type === 'ZERO_ALL' && (
                <button
                  type="button"
                  onClick={executeZeroOutAll}
                  disabled={isZeroingOutAll}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                >
                  {isZeroingOutAll ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Mengosongkan Semua ({confirmModal.count})...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>Kosongkan Semua ({confirmModal.count} SKU)</span>
                    </>
                  )}
                </button>
              )}

              {confirmModal.type === 'SYNC_CATALOG' && (
                <button
                  type="button"
                  onClick={executeSync}
                  disabled={isSyncing}
                  className="px-4 py-2.5 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                >
                  {isSyncing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Menyinkronkan...</span>
                    </>
                  ) : (
                    <span>Ya, Tarik Sekarang</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DIALOG: Quick Restock Multi-Ukuran Shopee (Anti AI-Slop) */}
      {restockModal.isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => {
            if (!restockModal.isSubmitting) {
              setRestockModal(prev => ({ ...prev, isOpen: false }));
            }
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Isi / Tambah Stok Shopee (Multi-Ukuran)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Shopee Open API
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {restockModal.productTitle
                      ? `Atur stok untuk artikel: ${restockModal.productTitle}`
                      : 'Cari nama artikel produk Shopee untuk mengisi atau menambah stok seluruh variasinya sekaligus.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRestockModal(prev => ({ ...prev, isOpen: false }))}
                disabled={restockModal.isSubmitting}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 grow">
              {/* Search Bar Produk jika ingin cari artikel lain */}
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={restockModal.searchQuery}
                    onChange={(e) => setRestockModal(prev => ({ ...prev, searchQuery: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchRestockVariants(restockModal.searchQuery);
                      }
                    }}
                    placeholder="Ketik nama artikel atau SKU (contoh: THEON HITAM PUTIH, RECORD KYLIE)..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => handleSearchRestockVariants(restockModal.searchQuery)}
                  disabled={restockModal.isLoading || !restockModal.searchQuery.trim()}
                  className="px-4 py-2 bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
                >
                  {restockModal.isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Mencari...</span>
                    </>
                  ) : (
                    <span>Cari Variasi</span>
                  )}
                </button>
              </div>

              {/* Fast Batch Action Box (Alat Isi Cepat untuk kasus 30-33 masing-masing 10 pcs) */}
              {restockModal.variants.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        ⚡ Aksi Cepat Multi-Ukuran:
                      </span>
                      <div className="inline-flex items-center p-0.5 bg-white rounded-lg border border-slate-200 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setRestockModal(prev => ({
                              ...prev,
                              batchMode: 'set',
                              variants: prev.variants.map(v => ({
                                ...v,
                                input_qty: v.current_stock,
                                new_stock: v.current_stock,
                              })),
                            }));
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                            restockModal.batchMode === 'set'
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Set Stok Jadi
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRestockModal(prev => ({
                              ...prev,
                              batchMode: 'add',
                              variants: prev.variants.map(v => ({
                                ...v,
                                input_qty: 0,
                                new_stock: v.current_stock,
                              })),
                            }));
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                            restockModal.batchMode === 'add'
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          + Tambah Stok
                        </button>
                      </div>
                    </div>

                    {/* Presets Button */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-semibold mr-1">Preset:</span>
                      {[5, 10, 12, 20, 24, 50].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => applyBatchRestockQty(num)}
                          className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700 rounded-md transition-colors cursor-pointer"
                        >
                          {restockModal.batchMode === 'add' ? `+${num}` : num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-600 font-medium">
                        {restockModal.batchMode === 'add' ? 'Mau Tambah (+):' : 'Set Stok Jadi:'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="100000"
                        value={restockModal.batchQty}
                        onChange={(e) => setRestockModal(prev => ({ ...prev, batchQty: Number(e.target.value) || 0 }))}
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-900 text-center focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-slate-500">pcs</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => applyBatchRestockQty()}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 active:scale-98"
                    >
                      <span>Terapkan Ke Tercentang</span>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </button>

                    <div className="ml-auto flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleAllRestockSelect(true)}
                        className="text-slate-600 hover:text-emerald-700 font-semibold cursor-pointer underline"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => toggleAllRestockSelect(false)}
                        className="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer underline"
                      >
                        Batal Pilih
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Table List Variasi Produk */}
              {restockModal.isLoading ? (
                <div className="p-12 text-center text-slate-400 space-y-3">
                  <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-medium">Memuat daftar variasi produk dari Shopee & Gudang...</p>
                </div>
              ) : restockModal.variants.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto text-slate-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  <p className="text-xs font-medium text-slate-600">Belum ada variasi yang ditampilkan.</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Ketik nama produk atau SKU pada pencarian di atas atau klik tombol <strong>+ Isi Stok</strong> pada baris produk di tabel utama.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto max-h-[46vh]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-10">
                            <input
                              type="checkbox"
                              checked={restockModal.variants.length > 0 && restockModal.variants.every(v => v.isSelected)}
                              onChange={(e) => toggleAllRestockSelect(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </th>
                          <th className="py-2.5 px-3">Variasi / Model</th>
                          <th className="py-2.5 px-3">SKU Shopee</th>
                          <th className="py-2.5 px-3 text-center">Stok Gudang</th>
                          <th className="py-2.5 px-3 text-right">Stok Shopee</th>
                          <th className="py-2.5 px-3 text-center w-40">
                            {restockModal.batchMode === 'add' ? 'Mau Isi (+)' : 'Set Stok Jadi'}
                          </th>
                          <th className="py-2.5 px-3 text-center w-36 font-bold text-slate-800">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {restockModal.variants.map((v) => {
                          const diff = v.new_stock - v.current_stock;
                          return (
                            <tr
                              key={v.id}
                              className={`transition-colors hover:bg-slate-50 ${v.isSelected ? 'bg-emerald-50/20' : 'opacity-70'}`}
                            >
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={v.isSelected}
                                  onChange={() => toggleRestockItemSelect(v.id)}
                                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="font-bold text-slate-900">{v.model_name}</p>
                                <p className="text-[10px] text-slate-500 truncate max-w-xs">{v.item_name}</p>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 select-all">
                                {v.sku || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                                    v.warehouse_stock > 0
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                  title={`Gudang G: ${v.stock_g} Pcs | Gudang A: ${v.stock_a} Pcs`}
                                >
                                  {v.warehouse_stock} Pcs
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                                <span className={v.current_stock > 0 ? 'text-slate-800' : 'text-rose-600'}>
                                  {v.current_stock}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => updateVariantInputQty(v.id, Math.max(0, (v.input_qty ?? (restockModal.batchMode === 'add' ? 0 : v.new_stock)) - 1))}
                                    className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-l-lg transition-colors cursor-pointer font-bold"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100000"
                                    value={v.input_qty ?? (restockModal.batchMode === 'add' ? 0 : v.new_stock)}
                                    onChange={(e) => updateVariantInputQty(v.id, Number(e.target.value) || 0)}
                                    className="w-16 py-1 text-center font-mono font-bold text-xs text-slate-900 border-x border-slate-200 focus:outline-none focus:bg-emerald-50/40"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateVariantInputQty(v.id, (v.input_qty ?? (restockModal.batchMode === 'add' ? 0 : v.new_stock)) + 1)}
                                    className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-r-lg transition-colors cursor-pointer font-bold"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <div className="flex flex-col items-center justify-center">
                                  <span
                                    className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-md border ${
                                      v.new_stock > v.current_stock
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : v.new_stock < v.current_stock
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-slate-100 text-slate-800 border-slate-200'
                                    }`}
                                  >
                                    {v.new_stock} <span className="text-[10px] font-normal">pcs</span>
                                  </span>
                                  {restockModal.batchMode === 'add' && (v.input_qty ?? 0) > 0 && (
                                    <span className="text-[10px] text-emerald-600 font-mono font-semibold mt-0.5">
                                      ({v.current_stock} + {v.input_qty} = {v.new_stock})
                                    </span>
                                  )}
                                  {restockModal.batchMode === 'set' && diff !== 0 && (
                                    <span className={`text-[10px] font-mono font-semibold mt-0.5 ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      ({diff > 0 ? `+${diff}` : diff} pcs)
                                    </span>
                                  )}
                                </div>
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

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-600">
                {restockModal.variants.length > 0 && (
                  <span>
                    <strong className="text-emerald-700 font-bold font-mono">
                      {restockModal.variants.filter(v => v.isSelected).length}
                    </strong>{' '}
                    variasi dipilih dari {restockModal.variants.length} total ukuran
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRestockModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={restockModal.isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={submitRestockToShopee}
                  disabled={restockModal.isSubmitting || restockModal.variants.filter(v => v.isSelected).length === 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                >
                  {restockModal.isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Menyimpan ke Shopee...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                      <span>Simpan & Kirim ke Shopee</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Notification Toast (Anti Browser Alert) */}
      {toastNotice && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 right-6 z-[10002] max-w-sm bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700/80 flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toastNotice.type === 'error' ? 'bg-rose-500/20 text-rose-400' : (toastNotice.type === 'info' ? 'bg-sky-500/20 text-sky-400' : 'bg-emerald-500/20 text-emerald-400')}`}>
            {toastNotice.type === 'error' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : toastNotice.type === 'info' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200 leading-snug">{toastNotice.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer p-0.5"
          >
            ✕
          </button>
        </div>,
        document.body
      )}
    </AppLayout>
  );
}
