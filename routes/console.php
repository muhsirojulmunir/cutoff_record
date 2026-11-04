<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Auto-sync pesanan dan retur Cut Off (Shopee & TikTok) setiap 1 menit (Realtime)
Schedule::command('cutoff:sync --days=2')
    ->everyMinute()
    ->withoutOverlapping(5)
    ->runInBackground();

// Auto-sync katalog produk & stok Shopee setiap 10 menit
Schedule::command('shopee:sync-products')
    ->everyTenMinutes()
    ->withoutOverlapping(15)
    ->runInBackground();

