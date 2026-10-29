import React, { useState, useEffect } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import AppLayout from '../../Layouts/AppLayout';

interface CutOffOrder {
  id: number;
  row_no: string | null;
  order_date: string | null;
  channel: string;
  order_number: string;
  jl_number: string | null;
  buyer_username: string | null;
  shipping_courier: string | null;
  sku_utama: string | null;
  sku_pengganti: string | null;
  product_name: string | null;
  qty: number;
  recheck_qty: number | null;
  package_count: string | null;
  info_gudang: string | null;
  order_status: string | null;
  keterangan_solutif: string | null;
  est_net_income: number | string | null;
  marketplace_net_payout: number | string | null;
  sheet_dpp: string | null;
  dpp_number: string | null;
}

interface PaginationLinks {
  url: string | null;
  label: string;
  active: boolean;
}

interface Props {
  orders: {
    data: CutOffOrder[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number;
    to: number;
    links: PaginationLinks[];
  };
  filters: {
    search?: string;
    channel?: string;
    info_gudang?: string;
    order_status?: string;
    dpp_status?: string;
    shipping_courier?: string;
    date_from?: string;
    date_to?: string;
    per_page?: string;
  };
  summary: {
    total_orders: number;
    total_oos: number;
    total_rj: number;
    total_has_dpp: number;
    total_est_income: number;
    total_net_payout: number;
  };
  channels: { name: string; count: number }[];
  couriers?: { name: string; count: number }[];
}

function formatRupiah(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const raw = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
    const parts = raw.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const day = parseInt(parts[2], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0];
      return `${day} ${months[monthIdx] || parts[1]} ${year}`;
    }
    return raw;
  } catch {
    return String(dateStr);
  }
}

export default function CutOffIndex({ orders, filters, summary, channels, couriers = [] }: Props) {
  const { auth } = usePage<any>().props;
  const isManagement = auth?.user?.role?.name === 'Management';
  const canManage = !isManagement;

  const [search, setSearch] = useState(filters.search ?? '');
  const [selectedChannel, setSelectedChannel] = useState(filters.channel ?? 'all');
  const [selectedInfo, setSelectedInfo] = useState(filters.info_gudang ?? 'all');
  const [selectedStatus, setSelectedStatus] = useState(filters.order_status ?? 'all');
  const [selectedDpp, setSelectedDpp] = useState(filters.dpp_status ?? 'all');
  const [selectedCourier, setSelectedCourier] = useState(filters.shipping_courier ?? 'all');
  
  // Modal Edit Order State
  const [editingOrder, setEditingOrder] = useState<CutOffOrder | null>(null);

  const editForm = useForm({
    info_gudang: '',
    sku_pengganti: '',
    shipping_courier: '',
    keterangan_solutif: '',
    order_status: '',
    dpp_number: '',
    marketplace_net_payout: '',
    recheck_qty: '',
  });

  function openEditModal(order: CutOffOrder) {
    setEditingOrder(order);
    editForm.setData({
      info_gudang: order.info_gudang ?? '',
      sku_pengganti: order.sku_pengganti ?? '',
      shipping_courier: order.shipping_courier ?? '',
      keterangan_solutif: order.keterangan_solutif ?? '',
      order_status: order.order_status ?? '',
      dpp_number: order.dpp_number ?? '',
      marketplace_net_payout: order.marketplace_net_payout ? String(order.marketplace_net_payout) : '',
      recheck_qty: order.recheck_qty !== null ? String(order.recheck_qty) : '',
    });
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;

    editForm.put(`/cut-off-orders/${editingOrder.id}`, {
      preserveScroll: true,
      onSuccess: () => setEditingOrder(null),
    });
  }

  // Modal Create Manual
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const createForm = useForm({
    order_date: new Date().toISOString().split('T')[0],
    channel: 'TT',
    order_number: '',
    jl_number: '',
    buyer_username: '',
    shipping_courier: '',
    sku_utama: '',
    sku_pengganti: '',
    product_name: '',
    qty: 1,
    recheck_qty: '',
    package_count: '1',
    info_gudang: 'READY',
    order_status: 'Diproses',
    keterangan_solutif: '',
    est_net_income: '',
    marketplace_net_payout: '',
    dpp_number: '',
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createForm.post('/cut-off-orders', {
      preserveScroll: true,
      onSuccess: () => {
        setIsCreateModalOpen(false);
        createForm.reset();
      },
    });
  }

  // Modal Import Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  // Kunci scroll halaman saat modal aktif agar fokus tepat di viewport pengguna
  useEffect(() => {
    if (editingOrder || isCreateModalOpen || isImportModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [editingOrder, isCreateModalOpen, isImportModalOpen]);

  function handleExcelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length <= 1) {
          alert('Sheet Excel kosong.');
          setIsParsing(false);
          return;
        }

        const isFirstHeader = typeof rows[0][0] === 'string' && (
          rows[0][0].toLowerCase().includes('no') ||
          (rows[0][3] && String(rows[0][3]).toLowerCase().includes('pesanan'))
        );
        const startIdx = isFirstHeader ? 1 : 0;

        const parsed: any[] = [];
        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[3]) continue;

          let orderDate = '';
          if (typeof row[1] === 'number') {
            const d = new Date(Math.round((row[1] - 25569) * 86400 * 1000));
            if (!isNaN(d.getTime())) orderDate = d.toISOString().split('T')[0];
          } else if (typeof row[1] === 'string') {
            orderDate = row[1].trim();
          }

          parsed.push({
            order_date: orderDate || new Date().toISOString().split('T')[0],
            channel: String(row[2] || 'MANUAL').trim(),
            order_number: String(row[3]).trim(),
            jl_number: row[4] ? String(row[4]).trim() : null,
            buyer_username: row[5] ? String(row[5]).trim() : null,
            sku_utama: row[6] ? String(row[6]).trim() : null,
            sku_pengganti: row[7] ? String(row[7]).trim() : null,
            product_name: row[8] ? String(row[8]).trim() : null,
            qty: parseInt(row[9], 10) || 1,
            recheck_qty: row[10] ? parseInt(row[10], 10) : null,
            package_count: row[11] ? String(row[11]).trim() : null,
            info_gudang: row[12] ? String(row[12]).trim() : null,
            order_status: row[13] ? String(row[13]).trim() : null,
            keterangan_solutif: row[14] ? String(row[14]).trim() : null,
            est_net_income: row[15] ? parseFloat(String(row[15]).replace(/[^0-9.-]/g, '')) : null,
            marketplace_net_payout: row[16] ? parseFloat(String(row[16]).replace(/[^0-9.-]/g, '')) : null,
            sheet_dpp: row[17] ? String(row[17]).trim() : null,
            shipping_courier: row[18] ? String(row[18]).trim() : null,
            dpp_number: row[19] ? String(row[19]).trim() : null,
          });
        }

        setImportData(parsed);
        setImportFileName(file.name);
        setIsParsing(false);
      } catch (err) {
        console.error(err);
        alert('Gagal memproses file Excel. Pastikan format .xlsx valid.');
        setIsParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleImportSubmit() {
    if (importData.length === 0) return;
    setIsSubmittingImport(true);
    router.post(
      '/cut-off-orders/import',
      { rows: importData },
      {
        preserveScroll: true,
        onSuccess: () => {
          setIsImportModalOpen(false);
          setImportData([]);
          setImportFileName('');
          setIsSubmittingImport(false);
        },
        onError: () => {
          setIsSubmittingImport(false);
        },
      }
    );
  }

  function applyFilters(newFilters: Record<string, string>) {
    router.get(
      '/cut-off-orders',
      {
        ...filters,
        ...newFilters,
      },
      { preserveState: true, replace: true }
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters({ search });
  }

  return (
    <AppLayout>
      <Head title="Pesanan Cut Off 2026" />

      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Pesanan Cut Off 2026
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kelola {summary.total_orders.toLocaleString('id-ID')} pesanan multi-channel, monitoring gudang (OOS & substitusi SKU), dan tracking pelunasan DPP.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isManagement && (
              <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Akses Management (Read-Only)
              </span>
            )}

            {canManage && (
              <>
                {/* Upload Excel (.xlsx) */}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  Upload Excel (.xlsx)
                </button>

                {/* Integrasi Shopee (API) */}
                <Link
                  href="/marketplace/shopee"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs font-semibold transition-colors shadow-2xs"
                  title="Tarik pesanan otomatis via Shopee Open API v2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4 text-[#EE4D2D]">
                    <path d="M19.5 7.5h-2.25V6a5.25 5.25 0 00-10.5 0v1.5H4.5A2.25 2.25 0 002.25 9.75v10.5A2.25 2.25 0 004.5 22.5h15a2.25 2.25 0 002.25-2.25V9.75A2.25 2.25 0 0019.5 7.5zm-10.5-1.5a3.75 3.75 0 017.5 0v1.5h-7.5V6zm10.5 15H4.5V9.75h15V21z" />
                  </svg>
                  Tarik Shopee (API)
                </Link>

                {/* Tambah Pesanan Manual */}
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  + Tambah Pesanan
                </button>
              </>
            )}

            {/* Refresh */}
            <button
              onClick={() => router.reload()}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
              title="Refresh data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        {/* 4 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Pesanan</span>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-3">{summary.total_orders.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Data sheet Cut Off 2026</p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">OOS / Stok Habis</span>
              <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-rose-600 mt-3">{summary.total_oos.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Butuh SKU Pengganti</p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Retur Jual (RJ)</span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </span>
            </div>
            <p className="text-2xl font-extrabold text-amber-600 mt-3">{summary.total_rj.toLocaleString('id-ID')}</p>
            <p className="text-xs text-slate-500 mt-1">Pesanan retur / kompensasi</p>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Est. Bersih</span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-900 mt-3 truncate">{formatRupiah(summary.total_est_income)}</p>
            <p className="text-xs text-slate-500 mt-1">{summary.total_has_dpp} pesanan cair (DPP)</p>
          </div>
        </div>

        {/* Filter Pills Channel / Toko */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => {
                setSelectedChannel('all');
                applyFilters({ channel: 'all' });
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedChannel === 'all'
                  ? 'bg-[#0B132B] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua Toko ({summary.total_orders.toLocaleString('id-ID')})
            </button>
            {channels.map((ch) => (
              <button
                key={ch.name}
                onClick={() => {
                  setSelectedChannel(ch.name);
                  applyFilters({ channel: ch.name });
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedChannel === ch.name
                    ? 'bg-[#0B132B] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {ch.name} ({ch.count.toLocaleString('id-ID')})
              </button>
            ))}
          </div>

          {/* Search & Filter Dropdowns Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="sm:col-span-2 lg:col-span-3 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari No. Pesanan, JL, SKU, Pembeli..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-[#0B132B] focus:bg-white transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </form>

            {/* Filter Pengiriman / Kurir */}
            <div className="lg:col-span-3">
              <select
                value={selectedCourier}
                onChange={(e) => {
                  setSelectedCourier(e.target.value);
                  applyFilters({ shipping_courier: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Pengiriman</option>
                <optgroup label="Ekspedisi Populer">
                  <option value="SPX">Shopee Xpress (SPX)</option>
                  <option value="J&T">J&T Express</option>
                  <option value="SiCepat">SiCepat</option>
                  <option value="Anteraja">Anteraja</option>
                  <option value="ID Express">ID Express</option>
                  <option value="Ninja">Ninja Xpress</option>
                  <option value="Pos">Pos Indonesia</option>
                </optgroup>
                {couriers.length > 0 && (
                  <optgroup label="Layanan Kurir Lengkap">
                    {couriers.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.count.toLocaleString('id-ID')})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Filter Info Gudang */}
            <div className="lg:col-span-2">
              <select
                value={selectedInfo}
                onChange={(e) => {
                  setSelectedInfo(e.target.value);
                  applyFilters({ info_gudang: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Info Gudang</option>
                <option value="oos">OOS (Habis / Perlu Solusi)</option>
                <option value="STICKER">STICKER</option>
                <option value="GIFT">GIFT / HADIAH</option>
                <option value="BATAL">BATAL</option>
              </select>
            </div>

            {/* Filter Status Pesanan */}
            <div className="lg:col-span-2">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  applyFilters({ order_status: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua Status Pesanan</option>
                <option value="selesai">Transaksi Selesai</option>
                <option value="rj">Retur Jual (RJ)</option>
                <option value="batal">Dibatalkan</option>
              </select>
            </div>

            {/* Filter Status DPP */}
            <div className="lg:col-span-2">
              <select
                value={selectedDpp}
                onChange={(e) => {
                  setSelectedDpp(e.target.value);
                  applyFilters({ dpp_status: e.target.value });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#0B132B]"
              >
                <option value="all">Semua DPP</option>
                <option value="has_dpp">Ada No. DPP</option>
                <option value="no_dpp">Belum DPP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Toko & Tanggal</th>
                  <th className="py-3 px-4">Pesanan & Pengiriman</th>
                  <th className="py-3 px-4">Barang & SKU</th>
                  <th className="py-3 px-4">Gudang & Solusi</th>
                  <th className="py-3 px-4">Status Pesanan</th>
                  <th className="py-3 px-4">Keuangan & DPP</th>
                  {canManage && <th className="py-3 px-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.data.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="py-12 text-center text-slate-400">
                      Tidak ada data pesanan yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  orders.data.map((order) => {
                    const isOos = order.info_gudang && order.info_gudang.includes('OOS');
                    const isRj = order.order_status && (order.order_status.includes('RJ') || order.order_status.includes('Retur'));

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Toko & Tanggal */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-block px-2.5 py-1 rounded-md bg-[#0B132B] text-white font-bold text-[10px] tracking-wide mb-1">
                            {order.channel}
                          </span>
                          <p className="text-slate-800 text-xs font-semibold">
                            {formatDate(order.order_date)}
                          </p>
                          {order.row_no && (
                            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">Row #{order.row_no}</span>
                          )}
                        </td>

                        {/* Pesanan & Pengiriman */}
                        <td className="py-3.5 px-4 font-mono max-w-[240px]">
                          <p className="font-bold text-slate-900 hover:text-blue-600 transition-colors cursor-pointer select-all truncate" title={order.order_number}>
                            {order.order_number}
                          </p>
                          {order.jl_number && (
                            <p className="text-blue-700 font-semibold text-[11px] mt-0.5 truncate" title={order.jl_number}>
                              {order.jl_number}
                            </p>
                          )}
                          {order.buyer_username && (
                            <p className="text-slate-500 font-sans text-[11px] truncate mt-0.5" title={order.buyer_username}>
                              @{order.buyer_username}
                            </p>
                          )}

                          {/* Ekspedisi / Pengiriman Badge */}
                          {order.shipping_courier ? (
                            <div
                              className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-sans text-blue-900 bg-blue-50 border border-blue-200/80 rounded-md px-2 py-0.5 max-w-[220px] truncate"
                              title={`Pengiriman: ${order.shipping_courier}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-blue-700 shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h.375c.621 0 1.125-.504 1.125-1.125V11.25c0-.621-.504-1.125-1.125-1.125h-1.5M14.25 5.25v9.75m0 0h-6" />
                              </svg>
                              <span className="truncate font-medium">{order.shipping_courier}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-sans text-[10px] block mt-1">— Kurir belum ada</span>
                          )}
                        </td>

                        {/* SKU & QTY */}
                        <td className="py-3.5 px-4 max-w-[260px]">
                          <p className="font-semibold text-slate-900 truncate" title={order.sku_utama ?? ''}>
                            {order.sku_utama ?? '—'}
                          </p>
                          {order.sku_pengganti && (
                            <p className="text-emerald-700 font-semibold text-[11px] mt-0.5 truncate" title={order.sku_pengganti}>
                              ↳ Ganti: {order.sku_pengganti}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span>QTY: <strong className="text-slate-900">{order.qty}</strong></span>
                            {order.recheck_qty !== null && (
                              <span className="text-emerald-600 font-medium">Recheck: {order.recheck_qty}</span>
                            )}
                          </div>
                        </td>

                        {/* Gudang & Solusi */}
                        <td className="py-3.5 px-4">
                          {order.info_gudang ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isOos
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {order.info_gudang}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}

                          {order.keterangan_solutif && (
                            <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 max-w-[180px]" title={order.keterangan_solutif}>
                              {order.keterangan_solutif}
                            </p>
                          )}
                        </td>

                        {/* Status Pesanan */}
                        <td className="py-3.5 px-4">
                          {order.order_status ? (
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                isRj
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : order.order_status.toLowerCase().includes('selesai')
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {order.order_status}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Keuangan & DPP */}
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-900">
                            {formatRupiah(order.est_net_income)}
                          </p>
                          {order.dpp_number ? (
                            <span className="inline-block mt-1 font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {order.dpp_number}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 block mt-1">Belum DPP</span>
                          )}
                        </td>

                        {/* Aksi */}
                        {canManage && (
                          <td className="py-3.5 px-3 text-center">
                            <button
                              onClick={() => openEditModal(order)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-[#0B132B] transition-all border border-slate-200"
                              title="Edit info pesanan / solusi gudang"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50">
            <span className="text-slate-500">
              Menampilkan {orders.from ?? 0}–{orders.to ?? 0} dari {orders.total.toLocaleString('id-ID')} pesanan
            </span>

            <div className="flex items-center gap-1">
              {orders.links.map((link, idx) => {
                if (!link.url) {
                  return (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-400 bg-white cursor-not-allowed select-none"
                      dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                  );
                }

                return (
                  <button
                    key={idx}
                    onClick={() => router.get(link.url!, {}, { preserveState: true })}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      link.active
                        ? 'bg-[#0B132B] text-white border border-[#0B132B]'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Quick Edit Order */}
      {editingOrder && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setEditingOrder(null)}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all animate-scale-up space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Edit Informasi Pesanan</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">#{editingOrder.order_number}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Status Gudang (INFO GDG)</label>
                  <input
                    type="text"
                    value={editForm.data.info_gudang}
                    onChange={(e) => editForm.setData('info_gudang', e.target.value)}
                    placeholder="Misal: OOS, READY, STICKER..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">SKU Pengganti (Jika OOS)</label>
                  <input
                    type="text"
                    value={editForm.data.sku_pengganti}
                    onChange={(e) => editForm.setData('sku_pengganti', e.target.value)}
                    placeholder="Masukkan SKU pengganti..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Ekspedisi / Jasa Pengiriman</label>
                  <input
                    type="text"
                    value={editForm.data.shipping_courier}
                    onChange={(e) => editForm.setData('shipping_courier', e.target.value)}
                    placeholder="Misal: Reguler (Cashless)-J&T Express, SPX Hemat..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Keterangan Solutif</label>
                  <textarea
                    value={editForm.data.keterangan_solutif}
                    onChange={(e) => editForm.setData('keterangan_solutif', e.target.value)}
                    placeholder="Catatan penanganan retur, denda, atau ganti ukuran..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Pesanan</label>
                    <input
                      type="text"
                      value={editForm.data.order_status}
                      onChange={(e) => editForm.setData('order_status', e.target.value)}
                      placeholder="Transaksi Selesai, RJ/..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. DPP (Pencairan)</label>
                    <input
                      type="text"
                      value={editForm.data.dpp_number}
                      onChange={(e) => editForm.setData('dpp_number', e.target.value)}
                      placeholder="DPP/000..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={editForm.processing}
                    className="px-4 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50"
                  >
                    {editForm.processing ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal 1: Tambah Pesanan Manual */}
      {isCreateModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all animate-scale-up space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Tambah Pesanan Cut Off Baru</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Input data pesanan baru secara manual ke database</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Toko / Channel */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Toko / Channel *</label>
                    <input
                      type="text"
                      required
                      value={createForm.data.channel}
                      onChange={(e) => createForm.setData('channel', e.target.value)}
                      placeholder="Misal: TT, SP, LAZ..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Tanggal Pesanan */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Tanggal Pesanan</label>
                    <input
                      type="date"
                      value={createForm.data.order_date}
                      onChange={(e) => createForm.setData('order_date', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* No. Pesanan */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. Pesanan *</label>
                    <input
                      type="text"
                      required
                      value={createForm.data.order_number}
                      onChange={(e) => createForm.setData('order_number', e.target.value)}
                      placeholder="Contoh: 57900123891..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* No. JL */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">No. JL</label>
                    <input
                      type="text"
                      value={createForm.data.jl_number}
                      onChange={(e) => createForm.setData('jl_number', e.target.value)}
                      placeholder="No. JL (opsional)..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Username Pembeli */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Username Pembeli</label>
                    <input
                      type="text"
                      value={createForm.data.buyer_username}
                      onChange={(e) => createForm.setData('buyer_username', e.target.value)}
                      placeholder="Nama / user pembeli..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Kurir / Jasa Pengiriman */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Jasa Pengiriman / Kurir</label>
                    <input
                      type="text"
                      value={createForm.data.shipping_courier}
                      onChange={(e) => createForm.setData('shipping_courier', e.target.value)}
                      placeholder="SPX, J&T Express, Anteraja..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* SKU Utama */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">SKU Utama</label>
                    <input
                      type="text"
                      value={createForm.data.sku_utama}
                      onChange={(e) => createForm.setData('sku_utama', e.target.value)}
                      placeholder="SKU produk..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* SKU Pengganti */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">SKU Pengganti (Jika OOS)</label>
                    <input
                      type="text"
                      value={createForm.data.sku_pengganti}
                      onChange={(e) => createForm.setData('sku_pengganti', e.target.value)}
                      placeholder="SKU ganti jika ada..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Qty */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Jumlah (QTY) *</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={createForm.data.qty}
                      onChange={(e) => createForm.setData('qty', parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                {/* Nama Barang */}
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Nama Barang / Deskripsi</label>
                  <input
                    type="text"
                    value={createForm.data.product_name}
                    onChange={(e) => createForm.setData('product_name', e.target.value)}
                    placeholder="Nama barang atau catatan ukuran..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Info Gudang */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Info Gudang</label>
                    <input
                      type="text"
                      value={createForm.data.info_gudang}
                      onChange={(e) => createForm.setData('info_gudang', e.target.value)}
                      placeholder="READY, OOS, STICKER..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Status Pesanan */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Pesanan</label>
                    <input
                      type="text"
                      value={createForm.data.order_status}
                      onChange={(e) => createForm.setData('order_status', e.target.value)}
                      placeholder="Diproses, Selesai, RJ..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>

                  {/* Est Net Income */}
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Est. Pendapatan Bersih (Rp)</label>
                    <input
                      type="number"
                      value={createForm.data.est_net_income}
                      onChange={(e) => createForm.setData('est_net_income', e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Keterangan Solutif</label>
                  <textarea
                    value={createForm.data.keterangan_solutif}
                    onChange={(e) => createForm.setData('keterangan_solutif', e.target.value)}
                    placeholder="Catatan penanganan atau keterangan gudang..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#0B132B]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createForm.processing}
                    className="px-5 py-2 rounded-xl bg-[#0B132B] hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50"
                  >
                    {createForm.processing ? 'Menyimpan...' : 'Simpan Pesanan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal 2: Upload & Import Excel (.xlsx) */}
      {isImportModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/60 backdrop-blur-xs"
          onClick={() => {
            setIsImportModalOpen(false);
            setImportData([]);
            setImportFileName('');
          }}
        >
          <div className="min-h-full flex items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-left my-8 transform transition-all animate-scale-up space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Import Data Pesanan dari Excel</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Unggah spreadsheet .xlsx / .xls format Cut Off 2026</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportData([]);
                    setImportFileName('');
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Dropzone / Upload area */}
              {importData.length === 0 ? (
                <div className="space-y-4">
                  <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleExcelFileChange}
                      className="hidden"
                    />
                    <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl group-hover:scale-110 transition-transform">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <p className="font-bold text-slate-800 text-sm mt-3">
                      {isParsing ? 'Membaca data spreadsheet...' : 'Klik untuk memilih file Excel'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Mendukung format .xlsx, .xls (Sheet Cut Off 20 kolom)
                    </p>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* File info card */}
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="p-2 bg-emerald-600 text-white rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-bold text-slate-900 text-xs truncate max-w-[280px]">{importFileName}</p>
                        <p className="text-emerald-700 font-semibold text-xs mt-0.5">
                          {importData.length.toLocaleString('id-ID')} pesanan siap diimpor
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportData([]);
                        setImportFileName('');
                      }}
                      className="text-xs text-slate-500 hover:text-rose-600 underline"
                    >
                      Ganti File
                    </button>
                  </div>

                  {/* Preview sample rows */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 uppercase">
                      Preview Data (3 Baris Pertama):
                    </div>
                    <div className="max-h-48 overflow-y-auto text-[11px] divide-y divide-slate-100">
                      {importData.slice(0, 3).map((r, i) => (
                        <div key={i} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <span className="font-bold text-slate-900">{r.order_number}</span>
                            <span className="ml-2 text-slate-500">[{r.channel}]</span>
                            <p className="text-slate-500 text-[10px] mt-0.5">{r.sku_utama ?? 'Tanpa SKU'} • Qty: {r.qty}</p>
                          </div>
                          <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                            {r.shipping_courier ?? 'Kurir -'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submit button */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportModalOpen(false);
                        setImportData([]);
                        setImportFileName('');
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSubmit}
                      disabled={isSubmittingImport}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50"
                    >
                      {isSubmittingImport ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Menyimpan ke Database...
                        </>
                      ) : (
                        `Mulai Simpan (${importData.length.toLocaleString('id-ID')} Data)`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </AppLayout>
  );
}
