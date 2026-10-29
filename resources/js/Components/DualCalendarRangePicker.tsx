import React, { useState, useEffect, useRef } from 'react';

interface DualCalendarRangePickerProps {
  initialStartDate?: string; // YYYY-MM-DD
  initialEndDate?: string;   // YYYY-MM-DD
  maxDate?: string;          // YYYY-MM-DD (maksimal tanggal yang boleh dipilih, default: hari ini)
  isOpen: boolean;
  onClose: () => void;
  onApply: (startDate: string, endDate: string) => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['M', 'S', 'S', 'R', 'K', 'J', 'S']; // Minggu, Senin, Selasa, Rabu, Kamis, Jumat, Sabtu

function formatYMD(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseYMD(dateStr?: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split(' ')[0].split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

function formatDateIndo(dateStr: string | null): string {
  if (!dateStr) return '-';
  const parsed = parseYMD(dateStr);
  if (!parsed) return dateStr;
  return `${parsed.day} ${MONTH_NAMES[parsed.month]?.slice(0, 3)} ${parsed.year}`;
}

export default function DualCalendarRangePicker({
  initialStartDate,
  initialEndDate,
  maxDate,
  isOpen,
  onClose,
  onApply,
}: DualCalendarRangePickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Default max date to today if not provided
  const now = new Date();
  const effectiveMaxDate = maxDate || formatYMD(now.getFullYear(), now.getMonth(), now.getDate());
  const maxParsed = parseYMD(effectiveMaxDate) || {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
  };

  // Selected date range state
  const [startDate, setStartDate] = useState<string | null>(initialStartDate || null);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate || null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Left month state (default: 1 month before current month so both past month & current month are visible)
  const defaultLeftMonth = maxParsed.month === 0 ? 11 : maxParsed.month - 1;
  const defaultLeftYear = maxParsed.month === 0 ? maxParsed.year - 1 : maxParsed.year;

  const [leftYear, setLeftYear] = useState<number>(defaultLeftYear);
  const [leftMonth, setLeftMonth] = useState<number>(defaultLeftMonth);

  // Right month is always leftMonth + 1
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;

  // Determine if next month / year navigation is disabled (cannot go into the future)
  const nextRightYear = rightMonth === 11 ? rightYear + 1 : rightYear;
  const nextRightMonth = rightMonth === 11 ? 0 : rightMonth + 1;
  const isNextMonthDisabled =
    nextRightYear > maxParsed.year ||
    (nextRightYear === maxParsed.year && nextRightMonth > maxParsed.month);

  const isNextYearDisabled =
    rightYear + 1 > maxParsed.year ||
    (rightYear + 1 === maxParsed.year && rightMonth > maxParsed.month);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setStartDate(initialStartDate || null);
      setEndDate(initialEndDate || null);
      setHoverDate(null);

      if (initialStartDate) {
        const parsed = parseYMD(initialStartDate);
        if (parsed) {
          // If start date is in the current/max month, keep left month as (maxMonth - 1) so current month is on the right
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
  }, [isOpen, initialStartDate, initialEndDate, effectiveMaxDate]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Navigation handlers (restricted by maxDate)
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
      candidateRightYear > maxParsed.year ||
      (candidateRightYear === maxParsed.year && rightMonth > maxParsed.month)
    ) {
      setLeftMonth(defaultLeftMonth);
      setLeftYear(defaultLeftYear);
      return;
    }
    setLeftYear((y) => y + 1);
  };

  // Date selection logic with future date protection
  const handleDateClick = (dateStr: string) => {
    if (dateStr > effectiveMaxDate) return; // Prevent selecting future dates!

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

      // Auto-apply selection with brief visual confirmation
      setTimeout(() => {
        onApply(finalStart, finalEnd);
        onClose();
      }, 220);
    }
  };

  const handleApplyClick = () => {
    if (startDate && endDate) {
      onApply(startDate, endDate);
      onClose();
    } else if (startDate && !endDate) {
      onApply(startDate, startDate);
      onClose();
    }
  };

  // Render Single Calendar Month
  const renderMonth = (year: number, month: number) => {
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const effectiveEnd = endDate || (hoverDate && startDate && hoverDate > startDate ? hoverDate : null);
    const effectiveStart = startDate && effectiveEnd && startDate > effectiveEnd ? effectiveEnd : startDate;
    const finalEnd = startDate && effectiveEnd && startDate > effectiveEnd ? startDate : effectiveEnd;

    const cells: React.ReactNode[] = [];

    // Empty spaces before day 1
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatYMD(year, month, day);
      const isFuture = dateStr > effectiveMaxDate;
      const isStart = startDate === dateStr;
      const isEnd = endDate === dateStr || (hoverDate === dateStr && !endDate && startDate && startDate !== dateStr);
      const isEndpoint = !isFuture && (isStart || isEnd);
      const isInRange =
        !isFuture &&
        effectiveStart &&
        finalEnd &&
        dateStr >= effectiveStart &&
        dateStr <= finalEnd;

      let cellStyle = 'h-8 w-8 text-xs flex items-center justify-center font-medium transition-colors select-none ';

      if (isFuture) {
        // Disabled future dates
        cellStyle += 'text-slate-300 opacity-40 cursor-not-allowed';
      } else if (isEndpoint) {
        // Selected start / end date
        cellStyle += 'bg-[#EA3829] text-white font-bold rounded-lg shadow-sm z-10 cursor-pointer';
      } else if (isInRange) {
        // Range in between
        cellStyle += 'bg-[#FFF1F0] text-slate-800 font-semibold cursor-pointer';
      } else {
        // Available past date
        cellStyle += 'text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer';
      }

      cells.push(
        <div
          key={dateStr}
          onClick={() => !isFuture && handleDateClick(dateStr)}
          onMouseEnter={() => {
            if (startDate && !endDate && !isFuture) {
              setHoverDate(dateStr);
            }
          }}
          className="flex items-center justify-center p-0.5"
        >
          <div className={cellStyle}>{day}</div>
        </div>
      );
    }

    // Trailing days for grid alignment (always disabled / muted)
    const totalFilled = firstDayOfWeek + daysInMonth;
    const targetCells = totalFilled <= 35 ? 35 : 42;
    const trailingCount = targetCells - totalFilled;
    for (let i = 1; i <= trailingCount; i++) {
      cells.push(
        <div key={`trail-${i}`} className="flex items-center justify-center p-0.5">
          <div className="h-8 w-8 text-xs flex items-center justify-center text-slate-300 font-medium select-none opacity-40">
            {i}
          </div>
        </div>
      );
    }

    return (
      <div className="w-[280px] shrink-0">
        {/* Month Navigation Header */}
        <div className="flex items-center justify-between pb-3 px-1 text-slate-700">
          <div className="flex items-center gap-1.5">
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
            {MONTH_NAMES[month]}{year}
          </div>

          <div className="flex items-center gap-1.5">
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

        {/* Days Header */}
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

  return (
    <div
      ref={popoverRef}
      className="absolute top-full right-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-5 animate-in fade-in zoom-in-95 duration-150 w-[610px] max-w-[calc(100vw-2rem)]"
    >
      {/* Dual Month Calendars Side by Side */}
      <div className="flex flex-row gap-5 justify-between items-start">
        {/* Left Calendar (e.g. September) */}
        {renderMonth(leftYear, leftMonth)}

        {/* Right Calendar (e.g. Oktober) */}
        {renderMonth(rightYear, rightMonth)}
      </div>

      {/* Footer Bar */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-600 truncate">
          {startDate ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-slate-500">Rentang:</span>
              <span className="font-bold text-[#EA3829] bg-[#FFF1F0] px-2 py-0.5 rounded-md border border-rose-200 truncate">
                {formatDateIndo(startDate)} {endDate ? `– ${formatDateIndo(endDate)}` : '(Pilih tanggal akhir)'}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">Pilih tanggal awal & tanggal akhir</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!startDate}
            onClick={handleApplyClick}
            className={`px-3.5 py-1 text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer ${
              startDate
                ? 'bg-[#EA3829] hover:bg-[#d63022] text-white active:scale-95'
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
