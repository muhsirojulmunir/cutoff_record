import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** Durasi animasi dalam milidetik. */
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}

/**
 * Angka yang menghitung naik saat pertama tampil — dipakai untuk kartu KPI
 * agar dashboard terasa hidup tanpa mengganggu keterbacaan.
 */
export default function CountUp({ value, duration = 900, format, className }: Props) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || duration <= 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // ease-out cubic supaya melambat di akhir
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(from + (value - from) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  const rounded = Math.round(display);

  return <span className={className}>{format ? format(rounded) : rounded.toLocaleString('id-ID')}</span>;
}
