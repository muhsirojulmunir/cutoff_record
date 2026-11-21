<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\MasterStock;
use App\Models\PoProposal;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class StockForecastService
{
    public const CACHE_KEY_SALES_3M = 'stock_forecast_sales_3m_v1';
    public const CACHE_TTL_SECONDS = 300; // 5 menit

    /**
     * Hitung metrik matematika untuk 1 baris produk.
     */
    public function calculateRowMetrics(
        array $salesHistory,
        int $currentStock,
        int $targetMonths = 5,
        int $leadTimeMonths = 3
    ): array {
        $m3 = (int)($salesHistory['m3'] ?? 0);
        $m2 = (int)($salesHistory['m2'] ?? 0);
        $m1 = (int)($salesHistory['m1'] ?? 0);

        $totalSales = $m3 + $m2 + $m1;
        $monthlyVelocity = round($totalSales / 3, 2);

        if ($monthlyVelocity <= 0) {
            return [
                'sales_m3'              => $m3,
                'sales_m2'              => $m2,
                'sales_m1'              => $m1,
                'total_3m_sales'        => $totalSales,
                'monthly_velocity'      => 0.00,
                'current_stock'         => $currentStock,
                'stock_coverage_months' => null,
                'reorder_point'         => 0,
                'time_to_po_months'     => null,
                'target_stock'          => 0,
                'recommended_po_qty'    => 0,
                'urgency_status'        => 'tenang',
            ];
        }

        $stockCoverageMonths = round($currentStock / $monthlyVelocity, 2);
        $reorderPoint = (int)ceil($leadTimeMonths * $monthlyVelocity);
        $timeToPoMonths = round(($currentStock - $reorderPoint) / $monthlyVelocity, 2);
        $targetStock = (int)ceil($targetMonths * $monthlyVelocity);
        $recommendedPoQty = max(0, $targetStock - $currentStock);

        if ($currentStock <= $reorderPoint || $stockCoverageMonths <= $leadTimeMonths) {
            $urgencyStatus = 'harus_po';
        } elseif ($stockCoverageMonths <= $targetMonths) {
            $urgencyStatus = 'siap_po';
        } else {
            $urgencyStatus = 'aman';
        }

        return [
            'sales_m3'              => $m3,
            'sales_m2'              => $m2,
            'sales_m1'              => $m1,
            'total_3m_sales'        => $totalSales,
            'monthly_velocity'      => $monthlyVelocity,
            'current_stock'         => $currentStock,
            'stock_coverage_months' => $stockCoverageMonths,
            'reorder_point'         => $reorderPoint,
            'time_to_po_months'     => $timeToPoMonths,
            'target_stock'          => $targetStock,
            'recommended_po_qty'    => $recommendedPoQty,
            'urgency_status'        => $urgencyStatus,
        ];
    }

    /**
     * Dapatkan rentang tanggal 3 bulan penuh ke belakang.
     */
    public function get3MonthsDateRange(?Carbon $now = null): array
    {
        $ref = $now ?: Carbon::now();

        // M-1: Bulan lalu penuh
        $m1Start = $ref->copy()->subMonthNoOverflow(1)->startOfMonth();
        $m1End   = $ref->copy()->subMonthNoOverflow(1)->endOfMonth();

        // M-2: 2 bulan lalu penuh
        $m2Start = $ref->copy()->subMonthNoOverflow(2)->startOfMonth();
        $m2End   = $ref->copy()->subMonthNoOverflow(2)->endOfMonth();

        // M-3: 3 bulan lalu penuh
        $m3Start = $ref->copy()->subMonthNoOverflow(3)->startOfMonth();
        $m3End   = $ref->copy()->subMonthNoOverflow(3)->endOfMonth();

        return [
            'm3' => ['start' => $m3Start, 'end' => $m3End, 'label' => $m3Start->translatedFormat('F Y')],
            'm2' => ['start' => $m2Start, 'end' => $m2End, 'label' => $m2Start->translatedFormat('F Y')],
            'm1' => ['start' => $m1Start, 'end' => $m1End, 'label' => $m1Start->translatedFormat('F Y')],
            'full_start' => $m3Start,
            'full_end'   => $m1End,
        ];
    }

    /**
     * Agregasi penjualan 3 bulan dari cut_off_orders dengan cache aman (array murni).
     */
    public function getCached3MonthSales(): array
    {
        $cached = Cache::store(config('cache.default', 'file'))->get(self::CACHE_KEY_SALES_3M);
        if (is_array($cached)) {
            return $cached;
        }

        $ranges = $this->get3MonthsDateRange();
        $m3Start = $ranges['m3']['start']->toDateTimeString();
        $m3End   = $ranges['m3']['end']->toDateTimeString();
        $m2Start = $ranges['m2']['start']->toDateTimeString();
        $m2End   = $ranges['m2']['end']->toDateTimeString();
        $m1Start = $ranges['m1']['start']->toDateTimeString();
        $m1End   = $ranges['m1']['end']->toDateTimeString();

        $rows = DB::table('cut_off_orders')
            ->whereNull('deleted_at')
            ->whereBetween('order_date', [$ranges['full_start']->toDateTimeString(), $ranges['full_end']->toDateTimeString()])
            ->select(
                DB::raw("COALESCE(NULLIF(TRIM(sku_utama), ''), NULLIF(TRIM(sku_pengganti), '')) as clean_sku"),
                DB::raw("SUM(CASE WHEN order_date BETWEEN '{$m3Start}' AND '{$m3End}' THEN qty ELSE 0 END) as m3_qty"),
                DB::raw("SUM(CASE WHEN order_date BETWEEN '{$m2Start}' AND '{$m2End}' THEN qty ELSE 0 END) as m2_qty"),
                DB::raw("SUM(CASE WHEN order_date BETWEEN '{$m1Start}' AND '{$m1End}' THEN qty ELSE 0 END) as m1_qty")
            )
            ->groupBy('clean_sku')
            ->get();

        $result = [];
        foreach ($rows as $row) {
            if (!empty($row->clean_sku)) {
                $sku = strtoupper(trim($row->clean_sku));
                if (!isset($result[$sku])) {
                    $result[$sku] = ['m3' => 0, 'm2' => 0, 'm1' => 0];
                }
                $result[$sku]['m3'] += (int)$row->m3_qty;
                $result[$sku]['m2'] += (int)$row->m2_qty;
                $result[$sku]['m1'] += (int)$row->m1_qty;
            }
        }

        Cache::store(config('cache.default', 'file'))->put(self::CACHE_KEY_SALES_3M, $result, self::CACHE_TTL_SECONDS);
        return $result;
    }

    /**
     * Hapus cache penjualan 3 bulan.
     */
    public function clearSalesCache(): void
    {
        Cache::store(config('cache.default', 'file'))->forget(self::CACHE_KEY_SALES_3M);
    }

    /**
     * Ambil data lengkap proyeksi stok gabungan warehouse dan riwayat penjualan.
     */
    public function getForecastData(
        int $targetMonths = 5,
        int $leadTimeMonths = 3,
        ?string $search = null,
        ?string $statusFilter = null
    ): array {
        $ranges = $this->get3MonthsDateRange();
        $salesMap = $this->getCached3MonthSales();

        // Ambil stok gudang dari master_stocks
        $stocks = MasterStock::select('warehouse', 'item_code', 'item_name', 'qty_pcs')
            ->get();

        // Agregasi stok per item_code
        $itemsMap = [];
        foreach ($stocks as $stock) {
            $code = strtoupper(trim($stock->item_code));
            if (!isset($itemsMap[$code])) {
                $itemsMap[$code] = [
                    'item_code'      => $code,
                    'item_name'      => $stock->item_name,
                    'stock_g'        => 0,
                    'stock_a'        => 0,
                    'total_stock'    => 0,
                ];
            }

            $wh = strtoupper(trim($stock->warehouse));
            if ($wh === 'G') {
                $itemsMap[$code]['stock_g'] += (int)$stock->qty_pcs;
            } elseif ($wh === 'A') {
                $itemsMap[$code]['stock_a'] += (int)$stock->qty_pcs;
            }
            $itemsMap[$code]['total_stock'] += (int)$stock->qty_pcs;
        }

        // Ambil pengajuan PO aktif untuk penanda
        $activeProposals = PoProposal::whereIn('status', [PoProposal::STATUS_PENDING, PoProposal::STATUS_APPROVED])
            ->orderByDesc('id')
            ->pluck('po_number', 'sku')
            ->toArray();

        $rows = [];
        $stats = [
            'total_items'          => 0,
            'harus_po_count'       => 0,
            'siap_po_count'        => 0,
            'aman_count'           => 0,
            'tenang_count'         => 0,
            'total_recommended_po' => 0,
        ];

        foreach ($itemsMap as $code => $data) {
            $sales = $salesMap[$code] ?? ['m3' => 0, 'm2' => 0, 'm1' => 0];
            $metrics = $this->calculateRowMetrics(
                $sales,
                $data['total_stock'],
                $targetMonths,
                $leadTimeMonths
            );

            $urgency = $metrics['urgency_status'];
            $stats['total_items']++;
            if ($urgency === 'harus_po') {
                $stats['harus_po_count']++;
            } elseif ($urgency === 'siap_po') {
                $stats['siap_po_count']++;
            } elseif ($urgency === 'aman') {
                $stats['aman_count']++;
            } else {
                $stats['tenang_count']++;
            }

            $stats['total_recommended_po'] += $metrics['recommended_po_qty'];

            $activePo = $activeProposals[$code] ?? null;

            $row = array_merge($data, $metrics, [
                'active_po_number' => $activePo,
            ]);

            // Filter search
            if ($search) {
                $s = strtolower(trim($search));
                if (!str_contains(strtolower($data['item_code']), $s) && !str_contains(strtolower($data['item_name'] ?? ''), $s)) {
                    continue;
                }
            }

            // Filter status
            if ($statusFilter && $statusFilter !== 'all') {
                if ($urgency !== $statusFilter) {
                    continue;
                }
            }

            $rows[] = $row;
        }

        // Urutkan prioritas: 'harus_po' pertama, lalu 'siap_po', lalu 'aman', lalu 'tenang'
        usort($rows, function ($a, $b) {
            $order = ['harus_po' => 1, 'siap_po' => 2, 'aman' => 3, 'tenang' => 4];
            $diff = ($order[$a['urgency_status']] ?? 9) <=> ($order[$b['urgency_status']] ?? 9);
            if ($diff !== 0) {
                return $diff;
            }
            return ($b['recommended_po_qty'] <=> $a['recommended_po_qty']);
        });

        return [
            'rows'        => $rows,
            'stats'       => $stats,
            'date_ranges' => [
                'm3_label' => $ranges['m3']['label'],
                'm2_label' => $ranges['m2']['label'],
                'm1_label' => $ranges['m1']['label'],
            ],
            'parameters'  => [
                'target_months'    => $targetMonths,
                'lead_time_months' => $leadTimeMonths,
            ],
        ];
    }

    /**
     * Alias untuk getForecastData
     */
    public function calculateForecast(
        int $targetMonths = 5,
        int $leadTimeMonths = 3,
        ?string $search = null,
        ?string $statusFilter = null
    ): array {
        return $this->getForecastData($targetMonths, $leadTimeMonths, $search, $statusFilter);
    }
}
