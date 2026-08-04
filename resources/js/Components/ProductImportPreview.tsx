import { useEffect, useMemo, useState } from 'react';

export interface PreviewRow {
  /** Nomor baris di file Excel — baris 1 adalah judul kolom. */
  excelRow: number;
  sku: string;
  name: string;
  raw: Record<string, unknown>;
}

interface Props {
  rows: PreviewRow[];
  fileName: string;
  processing: boolean;
  onCancel: () => void;
  onConfirm: (rows: Record<string, unknown>[]) => void;
}

type RowStatus = 'new' | 'update' | 'error';

interface CheckedRow extends PreviewRow {
  status: RowStatus;
  problem: string | null;
}

/**
 * Pratinjau isi file Excel sebelum benar-benar disimpan.
 * Admin bisa memeriksa baris mana yang menambah produk baru, mana yang
 * memperbarui produk lama, dan mana yang bermasalah.
 */
export default function ProductImportPreview({ rows, fileName, processing, onCancel, onConfirm }: Props) {
  const [existingSkus, setExistingSkus] = useState<Set<string> | null>(null);
  const [checking, setChecking] = useState(true);
  const [onlyProblems, setOnlyProblems] = useState(false);

  // Tanyakan ke server SKU mana yang sudah terdaftar, supaya status tiap
  // baris (baru / diperbarui) benar-benar sesuai isi database.
  useEffect(() => {
    let cancelled = false;

    async function fetchExisting() {
      try {
        const response = await fetch('/products/check-skus', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
          },
          body: JSON.stringify({ skus: rows.map((row) => row.sku).filter(Boolean) }),
        });

        if (!response.ok) throw new Error('gagal');

        const { existing }: { existing: string[] } = await response.json();
        if (!cancelled) setExistingSkus(new Set(existing.map((sku) => sku.toUpperCase())));
      } catch {
        // Gagal mengecek bukan halangan — status baris cukup ditandai netral.
        if (!cancelled) setExistingSkus(new Set());
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    fetchExisting();
    return () => { cancelled = true; };
  }, [rows]);

  const checkedRows: CheckedRow[] = useMemo(() => {
    const seen = new Map<string, number>();

    return rows.map((row) => {
      // Aturannya mengikuti server: SKU kosong dibuatkan dari nama produk,
      // dan baris hanya bermasalah bila SKU serta nama sama-sama kosong.
      const derived = !row.sku.trim() && row.name.trim()
        ? row.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
        : row.sku.trim();

      const sku = derived;
      const key = sku.toUpperCase();

      if (!sku) {
        return { ...row, status: 'error', problem: 'SKU dan Nama Produk sama-sama kosong' };
      }

      if (seen.has(key)) {
        return { ...row, status: 'error', problem: `SKU ganda dengan baris ${seen.get(key)}` };
      }

      seen.set(key, row.excelRow);

      if (sku.length > 100) {
        return { ...row, status: 'error', problem: 'SKU lebih dari 100 karakter' };
      }

      if (row.name.length > 255) {
        return { ...row, status: 'error', problem: 'Nama produk lebih dari 255 karakter' };
      }

      return {
        ...row,
        sku,
        status: existingSkus?.has(key) ? 'update' : 'new',
        problem: row.sku.trim() ? null : 'SKU dibuat otomatis dari nama produk',
      };
    });
  }, [rows, existingSkus]);

  const counts = useMemo(() => ({
    total: checkedRows.length,
    new: checkedRows.filter((row) => row.status === 'new').length,
    update: checkedRows.filter((row) => row.status === 'update').length,
    error: checkedRows.filter((row) => row.status === 'error').length,
  }), [checkedRows]);

  const visibleRows = onlyProblems ? checkedRows.filter((row) => row.status === 'error') : checkedRows;
  const blocked = counts.error > 0;

  const STATUS_BADGE: Record<RowStatus, { label: string; className: string }> = {
    new:    { label: 'Baru',        className: 'bg-teal-50 border-teal-200 text-teal-700' },
    update: { label: 'Diperbarui',  className: 'bg-orange-50 border-orange-200 text-orange-600' },
    error:  { label: 'Bermasalah',  className: 'bg-rose-50 border-rose-200 text-rose-600' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={processing ? undefined : onCancel} />

      <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-bold text-gray-900">Pratinjau Impor Produk</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 font-mono truncate">{fileName}</p>
        </div>

        {/* Ringkasan */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-100">
          {[
            { label: 'Total Baris', value: counts.total, accent: 'text-gray-900' },
            { label: 'Produk Baru', value: counts.new, accent: 'text-teal-600' },
            { label: 'Diperbarui', value: counts.update, accent: 'text-orange-600' },
            { label: 'Bermasalah', value: counts.error, accent: counts.error > 0 ? 'text-rose-600' : 'text-gray-300' },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-gray-200 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{card.label}</p>
              <p className={`text-lg font-bold font-mono mt-0.5 ${card.accent}`}>
                {checking && card.label !== 'Total Baris' ? '…' : card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Peringatan bila ada baris bermasalah */}
        {blocked && (
          <div className="mx-6 mt-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
            <p className="text-xs font-bold text-rose-700">
              {counts.error} baris bermasalah — impor tidak bisa dijalankan.
            </p>
            <p className="text-[11px] text-rose-600 mt-0.5">
              Perbaiki baris bertanda merah di file Excel Anda, lalu unggah ulang.
            </p>
          </div>
        )}

        {/* Daftar baris */}
        <div className="px-6 pt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">
            Menampilkan {visibleRows.length} dari {counts.total} baris
          </p>
          {counts.error > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(e) => setOnlyProblems(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              Tampilkan yang bermasalah saja
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                <th className="py-2 pr-3 w-14">Baris</th>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Nama Produk</th>
                <th className="py-2 text-right w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {visibleRows.map((row) => {
                const badge = STATUS_BADGE[row.status];

                return (
                  <tr key={row.excelRow} className={row.status === 'error' ? 'bg-rose-50/40' : ''}>
                    <td className="py-2.5 pr-3 text-[11px] font-mono text-gray-400">{row.excelRow}</td>
                    <td className="py-2.5 pr-3 text-xs font-mono font-bold text-gray-800">
                      {row.sku || <span className="text-rose-500">(kosong)</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray-700">
                      <span className="line-clamp-1">{row.name || <span className="text-gray-400">— memakai SKU —</span>}</span>
                      {row.problem && (
                        <span className={`block text-[10px] mt-0.5 ${row.status === 'error' ? 'text-rose-600' : 'text-gray-400'}`}>
                          {row.problem}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${badge.className}`}>
                        {checking && row.status !== 'error' ? '…' : badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Aksi */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={() => onConfirm(checkedRows.map((row) => row.raw))}
            disabled={processing || blocked || checking || counts.total === 0}
            className="px-5 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Mengimpor...' : `Import ${counts.total} Produk`}
          </button>
        </div>
      </div>
    </div>
  );
}
