<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Auto-sync pesanan Cut Off (Shopee & TikTok) setiap 2 menit (menangkap pembatalan cepat secara realtime)
Schedule::command('cutoff:sync --type=orders --days=2')
    ->everyTwoMinutes()
    ->withoutOverlapping(5)
    ->runInBackground();

// Auto-sync retur & adu banding marketplace (Shopee & TikTok) setiap 15 menit di latar belakang
Schedule::command('cutoff:sync --type=returns --days=14')
    ->everyFifteenMinutes()
    ->withoutOverlapping(10)
    ->runInBackground();

// Auto-sync katalog produk & stok Shopee setiap 10 menit
Schedule::command('shopee:sync-products')
    ->everyTenMinutes()
    ->withoutOverlapping(15)
    ->runInBackground();

// Auto-sync chat Customer Service (Shopee & TikTok Shop) setiap 1 menit di latar belakang
Schedule::call(function () {
    app(\App\Services\CustomerServiceManager::class)->syncTiktokChat();
    app(\App\Services\CustomerServiceManager::class)->syncShopeeChat();
})->name('sync-customer-service-chat')->everyMinute()->withoutOverlapping(2);

// Auto-cleanup berkas resi fisik & metadata yang berumur lebih dari 3 bulan (90 hari)
Schedule::call(function () {
    app(\App\Services\WaybillArchiveService::class)->pruneExpired(500);
})->name('prune-expired-waybills')->dailyAt('01:00');


