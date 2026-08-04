import * as XLSX from 'xlsx';

/** Judul kolom template Excel resmi — disesuaikan dengan Master Data Produk (SKU & Nama Produk). */
export const PRODUCT_TEMPLATE_HEADERS = [
  'SKU',
  'Nama Produk',
] as const;

/**
 * Baris contoh di sheet Produk.
 * Diberi keterangan [CONTOH] agar admin sadar ini bukan data nyata.
 */
const EXAMPLE_ROWS = [
  // Baris peringatan
  ['⚠ PERHATIAN: Baris contoh di bawah ini BUKAN data nyata. Hapus baris ini sebelum mengunggah.'],
  // Baris contoh
  ['KRD-30X20X15', 'Kardus Polos 30x20x15 [CONTOH — HAPUS]'],
  ['PLS-40X30', 'Plastik Packing 40x30 [CONTOH — HAPUS]'],
];

const GUIDE_ROWS = [
  ['PETUNJUK PENGISIAN TEMPLATE IMPORT PRODUK (MASTER DATA)'],
  [],
  ['⚠ PENTING:', '', ''],
  ['1.', 'Isi data produk Anda HANYA di sheet "Produk"', ''],
  ['2.', 'HAPUS baris contoh (bertanda [CONTOH — HAPUS]) sebelum mengunggah file Anda', ''],
  ['3.', 'File ini HANYA mengelola Master Data Produk (SKU & Nama Produk)', ''],
  ['4.', 'Pengelolaan Stok dilakukan secara terpisah melalui menu Barang Masuk', ''],
  ['5.', 'Jika SKU sudah ada di sistem, data Nama Produk akan diperbarui secara otomatis', ''],
  [],
  ['Kolom', 'Wajib', 'Keterangan'],
  ['SKU', '✅ WAJIB', 'Kode unik produk. Karakter bebas (huruf/angka/tanda hubung).'],
  ['Nama Produk', '⚠ Disarankan', 'Nama lengkap produk. Jika dikosongkan, otomatis menggunakan nilai SKU.'],
  [],
  ['Contoh Pesan Error Saat Upload', '', ''],
  ['Baris 3 (SKU: XYZ): Kolom SKU wajib diisi', '', '→ Kolom SKU di baris tersebut masih kosong'],
  ['Baris 5 (SKU: ABC-01): SKU ganda di dalam file Excel', '', '→ Terdapat 2 baris dengan SKU yang sama persis dalam 1 file'],
];

/** Unduh template Excel berisi sheet Produk (dengan contoh) dan sheet Petunjuk. */
export function downloadProductTemplate(): void {
  const workbook = XLSX.utils.book_new();

  const productSheet = XLSX.utils.aoa_to_sheet([[...PRODUCT_TEMPLATE_HEADERS], ...EXAMPLE_ROWS]);
  productSheet['!cols'] = [
    { wch: 20 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Produk');

  const guideSheet = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
  guideSheet['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 85 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk');

  XLSX.writeFile(workbook, 'template-import-produk.xlsx');
}

/**
 * Baca file Excel yang diunggah admin menjadi baris siap kirim ke server.
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
    const isEmpty = allValues.every((val) => val === '' || val === null || val === undefined);
    if (isEmpty) return false;

    const firstVal = String(allValues[0] ?? '').trim();
    if (firstVal.startsWith('⚠') || firstVal.toLowerCase().includes('perhatian')) return false;

    const skuVal = String(row['SKU'] ?? row['sku'] ?? firstVal).trim();
    const nameVal = String(row['Nama Produk'] ?? row['nama_produk'] ?? '').trim();

    if (skuVal.toLowerCase().includes('[contoh') || nameVal.toLowerCase().includes('[contoh')) {
      return false;
    }

    return true;
  });
}
