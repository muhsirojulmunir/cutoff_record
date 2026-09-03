import * as XLSX from 'xlsx';

export interface ParsedMarketplaceItem {
  sku: string;
  product_name: string;
  variation_name?: string;
  quantity: number;
  price: number;
  discount_amount: number;
  subtotal: number;
}

export interface ParsedMarketplaceOrder {
  external_order_id: string;
  sales_channel: 'shopee' | 'tiktok';
  tracking_number: string;
  courier_name?: string;
  order_date: string;
  payment_date?: string;
  order_status?: string;
  recipient_name: string;
  customer_phone: string;
  shipping_address: string;
  city: string;
  province: string;
  subtotal: number;
  discount_amount: number;
  shipping_cost: number;
  admin_fee: number;
  other_fee: number;
  grand_total: number;
  estimated_payout: number;  // Estimasi pembayaran bersih dari platform (income seller)
  notes?: string;
  items: ParsedMarketplaceItem[];
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getColIdx(headers: string[], keywords: string[], fallbackIdx: number, taken: Set<number>): number {
  if (!headers || headers.length === 0) return fallbackIdx;

  const normalized = headers.map(normalizeHeader);
  const keys = keywords.map(normalizeHeader).filter(Boolean);

  const findBy = (predicate: (header: string) => boolean): number =>
    normalized.findIndex((header, idx) => header !== '' && !taken.has(idx) && predicate(header));

  let idx = findBy((header) => keys.some((key) => header === key));
  if (idx === -1) idx = findBy((header) => keys.some((key) => header.startsWith(key)));
  if (idx === -1) idx = findBy((header) => keys.some((key) => new RegExp(`\\b${escapeRegExp(key)}\\b`).test(header)));

  return idx !== -1 ? idx : fallbackIdx;
}

function parseMoney(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim();
  if (!str || str === 'N' || str === 'n' || str === 'Y' || str === 'y' || str === '-') return 0;

  // Hapus simbol mata uang dan spasi
  str = str.replace(/^(Rp|IDR)\s*/i, '').trim();

  // Format angka Indonesia atau Excel: "40.000,00" atau "40.000"
  if (str.includes('.') && str.includes(',')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // 40.000,00 -> titik adalah ribuan, koma adalah desimal
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 40,000.00 -> koma adalah ribuan, titik adalah desimal
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
    // Jika ada titik ribuan khas Indonesia (misal "40.000", "117.000", atau "1.250.000")
    const parts = str.split('.');
    if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3)) {
      str = parts.join('');
    }
  } else if (str.includes(',')) {
    // Koma ribuan (40,000) atau desimal (40,50)
    const parts = str.split(',');
    if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3)) {
      str = parts.join('');
    } else {
      str = str.replace(',', '.');
    }
  }

  const cleaned = str.replace(/[^0-9.-]/g, '');
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  
  const str = String(val).trim();
  if (!str) return new Date().toISOString().slice(0, 10);

  if (!isNaN(Number(str)) && Number(str) > 30000) {
    const excelDate = XLSX.SSF.parse_date_code(Number(str));
    if (excelDate) {
      const y = excelDate.y;
      const m = String(excelDate.m).padStart(2, '0');
      const d = String(excelDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().slice(0, 10);
  }

  return str.split(' ')[0] || new Date().toISOString().slice(0, 10);
}

/**
 * Parse file Excel ekspor pesanan Shopee Seller Center.
 * Mengelompokkan baris item yang memiliki 'No. Pesanan' sama ke dalam 1 pesanan.
 */
export function parseShopeeExcel(rawData: any[][]): ParsedMarketplaceOrder[] {
  if (!rawData || rawData.length === 0) return [];

  // Cari baris header
  let headerRow: string[] = [];
  let startIdx = 0;

  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const line = rawData[i];
    if (Array.isArray(line)) {
      const lineStr = line.map((c) => String(c || '').toLowerCase()).join(' ');
      if (lineStr.includes('no. pesanan') || lineStr.includes('nomor pesanan') || lineStr.includes('sku')) {
        headerRow = line.map((c) => String(c || '').trim());
        startIdx = i + 1;
        break;
      }
    }
  }

  if (headerRow.length === 0 && rawData.length > 0) {
    headerRow = rawData[0].map((c) => String(c || '').trim());
    startIdx = 1;
  }

  const taken = new Set<number>();
  const resolve = (keywords: string[], fallbackIdx: number): number => {
    const idx = getColIdx(headerRow, keywords, fallbackIdx, taken);
    taken.add(idx);
    return idx;
  };

  const orderIdIdx   = resolve(['no pesanan', 'nomor pesanan', 'no order', 'order sn'], 0);
  const statusIdx    = resolve(['status pesanan', 'status'], 1);
  const resiIdx      = resolve(['no resi', 'nomor resi', 'tracking', 'resi'], 4);
  const courierIdx   = resolve(['opsi pengiriman', 'kurir', 'jasa kirim'], 5);
  const dateIdx      = resolve(['waktu pesanan dibuat', 'waktu dibuat', 'tanggal'], 9);
  const payDateIdx   = resolve(['waktu pembayaran dilakukan', 'waktu bayar', 'tanggal bayar'], 10);
  const parentSkuIdx = resolve(['sku induk', 'sku parent'], 13);
  const prodNameIdx  = resolve(['nama produk', 'produk'], 14);
  const refSkuIdx    = resolve(['nomor referensi sku', 'referensi sku', 'sku'], 15);
  const varNameIdx   = resolve(['nama variasi', 'variasi'], 16);
  const priceIdx     = resolve(['harga setelah diskon', 'harga satuan', 'harga'], 18);
  const qtyIdx       = resolve(['jumlah', 'qty', 'kuantitas'], 19);
  const itemSubtotalIdx = resolve(['subtotal produk', 'subtotal'], 21);
  const sellerDiscIdx= resolve(['diskon dari penjual', 'voucher ditanggung penjual'], 23);
  const shippingIdx  = resolve(['ongkos kirim dibayar oleh pembeli', 'ongkos kirim', 'ongkir'], 36);
  const estimatedPayoutIdx = resolve(['estimasi pembayaran bersih', 'estimasi bersih', 'perkiraan pembayaran bersih', 'estimated settlement', 'settlement amount', 'net payment'], 38);
  const totalPayIdx  = resolve(['total pembayaran', 'total', 'grand total'], 39);
  const notesIdx     = resolve(['catatan dari pembeli', 'catatan pembeli', 'catatan'], 41);
  const nameIdx      = resolve(['nama penerima', 'penerima'], 44);
  const phoneIdx     = resolve(['no telepon', 'no telp', 'telepon', 'hp'], 45);
  const addressIdx   = resolve(['alamat pengiriman', 'alamat'], 46);
  const cityIdx      = resolve(['kota kabupaten', 'kota', 'kabupaten'], 47);
  const provinceIdx  = resolve(['provinsi', 'propinsi'], 48);

  const orderMap = new Map<string, ParsedMarketplaceOrder>();

  for (let i = startIdx; i < rawData.length; i++) {
    const cols = rawData[i];
    if (!cols || cols.length < 3) continue;

    const orderId = String(cols[orderIdIdx] || '').trim();
    if (!orderId) continue;

    const rawSku = cols[refSkuIdx] || cols[parentSkuIdx] || '';
    const sku = String(rawSku).trim();
    const prodName = String(cols[prodNameIdx] || 'Produk Shopee').trim();
    const varName = String(cols[varNameIdx] || '').trim();
    const qty = Math.max(1, parseInt(String(cols[qtyIdx] || 1)) || 1);
    const unitPrice = parseMoney(cols[priceIdx]);
    const itemSubtotal = cols[itemSubtotalIdx] !== undefined ? parseMoney(cols[itemSubtotalIdx]) : (unitPrice * qty);

    const item: ParsedMarketplaceItem = {
      sku: sku || 'NO-SKU',
      product_name: prodName,
      variation_name: varName,
      quantity: qty,
      price: unitPrice,
      discount_amount: 0,
      subtotal: itemSubtotal || (unitPrice * qty),
    };

    if (!orderMap.has(orderId)) {
      const orderDate = parseExcelDate(cols[dateIdx]);
      const payDate = cols[payDateIdx] ? parseExcelDate(cols[payDateIdx]) : orderDate;
      const recipientName = String(cols[nameIdx] || 'Pembeli Shopee').trim();
      const phone = String(cols[phoneIdx] || '').trim();
      const address = String(cols[addressIdx] || '').trim();
      const city = String(cols[cityIdx] || '').trim();
      const province = String(cols[provinceIdx] || '').trim();
      const resi = String(cols[resiIdx] || '').trim();
      const courier = String(cols[courierIdx] || 'Shopee Courier').trim();
      const status = String(cols[statusIdx] || 'Perlu Dikirim').trim();
      const shippingFee = parseMoney(cols[shippingIdx]);
      const discount = parseMoney(cols[sellerDiscIdx]);
      const grandTotal = parseMoney(cols[totalPayIdx]);
      const estimatedPayout = parseMoney(cols[estimatedPayoutIdx]);
      const notes = String(cols[notesIdx] || '').trim();

      orderMap.set(orderId, {
        external_order_id: orderId,
        sales_channel: 'shopee',
        tracking_number: resi,
        courier_name: courier,
        order_date: orderDate,
        payment_date: payDate,
        order_status: status,
        recipient_name: recipientName,
        customer_phone: phone,
        shipping_address: address,
        city: city,
        province: province,
        subtotal: item.subtotal,
        discount_amount: discount,
        shipping_cost: shippingFee,
        admin_fee: 0,
        other_fee: 0,
        grand_total: grandTotal || item.subtotal + shippingFee - discount,
        estimated_payout: estimatedPayout,  // Estimasi bersih dari Shopee
        notes: notes ? `Shopee: ${notes}` : 'Pesanan Shopee',
        items: [item],
      });
    } else {
      const existing = orderMap.get(orderId)!;
      existing.items.push(item);
      existing.subtotal += item.subtotal;
    }
  }

  return Array.from(orderMap.values());
}

/**
 * Parse file Excel ekspor pesanan TikTok Shop Seller Center.
 * Mengelompokkan baris item yang memiliki 'Order ID' sama ke dalam 1 pesanan.
 */
export function parseTikTokExcel(rawData: any[][]): ParsedMarketplaceOrder[] {
  if (!rawData || rawData.length === 0) return [];

  let headerRow: string[] = [];
  let startIdx = 0;

  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const line = rawData[i];
    if (Array.isArray(line)) {
      const lineStr = line.map((c) => String(c || '').toLowerCase()).join(' ');
      if (lineStr.includes('order id') || lineStr.includes('id pesanan') || lineStr.includes('sku')) {
        headerRow = line.map((c) => String(c || '').trim());
        startIdx = i + 1;
        break;
      }
    }
  }

  if (headerRow.length === 0 && rawData.length > 0) {
    headerRow = rawData[0].map((c) => String(c || '').trim());
    startIdx = 1;
  }

  const taken = new Set<number>();
  const resolve = (keywords: string[], fallbackIdx: number): number => {
    const idx = getColIdx(headerRow, keywords, fallbackIdx, taken);
    taken.add(idx);
    return idx;
  };

  const orderIdIdx   = resolve(['order id', 'id pesanan', 'no pesanan'], 0);
  const statusIdx    = resolve(['order status', 'status pesanan', 'status'], 1);
  const resiIdx      = resolve(['tracking id', 'no resi', 'tracking number', 'resi'], 4);
  const courierIdx   = resolve(['shipping provider name', 'jasa pengiriman', 'kurir', 'logistics service'], 5);
  const dateIdx      = resolve(['created time', 'waktu dibuat', 'tanggal order', 'waktu pesanan dibuat'], 7);
  const payDateIdx   = resolve(['paid time', 'waktu pembayaran', 'tanggal bayar'], 8);
  const skuIdx       = resolve(['seller sku', 'sku penjual', 'sku', 'nomor referensi sku'], 9);
  const prodNameIdx  = resolve(['product name', 'nama produk', 'produk'], 10);
  const varNameIdx   = resolve(['variation', 'variasi', 'nama variasi'], 11);
  const qtyIdx       = resolve(['quantity', 'jumlah', 'kuantitas', 'qty'], 12);
  const priceIdx     = resolve(['sku subtotal after discount', 'sku unit original price', 'harga satuan', 'unit price'], 14);
  const sellerDiscIdx= resolve(['sku seller discount', 'diskon penjual', 'order discount amount'], 15);
  const shippingIdx  = resolve(['shipping fee after discount', 'shipping fee', 'ongkos kirim', 'ongkir'], 17);
  const estimatedPayoutIdx = resolve(['estimated settlement', 'settlement amount', 'net payment', 'estimasi pembayaran bersih', 'estimasi bersih', 'seller income'], 21);
  const totalAmountIdx = resolve(['order amount', 'total pembayaran', 'total'], 22);
  const messageIdx   = resolve(['buyer message', 'pesan pembeli', 'catatan'], 23);
  const nameIdx      = resolve(['recipient', 'nama penerima', 'penerima'], 24);
  const phoneIdx     = resolve(['phone', 'no telepon', 'no hp', 'telepon'], 25);
  const addressIdx   = resolve(['detail address', 'delivery address', 'alamat pengiriman', 'alamat'], 26);
  const districtIdx  = resolve(['district', 'kecamatan'], 27);
  const cityIdx      = resolve(['city', 'kota', 'kabupaten'], 28);
  const provinceIdx  = resolve(['province', 'provinsi', 'propinsi'], 29);

  const orderMap = new Map<string, ParsedMarketplaceOrder>();

  for (let i = startIdx; i < rawData.length; i++) {
    const cols = rawData[i];
    if (!cols || cols.length < 3) continue;

    const orderId = String(cols[orderIdIdx] || '').trim();
    if (!orderId) continue;

    const rawSku = cols[skuIdx] || '';
    const sku = String(rawSku).trim();
    const prodName = String(cols[prodNameIdx] || 'Produk TikTok').trim();
    const varName = String(cols[varNameIdx] || '').trim();
    const qty = Math.max(1, parseInt(String(cols[qtyIdx] || 1)) || 1);
    const unitPrice = parseMoney(cols[priceIdx]) / (qty || 1);

    const item: ParsedMarketplaceItem = {
      sku: sku || 'NO-SKU',
      product_name: prodName,
      variation_name: varName,
      quantity: qty,
      price: unitPrice || parseMoney(cols[priceIdx]),
      discount_amount: 0,
      subtotal: unitPrice * qty || parseMoney(cols[priceIdx]),
    };

    if (!orderMap.has(orderId)) {
      const orderDate = parseExcelDate(cols[dateIdx]);
      const payDate = cols[payDateIdx] ? parseExcelDate(cols[payDateIdx]) : orderDate;
      const recipientName = String(cols[nameIdx] || 'Pembeli TikTok').trim();
      const phone = String(cols[phoneIdx] || '').trim();
      const rawAddress = String(cols[addressIdx] || '').trim();
      const district = districtIdx !== -1 ? String(cols[districtIdx] || '').trim() : '';
      const fullAddress = district ? `${rawAddress}, Kec. ${district}` : rawAddress;
      const city = String(cols[cityIdx] || '').trim();
      const province = String(cols[provinceIdx] || '').trim();
      const resi = String(cols[resiIdx] || '').trim();
      const courier = String(cols[courierIdx] || 'TikTok Shipping').trim();
      const status = String(cols[statusIdx] || 'To Ship').trim();
      const shippingFee = parseMoney(cols[shippingIdx]);
      const discount = parseMoney(cols[sellerDiscIdx]);
      const grandTotal = parseMoney(cols[totalAmountIdx]);
      const estimatedPayout = parseMoney(cols[estimatedPayoutIdx]);
      const notes = String(cols[messageIdx] || '').trim();

      orderMap.set(orderId, {
        external_order_id: orderId,
        sales_channel: 'tiktok',
        tracking_number: resi,
        courier_name: courier,
        order_date: orderDate,
        payment_date: payDate,
        order_status: status,
        recipient_name: recipientName,
        customer_phone: phone,
        shipping_address: fullAddress,
        city: city,
        province: province,
        subtotal: item.subtotal,
        discount_amount: discount,
        shipping_cost: shippingFee,
        admin_fee: 0,
        other_fee: 0,
        grand_total: grandTotal || item.subtotal + shippingFee - discount,
        estimated_payout: estimatedPayout,  // Estimasi bersih dari TikTok
        notes: notes ? `TikTok: ${notes}` : 'Pesanan TikTok Shop',
        items: [item],
      });
    } else {
      const existing = orderMap.get(orderId)!;
      existing.items.push(item);
      existing.subtotal += item.subtotal;
    }
  }

  return Array.from(orderMap.values());
}

/**
 * Unduh Template Resmi Shopee (50 Kolom) dengan data contoh.
 */
export function downloadShopeeTemplateExcel(availableSkus?: string[]): void {
  const sampleSku1 = availableSkus && availableSkus.length > 0 ? availableSkus[0] : 'PRD-001';
  const sampleSku2 = availableSkus && availableSkus.length > 1 ? availableSkus[1] : 'PRD-002';
  const today = new Date().toISOString().split('T')[0];

  const shopeeHeaders = [
    'No. Pesanan', 'Status Pesanan', 'Alasan Pembatalan', 'Status Pembatalan/ Pengembalian', 'No. Resi',
    'Opsi Pengiriman', 'Antar ke counter/ pick-up', 'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)',
    'Waktu Pengiriman Diatur', 'Waktu Pesanan Dibuat', 'Waktu Pembayaran Dilakukan', 'Tipe Pesanan',
    'Metode Pembayaran', 'SKU Induk', 'Nama Produk', 'Nomor Referensi SKU', 'Nama Variasi', 'Harga Awal',
    'Harga Setelah Diskon', 'Jumlah', 'Returned quantity', 'Subtotal Produk', 'Total Diskon',
    'Diskon Dari Penjual', 'Diskon Dari Shopee', 'Berat Produk', 'Jumlah Produk di Pesan', 'Total Berat',
    'Voucher Ditanggung Penjual', 'Cashback Koin', 'Voucher Ditanggung Shopee', 'Paket Diskon',
    'Paket Diskon (Diskon dari Shopee)', 'Paket Diskon (Diskon dari Penjual)', 'Potongan Koin Shopee',
    'Diskon Kartu Kredit', 'Ongkos Kirim Dibayar oleh Pembeli', 'Estimasi Potongan Biaya Pengiriman',
    'Ongkos Kirim Pengembalian Barang', 'Total Pembayaran', 'Perkiraan Ongkos Kirim', 'Catatan dari Pembeli',
    'Catatan', 'Username (Pembeli)', 'Nama Penerima', 'No. Telepon', 'Alamat Pengiriman', 'Kota/Kabupaten',
    'Provinsi', 'Waktu Pesanan Selesai'
  ];

  const row1 = [
    '240902SHP001', 'Perlu Dikirim', '', '', 'SPXID0123456789',
    'SPX Standard', 'Antar ke Counter', today,
    today, today + ' 10:00:00', today + ' 10:05:00', 'Pesanan Reguler',
    'ShopeePay', sampleSku1, 'Produk Sepatu Kasual', sampleSku1, 'Hitam 41', 120000,
    99000, 1, 0, 99000, 21000,
    21000, 0, 0.8, 1, 0.8,
    0, 0, 0, 0,
    0, 0, 0,
    0, 10000, 0,
    0, 109000, 10000, 'Tolong kirim sebelum jam 3',
    '', 'buyer_shopee_01', 'Ahmad Shopee', '081234567890', 'Jl. Sudirman No. 12', 'KOTA SURABAYA',
    'JAWA TIMUR', ''
  ];

  const row2 = [
    '240902SHP002', 'Perlu Dikirim', '', '', 'JT987654321',
    'J&T Express', 'Pick-up', today,
    today, today + ' 11:30:00', today + ' 11:32:00', 'Pesanan Reguler',
    'COD (Bayar di Tempat)', sampleSku2, 'Produk Sandal Kulit', sampleSku2, 'Coklat 42', 85000,
    75000, 2, 0, 150000, 20000,
    20000, 0, 0.5, 2, 1.0,
    5000, 0, 0, 0,
    0, 0, 0,
    0, 12000, 0,
    0, 157000, 12000, 'Packing kardus tebal ya',
    '', 'buyer_shopee_02', 'Dewi Lestari', '085712345678', 'Jl. Gatot Subroto No. 88', 'KOTA SEMARANG',
    'JAWA TENGAH', ''
  ];

  const ws = XLSX.utils.aoa_to_sheet([shopeeHeaders, row1, row2]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  XLSX.writeFile(wb, `template-order-shopee-seller-center.xlsx`);
}

/**
 * Unduh Template Resmi TikTok Shop Seller Center dengan data contoh.
 */
export function downloadTikTokTemplateExcel(availableSkus?: string[]): void {
  const sampleSku1 = availableSkus && availableSkus.length > 0 ? availableSkus[0] : 'PRD-001';
  const sampleSku2 = availableSkus && availableSkus.length > 1 ? availableSkus[1] : 'PRD-002';
  const today = new Date().toISOString().split('T')[0];

  const tiktokHeaders = [
    'Order ID', 'Order Status', 'Order Substatus', 'Cancelation/Return Status', 'Tracking ID',
    'Shipping Provider Name', 'Shipping Type', 'Created Time', 'Paid Time', 'Seller SKU',
    'Product Name', 'Variation', 'Quantity', 'SKU Unit Original Price', 'SKU Subtotal After Discount',
    'SKU Seller Discount', 'SKU Platform Discount', 'Shipping Fee After Discount', 'Original Shipping Fee',
    'Shipping Fee Seller Discount', 'Shipping Fee Platform Discount', 'Taxes', 'Order Refund Amount',
    'Order Subtotal', 'Order Discount Amount', 'Order Amount', 'Buyer Message', 'Recipient',
    'Phone #', 'Detail Address', 'District', 'City', 'Province', 'Zipcode', 'Country', 'Payment Method'
  ];

  const row1 = [
    '578912345678901234', 'To Ship', 'Awaiting Collection', '', 'JNT12345678',
    'J&T Express', 'Standard Shipping', today + ' 09:15:00', today + ' 09:16:00', sampleSku1,
    'Sneakers Pria Trendy', 'Putih 40', 1, 150000, 119000,
    31000, 0, 9000, 18000,
    0, 9000, 0, 0,
    119000, 31000, 128000, 'Warna putih ya min', 'Rian TikTok',
    '081398765432', 'Jl. Melati No. 5', 'Coblong', 'Kota Bandung', 'Jawa Barat', '40132', 'Indonesia', 'TikTok PayLater'
  ];

  const row2 = [
    '578912345678901235', 'To Ship', 'Awaiting Collection', '', 'NINJA9876543',
    'Ninja Van', 'Standard Shipping', today + ' 14:20:00', today + ' 14:22:00', sampleSku2,
    'Tas Selempang Kanvas', 'Hitam', 2, 75000, 130000,
    20000, 0, 11000, 22000,
    0, 11000, 0, 0,
    130000, 20000, 141000, '', 'Siti Nurhaliza',
    '082156781234', 'Jl. Kenanga No. 17', 'Tebet', 'Kota Jakarta Selatan', 'DKI Jakarta', '12810', 'Indonesia', 'DANA'
  ];

  const ws = XLSX.utils.aoa_to_sheet([tiktokHeaders, row1, row2]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  XLSX.writeFile(wb, `template-order-tiktok-shop.xlsx`);
}
