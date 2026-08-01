<?php

namespace Tests\Feature;

use App\Models\CashBankAccount;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrder;
use App\Models\Permission;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\SalesOrder;
use App\Models\StockReservation;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Reports\DashboardReportService;
use App\Services\Reports\FinancialReportService;
use App\Services\Reports\InventoryReportService;
use App\Services\Reports\MarketplaceReportService;
use App\Services\Reports\PurchaseReportService;
use App\Services\Reports\SalesReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardReportTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $noPermUser;
    private Customer $customer;
    private Supplier $supplier;
    private Product $product;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['status' => 'active']);
        $this->noPermUser = User::factory()->create(['status' => 'active']);

        $role = Role::create(['name' => 'Admin Report Role', 'description' => 'Report Testing']);
        $permissions = [
            'dashboard.view', 'reports.sales.view', 'reports.purchase.view',
            'reports.inventory.view', 'reports.financial.view',
            'reports.marketplace.view', 'reports.export',
        ];
        foreach ($permissions as $perm) {
            $p = Permission::firstOrCreate(['name' => $perm], ['description' => $perm]);
            $role->permissions()->attach($p->id);
        }
        $this->admin->update(['role_id' => $role->id]);

        $category = \App\Models\Category::create(['name' => 'Kategori Test', 'status' => 'active']);

        $this->customer = Customer::create([
            'customer_code' => 'CUST-0001',
            'name'          => 'Customer Test',
            'status'        => 'active',
            'created_by'    => $this->admin->id,
        ]);

        $this->supplier = Supplier::create([
            'supplier_code' => 'SUP-0001',
            'name'          => 'Supplier Test',
            'status'        => 'active',
            'created_by'    => $this->admin->id,
        ]);

        $this->warehouse = Warehouse::create([
            'name'   => 'Gudang Utama',
            'code'   => 'GU',
            'status' => 'active',
        ]);

        $this->product = Product::create([
            'sku'           => 'SKU-RPT-01',
            'name'          => 'Produk Report',
            'category_id'   => $category->id,
            'stock'         => 100,
            'selling_price' => 100000,
            'purchase_price'=> 70000,
            'minimum_stock' => 10,
            'status'        => 'active',
        ]);
    }

    // ─── TESTS ────────────────────────────────────────────────────────────────

    /** @test */
    public function test_dashboard_page_accessible_by_authorized_user(): void
    {
        $response = $this->actingAs($this->admin)->get('/dashboard');
        $response->assertStatus(200);
        $response->assertInertia(fn($page) => $page->component('Dashboard')->has('metrics'));
    }

    /** @test */
    public function test_dashboard_kpi_sales_metrics(): void
    {
        SalesOrder::create([
            'so_number'      => 'SO-RPT-01',
            'customer_id'    => $this->customer->id,
            'order_date'     => now()->toDateString(),
            'source'         => 'manual',
            'sales_channel'  => 'website',
            'status'         => 'confirmed',
            'payment_status' => 'unpaid',
            'subtotal'       => 100000,
            'grand_total'    => 100000,
            'created_by'     => $this->admin->id,
        ]);

        $svc = app(SalesReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(1, $summary['total_orders']);
        $this->assertEquals(100000, $summary['total_revenue']);
    }

    /** @test */
    public function test_date_range_filter_preset_resolves_correctly(): void
    {
        $svc = app(DashboardReportService::class);

        [$from, $to] = $svc->resolveDateRange('this_month');
        $this->assertEquals(now()->startOfMonth()->toDateString(), $from);
        $this->assertEquals(now()->endOfMonth()->toDateString(), $to);

        [$todayFrom, $todayTo] = $svc->resolveDateRange('today');
        $this->assertEquals(now()->toDateString(), $todayFrom);
    }

    /** @test */
    public function test_custom_date_range_filtering(): void
    {
        $svc = app(DashboardReportService::class);
        [$from, $to] = $svc->resolveDateRange('custom', '2026-01-01', '2026-01-31');

        $this->assertEquals('2026-01-01', $from);
        $this->assertEquals('2026-01-31', $to);
    }

    /** @test */
    public function test_sales_report_aggregation_and_trend(): void
    {
        SalesOrder::create([
            'so_number'      => 'SO-TREND-01',
            'customer_id'    => $this->customer->id,
            'order_date'     => now()->toDateString(),
            'source'         => 'marketplace',
            'sales_channel'  => 'shopee',
            'status'         => 'confirmed',
            'payment_status' => 'unpaid',
            'subtotal'       => 150000,
            'grand_total'    => 150000,
            'created_by'     => $this->admin->id,
        ]);

        $svc = app(SalesReportService::class);
        $trend = $svc->getSalesTrend(now()->toDateString(), now()->toDateString());

        $this->assertNotEmpty($trend);
        $this->assertEquals(now()->toDateString(), $trend[0]['date']);
        $this->assertEquals(150000, $trend[0]['total']);
    }

    /** @test */
    public function test_purchase_report_aggregation_and_supplier_ranking(): void
    {
        PurchaseOrder::create([
            'po_number'   => 'PO-RPT-01',
            'supplier_id' => $this->supplier->id,
            'order_date'  => now(),
            'status'      => 'ordered',
            'subtotal'    => 500000,
            'grand_total' => 500000,
            'created_by'  => $this->admin->id,
        ]);

        $svc = app(PurchaseReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(1, $summary['total_orders']);
        $this->assertEquals(500000, $summary['total_amount']);
        $this->assertCount(1, $summary['top_suppliers']);
        $this->assertEquals($this->supplier->name, $summary['top_suppliers'][0]['supplier_name']);
    }

    /** @test */
    public function test_inventory_available_stock_calculation(): void
    {
        // Physical stock = 100
        // Reserve 20
        StockReservation::create([
            'product_id'  => $this->product->id,
            'warehouse_id'=> $this->warehouse->id,
            'quantity'    => 20,
            'status'      => 'reserved',
            'reserved_at' => now(),
        ]);

        $svc = app(InventoryReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(100, $summary['total_physical']);
        $this->assertEquals(20, $summary['total_reserved']);
        $this->assertEquals(80, $summary['available_stock']); // 100 - 20 = 80
    }

    /** @test */
    public function test_reserved_stock_not_counted_as_available(): void
    {
        StockReservation::create([
            'product_id'  => $this->product->id,
            'warehouse_id'=> $this->warehouse->id,
            'quantity'    => 95, // Leaves 5 available
            'status'      => 'reserved',
            'reserved_at' => now(),
        ]);

        $svc = app(InventoryReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(5, $summary['available_stock']);
        $this->assertEquals(1, $summary['low_stock_count']); // minimum_stock is 10, so 5 is low stock
    }

    /** @test */
    public function test_customer_receivables_report(): void
    {
        $so = SalesOrder::create([
            'so_number'      => 'SO-INV-01',
            'customer_id'    => $this->customer->id,
            'order_date'     => now()->toDateString(),
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'confirmed',
            'payment_status' => 'unpaid',
            'subtotal'       => 200000,
            'grand_total'    => 200000,
            'created_by'     => $this->admin->id,
        ]);

        Invoice::create([
            'invoice_number'   => 'INV-001',
            'sales_order_id'   => $so->id,
            'customer_id'      => $this->customer->id,
            'invoice_date'     => now()->toDateString(),
            'due_date'         => now()->addDays(14)->toDateString(),
            'status'           => 'unpaid',
            'subtotal'         => 200000,
            'total_amount'     => 200000,
            'remaining_amount' => 200000,
            'paid_amount'      => 0,
            'created_by'       => $this->admin->id,
        ]);

        $svc = app(FinancialReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(200000, $summary['total_receivables']);
        $this->assertEquals(1, $summary['unpaid_invoices_count']);
    }

    /** @test */
    public function test_cash_bank_summary_balances(): void
    {
        CashBankAccount::create([
            'account_code'    => 'ACC-001',
            'account_name'    => 'Bank BCA Utama',
            'account_number'  => '1234567890',
            'bank_name'       => 'BCA',
            'account_type'    => 'bank',
            'opening_balance' => 15000000,
            'current_balance' => 15000000,
            'status'          => 'active',
            'created_by'      => $this->admin->id,
        ]);

        $svc = app(FinancialReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(15000000, $summary['total_cash_balance']);
    }

    /** @test */
    public function test_marketplace_report_counts_and_platform_breakdown(): void
    {
        $account = MarketplaceAccount::create([
            'account_name' => 'Toko Shopee Test',
            'marketplace'  => 'shopee',
            'status'       => 'active',
            'created_by'   => $this->admin->id,
        ]);

        MarketplaceOrder::create([
            'marketplace_account_id' => $account->id,
            'marketplace'            => 'shopee',
            'external_order_id'      => 'SHP-999',
            'order_status'           => 'PAID',
            'internal_status'        => 'paid',
            'workflow_status'        => 'stock_reserved',
            'conversion_status'      => 'converted',
            'total_amount'           => 300000,
            'subtotal'               => 300000,
            'discount'               => 0,
            'shipping_fee'           => 0,
            'tax'                    => 0,
            'order_date'             => now(),
            'synced_at'              => now(),
        ]);

        $svc = app(MarketplaceReportService::class);
        $summary = $svc->getSummary();

        $this->assertEquals(1, $summary['total_orders']);
        $this->assertEquals(1, $summary['shopee_orders']);
        $this->assertEquals(300000, $summary['total_amount']);
        $this->assertEquals(1, $summary['converted_count']);
        $this->assertEquals(1, $summary['pipeline']['stock_reserved']);
    }

    /** @test */
    public function test_unauthorized_user_cannot_access_reports(): void
    {
        $response = $this->actingAs($this->noPermUser)->get('/reports/financial');
        $response->assertStatus(403);
    }

    /** @test */
    public function test_csv_export_endpoint_returns_download_stream(): void
    {
        $response = $this->actingAs($this->admin)->get('/reports/export/sales');
        $response->assertStatus(200);
        $this->assertTrue(str_contains($response->headers->get('content-type'), 'text/csv'));
    }

    /** @test */
    public function test_estimated_gross_profit_formula_calculation(): void
    {
        // 100k Sales, 70k PO cost
        SalesOrder::create([
            'so_number'      => 'SO-GP-01',
            'customer_id'    => $this->customer->id,
            'order_date'     => now()->toDateString(),
            'source'         => 'manual',
            'sales_channel'  => 'manual',
            'status'         => 'confirmed',
            'payment_status' => 'unpaid',
            'subtotal'       => 100000,
            'grand_total'    => 100000,
            'created_by'     => $this->admin->id,
        ]);

        PurchaseOrder::create([
            'po_number'   => 'PO-GP-01',
            'supplier_id' => $this->supplier->id,
            'order_date'  => now(),
            'status'      => 'ordered',
            'subtotal'    => 70000,
            'grand_total' => 70000,
            'created_by'  => $this->admin->id,
        ]);

        $svc = app(FinancialReportService::class);
        $summary = $svc->getSummary();

        // Gross Profit = 100,000 - 70,000 - 0 = 30,000
        $this->assertEquals(30000, $summary['estimated_gross_profit']);
    }
}
