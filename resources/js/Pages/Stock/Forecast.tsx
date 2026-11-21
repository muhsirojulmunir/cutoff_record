import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Head, router, usePage } from '@inertiajs/react';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface ForecastRow {
  item_code: string;
  item_name: string | null;
  stock_g: number;
  stock_a: number;
  total_stock: number;
  sales_m3: number;
  sales_m2: number;
  sales_m1: number;
  total_3m_sales: number;
  monthly_velocity: number;
  current_stock: number;
  stock_coverage_months: number | null;
  reorder_point: number;
  time_to_po_months: number | null;
  target_stock: number;
  recommended_po_qty: number;
  urgency_status: 'harus_po' | 'siap_po' | 'aman' | 'tenang';
  active_po_number: string | null;
}

export interface ForecastStats {
  total_items: number;
  harus_po_count: number;
  siap_po_count: number;
  aman_count: number;
  tenang_count: number;
  total_recommended_po: number;
}

export interface DateRanges {
  m3_label: string;
  m2_label: string;
  m1_label: string;
}

export interface Parameters {
  target_months: number;
  lead_time_months: number;
}

export interface ForecastData {
  rows: ForecastRow[];
  stats: ForecastStats;
  date_ranges: DateRanges;
  parameters: Parameters;
}

export interface PoProposalItem {
  id: number;
  po_number: string;
  sku: string;
  product_name: string;
  supplier_name: string | null;
  warehouse: string;
  current_stock: number;
  monthly_velocity: number;
  stock_coverage_months: number | null;
  recommended_qty: number;
  proposed_qty: number;
  status: 'pending_approval' | 'approved' | 'rejected' | 'ordered';
  proposed_by: number;
  reviewed_by: number | null;
  reviewed_at: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  proposer?: {
    id: number;
    name: string;
  } | null;
  reviewer?: {
    id: number;
    name: string;
  } | null;
}

export interface ForecastFilters {
  target_months: number;
  lead_time_months: number;
  search: string | null;
  status: string;
}

export interface ForecastPageProps {
  forecast: ForecastData;
  proposals: PoProposalItem[];
  filters: ForecastFilters;
  isManagement: boolean;
}

interface ProposeFormData {
  sku: string;
  product_name: string;
  supplier_name: string;
  warehouse: 'G' | 'A';
  current_stock: number;
  monthly_velocity: number;
  stock_coverage_months: number | null;
  recommended_qty: number;
  proposed_qty: number;
  notes: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('id-ID');
}

function formatDecimal(num: number | null | undefined, digits = 1): string {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateTime(dStr: string | null | undefined): string {
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

// ============================================================================
// Main Component
// ============================================================================

export default function Forecast({ forecast, proposals, filters, isManagement }: ForecastPageProps) {
  const { flash } = usePage<PageProps>().props;

  // Active Tab state
  const [activeTab, setActiveTab] = useState<'forecast' | 'proposals'>('forecast');

  // Filter & Search states
  const [targetMonths, setTargetMonths] = useState<number>(filters.target_months || 5);
  const [leadTimeMonths, setLeadTimeMonths] = useState<number>(filters.lead_time_months || 3);
  const [search, setSearch] = useState<string>(filters.search || '');
  const [statusFilter, setStatusFilter] = useState<string>(filters.status || 'all');

  // Tab 1: Client-side pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Tab 2: Proposal filter state
  const [proposalStatusFilter, setProposalStatusFilter] = useState<string>('all');

  // Proposal modal state
  const [proposingRow, setProposingRow] = useState<ForecastRow | null>(null);
  const [proposeForm, setProposeForm] = useState<ProposeFormData>({
    sku: '',
    product_name: '',
    supplier_name: '',
    warehouse: 'G',
    current_stock: 0,
    monthly_velocity: 0,
    stock_coverage_months: 0,
    recommended_qty: 0,
    proposed_qty: 0,
    notes: '',
  });
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  // Rejection modal state
  const [rejectingProposal, setRejectingProposal] = useState<PoProposalItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  // Detail/notes viewer modal
  const [viewingProposal, setViewingProposal] = useState<PoProposalItem | null>(null);

  // Pending proposals counter for badge
  const pendingCount = useMemo(() => {
    return proposals.filter((p) => p.status === 'pending_approval').length;
  }, [proposals]);

  // Paginated forecast rows
  const paginatedRows = useMemo(() => {
    if (pageSize === 0) return forecast.rows;
    const start = (currentPage - 1) * pageSize;
    return forecast.rows.slice(start, start + pageSize);
  }, [forecast.rows, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 0 || forecast.rows.length === 0) return 1;
    return Math.ceil(forecast.rows.length / pageSize);
  }, [forecast.rows.length, pageSize]);

  // Filtered proposals for Tab 2
  const filteredProposals = useMemo(() => {
    if (proposalStatusFilter === 'all') return proposals;
    return proposals.filter((p) => p.status === proposalStatusFilter);
  }, [proposals, proposalStatusFilter]);

  // Apply filters via Inertia GET
  function applyServerFilters(newStatus = statusFilter, newSearch = search, newTarget = targetMonths, newLead = leadTimeMonths) {
    setCurrentPage(1);
    router.get(
      '/stock-forecast',
      {
        target_months: newTarget,
        lead_time_months: newLead,
        search: newSearch.trim() || undefined,
        status: newStatus,
      },
      {
        preserveState: true,
        replace: true,
      }
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyServerFilters(statusFilter, search, targetMonths, leadTimeMonths);
  }

  function handleStatusChange(newStatus: string) {
    setStatusFilter(newStatus);
    applyServerFilters(newStatus, search, targetMonths, leadTimeMonths);
  }

  function handleResetFilters() {
    setSearch('');
    setStatusFilter('all');
    setTargetMonths(5);
    setLeadTimeMonths(3);
    setCurrentPage(1);
    router.get('/stock-forecast', {}, { preserveState: true, replace: true });
  }

  // Open Propose Modal
  function handleOpenProposeModal(row: ForecastRow) {
    setProposingRow(row);
    const initialQty = row.recommended_po_qty > 0 ? row.recommended_po_qty : Math.max(1, Math.round(row.monthly_velocity));
    setProposeForm({
      sku: row.item_code,
      product_name: row.item_name || row.item_code,
      supplier_name: '',
      warehouse: 'G',
      current_stock: row.total_stock,
      monthly_velocity: row.monthly_velocity,
      stock_coverage_months: row.stock_coverage_months,
      recommended_qty: row.recommended_po_qty,
      proposed_qty: initialQty,
      notes: '',
    });
  }

  function handleSubmitPropose(e: React.FormEvent) {
    e.preventDefault();
    if (proposeForm.proposed_qty < 1) return;

    setIsSubmittingProposal(true);
    router.post(
      '/stock-forecast/propose',
      {
        sku: proposeForm.sku,
        product_name: proposeForm.product_name,
        supplier_name: proposeForm.supplier_name.trim() || null,
        warehouse: proposeForm.warehouse,
        current_stock: proposeForm.current_stock,
        monthly_velocity: proposeForm.monthly_velocity,
        stock_coverage_months: proposeForm.stock_coverage_months ?? 0,
        recommended_qty: proposeForm.recommended_qty,
        proposed_qty: proposeForm.proposed_qty,
        notes: proposeForm.notes.trim() || null,
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setIsSubmittingProposal(false);
          setProposingRow(null);
        },
        onError: () => {
          setIsSubmittingProposal(false);
        },
      }
    );
  }

  // Approve Proposal (Management)
  function handleApprove(proposal: PoProposalItem) {
    if (
      !confirm(
        `Konfirmasi persetujuan PO ${proposal.po_number}?\nSKU: ${proposal.sku}\nJumlah Diajukan: ${proposal.proposed_qty.toLocaleString('id-ID')} unit`
      )
    ) {
      return;
    }
    setApprovingId(proposal.id);
    router.post(
      `/stock-forecast/proposals/${proposal.id}/approve`,
      {},
      {
        preserveScroll: true,
        onFinish: () => setApprovingId(null),
      }
    );
  }

  // Reject Proposal (Management)
  function handleOpenRejectModal(proposal: PoProposalItem) {
    setRejectingProposal(proposal);
    setRejectionReason('');
  }

  function handleSubmitReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectingProposal) return;
    if (!rejectionReason.trim()) return;

    setIsRejecting(true);
    router.post(
      `/stock-forecast/proposals/${rejectingProposal.id}/reject`,
      {
        rejection_reason: rejectionReason.trim(),
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setIsRejecting(false);
          setRejectingProposal(null);
          setRejectionReason('');
        },
        onError: () => {
          setIsRejecting(false);
        },
      }
    );
  }

  // SheetJS Excel Export
  function handleExportExcel() {
    const exportData = forecast.rows.map((row, idx) => {
      let urgencyLabel = 'Aman';
      if (row.urgency_status === 'harus_po') urgencyLabel = 'Harus PO Segera';
      else if (row.urgency_status === 'siap_po') urgencyLabel = 'Siap-siap PO';
      else if (row.urgency_status === 'tenang') urgencyLabel = 'Tenang / Non-Aktif';

      return {
        'No': idx + 1,
        'Kode SKU': row.item_code,
        'Nama Produk': row.item_name || '—',
        'Stok Gudang G (Pcs)': row.stock_g,
        'Stok Gudang A (Pcs)': row.stock_a,
        'Total Stok Gudang (Pcs)': row.total_stock,
        [`Penjualan ${forecast.date_ranges.m3_label}`]: row.sales_m3,
        [`Penjualan ${forecast.date_ranges.m2_label}`]: row.sales_m2,
        [`Penjualan ${forecast.date_ranges.m1_label}`]: row.sales_m1,
        'Total Penjualan 3 Bulan': row.total_3m_sales,
        'Kecepatan/Bulan (Velocity)': row.monthly_velocity,
        'Ketahanan Stok (Bulan)': row.stock_coverage_months !== null ? row.stock_coverage_months : '—',
        'Reorder Point (ROP)': row.reorder_point,
        'Sisa Waktu Menuju PO (Bulan)': row.time_to_po_months !== null ? row.time_to_po_months : '—',
        'Target Stok Gudang': row.target_stock,
        'Rekomendasi Order Pabrik': row.recommended_po_qty,
        'Status Urgensi': urgencyLabel,
        'No. PO Terbuka': row.active_po_number || '—',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proyeksi Stok & PO');

    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Proyeksi_Stok_Rencana_PO_${todayStr}.xlsx`);
  }

  return (
    <AppLayout>
      <Head title="Proyeksi Stok & Rencana PO - Koding ERP" />

      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Flash Notifications */}
        {flash?.success && (
          <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-xs">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>{flash.success}</span>
            </div>
          </div>
        )}

        {flash?.error && (
          <div className="bg-rose-950/60 border border-rose-800 text-rose-300 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-xs">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{flash.error}</span>
            </div>
          </div>
        )}

        {/* Header Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Proyeksi Stok & Rencana PO</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Supply Chain & Forecasting
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Analisis perputaran barang riwayat 3 bulan ({forecast.date_ranges.m3_label} – {forecast.date_ranges.m1_label}), estimasi ketahanan stok gudang, dan otomatisasi kalkulasi rekomendasi Purchase Order pabrik.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* SheetJS Export */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer active:scale-98"
              title="Download seluruh kalkulasi proyeksi stok ke file Excel (.xlsx)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Export Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 5 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Total SKU */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 hover:border-slate-700/80 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total SKU Dipantau</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-white font-mono tracking-tight">
                {formatNumber(forecast.stats.total_items)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Item aktif di Gudang G & A</p>
            </div>
          </div>

          {/* Card 2: Harus PO Segera */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 hover:border-rose-900/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Harus PO Segera</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-rose-400 font-mono tracking-tight">
                {formatNumber(forecast.stats.harus_po_count)}
              </p>
              <p className="text-xs text-rose-400/70 mt-1">Stok ≤ ROP / &le; {forecast.parameters.lead_time_months} bln lead time</p>
            </div>
          </div>

          {/* Card 3: Siap-siap PO */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 hover:border-amber-900/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Siap-siap PO</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                {formatNumber(forecast.stats.siap_po_count)}
              </p>
              <p className="text-xs text-amber-400/70 mt-1">Stok &le; {forecast.parameters.target_months} bln ketahanan</p>
            </div>
          </div>

          {/* Card 4: Stok Aman */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 hover:border-emerald-900/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Stok Aman</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                {formatNumber(forecast.stats.aman_count)}
              </p>
              <p className="text-xs text-emerald-400/70 mt-1">Stok &gt; {forecast.parameters.target_months} bln aman terkendali</p>
            </div>
          </div>

          {/* Card 5: Total Rekomendasi Unit */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5 hover:border-blue-800/80 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Rekomendasi Order</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V3.75c0-.621-.504-1.125-1.125-1.125h-9.75c-.621 0-1.125.504-1.125 1.125v15" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-white font-mono tracking-tight">
                {formatNumber(forecast.stats.total_recommended_po)}{' '}
                <span className="text-xs font-normal text-slate-400 font-sans">Unit</span>
              </p>
              <p className="text-xs text-blue-400 mt-1">Total kebutuhan PO baru</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('forecast')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'forecast'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.25 2.25L15 6" />
              </svg>
              <span>Analisis & Proyeksi Stok</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('proposals')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'proposals'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <span>Pengajuan PO & Persetujuan Manajemen</span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  {pendingCount} Menunggu
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: ANALISIS & PROYEKSI STOK                                           */}
        {/* ========================================================================= */}
        {activeTab === 'forecast' && (
          <div className="space-y-4">
            {/* Dynamic Parameter Controls Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Parameter Forecasting & Formula PO
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Penetapan target buffer stok aman dan durasi waktu tunggu manufaktur pabrik.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                  {/* Parameter: Target Ketahanan */}
                  <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                    <label htmlFor="target-months-input" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                      Target Ketahanan:
                    </label>
                    <input
                      id="target-months-input"
                      type="number"
                      min={1}
                      max={24}
                      value={targetMonths}
                      onChange={(e) => setTargetMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center font-mono focus:outline-none focus:border-blue-600"
                    />
                    <span className="text-[11px] text-slate-500 font-medium">Bulan</span>
                  </div>

                  {/* Parameter: Lead Time */}
                  <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                    <label htmlFor="lead-time-input" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                      Lead Time Pabrik:
                    </label>
                    <input
                      id="lead-time-input"
                      type="number"
                      min={1}
                      max={12}
                      value={leadTimeMonths}
                      onChange={(e) => setLeadTimeMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center font-mono focus:outline-none focus:border-blue-600"
                    />
                    <span className="text-[11px] text-slate-500 font-medium">Bulan</span>
                  </div>

                  {/* Button: Terapkan Parameter */}
                  <button
                    type="button"
                    onClick={() => applyServerFilters(statusFilter, search, targetMonths, leadTimeMonths)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-98 shadow-xs"
                  >
                    Terapkan Parameter
                  </button>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                <button
                  type="button"
                  onClick={() => handleStatusChange('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === 'all'
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  Semua ({forecast.stats.total_items})
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('harus_po')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === 'harus_po'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'text-rose-400 hover:bg-rose-500/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Harus PO ({forecast.stats.harus_po_count})
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('siap_po')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === 'siap_po'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-amber-400 hover:bg-amber-500/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Siap-siap PO ({forecast.stats.siap_po_count})
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('aman')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === 'aman'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Stok Aman ({forecast.stats.aman_count})
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('tenang')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === 'tenang'
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : 'text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  Tenang ({forecast.stats.tenang_count})
                </button>
              </div>

              {/* Search Form */}
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari SKU atau nama item..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600 transition-colors"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                    className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        applyServerFilters(statusFilter, '', targetMonths, leadTimeMonths);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-98"
                >
                  Cari
                </button>

                {(search || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-2.5 py-2 text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
                    title="Reset semua filter"
                  >
                    Reset
                  </button>
                )}
              </form>
            </div>

            {/* Data Table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/80">
                      <th className="py-3 px-3 w-10 text-center">No</th>
                      <th className="py-3 px-3 min-w-[200px]">SKU & Nama Barang</th>
                      <th className="py-3 px-3 text-right">Stok Fisik</th>
                      <th className="py-3 px-3 text-right">
                        Riwayat Penjualan (3 Bln)
                        <div className="text-[10px] font-normal normal-case text-slate-500 mt-0.5">
                          {forecast.date_ranges.m3_label} → {forecast.date_ranges.m1_label}
                        </div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        Velocity
                        <div className="text-[10px] font-normal normal-case text-slate-500 mt-0.5">Rata-rata/Bln</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        Coverage
                        <div className="text-[10px] font-normal normal-case text-slate-500 mt-0.5">Ketahanan Stok</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        ROP
                        <div className="text-[10px] font-normal normal-case text-slate-500 mt-0.5">Reorder Point</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        Sisa Waktu
                        <div className="text-[10px] font-normal normal-case text-slate-500 mt-0.5">Hingga PO</div>
                      </th>
                      <th className="py-3 px-3 text-right min-w-[120px]">
                        Rekomendasi PO
                        <div className="text-[10px] font-normal normal-case text-slate-500 mt-0.5">Target {forecast.parameters.target_months} Bln</div>
                      </th>
                      <th className="py-3 px-3 text-center min-w-[140px]">Status Urgensi</th>
                      <th className="py-3 px-3 text-center min-w-[110px]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-600">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                            <p className="text-sm font-medium text-slate-400">Tidak ada produk yang sesuai kriteria pencarian</p>
                            <p className="text-xs text-slate-600">Coba ubah filter atau kata kunci pencarian SKU</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, idx) => {
                        const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                        const isHarusPo = row.urgency_status === 'harus_po';
                        const isSiapPo = row.urgency_status === 'siap_po';
                        const isAman = row.urgency_status === 'aman';

                        return (
                          <tr
                            key={row.item_code}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              isHarusPo ? 'bg-rose-950/10' : ''
                            }`}
                          >
                            {/* No */}
                            <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                              {rowNumber}
                            </td>

                            {/* SKU & Name */}
                            <td className="py-3 px-3">
                              <div className="font-mono font-bold text-white text-xs">{row.item_code}</div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[240px]" title={row.item_name || ''}>
                                {row.item_name || '—'}
                              </div>
                              {row.active_po_number && (
                                <div className="mt-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                    {row.active_po_number}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Current Stock */}
                            <td className="py-3 px-3 text-right">
                              <div className="font-mono font-bold text-white text-xs">
                                {formatNumber(row.total_stock)} <span className="text-[10px] text-slate-400 font-sans">pcs</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                G:{formatNumber(row.stock_g)} • A:{formatNumber(row.stock_a)}
                              </div>
                            </td>

                            {/* 3M Sales Breakdown */}
                            <td className="py-3 px-3 text-right">
                              <div className="font-mono font-semibold text-slate-200">
                                {formatNumber(row.total_3m_sales)} <span className="text-[10px] text-slate-400 font-sans">total</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {formatNumber(row.sales_m3)} | {formatNumber(row.sales_m2)} | {formatNumber(row.sales_m1)}
                              </div>
                            </td>

                            {/* Velocity */}
                            <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">
                              {formatDecimal(row.monthly_velocity)}{' '}
                              <span className="text-[10px] text-slate-500 font-sans">/bln</span>
                            </td>

                            {/* Stock Coverage (Ketahanan) */}
                            <td className="py-3 px-3 text-right">
                              {row.stock_coverage_months !== null ? (
                                <div className="font-mono font-bold">
                                  <span
                                    className={
                                      row.stock_coverage_months <= forecast.parameters.lead_time_months
                                        ? 'text-rose-400'
                                        : row.stock_coverage_months <= forecast.parameters.target_months
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                    }
                                  >
                                    {formatDecimal(row.stock_coverage_months)}
                                  </span>{' '}
                                  <span className="text-[10px] text-slate-500 font-sans">bln</span>
                                </div>
                              ) : (
                                <span className="text-slate-600 font-mono">—</span>
                              )}
                            </td>

                            {/* Reorder Point */}
                            <td className="py-3 px-3 text-right font-mono text-slate-300">
                              {formatNumber(row.reorder_point)}
                            </td>

                            {/* Time to PO */}
                            <td className="py-3 px-3 text-right">
                              {row.time_to_po_months !== null ? (
                                <span
                                  className={`font-mono text-xs font-semibold ${
                                    row.time_to_po_months <= 0
                                      ? 'text-rose-400'
                                      : row.time_to_po_months <= 1
                                      ? 'text-amber-400'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {row.time_to_po_months <= 0 ? 'SEGERA' : `${formatDecimal(row.time_to_po_months)} bln`}
                                </span>
                              ) : (
                                <span className="text-slate-600 font-mono">—</span>
                              )}
                            </td>

                            {/* Recommended PO Qty */}
                            <td className="py-3 px-3 text-right">
                              <div className="font-mono font-bold text-xs">
                                <span
                                  className={
                                    row.recommended_po_qty > 0 ? 'text-blue-400 text-sm' : 'text-slate-500'
                                  }
                                >
                                  {formatNumber(row.recommended_po_qty)}
                                </span>{' '}
                                <span className="text-[10px] text-slate-500 font-sans">unit</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Target: {formatNumber(row.target_stock)}
                              </div>
                            </td>

                            {/* Urgency Badge */}
                            <td className="py-3 px-3 text-center">
                              {isHarusPo && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                  Harus PO Segera
                                </span>
                              )}
                              {isSiapPo && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                  Siap-siap PO
                                </span>
                              )}
                              {isAman && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                  Stok Aman
                                </span>
                              )}
                              {row.urgency_status === 'tenang' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                  Tenang
                                </span>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenProposeModal(row)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-98 ${
                                  isHarusPo
                                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
                                    : row.recommended_po_qty > 0
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                }`}
                                title="Buat draf pengajuan PO untuk diteruskan ke persetujuan manajemen"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                <span>Ajukan PO</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {forecast.rows.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-slate-800 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>Menampilkan</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(parseInt(e.target.value, 10));
                        setCurrentPage(1);
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-600"
                    >
                      <option value={25}>25 baris</option>
                      <option value={50}>50 baris</option>
                      <option value={100}>100 baris</option>
                      <option value={0}>Semua baris</option>
                    </select>
                    <span>dari {forecast.rows.length} total SKU terfilter</span>
                  </div>

                  {pageSize > 0 && totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Sebelumnya
                      </button>
                      <span className="px-3 py-1 font-mono text-xs text-slate-300">
                        Halaman {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        Berikutnya
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DAFTAR PENGAJUAN PO & PERSETUJUAN MANAJEMEN                       */}
        {/* ========================================================================= */}
        {activeTab === 'proposals' && (
          <div className="space-y-4">
            {/* Proposals Filter & Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Antrean Pengajuan Purchase Order</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Daftar PO yang diajukan oleh PIC dan membutuhkan otorisasi/persetujuan Direktur & Super Admin.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    proposalStatusFilter === 'all'
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Semua ({proposals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('pending_approval')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    proposalStatusFilter === 'pending_approval'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-amber-400 hover:bg-amber-500/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Menunggu ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('approved')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    proposalStatusFilter === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Disetujui ({proposals.filter((p) => p.status === 'approved').length})
                </button>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('rejected')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    proposalStatusFilter === 'rejected'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'text-rose-400 hover:bg-rose-500/10'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  Ditolak ({proposals.filter((p) => p.status === 'rejected').length})
                </button>
              </div>
            </div>

            {/* Proposals Table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/80">
                      <th className="py-3 px-3">No. PO & Tanggal</th>
                      <th className="py-3 px-3 min-w-[180px]">SKU & Produk</th>
                      <th className="py-3 px-3">Gudang & Supplier</th>
                      <th className="py-3 px-3 text-right">Stok & Velocity</th>
                      <th className="py-3 px-3 text-right">Rekomendasi vs Diajukan</th>
                      <th className="py-3 px-3">PIC Pengaju & Catatan</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3">Info Reviewer</th>
                      <th className="py-3 px-3 text-center min-w-[140px]">Aksi Manajemen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProposals.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-600">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                            <p className="text-sm font-medium text-slate-400">Tidak ada pengajuan PO dalam daftar ini</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredProposals.map((proposal) => {
                        const isPending = proposal.status === 'pending_approval';
                        const isApproved = proposal.status === 'approved';
                        const isRejected = proposal.status === 'rejected';

                        return (
                          <tr key={proposal.id} className="hover:bg-slate-800/40 transition-colors">
                            {/* PO Number & Date */}
                            <td className="py-3 px-3">
                              <div className="font-mono font-bold text-white text-xs">{proposal.po_number}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {formatDateTime(proposal.created_at)}
                              </div>
                            </td>

                            {/* SKU & Product */}
                            <td className="py-3 px-3">
                              <div className="font-mono font-bold text-slate-200">{proposal.sku}</div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={proposal.product_name}>
                                {proposal.product_name}
                              </div>
                            </td>

                            {/* Warehouse & Supplier */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                  Gudang {proposal.warehouse}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 truncate max-w-[140px]" title={proposal.supplier_name || ''}>
                                {proposal.supplier_name || '—'}
                              </div>
                            </td>

                            {/* Stock & Velocity */}
                            <td className="py-3 px-3 text-right">
                              <div className="font-mono text-slate-200">
                                Stok: {formatNumber(proposal.current_stock)}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Vel: {formatDecimal(proposal.monthly_velocity)}/bln
                              </div>
                            </td>

                            {/* Recommended vs Proposed */}
                            <td className="py-3 px-3 text-right">
                              <div className="font-mono font-bold text-white text-xs">
                                {formatNumber(proposal.proposed_qty)}{' '}
                                <span className="text-[10px] text-slate-400 font-sans">unit</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Rekom: {formatNumber(proposal.recommended_qty)}
                              </div>
                            </td>

                            {/* PIC & Notes */}
                            <td className="py-3 px-3">
                              <div className="text-xs font-semibold text-slate-200">
                                {proposal.proposer?.name || `User #${proposal.proposed_by}`}
                              </div>
                              {proposal.notes && (
                                <button
                                  type="button"
                                  onClick={() => setViewingProposal(proposal)}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 underline mt-0.5 cursor-pointer block truncate max-w-[160px]"
                                  title={proposal.notes}
                                >
                                  Catatan: &ldquo;{proposal.notes}&rdquo;
                                </button>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 text-center">
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                  Menunggu Persetujuan
                                </span>
                              )}
                              {isApproved && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                  Disetujui
                                </span>
                              )}
                              {isRejected && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                  Ditolak
                                </span>
                              )}
                              {proposal.status === 'ordered' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                  Telah Dipesan
                                </span>
                              )}
                            </td>

                            {/* Reviewer Info */}
                            <td className="py-3 px-3">
                              {proposal.reviewer ? (
                                <div>
                                  <div className="text-xs font-semibold text-slate-200">
                                    {proposal.reviewer.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {formatDateTime(proposal.reviewed_at)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-600 font-mono">—</span>
                              )}

                              {isRejected && proposal.rejection_reason && (
                                <div className="mt-1 text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/50">
                                  <span className="font-bold">Alasan:</span> {proposal.rejection_reason}
                                </div>
                              )}
                            </td>

                            {/* Actions for Management */}
                            <td className="py-3 px-3 text-center">
                              {isManagement && isPending ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={approvingId === proposal.id}
                                    onClick={() => handleApprove(proposal)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 active:scale-98 shadow-xs"
                                    title="Setujui pengajuan PO ini"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                    <span>Setujui</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenRejectModal(proposal)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer active:scale-98"
                                    title="Tolak pengajuan PO ini dengan alasan"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span>Tolak</span>
                                  </button>
                                </div>
                              ) : isPending ? (
                                <span className="text-[11px] text-amber-400 font-medium">Menunggu Direktur</span>
                              ) : (
                                <span className="text-[11px] text-slate-500">Selesai Ditinjau</span>
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
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: AJUKAN PO KE MANAJEMEN                                             */}
      {/* ========================================================================= */}
      {proposingRow && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isSubmittingProposal && setProposingRow(null)}
        >
          <div
            className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-left space-y-5 text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Ajukan Purchase Order ke Manajemen</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  SKU: {proposingRow.item_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProposingRow(null)}
                disabled={isSubmittingProposal}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Product Summary Box */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="font-bold text-white text-sm">{proposingRow.item_name || proposingRow.item_code}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500 block">Stok Saat Ini:</span>
                  <span className="font-bold text-slate-200">{formatNumber(proposingRow.total_stock)} pcs</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Velocity:</span>
                  <span className="font-bold text-slate-200">{formatDecimal(proposingRow.monthly_velocity)} /bln</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Coverage:</span>
                  <span className="font-bold text-amber-400">{formatDecimal(proposingRow.stock_coverage_months)} bln</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Rekomendasi:</span>
                  <span className="font-bold text-blue-400">{formatNumber(proposingRow.recommended_po_qty)} pcs</span>
                </div>
              </div>
            </div>

            {/* Proposal Form */}
            <form onSubmit={handleSubmitPropose} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                  Jumlah Unit yang Diajukan (Pcs) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={proposeForm.proposed_qty}
                  onChange={(e) => setProposeForm({ ...proposeForm, proposed_qty: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-blue-600"
                  placeholder="Jumlah unit PO..."
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Direkomendasikan sistem: <span className="text-blue-400 font-mono font-bold">{formatNumber(proposingRow.recommended_po_qty)}</span> unit untuk target {forecast.parameters.target_months} bulan.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Gudang Tujuan <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={proposeForm.warehouse}
                    onChange={(e) => setProposeForm({ ...proposeForm, warehouse: e.target.value as 'G' | 'A' })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="G">Gudang G (Eceran / Pcs)</option>
                    <option value="A">Gudang A (Grosir / Lusinan)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                    Nama Pabrik / Supplier
                  </label>
                  <input
                    type="text"
                    value={proposeForm.supplier_name}
                    onChange={(e) => setProposeForm({ ...proposeForm, supplier_name: e.target.value })}
                    placeholder="Contoh: PT Sumber Rejeki (Opsional)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                  Catatan untuk Manajemen
                </label>
                <textarea
                  rows={3}
                  value={proposeForm.notes}
                  onChange={(e) => setProposeForm({ ...proposeForm, notes: e.target.value })}
                  placeholder="Contoh: Stok kritis menjelang kampanye Shopee bulan depan, mohon approval segera..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600"
                ></textarea>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSubmittingProposal}
                  onClick={() => setProposingRow(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposal || proposeForm.proposed_qty < 1}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 active:scale-98 shadow-xs"
                >
                  {isSubmittingProposal ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan PO'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL: TOLAK PENGAJUAN PO                                                 */}
      {/* ========================================================================= */}
      {rejectingProposal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isRejecting && setRejectingProposal(null)}
        >
          <div
            className="relative w-full max-w-md bg-slate-900 border border-rose-900/50 rounded-2xl p-6 shadow-2xl text-left space-y-4 text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-rose-400 text-base">Tolak Pengajuan PO</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {rejectingProposal.po_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectingProposal(null)}
                disabled={isRejecting}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl text-xs space-y-1">
              <p className="font-bold text-white">{rejectingProposal.product_name} ({rejectingProposal.sku})</p>
              <p className="text-slate-400 font-mono">
                Jumlah diajukan: {formatNumber(rejectingProposal.proposed_qty)} unit
              </p>
            </div>

            <form onSubmit={handleSubmitReject} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1 text-[11px]">
                  Alasan Penolakan <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Jelaskan alasan penolakan agar PIC dapat melakukan penyesuaian..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-600"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isRejecting}
                  onClick={() => setRejectingProposal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isRejecting || rejectionReason.trim().length < 3}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 active:scale-98 shadow-xs"
                >
                  {isRejecting ? 'Memproses...' : 'Tolak Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETAIL / CATATAN PENGAJUAN                                         */}
      {/* ========================================================================= */}
      {viewingProposal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setViewingProposal(null)}
        >
          <div
            className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-left space-y-4 text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Detail Catatan PIC</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {viewingProposal.po_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingProposal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px] font-bold uppercase">Produk:</span>
                <span className="font-semibold text-white">{viewingProposal.product_name} ({viewingProposal.sku})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px] font-bold uppercase">PIC Pengaju:</span>
                <span className="text-slate-300">{viewingProposal.proposer?.name || `User #${viewingProposal.proposed_by}`}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px] font-bold uppercase">Catatan Lengkap:</span>
                <div className="mt-1 p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 whitespace-pre-wrap font-sans">
                  {viewingProposal.notes || 'Tidak ada catatan.'}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewingProposal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
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
