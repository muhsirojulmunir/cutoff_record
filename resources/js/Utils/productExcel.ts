import * as XLSX from 'xlsx';

/** Judul kolom template — dibaca kembali saat impor, jadi harus persis. */
export const PRODUCT_TEMPLATE_HEADERS = [
  'SKU',
  'Nama Produk',
  'Kategori',
  'Brand',
  'Warna',
  'Kardus',
  'Panjang (cm)',
  'Lebar (cm)',
  'Tinggi (cm)',
  'Stok Awal',
  'Status',
  'Deskripsi',
] as const;

const EXAMPLE_ROWS = [
  ['KRD-30X20X15', 'Kardus Polos 30x20x15', 'Kardus', 'Tanpa Merek', 'Coklat', 'Ya', 30, 20, 15, 100, 'Aktif', 'Kardus single wall'],
  ['PLS-40X30', 'Plastik Packing 40x30', 'Plastik', 'Tanpa Merek', 'Putih', 'Tidak', 40, 30, '', 500, 'Aktif', ''],
];

const GUIDE_ROWS = [
  ['PETUNJUK PENGISIAN TEMPLATE PRODUK'],
  [],
  ['Kolom', 'Wajib', 'Keterangan'],
  ['SKU', 'Wajib', 'Kode unik produk. SKU yang sudah ada akan DIPERBARUI, bukan digandakan.'],
  ['Nama Produk', 'Wajib', 'Nama produk sesuai master data.'],
  ['Kategori', 'Wajib', 'Nama kategori. Bila kategori belum ada, otomatis dibuatkan.'],
  ['Brand', 'Opsional', 'Merek produk.'],
  ['Warna', 'Opsional', 'Warna produk.'],
  ['Kardus', 'Opsional', 'Isi "Ya" bila produk kardus (memakai Tinggi). Selain itu isi "Tidak".'],
  ['Panjang (cm)', 'Opsional', 'Angka, contoh: 30 atau 30,5.'],
  ['Lebar (cm)', 'Opsional', 'Angka.'],
  ['Tinggi (cm)', 'Opsional', 'Hanya diisi bila kolom Kardus berisi "Ya".'],
  ['Stok Awal', 'Opsional', 'Diisi hanya untuk produk baru. Pada produk lama, kosongkan agar stok berjalan tidak tertimpa.'],
  ['Status', 'Opsional', 'Isi "Aktif" atau "Nonaktif". Kosong dianggap Aktif.'],
  ['Deskripsi', 'Opsional', 'Keterangan tambahan.'],
  [],
  ['Catatan', '', 'Hapus baris contoh pada sheet "Produk" sebelum mengisi data Anda.'],
];

/** Unduh template Excel berisi sheet Produk (dengan contoh) dan sheet Petunjuk. */
export function downloadProductTemplate(): void {
  const workbook = XLSX.utils.book_new();

  const productSheet = XLSX.utils.aoa_to_sheet([[...PRODUCT_TEMPLATE_HEADERS], ...EXAMPLE_ROWS]);
  productSheet['!cols'] = PRODUCT_TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(12, header.length + 4),
  }));
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Produk');

  const guideSheet = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
  guideSheet['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk');

  XLSX.writeFile(workbook, 'template-import-produk.xlsx');
}

/**
 * Baca file Excel yang diisi admin menjadi baris siap kirim ke server.
 * Sheet pertama yang bernama "Produk" dipakai; bila tidak ada, sheet pertama.
 */
export async function readProductRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === 'produk') ?? workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('File Excel tidak memiliki sheet yang bisa dibaca.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
    raw: true,
  });

  // Buang baris yang seluruh kolomnya kosong.
  return rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? '').trim() !== '')
  );
}
