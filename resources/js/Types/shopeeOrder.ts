import { PageProps } from './index';

/**
 * Representasi 1 item produk dalam pesanan Shopee.
 * Sesuai dengan hasil serialisasi ShopeeOrderService::normalizeItemsList.
 */
export interface ShopeeOrderItem {
  item_id: number | null;
  item_name: string;
  item_sku: string | null;
  model_id: number | null;
  model_name: string | null;
  model_sku: string | null;
  sku: string | null;
  model_quantity_purchased: number;
  model_original_price: number;
  model_discounted_price: number;
  image_url: string | null;
  [key: string]: unknown;
}

/**
 * Data alamat dan kontak penerima paket Shopee.
 * Tersimpan sebagai JSON di kolom `recipient_data`.
 */
export interface ShopeeRecipientData {
  name?: string;
  phone?: string;
  full_address?: string;
  district?: string;
  city?: string;
  state?: string;
  region?: string;
  zipcode?: string;
  [key: string]: unknown;
}

/**
 * Status pesanan Shopee resmi.
 */
export type ShopeeOrderStatus =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'RETRY_SHIP'
  | 'PROCESSED'
  | 'SHIPPED'
  | 'TO_CONFIRM_RECEIVE'
  | 'COMPLETED'
  | 'IN_CANCEL'
  | 'CANCELLED'
  | 'TO_RETURN'
  | string;

/**
 * Metode fulfillment pengiriman Shopee:
 * - pickup: Kurir menjemput ke alamat seller
 * - dropoff: Seller mengantar ke counter / drop-off point
 * - non_integrated: Kurir tidak terintegrasi
 */
export type ShopeeFulfillmentMethod = 'pickup' | 'dropoff' | 'non_integrated' | string;

/**
 * Status pembuatan dokumen resi (waybill).
 */
export type ShopeeLabelDocumentStatus = 'NONE' | 'READY' | 'FAILED' | string;

/**
 * Data paket pengiriman dalam `package_list_json`.
 */
export interface ShopeePackageItem {
  package_number?: string;
  logistics_status?: string;
  shipping_carrier?: string;
  tracking_number?: string;
  item_list?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Record pesanan Shopee di database ERP (tabel `shopee_orders`).
 * Field raw_payload disembunyikan oleh controller makeHidden(['raw_payload']).
 */
export interface ShopeeOrderRecord {
  id: number;
  shopee_account_id: number;
  order_sn: string;
  package_number: string | null;
  order_status: ShopeeOrderStatus;
  logistics_status: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  fulfillment_method: ShopeeFulfillmentMethod | null;
  buyer_user_id: number | null;
  buyer_username: string | null;
  buyer_note: string | null;
  recipient_data: ShopeeRecipientData | null;
  items_json: ShopeeOrderItem[] | null;
  package_list_json: ShopeePackageItem[] | null;
  payment_method: string | null;
  is_cod: boolean;
  total_amount: number | string;
  estimated_shipping_fee: number | string;
  cancel_by: string | null;
  cancel_reason: string | null;
  buyer_cancel_reason: string | null;
  order_created_at: string | null;
  ship_by_date: string | null;
  shipping_arranged_at: string | null;
  label_document_status: ShopeeLabelDocumentStatus;
  label_printed_at: string | null;
  label_print_count: number;
  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Counter jumlah pesanan per tab / status untuk badge angka pada UI.
 * Sesuai dengan hasil ShopeeOrderController::fetchTabCounts.
 */
export interface ShopeeTabCounts {
  all: number;
  unpaid: number;
  to_ship: number;
  to_ship_unprocessed: number;
  to_ship_processed: number;
  shipped: number;
  completed: number;
  cancelled: number;
  unprinted: number;
  printed: number;
}

/**
 * Tab navigasi utama pada halaman Pesanan Saya Shopee.
 */
export type ShopeeMainTab =
  | 'all'
  | 'unpaid'
  | 'to_ship'
  | 'shipped'
  | 'completed'
  | 'cancelled';

/**
 * Sub-tab khusus ketika tab utama adalah `to_ship`.
 */
export type ShopeeSubTab = 'all' | 'unprocessed' | 'processed';

/**
 * Filter status cetak resi.
 */
export type ShopeePrintStatusFilter = 'all' | 'unprinted' | 'printed';

/**
 * Filter tipe layanan pengiriman (Tipe Pesanan) pada Pesanan Saya Shopee.
 */
export type ShopeeOrderType = 'all' | 'regular' | 'instant' | 'kilat';

/**
 * Counter rincian per Tipe Pesanan sesuai tab/status aktif.
 */
export interface ShopeeOrderTypeCounts {
  all: number;
  regular: number;
  instant: number;
  kilat: number;
}

/**
 * Urutan pengurutan daftar pesanan Shopee.
 */
export type ShopeeOrderSort = 'ship_by_asc' | 'newest' | 'oldest';

/**
 * Filter yang dikirim balik oleh ShopeeOrderController::index.
 */
export interface ShopeeOrderFilters {
  tab: ShopeeMainTab;
  sub_tab: ShopeeSubTab;
  order_type: ShopeeOrderType;
  print_status: ShopeePrintStatusFilter;
  search: string;
  courier: string;
  date_from: string;
  date_to: string;
  sort: ShopeeOrderSort;
}

/**
 * Slot waktu penjemputan paket kurir (pickup).
 */
export interface ShopeePickupTimeSlot {
  pickup_time_id: string;
  date?: number | string;
  time_text?: string;
  [key: string]: unknown;
}

/**
 * Alamat penjemputan seller untuk pengiriman pickup.
 */
export interface ShopeePickupAddress {
  address_id: number;
  region?: string;
  state?: string;
  city?: string;
  district?: string;
  town?: string;
  address?: string;
  zipcode?: string;
  address_flag?: string[];
  time_slot_list?: ShopeePickupTimeSlot[];
  [key: string]: unknown;
}

/**
 * Kantor cabang / drop-off point kurir Shopee.
 */
export interface ShopeeDropoffBranch {
  branch_id: number;
  branch_name?: string;
  address?: string;
  region?: string;
  state?: string;
  city?: string;
  district?: string;
  town?: string;
  zipcode?: string;
  [key: string]: unknown;
}

/**
 * Slug dropoff kurir Shopee.
 */
export interface ShopeeDropoffSlug {
  slug: string;
  slug_name?: string;
  [key: string]: unknown;
}

/**
 * Kolom yang dibutuhkan oleh Shopee API logistics get_shipping_parameter.
 */
export interface ShopeeShippingInfoNeeded {
  pickup?: string[];
  dropoff?: string[];
  non_integrated?: string[];
  [key: string]: unknown;
}

/**
 * Respons endpoint ShopeeOrderController::shippingParameters.
 */
export interface ShopeeShippingParameterResponse {
  status: 'success' | 'error';
  message?: string;
  order_sn: string;
  package_number: string | null;
  info_needed: ShopeeShippingInfoNeeded;
  pickup_supported: boolean;
  dropoff_supported: boolean;
  non_integrated_supported: boolean;
  pickup: {
    address_list: ShopeePickupAddress[];
    [key: string]: unknown;
  };
  dropoff: {
    branch_list: ShopeeDropoffBranch[];
    slug_list?: ShopeeDropoffSlug[];
    [key: string]: unknown;
  };
}

/**
 * Item sukses pada proses mass-ship Shopee.
 */
export interface ShopeeMassShipSuccessItem {
  order_sn: string;
  tracking_number: string | null;
  fulfillment_method: string | null;
  order_status: string;
}

/**
 * Item gagal pada proses mass-ship Shopee.
 */
export interface ShopeeMassShipFailedItem {
  order_sn: string;
  message: string;
}

/**
 * Hasil eksekusi pengiriman massal (mass ship).
 */
export interface ShopeeMassShipResult {
  status?: 'success' | 'error';
  total: number;
  succeeded: ShopeeMassShipSuccessItem[];
  failed: ShopeeMassShipFailedItem[];
  message: string;
}

/**
 * Ringkasan akun Shopee yang aman dikirim ke frontend (toSafeArray()).
 */
export interface ShopeeAccountSummary {
  id: number;
  account_name: string;
  shop_id: string | number;
  partner_id?: string | number | null;
  status: string;
  connection_status: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_by?: number | null;
  has_credentials: boolean;
  has_tokens: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * Item pagination link khas Laravel.
 */
export interface ShopeePaginationLink {
  url: string | null;
  label: string;
  active: boolean;
}

/**
 * Struktur paginasi Laravel untuk koleksi pesanan Shopee.
 */
export interface PaginatedShopeeOrders {
  data: ShopeeOrderRecord[];
  current_page: number;
  first_page_url?: string;
  from: number | null;
  last_page: number;
  last_page_url?: string;
  links: ShopeePaginationLink[];
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

/**
 * Props halaman Inertia Pesanan Saya (Shopee/Orders.tsx).
 */
export interface ShopeeOrdersPageProps extends PageProps {
  account: ShopeeAccountSummary | null;
  orders: PaginatedShopeeOrders;
  tabCounts: ShopeeTabCounts;
  orderTypeCounts: ShopeeOrderTypeCounts;
  carriers: string[];
  filters: ShopeeOrderFilters;
}

/**
 * Hasil sinkronisasi inkremental otomatis (POST /shopee-orders/auto-sync).
 */
export interface ShopeeAutoSyncResponse {
  status: 'success' | 'skipped' | 'error';
  skipped?: boolean;
  reason?: string | null;
  total_fetched?: number;
  synced_orders: number;
  changed_orders: number;
  cutoff_created?: number;
  cutoff_updated?: number;
  last_synced_at?: string | null;
  message: string;
}

/**
 * Hasil sinkronisasi 1 chunk tanggal anti-503 (POST /shopee-orders/sync-chunk).
 */
export interface ShopeeSyncChunkResponse {
  status: 'success' | 'error';
  total_fetched: number;
  synced_orders: number;
  changed_orders: number;
  cutoff_created: number;
  cutoff_updated: number;
  last_synced_at?: string | null;
  message: string;
}

/**
 * Hasil atur pengiriman 1 pesanan (shipOrder).
 */
export interface ShopeeShipResult {
  status?: 'success' | 'error';
  order_sn: string;
  tracking_number: string | null;
  fulfillment_method: string | null;
  order_status: string;
  shipping_arranged_at: string | null;
  order: ShopeeOrderRecord;
  message: string;
}

/**
 * Hasil tanggapan pengajuan pembatalan pembeli.
 */
export interface ShopeeBuyerCancellationResult {
  status?: 'success' | 'error';
  order_sn: string;
  operation: 'ACCEPT' | 'REJECT';
  order_status: string;
  order: ShopeeOrderRecord;
  message: string;
}

/**
 * Hasil refresh detail 1 pesanan.
 */
export interface ShopeeRefreshDetailResponse {
  status: 'success' | 'error';
  message: string;
  order: ShopeeOrderRecord;
}

