<?php

namespace Tests\Unit;

use App\Services\StockForecastService;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

class StockForecastServiceTest extends TestCase
{
    private StockForecastService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new StockForecastService();
    }

    public function test_calculate_metrics_matching_user_example(): void
    {
        // Sepatu A: Penjualan M-3 = 90, M-2 = 110, M-1 = 100 -> Rata-rata 100/bln
        // Stok Gudang = 400
        // Target Horizon = 5 bln, Lead Time = 3 bln
        $salesHistory = [
            'm3' => 90,
            'm2' => 110,
            'm1' => 100,
        ];
        $currentStock = 400;
        $targetMonths = 5;
        $leadTimeMonths = 3;

        $metrics = $this->service->calculateRowMetrics(
            $salesHistory,
            $currentStock,
            $targetMonths,
            $leadTimeMonths
        );

        $this->assertEquals(100.00, $metrics['monthly_velocity']);
        $this->assertEquals(4.00, $metrics['stock_coverage_months']); // 400 / 100
        $this->assertEquals(300, $metrics['reorder_point']);          // 3 * 100
        $this->assertEquals(1.00, $metrics['time_to_po_months']);     // (400 - 300) / 100
        $this->assertEquals(500, $metrics['target_stock']);           // 5 * 100
        $this->assertEquals(100, $metrics['recommended_po_qty']);     // 500 - 400
        $this->assertEquals('siap_po', $metrics['urgency_status']);   // 3.0 < 4.0 <= 5.0
    }

    public function test_calculate_metrics_critical_stockout(): void
    {
        // Penjualan rata-rata 100/bln, stok hanya 200 (di bawah reorder point 300)
        $salesHistory = ['m3' => 100, 'm2' => 100, 'm1' => 100];
        $currentStock = 200;

        $metrics = $this->service->calculateRowMetrics($salesHistory, $currentStock, 5, 3);

        $this->assertEquals(2.00, $metrics['stock_coverage_months']);
        $this->assertEquals(-1.00, $metrics['time_to_po_months']);
        $this->assertEquals(300, $metrics['recommended_po_qty']); // 500 - 200
        $this->assertEquals('harus_po', $metrics['urgency_status']);
    }

    public function test_calculate_metrics_safe_stock(): void
    {
        // Penjualan rata-rata 100/bln, stok 600 (di atas target 500)
        $salesHistory = ['m3' => 100, 'm2' => 100, 'm1' => 100];
        $currentStock = 600;

        $metrics = $this->service->calculateRowMetrics($salesHistory, $currentStock, 5, 3);

        $this->assertEquals(6.00, $metrics['stock_coverage_months']);
        $this->assertEquals(3.00, $metrics['time_to_po_months']);
        $this->assertEquals(0, $metrics['recommended_po_qty']); // max(0, 500 - 600)
        $this->assertEquals('aman', $metrics['urgency_status']);
    }

    public function test_calculate_metrics_zero_sales_velocity(): void
    {
        // Produk tidak bergerak: penjualan 0
        $salesHistory = ['m3' => 0, 'm2' => 0, 'm1' => 0];
        $currentStock = 50;

        $metrics = $this->service->calculateRowMetrics($salesHistory, $currentStock, 5, 3);

        $this->assertEquals(0.00, $metrics['monthly_velocity']);
        $this->assertNull($metrics['stock_coverage_months']);
        $this->assertEquals(0, $metrics['recommended_po_qty']);
        $this->assertEquals('tenang', $metrics['urgency_status']);
    }

    public function test_calculate_metrics_zero_stock(): void
    {
        // Stok habis total (0 pcs), penjualan 100/bln
        $salesHistory = ['m3' => 100, 'm2' => 100, 'm1' => 100];
        $currentStock = 0;

        $metrics = $this->service->calculateRowMetrics($salesHistory, $currentStock, 5, 3);

        $this->assertEquals(0.00, $metrics['stock_coverage_months']);
        $this->assertEquals(-3.00, $metrics['time_to_po_months']);
        $this->assertEquals(500, $metrics['recommended_po_qty']);
        $this->assertEquals('harus_po', $metrics['urgency_status']);
    }

    public function test_calculate_metrics_exact_boundary_conditions(): void
    {
        $salesHistory = ['m3' => 100, 'm2' => 100, 'm1' => 100]; // V = 100

        // Tepat di Reorder Point (300) -> harus_po
        $atRop = $this->service->calculateRowMetrics($salesHistory, 300, 5, 3);
        $this->assertEquals('harus_po', $atRop['urgency_status']);
        $this->assertEquals(0.00, $atRop['time_to_po_months']);

        // Sedikit di atas Reorder Point (301) -> siap_po
        $aboveRop = $this->service->calculateRowMetrics($salesHistory, 301, 5, 3);
        $this->assertEquals('siap_po', $aboveRop['urgency_status']);

        // Tepat di Target Stock (500) -> siap_po
        $atTarget = $this->service->calculateRowMetrics($salesHistory, 500, 5, 3);
        $this->assertEquals('siap_po', $atTarget['urgency_status']);
        $this->assertEquals(0, $atTarget['recommended_po_qty']);

        // Di atas Target Stock (501) -> aman
        $aboveTarget = $this->service->calculateRowMetrics($salesHistory, 501, 5, 3);
        $this->assertEquals('aman', $aboveTarget['urgency_status']);
        $this->assertEquals(0, $aboveTarget['recommended_po_qty']);
    }

    public function test_get_3_months_date_range(): void
    {
        $fixedDate = Carbon::create(2026, 11, 21, 12, 0, 0);
        $ranges = $this->service->get3MonthsDateRange($fixedDate);

        $this->assertEquals('2026-08-01 00:00:00', $ranges['m3']['start']->toDateTimeString());
        $this->assertEquals('2026-08-31 23:59:59', $ranges['m3']['end']->toDateTimeString());
        $this->assertEquals('2026-09-01 00:00:00', $ranges['m2']['start']->toDateTimeString());
        $this->assertEquals('2026-09-30 23:59:59', $ranges['m2']['end']->toDateTimeString());
        $this->assertEquals('2026-10-01 00:00:00', $ranges['m1']['start']->toDateTimeString());
        $this->assertEquals('2026-10-31 23:59:59', $ranges['m1']['end']->toDateTimeString());
        $this->assertEquals('2026-08-01 00:00:00', $ranges['full_start']->toDateTimeString());
        $this->assertEquals('2026-10-31 23:59:59', $ranges['full_end']->toDateTimeString());
    }

    public function test_get_3_months_date_range_cross_year_boundary(): void
    {
        $fixedDate = Carbon::create(2027, 1, 15, 8, 30, 0);
        $ranges = $this->service->get3MonthsDateRange($fixedDate);

        $this->assertEquals('2026-10-01 00:00:00', $ranges['m3']['start']->toDateTimeString());
        $this->assertEquals('2026-10-31 23:59:59', $ranges['m3']['end']->toDateTimeString());
        $this->assertEquals('2026-11-01 00:00:00', $ranges['m2']['start']->toDateTimeString());
        $this->assertEquals('2026-11-30 23:59:59', $ranges['m2']['end']->toDateTimeString());
        $this->assertEquals('2026-12-01 00:00:00', $ranges['m1']['start']->toDateTimeString());
        $this->assertEquals('2026-12-31 23:59:59', $ranges['m1']['end']->toDateTimeString());
        $this->assertEquals('2026-10-01 00:00:00', $ranges['full_start']->toDateTimeString());
        $this->assertEquals('2026-12-31 23:59:59', $ranges['full_end']->toDateTimeString());
    }
}
