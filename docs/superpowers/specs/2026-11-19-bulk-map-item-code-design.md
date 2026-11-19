# Spesifikasi Desain: Fitur Ubah Kode Barang Varian Massal (Shopee & TikTok)

**Tanggal**: 19 November 2026  
**Status**: Disetujui (Approved)  
**Tujuan**: Memungkinkan admin mengubah atau memetakan kode barang Master Stok ke seluruh varian produk (lintas ukuran, warna, atau katalog) secara massal melalui pencarian cerdas dan pratinjau sebelum eksekusi.

---

## 1. Latar Belakang & Masalah
Di sistem ERP Koding, setiap SKU variasi marketplace (Shopee & TikTok) dicocokkan dengan `item_code` Master Stok gudang melalui kolom `manual_item_code`.
Sebelumnya:
* Pemetaan hanya dapat dilakukan satu per satu per baris variasi melalui modal kecil "Hubungkan Manual".
* Ketika sebuah katalog produk (misalnya: *Jayden HP*) memiliki 6-10 variasi ukuran (31, 32, 33, dst.), admin harus mengulang proses mapping sebanyak jumlah ukuran tersebut.
* Belum ada fitur pencarian global untuk merubah kode barang varian yang tersebar di katalog berbeda secara sekaligus.

---

## 2. Antarmuka Pengguna (UI / UX)

### A. Tombol Masuk di Header
* **Lokasi**: Di samping tombol aksi utama pada:
  - `resources/js/Pages/Shopee/Products.tsx`
  - `resources/js/Pages/Tiktok/Products.tsx`
* **Desain Visual**:
  - Latar putih (`bg-white`), teks hitam/gelap (`text-slate-800 hover:bg-slate-50`), border rapi (`border border-slate-300 shadow-2xs rounded-xl font-semibold px-4 py-2 text-xs`).
  - Label: **`[ ⇄ Ubah Kode Barang ]`** dengan ikon panah bolak-balik (Heroicons).

### B. Komponen Modal: `BulkMapItemCodeModal`
Modal interaktif mandiri yang menyajikan alur kerja terpadu:
1. **Langkah 1 - Pencarian Varian**:
   - Kolom pencarian dengan placeholder: *"Cari SKU, Nama Produk, atau Artikel (contoh: jayden_hp_31 atau jayden)..."*.
   - Pencarian otomatis dengan debounce 300ms.
   - Tabel hasil pencarian:
     - Checkbox master di header (Pilih Semua / Batal Semua).
     - Checkbox individual per baris variasi.
     - Kolom: Thumbnail & Nama Produk, Variasi (Warna/Ukuran), SKU Asli Marketplace, dan Status Kode Barang saat ini (badge hijau jika sudah `Terhubung: {kode}`, badge kuning jika `Belum Terhubung`).
2. **Langkah 2 - Masukkan Kode Barang Target**:
   - Input teks: `Kode Barang Master Baru` (misal diketik: `31231`).
   - Sistem melakukan pengecekan real-time ke database `master_stocks`:
     - Jika ditemukan: Muncul info nama barang master (contoh: *✓ Ditemukan: JAYDEN HITAM PUTIH 31*).
     - Jika tidak ditemukan: Muncul indikator bahwa kode ini baru/tidak ada di katalog gudang.
3. **Langkah 3 - Pratinjau Perubahan (Preview Diff)**:
   - Panel ringkasan pratinjau:
     - Menampilkan jumlah varian terpilih yang akan diubah.
     - Ringkasan perubahan: `Kode Lama` ➔ `Kode Baru (31231)`.
4. **Langkah 4 - Eksekusi & Konfirmasi**:
   - Tombol utama: **`[ Terapkan ke {N} Varian Terpilih ]`**.
   - Spinner loading saat data diproses di backend.
   - Notifikasi Toast sukses: *"Berhasil memperbarui {N} varian ke kode barang 31231"*.
   - Modal tertutup dan tabel utama otomatis me-refresh data stok fisik gudang.

---

## 3. Arsitektur Backend & Data Flow

### A. Endpoint Baru
1. **Pencarian Cepat Varian**:
   - `GET /shopee-products/search-variants?q={query}`
   - `GET /tiktok-products/search-variants?q={query}`
   - **Logika**: Mencari record pada `ShopeeProduct` atau `TiktokProduct` dengan query:
     - `sku LIKE %q%` OR `item_name LIKE %q%` OR `model_name LIKE %q%` OR `manual_item_code LIKE %q%`
   - **Limit**: Maksimal 50 record teratas, mengembalikan kolom ringan (`id`, `sku`, `item_name`, `model_name`, `manual_item_code`, `image_url`).

2. **Eksekusi Pemetaan Massal**:
   - `POST /shopee-products/bulk-map`
   - `POST /tiktok-products/bulk-map`
   - **Request Payload**:
     ```json
     {
       "product_ids": [101, 102, 103, 104],
       "item_code": "31231"
     }
     ```
   - **Validasi**:
     - `product_ids`: `required|array|min:1`
     - `product_ids.*`: `integer|exists:shopee_products,id` (atau `tiktok_products,id`)
     - `item_code`: `required|string|max:50`
   - **Logika Update**:
     - Melakukan bulk update: `manual_item_code = strtoupper(trim($item_code))` pada seluruh ID terpilih.
     - Memanggil `clearAuditCache($accountId)` untuk membersihkan cache audit stok sehingga data instan terbarui.
     - Mengembalikan respons JSON: `{"status": "success", "updated_count": 4, "message": "..."}`.

---

## 4. Keamanan & Validasi
* **Otentikasi & Hak Akses**: Endpoint dilindungi middleware `auth` dan pengecekan otorisasi yang setara dengan modul marketplace.
* **Perlindungan Token CSRF**: Seluruh request POST menyertakan header `X-CSRF-TOKEN`.
* **Sanitasi Input**: Kode barang dibersihkan dengan `strtoupper(trim(...))` untuk konsistensi penulisan format Master Stok.

---

## 5. Rencana Pengujian & Verifikasi
1. **Pengecekan Tipe Data**: Menjalankan `npx tsc --noEmit` untuk memastikan tidak ada kesalahan TypeScript pada modal dan halaman.
2. **Uji Fungsionalitas**:
   - Pengujian pencarian varian dengan berbagai kata kunci (kata tunggal, model, ukuran, atau kode lama).
   - Pengujian verifikasi kode master stok di UI.
   - Pengujian pemilihan varian (semua vs sebagian).
   - Pengujian eksekusi bulk update dan verifikasi bahwa stok fisik pada tabel utama langsung terisi sesuai kode master yang baru.
