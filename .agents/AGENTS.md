# AGENTS.md — Aturan Perilaku Proyek Koding ERP

# Dibaca otomatis setiap sesi di workspace ini

## Konteks Proyek

Ini adalah **Sistem ERP** milik user, berbasis:

- **Backend**: Laravel 11 + Inertia.js
- **Frontend**: React 19 + TypeScript + TailwindCSS v4 + Vite 8
- **Database**: MySQL

Knowledge Item lengkap tersimpan di:
`C:/Users/Asus/.gemini/antigravity-ide/knowledge/erp-koding-context/`

**WAJIB** baca KI tersebut sebelum mengerjakan tugas apapun di workspace ini.

---

## Aturan Efisiensi Token

1. **Cek KI dulu** (`project_context.md` + `design_system.md`) sebelum mulai kerja — jangan mulai dari 0.
2. **Hanya baca file yang relevan** dengan tugas. Jangan scan seluruh direktori tanpa alasan.
3. **Jangan build (`npm run build`) untuk task kecil** — cukup `npx tsc --noEmit`.
4. **Untuk task < 3 file: langsung eksekusi**, tidak perlu bikin plan dulu.
5. **Ringkasan respons pendek** — sebutkan hanya file yang diubah + perubahan kunci.

---

## Aturan Kode

### PHP / Laravel

- Super Admin check: `$user->roles->contains('name', 'Super Admin')`
- Permission check: `Gate::authorize('nama.permission')` atau middleware `can:nama.permission`
- Jangan ubah route/URL yang sudah ada kecuali user minta eksplisit
- Field `payment_date` di `sales_orders` bisa berupa string tanggal dari Excel

### TypeScript / React

- Super Admin check: `auth.user?.role?.name === 'Super Admin' || auth.user?.roles?.includes('Super Admin')`
- Permission check: `auth.user?.permissions?.includes('nama.permission')`
- Shared props dari Inertia: `auth.user` (+ `role`, `roles`, `permissions`), `flash`
- Form submit: pakai `useForm` Inertia → `.post()` / `.put()`

---

## Aturan Desain (ANTI AI-SLOP)

Desain harus terasa dibuat manusia senior — bukan AI template generik.

### WAJIB

- Dark base: `bg-slate-950` / `bg-slate-900`
- Aksen: `violet-500` (primary), `emerald-500` (sukses), `rose-500` (error), `amber-400` (warning)
- Icons: **Heroicons SVG** 24x24, bukan emoji untuk UI utama
- Tabel header: `bg-slate-900/30 text-[11px] font-bold uppercase tracking-wider text-slate-500`
- Card: `bg-slate-950 border border-slate-900 rounded-2xl p-6`
- Input: `bg-slate-900 border border-slate-800 rounded-xl focus:border-violet-500`

### DILARANG

- ❌ Warna pastel atau terlalu cerah
- ❌ `shadow-2xl` berlebihan
- ❌ Layout terlalu penuh tanpa breathing room
- ❌ Placeholder "lorem ipsum"
- ❌ Card dengan `rounded-3xl` di elemen kecil

---

## Modul Sidebar (Jangan Ubah Section Laporan & Pengaturan)

```
1. Dashboard
2. Master Data Pembelian: Supplier, Kategori, Produk, Invoice Pabrik, Piutang Pabrik, Gudang
3. Master Data Penjualan: Customer
4. Form Pembelian: Purchase Order
5. Form Penjualan: Sales Order
6. Form Payment: Payment, Petty Cash, Rekening, Ledger Transaksi
7. Laporan Center [JANGAN UBAH]
8. Inventori & Analitik: All Stock, Stock Movements, Marketplace (Akun, Orders, Mappings, Sync Logs)
9. Pengaturan [JANGAN UBAH]
```

---

## Alur Kritis yang Sudah Berjalan

### Grosir Offline → Invoice Otomatis

`/sales-orders/grosir/create` → Upload Excel (.xlsx/.xls) 15 kolom OR Form Manual → Submit → Auto: Customer + Invoice terbit

### Invoice → PDF / Excel Download

`/invoices/{id}` → Klik "Cetak / PDF & Excel" → `/invoices/{id}/print` (tab baru, standalone) → Print PDF via browser OR Download .xlsx via SheetJS

### Marketplace Sync (Shopee/TikTok)

`/marketplace/accounts` → Tambah Akun → Masukkan API Key → Test Connection → Sync Now → Orders masuk → Convert ke Sales Order ERP
