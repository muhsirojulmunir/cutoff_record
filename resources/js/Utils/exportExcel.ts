import * as XLSX from 'xlsx';

interface ExportPayload {
  file_name: string;
  sheet_name?: string;
  module: string;
  description?: string | null;
  /** Judul kolom; hanya dipakai bila rows berupa array-of-array. */
  headers?: string[];
  rows: Record<string, unknown>[] | unknown[][];
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

/** Susun worksheet dari data objek maupun array baris. */
function buildSheet(payload: ExportPayload): XLSX.WorkSheet {
  const rows = payload.rows ?? [];

  if (payload.headers && payload.headers.length > 0) {
    return XLSX.utils.aoa_to_sheet([payload.headers, ...(rows as unknown[][])]);
  }

  return XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]);
}

/**
 * Simpan salinan berkas ke riwayat unduhan supaya bisa diunduh ulang.
 * Kegagalan pencatatan sengaja diabaikan — berkasnya sudah terunduh.
 */
async function recordHistory(fileName: string, module: string, description: string | null, blob: Blob) {
  try {
    const form = new FormData();
    form.append('file_name', fileName);
    form.append('module', module);
    if (description) form.append('description', description);
    form.append('file', blob, fileName);

    await fetch('/export-logs', {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrfToken() },
      credentials: 'same-origin',
      body: form,
    });
  } catch {
    // Diabaikan: riwayat hanya catatan tambahan.
  }
}

/** Ubah workbook menjadi Blob .xlsx. */
function toBlob(workbook: XLSX.WorkBook): Blob {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Rakit berkas .xlsx dari data, unduh, lalu simpan salinannya ke riwayat.
 * Dipakai bersama endpoint export yang mengembalikan JSON.
 */
export async function downloadExcel(payload: ExportPayload): Promise<void> {
  const worksheet = buildSheet(payload);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, payload.sheet_name ?? 'Data');

  const blob = toBlob(workbook);

  triggerDownload(blob, payload.file_name);
  await recordHistory(payload.file_name, payload.module, payload.description ?? null, blob);
}

/**
 * Ambil data dari endpoint export lalu unduh sebagai .xlsx.
 * Mengembalikan pesan kesalahan bila ada, atau null bila berhasil.
 */
export async function fetchAndDownloadExcel(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    if (!response.ok) return 'Gagal mengambil data export.';

    const payload: ExportPayload = await response.json();

    if (!payload.rows || payload.rows.length === 0) {
      return 'Tidak ada data untuk diexport.';
    }

    await downloadExcel(payload);
    return null;
  } catch {
    return 'Gagal mengunduh file. Coba lagi.';
  }
}

/**
 * Simpan berkas yang sudah dirakit sendiri (misalnya template) ke riwayat,
 * sekaligus mengunduhnya.
 */
export async function downloadWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  module: string,
  description?: string,
): Promise<void> {
  const blob = toBlob(workbook);

  triggerDownload(blob, fileName);
  await recordHistory(fileName, module, description ?? null, blob);
}
