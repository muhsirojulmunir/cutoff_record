<?php

namespace App\Console\Commands;

use App\Models\MarketplaceAccount;
use App\Services\Marketplace\MarketplaceSyncService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class MarketplaceSyncOrdersCommand extends Command
{
    protected $signature   = 'marketplace:sync-orders
                                {--hours=24 : Number of hours to look back for orders}
                                {--account= : Specific account ID to sync}';
    protected $description = 'Sync marketplace orders from all active Shopee and TikTok Shop accounts.';

    public function __construct(private readonly MarketplaceSyncService $syncService) {
        parent::__construct();
    }

    public function handle(): int
    {
        $this->info('');
        $this->info('╔══════════════════════════════════════════╗');
        $this->info('║     Marketplace Order Sync Started        ║');
        $this->info('╚══════════════════════════════════════════╝');
        $this->info('');

        $hours  = (int) $this->option('hours');
        $acctId = $this->option('account');

        $timeTo   = Carbon::now()->timestamp;
        $timeFrom = Carbon::now()->subHours($hours)->timestamp;

        $query = MarketplaceAccount::where('status', 'active');
        if ($acctId) {
            $query->where('id', $acctId);
        }

        $accounts = $query->get();

        if ($accounts->isEmpty()) {
            $this->warn('Tidak ada akun marketplace aktif yang ditemukan.');
            return self::SUCCESS;
        }

        $totalFetched = 0;
        $totalCreated = 0;
        $totalUpdated = 0;
        $totalFailed  = 0;
        $startedAt    = microtime(true);

        foreach ($accounts as $account) {
            $this->info("→ Akun: {$account->account_name} ({$account->marketplace})");

            try {
                $log = $this->syncService->syncOrders($account, (string) $timeFrom, (string) $timeTo);

                $this->line("  Fetched : {$log->records_fetched}");
                $this->line("  Created : {$log->records_created}");
                $this->line("  Updated : {$log->records_updated}");
                $this->line("  Failed  : {$log->records_failed}");

                if ($log->status === 'failed') {
                    $this->error("  Status  : FAILED — {$log->error_message}");
                } elseif ($log->status === 'partial') {
                    $this->warn("  Status  : PARTIAL");
                } else {
                    $this->info("  Status  : SUCCESS");
                }

                $totalFetched += $log->records_fetched;
                $totalCreated += $log->records_created;
                $totalUpdated += $log->records_updated;
                $totalFailed  += $log->records_failed;
            } catch (\Exception $e) {
                $sanitized = preg_replace('/(access_token|refresh_token|app_secret|partner_key)=[^&\s]+/', '$1=***', $e->getMessage());
                $this->error("  Error: {$sanitized}");
                Log::error("[MarketplaceSync] Error syncing account #{$account->id}: {$sanitized}");
                $totalFailed++;
            }

            $this->line('');
        }

        $duration = round(microtime(true) - $startedAt, 2);

        $this->info('╔══════════════════════════════════════════╗');
        $this->info('║     Marketplace Sync Completed            ║');
        $this->info('╚══════════════════════════════════════════╝');
        $this->info("  Accounts : {$accounts->count()}");
        $this->info("  Fetched  : {$totalFetched}");
        $this->info("  Created  : {$totalCreated}");
        $this->info("  Updated  : {$totalUpdated}");
        $this->info("  Failed   : {$totalFailed}");
        $this->info("  Duration : {$duration}s");
        $this->info('');

        return self::SUCCESS;
    }
}
