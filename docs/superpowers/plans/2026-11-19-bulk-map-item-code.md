# Ubah Kode Barang Varian Massal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fitur pencarian dan pengubahan/pemetaan kode barang Master Stok massal untuk varian produk Shopee dan TikTok melalui modal interaktif dengan pratinjau sebelum disimpan.

**Architecture:** 
1. Endpoint backend ringan di `ShopeeProductController` dan `TiktokProductController` untuk pencarian varian secara instan (LIKE pada SKU/nama/model/kode) dan eksekusi bulk update `manual_item_code` dengan invalidasi cache audit.
2. Komponen frontend reaktif `BulkMapItemCodeModal.tsx` dengan live search, visual thumbnail produk, multi-selection checkbox, verifikasi kode master stok, preview diff per varian, dan toast notifikasi.
3. Integrasi tombol header bergaya putih bersih `[ ⇄ Ubah Kode Barang ]` pada halaman `Shopee/Products.tsx` dan `Tiktok/Products.tsx`.

**Tech Stack:** Laravel 11, Inertia.js, React 19, TypeScript, TailwindCSS v4, MySQL Eloquent.

## Global Constraints
- Base style: Tombol header berlatar putih bersih (`bg-white`), border abu-abu terang (`border border-slate-300`), teks hitam/gelap (`text-slate-800`), tanpa dark theme pada tombol tersebut.
- Input kode master disanitasi dengan `strtoupper(trim(...))`.
- Invalidasi cache: Memanggil `clearAuditCache` setelah update agar data audit stok fisik seketika sinkron.
- Kompilasi TypeScript harus lolos bersih (`npx tsc --noEmit`).

---

### Task 1: Backend Endpoint Pencarian & Bulk Update Shopee

**Files:**
- Modify: `routes/web.php:71-75`
- Modify: `app/Http/Controllers/ShopeeProductController.php`

**Interfaces:**
- Produces: 
  - `GET /shopee-products/search-variants?q={query}` -> `JsonResponse<{status: 'success', data: Array<VariantItem>}>`
  - `POST /shopee-products/bulk-map` -> `JsonResponse<{status: 'success', updated_count: number, message: string}>`

- [ ] **Step 1: Daftarkan Route di `routes/web.php`**
  Tambahkan route `shopee-products.search-variants` dan `shopee-products.bulk-map` di dalam grup middleware auth.

- [ ] **Step 2: Buat method `searchVariants(Request $request): JsonResponse` di `ShopeeProductController.php`**
  - Ambil parameter `q = trim($request->input('q', ''))`.
  - Jika kosong, kembalikan array kosong.
  - Query ke `ShopeeProduct` mencari match pada `sku`, `item_name`, `model_name`, atau `manual_item_code`.
  - Limit 50 record, select: `id`, `shopee_account_id`, `item_id`, `item_name`, `model_id`, `model_name`, `sku`, `manual_item_code`, `raw_data`.
  - Format output array dengan menyertakan `image_url` dari `raw_data` jika ada.

- [ ] **Step 3: Buat method `bulkMap(Request $request): JsonResponse` di `ShopeeProductController.php`**
  - Validasi: `product_ids` array required min 1, `item_code` string required max 50.
  - Ambil produk-produk berdasarkan `product_ids`.
  - Update `manual_item_code = strtoupper(trim($validated['item_code']))`.
  - Kumpulkan unique `shopee_account_id` dan panggil `self::clearAuditCache($accId)`.
  - Kembalikan response JSON sukses dan jumlah varian terupdate.

- [ ] **Step 4: Verifikasi endpoint via perintah artisan / php**
  Pastikan method dapat dieksekusi tanpa syntax error.

- [ ] **Step 5: Commit perubahan Task 1**
  `git add routes/web.php app/Http/Controllers/ShopeeProductController.php`  
  `git commit -m "feat(shopee): tambahkan endpoint search-variants dan bulk-map kode barang"`

---

### Task 2: Backend Endpoint Pencarian & Bulk Update TikTok

**Files:**
- Modify: `routes/web.php:85-90`
- Modify: `app/Http/Controllers/TiktokProductController.php`

**Interfaces:**
- Produces:
  - `GET /tiktok-products/search-variants?q={query}` -> `JsonResponse<{status: 'success', data: Array<VariantItem>}>`
  - `POST /tiktok-products/bulk-map` -> `JsonResponse<{status: 'success', updated_count: number, message: string}>`

- [ ] **Step 1: Daftarkan Route di `routes/web.php`**
  Tambahkan route `tiktok-products.search-variants` dan `tiktok-products.bulk-map`.

- [ ] **Step 2: Buat method `searchVariants(Request $request): JsonResponse` di `TiktokProductController.php`**
  - Query ke `TiktokProduct` dengan logika yang sama: pencarian pada `sku`, `item_name`, `model_name`, atau `manual_item_code`.
  - Limit 50 record, select kolom ringan dan ekstrak image url.

- [ ] **Step 3: Buat method `bulkMap(Request $request): JsonResponse` di `TiktokProductController.php`**
  - Validasi `product_ids` dan `item_code`.
  - Update `manual_item_code` pada `TiktokProduct`.
  - Panggil `self::clearAuditCache($accId)`.
  - Kembalikan response JSON sukses.

- [ ] **Step 4: Verifikasi sintaks dan route**
  Jalankan validasi syntax php pada controller.

- [ ] **Step 5: Commit perubahan Task 2**
  `git add routes/web.php app/Http/Controllers/TiktokProductController.php`  
  `git commit -m "feat(tiktok): tambahkan endpoint search-variants dan bulk-map kode barang"`

---

### Task 3: Komponen Modal `BulkMapItemCodeModal.tsx`

**Files:**
- Create: `resources/js/Components/Shopee/BulkMapItemCodeModal.tsx`

**Interfaces:**
- Consumes:
  - Endpoints search, master verification, dan bulk map
- Produces:
  - Modal UI lengkap dengan state:
    - Search input & live results table
    - Checkbox selection (Select all / Single)
    - Target code input & master stock verification lookup
    - Diff preview summary (lama -> baru)
    - Submit button with spinner & error alerts

- [ ] **Step 1: Deklarasikan interface dan struktur komponen**
  Buat tipe `VariantSearchItem` dan props modal (`show`, `onClose`, `platform`, `searchEndpoint`, `bulkMapEndpoint`, `verifyMasterEndpoint`, `onSuccess`).

- [ ] **Step 2: Implementasikan fitur pencarian live dengan debounce**
  - Gunakan timer debounce 300ms saat mengetik kata kunci.
  - Tampilkan spinner saat fetching.
  - Render tabel varian dengan checkbox, thumbnail, nama item, variasi, SKU, dan badge status kode saat ini.

- [ ] **Step 3: Implementasikan lookup verifikasi kode Master Stok**
  - Saat input kode baru terisi, panggil endpoint verifikasi untuk menampilkan nama barang dari gudang A/G secara instan.

- [ ] **Step 4: Implementasikan layar pratinjau (Preview Diff) dan tombol eksekusi**
  - Tampilkan rincian: jumlah varian terpilih, kode lama vs kode baru yang akan dipasang.
  - Tombol simpan dengan loading state dan CSRF protection.

- [ ] **Step 5: Verifikasi TypeScript kompilasi komponen**
  Jalankan `npx tsc --noEmit` untuk memastikan komponen bebas dari error tipe.

- [ ] **Step 6: Commit perubahan Task 3**
  `git add resources/js/Components/Shopee/BulkMapItemCodeModal.tsx`  
  `git commit -m "feat(ui): buat komponen BulkMapItemCodeModal untuk pemetaan massal varian"`

---

### Task 4: Integrasi ke Halaman Stok Produk Shopee (`Shopee/Products.tsx`)

**Files:**
- Modify: `resources/js/Pages/Shopee/Products.tsx`

- [ ] **Step 1: Import `BulkMapItemCodeModal` dan siapkan state modal**
  Tambahkan state `showBulkMapModal: boolean` (default false).

- [ ] **Step 2: Tambahkan tombol `[ ⇄ Ubah Kode Barang ]` di Header Aksi**
  - Tempatkan di jajaran tombol header kartu aksi (dekat Export CSV / Audit Stok).
  - Beri styling sesuai permintaan: background putih (`bg-white`), border abu-abu (`border border-slate-300`), teks hitam (`text-slate-800 hover:bg-slate-50`), rounded-xl, bayangan halus shadow-2xs.
  - Ikon: panah bolak-balik horizontal (ArrowsRightLeftIcon).

- [ ] **Step 3: Pasang komponen modal dan handler sukses**
  - Saat modal sukses submit:
    - Tutup modal.
    - Tampilkan Toast notice sukses.
    - Panggil refresh data (`router.reload` / `runMasterAudit`).

- [ ] **Step 4: Verifikasi TypeScript dan fungsionalitas**
  Pastikan `npx tsc --noEmit` lulus tanpa error.

- [ ] **Step 5: Commit perubahan Task 4**
  `git add resources/js/Pages/Shopee/Products.tsx`  
  `git commit -m "feat(shopee): pasang tombol dan integrasikan modal ubah kode barang massal"`

---

### Task 5: Integrasi ke Halaman Stok Produk TikTok (`Tiktok/Products.tsx`)

**Files:**
- Modify: `resources/js/Pages/Tiktok/Products.tsx`

- [ ] **Step 1: Import `BulkMapItemCodeModal` dan siapkan state modal**
  Tambahkan state `showBulkMapModal: boolean` di halaman TikTok Products.

- [ ] **Step 2: Tambahkan tombol `[ ⇄ Ubah Kode Barang ]` di Header Aksi**
  - Pasang tombol putih dengan teks hitam yang identik di header TikTok Products.

- [ ] **Step 3: Sambungkan modal dengan endpoint TikTok**
  - Set `platform="tiktok"`, `searchEndpoint="/tiktok-products/search-variants"`, `bulkMapEndpoint="/tiktok-products/bulk-map"`.
  - Pasang handler refresh setelah berhasil.

- [ ] **Step 4: Verifikasi TypeScript**
  Jalankan `npx tsc --noEmit`.

- [ ] **Step 5: Commit perubahan Task 5**
  `git add resources/js/Pages/Tiktok/Products.tsx`  
  `git commit -m "feat(tiktok): pasang tombol dan integrasikan modal ubah kode barang massal"`

---

### Task 6: Verifikasi Akhir, Build Test, dan Push

**Files:**
- Seluruh file yang telah dimodifikasi dan ditambahkan

- [ ] **Step 1: Jalankan kompilasi TypeScript menyeluruh**
  `npx tsc --noEmit` harus keluar dengan kode 0 tanpa peringatan tipe.

- [ ] **Step 2: Periksa status git diff dan formatting**
  Pastikan semua perubahan bersih dan teratur.

- [ ] **Step 3: Push ke origin main**
  `git push origin main`

- [ ] **Step 4: Laporan akhir ke user**
  Beri ringkasan file dan cara penggunaan fitur baru secara singkat.
