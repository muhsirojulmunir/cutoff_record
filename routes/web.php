<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\CutOffOrderController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

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
    Route::put('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'update'])->name('cut-off-orders.update');
    Route::delete('/cut-off-orders/{cutOffOrder}', [CutOffOrderController::class, 'destroy'])->name('cut-off-orders.destroy');

    // Users Management
    Route::resource('users', UserController::class)->except(['show']);

    // Roles & Permissions
    Route::get('/roles', [RoleController::class, 'index'])->name('roles.index')->middleware('can:role.view');

    // Integrasi Shopee Open API v2
    Route::get('/marketplace/shopee', [\App\Http\Controllers\ShopeeIntegrationController::class, 'index'])->name('shopee.index');
    Route::post('/marketplace/shopee/credentials', [\App\Http\Controllers\ShopeeIntegrationController::class, 'saveCredentials'])->name('shopee.credentials');
    Route::get('/marketplace/shopee/auth', [\App\Http\Controllers\ShopeeIntegrationController::class, 'authorizeShop'])->name('shopee.auth');
    Route::get('/marketplace/shopee/callback', [\App\Http\Controllers\ShopeeIntegrationController::class, 'handleCallback'])->name('shopee.callback');
    Route::post('/marketplace/shopee/test-connection', [\App\Http\Controllers\ShopeeIntegrationController::class, 'testConnection'])->name('shopee.test');
    Route::post('/marketplace/shopee/sync-now', [\App\Http\Controllers\ShopeeIntegrationController::class, 'syncNow'])->name('shopee.sync');
});
