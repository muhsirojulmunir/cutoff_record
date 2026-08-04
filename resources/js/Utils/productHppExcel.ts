import * as XLSX from 'xlsx';

interface TemplateProduct {
  sku: string;
  name: string;
  category: string | null;
  po_average_cost: number;
  current_hpp: number | null;
  effective_date: string | null;
}

export const HPP_TEMPLATE_HEADERS = [
  'SKU',
  'Nama Produk',
  'Kategori',
  'Rata-rata Beli PO',
  'HPP',
  'Tanggal Berlaku',
  'Catatan',
] as const;

const GUIDE_ROWS = [
  ['PETUNJUK PENGISIAN TEMPLATE HPP'],
  [],
  ['Kolom', 'Wajib', 'Keterangan'],
  ['SKU', 'Wajib', 'Jangan diubah — dipakai sistem untuk mencocokkan produk.'],
  ['Nama Produk', '—', 'Hanya keterangan, isinya diabaikan saat impor.'],
  ['Kategori', '—', 'Hanya keterangan, isinya diabaikan saat impor.'],
  ['Rata-rata Beli PO', '—', 'Acuan: rata-rata harga beli dari PO yang barangnya sudah diterima.'],
  ['HPP', 'Wajib', 'Angka tanpa "Rp", contoh: 12500. Baris yang HPP-nya dikosongkan akan dilewati.'],
  ['Tanggal Berlaku', 'Opsional', 'Format YYYY-MM-DD. Bila kosong, dipakai tanggal hari impor.'],
  ['Catatan', 'Opsional', 'Misalnya sumber perhitungan atau nomor PO acuan.'],
  [],
  ['Catatan', '', 'Isi kolom HPP saja untuk produk yang ingin diperbarui, sisanya biarkan kosong.'],
  ['', '', 'HPP yang sudah pernah diisi akan diperbarui, bukan digandakan.'],
];

const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * Unduh template HPP yang sudah terisi daftar produk dari server,
 * lengkap dengan HPP berjalan dan acuan harga beli PO.
 */
export async function downloadHppTemplate(): Promise<number> {
  const response = await fetch('/product-hpp/template', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('Gagal mengambil daftar produk untuk template.');
  }

  const { products }: { products: TemplateProduct[] } = await response.json();

  const rows = products.map((product) => [
    product.sku,
    product.name,
    product.category ?? '',
    product.po_average_cost > 0 ? product.po_average_cost : '',
    product.current_hpp ?? '',
    product.effective_date ?? '',
    '',
  ]);

  const workbook = XLSX.utils.book_new();

  const sheet = XLSX.utils.aoa_to_sheet([[...HPP_TEMPLATE_HEADERS], ...rows]);
  sheet['!cols'] = [{ wch: 20 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'HPP');

  const guide = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
  guide['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 82 }];
  XLSX.utils.book_append_sheet(workbook, guide, 'Petunjuk');

  XLSX.writeFile(workbook, `template-hpp-${todayIso()}.xlsx`);

  return products.length;
}

/** Baca file Excel HPP yang sudah diisi menjadi baris siap kirim ke server. */
export async function readHppRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === 'hpp') ?? workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('File Excel tidak memiliki sheet yang bisa dibaca.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
    raw: true,
  });

  return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}
