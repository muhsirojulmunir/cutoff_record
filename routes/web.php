<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\CutOffOrderController;
use App\Http\Controllers\CutOffReturnController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// --------------------
// Public / Callback Routes (OAuth Callbacks dari Marketplace)
// --------------------
Route::get('/marketplace/shopee/callback', [\App\Http\Controllers\ShopeeIntegrationController::class, 'handleCallback'])->name('shopee.callback');
Route::get('/marketplace/tiktok/callback', [\App\Http\Controllers\TiktokIntegrationController::class, 'handleCallback'])->name('tiktok.callback');

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

    // Pesanan Cut Off 2026
    Route::get('/cut-off-orders', [CutOffOrderController::class, 'index'])->name('cut-off-orders.index');
    Route::get('/cut-off-orders/export-data', [CutOffOrderController::class, 'exportData'])->name('cut-off-orders.export-data');
    Route::post('/cut-off-orders', [CutOffOrderController::class, 'store'])->name('cut-off-orders.store');
    Route::post('/cut-off-orders/import', [CutOffOrderController::class, 'importBatch'])->name('cut-off-orders.import');
    Route::post('/cut-off-orders/import-jl/preview', [CutOffOrderController::class, 'previewImportJl'])->name('cut-off-orders.import-jl.preview');
    Route::post('/cut-off-orders/import-jl', [CutOffOrderController::class, 'importJl'])->name('cut-off-orders.import-jl');
    Route::post('/cut-off-orders/sync-shopee', [CutOffOrderController::class, 'syncShopeeRecent'])->name('cut-off-orders.sync-shopee');
    Route::post('/cut-off-orders/truncate', [CutOffOrderController::class, 'truncate'])->name('cut-off-orders.truncate');
    Route::put('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'update'])->name('cut-off-orders.update');
    Route::post('/cut-off-orders/{cutOffOrder}/review', [CutOffOrderController::class, 'review'])->name('cut-off-orders.review');
    Route::post('/cut-off-orders/{cutOffOrder}/review/resolve', [CutOffOrderController::class, 'resolveReview'])->name('cut-off-orders.review.resolve');
    Route::delete('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'destroy'])->name('cut-off-orders.destroy');

    // Retur Online (RETURAN ONLINE FIX)
    Route::get('/cut-off-returns', [CutOffReturnController::class, 'index'])->name('cut-off-returns.index');
    Route::post('/cut-off-returns', [CutOffReturnController::class, 'store'])->name('cut-off-returns.store');
    Route::post('/cut-off-returns/import', [CutOffReturnController::class, 'importBatch'])->name('cut-off-returns.import');
    Route::put('/cut-off-returns/{cutOffReturn}', [CutOffReturnController::class, 'update'])->name('cut-off-returns.update');
    Route::delete('/cut-off-returns/{cutOffReturn}', [CutOffReturnController::class, 'destroy'])->name('cut-off-returns.destroy');

    // Master Stok (Gudang A & Gudang G)
    Route::get('/master-stock', [\App\Http\Controllers\MasterStockController::class, 'index'])->name('master-stock.index');
    Route::post('/master-stock/import', [\App\Http\Controllers\MasterStockController::class, 'import'])->name('master-stock.import');
    Route::post('/master-stock/clear', [\App\Http\Controllers\MasterStockController::class, 'clear'])->name('master-stock.clear');
    Route::get('/master-stock/export', [\App\Http\Controllers\MasterStockController::class, 'export'])->name('master-stock.export');

    // Stok Produk Shopee (Katalog SKU & Stok)
    Route::get('/shopee-products', [\App\Http\Controllers\ShopeeProductController::class, 'index'])->name('shopee-products.index');
    Route::post('/shopee-products/sync', [\App\Http\Controllers\ShopeeProductController::class, 'sync'])->name('shopee-products.sync');
    Route::get('/shopee-products/export', [\App\Http\Controllers\ShopeeProductController::class, 'export'])->name('shopee-products.export');
    Route::post('/shopee-products/compare', [\App\Http\Controllers\ShopeeProductController::class, 'compareStock'])->name('shopee-products.compare');
    Route::post('/shopee-products/audit-master', [\App\Http\Controllers\ShopeeProductController::class, 'compareWithMaster'])->name('shopee-products.audit-master');
    Route::post('/shopee-products/zero-out', [\App\Http\Controllers\ShopeeProductController::class, 'zeroOut'])->name('shopee-products.zero-out');
    Route::get('/shopee-products/zero-history', [\App\Http\Controllers\ShopeeProductController::class, 'zeroHistory'])->name('shopee-products.zero-history');
    Route::post('/shopee-products/restore', [\App\Http\Controllers\ShopeeProductController::class, 'restoreZeroBatch'])->name('shopee-products.restore');
    Route::post('/shopee-products/update-stock', [\App\Http\Controllers\ShopeeProductController::class, 'updateStock'])->name('shopee-products.update-stock');
    Route::get('/shopee-products/variants', [\App\Http\Controllers\ShopeeProductController::class, 'getProductVariants'])->name('shopee-products.variants');
    Route::get('/shopee-products/search-variants', [\App\Http\Controllers\ShopeeProductController::class, 'searchVariants'])->name('shopee-products.search-variants');
    Route::post('/shopee-products/map', [\App\Http\Controllers\ShopeeProductController::class, 'mapProduct'])->name('shopee-products.map');
    Route::post('/shopee-products/bulk-map', [\App\Http\Controllers\ShopeeProductController::class, 'bulkMap'])->name('shopee-products.bulk-map');
    Route::get('/shopee-products/search-master', [\App\Http\Controllers\ShopeeProductController::class, 'searchMasterStock'])->name('shopee-products.search-master');

    // Stok Produk TikTok (Katalog SKU & Stok)
    Route::get('/tiktok-products', [\App\Http\Controllers\TiktokProductController::class, 'index'])->name('tiktok-products.index');
    Route::post('/tiktok-products/sync', [\App\Http\Controllers\TiktokProductController::class, 'sync'])->name('tiktok-products.sync');
    Route::get('/tiktok-products/export', [\App\Http\Controllers\TiktokProductController::class, 'export'])->name('tiktok-products.export');
    Route::post('/tiktok-products/compare', [\App\Http\Controllers\TiktokProductController::class, 'compareStock'])->name('tiktok-products.compare');
    Route::post('/tiktok-products/audit-master', [\App\Http\Controllers\TiktokProductController::class, 'compareWithMaster'])->name('tiktok-products.audit-master');
    Route::post('/tiktok-products/zero-out', [\App\Http\Controllers\TiktokProductController::class, 'zeroOut'])->name('tiktok-products.zero-out');
    Route::get('/tiktok-products/zero-history', [\App\Http\Controllers\TiktokProductController::class, 'zeroHistory'])->name('tiktok-products.zero-history');
    Route::post('/tiktok-products/restore', [\App\Http\Controllers\TiktokProductController::class, 'restoreZeroBatch'])->name('tiktok-products.restore');
    Route::post('/tiktok-products/update-stock', [\App\Http\Controllers\TiktokProductController::class, 'updateStock'])->name('tiktok-products.update-stock');
    Route::get('/tiktok-products/variants', [\App\Http\Controllers\TiktokProductController::class, 'getProductVariants'])->name('tiktok-products.variants');
    Route::get('/tiktok-products/search-variants', [\App\Http\Controllers\TiktokProductController::class, 'searchVariants'])->name('tiktok-products.search-variants');
    Route::post('/tiktok-products/map', [\App\Http\Controllers\TiktokProductController::class, 'mapProduct'])->name('tiktok-products.map');
    Route::post('/tiktok-products/bulk-map', [\App\Http\Controllers\TiktokProductController::class, 'bulkMap'])->name('tiktok-products.bulk-map');
    Route::get('/tiktok-products/search-master', [\App\Http\Controllers\TiktokProductController::class, 'searchMasterStock'])->name('tiktok-products.search-master');

    // Users Management
    Route::resource('users', UserController::class)->except(['show']);

    // Roles & Permissions
    Route::get('/roles', [RoleController::class, 'index'])->name('roles.index')->middleware('can:role.view');
    Route::put('/roles/{role}/permissions', [RoleController::class, 'updatePermissions'])->name('roles.update-permissions')->middleware('can:role.view');

    // Integrasi Shopee Open API v2
    Route::get('/marketplace/shopee', [\App\Http\Controllers\ShopeeIntegrationController::class, 'index'])->name('shopee.index');
    Route::post('/marketplace/shopee/credentials', [\App\Http\Controllers\ShopeeIntegrationController::class, 'saveCredentials'])->name('shopee.credentials');
    Route::get('/marketplace/shopee/auth', [\App\Http\Controllers\ShopeeIntegrationController::class, 'authorizeShop'])->name('shopee.auth');
    Route::post('/marketplace/shopee/test-connection', [\App\Http\Controllers\ShopeeIntegrationController::class, 'testConnection'])->name('shopee.test');
    Route::post('/marketplace/shopee/sync-now', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncNow'])->name('shopee.sync');
    Route::post('/marketplace/shopee/sync-returns', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncReturns'])->name('shopee.sync-returns');
    Route::post('/marketplace/shopee/sync-products', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncProducts'])->name('shopee.sync-products');
    Route::get('/marketplace/shopee/products', [\App\Http\Controllers\ShopeeIntegrationController::class, 'productsList'])->name('shopee.products');

    // Customer Service (Omnichannel Shopee & TikTok Shop)
    Route::get('/customer-service', [\App\Http\Controllers\CustomerServiceController::class, 'index'])->name('customer-service.index');
    Route::get('/customer-service/poll', [\App\Http\Controllers\CustomerServiceController::class, 'poll'])->name('customer-service.poll');
    Route::get('/customer-service/diagnose', [\App\Http\Controllers\CustomerServiceController::class, 'diagnose'])->name('customer-service.diagnose');
    Route::post('/customer-service/sync', [\App\Http\Controllers\CustomerServiceController::class, 'sync'])->name('customer-service.sync');
    Route::post('/customer-service/clear-demo', [\App\Http\Controllers\CustomerServiceController::class, 'clearDemo'])->name('customer-service.clear-demo');
    Route::post('/customer-service/send-message', [\App\Http\Controllers\CustomerServiceController::class, 'sendMessage'])->name('customer-service.send-message');
    Route::post('/customer-service/{id}/read', [\App\Http\Controllers\CustomerServiceController::class, 'markAsRead'])->name('customer-service.read');
    Route::post('/customer-service/{id}/toggle-unread', [\App\Http\Controllers\CustomerServiceController::class, 'toggleUnread'])->name('customer-service.toggle-unread');
    Route::post('/customer-service/{id}/notes', [\App\Http\Controllers\CustomerServiceController::class, 'saveNotes'])->name('customer-service.notes');

    // Report Harian Konten (Kreatif, PIC, Direktur, Super Admin)
    Route::get('/content-reports', [\App\Http\Controllers\DailyContentReportController::class, 'index'])->name('content-reports.index');
    Route::post('/content-reports', [\App\Http\Controllers\DailyContentReportController::class, 'store'])->name('content-reports.store');
    Route::post('/content-reports/sync-views', [\App\Http\Controllers\DailyContentReportController::class, 'syncViews'])->name('content-reports.sync-views');
    Route::post('/content-reports/{id}/sync-views', [\App\Http\Controllers\DailyContentReportController::class, 'syncSingleView'])->name('content-reports.sync-single-view');
    Route::post('/content-reports/{id}/update-views', [\App\Http\Controllers\DailyContentReportController::class, 'updateViewsManual'])->name('content-reports.update-views-manual');
    Route::put('/content-reports/{id}', [\App\Http\Controllers\DailyContentReportController::class, 'update'])->name('content-reports.update');
    Route::post('/content-reports/{id}/review', [\App\Http\Controllers\DailyContentReportController::class, 'review'])->name('content-reports.review');
    Route::delete('/content-reports/{id}', [\App\Http\Controllers\DailyContentReportController::class, 'destroy'])->name('content-reports.destroy');

    // Naikkan Produk Shopee (Eksklusif Admin & Super Admin)
    Route::get('/shopee/boost-products', [\App\Http\Controllers\ShopeeBoostController::class, 'index'])->name('shopee.boost-products.index');
    Route::get('/shopee/boost-products/status', [\App\Http\Controllers\ShopeeBoostController::class, 'status'])->name('shopee.boost-products.status');
    Route::get('/shopee/boost-products/catalog', [\App\Http\Controllers\ShopeeBoostController::class, 'catalog'])->name('shopee.boost-products.catalog');
    Route::post('/shopee/boost-products/boost', [\App\Http\Controllers\ShopeeBoostController::class, 'boost'])->name('shopee.boost-products.boost');
    Route::get('/shopee/boost-products/search-products', [\App\Http\Controllers\ShopeeBoostController::class, 'searchProducts'])->name('shopee.boost-products.search-products');
    Route::post('/shopee/boost-products/auto-boost/toggle', [\App\Http\Controllers\ShopeeBoostController::class, 'toggleAutoBoost'])->name('shopee.boost-products.auto-boost.toggle');
    Route::post('/shopee/boost-products/auto-boost/save', [\App\Http\Controllers\ShopeeBoostController::class, 'saveAutoBoostTargets'])->name('shopee.boost-products.auto-boost.save');
    Route::post('/shopee/boost-products/auto-boost/add-item', [\App\Http\Controllers\ShopeeBoostController::class, 'addAutoBoostItem'])->name('shopee.boost-products.auto-boost.add');
    Route::post('/shopee/boost-products/auto-boost/remove-item', [\App\Http\Controllers\ShopeeBoostController::class, 'removeAutoBoostItem'])->name('shopee.boost-products.auto-boost.remove');
    Route::post('/shopee/boost-products/auto-boost/run-now', [\App\Http\Controllers\ShopeeBoostController::class, 'runAutoBoostNow'])->name('shopee.boost-products.auto-boost.run-now');

    // Export Logs & Download Riwayat
    Route::get('/export-logs', [\App\Http\Controllers\ExportLogController::class, 'index'])->name('export-logs.index');
    Route::post('/export-logs', [\App\Http\Controllers\ExportLogController::class, 'store'])->name('export-logs.store');
    Route::get('/export-logs/{exportLog}/download', [\App\Http\Controllers\ExportLogController::class, 'download'])->name('export-logs.download');

    // Pesanan Saya Shopee (Eksklusif Super Admin - Fulfillment & Cetak Resi A4)
    Route::get('/shopee-orders', [\App\Http\Controllers\ShopeeOrderController::class, 'index'])->name('shopee-orders.index');
    Route::get('/shopee-orders/export-data', [\App\Http\Controllers\ShopeeOrderController::class, 'exportData'])->name('shopee-orders.export-data');
    Route::get('/shopee-orders/waybill-history', [\App\Http\Controllers\ShopeeOrderController::class, 'waybillHistory'])->name('shopee-orders.waybill-history');
    Route::get('/shopee-orders/waybill-history/{id}/download', [\App\Http\Controllers\ShopeeOrderController::class, 'downloadArchivedWaybill'])->name('shopee-orders.waybill-download');
    Route::post('/shopee-orders/sync', [\App\Http\Controllers\ShopeeOrderController::class, 'sync'])->name('shopee-orders.sync');
    Route::post('/shopee-orders/auto-sync', [\App\Http\Controllers\ShopeeOrderController::class, 'autoSync'])->name('shopee-orders.auto-sync');
    Route::post('/shopee-orders/sync-chunk', [\App\Http\Controllers\ShopeeOrderController::class, 'syncChunk'])->name('shopee-orders.sync-chunk');
    Route::post('/shopee-orders/mass-ship', [\App\Http\Controllers\ShopeeOrderController::class, 'massShip'])->name('shopee-orders.mass-ship');
    Route::post('/shopee-orders/mass-waybill-a4', [\App\Http\Controllers\ShopeeOrderController::class, 'massPrintWaybill'])->name('shopee-orders.mass-waybill');
    Route::post('/shopee-orders/{orderSn}/refresh', [\App\Http\Controllers\ShopeeOrderController::class, 'refreshDetail'])->name('shopee-orders.refresh');
    Route::get('/shopee-orders/{orderSn}/escrow-detail', [\App\Http\Controllers\ShopeeOrderController::class, 'escrowDetail'])->name('shopee-orders.escrow-detail');
    Route::get('/shopee-orders/{orderSn}/tracking-info', [\App\Http\Controllers\ShopeeOrderController::class, 'trackingInfo'])->name('shopee-orders.tracking-info');
    Route::get('/shopee-orders/{orderSn}/shipping-parameters', [\App\Http\Controllers\ShopeeOrderController::class, 'shippingParameters'])->name('shopee-orders.shipping-params');
    Route::post('/shopee-orders/{orderSn}/ship', [\App\Http\Controllers\ShopeeOrderController::class, 'ship'])->name('shopee-orders.ship');
    Route::post('/shopee-orders/{orderSn}/poll-tracking', [\App\Http\Controllers\ShopeeOrderController::class, 'pollTrackingNumber'])->name('shopee-orders.poll-tracking');
    Route::get('/shopee-orders/{orderSn}/waybill-a4', [\App\Http\Controllers\ShopeeOrderController::class, 'printWaybill'])->name('shopee-orders.waybill');
    Route::post('/shopee-orders/{orderSn}/handle-cancel', [\App\Http\Controllers\ShopeeOrderController::class, 'handleCancellation'])->name('shopee-orders.handle-cancel');

    // Pesanan Saya TikTok (Eksklusif Super Admin - Fulfillment & Cetak Resi TikTok)
    Route::get('/tiktok-orders', [\App\Http\Controllers\TiktokOrderController::class, 'index'])->name('tiktok-orders.index');
    Route::get('/tiktok-orders/export-data', [\App\Http\Controllers\TiktokOrderController::class, 'exportData'])->name('tiktok-orders.export-data');
    Route::get('/tiktok-orders/waybill-history', [\App\Http\Controllers\TiktokOrderController::class, 'waybillHistory'])->name('tiktok-orders.waybill-history');
    Route::get('/tiktok-orders/waybill-history/{id}/download', [\App\Http\Controllers\TiktokOrderController::class, 'downloadArchivedWaybill'])->name('tiktok-orders.waybill-download');
    Route::post('/tiktok-orders/sync', [\App\Http\Controllers\TiktokOrderController::class, 'sync'])->name('tiktok-orders.sync');
    Route::post('/tiktok-orders/clear-sample', [\App\Http\Controllers\TiktokOrderController::class, 'clearSample'])->name('tiktok-orders.clear-sample');
    Route::post('/tiktok-orders/reset-sample', [\App\Http\Controllers\TiktokOrderController::class, 'resetSample'])->name('tiktok-orders.reset-sample');
    Route::post('/tiktok-orders/auto-sync', [\App\Http\Controllers\TiktokOrderController::class, 'autoSync'])->name('tiktok-orders.auto-sync');
    Route::post('/tiktok-orders/sync-chunk', [\App\Http\Controllers\TiktokOrderController::class, 'syncChunk'])->name('tiktok-orders.sync-chunk');
    Route::post('/tiktok-orders/mass-ship', [\App\Http\Controllers\TiktokOrderController::class, 'massShip'])->name('tiktok-orders.mass-ship');
    Route::post('/tiktok-orders/mass-waybill-a4', [\App\Http\Controllers\TiktokOrderController::class, 'massPrintWaybill'])->name('tiktok-orders.mass-waybill');
    Route::post('/tiktok-orders/{orderSn}/refresh', [\App\Http\Controllers\TiktokOrderController::class, 'refreshDetail'])->name('tiktok-orders.refresh');
    Route::get('/tiktok-orders/{orderSn}/escrow-detail', [\App\Http\Controllers\TiktokOrderController::class, 'escrowDetail'])->name('tiktok-orders.escrow-detail');
    Route::get('/tiktok-orders/{orderSn}/tracking-info', [\App\Http\Controllers\TiktokOrderController::class, 'trackingInfo'])->name('tiktok-orders.tracking-info');
    Route::get('/tiktok-orders/{orderSn}/shipping-parameters', [\App\Http\Controllers\TiktokOrderController::class, 'shippingParameters'])->name('tiktok-orders.shipping-params');
    Route::post('/tiktok-orders/{orderSn}/ship', [\App\Http\Controllers\TiktokOrderController::class, 'ship'])->name('tiktok-orders.ship');
    Route::post('/tiktok-orders/{orderSn}/poll-tracking', [\App\Http\Controllers\TiktokOrderController::class, 'pollTrackingNumber'])->name('tiktok-orders.poll-tracking');
    Route::get('/tiktok-orders/{orderSn}/waybill-a4', [\App\Http\Controllers\TiktokOrderController::class, 'printWaybill'])->name('tiktok-orders.waybill');
    Route::post('/tiktok-orders/{orderSn}/handle-cancel', [\App\Http\Controllers\TiktokOrderController::class, 'handleCancellation'])->name('tiktok-orders.handle-cancel');

    // Integrasi TikTok Shop Open API
    Route::get('/marketplace/tiktok', [\App\Http\Controllers\TiktokIntegrationController::class, 'index'])->name('tiktok.index');
    Route::post('/marketplace/tiktok/credentials', [\App\Http\Controllers\TiktokIntegrationController::class, 'saveCredentials'])->name('tiktok.credentials');
    Route::get('/marketplace/tiktok/auth', [\App\Http\Controllers\TiktokIntegrationController::class, 'authorizeShop'])->name('tiktok.auth');
    Route::post('/marketplace/tiktok/manual-exchange', [\App\Http\Controllers\TiktokIntegrationController::class, 'manualExchange'])->name('tiktok.manual-exchange');
    Route::post('/marketplace/tiktok/test-connection', [\App\Http\Controllers\TiktokIntegrationController::class, 'testConnection'])->name('tiktok.test');
    Route::post('/marketplace/tiktok/sync-now', [\App\Http\Controllers\TiktokIntegrationController::class, 'syncNow'])->name('tiktok.sync');
    Route::post('/marketplace/tiktok/sync-returns', [\App\Http\Controllers\TiktokIntegrationController::class, 'syncReturns'])->name('tiktok.sync-returns');

    // Stock Forecast & PO Planning
    Route::get('/stock-forecast', [\App\Http\Controllers\StockForecastController::class, 'index'])->name('stock-forecast.index');
    Route::post('/stock-forecast/propose', [\App\Http\Controllers\StockForecastController::class, 'propose'])->name('stock-forecast.propose');
    Route::put('/stock-forecast/proposals/{poProposal}', [\App\Http\Controllers\StockForecastController::class, 'updateProposal'])->name('stock-forecast.proposals.update');
    Route::delete('/stock-forecast/proposals/{poProposal}', [\App\Http\Controllers\StockForecastController::class, 'cancelProposal'])->name('stock-forecast.proposals.cancel');
    Route::post('/stock-forecast/proposals/{poProposal}/approve', [\App\Http\Controllers\StockForecastController::class, 'approve'])->name('stock-forecast.proposals.approve');
    Route::post('/stock-forecast/proposals/{poProposal}/reject', [\App\Http\Controllers\StockForecastController::class, 'reject'])->name('stock-forecast.proposals.reject');
});

// Web Cron Trigger untuk sinkronisasi otomatis Cut Off dari cPanel (via curl / wget)
Route::match(['get', 'post'], '/cron/cutoff-sync/{token?}', function (\Illuminate\Http\Request $request, $token = null) {
    // Keamanan: jika token dikirimkan, harus valid. Jika dipanggil langsung ke endpoint unik ini, izinkan eksekusi.
    $providedToken = $token ?? $request->query('token') ?? $request->header('X-Cron-Token');
    $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');

    if ($providedToken && $providedToken !== $expectedToken) {
        return response()->json([
            'status'  => 'error',
            'message' => 'Unauthorized cron access: token tidak valid.',
        ], 403);
    }

    try {
        \Illuminate\Support\Facades\Artisan::call('cutoff:sync', ['--days' => 2]);
        $output = \Illuminate\Support\Facades\Artisan::output();

        return response()->json([
            'status'    => 'success',
            'message'   => 'Cut Off sync executed successfully.',
            'timestamp' => now()->toIso8601String(),
            'output'    => trim($output),
        ]);
    } catch (\Throwable $e) {
        \Illuminate\Support\Facades\Log::error('[WebCron] Cut Off sync failed: ' . $e->getMessage());
        return response()->json([
            'status'  => 'error',
            'message' => 'Sync error: ' . $e->getMessage(),
        ], 500);
    }
})->name('cron.cutoff-sync');

// Web Cron Trigger untuk sinkronisasi otomatis Stok & Produk Shopee dari cPanel (via curl / wget)
Route::match(['get', 'post'], '/cron/shopee-products-sync/{token?}', function (\Illuminate\Http\Request $request, $token = null) {
    $providedToken = $token ?? $request->query('token') ?? $request->header('X-Cron-Token');
    $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');

    if ($providedToken && $providedToken !== $expectedToken) {
        return response()->json([
            'status'  => 'error',
            'message' => 'Unauthorized cron access: token tidak valid.',
        ], 403);
    }

    try {
        @ini_set('max_execution_time', '900');
        @set_time_limit(900);
        \Illuminate\Support\Facades\Artisan::call('shopee:sync-products');
        $output = \Illuminate\Support\Facades\Artisan::output();

        return response()->json([
            'status'    => 'success',
            'message'   => 'Shopee products & stock sync executed successfully.',
            'timestamp' => now()->toIso8601String(),
            'output'    => trim($output),
        ]);
    } catch (\Throwable $e) {
        \Illuminate\Support\Facades\Log::error('[WebCron] Shopee products sync failed: ' . $e->getMessage());
        return response()->json([
            'status'  => 'error',
            'message' => 'Sync error: ' . $e->getMessage(),
        ], 500);
    }
})->name('cron.shopee-products-sync');

// Web Cron Trigger untuk Auto-Naikkan Produk Shopee berkala (setiap 5-10 menit via cron job cPanel)
Route::match(['get', 'post'], '/cron/shopee-auto-boost/{token?}', function (\Illuminate\Http\Request $request, $token = null) {
    $providedToken = $token ?? $request->query('token') ?? $request->header('X-Cron-Token');
    $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');

    if ($providedToken && $providedToken !== $expectedToken) {
        return response()->json([
            'status'  => 'error',
            'message' => 'Unauthorized cron access: token tidak valid.',
        ], 403);
    }

    try {
        @ini_set('max_execution_time', '300');
        @set_time_limit(300);
        \Illuminate\Support\Facades\Artisan::call('shopee:auto-boost');
        $output = \Illuminate\Support\Facades\Artisan::output();

        return response()->json([
            'status'    => 'success',
            'message'   => 'Shopee auto-boost cron executed successfully.',
            'timestamp' => now()->toIso8601String(),
            'output'    => trim($output),
        ]);
    } catch (\Throwable $e) {
        \Illuminate\Support\Facades\Log::error('[WebCron] Shopee auto-boost failed: ' . $e->getMessage());
        return response()->json([
            'status'  => 'error',
            'message' => 'Auto-boost error: ' . $e->getMessage(),
        ], 500);
    }
})->name('cron.shopee-auto-boost');

// Helper untuk menjalankan migrasi database otomatis & inisialisasi role dari cPanel / browser
Route::match(['get', 'post'], '/system/migrate/{token?}', function (\Illuminate\Http\Request $request, $token = null) {
    $providedToken = $token ?? $request->query('token') ?? $request->header('X-Cron-Token');
    $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');

    $user = auth()->user();
    $isSuperAdmin = $user && ((method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) || $user->role?->name === 'Super Admin');

    if (! $isSuperAdmin && $providedToken !== $expectedToken) {
        return response()->json([
            'status'  => 'error',
            'message' => 'Unauthorized: Token tidak valid atau belum login sebagai Super Admin.',
        ], 403);
    }

    try {
        // 1. Jalankan Migrasi Database
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        $migrateOutput = \Illuminate\Support\Facades\Artisan::output();

        // 2. Jalankan Seeder Role Kreatif & Permissions
        \Illuminate\Support\Facades\Artisan::call('db:seed', [
            '--class' => 'Database\\Seeders\\CreativeRoleAndUserSeeder',
            '--force' => true,
        ]);
        $seedOutput = \Illuminate\Support\Facades\Artisan::output();

        // 3. Bersihkan Cache Sistem
        \Illuminate\Support\Facades\Artisan::call('optimize:clear');
        $clearOutput = \Illuminate\Support\Facades\Artisan::output();

        return response()->json([
            'status'         => 'success',
            'message'        => 'Migrasi database, inisialisasi role Kreatif, dan pembersihan cache berhasil!',
            'migrate_output' => trim($migrateOutput),
            'seed_output'    => trim($seedOutput),
            'clear_output'   => trim($clearOutput),
        ]);
    } catch (\Throwable $e) {
        return response()->json([
            'status'  => 'error',
            'message' => $e->getMessage(),
            'trace'   => $e->getTraceAsString(),
        ], 500);
    }
})->name('system.migrate');

