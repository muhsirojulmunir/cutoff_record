import * as XLSX from 'xlsx';

interface ExportOrder {
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
  grand_total: number;
  total_weight: number;
  created_by: string | null;
  notes: string | null;
}

interface ExportItem {
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

interface ExportPayload {
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
    'Grand Total': order.grand_total,
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
