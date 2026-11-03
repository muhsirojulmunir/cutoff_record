import React, { useState, useEffect, useRef } from 'react';

export interface DualCalendarRangePickerProps {
  initialStartDate?: string; // YYYY-MM-DD
  initialEndDate?: string;   // YYYY-MM-DD
  maxDate?: string;          // YYYY-MM-DD (maksimal tanggal yang boleh dipilih, default: hari ini)
  allowFuture?: boolean;     // jika true, tidak membatasi pemilihan tanggal ke masa depan
  isOpen?: boolean;          // untuk popover mode
  onClose?: () => void;      // untuk popover mode
  onApply: (startDate: string, endDate: string) => void;
  inline?: boolean;          // jika true, ditampilkan langsung di halaman (bukan popover absolut)
  align?: 'left' | 'right' | 'center'; // alignment popover
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['M', 'S', 'S', 'R', 'K', 'J', 'S']; // Minggu, Senin, Selasa, Rabu, Kamis, Jumat, Sabtu

export function formatYMD(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function parseYMD(dateStr?: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split(' ')[0].split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

export function formatDateIndo(dateStr: string | null): string {
  if (!dateStr) return '-';
  const parsed = parseYMD(dateStr);
  if (!parsed) return dateStr;
  return `${parsed.day} ${MONTH_NAMES[parsed.month]?.slice(0, 3)} ${parsed.year}`;
}

export default function DualCalendarRangePicker({
  initialStartDate,
  initialEndDate,
  maxDate,
  allowFuture = false,
  isOpen = true,
  onClose,
  onApply,
  inline = false,
  align = 'right',
}: DualCalendarRangePickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Default max date to today if not provided and allowFuture is false
  const now = new Date();
  const todayYMD = formatYMD(now.getFullYear(), now.getMonth(), now.getDate());
  const effectiveMaxDate = allowFuture ? '' : (maxDate !== undefined ? maxDate : todayYMD);
  const maxParsed = parseYMD(effectiveMaxDate || todayYMD) || {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
  };

  // Selected date range state
  const [startDate, setStartDate] = useState<string | null>(initialStartDate || null);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate || null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Left month state (default: 1 month before max month so both previous & current months are visible)
  const defaultLeftMonth = maxParsed.month === 0 ? 11 : maxParsed.month - 1;
  const defaultLeftYear = maxParsed.month === 0 ? maxParsed.year - 1 : maxParsed.year;

  const [leftYear, setLeftYear] = useState<number>(defaultLeftYear);
  const [leftMonth, setLeftMonth] = useState<number>(defaultLeftMonth);

  // Right month is always leftMonth + 1
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;

  // Determine if next month / year navigation is disabled (cannot go into the future unless allowFuture is true)
  const nextRightYear = rightMonth === 11 ? rightYear + 1 : rightYear;
  const nextRightMonth = rightMonth === 11 ? 0 : rightMonth + 1;
  const isNextMonthDisabled = !allowFuture && (
    nextRightYear > maxParsed.year ||
    (nextRightYear === maxParsed.year && nextRightMonth > maxParsed.month)
  );

  const isNextYearDisabled = !allowFuture && (
    rightYear + 1 > maxParsed.year ||
    (rightYear + 1 === maxParsed.year && rightMonth > maxParsed.month)
  );

  // Sync state on open or props change
  useEffect(() => {
    if (isOpen || inline) {
      setStartDate(initialStartDate || null);
      setEndDate(initialEndDate || null);
      setHoverDate(null);

      if (initialStartDate) {
        const parsed = parseYMD(initialStartDate);
        if (parsed) {
          // If start date is in the current month, show previous month on the left and current month on the right
          if (parsed.year === maxParsed.year && parsed.month === maxParsed.month) {
            setLeftMonth(defaultLeftMonth);
            setLeftYear(defaultLeftYear);
          } else {
            setLeftYear(parsed.year);
            setLeftMonth(parsed.month);
          }
        }
      } else {
        setLeftMonth(defaultLeftMonth);
        setLeftYear(defaultLeftYear);
      }
    }
  }, [isOpen, inline, initialStartDate, initialEndDate, effectiveMaxDate]);

  // Click outside to close (popover mode only)
  useEffect(() => {
    if (inline || !isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        if (onClose) onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [inline, isOpen, onClose]);

  if (!inline && !isOpen) return null;

  // Navigation handlers
  const handlePrevYear = () => setLeftYear((y) => y - 1);
  const handlePrevMonth = () => {
    if (leftMonth === 0) {
      setLeftMonth(11);
      setLeftYear((y) => y - 1);
    } else {
      setLeftMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (isNextMonthDisabled) return;
    if (leftMonth === 11) {
      setLeftMonth(0);
      setLeftYear((y) => y + 1);
    } else {
      setLeftMonth((m) => m + 1);
    }
  };

  const handleNextYear = () => {
    if (isNextYearDisabled) return;
    const candidateRightYear = rightYear + 1;
    if (
      !allowFuture &&
      (candidateRightYear > maxParsed.year ||
        (candidateRightYear === maxParsed.year && rightMonth > maxParsed.month))
    ) {
      setLeftMonth(defaultLeftMonth);
      setLeftYear(defaultLeftYear);
      return;
    }
    setLeftYear((y) => y + 1);
  };

  // Date selection logic
  const handleDateClick = (dateStr: string) => {
    if (effectiveMaxDate && dateStr > effectiveMaxDate) return;

    if (!startDate || (startDate && endDate)) {
      setStartDate(dateStr);
      setEndDate(null);
    } else if (startDate && !endDate) {
      let finalStart = startDate;
      let finalEnd = dateStr;
      if (dateStr < startDate) {
        finalStart = dateStr;
        finalEnd = startDate;
      }
      setStartDate(finalStart);
      setEndDate(finalEnd);

      // Auto-apply selection
      onApply(finalStart, finalEnd);

      if (!inline && onClose) {
        setTimeout(() => {
          onClose();
        }, 220);
      }
    }
  };

  const handleApplyClick = () => {
    if (startDate && endDate) {
      onApply(startDate, endDate);
      if (!inline && onClose) onClose();
    } else if (startDate && !endDate) {
      onApply(startDate, startDate);
      if (!inline && onClose) onClose();
    }
  };

  // Quick preset shortcuts
  const applyPreset = (days: number) => {
    const today = new Date();
    const end = formatYMD(today.getFullYear(), today.getMonth(), today.getDate());
    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - (days - 1));
    const start = formatYMD(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());

    setStartDate(start);
    setEndDate(end);
    onApply(start, end);

    const parsed = parseYMD(start);
    if (parsed) {
      if (parsed.year === maxParsed.year && parsed.month === maxParsed.month) {
        setLeftMonth(defaultLeftMonth);
        setLeftYear(defaultLeftYear);
      } else {
        setLeftYear(parsed.year);
        setLeftMonth(parsed.month);
      }
    }

    if (!inline && onClose) {
      setTimeout(() => {
        onClose();
      }, 200);
    }
  };

  const applyThisMonth = () => {
    const today = new Date();
    const start = formatYMD(today.getFullYear(), today.getMonth(), 1);
    const end = formatYMD(today.getFullYear(), today.getMonth(), today.getDate());

    setStartDate(start);
    setEndDate(end);
    onApply(start, end);

    setLeftMonth(defaultLeftMonth);
    setLeftYear(defaultLeftYear);

    if (!inline && onClose) {
      setTimeout(() => {
        onClose();
      }, 200);
    }
  };

  // Render Single Calendar Month
  const renderMonth = (year: number, month: number, isRightMonth: boolean = false) => {
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const effectiveEnd = endDate || (hoverDate && startDate && hoverDate > startDate ? hoverDate : null);
    const effectiveStart = startDate && effectiveEnd && startDate > effectiveEnd ? effectiveEnd : startDate;
    const finalEnd = startDate && effectiveEnd && startDate > effectiveEnd ? startDate : effectiveEnd;

    const cells: React.ReactNode[] = [];

    // Empty spaces before day 1
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(<div key={`empty-${i}`} className="h-9 w-9" />);
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatYMD(year, month, day);
      const isFuture = effectiveMaxDate ? dateStr > effectiveMaxDate : false;
      const isStart = startDate === dateStr;
      const isEnd = endDate === dateStr || (hoverDate === dateStr && !endDate && startDate && startDate !== dateStr);
      const isEndpoint = !isFuture && (isStart || isEnd);
      const isInRange =
        !isFuture &&
        effectiveStart &&
        finalEnd &&
        dateStr >= effectiveStart &&
        dateStr <= finalEnd;

      cells.push(
        <div
          key={dateStr}
          onClick={() => !isFuture && handleDateClick(dateStr)}
          onMouseEnter={() => {
            if (startDate && !endDate && !isFuture) {
              setHoverDate(dateStr);
            }
          }}
          className={`h-9 flex items-center justify-center relative select-none ${
            isFuture ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            isInRange && !isEndpoint ? 'bg-[#FFF1EE]' : ''
          } ${
            isStart && finalEnd && finalEnd !== dateStr ? 'bg-gradient-to-r from-transparent 50% via-[#FFF1EE] 50% to-[#FFF1EE]' : ''
          } ${
            isEnd && effectiveStart && effectiveStart !== dateStr ? 'bg-gradient-to-l from-transparent 50% via-[#FFF1EE] 50% to-[#FFF1EE]' : ''
          }`}
        >
          <div
            className={`h-8 w-8 text-xs flex items-center justify-center font-medium transition-all rounded-lg ${
              isFuture
                ? 'text-slate-300 opacity-40'
                : isEndpoint
                ? 'bg-[#EE4D2D] text-white font-bold shadow-xs scale-105 z-10'
                : isInRange
                ? 'text-slate-900 font-semibold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {day}
          </div>
        </div>
      );
    }

    // Trailing days for grid alignment
    const totalFilled = firstDayOfWeek + daysInMonth;
    const targetCells = totalFilled <= 35 ? 35 : 42;
    const trailingCount = targetCells - totalFilled;
    for (let i = 1; i <= trailingCount; i++) {
      cells.push(
        <div key={`trail-${i}`} className="h-9 flex items-center justify-center">
          <div className="h-8 w-8 text-xs flex items-center justify-center text-slate-300 font-medium select-none opacity-30">
            {i}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full sm:w-[270px] shrink-0">
        {/* Month Navigation Header */}
        <div className="flex items-center justify-between pb-3 px-1 text-slate-700">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevYear}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors font-mono font-bold text-xs cursor-pointer"
              title="Tahun Sebelumnya"
            >
              &laquo;
            </button>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors font-mono font-bold text-xs cursor-pointer"
              title="Bulan Sebelumnya"
            >
              &lsaquo;
            </button>
          </div>

          <div className="font-bold text-sm text-slate-900 tracking-tight">
            {MONTH_NAMES[month]} {year}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isNextMonthDisabled}
              onClick={handleNextMonth}
              className={`p-1 rounded font-mono font-bold text-xs transition-colors ${
                isNextMonthDisabled
                  ? 'text-slate-200 cursor-not-allowed opacity-30'
                  : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer'
              }`}
              title={isNextMonthDisabled ? 'Tidak dapat memilih bulan masa depan' : 'Bulan Berikutnya'}
            >
              &rsaquo;
            </button>
            <button
              type="button"
              disabled={isNextYearDisabled}
              onClick={handleNextYear}
              className={`p-1 rounded font-mono font-bold text-xs transition-colors ${
                isNextYearDisabled
                  ? 'text-slate-200 cursor-not-allowed opacity-30'
                  : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer'
              }`}
              title={isNextYearDisabled ? 'Tidak dapat memilih tahun masa depan' : 'Tahun Berikutnya'}
            >
              &raquo;
            </button>
          </div>
        </div>

        {/* Days Header: M S S R K J S */}
        <div className="grid grid-cols-7 mb-1 text-center">
          {DAY_NAMES.map((d, idx) => (
            <div key={idx} className="h-7 flex items-center justify-center text-xs font-semibold text-slate-500">
              {d}
            </div>
          ))}
        </div>

        {/* Day Grid */}
        <div className="grid grid-cols-7 gap-y-0.5">{cells}</div>
      </div>
    );
  };

  const containerStyle = inline
    ? 'w-full bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs'
    : `absolute top-full mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-5 animate-in fade-in zoom-in-95 duration-150 w-full sm:w-[600px] max-w-[calc(100vw-2rem)] ${
        align === 'left' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0'
      }`;

  return (
    <div ref={popoverRef} className={containerStyle}>
      {/* Quick Presets Header */}
      <div className="pb-3 mb-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Preset Cepat:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => applyPreset(1)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => applyPreset(7)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
          >
            7 Hari
          </button>
          <button
            type="button"
            onClick={() => applyPreset(14)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
          >
            14 Hari
          </button>
          <button
            type="button"
            onClick={() => applyPreset(30)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
          >
            30 Hari
          </button>
          <button
            type="button"
            onClick={applyThisMonth}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors"
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Dual Month Calendars Side by Side */}
      <div className="flex flex-col sm:flex-row gap-5 justify-between items-center sm:items-start overflow-x-auto pb-1">
        {/* Left Calendar */}
        {renderMonth(leftYear, leftMonth, false)}

        {/* Vertical divider on desktop */}
        <div className="hidden sm:block w-px self-stretch bg-slate-100 my-1" />

        {/* Right Calendar */}
        {renderMonth(rightYear, rightMonth, true)}
      </div>

      {/* Footer Bar */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-600 truncate">
          {startDate ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-slate-500">Rentang:</span>
              <span className="font-bold text-[#EE4D2D] bg-[#FFF1EE] px-2.5 py-1 rounded-lg border border-orange-200/80 truncate">
                {formatDateIndo(startDate)} {endDate ? `– ${formatDateIndo(endDate)}` : '(Pilih tanggal akhir)'}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">Pilih tanggal awal & tanggal akhir di kalender</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!inline && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Tutup
            </button>
          )}
          <button
            type="button"
            disabled={!startDate}
            onClick={handleApplyClick}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer ${
              startDate
                ? 'bg-[#EE4D2D] hover:bg-[#d63f20] text-white active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            Terapkan Rentang
          </button>
        </div>
      </div>
    </div>
  );
}
