/**
 * Helper angka untuk input berformat Indonesia.
 *
 * Dipisah dari komponen supaya logikanya murni dan bisa diuji sendiri —
 * kesalahan di sini langsung berakibat pada nominal uang yang tersimpan.
 */

/** Ambil digit saja, lalu buang nol di depan. "015000" → "15000", "00" → "0". */
export function toDigits(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits === '') return '';

  const trimmed = digits.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

/** 15000 → "15.000" (pemisah ribuan gaya Indonesia). */
export function formatThousands(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Math.trunc(Math.abs(value)).toLocaleString('id-ID');
}

/**
 * Nilai numerik dari teks yang sudah diformat. "Rp 15.000" → 15000.
 * Kosong dianggap 0 agar form tidak pernah mengirim NaN.
 */
export function parseFormatted(raw: string): number {
  const digits = toDigits(raw);
  return digits === '' ? 0 : Number(digits);
}

/** Tampilan untuk nilai dari server: 0 ditampilkan kosong agar tidak jadi "015000". */
export function toDisplayValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '';

  return formatThousands(numeric);
}

/**
 * Posisi caret setelah teks diformat ulang, dihitung dari jumlah digit di
 * sebelah kirinya. Tanpa ini caret selalu melompat ke ujung saat menyisipkan
 * angka di tengah.
 */
export function caretPositionAfterDigits(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0;

  let seen = 0;
  let pos = 0;

  while (pos < formatted.length && seen < digitsBefore) {
    if (/\d/.test(formatted[pos])) seen++;
    pos++;
  }

  return pos;
}

/** Hitung digit di sebelah kiri caret pada teks mentah. */
export function digitsBeforeCaret(raw: string, caret: number): number {
  return raw.slice(0, Math.max(0, caret)).replace(/\D/g, '').length;
}
