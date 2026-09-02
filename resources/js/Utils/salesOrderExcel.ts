import * as XLSX from 'xlsx';

export interface ExportOrder {
  so_number: string;
  order_date: string | null;
  customer_code: string | null;
  customer_name: string | null;
  recipient_name: string | null;
  city: string | null;
  province: string | null;
  source: string;
  sales_channel: string;
  status: string;
  payment_status: string;
  tracking_number: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  shipping_cost: number;
  admin_fee?: number;
  other_fee?: number;
  grand_total: number;
  dp_amount: number;
  remaining_amount: number;
  total_weight: number;
  created_by: string | null;
  notes: string | null;
}

export interface ExportItem {
  so_number: string;
  order_date: string | null;
  customer_name: string | null;
  sku: string | null;
  product_name: string;
  quantity: number;
  price: number;
  discount_amount: number;
  tax_amount: number;
  subtotal: number;
}

export interface ExportPayload {
  orders: ExportOrder[];
  items: ExportItem[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Menunggu Approval Finance',
  approved: 'Disetujui',
  processing: 'Diproses',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Belum Bayar',
  partially_paid: 'Sebagian',
  paid: 'Lunas',
  refunded: 'Refund',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  marketplace: 'Marketplace',
  website: 'Website',
  other: 'Lainnya',
};

/** Lebar kolom sheet mengikuti panjang isi terpanjang, dibatasi 40 karakter. */
function autoColumnWidth(rows: Record<string, unknown>[]): XLSX.ColInfo[] {
  if (rows.length === 0) return [];

  return Object.keys(rows[0]).map((key) => {
    const longest = rows.reduce((max, row) => {
      const length = String(row[key] ?? '').length;
      return length > max ? length : max;
    }, key.length);

    return { wch: Math.min(longest + 2, 40) };
  });
}

function toOrderRow(order: ExportOrder) {
  return {
    'No. SO': order.so_number,
    'Tanggal Order': order.order_date ?? '',
    'Kode Customer': order.customer_code ?? '',
    'Customer': order.customer_name ?? '',
    'Nama Penerima': order.recipient_name ?? '',
    'Kota': order.city ?? '',
    'Provinsi': order.province ?? '',
    'Sumber': SOURCE_LABEL[order.source] ?? order.source,
    'Channel': order.sales_channel,
    'Status': STATUS_LABEL[order.status] ?? order.status,
    'Status Bayar': PAYMENT_LABEL[order.payment_status] ?? order.payment_status,
    'No. Resi': order.tracking_number ?? '',
    'Subtotal': order.subtotal,
    'Diskon': order.discount_amount,
    'Pajak': order.tax_amount,
    'Ongkir': order.shipping_cost,
    'Biaya Admin': order.admin_fee ?? 0,
    'Biaya Lain-lain': order.other_fee ?? 0,
    'Grand Total': order.grand_total,
    'DP / Uang Muka': order.dp_amount,
    'Sisa Tagihan': order.remaining_amount,
    'Berat (Kg)': order.total_weight,
    'Dibuat Oleh': order.created_by ?? '',
    'Catatan': order.notes ?? '',
  };
}

function toItemRow(item: ExportItem) {
  return {
    'No. SO': item.so_number,
    'Tanggal Order': item.order_date ?? '',
    'Customer': item.customer_name ?? '',
    'SKU': item.sku ?? '',
    'Produk': item.product_name,
    'Qty': item.quantity,
    'Harga Satuan': item.price,
    'Diskon': item.discount_amount,
    'Pajak': item.tax_amount,
    'Subtotal': item.subtotal,
  };
}

function buildWorkbook(payload: ExportPayload): XLSX.WorkBook {
  const orderRows = payload.orders.map(toOrderRow);
  const itemRows = payload.items.map(toItemRow);

  const workbook = XLSX.utils.book_new();

  const orderSheet = XLSX.utils.json_to_sheet(orderRows);
  orderSheet['!cols'] = autoColumnWidth(orderRows);
  XLSX.utils.book_append_sheet(workbook, orderSheet, 'Sales Order');

  const itemSheet = XLSX.utils.json_to_sheet(itemRows);
  itemSheet['!cols'] = autoColumnWidth(itemRows);
  XLSX.utils.book_append_sheet(workbook, itemSheet, 'Detail Item');

  return workbook;
}

function todayStamp(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Unduh daftar Sales Order sesuai filter yang sedang aktif di halaman index.
 * Data diambil ulang dari server agar seluruh halaman ikut terunduh,
 * bukan hanya baris yang tampil.
 */
export async function downloadSalesOrderList(filters: Record<string, string | undefined>): Promise<number> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });

  const response = await fetch(`/sales-orders/export?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('Gagal mengambil data Sales Order untuk diunduh.');
  }

  const payload: ExportPayload = await response.json();
  XLSX.writeFile(buildWorkbook(payload), `sales-order-${todayStamp()}.xlsx`);

  return payload.orders.length;
}

/** Unduh satu Sales Order beserta detail itemnya. */
export function downloadSingleSalesOrder(order: ExportOrder, items: ExportItem[]): void {
  XLSX.writeFile(buildWorkbook({ orders: [order], items }), `${order.so_number}.xlsx`);
}

/**
 * Unduh Template Excel Resmi untuk Impor Pesanan Sales Order / Grosir (17 Kolom).
 * Termasuk kolom Biaya Admin dan Biaya Lain-lain.
 */
export function downloadGrosirTemplateExcel(availableSkus?: string[]): void {
  const sampleSku1 = availableSkus && availableSkus.length > 0 ? availableSkus[0] : 'PRD-001';
  const sampleSku2 = availableSkus && availableSkus.length > 1 ? availableSkus[1] : 'PRD-002';

  const templateRows = [
    {
      'Resi / AWB': 'JNT123456789',
      'Waktu Pembayaran': todayStamp(),
      'Nama Penerima': 'Budi Santoso',
      'Nama Akun': 'Grosir Offline',
      'SKU': sampleSku1,
      'QTY': 2,
      'Satuan Harga': 75000,
      'Voucher': 5000,
      'Pajak': 0,
      'Total Berat Barang': 1.5,
      'Alamat Penerima': 'Jl. Merdeka No. 45',
      'No. Telp': '081234567890',
      'Kota': 'Surabaya',
      'Provinsi': 'Jawa Timur',
      'Biaya Admin': 2500,
      'Biaya Lain-lain': 1000,
      'DP': 50000,
    },
    {
      'Resi / AWB': 'SPX987654321',
      'Waktu Pembayaran': todayStamp(),
      'Nama Penerima': 'Siti Rahmawati',
      'Nama Akun': 'Toko Grosir Cabang',
      'SKU': sampleSku2,
      'QTY': 5,
      'Satuan Harga': 120000,
      'Voucher': 0,
      'Pajak': 0,
      'Total Berat Barang': 3.0,
      'Alamat Penerima': 'Jl. Diponegoro No. 12',
      'No. Telp': '085712345678',
      'Kota': 'Semarang',
      'Provinsi': 'Jawa Tengah',
      'Biaya Admin': 5000,
      'Biaya Lain-lain': 0,
      'DP': 605000,
    },
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(templateRows);

  sheet['!cols'] = [
    { wch: 18 }, // Resi/AWB
    { wch: 18 }, // Waktu Pembayaran
    { wch: 22 }, // Nama Penerima
    { wch: 20 }, // Nama Akun
    { wch: 15 }, // SKU
    { wch: 8 },  // QTY
    { wch: 14 }, // Satuan Harga
    { wch: 12 }, // Voucher
    { wch: 10 }, // Pajak
    { wch: 18 }, // Total Berat Barang
    { wch: 28 }, // Alamat Penerima
    { wch: 16 }, // No. Telp
    { wch: 16 }, // Kota
    { wch: 16 }, // Provinsi
    { wch: 14 }, // Biaya Admin
    { wch: 16 }, // Biaya Lain-lain
    { wch: 14 }, // DP
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Template Import SO');
  XLSX.writeFile(workbook, `template-import-sales-order-17-kolom.xlsx`);
}
