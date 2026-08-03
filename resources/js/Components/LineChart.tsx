import { useEffect, useMemo, useRef, useState } from 'react';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
}

interface Props {
  labels: string[];
  series: LineSeries[];
  formatValue: (value: number) => string;
  formatLabel?: (label: string) => string;
  height?: number;
}

/** Palet satu keluarga tosca agar menyatu dengan tema aplikasi. */
const COLORS = ['#0d9488', '#22d3ee', '#10b981', '#0891b2', '#5eead4', '#94a3b8'];

const PADDING = { top: 16, right: 16, bottom: 26, left: 16 };
const VIEW_WIDTH = 720;
const GRID_LINES = 4;

/**
 * Grafik garis multi-seri: satu garis per channel penjualan.
 * Hover memunculkan garis panduan, titik aktif, dan tooltip nilai per seri;
 * legenda bisa diklik untuk menyembunyikan/menampilkan seri.
 */
export default function LineChart({ labels, series, formatValue, formatLabel, height = 220 }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Garis digambar setelah mount supaya ada animasi menggores sekali jalan.
  useEffect(() => {
    const timer = window.setTimeout(() => setDrawn(true), 60);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleSeries = series.filter((s) => !hidden.has(s.key));

  const maxValue = useMemo(() => {
    const values = visibleSeries.flatMap((s) => s.values);
    return Math.max(...values, 1);
  }, [visibleSeries]);

  if (labels.length === 0 || series.length === 0) {
    return <p className="text-gray-400 text-xs text-center py-16">Belum ada transaksi penjualan pada periode ini.</p>;
  }

  const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const xAt = (index: number) =>
    labels.length === 1
      ? PADDING.left + innerWidth / 2
      : PADDING.left + (index / (labels.length - 1)) * innerWidth;

  const yAt = (value: number) => PADDING.top + innerHeight - (value / maxValue) * innerHeight;

  const toggleSeries = (key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      // Seri terakhir tidak boleh ikut disembunyikan agar grafik tidak kosong.
      if (next.has(key)) next.delete(key);
      else if (visibleSeries.length > 1) next.add(key);
      return next;
    });
  };

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    const bounds = svg.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    const x = ratio * VIEW_WIDTH;
    const step = labels.length === 1 ? innerWidth : innerWidth / (labels.length - 1);
    const index = Math.round((x - PADDING.left) / step);

    setActiveIndex(Math.min(labels.length - 1, Math.max(0, index)));
  };

  const activeLabel = activeIndex !== null ? labels[activeIndex] : null;
  const tooltipLeft = activeIndex !== null ? (xAt(activeIndex) / VIEW_WIDTH) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
          preserveAspectRatio="none"
          style={{ height }}
          className="w-full overflow-visible"
          onMouseMove={handleMove}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {/* Garis bantu horizontal */}
          {Array.from({ length: GRID_LINES + 1 }).map((_, i) => {
            const y = PADDING.top + (innerHeight / GRID_LINES) * i;
            return (
              <line
                key={i}
                x1={PADDING.left}
                x2={VIEW_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Garis panduan saat hover */}
          {activeIndex !== null && (
            <line
              x1={xAt(activeIndex)}
              x2={xAt(activeIndex)}
              y1={PADDING.top}
              y2={PADDING.top + innerHeight}
              stroke="#0d9488"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {visibleSeries.map((s) => {
            const colorIndex = series.findIndex((item) => item.key === s.key);
            const color = COLORS[colorIndex % COLORS.length];
            const points = s.values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(' ');

            return (
              <polyline
                key={s.key}
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={drawn ? 0 : 1}
                className="transition-[stroke-dashoffset] duration-[900ms] ease-out"
              />
            );
          })}

          {/* Titik pada posisi hover */}
          {activeIndex !== null &&
            visibleSeries.map((s) => {
              const colorIndex = series.findIndex((item) => item.key === s.key);
              return (
                <circle
                  key={s.key}
                  cx={xAt(activeIndex)}
                  cy={yAt(s.values[activeIndex])}
                  r={4}
                  fill="#ffffff"
                  stroke={COLORS[colorIndex % COLORS.length]}
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
        </svg>

        {/* Tooltip */}
        {activeIndex !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 rounded-xl bg-gray-900 px-3 py-2 text-white shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, tooltipLeft))}%` }}
          >
            <p className="text-[10px] text-gray-300 whitespace-nowrap">
              {formatLabel && activeLabel ? formatLabel(activeLabel) : activeLabel}
            </p>
            <div className="mt-1 space-y-0.5">
              {visibleSeries.map((s) => {
                const colorIndex = series.findIndex((item) => item.key === s.key);
                return (
                  <p key={s.key} className="flex items-center gap-2 text-[11px] whitespace-nowrap">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[colorIndex % COLORS.length] }}
                    />
                    <span className="text-gray-300 capitalize">{s.label}</span>
                    <span className="font-mono font-bold ml-auto">{formatValue(s.values[activeIndex])}</span>
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Label sumbu X */}
      <div className="flex justify-between text-[10px] text-gray-400 font-mono px-1">
        <span>{formatLabel ? formatLabel(labels[0]) : labels[0]}</span>
        {labels.length > 2 && (
          <span>{formatLabel ? formatLabel(labels[Math.floor(labels.length / 2)]) : labels[Math.floor(labels.length / 2)]}</span>
        )}
        <span>{formatLabel ? formatLabel(labels[labels.length - 1]) : labels[labels.length - 1]}</span>
      </div>

      {/* Legenda — klik untuk menyembunyikan seri */}
      <div className="flex flex-wrap gap-2 pt-1">
        {series.map((s, index) => {
          const isHidden = hidden.has(s.key);
          const total = s.values.reduce((acc, value) => acc + value, 0);

          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSeries(s.key)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                isHidden
                  ? 'border-gray-200 bg-gray-50 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-teal-300 hover:bg-teal-50/60'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: isHidden ? '#cbd5e1' : COLORS[index % COLORS.length] }}
              />
              <span className="capitalize">{s.label}</span>
              <span className="font-mono text-[11px] text-gray-400">{formatValue(total)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
