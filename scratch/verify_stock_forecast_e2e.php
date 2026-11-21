<?php

declare(strict_types=1);

/**
 * Standalone E2E Verification Script for Stock Forecast & PO Planning
 *
 * Verifies:
 * 1. StockForecastService row metrics calculation matching user's Sepatu A scenario:
 *    - Penjualan M-3: 90, M-2: 110, M-1: 100 -> Kecepatan: 100 pcs/bln
 *    - Stok: 400 pcs
 *    - Horizon: 5 bln, Lead Time: 3 bln
 *    - Asserts:
 *      * Ketahanan Stok = 4.0 bulan
 *      * Reorder Point = 300 pcs
 *      * Waktu ke PO = 1.0 bulan lagi
 *      * Target Stok = 500 pcs
 *      * Rekomendasi PO = 100 pcs
 *      * Urgency = 'siap_po'
 * 2. End-to-end database querying and aggregation across MasterStock & CutOffOrder
 * 3. PO Proposal creation by PIC -> status is 'pending_approval'
 * 4. PO Proposal approval by Management (Direktur) -> status becomes 'approved'
 * 5. PO Proposal rejection flow with reason -> status becomes 'rejected'
 * 6. Clean up of all scratch / test records
 */

// If running in sandboxed environment without external MySQL port access, default to SQLite in-memory
if (getenv('FORCE_MYSQL') !== 'true') {
    putenv('DB_CONNECTION=sqlite');
    putenv('DB_DATABASE=:memory:');
    $_ENV['DB_CONNECTION'] = 'sqlite';
    $_ENV['DB_DATABASE'] = ':memory:';
}

require_once __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\CutOffOrder;
use App\Models\MasterStock;
use App\Models\PoProposal;
use App\Models\Role;
use App\Models\User;
use App\Services\StockForecastService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

// Terminal styling
$GREEN = "\033[32m";
$RED   = "\033[31m";
$CYAN  = "\033[36m";
$YELLOW= "\033[33m";
$BOLD  = "\033[1m";
$RESET = "\033[0m";

echo "\n{$BOLD}{$CYAN}=================================================================={$RESET}\n";
echo "{$BOLD}{$CYAN}   STOCK FORECAST & PO PLANNING - E2E VERIFICATION SUITE         {$RESET}\n";
echo "{$BOLD}{$CYAN}=================================================================={$RESET}\n\n";

$passCount = 0;
$failCount = 0;

function assertCheck(string $description, bool $condition, ?string $detail = null): void
{
    global $passCount, $failCount, $GREEN, $RED, $BOLD, $RESET;
    if ($condition) {
        $passCount++;
        echo "  {$GREEN}{$BOLD}✓ [PASS]{$RESET} {$description}\n";
        if ($detail) {
            echo "          {$detail}\n";
        }
    } else {
        $failCount++;
        echo "  {$RED}{$BOLD}✗ [FAIL]{$RESET} {$description}\n";
        if ($detail) {
            echo "          {$RED}Detail: {$detail}{$RESET}\n";
        }
    }
}

// Tracking created IDs for safe cleanup
$createdOrderIds = [];
$createdStockCodes = [];
$createdProposalNumbers = [];
$createdUserIds = [];

try {
    // -------------------------------------------------------------
    // Step 0: Ensure database connectivity and migrations
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 0] Initializing Database & Running Migrations...{$RESET}\n";
    $dbDriver = DB::getDefaultConnection();
    echo "  {$CYAN}→ Active DB Driver: {$dbDriver}{$RESET}\n";
    
    Artisan::call('migrate', ['--force' => true]);
    echo "  {$GREEN}✓ Migrations executed successfully ({$dbDriver}){$RESET}\n\n";

    $service = new StockForecastService();

    // -------------------------------------------------------------
    // Step 1: Pure Mathematical Model Verification (Sepatu A Scenario)
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 1] Verifying StockForecastService Mathematical Formula (Sepatu A)...{$RESET}\n";
    echo "  Input Parameters:\n";
    echo "    - Penjualan M-3: 90 pcs, M-2: 110 pcs, M-1: 100 pcs (Total 300 pcs)\n";
    echo "    - Stok Gudang: 400 pcs\n";
    echo "    - Target Horizon: 5 bulan, Lead Time: 3 bulan\n\n";

    $salesHistory = ['m3' => 90, 'm2' => 110, 'm1' => 100];
    $currentStock = 400;
    $targetMonths = 5;
    $leadTimeMonths = 3;

    $mathMetrics = $service->calculateRowMetrics(
        $salesHistory,
        $currentStock,
        $targetMonths,
        $leadTimeMonths
    );

    assertCheck(
        "Kecepatan Penjualan = 100.00 pcs/bulan (300 / 3)",
        abs($mathMetrics['monthly_velocity'] - 100.00) < 0.001,
        "Actual: {$mathMetrics['monthly_velocity']}"
    );

    assertCheck(
        "Ketahanan Stok = 4.00 bulan (400 / 100)",
        abs($mathMetrics['stock_coverage_months'] - 4.00) < 0.001,
        "Actual: {$mathMetrics['stock_coverage_months']}"
    );

    assertCheck(
        "Reorder Point = 300 pcs (3 bulan * 100)",
        $mathMetrics['reorder_point'] === 300,
        "Actual: {$mathMetrics['reorder_point']}"
    );

    assertCheck(
        "Waktu ke PO = 1.00 bulan lagi ((400 - 300) / 100)",
        abs($mathMetrics['time_to_po_months'] - 1.00) < 0.001,
        "Actual: {$mathMetrics['time_to_po_months']}"
    );

    assertCheck(
        "Target Stok = 500 pcs (5 bulan * 100)",
        $mathMetrics['target_stock'] === 500,
        "Actual: {$mathMetrics['target_stock']}"
    );

    assertCheck(
        "Rekomendasi PO = 100 pcs (500 - 400)",
        $mathMetrics['recommended_po_qty'] === 100,
        "Actual: {$mathMetrics['recommended_po_qty']}"
    );

    assertCheck(
        "Status Urgensi = 'siap_po' (coverage 4.0 <= horizon 5.0 dan > lead time 3.0)",
        $mathMetrics['urgency_status'] === 'siap_po',
        "Actual: '{$mathMetrics['urgency_status']}'"
    );

    echo "\n";

    // -------------------------------------------------------------
    // Step 2: Seed Database with Sepatu A MasterStock and CutOffOrders
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 2] Seeding Database & Testing Full Query Aggregation...{$RESET}\n";
    $testSku = 'RECORD-SPK-MH-38';
    $createdStockCodes[] = $testSku;

    // 2a. Insert MasterStock (Warehouse G = 400 pcs)
    $stockRecord = MasterStock::updateOrCreate(
        ['warehouse' => 'G', 'item_code' => $testSku],
        [
            'item_name' => 'Sepatu Super Kids Merah Hitam 38',
            'unit'      => 'PSG',
            'raw_qty'   => 400,
            'qty_pcs'   => 400,
            'last_imported_at' => now(),
        ]
    );
    assertCheck("MasterStock created for SKU {$testSku} with 400 pcs in Warehouse G", $stockRecord->qty_pcs === 400);

    // 2b. Insert CutOffOrder records across 3 historical months
    $dateRanges = $service->get3MonthsDateRange();
    $m3Date = $dateRanges['m3']['start']->copy()->addDays(5)->setTime(10, 0, 0);
    $m2Date = $dateRanges['m2']['start']->copy()->addDays(5)->setTime(10, 0, 0);
    $m1Date = $dateRanges['m1']['start']->copy()->addDays(5)->setTime(10, 0, 0);

    $order1 = CutOffOrder::create([
        'order_date'   => $m3Date,
        'channel'      => 'SH',
        'order_number' => 'ORD-E2E-M3-' . uniqid(),
        'sku_utama'    => $testSku,
        'product_name' => 'Sepatu Super Kids Merah Hitam 38',
        'qty'          => 90,
    ]);
    $createdOrderIds[] = $order1->id;

    $order2 = CutOffOrder::create([
        'order_date'   => $m2Date,
        'channel'      => 'SH',
        'order_number' => 'ORD-E2E-M2-' . uniqid(),
        'sku_utama'    => $testSku,
        'product_name' => 'Sepatu Super Kids Merah Hitam 38',
        'qty'          => 110,
    ]);
    $createdOrderIds[] = $order2->id;

    $order3 = CutOffOrder::create([
        'order_date'   => $m1Date,
        'channel'      => 'SH',
        'order_number' => 'ORD-E2E-M1-' . uniqid(),
        'sku_utama'    => $testSku,
        'product_name' => 'Sepatu Super Kids Merah Hitam 38',
        'qty'          => 100,
    ]);
    $createdOrderIds[] = $order3->id;

    assertCheck("3 historical CutOffOrders created (M-3: 90, M-2: 110, M-1: 100)", count($createdOrderIds) === 3);

    // 2c. Clear cache and run getForecastData
    $service->clearSalesCache();
    $forecastResult = $service->getForecastData(5, 3, $testSku);

    assertCheck("Forecast queried successfully with results", !empty($forecastResult['rows']));

    $itemForecast = null;
    foreach ($forecastResult['rows'] as $item) {
        if ($item['item_code'] === $testSku) {
            $itemForecast = $item;
            break;
        }
    }

    assertCheck("Found item forecast row matching {$testSku}", $itemForecast !== null);

    if ($itemForecast !== null) {
        assertCheck("Database Aggregated Stock: G=400, Total=400", $itemForecast['total_stock'] === 400 && $itemForecast['stock_g'] === 400);
        assertCheck("Database Aggregated Sales: M-3=90, M-2=110, M-1=100", $itemForecast['sales_m3'] === 90 && $itemForecast['sales_m2'] === 110 && $itemForecast['sales_m1'] === 100);
        assertCheck("Database Aggregated Velocity = 100.00 pcs/bln", abs($itemForecast['monthly_velocity'] - 100.00) < 0.001);
        assertCheck("Database Aggregated Coverage = 4.00 bulan", abs($itemForecast['stock_coverage_months'] - 4.00) < 0.001);
        assertCheck("Database Aggregated Reorder Point = 300 pcs", $itemForecast['reorder_point'] === 300);
        assertCheck("Database Aggregated Time to PO = 1.00 bulan lagi", abs($itemForecast['time_to_po_months'] - 1.00) < 0.001);
        assertCheck("Database Aggregated Target Stock = 500 pcs", $itemForecast['target_stock'] === 500);
        assertCheck("Database Aggregated Recommended PO = 100 pcs", $itemForecast['recommended_po_qty'] === 100);
        assertCheck("Database Aggregated Urgency = 'siap_po'", $itemForecast['urgency_status'] === 'siap_po');
    }

    echo "\n";

    // -------------------------------------------------------------
    // Step 3: PIC Submits PO Proposal Flow
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 3] Verifying PO Proposal Submission by PIC...{$RESET}\n";

    $picRole = Role::firstOrCreate(['name' => 'PIC']);
    $picUser = User::firstOrCreate(
        ['email' => 'pic.e2e.test@record.id'],
        ['name' => 'PIC Sepatu E2E', 'password' => bcrypt('secret'), 'role_id' => $picRole->id]
    );
    $createdUserIds[] = $picUser->id;

    $poNumber1 = PoProposal::generatePoNumber();
    $createdProposalNumbers[] = $poNumber1;

    $proposal1 = PoProposal::create([
        'po_number'             => $poNumber1,
        'sku'                   => $testSku,
        'product_name'          => 'Sepatu Super Kids Merah Hitam 38',
        'supplier_name'         => 'Pabrik Sepatu Record Surabaya',
        'warehouse'             => 'G',
        'current_stock'         => 400,
        'monthly_velocity'      => 100.00,
        'stock_coverage_months' => 4.00,
        'recommended_qty'       => 100,
        'proposed_qty'          => 100,
        'status'                => PoProposal::STATUS_PENDING,
        'proposed_by'           => $picUser->id,
        'notes'                 => 'Pengajuan stok Sepatu Super Kids 100 pcs untuk target 5 bulan',
    ]);

    assertCheck("PO Proposal {$poNumber1} created in database", $proposal1->exists);
    assertCheck("Proposal initial status is 'pending_approval'", $proposal1->status === PoProposal::STATUS_PENDING);
    assertCheck("Helper isPending() returns true", $proposal1->isPending() === true);
    assertCheck("Proposal proposer correctly linked to PIC user", $proposal1->proposer->id === $picUser->id);

    echo "\n";

    // -------------------------------------------------------------
    // Step 4: Management (Direktur) Approves Proposal Flow
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 4] Verifying PO Proposal Approval by Management (Direktur)...{$RESET}\n";

    $dirRole = Role::firstOrCreate(['name' => 'Direktur']);
    $dirUser = User::firstOrCreate(
        ['email' => 'direktur.e2e.test@record.id'],
        ['name' => 'Direktur Utama E2E', 'password' => bcrypt('secret'), 'role_id' => $dirRole->id]
    );
    $createdUserIds[] = $dirUser->id;

    $proposal1->approveBy($dirUser);
    $proposal1->refresh();

    assertCheck("Proposal status transitions to 'approved'", $proposal1->status === PoProposal::STATUS_APPROVED);
    assertCheck("Proposal reviewed_by recorded as Direktur ID ({$dirUser->id})", $proposal1->reviewed_by === $dirUser->id);
    assertCheck("Proposal reviewer relationship resolves to Direktur user", $proposal1->reviewer->name === 'Direktur Utama E2E');
    assertCheck("Proposal reviewed_at timestamp is populated", !empty($proposal1->reviewed_at));

    echo "\n";

    // -------------------------------------------------------------
    // Step 5: PO Proposal Rejection Flow with Reason
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 5] Verifying PO Proposal Rejection Flow with Reason...{$RESET}\n";

    $testSkuB = 'RECORD-SPK-MH-39';
    $createdStockCodes[] = $testSkuB;

    $poNumber2 = PoProposal::generatePoNumber();
    $createdProposalNumbers[] = $poNumber2;

    $proposal2 = PoProposal::create([
        'po_number'             => $poNumber2,
        'sku'                   => $testSkuB,
        'product_name'          => 'Sepatu Super Kids Merah Hitam 39',
        'supplier_name'         => 'Pabrik Sepatu Record Surabaya',
        'warehouse'             => 'G',
        'current_stock'         => 600,
        'monthly_velocity'      => 50.00,
        'stock_coverage_months' => 12.00,
        'recommended_qty'       => 0,
        'proposed_qty'          => 100,
        'status'                => PoProposal::STATUS_PENDING,
        'proposed_by'           => $picUser->id,
        'notes'                 => 'Pengajuan tambahan buffer',
    ]);

    assertCheck("Second proposal {$poNumber2} created in 'pending_approval'", $proposal2->isPending() === true);

    $rejectionReason = 'Stok gudang masih sangat aman (12 bulan ketahanan stok). PO ditunda.';
    $proposal2->rejectBy($dirUser, $rejectionReason);
    $proposal2->refresh();

    assertCheck("Proposal status transitions to 'rejected'", $proposal2->status === PoProposal::STATUS_REJECTED);
    assertCheck("Rejection reason stored accurately", $proposal2->rejection_reason === $rejectionReason);
    assertCheck("Reviewed by recorded as Direktur ID", $proposal2->reviewed_by === $dirUser->id);
    assertCheck("Reviewed timestamp recorded", !empty($proposal2->reviewed_at));

    echo "\n";

} catch (\Throwable $e) {
    echo "{$RED}{$BOLD}[EXCEPTION] Unexpected error during verification:{$RESET}\n";
    echo $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n\n";
    $failCount++;
} finally {
    // -------------------------------------------------------------
    // Step 6: Cleanup Scratch / Test Records
    // -------------------------------------------------------------
    echo "{$BOLD}[Step 6] Cleaning up test records...{$RESET}\n";

    if (!empty($createdOrderIds)) {
        $deletedOrders = CutOffOrder::whereIn('id', $createdOrderIds)->forceDelete();
        echo "  ✓ Cleaned up {$deletedOrders} test CutOffOrders\n";
    }

    if (!empty($createdStockCodes)) {
        $deletedStocks = MasterStock::whereIn('item_code', $createdStockCodes)->delete();
        echo "  ✓ Cleaned up {$deletedStocks} test MasterStocks\n";
    }

    if (!empty($createdProposalNumbers)) {
        $deletedProposals = PoProposal::whereIn('po_number', $createdProposalNumbers)->delete();
        echo "  ✓ Cleaned up {$deletedProposals} test PoProposals\n";
    }

    if (!empty($createdUserIds)) {
        $deletedUsers = User::whereIn('id', $createdUserIds)->delete();
        echo "  ✓ Cleaned up {$deletedUsers} test Users\n";
    }

    if (isset($service)) {
        $service->clearSalesCache();
        echo "  ✓ Cleared StockForecast sales cache\n";
    }

    echo "\n";
}

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
echo "{$BOLD}{$CYAN}=================================================================={$RESET}\n";
echo "{$BOLD}VERIFICATION SUMMARY:{$RESET}\n";
echo "  Total Checks: " . ($passCount + $failCount) . "\n";
echo "  {$GREEN}Passed: {$passCount}{$RESET}\n";
if ($failCount > 0) {
    echo "  {$RED}Failed: {$failCount}{$RESET}\n";
} else {
    echo "  {$GREEN}{$BOLD}All checks passed with 100% success! [PASS]{$RESET}\n";
}
echo "{$BOLD}{$CYAN}=================================================================={$RESET}\n\n";

exit($failCount === 0 ? 0 : 1);
