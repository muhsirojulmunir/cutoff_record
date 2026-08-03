import React, { useState } from 'react';

import { toDecimalDisplay, toDecimalInput } from '../Utils/number';

interface Props {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  /** Angka di belakang koma yang diizinkan. */
  maxDecimals?: number;
  /** Satuan yang ditampilkan di dalam field, mis. "Kg". */
  suffix?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Input angka desimal, mis. berat 15,5 kg.
 *
 * Sama seperti CurrencyInput dalam hal membuang nol di depan dan
 * mengosongkan field bernilai 0, tapi mengizinkan satu pemisah desimal —
 * koma maupun titik sama-sama diterima.
 */
export default function DecimalInput({
  value,
  onChange,
  maxDecimals = 2,
  suffix,
  id,
  name,
  required,
  disabled,
  placeholder = '0',
  className = '',
}: Props) {
  const [display, setDisplay] = useState<string>(() => toDecimalDisplay(value));

  // Ikuti perubahan nilai dari luar, tapi jangan ganggu ketikan yang sedang
  // berjalan seperti "15," yang nilainya sudah sama dengan 15.
  const valueAsNumber = Number(value ?? 0) || 0;
  if (valueAsNumber !== toDecimalInput(display, maxDecimals).value) {
    setDisplay(toDecimalDisplay(value));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const result = toDecimalInput(e.target.value, maxDecimals);

    setDisplay(result.display);
    onChange(result.value);
  }

  /** Rapikan sisa ketikan menggantung seperti "15," menjadi "15". */
  function handleBlur() {
    setDisplay(toDecimalDisplay(toDecimalInput(display, maxDecimals).value));
  }

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`${suffix ? 'pr-12 ' : ''}${className}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
