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
    Route::post('/cut-off-orders', [CutOffOrderController::class, 'store'])->name('cut-off-orders.store');
    Route::post('/cut-off-orders/import', [CutOffOrderController::class, 'importBatch'])->name('cut-off-orders.import');
    Route::post('/cut-off-orders/import-jl/preview', [CutOffOrderController::class, 'previewImportJl'])->name('cut-off-orders.import-jl.preview');
    Route::post('/cut-off-orders/import-jl', [CutOffOrderController::class, 'importJl'])->name('cut-off-orders.import-jl');
    Route::post('/cut-off-orders/sync-shopee', [CutOffOrderController::class, 'syncShopeeRecent'])->name('cut-off-orders.sync-shopee');
    Route::post('/cut-off-orders/truncate', [CutOffOrderController::class, 'truncate'])->name('cut-off-orders.truncate');
    Route::put('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'update'])->name('cut-off-orders.update');
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
    Route::post('/shopee-products/map', [\App\Http\Controllers\ShopeeProductController::class, 'mapProduct'])->name('shopee-products.map');
    Route::get('/shopee-products/search-master', [\App\Http\Controllers\ShopeeProductController::class, 'searchMasterStock'])->name('shopee-products.search-master');

    // Users Management
    Route::resource('users', UserController::class)->except(['show']);

    // Roles & Permissions
    Route::get('/roles', [RoleController::class, 'index'])->name('roles.index')->middleware('can:role.view');

    // Integrasi Shopee Open API v2
    Route::get('/marketplace/shopee', [\App\Http\Controllers\ShopeeIntegrationController::class, 'index'])->name('shopee.index');
    Route::post('/marketplace/shopee/credentials', [\App\Http\Controllers\ShopeeIntegrationController::class, 'saveCredentials'])->name('shopee.credentials');
    Route::get('/marketplace/shopee/auth', [\App\Http\Controllers\ShopeeIntegrationController::class, 'authorizeShop'])->name('shopee.auth');
    Route::post('/marketplace/shopee/test-connection', [\App\Http\Controllers\ShopeeIntegrationController::class, 'testConnection'])->name('shopee.test');
    Route::post('/marketplace/shopee/sync-now', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncNow'])->name('shopee.sync');
    Route::post('/marketplace/shopee/sync-returns', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncReturns'])->name('shopee.sync-returns');
    Route::post('/marketplace/shopee/sync-products', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncProducts'])->name('shopee.sync-products');
    Route::get('/marketplace/shopee/products', [\App\Http\Controllers\ShopeeIntegrationController::class, 'productsList'])->name('shopee.products');

    // Pesanan Saya Shopee (Eksklusif Super Admin - Fulfillment & Cetak Resi A4)
    Route::get('/shopee-orders', [\App\Http\Controllers\ShopeeOrderController::class, 'index'])->name('shopee-orders.index');
    Route::post('/shopee-orders/sync', [\App\Http\Controllers\ShopeeOrderController::class, 'sync'])->name('shopee-orders.sync');
    Route::post('/shopee-orders/auto-sync', [\App\Http\Controllers\ShopeeOrderController::class, 'autoSync'])->name('shopee-orders.auto-sync');
    Route::post('/shopee-orders/sync-chunk', [\App\Http\Controllers\ShopeeOrderController::class, 'syncChunk'])->name('shopee-orders.sync-chunk');
    Route::post('/shopee-orders/mass-ship', [\App\Http\Controllers\ShopeeOrderController::class, 'massShip'])->name('shopee-orders.mass-ship');
    Route::post('/shopee-orders/mass-waybill-a4', [\App\Http\Controllers\ShopeeOrderController::class, 'massPrintWaybill'])->name('shopee-orders.mass-waybill');
    Route::post('/shopee-orders/{orderSn}/refresh', [\App\Http\Controllers\ShopeeOrderController::class, 'refreshDetail'])->name('shopee-orders.refresh');
    Route::get('/shopee-orders/{orderSn}/shipping-parameters', [\App\Http\Controllers\ShopeeOrderController::class, 'shippingParameters'])->name('shopee-orders.shipping-params');
    Route::post('/shopee-orders/{orderSn}/ship', [\App\Http\Controllers\ShopeeOrderController::class, 'ship'])->name('shopee-orders.ship');
    Route::get('/shopee-orders/{orderSn}/waybill-a4', [\App\Http\Controllers\ShopeeOrderController::class, 'printWaybill'])->name('shopee-orders.waybill');
    Route::post('/shopee-orders/{orderSn}/handle-cancel', [\App\Http\Controllers\ShopeeOrderController::class, 'handleCancellation'])->name('shopee-orders.handle-cancel');

    // Integrasi TikTok Shop Open API
    Route::get('/marketplace/tiktok', [\App\Http\Controllers\TiktokIntegrationController::class, 'index'])->name('tiktok.index');
    Route::post('/marketplace/tiktok/credentials', [\App\Http\Controllers\TiktokIntegrationController::class, 'saveCredentials'])->name('tiktok.credentials');
    Route::get('/marketplace/tiktok/auth', [\App\Http\Controllers\TiktokIntegrationController::class, 'authorizeShop'])->name('tiktok.auth');
    Route::post('/marketplace/tiktok/manual-exchange', [\App\Http\Controllers\TiktokIntegrationController::class, 'manualExchange'])->name('tiktok.manual-exchange');
    Route::post('/marketplace/tiktok/test-connection', [\App\Http\Controllers\TiktokIntegrationController::class, 'testConnection'])->name('tiktok.test');
    Route::post('/marketplace/tiktok/sync-now', [\App\Http\Controllers\TiktokIntegrationController::class, 'syncNow'])->name('tiktok.sync');
    Route::post('/marketplace/tiktok/sync-returns', [\App\Http\Controllers\TiktokIntegrationController::class, 'syncReturns'])->name('tiktok.sync-returns');

    // System Utilities (Super Admin)
    Route::get('/system/migrate', function () {
        $user = auth()->user();
        if (! $user || (! (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) && $user->role?->name !== 'Super Admin')) {
            abort(403, 'Hanya Super Admin yang diizinkan menjalankan migrasi sistem.');
        }
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        return response()->json([
            'status'  => 'success',
            'message' => 'Migrasi database berhasil dijalankan.',
            'output'  => \Illuminate\Support\Facades\Artisan::output(),
        ]);
    })->name('system.migrate');
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

// Helper untuk menjalankan migrasi database otomatis dari cPanel / browser
Route::match(['get', 'post'], '/system/migrate/{token?}', function (\Illuminate\Http\Request $request, $token = null) {
    $providedToken = $token ?? $request->query('token') ?? $request->header('X-Cron-Token');
    $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');

    if ($providedToken && $providedToken !== $expectedToken) {
        return response()->json(['status' => 'error', 'message' => 'Unauthorized'], 403);
    }

    try {
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        $output = \Illuminate\Support\Facades\Artisan::output();

        return response()->json([
            'status'  => 'success',
            'message' => 'Database migration completed successfully.',
            'output'  => trim($output),
        ]);
    } catch (\Throwable $e) {
        return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
})->name('system.migrate');

