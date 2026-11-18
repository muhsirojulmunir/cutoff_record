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

export default function ShopeeOrderExportModal({
  show,
  onClose,
  carriers,
  currentTab = 'all',
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

      const res = await fetch(`/shopee-orders/export-data?${params.toString()}`, {
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

      // 1. Bangun workbook Excel persis Shopee Seller Centre (2 sheet: orders & Advance Fulfilment)
      const wb = XLSX.utils.book_new();

      // Sheet 1: orders -
      const wsOrders = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
      XLSX.utils.book_append_sheet(wb, wsOrders, data.sheet_name || 'orders -');

      // Sheet 2: Advance Fulfilment
      const wsAdvance = XLSX.utils.aoa_to_sheet([data.advance_fulfilment_headers || []]);
      XLSX.utils.book_append_sheet(wb, wsAdvance, 'Advance Fulfilment');

      // 2. Tulis workbook ke Blob format .xlsx
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // 3. Trigger Download otomatis di browser
      const fileName = data.file_name || `Order.${statusTab}.${dateFrom}_${dateTo}.xlsx`;
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
        form.append('module', 'shopee_orders');
        form.append(
          'description',
          `Export ${data.total_orders} pesanan Shopee (${data.total_rows} baris item produk)`,
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
        console.warn('Peringatan pencatatan riwayat:', logErr);
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
    <Modal show={show} onClose={onClose} title="Export Pesanan Shopee" maxWidth="xl">
      <div className="flex flex-col bg-white">
        {/* Modal Subheader Info */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#EE4D2D]">
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
            <h4 className="text-xs font-bold text-slate-800">Unduh Format Resmi Shopee (.xlsx)</h4>
            <p className="text-[11px] text-slate-500">
              Format 49 kolom & 2 sheet identik dengan ekspor Shopee Seller Centre.
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
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

          {/* Preset Rentang Tanggal */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Pilihan Rentang Waktu
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { key: 'today', label: 'Hari Ini' },
                { key: 'yesterday', label: 'Kemarin' },
                { key: '7days', label: '7 Hari' },
                { key: '30days', label: '30 Hari' },
                { key: 'custom', label: 'Kustom' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handlePresetSelect(item.key as DatePreset)}
                  className={`cursor-pointer rounded-xl border py-2 text-xs font-semibold transition-all ${
                    preset === item.key
                      ? 'border-[#EE4D2D] bg-[#FFF5F2] text-[#EE4D2D]'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form Tanggal Dari & Sampai */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Tanggal Dari</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPreset('custom');
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 transition-colors focus:border-[#EE4D2D] focus:bg-white focus:outline-hidden"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Tanggal Sampai</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPreset('custom');
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 transition-colors focus:border-[#EE4D2D] focus:bg-white focus:outline-hidden"
              />
            </div>
          </div>

          {/* Acuan Tanggal */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Berdasarkan Waktu</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'created', label: 'Pesanan Dibuat' },
                { key: 'ship_by', label: 'Batas Kirim (Ship By)' },
                { key: 'arranged', label: 'Pengiriman Diatur' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setDateType(item.key as 'created' | 'ship_by' | 'arranged')}
                  className={`cursor-pointer rounded-xl border py-2 text-xs font-semibold transition-all ${
                    dateType === item.key
                      ? 'border-[#EE4D2D] bg-[#FFF5F2] text-[#EE4D2D]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status Pesanan */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Status Pesanan</label>
              <select
                value={statusTab}
                onChange={(e) => setStatusTab(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 transition-colors focus:border-[#EE4D2D] focus:outline-hidden"
              >
                <option value="all">Semua Status Pesanan</option>
                <option value="to_ship">Perlu Dikirim</option>
                <option value="shipped">Dikirim</option>
                <option value="completed">Selesai</option>
                <option value="cancelled">Dibatalkan / Pengembalian</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Jasa Kirim (Ekspedisi)</label>
              <select
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 transition-colors focus:border-[#EE4D2D] focus:outline-hidden"
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

          {/* Info Format Shopee */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-4 w-4 text-[#EE4D2D]"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <span>Format Ekspor 100% Identik Shopee</span>
            </div>
            <p className="mt-1 leading-relaxed text-slate-500">
              File otomatis berisi 2 sheet (<strong>orders</strong> & <strong>Advance Fulfilment</strong>) dengan 49 kolom resmi. Setiap pesanan multi-item akan terpecah menjadi 1 baris per produk sesuai standar Shopee Seller Centre.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#EE4D2D] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#d94122] disabled:cursor-not-allowed disabled:bg-slate-300"
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
                <span>Mengekspor Pesanan...</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                <span>Download File Excel</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
