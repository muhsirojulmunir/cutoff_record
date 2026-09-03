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

export interface ParsedMarketplaceFeeBreakdown {
  platform_fee?: number;
  service_fee?: number;
  extra_shipping_fee?: number;
  promo_fee?: number;
  voucher_subsidy?: number;
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
  service_fee?: number;
  voucher_discount?: number;
  grand_total: number;
  estimated_payout: number;  // Estimasi pembayaran bersih dari platform (income seller)
  fee_details?: ParsedMarketplaceFeeBreakdown;
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

  const adminFeeIdx  = resolve(['biaya administrasi', 'biaya admin', 'biaya platform', 'biaya transaksi', 'biaya kartu kredit'], -1);
  const serviceFeeIdx= resolve(['biaya layanan', 'service fee', 'biaya gratis ongkir xtra', 'gratis ongkir xtra'], -1);
  const promoFeeIdx  = resolve(['biaya promosi', 'potongan promosi'], -1);

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

      const rawAdmin = adminFeeIdx !== -1 ? parseMoney(cols[adminFeeIdx]) : 0;
      const rawService = serviceFeeIdx !== -1 ? parseMoney(cols[serviceFeeIdx]) : 0;
      const rawPromo = promoFeeIdx !== -1 ? parseMoney(cols[promoFeeIdx]) : 0;

      let adminFee = rawAdmin;
      let serviceFee = rawService;
      let otherFee = rawPromo;

      // Jika ada estimatedPayout tapi fee belum ada di Excel, hitung otomatis selisihnya sebagai biaya platform
      if (adminFee === 0 && serviceFee === 0 && estimatedPayout > 0 && item.subtotal > estimatedPayout) {
        adminFee = Math.max(0, (item.subtotal + shippingFee - discount) - estimatedPayout);
      }

      const feeDetails: ParsedMarketplaceFeeBreakdown = {
        platform_fee: adminFee,
        service_fee: serviceFee,
        promo_fee: otherFee,
        voucher_subsidy: discount,
      };

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
        admin_fee: adminFee,
        other_fee: otherFee,
        service_fee: serviceFee,
        voucher_discount: discount,
        grand_total: grandTotal || item.subtotal + shippingFee - discount,
        estimated_payout: estimatedPayout,  // Estimasi bersih dari Shopee
        fee_details: feeDetails,
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
      if (
        lineStr.includes('order id') || lineStr.includes('id pesanan') ||
        lineStr.includes('seller sku') || lineStr.includes('sku penjual')
      ) {
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

  // --- Kolom identitas pesanan ---
  const orderIdIdx   = resolve(['order id', 'id pesanan', 'no pesanan', 'order number'], 0);
  const statusIdx    = resolve(['order status', 'status pesanan', 'status'], 1);
  const resiIdx      = resolve(['tracking id', 'tracking number', 'no resi', 'nomor resi', 'resi', 'waybill'], 2);
  const courierIdx   = resolve(['shipping provider name', 'shipping provider', 'jasa kirim', 'jasa pengiriman', 'kurir', 'logistics service', 'logistics provider'], 3);
  const dateIdx      = resolve(['created time', 'order create time', 'waktu buat pesanan', 'waktu pesanan dibuat', 'waktu dibuat', 'tanggal pesanan'], 5);
  const payDateIdx   = resolve(['paid time', 'waktu bayar', 'waktu pembayaran', 'tanggal bayar', 'payment time'], 6);

  // --- Kolom produk ---
  const skuIdx       = resolve(['seller sku', 'sku penjual', 'seller sku id', 'sku id', 'sku'], 7);
  const prodNameIdx  = resolve(['product name', 'nama produk', 'product'], 8);
  const varNameIdx   = resolve(['variation', 'variasi', 'nama variasi', 'variant name', 'sku name'], 9);
  const qtyIdx       = resolve(['quantity', 'jumlah', 'qty', 'kuantitas'], 10);
  const unitPriceIdx = resolve(['sku unit original price', 'unit original price', 'harga satuan', 'unit price', 'original price', 'harga awal'], 11);
  const sellerDiscIdx = resolve(['sku seller discount', 'seller discount', 'diskon penjual', 'seller promo'], 12);
  const itemSubtotalIdx = resolve(['sku subtotal after discount', 'subtotal produk', 'sku subtotal', 'item subtotal'], 13);

  // --- Kolom biaya pengiriman ---
  const shippingBuyerIdx  = resolve(['shipping fee paid by buyer', 'shipping fee buyer', 'ongkos kirim pembeli', 'ongkos kirim dibayar pembeli', 'buyer shipping fee'], 14);
  const shippingDiscIdx   = resolve(['shipping fee seller discount', 'shipping discount', 'diskon ongkir penjual'], 15);
  const shippingFinalIdx  = resolve(['shipping fee after discount', 'ongkir setelah diskon', 'actual shipping fee'], 16);

  // --- Kolom total & settlement ---
  const totalAmountIdx     = resolve(['order amount', 'total pembayaran', 'total amount', 'order total', 'total'], 17);
  const estimatedPayoutIdx = resolve([
    'settlement amount', 'estimated settlement', 'net payment', 'seller income',
    'perkiraan pembayaran bersih', 'estimasi pembayaran bersih', 'estimasi bersih',
    'total pembayaran yang diterima', 'total diterima penjual',
  ], 18);
  const payMethodIdx = resolve(['payment method', 'metode pembayaran'], 19);

  const platformFeeIdx = resolve(['platform commission', 'biaya komisi', 'komisi platform', 'biaya platform'], -1);
  const serviceFeeIdx  = resolve(['service fee', 'biaya layanan', 'payment fee', 'biaya transaksi'], -1);

  // --- Kolom penerima ---
  const messageIdx   = resolve(['buyer message', 'buyer note', 'catatan pembeli', 'pesan pembeli', 'catatan'], 20);
  const nameIdx      = resolve(['recipient', 'nama penerima', 'recipient name', 'penerima'], 21);
  const phoneIdx     = resolve(['phone #', 'phone number', 'phone', 'no hp', 'no telepon', 'nomor telepon', 'telepon'], 22);
  const addressIdx   = resolve(['detail address', 'full address', 'alamat lengkap', 'alamat pengiriman', 'delivery address', 'alamat'], 23);
  const districtIdx  = resolve(['district', 'kecamatan'], 24);
  const cityIdx      = resolve(['city', 'kota', 'kabupaten', 'kota kabupaten'], 25);
  const provinceIdx  = resolve(['province', 'provinsi', 'propinsi'], 26);

  const orderMap = new Map<string, ParsedMarketplaceOrder>();

  for (let i = startIdx; i < rawData.length; i++) {
    const cols = rawData[i];
    if (!cols || cols.length < 3) continue;

    const orderId = String(cols[orderIdIdx] || '').trim();
    if (!orderId) continue;

    const rawSku  = cols[skuIdx] || '';
    const sku     = String(rawSku).trim();
    const prodName = String(cols[prodNameIdx] || 'Produk TikTok').trim();
    const varName  = String(cols[varNameIdx] || '').trim();
    const qty      = Math.max(1, parseInt(String(cols[qtyIdx] || 1)) || 1);

    // Gunakan unit price langsung (bukan subtotal / qty)
    const rawUnitPrice = parseMoney(cols[unitPriceIdx]);
    const rawSubtotal  = cols[itemSubtotalIdx] !== undefined ? parseMoney(cols[itemSubtotalIdx]) : 0;
    const unitPrice    = rawUnitPrice > 0 ? rawUnitPrice : (rawSubtotal > 0 ? rawSubtotal / qty : 0);
    const itemSubtotal = rawSubtotal > 0 ? rawSubtotal : unitPrice * qty;

    const item: ParsedMarketplaceItem = {
      sku: sku || 'NO-SKU',
      product_name: prodName,
      variation_name: varName,
      quantity: qty,
      price: unitPrice,
      discount_amount: parseMoney(cols[sellerDiscIdx]),
      subtotal: itemSubtotal,
    };

    if (!orderMap.has(orderId)) {
      const orderDate    = parseExcelDate(cols[dateIdx]);
      const payDate      = cols[payDateIdx] ? parseExcelDate(cols[payDateIdx]) : orderDate;
      const recipientName = String(cols[nameIdx] || 'Pembeli TikTok').trim();
      const phone        = String(cols[phoneIdx] || '').trim();
      const rawAddress   = String(cols[addressIdx] || '').trim();
      const district     = String(cols[districtIdx] || '').trim();
      const fullAddress  = district ? `${rawAddress}, Kec. ${district}` : rawAddress;
      const city         = String(cols[cityIdx] || '').trim();
      const province     = String(cols[provinceIdx] || '').trim();
      const resi         = String(cols[resiIdx] || '').trim();
      const courier      = String(cols[courierIdx] || 'TikTok Shipping').trim();
      const status       = String(cols[statusIdx] || 'To Ship').trim();

      // Ongkir: prefer shipping_final → shipping_buyer → 0
      const shippingFee = parseMoney(cols[shippingFinalIdx]) || parseMoney(cols[shippingBuyerIdx]);
      const discount    = parseMoney(cols[sellerDiscIdx]);
      const grandTotal  = parseMoney(cols[totalAmountIdx]);
      const estimatedPayout = parseMoney(cols[estimatedPayoutIdx]);
      const notes       = String(cols[messageIdx] || '').trim();

      const rawPlatform = platformFeeIdx !== -1 ? parseMoney(cols[platformFeeIdx]) : 0;
      const rawService  = serviceFeeIdx !== -1 ? parseMoney(cols[serviceFeeIdx]) : 0;

      let adminFee = rawPlatform;
      let serviceFee = rawService;

      if (adminFee === 0 && serviceFee === 0 && estimatedPayout > 0 && item.subtotal > estimatedPayout) {
        adminFee = Math.max(0, (item.subtotal + shippingFee - discount) - estimatedPayout);
      }

      const feeDetails: ParsedMarketplaceFeeBreakdown = {
        platform_fee: adminFee,
        service_fee: serviceFee,
        voucher_subsidy: discount,
      };

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
        city,
        province,
        subtotal: item.subtotal,
        discount_amount: discount,
        shipping_cost: shippingFee,
        admin_fee: adminFee,
        other_fee: 0,
        service_fee: serviceFee,
        voucher_discount: discount,
        grand_total: grandTotal || item.subtotal + shippingFee - discount,
        estimated_payout: estimatedPayout,
        fee_details: feeDetails,
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
 * Unduh Template TikTok Shop Seller Center — format disesuaikan agar terbaca otomatis oleh sistem.
 *
 * Urutan kolom:
 * 0  Order ID           | 1  Order Status       | 2  Tracking ID          | 3  Shipping Provider Name
 * 4  Fulfillment Type   | 5  Created Time        | 6  Paid Time            | 7  Seller SKU
 * 8  Product Name       | 9  Variation           | 10 Quantity             | 11 SKU Unit Original Price
 * 12 SKU Seller Discount| 13 SKU Subtotal After Discount                   | 14 Shipping Fee (Buyer Paid)
 * 15 Shipping Fee Seller Discount                | 16 Shipping Fee After Discount
 * 17 Order Amount       | 18 Settlement Amount   | 19 Payment Method
 * 20 Buyer Message      | 21 Recipient           | 22 Phone #              | 23 Detail Address
 * 24 District           | 25 City                | 26 Province             | 27 Zipcode
 * 28 Country            | 29 Cancel Reason       | 30 Buyer Username
 */
export function downloadTikTokTemplateExcel(availableSkus?: string[]): void {
  const sampleSku1 = availableSkus && availableSkus.length > 0 ? availableSkus[0] : 'PRD-001';
  const sampleSku2 = availableSkus && availableSkus.length > 1 ? availableSkus[1] : 'PRD-002';
  const today = new Date().toISOString().split('T')[0];

  // Header disesuaikan agar tepat dibaca oleh parseTikTokExcel
  // Kolom kritis: Order ID (0), Tracking ID (2), SKU (7), Qty (10), Unit Price (11),
  //               Shipping Fee After Discount (16), Order Amount (17), Settlement Amount (18),
  //               Recipient (21), Phone (22), Address (23), District (24), City (25), Province (26)
  const tiktokHeaders = [
    /* 0 */ 'Order ID',
    /* 1 */ 'Order Status',
    /* 2 */ 'Tracking ID',
    /* 3 */ 'Shipping Provider Name',
    /* 4 */ 'Fulfillment Type',
    /* 5 */ 'Created Time',
    /* 6 */ 'Paid Time',
    /* 7 */ 'Seller SKU',
    /* 8 */ 'Product Name',
    /* 9 */ 'Variation',
    /* 10 */ 'Quantity',
    /* 11 */ 'SKU Unit Original Price',
    /* 12 */ 'SKU Seller Discount',
    /* 13 */ 'SKU Subtotal After Discount',
    /* 14 */ 'Shipping Fee (Buyer Paid)',
    /* 15 */ 'Shipping Fee Seller Discount',
    /* 16 */ 'Shipping Fee After Discount',
    /* 17 */ 'Order Amount',
    /* 18 */ 'Settlement Amount',
    /* 19 */ 'Payment Method',
    /* 20 */ 'Buyer Message',
    /* 21 */ 'Recipient',
    /* 22 */ 'Phone #',
    /* 23 */ 'Detail Address',
    /* 24 */ 'District',
    /* 25 */ 'City',
    /* 26 */ 'Province',
    /* 27 */ 'Zipcode',
    /* 28 */ 'Country',
    /* 29 */ 'Cancel Reason',
    /* 30 */ 'Buyer Username',
  ];

  // Contoh row 1: 1 item, qty=1, harga 119.000, settlement 110.000 (setelah potong komisi 5%)
  const row1 = [
    /* 0  Order ID              */ '578912345678901234',
    /* 1  Order Status          */ 'Completed',
    /* 2  Tracking ID           */ 'JNT12345678901',
    /* 3  Shipping Provider     */ 'J&T Express',
    /* 4  Fulfillment Type      */ 'Standard',
    /* 5  Created Time          */ today + ' 09:15:00',
    /* 6  Paid Time             */ today + ' 09:16:00',
    /* 7  Seller SKU            */ sampleSku1,
    /* 8  Product Name          */ 'Sneakers Pria Trendy',
    /* 9  Variation             */ 'Putih Ukuran 40',
    /* 10 Quantity              */ 1,
    /* 11 Unit Original Price   */ 150000,
    /* 12 SKU Seller Discount   */ 31000,
    /* 13 SKU Subtotal After    */ 119000,
    /* 14 Shipping Fee Buyer    */ 18000,
    /* 15 Shipping Disc Seller  */ 9000,
    /* 16 Shipping After Disc   */ 9000,
    /* 17 Order Amount          */ 128000,
    /* 18 Settlement Amount     */ 113100,
    /* 19 Payment Method        */ 'TikTok PayLater',
    /* 20 Buyer Message         */ 'Warna putih ya min',
    /* 21 Recipient             */ 'Rian TikTok',
    /* 22 Phone #               */ '081398765432',
    /* 23 Detail Address        */ 'Jl. Melati No. 5',
    /* 24 District              */ 'Coblong',
    /* 25 City                  */ 'Kota Bandung',
    /* 26 Province              */ 'Jawa Barat',
    /* 27 Zipcode               */ '40132',
    /* 28 Country               */ 'Indonesia',
    /* 29 Cancel Reason         */ '',
    /* 30 Buyer Username        */ 'buyer_tiktok_01',
  ];

  // Contoh row 2: 1 pesanan tapi 2 baris (2 item berbeda sku dalam 1 order)
  const row2 = [
    /* 0  Order ID              */ '578912345678901235',
    /* 1  Order Status          */ 'Completed',
    /* 2  Tracking ID           */ 'NINJA9876543210',
    /* 3  Shipping Provider     */ 'Ninja Van',
    /* 4  Fulfillment Type      */ 'Standard',
    /* 5  Created Time          */ today + ' 14:20:00',
    /* 6  Paid Time             */ today + ' 14:22:00',
    /* 7  Seller SKU            */ sampleSku2,
    /* 8  Product Name          */ 'Tas Selempang Kanvas',
    /* 9  Variation             */ 'Hitam',
    /* 10 Quantity              */ 2,
    /* 11 Unit Original Price   */ 75000,
    /* 12 SKU Seller Discount   */ 10000,
    /* 13 SKU Subtotal After    */ 140000,
    /* 14 Shipping Fee Buyer    */ 22000,
    /* 15 Shipping Disc Seller  */ 11000,
    /* 16 Shipping After Disc   */ 11000,
    /* 17 Order Amount          */ 151000,
    /* 18 Settlement Amount     */ 136000,
    /* 19 Payment Method        */ 'DANA',
    /* 20 Buyer Message         */ '',
    /* 21 Recipient             */ 'Siti Nurhaliza',
    /* 22 Phone #               */ '082156781234',
    /* 23 Detail Address        */ 'Jl. Kenanga No. 17',
    /* 24 District              */ 'Tebet',
    /* 25 City                  */ 'Kota Jakarta Selatan',
    /* 26 Province              */ 'DKI Jakarta',
    /* 27 Zipcode               */ '12810',
    /* 28 Country               */ 'Indonesia',
    /* 29 Cancel Reason         */ '',
    /* 30 Buyer Username        */ 'buyer_tiktok_02',
  ];

  const ws = XLSX.utils.aoa_to_sheet([tiktokHeaders, row1, row2]);

  // Set lebar kolom agar mudah dibaca
  ws['!cols'] = [
    { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
    { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 16 },
    { wch: 8  }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 26 }, { wch: 12 },
    { wch: 18 }, { wch: 16 }, { wch: 8  }, { wch: 10 }, { wch: 14 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  XLSX.writeFile(wb, `template-order-tiktok-shop.xlsx`);
}
