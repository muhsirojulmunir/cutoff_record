import React, { useLayoutEffect, useRef, useState } from 'react';

import {
  caretPositionAfterDigits,
  digitsBeforeCaret,
  formatThousands,
  parseFormatted,
  toDigits,
  toDisplayValue,
} from '../Utils/number';

interface Props {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  /** Batas atas, mis. sisa tagihan invoice. Dirapikan saat kursor meninggalkan field. */
  max?: number;
  /** Batas bawah, mis. qty minimal 1. Ikut dirapikan saat kursor meninggalkan field. */
  min?: number | string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Sembunyikan awalan "Rp" untuk field non-uang yang tetap butuh pemisah ribuan. */
  hidePrefix?: boolean;
}

/**
 * Input nominal rupiah: mengetik 15000 langsung tampil "15.000".
 *
 * Memakai type="text" + inputMode numeric, bukan type="number", karena input
 * number tidak bisa menampilkan pemisah ribuan dan memunculkan tombol panah
 * yang sering tersenggol saat scroll.
 */
export default function CurrencyInput({
  value,
  onChange,
  max,
  min,
  id,
  name,
  required,
  disabled,
  placeholder = '0',
  className = '',
  hidePrefix = false,
}: Props) {
  const [display, setDisplay] = useState<string>(() => toDisplayValue(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  // Ikuti perubahan dari luar (mis. harga terisi saat produk dipilih), tapi
  // jangan ganggu ketikan yang nilainya sudah sama.
  const valueAsNumber = Number(value ?? 0) || 0;
  const displayAsNumber = parseFormatted(display);
  if (valueAsNumber !== displayAsNumber) {
    setDisplay(toDisplayValue(value));
  }

  useLayoutEffect(() => {
    if (caretRef.current === null) return;

    const el = inputRef.current;
    if (el) {
      const pos = caretPositionAfterDigits(el.value, caretRef.current);
      el.setSelectionRange(pos, pos);
    }
    caretRef.current = null;
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    caretRef.current = digitsBeforeCaret(raw, e.target.selectionStart ?? raw.length);

    const digits = toDigits(raw);
    const numeric = digits === '' ? 0 : Number(digits);

    setDisplay(digits === '' ? '' : formatThousands(numeric));
    onChange(numeric);
  }

  /**
   * Batas dirapikan saat field ditinggalkan, bukan saat mengetik — mengoreksi
   * di tengah ketikan membuat angka melompat-lompat dan sulit dikoreksi.
   */
  function handleBlur() {
    const current = parseFormatted(display);
    const lower = min === undefined || min === '' ? undefined : Number(min);

    const clamped =
      max !== undefined && current > max
        ? max
        : lower !== undefined && Number.isFinite(lower) && current < lower
          ? lower
          : null;

    if (clamped === null) return;

    setDisplay(toDisplayValue(clamped));
    onChange(clamped);
  }

  return (
    <div className="relative">
      {!hidePrefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
          Rp
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`${hidePrefix ? '' : 'pl-9 '}${className}`}
      />
    </div>
  );
}
