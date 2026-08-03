<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Periode mingguan Senin–Minggu, dipakai bersama oleh pengisian dana,
 * perhitungan sisa saldo, dan penamaan folder Google Drive.
 */
class WeekPeriod
{
    public function __construct(
        public readonly CarbonImmutable $start,
        public readonly CarbonImmutable $end,
    ) {}

    public static function containing(CarbonInterface|string|null $date = null): self
    {
        $reference = CarbonImmutable::parse($date ?? now());

        return new self(
            $reference->startOfWeek(CarbonInterface::MONDAY),
            $reference->endOfWeek(CarbonInterface::SUNDAY)->startOfDay(),
        );
    }

    /** Nama folder Drive, contoh: "2026-08-03 sd 2026-08-09". */
    public function folderName(): string
    {
        return $this->start->format('Y-m-d') . ' sd ' . $this->end->format('Y-m-d');
    }

    /** Label untuk tampilan, contoh: "03 Aug – 09 Aug 2026". */
    public function label(): string
    {
        return $this->start->translatedFormat('d M') . ' – ' . $this->end->translatedFormat('d M Y');
    }

    public function startDate(): string
    {
        return $this->start->format('Y-m-d');
    }

    public function endDate(): string
    {
        return $this->end->format('Y-m-d');
    }
}
