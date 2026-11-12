<?php

use App\Http\Controllers\CutOffOrderController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Rute API untuk webhook integrasi external seperti Google Sheets Apps Script.
| Tidak memerlukan session CSRF token.
|
*/

Route::post('/cutoff/sync-sheet', [CutOffOrderController::class, 'syncFromSheet']);
Route::match(['get', 'post'], '/cutoff/export-sheet', [CutOffOrderController::class, 'exportForSheet']);

// Webhook Push Shopee Open Platform v2 (verifikasi HMAC-SHA256 di controller)
Route::post('/shopee/webhook', [\App\Http\Controllers\ShopeeWebhookController::class, 'handle'])->name('api.shopee.webhook');
