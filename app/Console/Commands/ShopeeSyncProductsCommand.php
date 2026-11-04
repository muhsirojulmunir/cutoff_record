<?php

namespace App\Console\Commands;

use App\Models\ShopeeAccount;
use App\Services\ShopeeSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ShopeeSyncProductsCommand extends Command
{
    /**
     * Nama dan signature command.
     * Penggunaan:
     *   php artisan shopee:sync-products
     *   php artisan shopee:sync-products --account=1
     */
    protected $signature = 'shopee:sync-products
                            {--account= : ID akun Shopee (default: akun aktif pertama)}';

    protected $description = 'Tarik data seluruh produk, SKU, dan stok dari Shopee Open API v2 ke database';

    public function __construct(private readonly ShopeeSyncService $syncService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $accountId = $this->option('account');

        $query = ShopeeAccount::where('status', 'active')->whereNotNull('access_token');
        if ($accountId) {
            $query->where('id', $accountId);
        }

        $account = $query->first();

        if (! $account) {
            $this->error('Toko Shopee aktif dengan token valid tidak ditemukan.');
            return self::FAILURE;
        }

        $this->info("=== Memulai Sinkronisasi Produk Shopee: {$account->account_name} (Shop ID: {$account->shop_id}) ===");

        try {
            $res = $this->syncService->syncProductsFromShopee($account, function (string $msg) {
                $this->line("  [INFO] {$msg}");
            });

            $this->newLine();
            $this->info('✓ ' . $res['message']);

            // Tampilkan cuplikan 10 produk pertama yang tersinkron
            $sampleProducts = $account->products()
                ->orderBy('stock', 'desc')
                ->take(10)
                ->get(['sku', 'item_name', 'model_name', 'stock', 'price']);

            if ($sampleProducts->isNotEmpty()) {
                $this->newLine();
                $this->info('Cuplikan 10 SKU dengan stok terbanyak:');
                $rows = [];
                foreach ($sampleProducts as $p) {
                    $rows[] = [
                        $p->sku ?: '—',
                        mb_substr($p->item_name, 0, 35) . '...',
                        $p->model_name ?: '—',
                        number_format($p->stock, 0, ',', '.'),
                        'Rp ' . number_format($p->price, 0, ',', '.'),
                    ];
                }
                $this->table(['SKU', 'Nama Produk', 'Variasi', 'Stok', 'Harga'], $rows);
            }

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Gagal menyinkronkan produk Shopee: ' . $e->getMessage());
            Log::error('[ShopeeSyncProductsCommand] Error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return self::FAILURE;
        }
    }
}

