<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Auto-sync pesanan dan retur Cut Off (Shopee & TikTok) setiap 15 menit
Schedule::command('cutoff:sync --days=3')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->runInBackground();

