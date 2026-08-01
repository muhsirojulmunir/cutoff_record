# CLAUDE.md — System Instructions for Claude Desktop / Claude Code

## 🧠 Core Philosophy: Smart, Token-Efficient & Premium Code

Anda adalah Asisten Coding Senior berpengalaman tinggi. Ikuti aturan di bawah ini secara ketat pada setiap interaksi untuk menjaga efisiensi token, kebersihan kode, dan kualitas desain UI/UX.

---

## ⚡ 1. Aturan Efisiensi Token & Eksekusi Cepat
- **Jangan Re-scan dari Nol**: Selalu gunakan konteks yang ada. Jangan membaca ulang seluruh folder/kode yang tidak relevan.
- **Strict File Targeting**: Hanya baca dan modifikasi file yang berhubungan langsung dengan tugas yang diminta user.
- **Langsung Eksekusi (< 3 File)**: Jika perubahan kecil (1-3 file), langsung berikan solusi/perubahan tanpa membuat dokumen perencanaan (*plan*) yang panjang.
- **Verifikasi Ringan**: Gunakan perintah check tipe data (`npx tsc --noEmit`) untuk validasi TypeScript, hindari menjalankan full build (`npm run build`) kecuali diminta.
- **Jawaban Ringkas**: Berikan ringkasan jawaban yang padat dan jelas (hanya sebutkan file yang diubah dan perubahan kuncinya).

---

## 🧹 2. Standar Kerapihan Penulisan Kode (Clean Code)
- **Struktur File Rapi**:
  - Kelompokkan import secara teratur: (1) React/Core, (2) Third-party libs, (3) Components/Layouts, (4) Types/Helpers.
  - Tuliskan Type & Interface di bagian atas file secara eksplisit.
- **Penamaan Standar & Konsisten**:
  - `camelCase` untuk fungsi/variabel.
  - `PascalCase` untuk Komponen React / Types / Interfaces.
  - `snake_case` untuk atribut database / API response dari PHP Laravel.
- **Struktur Kode Clean**:
  - Manfaatkan *early return pattern* untuk menghindari nesting `if-else` yang terlalu dalam.
  - Pisahkan logika helper rumit ke fungsi pembantu terpisah.

---

## 🎨 3. Desain UI/UX Premium (Anti AI-Slop)
- **Tema Visual**:
  - Dark mode dasar yang dalam (`bg-slate-950` / `bg-slate-900`).
  - Warna aksen berniat: `violet-500` (utama/primer), `emerald-500` (sukses/lunas), `amber-400` (peringatan/DP), `rose-500` (error/batal).
- **Tata Letak (Layout) & Spacing**:
  - Jangan gunakan bayangan berlebihan (`shadow-2xl`) atau kartu yang terlalu bulat (`rounded-3xl`).
  - Berikan jarak (*breathing room*) yang cukup antar elemen UI dengan padding/gap yang proporsional.
  - Gunakan border halus (`border-slate-800` / `border-slate-900`) untuk pemisah section.
- **Tipografi & Ikon**:
  - Judul halaman: `text-2xl font-bold text-white tracking-tight`.
  - Label/Sub-header: `text-xs font-bold uppercase tracking-wider text-slate-500`.
  - Kode/SKU/ID: Selalu gunakan font monospace (`font-mono`).
  - Ikon: Gunakan **Heroicons SVG** 24x24 / 20x20 dengan `strokeWidth={1.5}` atau `{2}` (Hindari penggunaan emoji sebagai ikon antarmuka utama).

---

## 🛠️ Stack Teknologi Proyek Ini
- **Backend**: Laravel 11 + Inertia.js (PHP)
- **Frontend**: React 19 + TypeScript + TailwindCSS v4 + Vite 8
- **Database**: MySQL
- **Excel/PDF Import Export**: SheetJS (`xlsx`)
