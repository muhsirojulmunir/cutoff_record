<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ReportController;

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\CashBankAccountController;
use App\Http\Controllers\CashBankTransactionController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\FundAllocationController;
use App\Http\Controllers\MarketplaceAccountController;
use App\Http\Controllers\MarketplaceOrderController;
use App\Http\Controllers\MarketplaceProductMappingController;
use App\Http\Controllers\MarketplaceSyncController;
use App\Http\Controllers\MarketplaceSyncLogController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseOrderController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SalesOrderController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PettyCashController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\FactoryReceivableController;
use App\Http\Controllers\FactoryInvoiceController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\WarehouseController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// --------------------
// Guest Routes
// --------------------
Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'showLoginForm'])->name('login');
    Route::post('/login', [LoginController::class, 'login']);
});

// --------------------
// Authenticated Routes
// --------------------
Route::middleware('auth')->group(function () {
    Route::post('/logout', [LoginController::class, 'logout'])->name('logout');

    Route::get('/', function () {
        return redirect()->route('dashboard');
    });

    Route::get('/dashboard', DashboardController::class)->name('dashboard');

    // ── Reports ─────────────────────────────────────────────────────────────
    Route::get('/reports/sales',         [ReportController::class, 'sales'])->name('reports.sales');
    Route::get('/reports/sales-summary', [ReportController::class, 'sales'])->name('reports.sales-summary');
    Route::get('/reports/purchase',      [ReportController::class, 'purchase'])->name('reports.purchase');
    Route::get('/reports/inventory',     [ReportController::class, 'inventory'])->name('reports.inventory');
    Route::get('/reports/financial',     [ReportController::class, 'financial'])->name('reports.financial');
    Route::get('/reports/marketplace',   [ReportController::class, 'marketplace'])->name('reports.marketplace');
    Route::get('/reports/export/{type}', [ReportController::class, 'export'])->name('reports.export');

    // ── Menu baru (placeholder — diimplementasi pada task berikutnya) ───────
    Route::get('/all-stock', [StockController::class, 'allStock'])->middleware('can:stock.view')->name('all-stock');

    Route::get('/reports/hpp', [ReportController::class, 'hpp'])->middleware('can:reports.purchase.view')->name('reports.hpp');
    Route::get('/reports/sales-summary', [ReportController::class, 'salesSummary'])->middleware('can:reports.sales.view')->name('reports.sales-summary');

    Route::get('/reports/product-velocity', [ReportController::class, 'productVelocity'])->middleware('can:reports.sales.view')->name('reports.product-velocity');

    // Factory Invoices (Invoice Pabrik)
    Route::get('/factory-invoices', [FactoryInvoiceController::class, 'index'])->name('factory-invoices.index');
    Route::get('/factory-invoices/create', [FactoryInvoiceController::class, 'create'])->name('factory-invoices.create');
    Route::post('/factory-invoices', [FactoryInvoiceController::class, 'store'])->name('factory-invoices.store');
    Route::get('/factory-invoices/{factoryInvoice}', [FactoryInvoiceController::class, 'show'])->name('factory-invoices.show');
    Route::post('/factory-invoices/{factoryInvoice}/cancel', [FactoryInvoiceController::class, 'cancel'])->name('factory-invoices.cancel');

    // Categories
    Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index')->middleware('can:category.view');
    Route::post('/categories', [CategoryController::class, 'store'])->name('categories.store')->middleware('can:category.create');
    Route::put('/categories/{category}', [CategoryController::class, 'update'])->name('categories.update')->middleware('can:category.edit');
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])->name('categories.destroy')->middleware('can:category.delete');

    // Warehouses
    Route::resource('warehouses', WarehouseController::class);

    // Customers
    Route::resource('customers', CustomerController::class);

    // Suppliers
    Route::resource('suppliers', SupplierController::class);

    // Products
    Route::resource('products', ProductController::class);

    // Sales Orders Grosir Offline & Tracking Resi
    Route::get('/sales-orders/grosir/create', [SalesOrderController::class, 'createGrosir'])
        ->name('sales-orders.grosir.create');
    Route::post('/sales-orders/grosir/store', [SalesOrderController::class, 'storeGrosir'])
        ->name('sales-orders.grosir.store');
    Route::post('/sales-orders/{sales_order}/update-tracking', [SalesOrderController::class, 'updateTracking'])
        ->name('sales-orders.update-tracking');

    Route::get('/sales-orders/export', [SalesOrderController::class, 'export'])
        ->name('sales-orders.export')
        ->middleware('can:sales_order.view');

    Route::post('/sales-orders/{sales_order}/submit-approval', [SalesOrderController::class, 'submitApproval'])
        ->name('sales-orders.submit-approval')
        ->middleware('can:sales_order.edit');
    Route::post('/sales-orders/{sales_order}/approve', [SalesOrderController::class, 'approve'])
        ->name('sales-orders.approve')
        ->middleware('can:sales_order.approve');
    Route::post('/sales-orders/{sales_order}/complete', [SalesOrderController::class, 'complete'])
        ->name('sales-orders.complete')
        ->middleware('can:sales_order.approve');
    Route::post('/sales-orders/{sales_order}/cancel', [SalesOrderController::class, 'cancel'])
        ->name('sales-orders.cancel');

    Route::resource('sales-orders', SalesOrderController::class);


    // Purchase Orders
    Route::post('/purchase-orders/{purchase_order}/submit-approval', [PurchaseOrderController::class, 'submitApproval'])
        ->name('purchase-orders.submit-approval');
    Route::post('/purchase-orders/{purchase_order}/leader-approve', [PurchaseOrderController::class, 'leaderApprove'])
        ->name('purchase-orders.leader-approve');
    Route::post('/purchase-orders/{purchase_order}/finance-approve', [PurchaseOrderController::class, 'financeApprove'])
        ->name('purchase-orders.finance-approve');
    Route::post('/purchase-orders/{purchase_order}/reject', [PurchaseOrderController::class, 'reject'])
        ->name('purchase-orders.reject');
    Route::post('/purchase-orders/{purchase_order}/mark-ordered', [PurchaseOrderController::class, 'markOrdered'])
        ->name('purchase-orders.mark-ordered');
    Route::post('/purchase-orders/{purchase_order}/receive', [PurchaseOrderController::class, 'receive'])
        ->name('purchase-orders.receive');
    Route::post('/purchase-orders/{purchase_order}/cancel', [PurchaseOrderController::class, 'cancel'])
        ->name('purchase-orders.cancel');
    Route::post('/purchase-orders/{purchase_order}/pay-dp', [PurchaseOrderController::class, 'payDownPayment'])
        ->name('purchase-orders.pay-dp');
    Route::post('/purchase-orders/{purchase_order}/validate-receiving', [PurchaseOrderController::class, 'validateReceiving'])
        ->name('purchase-orders.validate-receiving');

    Route::resource('purchase-orders', PurchaseOrderController::class);

    // Users (Pengaturan)
    Route::resource('users', UserController::class)->except(['show']);

    // Stock Movements (Inventory Ledger)
    Route::get('/stock-movements', [StockMovementController::class, 'index'])->name('stock-movements.index');
    Route::post('/stock-movements/adjust', [StockMovementController::class, 'adjust'])->name('stock-movements.adjust');

    // Factory Receivables (Piutang Pabrik)
    Route::post('/factory-receivables/{factory_receivable}/cancel', [FactoryReceivableController::class, 'cancel'])
        ->name('factory-receivables.cancel');
    Route::resource('factory-receivables', FactoryReceivableController::class)->except(['create', 'store', 'destroy']);

    // Invoices (Invoice Customer)
    Route::get('/invoices/{invoice}/print', [InvoiceController::class, 'printView'])->name('invoices.print');
    Route::post('/invoices/{invoice}/cancel', [InvoiceController::class, 'cancel'])->name('invoices.cancel');
    Route::delete('/invoices/{invoice}', [InvoiceController::class, 'destroy'])->name('invoices.destroy');
    Route::resource('invoices', InvoiceController::class)->except(['create']);


    // Payments (Pembayaran & Penerimaan Dana)
    Route::get('/invoices/{invoice}/pay', [PaymentController::class, 'createInvoicePayment'])->name('invoices.pay.create');
    Route::post('/invoices/{invoice}/pay', [PaymentController::class, 'storeInvoicePayment'])->name('invoices.pay.store');
    Route::get('/factory-receivables/{factory_receivable}/pay', [PaymentController::class, 'createFactoryReceivablePayment'])->name('factory-receivables.pay.create');
    Route::post('/factory-receivables/{factory_receivable}/pay', [PaymentController::class, 'storeFactoryReceivablePayment'])->name('factory-receivables.pay.store');
    Route::post('/payments/{payment}/cancel', [PaymentController::class, 'cancel'])->name('payments.cancel');
    Route::delete('/payments/{payment}', [PaymentController::class, 'destroy'])->name('payments.destroy');
    Route::resource('payments', PaymentController::class)->only(['index', 'show']);

    // Roles (Pengaturan - view only)
    Route::get('/roles', [RoleController::class, 'index'])->name('roles.index')->middleware('can:role.view');

    // Pengisian Dana Mingguan (Petty Cash & Dana Kelola)
    Route::get('/fund-allocations', [FundAllocationController::class, 'index'])->name('fund-allocations.index');
    Route::post('/fund-allocations', [FundAllocationController::class, 'store'])->name('fund-allocations.store');
    Route::delete('/fund-allocations/{fundAllocation}', [FundAllocationController::class, 'destroy'])->name('fund-allocations.destroy');

    // Petty Cash & Expense Management
    Route::post('/petty-cash/{pettyCash}/submit',          [PettyCashController::class, 'submit'])->name('petty-cash.submit');
    Route::post('/petty-cash/{pettyCash}/leader-approve',  [PettyCashController::class, 'leaderApprove'])->name('petty-cash.leader-approve');
    Route::post('/petty-cash/{pettyCash}/finance-approve', [PettyCashController::class, 'financeApprove'])->name('petty-cash.finance-approve');
    Route::post('/petty-cash/{pettyCash}/disburse',        [PettyCashController::class, 'disburse'])->name('petty-cash.disburse');
    Route::post('/petty-cash/{pettyCash}/reject',          [PettyCashController::class, 'reject'])->name('petty-cash.reject');
    Route::post('/petty-cash/{pettyCash}/cancel',          [PettyCashController::class, 'cancel'])->name('petty-cash.cancel');
    Route::resource('petty-cash', PettyCashController::class);

    // ── Cash & Bank Accounts ──────────────────────────────────────────────────
    Route::post('/cash-bank/accounts/{cashBankAccount}/deactivate', [CashBankAccountController::class, 'deactivate'])->name('cash-bank.accounts.deactivate');
    Route::post('/cash-bank/accounts/{cashBankAccount}/activate',   [CashBankAccountController::class, 'activate'])->name('cash-bank.accounts.activate');
    Route::resource('cash-bank/accounts', CashBankAccountController::class)->parameters(['accounts' => 'cashBankAccount'])->names('cash-bank.accounts');

    // ── Cash & Bank Transactions ─────────────────────────────────────────────
    Route::post('/cash-bank/transactions/cash-in',     [CashBankTransactionController::class, 'storeCashIn'])->name('cash-bank.transactions.cash-in');
    Route::post('/cash-bank/transactions/cash-out',    [CashBankTransactionController::class, 'storeCashOut'])->name('cash-bank.transactions.cash-out');
    Route::post('/cash-bank/transactions/adjustment',  [CashBankTransactionController::class, 'storeAdjustment'])->name('cash-bank.transactions.adjustment');
    Route::get('/cash-bank/transactions',              [CashBankTransactionController::class, 'index'])->name('cash-bank.transactions.index');
    Route::get('/cash-bank/transactions/{cashBankTransaction}', [CashBankTransactionController::class, 'show'])->name('cash-bank.transactions.show');
    Route::delete('/cash-bank/transactions/{cashBankTransaction}', [CashBankTransactionController::class, 'destroy'])->name('cash-bank.transactions.destroy');

    // ── Marketplace ───────────────────────────────────────────────────────────
    Route::post('/marketplace/accounts/{marketplaceAccount}/deactivate',     [MarketplaceAccountController::class, 'deactivate'])->name('marketplace.accounts.deactivate');
    Route::post('/marketplace/accounts/{marketplaceAccount}/activate',       [MarketplaceAccountController::class, 'activate'])->name('marketplace.accounts.activate');
    Route::post('/marketplace/accounts/{marketplaceAccount}/credentials',    [MarketplaceAccountController::class, 'connectCredentials'])->name('marketplace.accounts.credentials');
    Route::post('/marketplace/accounts/{marketplaceAccount}/test-connection', [MarketplaceAccountController::class, 'testConnection'])->name('marketplace.accounts.test-connection');
    Route::post('/marketplace/accounts/{marketplaceAccount}/disconnect',     [MarketplaceAccountController::class, 'disconnect'])->name('marketplace.accounts.disconnect');
    Route::post('/marketplace/accounts/{marketplaceAccount}/sync-now',        [MarketplaceSyncController::class, 'syncNow'])->name('marketplace.accounts.sync-now');
    Route::resource('marketplace/accounts', MarketplaceAccountController::class)
        ->parameters(['accounts' => 'marketplaceAccount'])
        ->names('marketplace.accounts');

    Route::post('/marketplace/orders/{marketplaceOrder}/convert',       [MarketplaceOrderController::class, 'convertToSalesOrder'])->name('marketplace.orders.convert');
    Route::post('/marketplace/orders/{marketplaceOrder}/reserve-stock',  [MarketplaceOrderController::class, 'reserveStock'])->name('marketplace.orders.reserve-stock');
    Route::post('/marketplace/orders/{marketplaceOrder}/release-stock',  [MarketplaceOrderController::class, 'releaseStock'])->name('marketplace.orders.release-stock');
    Route::post('/marketplace/orders/{marketplaceOrder}/fulfill',        [MarketplaceOrderController::class, 'fulfill'])->name('marketplace.orders.fulfill');
    Route::get('/marketplace/orders',                                    [MarketplaceOrderController::class, 'index'])->name('marketplace.orders.index');
    Route::get('/marketplace/orders/{marketplaceOrder}',                 [MarketplaceOrderController::class, 'show'])->name('marketplace.orders.show');

    Route::resource('marketplace/mappings', MarketplaceProductMappingController::class)
        ->parameters(['mappings' => 'marketplaceMapping'])
        ->names('marketplace.mappings');

    Route::get('/marketplace/sync-logs',                      [MarketplaceSyncLogController::class, 'index'])->name('marketplace.sync-logs.index');
    Route::get('/marketplace/sync-logs/{marketplaceSyncLog}', [MarketplaceSyncLogController::class, 'show'])->name('marketplace.sync-logs.show');
});

