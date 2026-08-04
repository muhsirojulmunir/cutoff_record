/**
 * Opsi pembayaran Purchase Order.
 *
 * Dikumpulkan di satu tempat agar pilihan di form, label di halaman detail,
 * dan daftar PO tidak pernah berbeda isinya.
 */
export const PO_PAYMENT_TERMS = [
  { value: 'dp_50', label: 'DP 50%' },
  { value: 'cash', label: 'Cash' },
  { value: 'tempo_7_days', label: 'Tempo 7 Hari' },
  { value: 'tempo_14_days', label: 'Tempo 14 Hari' },
] as const;

export const PO_PAYMENT_TERM_LABELS: Record<string, string> = {
  ...Object.fromEntries(PO_PAYMENT_TERMS.map((term) => [term.value, term.label])),
  // Nilai lama sebelum opsi diperbarui — tetap dikenali agar PO lama
  // tidak tampil sebagai kode mentah.
  cash_to_cash: 'Cash',
};

export const poPaymentTermLabel = (value: string | null | undefined): string =>
  value ? (PO_PAYMENT_TERM_LABELS[value] ?? value) : '—';

/** Porsi uang muka saat opsi DP 50% dipilih. */
export const DP_50_RATIO = 0.5;
