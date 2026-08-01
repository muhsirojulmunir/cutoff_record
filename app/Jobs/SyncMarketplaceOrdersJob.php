<?php

namespace App\Jobs;

use App\Models\MarketplaceAccount;
use App\Services\Marketplace\MarketplaceSyncService;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SyncMarketplaceOrdersJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int    $timeout  = 300;
    public int    $tries    = 3;
    public int    $maxExceptions = 3;
    public array  $backoff  = [30, 60, 120];

    public function __construct(
        public readonly int    $accountId,
        public readonly string $timeFrom,
        public readonly string $timeTo,
        public readonly ?int   $userId = null
    ) {}

    public function handle(MarketplaceSyncService $syncService): void
    {
        $account = MarketplaceAccount::find($this->accountId);

        if (! $account || $account->status !== 'active') {
            Log::warning("[SyncMarketplaceOrdersJob] Account #{$this->accountId} not found or inactive. Skipping.");
            return;
        }

        try {
            $syncService->syncOrders($account, $this->timeFrom, $this->timeTo, $this->userId);
        } catch (\Exception $e) {
            $sanitized = preg_replace('/(access_token|refresh_token|app_secret|partner_key)=[^&\s]+/', '$1=***', $e->getMessage());
            Log::error("[SyncMarketplaceOrdersJob] Account #{$this->accountId}: {$sanitized}");
            throw $e;
        }
    }

    public function failed(\Throwable $exception): void
    {
        $sanitized = preg_replace('/(access_token|refresh_token|app_secret|partner_key)=[^&\s]+/', '$1=***', $exception->getMessage());
        Log::error("[SyncMarketplaceOrdersJob] Job permanently failed for account #{$this->accountId}: {$sanitized}");
    }
}
