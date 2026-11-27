<?php

namespace App\Console\Commands;

use App\Models\TiktokAccount;
use App\Services\TiktokSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class TiktokSyncProductsCommand extends Command
{
    protected $signature = 'tiktok:sync-products {--account= : ID akun TikTok tertentu}';

    protected $description = 'Sinkronisasi otomatis katalog produk, varian, dan stok dari TikTok Shop Open API ke tabel tiktok_products.';

    public function __construct(
        private TiktokSyncService $syncService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $accountId = $this->option('account');

        $query = TiktokAccount::where('status', 'active')
            ->whereNotNull('access_token');

        if ($accountId) {
            $query->where('id', (int) $accountId);
        }

        $accounts = $query->get();

        if ($accounts->isEmpty()) {
            $this->info('Tidak ada akun TikTok Shop aktif yang terhubung.');
            return self::SUCCESS;
        }

        $hasError = false;

        foreach ($accounts as $account) {
            try {
                if (! $account->isConnected()) {
                    $this->warn("Akun [{$account->id}] {$account->account_name} belum memiliki koneksi API lengkap — dilewati.");
                    continue;
                }

                $this->info("Menyinkronkan produk TikTok Shop: {$account->account_name} (ID {$account->id})...");
                $result = $this->syncService->syncProductsFromTiktok($account);
                $this->info('  -> ' . ($result['message'] ?? 'Selesai'));
            } catch (\Throwable $e) {
                $hasError = true;
                Log::error('[TiktokSyncProductsCommand] Gagal sinkronisasi produk', [
                    'account_id' => $account->id,
                    'account_name' => $account->account_name,
                    'error'      => $e->getMessage(),
                ]);
                $this->error("  -> ERROR [{$account->account_name}]: " . $e->getMessage());
            }
        }

        return $hasError ? self::FAILURE : self::SUCCESS;
    }
}
