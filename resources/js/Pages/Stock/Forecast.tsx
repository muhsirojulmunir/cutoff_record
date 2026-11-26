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
  monthly_velocity: number | string;
  stock_coverage_months: number | string | null;
  target_months?: number | null;
  target_stock?: number | null;
  recommended_qty: number;
  proposed_qty: number;
  status: 'pending_approval' | 'approved' | 'rejected' | 'ordered';
  proposed_by: number;
  reviewed_by: number | null;
  reviewed_at: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  proposer?: { id: number; name: string };
  reviewer?: { id: number; name: string };
}

export interface ForecastPageProps {
  forecast: ForecastData;
  proposals: PoProposalItem[];
  filters: {
    target_months: number;
    lead_time_months: number;
    search: string | null;
    status: string;
  };
  isManagement: boolean;
  isDirekturOnly?: boolean;
}

// ============================================================================
// Formatters
// ============================================================================

function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === '') return '0';
  const val = Number(num);
  if (isNaN(val)) return '0';
  return val.toLocaleString('id-ID');
}

function formatDecimal(num: number | string | null | undefined, digits = 1): string {
  if (num === null || num === undefined || num === '') return '—';
  const val = Number(num);
  if (isNaN(val)) return '—';
  return val.toLocaleString('id-ID', {
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

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatMonthYearOffset(baseDateStr: string | null | undefined, offsetMonths: number): string {
  const base = baseDateStr ? new Date(baseDateStr) : new Date();
  const validBase = isNaN(base.getTime()) ? new Date() : base;
  const approxDays = Math.max(0, Math.round(offsetMonths * 30));
  const target = new Date(validBase.getTime() + approxDays * 86400 * 1000);
  return `${MONTHS_ID[target.getMonth()] || ''} ${target.getFullYear()}`;
}

function buildPoProjectionNarrative(proposal: PoProposalItem) {
  const velocity = Number(proposal.monthly_velocity || 0);
  const currentStock = Number(proposal.current_stock || 0);
  const coverage =
    proposal.stock_coverage_months !== null && proposal.stock_coverage_months !== undefined
      ? Number(proposal.stock_coverage_months)
      : velocity > 0
      ? currentStock / velocity
      : 0;
  const targetMonths =
    proposal.target_months && proposal.target_months > 0
      ? Number(proposal.target_months)
      : velocity > 0 && proposal.recommended_qty > 0
      ? Math.max(1, Math.round((currentStock + Number(proposal.recommended_qty)) / velocity))
      : 5;
  const targetStock =
    proposal.target_stock && proposal.target_stock > 0
      ? Number(proposal.target_stock)
      : proposal.recommended_qty > 0
      ? currentStock + Number(proposal.recommended_qty)
      : Math.ceil(velocity * targetMonths);

  const stockoutMonth = velocity > 0 ? formatMonthYearOffset(proposal.created_at, coverage) : '—';
  const targetMonth = formatMonthYearOffset(proposal.created_at, targetMonths);

  return {
    velocity,
    currentStock,
    coverage,
    targetMonths,
    targetStock,
    stockoutMonth,
    targetMonth,
  };
}

// ============================================================================
// Main Component
// ============================================================================

export default function Forecast({
  forecast,
  proposals = [],
  filters,
  isManagement = false,
  isDirekturOnly = false,
}: ForecastPageProps) {
  const { flash } = usePage<PageProps>().props;

  // Active Tab: Direktur hanya melihat daftar pengajuan PO dari PIC
  const [activeTab, setActiveTab] = useState<'projection' | 'proposals'>(
    isDirekturOnly ? 'proposals' : 'projection'
  );

  // Search & Filter state for Projection Tab
  const [search, setSearch] = useState(filters.search || '');
  const [statusFilter, setStatusFilter] = useState<string>(filters.status || 'all');
  const [targetMonths, setTargetMonths] = useState<number>(filters.target_months || 5);
  const [leadTimeMonths, setLeadTimeMonths] = useState<number>(filters.lead_time_months || 3);
  const [isApplyingParams, setIsApplyingParams] = useState(false);

  // Pagination for Projection Table
  const [perPage, setPerPage] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Proposal filter state
  const [proposalStatusFilter, setProposalStatusFilter] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all');

  // Propose Modal State
  const [proposeModal, setProposeModal] = useState<{
    isOpen: boolean;
    row: ForecastRow | null;
    proposedQty: number;
    supplierName: string;
    warehouse: 'G' | 'A';
    notes: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    row: null,
    proposedQty: 0,
    supplierName: '',
    warehouse: 'G',
    notes: '',
    isSubmitting: false,
  });

  // Reject Modal State
  const [rejectModal, setRejectModal] = useState<{
    isOpen: boolean;
    proposal: PoProposalItem | null;
    reason: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    proposal: null,
    reason: '',
    isSubmitting: false,
  });

  // Notes View Modal
  const [notesModal, setNotesModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
  }>({
    isOpen: false,
    title: '',
    content: '',
  });

  // Count pending proposals for badge
  const pendingProposalsCount = useMemo(() => {
    return (proposals || []).filter((p) => p.status === 'pending_approval').length;
  }, [proposals]);

  // Filtered rows for Projection Table
  const filteredRows = useMemo(() => {
    let rows = forecast?.rows || [];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.item_code.toLowerCase().includes(q) ||
          (r.item_name && r.item_name.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.urgency_status === statusFilter);
    }

    return rows;
  }, [forecast?.rows, search, statusFilter]);

  // Paginated Rows
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
  const paginatedRows = useMemo(() => {
    if (perPage === -1) return filteredRows;
    const start = (currentPage - 1) * perPage;
    return filteredRows.slice(start, start + perPage);
  }, [filteredRows, currentPage, perPage]);

  // Filtered Proposals for Tab 2
  const filteredProposals = useMemo(() => {
    if (proposalStatusFilter === 'all') return proposals || [];
    return (proposals || []).filter((p) => p.status === proposalStatusFilter);
  }, [proposals, proposalStatusFilter]);

  // Handlers
  function handleApplyParameters(e: React.FormEvent) {
    e.preventDefault();
    setIsApplyingParams(true);
    router.get(
      '/stock-forecast',
      {
        target_months: targetMonths,
        lead_time_months: leadTimeMonths,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      },
      {
        preserveState: true,
        preserveScroll: true,
        onFinish: () => setIsApplyingParams(false),
      }
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPage(1);
    router.get(
      '/stock-forecast',
      {
        target_months: targetMonths,
        lead_time_months: leadTimeMonths,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      },
      { preserveState: true, preserveScroll: true }
    );
  }

  function handleStatusFilterChange(newStatus: string) {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  }

  function openProposeModal(row: ForecastRow) {
    const recQty = row.recommended_po_qty > 0 ? row.recommended_po_qty : Math.max(0, row.target_stock - row.total_stock);
    setProposeModal({
      isOpen: true,
      row,
      proposedQty: recQty > 0 ? recQty : 100,
      supplierName: '',
      warehouse: 'G',
      notes: `Rekomendasi dari Proyeksi Stok (Kecepatan: ${formatDecimal(row.monthly_velocity)}/bln, Sisa: ${formatDecimal(row.stock_coverage_months)} bln)`,
      isSubmitting: false,
    });
  }

  function submitProposeModal(e: React.FormEvent) {
    e.preventDefault();
    if (!proposeModal.row) return;

    if (proposeModal.proposedQty <= 0) {
      alert('Jumlah unit PO harus lebih besar dari 0.');
      return;
    }

    setProposeModal((prev) => ({ ...prev, isSubmitting: true }));

    router.post(
      '/stock-forecast/propose',
      {
        sku: proposeModal.row.item_code,
        product_name: proposeModal.row.item_name || proposeModal.row.item_code,
        supplier_name: proposeModal.supplierName.trim() || null,
        warehouse: proposeModal.warehouse,
        current_stock: proposeModal.row.total_stock,
        monthly_velocity: proposeModal.row.monthly_velocity,
        stock_coverage_months: proposeModal.row.stock_coverage_months,
        target_months: targetMonths,
        target_stock: proposeModal.row.target_stock,
        recommended_qty: proposeModal.row.recommended_po_qty,
        proposed_qty: proposeModal.proposedQty,
        notes: proposeModal.notes.trim() || null,
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setProposeModal({
            isOpen: false,
            row: null,
            proposedQty: 0,
            supplierName: '',
            warehouse: 'G',
            notes: '',
            isSubmitting: false,
          });
        },
        onError: () => {
          setProposeModal((prev) => ({ ...prev, isSubmitting: false }));
        },
      }
    );
  }

  function handleApproveProposal(proposal: PoProposalItem) {
    if (!confirm(`Setujui pengajuan ${proposal.po_number} untuk SKU ${proposal.sku} sebesar ${formatNumber(proposal.proposed_qty)} unit?`)) {
      return;
    }

    router.post(
      `/stock-forecast/proposals/${proposal.id}/approve`,
      {},
      { preserveScroll: true }
    );
  }

  function openRejectModal(proposal: PoProposalItem) {
    setRejectModal({
      isOpen: true,
      proposal,
      reason: '',
      isSubmitting: false,
    });
  }

  function submitRejectModal(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectModal.proposal) return;

    if (rejectModal.reason.trim().length < 3) {
      alert('Mohon masukkan alasan penolakan minimal 3 karakter.');
      return;
    }

    setRejectModal((prev) => ({ ...prev, isSubmitting: true }));

    router.post(
      `/stock-forecast/proposals/${rejectModal.proposal.id}/reject`,
      {
        rejection_reason: rejectModal.reason.trim(),
      },
      {
        preserveScroll: true,
        onSuccess: () => {
          setRejectModal({
            isOpen: false,
            proposal: null,
            reason: '',
            isSubmitting: false,
          });
        },
        onError: () => {
          setRejectModal((prev) => ({ ...prev, isSubmitting: false }));
        },
      }
    );
  }

  function handleExportExcel() {
    const rows = filteredRows;
    if (rows.length === 0) {
      alert('Tidak ada data proyeksi untuk diekspor.');
      return;
    }

    const exportData = rows.map((r, idx) => ({
      'No': idx + 1,
      'Kode SKU': r.item_code,
      'Nama Barang': r.item_name || '—',
      'Stok Gudang G (Pcs)': r.stock_g,
      'Stok Gudang A (Pcs)': r.stock_a,
      'Total Stok Fisik (Pcs)': r.total_stock,
      [`Penjualan ${forecast.date_ranges.m3_label}`]: r.sales_m3,
      [`Penjualan ${forecast.date_ranges.m2_label}`]: r.sales_m2,
      [`Penjualan ${forecast.date_ranges.m1_label}`]: r.sales_m1,
      'Total Penjualan 3 Bln': r.total_3m_sales,
      'Kecepatan Laku (Pcs/Bln)': r.monthly_velocity,
      'Ketahanan Stok (Bulan)': r.stock_coverage_months !== null ? r.stock_coverage_months : 'Tenang',
      'Ambang ROP (3 Bln)': r.reorder_point,
      'Sisa Waktu Menuju PO (Bulan)': r.time_to_po_months !== null ? r.time_to_po_months : '—',
      'Target Stok (5 Bln)': r.target_stock,
      'Rekomendasi PO (Pcs)': r.recommended_po_qty,
      'Status Urgensi':
        r.urgency_status === 'harus_po'
          ? 'HARUS PO SEGERA'
          : r.urgency_status === 'siap_po'
          ? 'SIAP-SIAP PO'
          : r.urgency_status === 'aman'
          ? 'STOK AMAN'
          : 'TENANG',
      'PO Aktif': r.active_po_number || 'Belum Ada',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proyeksi Stok');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Proyeksi_Stok_Rencana_PO_${dateStr}.xlsx`);
  }

  const stats = forecast?.stats || {
    total_items: 0,
    harus_po_count: 0,
    siap_po_count: 0,
    aman_count: 0,
    tenang_count: 0,
    total_recommended_po: 0,
  };

  const proposalStats = useMemo(() => {
    const list = proposals || [];
    const pending = list.filter((p) => p.status === 'pending_approval');
    return {
      pendingCount: pending.length,
      approvedCount: list.filter((p) => p.status === 'approved' || p.status === 'ordered').length,
      rejectedCount: list.filter((p) => p.status === 'rejected').length,
      pendingQty: pending.reduce((sum, p) => sum + Number(p.proposed_qty || 0), 0),
    };
  }, [proposals]);

  return (
    <AppLayout>
      <Head title={isDirekturOnly ? 'Pengajuan PO dari PIC - Koding ERP' : 'Proyeksi Stok & Rencana PO - Koding ERP'} />

      <div className="space-y-4 sm:space-y-6 w-full max-w-[1700px] mx-auto pb-12 px-1 sm:px-4">
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

        {/* Header Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {isDirekturOnly ? 'Pengajuan PO dari PIC' : 'Proyeksi Stok & Rencana PO'}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {isDirekturOnly ? 'Persetujuan Manajemen' : 'Supply Chain & Forecasting'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
              {isDirekturOnly
                ? 'Daftar pengajuan Purchase Order dari PIC beserta rincian rata-rata penjualan bulanan, estimasi stok habis, dan target kebutuhan stok untuk persetujuan.'
                : `Analisis perputaran barang riwayat 3 bulan (${forecast?.date_ranges?.m3_label || 'M-3'} – ${forecast?.date_ranges?.m1_label || 'M-1'}), estimasi ketahanan stok gudang, dan otomatisasi kalkulasi rekomendasi Purchase Order pabrik.`}
            </p>
          </div>

          {!isDirekturOnly && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer whitespace-nowrap active:scale-98"
                title="Unduh seluruh baris proyeksi ke format Excel (.xlsx)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span>Export Excel (.xlsx)</span>
              </button>
            </div>
          )}
        </div>

        {/* Summary Cards: Direktur (4 KPI Pengajuan PO) vs PIC/Super Admin (5 KPI Forecasting) */}
        {isDirekturOnly ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-600">Menunggu Persetujuan</span>
              <p className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight font-mono mt-2">
                {formatNumber(proposalStats.pendingCount)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Pengajuan PO aktif</p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-600">Disetujui</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight font-mono mt-2">
                {formatNumber(proposalStats.approvedCount)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Siap diproses PO pabrik</p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-600">Ditolak</span>
              <p className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight font-mono mt-2">
                {formatNumber(proposalStats.rejectedCount)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Ditunda / tidak disetujui</p>
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-600">Total Unit Pending</span>
              <p className="text-xl sm:text-2xl font-black text-[#0B132B] tracking-tight font-mono mt-2">
                {formatNumber(proposalStats.pendingQty)} <span className="text-xs font-medium text-slate-500 font-sans">pcs</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Total diajukan PIC</p>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total SKU */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total SKU Dipantau</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                {formatNumber(stats.total_items)}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Item Master Stok dianalisis</span>
              </p>
            </div>
          </div>

          {/* Card 2: Harus PO Segera (Kritis) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Harus PO Segera</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50 text-rose-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-rose-600 tracking-tight font-mono">
                {formatNumber(stats.harus_po_count)}
              </p>
              <p className="text-xs text-rose-600 mt-1 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span>Stok ≤ ROP / ≤ {forecast?.parameters?.lead_time_months || 3} bln lead time</span>
              </p>
            </div>
          </div>

          {/* Card 3: Siap-siap PO */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Siap-siap PO</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 text-amber-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-amber-600 tracking-tight font-mono">
                {formatNumber(stats.siap_po_count)}
              </p>
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Stok ≤ {forecast?.parameters?.target_months || 5} bln ketahanan</span>
              </p>
            </div>
          </div>

          {/* Card 4: Stok Aman */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Stok Aman</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-emerald-600 tracking-tight font-mono">
                {formatNumber(stats.aman_count)}
              </p>
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Stok &gt; {forecast?.parameters?.target_months || 5} bln aman terkendali</span>
              </p>
            </div>
          </div>

          {/* Card 5: Rekomendasi Order */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Rekomendasi Order</span>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-[#0B132B] tracking-tight font-mono">
                {formatNumber(stats.total_recommended_po)}{' '}
                <span className="text-xs font-medium text-slate-500 font-sans">Unit</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>Total kebutuhan PO baru</span>
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Tab Navigation Pill Bar (Hanya untuk PIC & Super Admin) */}
        {!isDirekturOnly && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="inline-flex p-1 bg-slate-200/70 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('projection')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'projection'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
              <span>Analisis & Proyeksi Stok</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('proposals')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'proposals'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-slate-700">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <span>Pengajuan PO & Persetujuan Manajemen</span>
              {pendingProposalsCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                  {pendingProposalsCount} Menunggu
                </span>
              )}
            </button>
          </div>
        </div>
        )}

        {/* ================================================================== */}
        {/* TAB 1: ANALISIS & PROYEKSI STOK                                   */}
        {/* ================================================================== */}
        {!isDirekturOnly && activeTab === 'projection' && (
          <div className="space-y-4">
            {/* Parameter Forecasting Banner */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-blue-50 text-blue-700 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Parameter Forecasting & Formula PO
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sesuaikan target ketahanan dan lead time pabrik untuk simulasi otomatis
                  </p>
                </div>
              </div>

              <form onSubmit={handleApplyParameters} className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <label className="text-xs text-slate-600 font-medium">Target Ketahanan:</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={targetMonths}
                    onChange={(e) => setTargetMonths(Number(e.target.value))}
                    className="w-14 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 font-bold text-center focus:outline-none focus:border-[#0B132B]"
                  />
                  <span className="text-xs text-slate-500">Bulan</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <label className="text-xs text-slate-600 font-medium">Lead Time Pabrik:</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={leadTimeMonths}
                    onChange={(e) => setLeadTimeMonths(Number(e.target.value))}
                    className="w-14 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 font-bold text-center focus:outline-none focus:border-[#0B132B]"
                  />
                  <span className="text-xs text-slate-500">Bulan</span>
                </div>

                <button
                  type="submit"
                  disabled={isApplyingParams}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  {isApplyingParams ? (
                    <span>Menghitung...</span>
                  ) : (
                    <span>Terapkan Parameter</span>
                  )}
                </button>
              </form>
            </div>

            {/* Filter Status Pills & Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Status Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-[#0B132B] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({formatNumber(stats.total_items)})
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('harus_po')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'harus_po'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Harus PO ({formatNumber(stats.harus_po_count)})
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('siap_po')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'siap_po'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Siap-siap PO ({formatNumber(stats.siap_po_count)})
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('aman')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'aman'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Stok Aman ({formatNumber(stats.aman_count)})
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusFilterChange('tenang')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'tenang'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Tenang ({formatNumber(stats.tenang_count)})
                </button>
              </div>

              {/* Search Form */}
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative w-full sm:w-72">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari SKU atau nama item..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-[#0B132B] focus:bg-white transition-all"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  Cari
                </button>
              </form>
            </div>

            {/* Projection Data Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-3 w-10 text-center">No</th>
                      <th className="py-3 px-4 min-w-[220px]">SKU & Nama Barang</th>
                      <th className="py-3 px-3 text-right">Stok Fisik</th>
                      <th className="py-3 px-3 text-center">
                        <div>Riwayat Penjualan (3 Bln)</div>
                        <div className="text-[9px] font-normal text-slate-400 normal-case">
                          {forecast?.date_ranges?.m3_label} – {forecast?.date_ranges?.m1_label}
                        </div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        <div>Velocity</div>
                        <div className="text-[9px] font-normal text-slate-400 normal-case">Rata-rata/Bln</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        <div>Coverage</div>
                        <div className="text-[9px] font-normal text-slate-400 normal-case">Ketahanan Stok</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        <div>ROP</div>
                        <div className="text-[9px] font-normal text-slate-400 normal-case">Reorder Point</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        <div>Sisa Waktu</div>
                        <div className="text-[9px] font-normal text-slate-400 normal-case">Hingga PO</div>
                      </th>
                      <th className="py-3 px-3 text-right">
                        <div>Rekomendasi PO</div>
                        <div className="text-[9px] font-normal text-slate-400 normal-case">Target 5 Bln</div>
                      </th>
                      <th className="py-3 px-3 text-center">Status Urgensi</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-slate-400">
                          <p className="font-semibold text-slate-600">Tidak ada data proyeksi stok yang cocok.</p>
                          <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau filter status.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, idx) => {
                        const rowNum = perPage === -1 ? idx + 1 : (currentPage - 1) * perPage + idx + 1;
                        return (
                          <tr
                            key={row.item_code}
                            className="hover:bg-slate-50/80 transition-colors group"
                          >
                            {/* No */}
                            <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {rowNum}
                            </td>

                            {/* SKU & Nama */}
                            <td className="py-3 px-4">
                              <div className="font-bold font-mono text-slate-900 tracking-tight">
                                {row.item_code}
                              </div>
                              <div className="text-slate-500 text-[11px] truncate max-w-xs mt-0.5" title={row.item_name || ''}>
                                {row.item_name || '—'}
                              </div>
                              {row.active_po_number && (
                                <div className="mt-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                    PO Aktif: {row.active_po_number}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Stok Fisik */}
                            <td className="py-3 px-3 text-right">
                              <span className="font-bold font-mono text-slate-900 text-sm">
                                {formatNumber(row.total_stock)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">pcs</span>
                              <div className="text-[10px] text-slate-400">
                                G: {formatNumber(row.stock_g)} • A: {formatNumber(row.stock_a)}
                              </div>
                            </td>

                            {/* Riwayat Penjualan 3 Bulan */}
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                                <span title={forecast?.date_ranges?.m3_label}>{row.sales_m3}</span>
                                <span className="text-slate-300">/</span>
                                <span title={forecast?.date_ranges?.m2_label}>{row.sales_m2}</span>
                                <span className="text-slate-300">/</span>
                                <span title={forecast?.date_ranges?.m1_label}>{row.sales_m1}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Total: <strong className="text-slate-700 font-mono">{formatNumber(row.total_3m_sales)}</strong>
                              </div>
                            </td>

                            {/* Velocity */}
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                              {formatDecimal(row.monthly_velocity)}
                            </td>

                            {/* Coverage */}
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                              {row.stock_coverage_months !== null ? (
                                <span>{formatDecimal(row.stock_coverage_months)} <span className="text-[10px] font-normal text-slate-400">bln</span></span>
                              ) : (
                                <span className="text-slate-400 font-normal">—</span>
                              )}
                            </td>

                            {/* ROP */}
                            <td className="py-3 px-3 text-right font-mono text-slate-700">
                              {formatNumber(row.reorder_point)}
                            </td>

                            {/* Sisa Waktu Menuju PO */}
                            <td className="py-3 px-3 text-right font-mono">
                              {row.time_to_po_months !== null ? (
                                row.time_to_po_months <= 0 ? (
                                  <span className="font-bold text-rose-600">SEKARANG</span>
                                ) : (
                                  <span className={`font-semibold ${row.time_to_po_months <= 2 ? 'text-amber-600' : 'text-slate-700'}`}>
                                    {formatDecimal(row.time_to_po_months)} bln
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* Rekomendasi PO */}
                            <td className="py-3 px-3 text-right font-mono font-black text-sm">
                              {row.recommended_po_qty > 0 ? (
                                <span className="text-blue-700">{formatNumber(row.recommended_po_qty)}</span>
                              ) : (
                                <span className="text-slate-400 font-normal">0</span>
                              )}
                            </td>

                            {/* Status Urgensi Badge */}
                            <td className="py-3 px-3 text-center">
                              {row.urgency_status === 'harus_po' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                  Harus PO
                                </span>
                              )}
                              {row.urgency_status === 'siap_po' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  Siap-siap PO
                                </span>
                              )}
                              {row.urgency_status === 'aman' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Stok Aman
                                </span>
                              )}
                              {row.urgency_status === 'tenang' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  Tenang
                                </span>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => openProposeModal(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap active:scale-98"
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

              {/* Table Footer / Pagination */}
              <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span>Menampilkan</span>
                  <select
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 font-semibold focus:outline-none focus:border-[#0B132B]"
                  >
                    <option value={25}>25 baris</option>
                    <option value={50}>50 baris</option>
                    <option value={100}>100 baris</option>
                    <option value={-1}>Semua baris</option>
                  </select>
                  <span>dari <strong>{formatNumber(totalRows)}</strong> SKU</span>
                </div>

                {perPage !== -1 && totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 cursor-pointer text-xs font-semibold"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-2 text-slate-600 font-mono">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 cursor-pointer text-xs font-semibold"
                    >
                      Selanjutnya
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: DAFTAR PENGAJUAN PO & PERSETUJUAN MANAJEMEN                 */}
        {/* ================================================================== */}
        {activeTab === 'proposals' && (
          <div className="space-y-4">
            {/* Filter Status Proposals */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    proposalStatusFilter === 'all'
                      ? 'bg-[#0B132B] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({proposals?.length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('pending_approval')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    proposalStatusFilter === 'pending_approval'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Menunggu Persetujuan ({pendingProposalsCount})
                </button>

                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('approved')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    proposalStatusFilter === 'approved'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Disetujui
                </button>

                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('rejected')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    proposalStatusFilter === 'rejected'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Ditolak
                </button>
              </div>

              {isManagement && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Mode Manajemen Aktif: Anda dapat Menyetujui atau Menolak PO
                </span>
              )}
            </div>

            {/* Proposals List (Card View — Jelas & Responsif di HP maupun Laptop) */}
            {filteredProposals.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-12 px-4 text-center text-slate-400 shadow-2xs">
                <p className="text-sm font-semibold text-slate-600">Belum ada pengajuan PO yang sesuai filter.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Pengajuan PO yang dikirim oleh PIC akan otomatis tampil di sini beserta rincian rata-rata keluar per bulan & kebutuhan stoknya.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredProposals.map((proposal) => {
                  const isPending = proposal.status === 'pending_approval';
                  const info = buildPoProjectionNarrative(proposal);

                  return (
                    <div
                      key={proposal.id}
                      className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5 transition-all ${
                        isPending
                          ? 'border-amber-200/90 ring-1 ring-amber-100'
                          : proposal.status === 'approved' || proposal.status === 'ordered'
                          ? 'border-emerald-200/80'
                          : 'border-rose-200/80'
                      }`}
                    >
                      {/* Baris 1: Header PO, Status, Pengaju & Gudang */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                            {proposal.po_number}
                          </span>
                          {proposal.status === 'pending_approval' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Menunggu Persetujuan
                            </span>
                          )}
                          {(proposal.status === 'approved' || proposal.status === 'ordered') && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Disetujui
                            </span>
                          )}
                          {proposal.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              Ditolak
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Gudang {proposal.warehouse}
                          </span>
                          {proposal.supplier_name && (
                            <span className="text-[11px] font-medium text-slate-600">
                              Pabrik: <strong className="text-slate-800">{proposal.supplier_name}</strong>
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          Diajukan <strong className="text-slate-800">{proposal.proposer?.name || 'PIC'}</strong> · {formatDateTime(proposal.created_at)}
                        </div>
                      </div>

                      {/* Baris 2: Nama Produk & SKU */}
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                          {proposal.product_name}
                        </h3>
                        <p className="font-mono text-xs text-slate-500 mt-0.5">SKU: {proposal.sku}</p>
                      </div>

                      {/* Baris 3: 4 Angka Proyeksi & Narasi Alasan Jelas */}
                      <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <div className="bg-white rounded-xl p-2.5 border border-slate-200/70">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rata-rata Keluar</p>
                            <p className="text-sm sm:text-base font-extrabold text-slate-900 font-mono mt-0.5">
                              {formatDecimal(info.velocity)} <span className="text-[11px] font-normal text-slate-500">pcs/bln</span>
                            </p>
                          </div>

                          <div className="bg-white rounded-xl p-2.5 border border-slate-200/70">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stok Saat Ini</p>
                            <p className="text-sm sm:text-base font-extrabold text-slate-900 font-mono mt-0.5">
                              {formatNumber(info.currentStock)} <span className="text-[11px] font-normal text-slate-500">pcs</span>
                            </p>
                            <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                              {info.velocity > 0 ? `Cukup ~${formatDecimal(info.coverage)} bln (habis ${info.stockoutMonth})` : 'Belum ada data keluar'}
                            </p>
                          </div>

                          <div className="bg-white rounded-xl p-2.5 border border-slate-200/70">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Target Stok ({info.targetMonth})
                            </p>
                            <p className="text-sm sm:text-base font-extrabold text-blue-700 font-mono mt-0.5">
                              {formatNumber(info.targetStock)} <span className="text-[11px] font-normal text-blue-600/80">pcs</span>
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Ketahanan {info.targetMonths} bulan
                            </p>
                          </div>

                          <div className="bg-[#0B132B] text-white rounded-xl p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Jumlah PO Diajukan</p>
                            <p className="text-sm sm:text-base font-black font-mono mt-0.5">
                              {formatNumber(proposal.proposed_qty)} <span className="text-[11px] font-normal text-slate-300">pcs</span>
                            </p>
                            <p className="text-[10px] text-slate-300 mt-0.5">
                              Rekomendasi sistem: {formatNumber(proposal.recommended_qty)} pcs
                            </p>
                          </div>
                        </div>

                        {/* Kalimat Alasan Jelas */}
                        <p className="text-xs text-slate-700 leading-relaxed bg-white rounded-lg px-3 py-2 border border-slate-200/70">
                          <strong className="text-slate-900">{proposal.proposer?.name || 'PIC'}</strong> mengajukan PO{' '}
                          <strong className="text-[#0B132B]">{formatNumber(proposal.proposed_qty)} pcs</strong> karena rata-rata keluar{' '}
                          <strong>{formatDecimal(info.velocity)} pcs/bulan</strong>. Stok saat ini (<strong>{formatNumber(info.currentStock)} pcs</strong>)
                          {info.velocity > 0 ? (
                            <>
                              {' '}diperkirakan cukup untuk <strong>{formatDecimal(info.coverage)} bulan</strong> (habis sekitar{' '}
                              <strong className="text-amber-700">{info.stockoutMonth}</strong>), sehingga sampai bulan{' '}
                              <strong className="text-blue-700">{info.targetMonth}</strong> ({info.targetMonths} bulan) harus tersedia stok{' '}
                              <strong>{formatNumber(info.targetStock)} pcs</strong>.
                            </>
                          ) : (
                            <> perlu ditambah sesuai kebutuhan operasional.</>
                          )}
                        </p>

                        {proposal.notes && (
                          <div className="text-xs text-slate-600 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">
                            <span className="font-bold text-blue-900">Catatan PIC:</span> {proposal.notes}
                          </div>
                        )}
                      </div>

                      {/* Baris 4: Aksi Manajemen / Status Tinjauan */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                        {proposal.reviewer ? (
                          <div className="text-xs text-slate-600">
                            Ditinjau oleh <strong className="text-slate-900">{proposal.reviewer.name}</strong> · {formatDateTime(proposal.reviewed_at)}
                            {proposal.status === 'rejected' && proposal.rejection_reason && (
                              <p className="text-rose-700 font-medium mt-1">
                                Alasan penolakan: &ldquo;{proposal.rejection_reason}&rdquo;
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400">
                            Menunggu keputusan Manajemen
                          </div>
                        )}

                        {isManagement && isPending && (
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => handleApproveProposal(proposal)}
                              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer active:scale-98"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              <span>Setujui PO</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openRejectModal(proposal)}
                              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer active:scale-98"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              <span>Tolak</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL: AJUKAN PO KE MANAJEMEN                                       */}
      {/* ==================================================================== */}
      {proposeModal.isOpen && proposeModal.row && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div
              className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 text-slate-900 animate-in fade-in zoom-in duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Ajukan Purchase Order (PO)</h3>
                    <p className="text-xs text-slate-500">Pengajuan akan diteruskan ke antrean Akun Manajemen</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProposeModal((p) => ({ ...p, isOpen: false }))}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Ringkasan Barang */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <span className="text-slate-500">Kode SKU:</span>
                  <span className="font-mono font-bold text-slate-900">{proposeModal.row.item_code}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-slate-500">Nama Barang:</span>
                  <span className="font-semibold text-slate-800 text-right max-w-xs">{proposeModal.row.item_name || '—'}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500">Stok Fisik Saat Ini:</span>
                  <span className="font-mono font-bold text-slate-900">{formatNumber(proposeModal.row.total_stock)} pcs</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Kecepatan Penjualan:</span>
                  <span className="font-mono font-bold text-slate-900">{formatDecimal(proposeModal.row.monthly_velocity)} pcs/bln</span>
                </div>
                <div className="flex justify-between items-center text-blue-700 pt-1 border-t border-slate-200/60 font-semibold">
                  <span>Rekomendasi Kebutuhan PO:</span>
                  <span className="font-mono font-black text-sm">{formatNumber(proposeModal.row.recommended_po_qty)} pcs</span>
                </div>
              </div>

              {/* Form Input */}
              <form onSubmit={submitProposeModal} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gudang Penerima <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={proposeModal.warehouse}
                    onChange={(e) => setProposeModal((p) => ({ ...p, warehouse: e.target.value as 'G' | 'A' }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0B132B] focus:bg-white"
                  >
                    <option value="G">Gudang G (Eceran / Pcs)</option>
                    <option value="A">Gudang A (Grosir / Lusin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pabrik / Supplier Tujuan <span className="text-slate-400 font-normal">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={proposeModal.supplierName}
                    onChange={(e) => setProposeModal((p) => ({ ...p, supplierName: e.target.value }))}
                    placeholder="Contoh: PT. Sumber Makmur Pabrik Sepatu"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0B132B] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jumlah Pesanan PO (Pcs) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={proposeModal.proposedQty || ''}
                    onChange={(e) => setProposeModal((p) => ({ ...p, proposedQty: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-base font-bold font-mono text-slate-900 focus:outline-none focus:border-[#0B132B] focus:bg-white"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Otomatis terisi kuantitas rekomendasi sistem, dapat disesuaikan.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan PIC untuk Manajemen <span className="text-slate-400 font-normal">(opsional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={proposeModal.notes}
                    onChange={(e) => setProposeModal((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Tulis alasan urgensi atau catatan khusus untuk manajemen..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0B132B] focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setProposeModal((p) => ({ ...p, isOpen: false }))}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={proposeModal.isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {proposeModal.isSubmitting ? (
                      <span>Mengirim Pengajuan...</span>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                        <span>Kirim Pengajuan ke Manajemen</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ==================================================================== */}
      {/* MODAL: TOLAK PENGAJUAN PO                                           */}
      {/* ==================================================================== */}
      {rejectModal.isOpen && rejectModal.proposal && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div
              className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 text-slate-900 animate-in fade-in zoom-in duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Tolak Pengajuan PO</h3>
                  <p className="text-xs text-slate-500">{rejectModal.proposal.po_number} • {rejectModal.proposal.sku}</p>
                </div>
              </div>

              <form onSubmit={submitRejectModal} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alasan Penolakan <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={rejectModal.reason}
                    onChange={(e) => setRejectModal((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="Contoh: Stok di gudang masih mencukupi untuk 2 bulan lagi, tunda pemesanan hingga tanggal..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-rose-500 focus:bg-white"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Alasan penolakan akan dapat dibaca langsung oleh PIC.</p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRejectModal((p) => ({ ...p, isOpen: false }))}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={rejectModal.isSubmitting}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {rejectModal.isSubmitting ? 'Menyimpan...' : 'Konfirmasi Tolak PO'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ==================================================================== */}
      {/* MODAL: DETAIL CATATAN / ALASAN                                       */}
      {/* ==================================================================== */}
      {notesModal.isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div
              className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">{notesModal.title}</h3>
                <button
                  type="button"
                  onClick={() => setNotesModal({ isOpen: false, title: '', content: '' })}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                {notesModal.content}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setNotesModal({ isOpen: false, title: '', content: '' })}
                  className="px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
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
