# Stock Forecast & PO Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun modul baru Analisis & Proyeksi Rencana PO (`/stock-forecast`) berbasis riwayat penjualan 3 bulan riil, ketahanan 5 bulan, lead time pabrik 3 bulan, serta alur pengajuan PO dari PIC ke antrean persetujuan akun Manajemen (Super Admin & Direktur).

**Architecture:** Layanan `StockForecastService` menghitung metrik proyeksi dan kecepatan laku dari `cut_off_orders` dan `master_stocks`, dikontrol oleh `StockForecastController` dengan otorisasi role Super Admin & PIC. Data pengajuan PO disimpan di tabel `po_proposals` untuk ditinjau dan disetujui akun Manajemen. UI dibangun menggunakan React 19 Inertia dengan standar desain Anti AI-Slop (dark slate-950/slate-900, aksen blue-600).

**Tech Stack:** Laravel 11, PHP 8.2+, MySQL, Inertia.js, React 19, TypeScript, TailwindCSS v4, Heroicons SVG, SheetJS (`xlsx`).

## Global Constraints
- Target Ketahanan Stok Default: **5 bulan**
- Lead Time Produksi Pabrik Default: **3 bulan**
- Periode Riwayat Penjualan: **3 bulan penuh ke belakang** ($M-3, M-2, M-1$)
- Hak Akses Menu: Khusus **Super Admin** dan **PIC**
- Hak Persetujuan Manajemen: **Super Admin** dan **Direktur**
- Desain UI: Anti AI-Slop (WAJIB dark slate `bg-slate-950`, cards `bg-slate-900/60`, border `border-slate-800`, aksen `blue-600`, DILARANG warna ungu/violet)
- Caching: Gunakan array primitif PHP (`int`, `string`, `bool`), DILARANG simpan Eloquent model instances di cache file

---

### Task 1: Database Migration & Model PoProposal

**Files:**
- Create: `database/migrations/2026_11_21_000001_create_po_proposals_table.php`
- Create: `app/Models/PoProposal.php`
- Test: `tests/Feature/PoProposalModelTest.php`

**Interfaces:**
- Consumes: Table `users`
- Produces: Model `App\Models\PoProposal` with relationships `proposer()`, `reviewer()` and helper scopes

- [ ] **Step 1: Write the failing test for PoProposal model & migration**

```php
<?php

namespace Tests\Feature;

use App\Models\PoProposal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PoProposalModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_and_manage_po_proposal(): void
    {
        $picUser = User::factory()->create(['name' => 'PIC Sepatu']);
        $mgmtUser = User::factory()->create(['name' => 'Direktur Utama']);

        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0001',
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids Merah Hitam 38',
            'supplier_name'         => 'Pabrik Utama Surabaya',
            'warehouse'             => 'G',
            'current_stock'         => 400,
            'monthly_velocity'      => 100.00,
            'stock_coverage_months' => 4.00,
            'recommended_qty'       => 100,
            'proposed_qty'          => 100,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $picUser->id,
            'notes'                 => 'Pengajuan dari analitik proyeksi stok 5 bulan',
        ]);

        $this->assertDatabaseHas('po_proposals', [
            'po_number' => 'PO-PRO-20261121-0001',
            'status'    => 'pending_approval',
        ]);

        $this->assertEquals('PIC Sepatu', $proposal->proposer->name);
        $this->assertTrue($proposal->isPending());

        // Approve proposal
        $proposal->approveBy($mgmtUser);
        $this->assertEquals(PoProposal::STATUS_APPROVED, $proposal->status);
        $this->assertEquals($mgmtUser->id, $proposal->reviewed_by);
        $this->assertNotNull($proposal->reviewed_at);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Feature/PoProposalModelTest.php`  
Expected: FAIL (Class `App\Models\PoProposal` does not exist or table not found)

- [ ] **Step 3: Create migration and model**

Migration `database/migrations/2026_11_21_000001_create_po_proposals_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('po_proposals', function (Blueprint $table) {
            $table->id();
            $table->string('po_number')->unique();
            $table->string('sku')->index();
            $table->string('product_name');
            $table->string('supplier_name')->nullable();
            $table->string('warehouse', 10)->default('G');
            $table->integer('current_stock')->default(0);
            $table->decimal('monthly_velocity', 10, 2)->default(0);
            $table->decimal('stock_coverage_months', 8, 2)->default(0);
            $table->integer('recommended_qty')->default(0);
            $table->integer('proposed_qty')->default(0);
            $table->string('status', 30)->default('pending_approval')->index();
            $table->foreignId('proposed_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('po_proposals');
    }
};
```

Model `app/Models/PoProposal.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class PoProposal extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUS_PENDING  = 'pending_approval';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_ORDERED  = 'ordered';

    protected $fillable = [
        'po_number',
        'sku',
        'product_name',
        'supplier_name',
        'warehouse',
        'current_stock',
        'monthly_velocity',
        'stock_coverage_months',
        'recommended_qty',
        'proposed_qty',
        'status',
        'proposed_by',
        'reviewed_by',
        'reviewed_at',
        'notes',
        'rejection_reason',
    ];

    protected $casts = [
        'current_stock'         => 'integer',
        'monthly_velocity'      => 'decimal:2',
        'stock_coverage_months' => 'decimal:2',
        'recommended_qty'       => 'integer',
        'proposed_qty'          => 'integer',
        'reviewed_at'           => 'datetime',
    ];

    public function proposer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'proposed_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function approveBy(User $user): void
    {
        $this->update([
            'status'      => self::STATUS_APPROVED,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
    }

    public function rejectBy(User $user, string $reason): void
    {
        $this->update([
            'status'           => self::STATUS_REJECTED,
            'reviewed_by'      => $user->id,
            'reviewed_at'      => now(),
            'rejection_reason' => $reason,
        ]);
    }

    public static function generatePoNumber(): string
    {
        $date = now()->format('Ymd');
        $prefix = "PO-PRO-{$date}-";
        $last = self::withTrashed()
            ->where('po_number', 'like', "{$prefix}%")
            ->orderByDesc('id')
            ->first();

        $seq = 1;
        if ($last && preg_match('/-(\d{4})$/', $last->po_number, $matches)) {
            $seq = ((int)$matches[1]) + 1;
        }

        return sprintf('%s%04d', $prefix, $seq);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test tests/Feature/PoProposalModelTest.php`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_11_21_000001_create_po_proposals_table.php app/Models/PoProposal.php tests/Feature/PoProposalModelTest.php
git commit -m "feat: add po_proposals migration and model"
```

---

### Task 2: Core Calculation Engine (`StockForecastService`)

**Files:**
- Create: `app/Services/StockForecastService.php`
- Test: `tests/Unit/StockForecastServiceTest.php`

**Interfaces:**
- Consumes: `App\Models\CutOffOrder`, `App\Models\MasterStock`, `App\Models\PoProposal`
- Produces: `StockForecastService::calculateForecast($targetMonths, $leadTimeMonths, $search, $statusFilter)` returning structured summary array and item rows.

- [ ] **Step 1: Write unit test for mathematical calculations and edge cases**

`tests/Unit/StockForecastServiceTest.php`:
```php
<?php

namespace Tests\Unit;

use App\Services\StockForecastService;
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
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Unit/StockForecastServiceTest.php`  
Expected: FAIL (Class `StockForecastService` does not exist)

- [ ] **Step 3: Implement `StockForecastService`**

Create `app/Services/StockForecastService.php`:
```php
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
        $cacheKey = 'stock_forecast_sales_3m_v1';
        $cached = Cache::store('file')->get($cacheKey);
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
                $result[$sku] = [
                    'm3' => (int)$row->m3_qty,
                    'm2' => (int)$row->m2_qty,
                    'm1' => (int)$row->m1_qty,
                ];
            }
        }

        Cache::store('file')->put($cacheKey, $result, 300); // 5 menit
        return $result;
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
                $itemsMap[$code]['stock_g'] += $stock->qty_pcs;
            } elseif ($wh === 'A') {
                $itemsMap[$code]['stock_a'] += $stock->qty_pcs;
            }
            $itemsMap[$code]['total_stock'] += $stock->qty_pcs;
        }

        // Ambil pengajuan PO aktif untuk penanda
        $activeProposals = PoProposal::whereIn('status', [PoProposal::STATUS_PENDING, PoProposal::STATUS_APPROVED])
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
            if ($urgency === 'harus_po') $stats['harus_po_count']++;
            elseif ($urgency === 'siap_po') $stats['siap_po_count']++;
            elseif ($urgency === 'aman') $stats['aman_count']++;
            else $stats['tenang_count']++;

            $stats['total_recommended_po'] += $metrics['recommended_po_qty'];

            $activePo = $activeProposals[$code] ?? null;

            $row = array_merge($data, $metrics, [
                'active_po_number' => $activePo,
            ]);

            // Filter search
            if ($search) {
                $s = strtolower(trim($search));
                if (!str_contains(strtolower($data['item_code']), $s) && !str_contains(strtolower($data['item_name']), $s)) {
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
            if ($diff !== 0) return $diff;
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test tests/Unit/StockForecastServiceTest.php`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/Services/StockForecastService.php tests/Unit/StockForecastServiceTest.php
git commit -m "feat: implement StockForecastService calculation engine"
```

---

### Task 3: Backend Controller & API Routes (`StockForecastController`)

**Files:**
- Create: `app/Http/Controllers/StockForecastController.php`
- Modify: `routes/web.php`
- Test: `tests/Feature/StockForecastControllerTest.php`

**Interfaces:**
- Consumes: `StockForecastService`, `PoProposal`, `User`
- Produces: Web endpoints:
  - `GET /stock-forecast`
  - `POST /stock-forecast/propose`
  - `POST /stock-forecast/proposals/{id}/approve`
  - `POST /stock-forecast/proposals/{id}/reject`

- [ ] **Step 1: Write feature test for controller endpoints and role authorization**

Create `tests/Feature/StockForecastControllerTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\PoProposal;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockForecastControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $picUser;
    private User $superAdminUser;
    private User $direkturUser;
    private User $gudangUser;

    protected function setUp(): void
    {
        parent::setUp();

        $picRole = Role::firstOrCreate(['name' => 'PIC']);
        $saRole = Role::firstOrCreate(['name' => 'Super Admin']);
        $dirRole = Role::firstOrCreate(['name' => 'Direktur']);
        $gudangRole = Role::firstOrCreate(['name' => 'Gudang']);

        $this->picUser = User::factory()->create(['name' => 'PIC User', 'role_id' => $picRole->id]);
        $this->picUser->roles()->attach($picRole);

        $this->superAdminUser = User::factory()->create(['name' => 'Super Admin User', 'role_id' => $saRole->id]);
        $this->superAdminUser->roles()->attach($saRole);

        $this->direkturUser = User::factory()->create(['name' => 'Direktur User', 'role_id' => $dirRole->id]);
        $this->direkturUser->roles()->attach($dirRole);

        $this->gudangUser = User::factory()->create(['name' => 'Gudang User', 'role_id' => $gudangRole->id]);
        $this->gudangUser->roles()->attach($gudangRole);
    }

    public function test_access_control(): void
    {
        // Gudang user cannot access
        $this->actingAs($this->gudangUser)->get('/stock-forecast')->assertStatus(403);

        // PIC user can access
        $this->actingAs($this->picUser)->get('/stock-forecast')->assertStatus(200);

        // Super Admin user can access
        $this->actingAs($this->superAdminUser)->get('/stock-forecast')->assertStatus(200);
    }

    public function test_pic_can_propose_po(): void
    {
        $payload = [
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids Merah Hitam 38',
            'supplier_name'         => 'Pabrik Surabaya',
            'warehouse'             => 'G',
            'current_stock'         => 400,
            'monthly_velocity'      => 100.00,
            'stock_coverage_months' => 4.00,
            'recommended_qty'       => 100,
            'proposed_qty'          => 120,
            'notes'                 => 'Permintaan tambah 20 pcs untuk antisipasi promo',
        ];

        $response = $this->actingAs($this->picUser)->post('/stock-forecast/propose', $payload);
        $response->assertSessionHas('success');

        $this->assertDatabaseHas('po_proposals', [
            'sku'          => 'RECORD-SPK-MH-38',
            'proposed_qty' => 120,
            'status'       => 'pending_approval',
            'proposed_by'  => $this->picUser->id,
        ]);
    }

    public function test_management_can_approve_po_proposal(): void
    {
        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0001',
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids',
            'current_stock'         => 400,
            'monthly_velocity'      => 100,
            'stock_coverage_months' => 4,
            'recommended_qty'       => 100,
            'proposed_qty'          => 100,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $this->picUser->id,
        ]);

        // Regular Gudang cannot approve
        $this->actingAs($this->gudangUser)->post("/stock-forecast/proposals/{$proposal->id}/approve")
            ->assertStatus(403);

        // Direktur can approve
        $response = $this->actingAs($this->direkturUser)->post("/stock-forecast/proposals/{$proposal->id}/approve");
        $response->assertSessionHas('success');

        $proposal->refresh();
        $this->assertEquals(PoProposal::STATUS_APPROVED, $proposal->status);
        $this->assertEquals($this->direkturUser->id, $proposal->reviewed_by);
    }

    public function test_management_can_reject_po_proposal(): void
    {
        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0002',
            'sku'                   => 'RECORD-SPK-MH-39',
            'product_name'          => 'Sepatu Super Kids 39',
            'current_stock'         => 500,
            'monthly_velocity'      => 50,
            'stock_coverage_months' => 10,
            'recommended_qty'       => 0,
            'proposed_qty'          => 50,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $this->picUser->id,
        ]);

        $response = $this->actingAs($this->superAdminUser)->post("/stock-forecast/proposals/{$proposal->id}/reject", [
            'rejection_reason' => 'Stok gudang masih sangat banyak (10 bulan).',
        ]);
        $response->assertSessionHas('success');

        $proposal->refresh();
        $this->assertEquals(PoProposal::STATUS_REJECTED, $proposal->status);
        $this->assertEquals('Stok gudang masih sangat banyak (10 bulan).', $proposal->rejection_reason);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Feature/StockForecastControllerTest.php`  
Expected: FAIL (Routes not found / controller missing)

- [ ] **Step 3: Implement `StockForecastController` and register routes**

Create `app/Http/Controllers/StockForecastController.php`:
```php
<?php

namespace App\Http\Controllers;

use App\Models\PoProposal;
use App\Services\StockForecastService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class StockForecastController extends Controller
{
    public function __construct(private readonly StockForecastService $forecastService) {}

    private function authorizeAccess(): void
    {
        $user = auth()->user();
        if (!$user) {
            abort(403);
        }

        $isAllowed = $user->roles->contains(fn($r) => in_array($r->name, ['Super Admin', 'PIC']))
            || in_array($user->role?->name, ['Super Admin', 'PIC']);

        if (!$isAllowed) {
            abort(403, 'Akses terbatas untuk Super Admin dan PIC.');
        }
    }

    private function authorizeManagement(): void
    {
        $user = auth()->user();
        if (!$user) {
            abort(403);
        }

        $isMgmt = $user->roles->contains(fn($r) => in_array($r->name, ['Super Admin', 'Direktur']))
            || in_array($user->role?->name, ['Super Admin', 'Direktur']);

        if (!$isMgmt) {
            abort(403, 'Hanya akun Manajemen (Super Admin / Direktur) yang dapat menyetujui pengajuan PO.');
        }
    }

    public function index(Request $request): Response
    {
        $this->authorizeAccess();

        $targetMonths    = (int)$request->input('target_months', 5);
        $leadTimeMonths  = (int)$request->input('lead_time_months', 3);
        $search          = $request->input('search');
        $statusFilter    = $request->input('status', 'all');

        $forecast = $this->forecastService->getForecastData(
            $targetMonths,
            $leadTimeMonths,
            $search,
            $statusFilter
        );

        $proposals = PoProposal::with(['proposer:id,name', 'reviewer:id,name'])
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        $user = auth()->user();
        $isManagement = $user->roles->contains(fn($r) => in_array($r->name, ['Super Admin', 'Direktur']))
            || in_array($user->role?->name, ['Super Admin', 'Direktur']);

        return Inertia::render('Stock/Forecast', [
            'forecast'     => $forecast,
            'proposals'    => $proposals,
            'filters'      => [
                'target_months'    => $targetMonths,
                'lead_time_months' => $leadTimeMonths,
                'search'           => $search,
                'status'           => $statusFilter,
            ],
            'isManagement' => $isManagement,
        ]);
    }

    public function propose(Request $request): RedirectResponse
    {
        $this->authorizeAccess();

        $validated = $request->validate([
            'sku'                   => ['required', 'string', 'max:100'],
            'product_name'          => ['required', 'string', 'max:255'],
            'supplier_name'         => ['nullable', 'string', 'max:255'],
            'warehouse'             => ['required', 'string', 'max:10'],
            'current_stock'         => ['required', 'integer'],
            'monthly_velocity'      => ['required', 'numeric'],
            'stock_coverage_months' => ['nullable', 'numeric'],
            'recommended_qty'       => ['required', 'integer'],
            'proposed_qty'          => ['required', 'integer', 'min:1'],
            'notes'                 => ['nullable', 'string', 'max:1000'],
        ]);

        $poNumber = PoProposal::generatePoNumber();

        PoProposal::create([
            'po_number'             => $poNumber,
            'sku'                   => $validated['sku'],
            'product_name'          => $validated['product_name'],
            'supplier_name'         => $validated['supplier_name'] ?? null,
            'warehouse'             => $validated['warehouse'],
            'current_stock'         => $validated['current_stock'],
            'monthly_velocity'      => $validated['monthly_velocity'],
            'stock_coverage_months' => $validated['stock_coverage_months'] ?? 0,
            'recommended_qty'       => $validated['recommended_qty'],
            'proposed_qty'          => $validated['proposed_qty'],
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => auth()->id(),
            'notes'                 => $validated['notes'] ?? null,
        ]);

        return back()->with('success', "Pengajuan PO {$poNumber} berhasil diajukan dan diteruskan ke antrean Manajemen.");
    }

    public function approve(PoProposal $poProposal): RedirectResponse
    {
        $this->authorizeManagement();

        if ($poProposal->status !== PoProposal::STATUS_PENDING) {
            return back()->with('error', 'Hanya pengajuan dengan status Menunggu yang dapat disetujui.');
        }

        $poProposal->approveBy(auth()->user());

        return back()->with('success', "Pengajuan PO {$poProposal->po_number} berhasil disetujui oleh Manajemen.");
    }

    public function reject(Request $request, PoProposal $poProposal): RedirectResponse
    {
        $this->authorizeManagement();

        if ($poProposal->status !== PoProposal::STATUS_PENDING) {
            return back()->with('error', 'Hanya pengajuan dengan status Menunggu yang dapat ditolak.');
        }

        $validated = $request->validate([
            'rejection_reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $poProposal->rejectBy(auth()->user(), $validated['rejection_reason']);

        return back()->with('success', "Pengajuan PO {$poProposal->po_number} telah ditolak.");
    }
}
```

Add routes to `routes/web.php` inside the authenticated route group:
```php
// Stock Forecast & PO Planning
Route::get('/stock-forecast', [App\Http\Controllers\StockForecastController::class, 'index'])->name('stock-forecast.index');
Route::post('/stock-forecast/propose', [App\Http\Controllers\StockForecastController::class, 'propose'])->name('stock-forecast.propose');
Route::post('/stock-forecast/proposals/{poProposal}/approve', [App\Http\Controllers\StockForecastController::class, 'approve'])->name('stock-forecast.proposals.approve');
Route::post('/stock-forecast/proposals/{poProposal}/reject', [App\Http\Controllers\StockForecastController::class, 'reject'])->name('stock-forecast.proposals.reject');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test tests/Feature/StockForecastControllerTest.php`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/StockForecastController.php routes/web.php tests/Feature/StockForecastControllerTest.php
git commit -m "feat: implement StockForecastController and routes"
```

---

### Task 4: Sidebar Navigation Integration (`AppLayout.tsx`)

**Files:**
- Modify: `resources/js/Layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: Navigation items list in `AppLayout.tsx`, User roles from `usePage().props.auth.user`
- Produces: Sidebar menu item "Proyeksi & Rencana PO" under `Stok` section, visible to `Super Admin` and `PIC`.

- [ ] **Step 1: Check existing `Stok` section in `AppLayout.tsx`**

Read `resources/js/Layouts/AppLayout.tsx` around line 95-120.

- [ ] **Step 2: Add navigation item with role guard**

Add item in `AppLayout.tsx` under the `Stok` dropdown children:
```tsx
{
    label: 'Proyeksi & Rencana PO',
    href: '/stock-forecast',
    customCheck: (user) => {
        const roleName = user?.role?.name;
        const roles = user?.roles || [];
        return roleName === 'Super Admin' || roles.includes('Super Admin') || roleName === 'PIC' || roles.includes('PIC');
    },
},
```
Ensure the item filter in `AppLayout.tsx` checks `customCheck` if present:
```tsx
if (item.customCheck) {
    return item.customCheck(user);
}
```

- [ ] **Step 3: Run TypeScript compiler to verify no type errors**

Run: `npx tsc --noEmit`  
Expected: Output clean (0 errors)

- [ ] **Step 4: Commit**

```bash
git add resources/js/Layouts/AppLayout.tsx
git commit -m "feat: add Proyeksi & Rencana PO menu to sidebar for Super Admin and PIC"
```

---

### Task 5: Frontend Page Implementation (`Stock/Forecast.tsx`)

**Files:**
- Create: `resources/js/Pages/Stock/Forecast.tsx`

**Interfaces:**
- Consumes: Inertia props: `forecast` (rows, stats, date_ranges, parameters), `proposals`, `filters`, `isManagement`, `auth`, `flash`.
- Produces: Interactive page with:
  - 5 Metric summary cards
  - Dynamic parameter sliders/inputs
  - Tab 1: Proyeksi Stok (Table with urgency badges, search & status filter, "Ajukan PO" action, SheetJS Excel export)
  - Tab 2: Antrean Pengajuan PO & Persetujuan Manajemen (Table of proposals, Approve/Reject buttons for Management)
  - Modal: "Ajukan PO ke Manajemen"
  - Modal: "Tolak Pengajuan PO"

- [ ] **Step 1: Implement `resources/js/Pages/Stock/Forecast.tsx` following Anti AI-Slop guidelines**

Requirements:
- Dark slate theme: `bg-slate-950`, cards `bg-slate-900/60`, borders `border-slate-800`.
- Aksen: `blue-600` / `navy #0B132B`, `emerald-500` (aman), `amber-400` (siap PO), `rose-500` (harus PO). Strictly NO purple/violet.
- Heroicons SVG 24x24 clean.
- Tabs switcher: "Analisis & Proyeksi Stok" vs "Pengajuan PO & Persetujuan Manajemen (N Menunggu)".
- Parameter inputs: Target Ketahanan (bulan) & Lead Time (bulan) with instant reload / recalculation.
- Excel Export using SheetJS `xlsx` with clean formatted columns.
- Propose PO modal with automatic pre-filled recommendation qty.
- Approve & Reject actions for Management accounts.

- [ ] **Step 2: Run TypeScript compiler to verify type safety**

Run: `npx tsc --noEmit`  
Expected: Output clean (0 errors)

- [ ] **Step 3: Commit**

```bash
git add resources/js/Pages/Stock/Forecast.tsx
git commit -m "feat: create Stock Forecast and PO Planning frontend page"
```

---

### Task 6: End-to-End System Verification & Seed Scenario Test

**Files:**
- Create: `scratch/verify_stock_forecast_e2e.php`

**Interfaces:**
- Consumes: Complete stock forecast stack (Service, Controller, Migration, UI routes)
- Produces: Execution verification report

- [ ] **Step 1: Write E2E verification test script**

`scratch/verify_stock_forecast_e2e.php`:
1. Creates test master stocks and 3 months of test orders (Sepatu A: 90, 110, 100 pcs; Stock 400).
2. Verifies `StockForecastService`:
   - Monthly velocity: 100
   - Stock coverage: 4.0 months
   - Reorder point: 300
   - Time to PO: 1.0 month
   - Recommended PO: 100 pcs
   - Urgency: `siap_po`
3. Simulates PIC submitting PO proposal -> verifies record in `po_proposals` with status `pending_approval`.
4. Simulates Direktur approving proposal -> verifies status updated to `approved`.
5. Tests rejection flow with reason.
6. Cleans up scratch records.

- [ ] **Step 2: Execute verification script**

Run: `php scratch/verify_stock_forecast_e2e.php`  
Expected: All assertions PASS with green checkmarks.

- [ ] **Step 3: Run comprehensive test suite**

Run: `php artisan test tests/Feature/StockForecastControllerTest.php tests/Unit/StockForecastServiceTest.php tests/Feature/PoProposalModelTest.php`  
Expected: All tests PASS.

- [ ] **Step 4: Commit and finalize**

```bash
git commit -m "test: verify end-to-end stock forecast and po planning workflow"
```
