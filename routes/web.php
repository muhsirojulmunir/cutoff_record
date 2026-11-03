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
    Route::post('/cut-off-orders/truncate', [CutOffOrderController::class, 'truncate'])->name('cut-off-orders.truncate');
    Route::put('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'update'])->name('cut-off-orders.update');
    Route::delete('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'destroy'])->name('cut-off-orders.destroy');

    // Retur Online (RETURAN ONLINE FIX)
    Route::get('/cut-off-returns', [CutOffReturnController::class, 'index'])->name('cut-off-returns.index');
    Route::post('/cut-off-returns', [CutOffReturnController::class, 'store'])->name('cut-off-returns.store');
    Route::post('/cut-off-returns/import', [CutOffReturnController::class, 'importBatch'])->name('cut-off-returns.import');
    Route::put('/cut-off-returns/{cutOffReturn}', [CutOffReturnController::class, 'update'])->name('cut-off-returns.update');
    Route::delete('/cut-off-returns/{cutOffReturn}', [CutOffReturnController::class, 'destroy'])->name('cut-off-returns.destroy');

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

    // Integrasi TikTok Shop Open API
    Route::get('/marketplace/tiktok', [\App\Http\Controllers\TiktokIntegrationController::class, 'index'])->name('tiktok.index');
    Route::post('/marketplace/tiktok/credentials', [\App\Http\Controllers\TiktokIntegrationController::class, 'saveCredentials'])->name('tiktok.credentials');
    Route::get('/marketplace/tiktok/auth', [\App\Http\Controllers\TiktokIntegrationController::class, 'authorizeShop'])->name('tiktok.auth');
    Route::post('/marketplace/tiktok/manual-exchange', [\App\Http\Controllers\TiktokIntegrationController::class, 'manualExchange'])->name('tiktok.manual-exchange');
    Route::post('/marketplace/tiktok/test-connection', [\App\Http\Controllers\TiktokIntegrationController::class, 'testConnection'])->name('tiktok.test');
    Route::post('/marketplace/tiktok/sync-now', [\App\Http\Controllers\TiktokIntegrationController::class, 'syncNow'])->name('tiktok.sync');

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
