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

/**
 * Baris contoh di sheet Produk.
 * Diberi keterangan [CONTOH] agar admin sadar ini bukan data nyata.
 * Kolom pertama diberi prefix supaya filter contoh bisa membuang baris ini saat impor.
 */
const EXAMPLE_ROWS = [
  // Baris peringatan
  ['⚠ PERHATIAN: Baris contoh di bawah ini BUKAN stok nyata. Hapus baris ini sebelum mengisi data produk Anda.'],
  // Baris contoh 1 — produk kardus
  ['KRD-30X20X15', 'Kardus Polos 30x20x15 [CONTOH — HAPUS]', 'Kardus', 'Tanpa Merek', 'Coklat', 'Ya', 30, 20, 15, 0, 'Aktif', 'Contoh: kardus single wall'],
  // Baris contoh 2 — produk biasa
  ['PLS-40X30', 'Plastik Packing 40x30 [CONTOH — HAPUS]', 'Plastik', 'Tanpa Merek', 'Putih', 'Tidak', 40, 30, '', 0, 'Aktif', ''],
];

const GUIDE_ROWS = [
  ['PETUNJUK PENGISIAN TEMPLATE IMPORT PRODUK'],
  [],
  ['⚠ PENTING:', '', ''],
  ['1.', 'Isi data produk Anda HANYA di sheet "Produk"', ''],
  ['2.', 'HAPUS baris contoh (bertanda [CONTOH — HAPUS]) sebelum mengisi data Anda', ''],
  ['3.', 'Stok di baris contoh sengaja diisi 0 — stok ini BUKAN stok nyata gudang Anda', ''],
  ['4.', 'Jika ada baris yang salah saat upload, sistem akan memberi tahu nomor baris & penyebabnya', ''],
  [],
  ['Kolom', 'Wajib', 'Keterangan'],
  ['SKU', '✅ WAJIB', 'Kode unik produk. SKU yang sudah ada akan DIPERBARUI, bukan digandakan.'],
  ['Nama Produk', '⚠ Disarankan', 'Nama produk. Jika dikosongkan, otomatis menggunakan SKU sebagai nama.'],
  ['Kategori', '⚠ Disarankan', 'Nama kategori. Bila kategori belum ada di sistem, otomatis dibuatkan.'],
  ['Brand', 'Opsional', 'Merek produk. Boleh dikosongkan.'],
  ['Warna', 'Opsional', 'Warna produk. Boleh dikosongkan.'],
  ['Kardus', 'Opsional', 'Isi "Ya" bila produk kardus (memakai kolom Tinggi). Selain itu isi "Tidak" atau kosongkan.'],
  ['Panjang (cm)', 'Opsional', 'Angka saja, contoh: 30 atau 30,5.'],
  ['Lebar (cm)', 'Opsional', 'Angka saja.'],
  ['Tinggi (cm)', 'Opsional', 'Hanya diisi bila kolom Kardus = "Ya".'],
  ['Stok Awal', 'Opsional', 'Diisi hanya untuk produk BARU. Pada produk yang sudah ada, kosongkan agar stok berjalan tidak tertimpa.'],
  ['Status', 'Opsional', 'Isi "Aktif" atau "Nonaktif". Kosong dianggap Aktif.'],
  ['Deskripsi', 'Opsional', 'Keterangan tambahan produk.'],
  [],
  ['Contoh Pesan Error Saat Upload', '', ''],
  ['Baris 3 (SKU: XYZ): SKU wajib diisi', '', '→ Kolom SKU di baris tersebut masih kosong'],
  ['Baris 5 (SKU: ABC-01): Stok tidak boleh negatif', '', '→ Kolom Stok Awal diisi angka negatif'],
];

/** Unduh template Excel berisi sheet Produk (dengan contoh) dan sheet Petunjuk. */
export function downloadProductTemplate(): void {
  const workbook = XLSX.utils.book_new();

  const productSheet = XLSX.utils.aoa_to_sheet([[...PRODUCT_TEMPLATE_HEADERS], ...EXAMPLE_ROWS]);
  productSheet['!cols'] = PRODUCT_TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(14, header.length + 6),
  }));
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Produk');

  const guideSheet = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
  guideSheet['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 85 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk');

  XLSX.writeFile(workbook, 'template-import-produk.xlsx');
}

/**
 * Baca file Excel yang diisi admin menjadi baris siap kirim ke server.
 * Sheet pertama yang bernama "Produk" dipakai; bila tidak ada, sheet pertama.
 * Baris peringatan/contoh (seluruh kolom kosong atau SKU mengandung "⚠") dibuang.
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

  // Buang:
  // 1. Baris yang seluruh kolomnya kosong.
  // 2. Baris peringatan (diawali dengan ⚠ di kolom pertama / SKU berisi [CONTOH]).
  return rows.filter((row) => {
    const allValues = Object.values(row);
    const hasAnyValue = allValues.some((value) => String(value ?? '').trim() !== '');
    if (!hasAnyValue) return false;

    // Buang baris peringatan dan contoh
    const skuVal = String(row['SKU'] ?? row['sku'] ?? '').trim();
    const namaVal = String(row['Nama Produk'] ?? row['nama_produk'] ?? '').trim();
    if (skuVal.startsWith('⚠') || namaVal.includes('[CONTOH')) return false;

    return true;
  });
}
