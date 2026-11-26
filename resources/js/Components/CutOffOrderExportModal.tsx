import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import Modal from '@/Components/Modal';

interface Props {
  show: boolean;
  onClose: () => void;
  filters: {
    search?: string;
    channel?: string;
    info_gudang?: string;
    order_status?: string;
    dpp_status?: string;
    shipping_courier?: string;
    shipping_tier?: string;
  };
  canViewFinancial: boolean;
}

type DatePreset = 'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom';

function formatDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CutOffOrderExportModal({
  show,
  onClose,
  filters,
  canViewFinancial,
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
  const [channel, setChannel] = useState<string>(filters.channel || 'all');
  const [applyPageFilters, setApplyPageFilters] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (show) {
      setError(null);
      setChannel(filters.channel || 'all');
    }
  }, [show, filters.channel]);

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
    } else if (p === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleDownload = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (channel && channel !== 'all') params.set('channel', channel);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      if (applyPageFilters) {
        if (filters.search) params.set('search', filters.search);
        if (filters.info_gudang && filters.info_gudang !== 'all') {
          params.set('info_gudang', filters.info_gudang);
        }
        if (filters.order_status && filters.order_status !== 'all') {
          params.set('order_status', filters.order_status);
        }
        if (filters.dpp_status && filters.dpp_status !== 'all') {
          params.set('dpp_status', filters.dpp_status);
        }
        if (filters.shipping_courier && filters.shipping_courier !== 'all') {
          params.set('shipping_courier', filters.shipping_courier);
        }
        if (filters.shipping_tier && filters.shipping_tier !== 'all') {
          params.set('shipping_tier', filters.shipping_tier);
        }
      }

      // Fetch sebagai binary — backend mengembalikan .xlsx langsung (dengan styling warna merah)
      const res = await fetch(`/cut-off-orders/export-data?${params.toString()}`, {
        headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let errMsg = 'Gagal mengambil data pesanan Cut Off dari server.';
        try { const j = JSON.parse(errText); errMsg = j.message || j.error || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      if (blob.size < 100) {
        setError('Tidak ada data pesanan Cut Off pada rentang tanggal dan filter yang dipilih.');
        setIsExporting(false);
        return;
      }

      // Ambil filename dari Content-Disposition header jika ada
      const cd = res.headers.get('Content-Disposition') || '';
      const fnMatch = cd.match(/filename="?([^";]+)"?/);
      const fileName = fnMatch ? fnMatch[1] : `Pesanan_Cut_Off_${todayStr}.xlsx`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat mengekspor data.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal show={show} onClose={onClose} title="Export Excel Pesanan Cut Off" maxWidth="xl">
      <div className="space-y-4">
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

        {/* Preset Rentang Waktu */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Rentang Tanggal Diproses
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { key: 'today', label: 'Hari Ini' },
              { key: 'yesterday', label: 'Kemarin' },
              { key: '7days', label: '7 Hari' },
              { key: '30days', label: '30 Hari' },
              { key: 'all', label: 'Semua' },
              { key: 'custom', label: 'Kustom' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handlePresetSelect(item.key as DatePreset)}
                className={`cursor-pointer rounded-xl border py-2 px-2 text-xs font-semibold transition-all ${
                  preset === item.key
                    ? 'border-[#0B132B] bg-[#0B132B] text-white shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input Tanggal Kustom */}
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 transition-colors focus:border-blue-600 focus:bg-white focus:outline-hidden"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 transition-colors focus:border-blue-600 focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>

        {/* Pilihan Platform */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Platform</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 transition-colors focus:border-blue-600 focus:outline-hidden"
          >
            <option value="all">Semua Platform (Shopee & TikTok)</option>
            <option value="SH">Shopee</option>
            <option value="TT">TikTok</option>
          </select>
        </div>

        {/* Opsi Ikuti Filter Aktif */}
        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={applyPageFilters}
            onChange={(e) => setApplyPageFilters(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0B132B] focus:ring-[#0B132B]"
          />
          <div className="text-xs">
            <span className="font-semibold text-slate-800 block">Ikuti filter aktif di halaman</span>
            <span className="text-[11px] text-slate-500">
              Pencarian, status pesanan, ekspedisi, tipe layanan, info gudang, dan status DPP yang sedang dipilih akan ikut diterapkan.
            </span>
          </div>
        </label>

        {/* Info Kolom Output */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-900">
          <div className="font-semibold flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-600 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" />
            </svg>
            <span>Kolom Excel (.xlsx) yang Diambil:</span>
          </div>
          <p className="mt-1 text-emerald-800 leading-relaxed font-medium">
            {canViewFinancial
              ? 'Tanggal · Nomor Urut · Platform · No Pesanan · SKU · QTY · Username · Est Bersih · Ekspedisi'
              : 'Tanggal · Nomor Urut · Platform · No Pesanan · SKU · QTY · Username · Ekspedisi'}
          </p>
        </div>

        {/* Footer Tombol */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isExporting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Menyiapkan Excel...</span>
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
                <span>Download Excel (.xlsx)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
