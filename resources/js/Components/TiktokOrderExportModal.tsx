import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Modal from '@/Components/Modal';

interface Props {
  show: boolean;
  onClose: () => void;
  carriers: string[];
  currentTab?: string;
  onExportSuccess?: () => void;
}

type DatePreset = 'today' | 'yesterday' | '7days' | '30days' | 'custom';

function formatDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TiktokOrderExportModal({
  show,
  onClose,
  carriers,
  currentTab = 'to_ship',
  onExportSuccess,
}: Props) {
  const todayStr = formatDateInput(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = formatDateInput(yesterdayDate);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysStr = formatDateInput(sevenDaysAgo);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const thirtyDaysStr = formatDateInput(thirtyDaysAgo);

  const [preset, setPreset] = useState<DatePreset>('today');
  const [dateFrom, setDateFrom] = useState<string>(todayStr);
  const [dateTo, setDateTo] = useState<string>(todayStr);
  const [statusTab, setStatusTab] = useState<string>(currentTab === 'to_ship' ? 'to_ship' : 'all');
  const [carrier, setCarrier] = useState<string>('all');
  const [dateType, setDateType] = useState<'created' | 'ship_by' | 'arranged'>('created');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handlePresetSelect = (p: DatePreset) => {
    setPreset(p);
    setError(null);
    if (p === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (p === 'yesterday') {
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (p === '7days') {
      setDateFrom(sevenDaysStr);
      setDateTo(todayStr);
    } else if (p === '30days') {
      setDateFrom(thirtyDaysStr);
      setDateTo(todayStr);
    }
  };

  const handleDownload = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        tab: statusTab,
        courier: carrier,
        date_type: dateType,
        date_from: dateFrom,
        date_to: dateTo,
      });

      const res = await fetch(`/tiktok-orders/export-data?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Gagal mengambil data pesanan dari server.');
      }

      const data = await res.json();

      if (!data.rows || data.rows.length === 0) {
        setError('Tidak ada data pesanan yang ditemukan pada filter dan rentang tanggal ini.');
        setIsExporting(false);
        return;
      }

      // 1. Bangun workbook Excel persis TikTok Seller Center (sheet: OrderSKUList dengan row 0 headers & row 1 descriptions)
      const wb = XLSX.utils.book_new();

      const sheetData = [data.headers, data.descriptions, ...data.rows];
      const wsOrderSKU = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, wsOrderSKU, 'OrderSKUList');

      // 2. Tulis workbook ke Blob format .xlsx
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // 3. Trigger Download otomatis di browser
      const fileName = data.file_name || `Untuk Dikirim pesanan-${todayStr}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // 4. Catat file ke Riwayat Download (/export-logs)
      try {
        const form = new FormData();
        form.append('file_name', fileName);
        form.append('module', 'tiktok_orders');
        form.append(
          'description',
          `Export ${data.total_orders} pesanan TikTok (${data.total_rows} baris item produk)`,
        );
        form.append('file', blob, fileName);

        const csrf =
          document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';

        await fetch('/export-logs', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrf,
          },
          credentials: 'same-origin',
          body: form,
        });
      } catch (logErr) {
        console.warn('Peringatan pencatatan riwayat export:', logErr);
      }

      onExportSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat mengekspor pesanan.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal show={show} onClose={onClose} title="Export Pesanan TikTok" maxWidth="xl">
      <div className="flex flex-col bg-white">
        {/* Modal Subheader Info */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-[#FE2C55]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              Format Resmi TikTok Seller Center (65 Kolom · Sheet: OrderSKUList)
            </p>
            <p className="text-[11px] text-slate-500">
              File hasil download sesuai dengan format asli TikTok Shop untuk proses cutoff dan arsip.
            </p>
          </div>
        </div>

        {/* Form Body */}
        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-4 w-4 shrink-0 mt-0.5 text-rose-600"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* 1. Filter Tab Status */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Status Pesanan
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { id: 'to_ship', label: 'Perlu Dikirim' },
                { id: 'all', label: 'Semua' },
                { id: 'shipped', label: 'Dikirim' },
                { id: 'completed', label: 'Selesai' },
                { id: 'cancelled', label: 'Dibatalkan' },
                { id: 'unpaid', label: 'Belum Bayar' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusTab(tab.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    statusTab === tab.id
                      ? 'border-[#FE2C55] bg-rose-50/60 text-[#FE2C55] shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Jenis Tanggal */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Berdasarkan Waktu
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'created', label: 'Waktu Pesanan Dibuat' },
                { id: 'ship_by', label: 'Batas Waktu Pengiriman' },
                { id: 'arranged', label: 'Waktu Pengiriman Diatur' },
              ].map((dt) => (
                <label
                  key={dt.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all ${
                    dateType === dt.id
                      ? 'border-[#FE2C55] bg-rose-50/40 text-slate-900 font-semibold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tiktok_date_type"
                    checked={dateType === dt.id}
                    onChange={() => setDateType(dt.id as any)}
                    className="text-[#FE2C55] focus:ring-[#FE2C55]"
                  />
                  <span>{dt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 3. Preset Rentang Waktu */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Rentang Waktu
              </label>
              <div className="flex items-center gap-1">
                {[
                  { id: 'today', label: 'Hari Ini' },
                  { id: 'yesterday', label: 'Kemarin' },
                  { id: '7days', label: '7 Hari' },
                  { id: '30days', label: '30 Hari' },
                  { id: 'custom', label: 'Kustom' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id as DatePreset)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-all ${
                      preset === p.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Tanggal From - To */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Dari</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPreset('custom');
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-[#FE2C55] focus:ring-1 focus:ring-[#FE2C55]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Sampai</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPreset('custom');
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-[#FE2C55] focus:ring-1 focus:ring-[#FE2C55]"
                />
              </div>
            </div>
          </div>

          {/* 4. Ekspedisi / Kurir */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Jasa Kirim / Ekspedisi
            </label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-[#FE2C55] focus:ring-1 focus:ring-[#FE2C55]"
            >
              <option value="all">Semua Jasa Kirim</option>
              {carriers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-[11px] text-slate-500">
            Export otomatis tercatat di <strong className="text-slate-700">Riwayat Download</strong>.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B132B] px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
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
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Mengekspor Data...</span>
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-4 w-4 text-[#FE2C55]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  <span>Download Excel (.xlsx)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
