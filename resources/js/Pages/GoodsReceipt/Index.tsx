import React, { useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import Modal from '../../Components/Modal';
import Pagination from '../../Components/Pagination';
import SkuSearchInput from '../../Components/SkuSearchInput';
import { PageProps } from '../../Types';
import * as XLSX from 'xlsx';
import { downloadWorkbook } from '../../Utils/exportExcel';

interface Product {
  id: number;
  sku: string;
  name: string;
  stock: number;
}

interface Warehouse {
  id: number;
  code: string;
  name: string;
}

type ReceiptStatus = 'pending' | 'approved' | 'rejected';

/** Satu baris SKU pada form pengajuan. */
interface SkuLine {
  sku: string;
  quantity: string;
}

interface Receipt {
  id: number;
  receipt_number: string;
  po_number: string | null;
  quantity: number;
  notes: string;
  status: ReceiptStatus;
  requested_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  product: { id: number; sku: string; name: string } | null;
  warehouse: { id: number; name: string } | null;
  requester: { id: number; name: string } | null;
  approver: { id: number; name: string } | null;
  rejecter: { id: number; name: string } | null;
}

interface Props {
  receipts: {
    data: Receipt[];
    links: { url: string | null; label: string; active: boolean }[];
    from: number;
    to: number;
    total: number;
  };
  filters: { search?: string; status?: string };
  products: Product[];
  warehouses: Warehouse[];
  canRequest: boolean;
  canApprove: boolean;
  pendingCount: number;
}

const fmtDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const STATUS_STYLE: Record<ReceiptStatus, { label: string; className: string }> = {
  pending:  { label: 'Menunggu Approval', className: 'bg-orange-50 border-orange-200 text-orange-700' },
  approved: { label: 'Disetujui',         className: 'bg-teal-50 border-teal-200 text-teal-700' },
  rejected: { label: 'Ditolak',           className: 'bg-rose-50 border-rose-200 text-rose-700' },
};

const inputClass =
  'w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all';

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function GoodsReceiptIndex({
  receipts, filters, products, warehouses, canRequest, canApprove, pendingCount,
}: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [rejectTarget, setRejectTarget] = useState<Receipt | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [lines, setLines] = useState<SkuLine[]>([{ sku: '', quantity: '' }]);

  const { data, setData, post, processing, errors, reset } = useForm({
    po_number: '',
    warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '',
    notes: '',
    items: [] as { product_id: number; quantity: number }[],
  });

  /** Cocokkan SKU tanpa peduli huruf besar/kecil maupun spasi berlebih. */
  const findProductBySku = useMemo(() => {
    const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
    return (sku: string): Product | undefined => bySku.get(String(sku ?? '').trim().toLowerCase());
  }, [products]);

  function addLine() {
    setLines([...lines, { sku: '', quantity: '' }]);
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index));
  }

  function updateLine(index: number, key: keyof SkuLine, value: string) {
    const updated = [...lines];
    updated[index] = { ...updated[index], [key]: value };
    setLines(updated);
  }

  /** Unduh template Excel berisi kolom SKU dan QTY. */
  function handleDownloadTemplate() {
    const rows = [
      ['SKU', 'QTY'],
      ...products.slice(0, 3).map((p) => [p.sku, 1]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 24 }, { wch: 10 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Barang Masuk');
    downloadWorkbook(workbook, 'Template_Barang_Masuk.xlsx', 'Barang Masuk', 'Template import');
  }

  /** Baca file Excel lalu isi daftar SKU. Baris tanpa SKU dilewati. */
  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportInfo(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!raw || raw.length === 0) {
          setImportError('File Excel kosong atau tidak dapat dibaca.');
          return;
        }

        const startIndex = String(raw[0]?.[0] ?? '').trim().toLowerCase() === 'sku' ? 1 : 0;

        const parsed: SkuLine[] = [];
        const unknown: string[] = [];

        for (let i = startIndex; i < raw.length; i++) {
          const sku = String(raw[i]?.[0] ?? '').trim();
          if (sku === '') continue;

          if (!findProductBySku(sku)) unknown.push(sku);

          const qty = Math.max(1, parseInt(String(raw[i]?.[1] ?? 1), 10) || 1);
          parsed.push({ sku, quantity: String(qty) });
        }

        if (parsed.length === 0) {
          setImportError('Tidak ada baris berisi SKU pada file ini.');
          return;
        }

        setLines(parsed);
        setImportInfo(
          unknown.length > 0
            ? `${parsed.length} baris dimuat. SKU tidak dikenal: ${unknown.join(', ')} — perbaiki dulu sebelum mengirim.`
            : `${parsed.length} baris berhasil dimuat dari Excel.`
        );
      } catch (err: any) {
        setImportError('Gagal membaca file Excel: ' + (err?.message ?? err));
      }
    };

    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function applyFilter(next?: { search?: string; status?: string }) {
    router.get('/barang-masuk', {
      search: next?.search ?? search,
      status: next?.status ?? status,
    }, { preserveState: true, replace: true });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setImportError(null);

    const filled = lines.filter((line) => line.sku.trim() !== '');

    if (filled.length === 0) {
      setImportError('Isi minimal satu SKU sebelum mengirim pengajuan.');
      return;
    }

    const unknown = filled.filter((line) => !findProductBySku(line.sku));
    if (unknown.length > 0) {
      setImportError(`SKU tidak dikenal: ${unknown.map((l) => l.sku).join(', ')}.`);
      return;
    }

    const items = filled.map((line) => ({
      product_id: findProductBySku(line.sku)!.id,
      quantity: Math.max(1, Number(line.quantity) || 1),
    }));

    // useForm menyimpan state secara asinkron, jadi item dikirim langsung
    // lewat transform agar baris terbaru pasti ikut terkirim.
    router.post('/barang-masuk', { ...data, items }, {
      preserveScroll: true,
      onSuccess: () => {
        setLines([{ sku: '', quantity: '' }]);
        setImportInfo(null);
        reset('po_number', 'notes');
      },
    });
  }

  function approve(receipt: Receipt) {
    setProcessingId(receipt.id);
    router.post(`/barang-masuk/${receipt.id}/approve`, {}, {
      preserveScroll: true,
      onFinish: () => setProcessingId(null),
    });
  }

  function confirmReject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 3) {
      setRejectError('Alasan penolakan minimal 3 karakter.');
      return;
    }

    setProcessingId(rejectTarget.id);
    router.post(`/barang-masuk/${rejectTarget.id}/reject`, { rejection_reason: rejectReason }, {
      preserveScroll: true,
      onSuccess: () => {
        setRejectTarget(null);
        setRejectReason('');
        setRejectError(null);
      },
      onFinish: () => setProcessingId(null),
    });
  }

  return (
    <AppLayout>
      <Head title="Barang Masuk" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Barang Masuk</h1>
            <p className="text-gray-500 text-xs mt-1">
              Pengajuan penambahan stok — stok bertambah setelah disetujui PIC Gudang
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {pendingCount} menunggu approval
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form pengajuan */}
          {canRequest && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden h-fit">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">Ajukan Barang Masuk</h2>
              </div>

              <form onSubmit={submit} className="p-6 space-y-4">
                <div>
                  <label htmlFor="po_number" className={labelClass}>Nomor PO</label>
                  <input
                    id="po_number"
                    type="text"
                    value={data.po_number}
                    onChange={(e) => setData('po_number', e.target.value)}
                    placeholder="Mis. PO-202608-0001 (opsional)"
                    autoComplete="off"
                    className={inputClass}
                  />
                  {errors.po_number && <p className="text-rose-500 text-xs mt-1">{errors.po_number}</p>}
                </div>

                <div>
                  <label htmlFor="warehouse_id" className={labelClass}>Gudang</label>
                  <select
                    id="warehouse_id"
                    value={data.warehouse_id}
                    onChange={(e) => setData('warehouse_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Pilih Gudang --</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        [{warehouse.code}] {warehouse.name}
                      </option>
                    ))}
                  </select>
                  {errors.warehouse_id && <p className="text-rose-500 text-xs mt-1">{errors.warehouse_id}</p>}
                </div>

                {/* Daftar SKU — bisa lebih dari satu dalam sekali pengajuan */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-gray-500">
                      Daftar SKU <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-[11px] font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Template
                      </button>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-300 text-teal-700 text-[11px] font-semibold hover:bg-teal-100 hover:border-teal-400 transition-all cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Import
                        <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
                      </label>
                    </div>
                  </div>

                  {importError && (
                    <p className="text-rose-600 text-[11px] bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{importError}</p>
                  )}
                  {importInfo && (
                    <p className="text-gray-600 text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">{importInfo}</p>
                  )}

                  {lines.map((line, index) => {
                    const matched = findProductBySku(line.sku);
                    return (
                      <div key={index} className="flex gap-2 items-start">
                        <div className="flex-1">
                          <SkuSearchInput
                            value={line.sku}
                            onChange={(sku) => updateLine(index, 'sku', sku)}
                            options={products}
                            invalid={line.sku.trim() !== '' && !matched}
                            className="w-full px-3 py-2 rounded-xl border bg-gray-50 border-gray-300 text-gray-800 text-xs font-mono focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                          />
                          {line.sku.trim() !== '' && !matched && (
                            <p className="text-rose-500 text-[10px] mt-0.5">SKU tidak ditemukan</p>
                          )}
                          {matched && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Stok {matched.stock}
                              {Number(line.quantity) > 0 && (
                                <> &rarr; <span className="text-teal-600 font-semibold">{matched.stock + Number(line.quantity)}</span></>
                              )}
                            </p>
                          )}
                        </div>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className="w-20 px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-xs text-center font-mono focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                        />
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            title="Hapus baris"
                            className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all shrink-0"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={addLine}
                    className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:text-teal-700 hover:border-teal-300 text-[11px] font-semibold transition-all"
                  >
                    + Tambah SKU
                  </button>

                  {errors.items && <p className="text-rose-500 text-xs mt-1">{errors.items}</p>}
                </div>

                <div>
                  <label htmlFor="notes" className={labelClass}>
                    Keterangan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="notes"
                    type="text"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                    placeholder="Mis. stok awal, retur customer, kiriman pabrik"
                    className={inputClass}
                  />
                  {errors.notes && <p className="text-rose-500 text-xs mt-1">{errors.notes}</p>}
                </div>

                <button
                  type="submit"
                  disabled={processing}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  {processing ? 'Mengirim...' : 'Ajukan Barang Masuk'}
                </button>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Stok belum bertambah saat pengajuan dikirim. PIC Gudang akan memeriksa dan
                  menyetujuinya terlebih dahulu. Penerimaan barang dari Purchase Order tidak perlu
                  dicatat di sini — stoknya bertambah otomatis saat penerimaan PO.
                </p>
              </form>
            </div>
          )}

          {/* Daftar pengajuan */}
          <div className={`${canRequest ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-4`}>
            <div className="bg-white border border-gray-300 rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                    placeholder="Cari nomor, SKU, atau nama produk..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                  </svg>
                </div>

                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); applyFilter({ status: e.target.value }); }}
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">Semua Status</option>
                  <option value="pending">Menunggu Approval</option>
                  <option value="approved">Disetujui</option>
                  <option value="rejected">Ditolak</option>
                </select>

                <button
                  type="button"
                  onClick={() => applyFilter()}
                  className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
                >
                  Cari
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                      <th className="px-5 py-3.5">Nomor / Waktu</th>
                      <th className="px-5 py-3.5">Produk</th>
                      <th className="px-5 py-3.5 text-center">Qty</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Keterangan</th>
                      {canApprove && <th className="px-5 py-3.5 text-center">Aksi</th>}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 text-sm">
                    {receipts.data.length === 0 ? (
                      <tr>
                        <td colSpan={canApprove ? 6 : 5} className="px-5 py-14 text-center text-gray-400">
                          Belum ada pengajuan barang masuk.
                        </td>
                      </tr>
                    ) : (
                      receipts.data.map((receipt) => {
                        const badge = STATUS_STYLE[receipt.status];
                        const busy = processingId === receipt.id;

                        return (
                          <tr key={receipt.id} className="hover:bg-teal-50/60 transition-colors">
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <p className="text-xs font-mono font-bold text-gray-800">{receipt.receipt_number}</p>
                              {receipt.po_number && (
                                <p className="text-[10px] font-mono text-teal-700">PO: {receipt.po_number}</p>
                              )}
                              <p className="text-[10px] text-gray-400">{fmtDateTime(receipt.requested_at)}</p>
                              <p className="text-[10px] text-gray-400">{receipt.requester?.name ?? '—'}</p>
                            </td>

                            <td className="px-5 py-3.5">
                              <p className="text-xs font-semibold text-gray-800">{receipt.product?.name ?? '—'}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{receipt.product?.sku ?? '—'}</p>
                              <p className="text-[10px] text-gray-400">{receipt.warehouse?.name ?? 'Tanpa gudang'}</p>
                            </td>

                            <td className="px-5 py-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold font-mono">
                                +{receipt.quantity}
                              </span>
                            </td>

                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${badge.className}`}>
                                {badge.label}
                              </span>
                              {receipt.status === 'approved' && (
                                <p className="text-[10px] text-gray-400 mt-1">
                                  oleh {receipt.approver?.name ?? '—'}
                                </p>
                              )}
                              {receipt.status === 'rejected' && (
                                <p className="text-[10px] text-gray-400 mt-1">
                                  oleh {receipt.rejecter?.name ?? '—'}
                                </p>
                              )}
                            </td>

                            <td className="px-5 py-3.5 text-xs text-gray-600 max-w-xs">
                              <p className="truncate" title={receipt.notes}>{receipt.notes}</p>
                              {receipt.rejection_reason && (
                                <p className="text-[10px] text-rose-600 mt-1 truncate" title={receipt.rejection_reason}>
                                  Alasan: {receipt.rejection_reason}
                                </p>
                              )}
                            </td>

                            {canApprove && (
                              <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                {receipt.status === 'pending' ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => approve(receipt)}
                                      disabled={busy}
                                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold transition-all disabled:opacity-50"
                                    >
                                      Setujui
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setRejectTarget(receipt); setRejectReason(''); setRejectError(null); }}
                                      disabled={busy}
                                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 text-[11px] font-semibold transition-all disabled:opacity-50"
                                    >
                                      Tolak
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-gray-400">Selesai</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-[11px] text-gray-400">
                  Menampilkan {receipts.from ?? 0}–{receipts.to ?? 0} dari {receipts.total} pengajuan
                </p>
                <Pagination links={receipts.links} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alasan penolakan */}
      <Modal
        show={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title={`Tolak ${rejectTarget?.receipt_number ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Stok tidak akan berubah. Tuliskan alasannya agar pengaju tahu apa yang perlu diperbaiki.
          </p>
          <div>
            <label className={labelClass}>
              Alasan Penolakan <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => { setRejectReason(e.target.value); setRejectError(null); }}
              placeholder="Mis. jumlah tidak sesuai fisik barang"
              className={inputClass}
              autoFocus
            />
            {rejectError && <p className="text-rose-500 text-xs mt-1">{rejectError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="px-4 py-2 rounded-xl bg-white text-gray-600 border border-gray-300 text-sm font-semibold hover:bg-gray-50 transition-all"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={confirmReject}
              disabled={processingId !== null}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
            >
              Tolak Pengajuan
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
