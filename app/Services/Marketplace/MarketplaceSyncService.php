<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceSyncLog;
use App\Services\Marketplace\Shopee\ShopeeApiService;
use App\Services\Marketplace\Shopee\ShopeeOrderNormalizer;
use App\Services\Marketplace\TikTok\TikTokOrderNormalizer;
use App\Services\Marketplace\TikTok\TikTokShopApiService;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class MarketplaceSyncService
{
    public function __construct(
        private readonly MarketplaceOrderService $orderService,
        private readonly ShopeeApiService $shopeeApiService,
        private readonly TikTokShopApiService $tikTokApiService,
    ) {}

    /**
     * Perform manual order sync for an account within date range.
     */
    public function syncOrders(MarketplaceAccount $account, string $timeFrom, string $timeTo, ?int $userId = null): MarketplaceSyncLog
    {
        $log = $this->startSync($account, 'orders', $userId);

        try {
            $rawOrders = [];
            $normalizer = null;

            if ($account->marketplace === 'shopee') {
                $normalizer = new ShopeeOrderNormalizer();
                $orderList  = $this->shopeeApiService->getOrderList($account, $timeFrom, $timeTo);
                $orderSns   = array_column($orderList, 'order_sn');
                $rawOrders  = $this->shopeeApiService->getOrderDetail($account, $orderSns);
            } elseif ($account->marketplace === 'tiktok_shop') {
                $normalizer = new TikTokOrderNormalizer();
                $orderList  = $this->tikTokApiService->getOrderList($account, $timeFrom, $timeTo);
                $orderIds   = array_column($orderList, 'id');
                $rawOrders  = $this->tikTokApiService->getOrderDetail($account, $orderIds);
            } else {
                throw new InvalidArgumentException("Platform marketplace '{$account->marketplace}' tidak didukung.");
            }

            $fetchedCount = count($rawOrders);
            $createdCount = 0;
            $updatedCount = 0;
            $failedCount  = 0;

            foreach ($rawOrders as $rawOrder) {
                try {
                    $dto   = $normalizer->normalize($account, $rawOrder);
                    $exists = \App\Models\MarketplaceOrder::where('marketplace_account_id', $account->id)
                        ->where('external_order_id', $dto->externalOrderId)
                        ->exists();

                    $this->orderService->createOrUpdateFromNormalized($dto);

                    if ($exists) {
                        $updatedCount++;
                    } else {
                        $createdCount++;
                    }
                } catch (\Exception $e) {
                    $failedCount++;
                }
            }

            $status = $failedCount > 0 && ($createdCount > 0 || $updatedCount > 0)
                ? 'partial'
                : ($failedCount > 0 ? 'failed' : 'success');

            $log->update([
                'status'          => $status,
                'completed_at'    => now(),
                'records_fetched' => $fetchedCount,
                'records_created' => $createdCount,
                'records_updated' => $updatedCount,
                'records_failed'  => $failedCount,
            ]);

            $account->update([
                'last_synced_at'   => now(),
                'last_sync_status' => $status,
                'last_sync_error'  => $failedCount > 0 ? "Ada {$failedCount} order yang gagal di-ingest." : null,
            ]);

            return $log->fresh();
        } catch (\Exception $e) {
            $sanitizedError = preg_replace('/(access_token|refresh_token|app_secret|partner_key)=[^&]+/', '$1=***', $e->getMessage());
            return $this->failSync($log, $sanitizedError);
        }
    }

    /**
     * Start a sync log.
     */
    public function startSync(MarketplaceAccount $account, string $syncType, ?int $userId = null): MarketplaceSyncLog
    {
        if (! $account->isActive()) {
            throw new InvalidArgumentException("Akun marketplace '{$account->account_name}' tidak aktif, tidak dapat melakukan sinkronisasi.");
        }

        return MarketplaceSyncLog::create([
            'marketplace_account_id' => $account->id,
            'marketplace'            => $account->marketplace,
            'sync_type'              => $syncType,
            'status'                 => 'running',
            'started_at'             => now(),
            'records_fetched'        => 0,
            'records_created'        => 0,
            'records_updated'        => 0,
            'records_skipped'        => 0,
            'records_failed'         => 0,
            'created_by'             => $userId,
        ]);
    }

    /**
     * Mark a sync log as successful.
     */
    public function completeSync(MarketplaceSyncLog $log, array $counts = [], ?array $metadata = null): MarketplaceSyncLog
    {
        $log->update([
            'status'          => 'success',
            'completed_at'    => now(),
            'records_fetched' => $counts['fetched']  ?? $log->records_fetched,
            'records_created' => $counts['created']  ?? $log->records_created,
            'records_updated' => $counts['updated']  ?? $log->records_updated,
            'records_skipped' => $counts['skipped']  ?? $log->records_skipped,
            'records_failed'  => $counts['failed']   ?? $log->records_failed,
            'metadata'        => $metadata,
        ]);

        $this->updateAccountLastSync($log->account, 'success');

        return $log->fresh();
    }

    /**
     * Mark a sync log as failed.
     */
    public function failSync(MarketplaceSyncLog $log, string $errorMessage): MarketplaceSyncLog
    {
        $log->update([
            'status'        => 'failed',
            'completed_at'  => now(),
            'error_message' => $errorMessage,
        ]);

        $this->updateAccountLastSync($log->account, 'failed', $errorMessage);

        return $log->fresh();
    }

    private function updateAccountLastSync(MarketplaceAccount $account, string $status, ?string $error = null): void
    {
        $account->update([
            'last_synced_at'   => now(),
            'last_sync_status' => $status,
            'last_sync_error'  => $error,
        ]);
    }
}
