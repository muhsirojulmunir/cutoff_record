<?php

namespace App\Console\Commands;

use App\Models\ShopeeAccount;
use App\Models\ShopeeAutoBoostConfig;
use App\Services\ShopeeBoostService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ShopeeAutoBoostCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'shopee:auto-boost
                            {--account= : ID akun Shopee tertentu (opsional)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Otomatis memeriksa slot naikkan produk Shopee dan menaikkan produk antrean setiap 4 jam secara nonstop';

    public function __construct(private readonly ShopeeBoostService $boostService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        ShopeeAutoBoostConfig::ensureSchema();

        $accountId = $this->option('account');

        $query = ShopeeAccount::where('status', 'active')->whereNotNull('access_token');
        if ($accountId) {
            $query->where('id', $accountId);
        }

        $accounts = $query->get();
        if ($accounts->isEmpty()) {
            $this->comment('Tidak ada akun Shopee aktif dengan token valid.');
            return self::SUCCESS;
        }

        foreach ($accounts as $account) {
            $config = ShopeeAutoBoostConfig::where('shopee_account_id', $account->id)->first();
            if (! $config || ! $config->is_enabled) {
                $this->line("Akun [{$account->account_name}]: Auto-boost tidak aktif.");
                continue;
            }

            $this->info("Menjalankan siklus auto-boost untuk toko: {$account->account_name}...");
            try {
                $res = $this->boostService->runAutoBoostCycle($account);
                $this->info("Hasil: [{$res['status']}] {$res['message']}");
                Log::info("[ShopeeAutoBoost] Toko {$account->account_name}: {$res['message']}");
            } catch (\Throwable $e) {
                $this->error("Kendala pada toko {$account->account_name}: {$e->getMessage()}");
                Log::error("[ShopeeAutoBoost] Error toko {$account->account_name}: {$e->getMessage()}");
            }
        }

        return self::SUCCESS;
    }
}
