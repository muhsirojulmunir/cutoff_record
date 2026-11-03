<?php

namespace App\Console\Commands;

use App\Models\ShopeeAccount;
use App\Models\TiktokAccount;
use App\Services\ShopeeSyncService;
use App\Services\TiktokSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CutOffSyncOrdersCommand extends Command
{
    protected $signature = 'cutoff:sync
                            {--days=3 : Jumlah hari ke belakang yang akan ditarik}
                            {--channel=all : Channel marketplace yang ingin disinkronkan (all, shopee, tiktok)}';

    protected $description = 'Otomatis sinkronkan pesanan & retur marketplace (Shopee / TikTok) ke tabel Cut Off.';

    public function __construct(
        private readonly ShopeeSyncService $shopeeService,
        private readonly TiktokSyncService $tiktokService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $days     = max(1, min(30, (int) $this->option('days')));
        $channel  = strtolower((string) $this->option('channel'));
        $timeTo   = time();
        $timeFrom = $timeTo - ($days * 86400);

        $this->info("Memulai sinkronisasi otomatis Cut Off ({$days} hari terakhir)...");

        // 1. Sync Shopee
        if (in_array($channel, ['all', 'shopee', 'sh'], true)) {
            $shopeeAccount = ShopeeAccount::where('status', 'active')
                ->whereNotNull('access_token')
                ->first();

            if ($shopeeAccount) {
                $this->info("Menarik data pesanan Shopee: {$shopeeAccount->account_name}...");
                try {
                    $orderRes = $this->shopeeService->syncOrdersToCutOff($shopeeAccount, $timeFrom, $timeTo);
                    $this->info("  Shopee Orders: {$orderRes['message']}");
                } catch (\Throwable $e) {
                    $this->error("  Gagal sync Shopee orders: {$e->getMessage()}");
                    Log::error("[CutOffSync] Shopee orders error: " . $e->getMessage());
                }

                $this->info("Menarik data retur Shopee...");
                try {
                    $returnRes = $this->shopeeService->syncReturnsToCutOff($shopeeAccount, $timeFrom, $timeTo);
                    $this->info("  Shopee Returns: {$returnRes['message']}");
                } catch (\Throwable $e) {
                    $this->error("  Gagal sync Shopee returns: {$e->getMessage()}");
                    Log::error("[CutOffSync] Shopee returns error: " . $e->getMessage());
                }
            } else {
                $this->warn("Toko Shopee belum terhubung.");
            }
        }

        // 2. Sync TikTok
        if (in_array($channel, ['all', 'tiktok', 'tt'], true)) {
            $tiktokAccount = TiktokAccount::where('status', 'active')
                ->whereNotNull('access_token')
                ->first();

            if ($tiktokAccount) {
                $this->info("Menarik data pesanan TikTok Shop: {$tiktokAccount->account_name}...");
                try {
                    $ttRes = $this->tiktokService->syncOrdersToCutOff($tiktokAccount, $timeFrom, $timeTo);
                    $this->info("  TikTok Orders: {$ttRes['message']}");
                } catch (\Throwable $e) {
                    $this->error("  Gagal sync TikTok orders: {$e->getMessage()}");
                    Log::error("[CutOffSync] TikTok orders error: " . $e->getMessage());
                }
            } else {
                $this->warn("Toko TikTok belum terhubung.");
            }
        }

        $this->info("Sinkronisasi otomatis selesai.");
        return self::SUCCESS;
    }
}
