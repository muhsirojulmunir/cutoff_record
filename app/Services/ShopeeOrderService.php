<?php

namespace App\Services;

use App\Models\CutOffOrder;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class ShopeeOrderService
{
    public const ORDER_DETAIL_FIELDS = 'buyer_user_id,buyer_username,recipient_address,item_list,package_list,shipping_carrier,total_amount,cancel_by,cancel_reason,buyer_cancel_reason,payment_info,payment_method,ship_by_date,message_to_seller,note,estimated_shipping_fee,cod';

    public const WAYBILL_DOCUMENT_TYPE = 'THERMAL_AIR_WAYBILL';

    public const MAX_BATCH_SIZE = 50;

    private const POOL_WAVE_SIZE = 6;

    private string $host;

    private readonly ShopeeOrderRecorder $recorder;

    public function __construct(
        private readonly ShopeeSyncService $syncService,
        ?ShopeeOrderRecorder $recorder = null,
    ) {
        $this->host = rtrim((string) config('services.shopee.host', 'https://partner.shopeemobile.com'), '/');
        $this->recorder = $recorder ?? app(ShopeeOrderRecorder::class);
    }

    /**
     * Reset cache status pemeriksaan skema (berguna pada skenario test yang me-reset DB).
     */
    public function resetSchemaCache(): void
    {
        $this->recorder->resetSchemaCache();
    }

    /**
     * Pastikan tabel shopee_orders tersedia di database (aman untuk deploy tanpa shell).
     */
    public function ensureSchema(): void
    {
        $this->recorder->ensureSchema();
    }

    /**
     * Sinkronisasi pesanan dari Shopee API v2 ke shopee_orders dan (opsional) cut_off_orders.
     * HANYA memanggil endpoint Shopee baca (read-only).
     *
     * @return array{total_fetched: int, synced_orders: int, changed_orders: int, cutoff_created: int, cutoff_updated: int, last_synced_at: ?string, message: string}
     */
    public function syncOrders(
        ShopeeAccount $account,
        int $timeFrom,
        int $timeTo,
        ?string $orderStatus = null,
        bool $syncCutOff = true,
        bool $includeUpdateWindow = false
    ): array {
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        if ($timeTo < $timeFrom) {
            [$timeFrom, $timeTo] = [$timeTo, $timeFrom];
        }
        if ($timeTo === $timeFrom) {
            $timeFrom = $timeTo - 86400;
        }

        try {
            $orderSns = $this->collectOrderSnsInWindow($account, $timeFrom, $timeTo, $orderStatus, $includeUpdateWindow);

            return $this->syncOrderSnListPipeline(
                $account,
                $orderSns,
                $syncCutOff,
                true,
                'Tidak ada pesanan Shopee pada rentang waktu tersebut.'
            );
        } catch (\Throwable $e) {
            $account->update([
                'last_sync_status' => 'failed',
                'last_sync_error'  => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Sinkronisasi inkremental otomatis (locked + cooldown + create_time/update_time + order aktif lokal).
     * HANYA memanggil endpoint Shopee baca (read-only).
     *
     * @return array{status: string, skipped: bool, reason: ?string, total_fetched: int, synced_orders: int, changed_orders: int, cutoff_created: int, cutoff_updated: int, last_synced_at: ?string, message: string}
     */
    public function runIncrementalAutoSync(
        ShopeeAccount $account,
        int $lookbackSeconds = 10800,
        int $cooldownSeconds = 20
    ): array {
        $lookbackSeconds = max(900, min(172800, $lookbackSeconds));
        $cooldownSeconds = max(0, $cooldownSeconds);
        $this->ensureSchema();

        $lock = Cache::lock('shopee_orders_auto_sync_' . $account->id, 45);
        if (! $lock->get()) {
            $freshAccount = ShopeeAccount::find($account->id) ?? $account;

            return [
                'status'         => 'skipped',
                'skipped'        => true,
                'reason'         => 'locked',
                'total_fetched'  => 0,
                'synced_orders'  => 0,
                'changed_orders' => 0,
                'cutoff_created' => 0,
                'cutoff_updated' => 0,
                'last_synced_at' => $this->formatLastSyncedAt($freshAccount),
                'message'        => 'Sinkronisasi otomatis sedang berjalan di proses lain.',
            ];
        }

        try {
            $freshAccount = ShopeeAccount::find($account->id) ?? $account;

            if (
                $cooldownSeconds > 0
                && $freshAccount->last_sync_status === 'success'
                && $freshAccount->last_synced_at !== null
                && $freshAccount->last_synced_at->gt(now()->subSeconds($cooldownSeconds))
            ) {
                return [
                    'status'         => 'skipped',
                    'skipped'        => true,
                    'reason'         => 'cooldown',
                    'total_fetched'  => 0,
                    'synced_orders'  => 0,
                    'changed_orders' => 0,
                    'cutoff_created' => 0,
                    'cutoff_updated' => 0,
                    'last_synced_at' => $this->formatLastSyncedAt($freshAccount),
                    'message'        => 'Data pesanan masih baru (cooldown sinkronisasi otomatis aktif).',
                ];
            }

            try {
                $freshAccount = $this->ensureConnectedAccount($freshAccount);

                $nowTs = time();
                $timeFrom = $nowTs - $lookbackSeconds;
                $orderSns = $this->collectOrderSnsInWindow($freshAccount, $timeFrom, $nowTs, null, true);

                // Prioritaskan pesanan terbaru dari jendela 30 menit, lalu rotasi maksimal 15 pesanan aktif lama
                // dan batasi 1 batch (50 pesanan) per tick 30s agar bebas timeout HTTP 503 di hosting.
                $allOrderSns = [];
                foreach ($orderSns as $sn) {
                    $snStr = trim((string) $sn);
                    if ($snStr !== '') {
                        $allOrderSns[$snStr] = true;
                        if (count($allOrderSns) >= self::MAX_BATCH_SIZE) {
                            break;
                        }
                    }
                }

                $remainingSlots = max(0, min(15, self::MAX_BATCH_SIZE - count($allOrderSns)));
                if ($remainingSlots > 0 && Schema::hasTable('shopee_orders')) {
                    $activeQuery = ShopeeOrder::where('shopee_account_id', $freshAccount->id)
                        ->whereIn('order_status', ['UNPAID', 'READY_TO_SHIP', 'RETRY_SHIP', 'PROCESSED', 'IN_CANCEL'])
                        ->orderByRaw('CASE WHEN last_synced_at IS NULL THEN 0 ELSE 1 END ASC, last_synced_at ASC');

                    if (! empty($orderSns) && count($orderSns) <= 500) {
                        $activeQuery->whereNotIn('order_sn', $orderSns);
                    }

                    $activeLocalSns = $activeQuery->limit($remainingSlots)->pluck('order_sn');
                    foreach ($activeLocalSns as $activeSn) {
                        $snStr = trim((string) $activeSn);
                        if ($snStr !== '') {
                            $allOrderSns[$snStr] = true;
                        }
                    }
                }

                $result = $this->syncOrderSnListPipeline(
                    $freshAccount,
                    array_keys($allOrderSns),
                    true,
                    true,
                    'Tidak ada pesanan baru atau pembaruan status saat ini.',
                    true
                );

                return array_merge([
                    'status'  => 'success',
                    'skipped' => false,
                    'reason'  => null,
                ], $result);
            } catch (\Throwable $e) {
                $freshAccount->update([
                    'last_sync_status' => 'failed',
                    'last_sync_error'  => $e->getMessage(),
                ]);
                throw $e;
            }
        } finally {
            $lock->release();
        }
    }

    /**
     * Refresh daftar order_sn tertentu secara read-only (dipakai oleh webhook push Shopee).
     * Maksimal memproses 50 order_sn per pemanggilan dan tidak pernah memanggil endpoint mutasi.
     *
     * @param  array<int, string>  $orderSns
     * @return array{synced_orders: int, changed_orders: int, cutoff_created: int, cutoff_updated: int}
     */
    public function refreshOrderBySnList(ShopeeAccount $account, array $orderSns, bool $syncCutOff = true): array
    {
        $normalizedSns = array_values(array_unique(array_filter(
            array_map(static fn ($sn): string => trim((string) $sn), $orderSns),
            static fn (string $sn): bool => $sn !== ''
        )));
        $normalizedSns = array_slice($normalizedSns, 0, self::MAX_BATCH_SIZE);

        if (empty($normalizedSns)) {
            return [
                'synced_orders'  => 0,
                'changed_orders' => 0,
                'cutoff_created' => 0,
                'cutoff_updated' => 0,
            ];
        }

        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $result = $this->syncOrderSnListPipeline($account, $normalizedSns, $syncCutOff, false);

        return [
            'synced_orders'  => $result['synced_orders'],
            'changed_orders' => $result['changed_orders'],
            'cutoff_created' => $result['cutoff_created'],
            'cutoff_updated' => $result['cutoff_updated'],
        ];
    }

    /**
     * Refresh detail 1 pesanan langsung dari Shopee API v2 dan sinkronkan ke cut_off_orders.
     */
    public function refreshSingleOrder(ShopeeAccount $account, string $orderSn): ShopeeOrder
    {
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $detailedOrders = $this->syncService->fetchOrderDetailRaw($account, [$orderSn], self::ORDER_DETAIL_FIELDS);
        if (empty($detailedOrders)) {
            throw new RuntimeException("Pesanan {$orderSn} tidak ditemukan di Shopee.");
        }

        $this->recorder->upsertFromDetails($account, $detailedOrders);

        $order = ShopeeOrder::where('shopee_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->firstOrFail();

        $this->syncService->syncOrderStatusToCutOff(
            $order->order_sn,
            $order->order_status,
            $order->shipping_carrier,
            is_array($order->package_list_json) ? $order->package_list_json : null,
            $order->cancel_by,
            $order->cancel_reason
        );

        // Jika pesanan baru saja berubah dari Perlu Dikirim -> Diproses (misal via Atur Pengiriman),
        // masukkan langsung ke Pesanan Cut Off apabila belum ada record aktif.
        if (
            ! CutOffOrder::isExcludedStatus(null, $order->order_status)
            && ! CutOffOrder::where('channel', 'SH')->where('order_number', $orderSn)->exists()
        ) {
            $this->syncService->ingestDetailedOrdersToCutOff($account, $detailedOrders, [], false, false);
        }

        return $order;
    }

    /**
     * Ambil nomor resi dari Shopee API v2 untuk 1 pesanan dan simpan ke shopee_orders.
     */
    public function fetchTrackingNumber(ShopeeAccount $account, string $orderSn, ?string $packageNumber = null): ?string
    {
        $this->ensureSchema();

        $resolvedPackageNumber = $this->resolvePackageNumber($account, $orderSn, $packageNumber);
        $query = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $resolvedPackageNumber,
        ]);

        try {
            $data = $this->getApi($account, '/api/v2/logistics/get_tracking_number', $query);
        } catch (\Throwable $e) {
            $msg = strtolower($e->getMessage());
            $isPkgErr = str_contains($msg, 'package_number') || str_contains($msg, 'pacakge') || str_contains($msg, 'package number') || str_contains($msg, 'split') || str_contains($msg, 'unsplit');
            if (isset($query['package_number']) && $isPkgErr) {
                unset($query['package_number']);
                $data = $this->getApi($account, '/api/v2/logistics/get_tracking_number', $query);
            } else {
                throw $e;
            }
        }
        $resp = is_array($data['response'] ?? null) ? $data['response'] : [];

        $trackingNumber = trim((string) (
            $resp['tracking_number']
            ?? $resp['last_mile_tracking_number']
            ?? $resp['first_mile_tracking_number']
            ?? $resp['plp_number']
            ?? ''
        ));

        if ($trackingNumber !== '') {
            ShopeeOrder::where('shopee_account_id', $account->id)
                ->where('order_sn', $orderSn)
                ->update(['tracking_number' => $trackingNumber]);

            try {
                $cutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $orderSn)->first();
                if ($cutOff && (empty($cutOff->package_count) || $cutOff->package_count !== $trackingNumber)) {
                    $cutOff->update(['package_count' => $trackingNumber]);
                    CutOffOrder::bumpCacheVersion();
                }
            } catch (\Throwable $e) {
                // Abaikan kesalahan sinkronisasi CutOffOrder lokal
            }

            return $trackingNumber;
        }

        return null;
    }

    /**
     * Ambil riwayat tracking langsung dari Shopee Open Platform v2 (/api/v2/logistics/get_tracking_info)
     * untuk memverifikasi apakah paket sudah diterima/di-scan oleh pihak ekspedisi.
     *
     * @return array{order_sn: string, package_number: ?string, logistics_status: ?string, tracking_info: array<int, array{update_time: int, update_time_formatted: string, description: string, logistics_status: ?string}>, order: ShopeeOrder}
     */
    public function getTrackingInfo(ShopeeAccount $account, string $orderSn, ?string $packageNumber = null): array
    {
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $localOrder = ShopeeOrder::where('shopee_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->first();

        $resolvedPackageNumber = $packageNumber ?: $localOrder?->package_number;
        if (! $resolvedPackageNumber) {
            $resolvedPackageNumber = $this->resolvePackageNumber($account, $orderSn, null);
        }

        $query = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $resolvedPackageNumber,
        ]);

        try {
            $data = $this->getApi($account, '/api/v2/logistics/get_tracking_info', $query);
        } catch (\Throwable $e) {
            $msg = strtolower($e->getMessage());
            $isPkgErr = str_contains($msg, 'package_number') || str_contains($msg, 'pacakge') || str_contains($msg, 'package number') || str_contains($msg, 'split') || str_contains($msg, 'unsplit');
            if (isset($query['package_number']) && $isPkgErr) {
                unset($query['package_number']);
                $data = $this->getApi($account, '/api/v2/logistics/get_tracking_info', $query);
                $resolvedPackageNumber = null;
            } else {
                throw $e;
            }
        }
        $resp = is_array($data['response'] ?? null) ? $data['response'] : [];

        $logisticsStatus = strtoupper(trim((string) ($resp['logistics_status'] ?? '')));
        $rawEvents = is_array($resp['tracking_info'] ?? null) ? $resp['tracking_info'] : [];

        $events = [];
        foreach ($rawEvents as $ev) {
            if (! is_array($ev)) {
                continue;
            }
            $ts = (int) ($ev['update_time'] ?? 0);
            $desc = trim((string) ($ev['description'] ?? ''));
            if ($ts <= 0 && $desc === '') {
                continue;
            }

            $events[] = [
                'update_time'           => $ts,
                'update_time_formatted' => $ts > 0
                    ? \Carbon\Carbon::createFromTimestamp($ts, 'Asia/Jakarta')->format('d M Y, H:i') . ' WIB'
                    : '-',
                'description'           => $desc !== '' ? $desc : '-',
                'logistics_status'      => ! empty($ev['logistics_status']) ? strtoupper((string) $ev['logistics_status']) : null,
            ];
        }

        usort($events, static fn (array $a, array $b): int => $b['update_time'] <=> $a['update_time']);

        if ($localOrder && $logisticsStatus !== '') {
            $updates = [
                'logistics_status' => $logisticsStatus,
                'last_synced_at'   => now('Asia/Jakarta'),
            ];
            if ($logisticsStatus === 'LOGISTICS_PICKUP_DONE' && strtoupper((string) $localOrder->order_status) === 'PROCESSED') {
                $updates['order_status'] = 'SHIPPED';
            } elseif ($logisticsStatus === 'LOGISTICS_DELIVERY_DONE' && in_array(strtoupper((string) $localOrder->order_status), ['PROCESSED', 'SHIPPED'], true)) {
                $updates['order_status'] = 'TO_CONFIRM_RECEIVE';
            }
            $localOrder->update($updates);
            $localOrder = $localOrder->fresh();

            if (isset($updates['order_status'])) {
                $this->syncService->syncOrderStatusToCutOff(
                    $localOrder->order_sn,
                    $localOrder->order_status,
                    $localOrder->shipping_carrier,
                    is_array($localOrder->package_list_json) ? $localOrder->package_list_json : null,
                    $localOrder->cancel_by,
                    $localOrder->cancel_reason
                );
            }
        } elseif (! $localOrder) {
            $localOrder = $this->refreshSingleOrder($account, $orderSn);
        }

        return [
            'order_sn'         => $orderSn,
            'package_number'   => $resp['package_number'] ?? $resolvedPackageNumber,
            'logistics_status' => $logisticsStatus !== '' ? $logisticsStatus : ($localOrder->logistics_status ?: null),
            'tracking_info'    => $events,
            'order'            => $localOrder->makeHidden(['raw_payload']),
        ];
    }

    /**
     * Ambil rincian escrow (informasi pembayaran akuntansi) dari Shopee API v2 untuk 1 pesanan.
     */
    public function getEscrowDetail(ShopeeAccount $account, string $orderSn): array
    {
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        try {
            $data = $this->getApi($account, '/api/v2/payment/get_escrow_detail', ['order_sn' => $orderSn]);
            $resp = is_array($data['response'] ?? null) ? $data['response'] : [];
            $orderIncome = is_array($resp['order_income'] ?? null) ? $resp['order_income'] : [];
        } catch (\Throwable $e) {
            Log::warning("Shopee getEscrowDetail API notice ({$orderSn}): " . $e->getMessage());
            $resp = [];
            $orderIncome = [];
        }

        $cutOff = CutOffOrder::where('channel', 'SH')
            ->where('order_number', $orderSn)
            ->first();

        return [
            'order_sn'     => $orderSn,
            'escrow'       => $resp,
            'order_income' => $orderIncome,
            'cutoff'       => $cutOff ? [
                'seller_voucher'        => (float) ($cutOff->financial_breakdown['seller_voucher'] ?? 0),
                'voucher_code'          => (string) ($cutOff->financial_breakdown['voucher_code'] ?? ''),
                'est_net_income'        => (float) $cutOff->est_net_income,
                'marketplace_net_payout'=> (float) $cutOff->marketplace_net_payout,
                'keterangan'            => (string) $cutOff->keterangan_solutif,
            ] : null,
        ];
    }

    /**
     * Ambil opsi parameter pengiriman (Pickup / Drop-off / Non-integrated) dari Shopee API v2.
     */
    public function getShippingParameter(ShopeeAccount $account, string $orderSn, ?string $packageNumber = null): array
    {
        $this->ensureSchema();

        $resolvedPackageNumber = $this->resolvePackageNumber($account, $orderSn, $packageNumber);

        $query = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $resolvedPackageNumber,
        ]);

        try {
            $data = $this->getApi($account, '/api/v2/logistics/get_shipping_parameter', $query);
        } catch (\Throwable $e) {
            $msg = strtolower($e->getMessage());
            $isPkgErr = str_contains($msg, 'package_number') || str_contains($msg, 'pacakge') || str_contains($msg, 'package number') || str_contains($msg, 'split') || str_contains($msg, 'unsplit');
            if (isset($query['package_number']) && $isPkgErr) {
                unset($query['package_number']);
                $data = $this->getApi($account, '/api/v2/logistics/get_shipping_parameter', $query);
                $resolvedPackageNumber = null;
            } else {
                throw $e;
            }
        }
        $resp = is_array($data['response'] ?? null) ? $data['response'] : [];
        $infoNeeded = is_array($resp['info_needed'] ?? null) ? $resp['info_needed'] : [];

        return [
            'order_sn'                 => $orderSn,
            'package_number'           => $resolvedPackageNumber,
            'info_needed'              => $infoNeeded,
            'pickup_supported'         => isset($infoNeeded['pickup']),
            'dropoff_supported'        => isset($infoNeeded['dropoff']),
            'non_integrated_supported' => isset($infoNeeded['non_integrated']),
            'pickup'                   => $resp['pickup'] ?? ['address_list' => []],
            'dropoff'                  => $resp['dropoff'] ?? ['branch_list' => []],
        ];
    }

    /**
     * Atur pengiriman 1 pesanan (Pickup / Drop-off / Non-integrated), ambil tracking number,
     * refresh detail pesanan, dan perbarui status di cut_off_orders.
     *
     * Dilengkapi validasi pra-panggilan (pre-flight check) sesuai panduan Shopee Open Platform Compliance:
     * - Mencegah panggilan duplikat untuk pesanan yang sudah berstatus PROCESSED/SHIPPED/sudah ada resi.
     * - Memastikan hanya pesanan berstatus READY_TO_SHIP atau RETRY_SHIP yang dikirim ke API ship_order.
     * - Memeriksa status package-level (is_shipment_arranged) agar success rate API ship_order > 90%.
     * - Retry otomatis dengan jeda aman khusus kegagalan jaringan sementara (transient network failure).
     */
    public function shipOrder(ShopeeAccount $account, string $orderSn, array $shipPayload): array
    {
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $existingOrder = ShopeeOrder::where('shopee_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->first();

        // 1. Pre-flight Check: Jika pesanan secara lokal sudah pernah diproses / dikirim / sudah ada resi
        if ($existingOrder) {
            $alreadyArranged = in_array($existingOrder->order_status, ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'], true)
                || (! empty($existingOrder->tracking_number) && ! empty($existingOrder->shipping_arranged_at));

            if ($alreadyArranged) {
                Log::info("[Shopee Compliance] Skip ship_order API call for {$orderSn}: order already in {$existingOrder->order_status} status with tracking {$existingOrder->tracking_number}");
                $refreshedOrder = $this->refreshSingleOrder($account, $orderSn);
                return [
                    'order_sn'             => $orderSn,
                    'tracking_number'      => $refreshedOrder->tracking_number,
                    'fulfillment_method'   => $refreshedOrder->fulfillment_method,
                    'order_status'         => $refreshedOrder->order_status,
                    'shipping_arranged_at' => $refreshedOrder->shipping_arranged_at?->format('Y-m-d H:i:s'),
                    'order'                => $refreshedOrder,
                    'message'              => "Pesanan ini sudah pernah diatur pengirimannya sebelumnya (Status: {$refreshedOrder->order_status}). No. Resi: " . ($refreshedOrder->tracking_number ?: 'Tersedia'),
                ];
            }

            // Validasi: hanya status READY_TO_SHIP atau RETRY_SHIP yang boleh dikirim ke API ship_order
            if (! in_array($existingOrder->order_status, ['READY_TO_SHIP', 'RETRY_SHIP'], true)) {
                throw new \InvalidArgumentException(
                    "Pesanan {$orderSn} berstatus '{$existingOrder->order_status}' dan belum siap untuk dikirim. Hanya pesanan READY_TO_SHIP yang dapat diatur pengirimannya."
                );
            }
        }

        // 2. Pre-flight Verification: Ambil status package terkini dari Shopee jika package_list belum lengkap
        // Ini memastikan kita tahu pasti apakah order split atau bukan SEBELUM memanggil ship_order,
        // sehingga API TIDAK PERNAH gagal karena salah kirim package_number.
        $packageList = is_array($existingOrder?->package_list_json) ? $existingOrder->package_list_json : [];
        if (empty($packageList) || $existingOrder === null) {
            try {
                $refreshed = $this->refreshSingleOrder($account, $orderSn);
                $existingOrder = $refreshed;
                $packageList = is_array($existingOrder->package_list_json) ? $existingOrder->package_list_json : [];

                if (in_array($existingOrder->order_status, ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'], true)) {
                    Log::info("[Shopee Compliance] Order {$orderSn} was found already processed on Shopee after refresh.");
                    return [
                        'order_sn'             => $orderSn,
                        'tracking_number'      => $existingOrder->tracking_number,
                        'fulfillment_method'   => $existingOrder->fulfillment_method,
                        'order_status'         => $existingOrder->order_status,
                        'shipping_arranged_at' => $existingOrder->shipping_arranged_at?->format('Y-m-d H:i:s'),
                        'order'                => $existingOrder,
                        'message'              => "Pesanan ini sudah diatur pengirimannya di Shopee. No. Resi: " . ($existingOrder->tracking_number ?: 'Tersedia'),
                    ];
                }
            } catch (\Throwable $e) {
                Log::warning("[Shopee Compliance] Gagal pre-fetch detail pesanan {$orderSn}: " . $e->getMessage());
            }
        }

        // Cek package-level readiness sesuai anjuran Shopee Open Platform FAQ
        // Jika seluruh paket sudah is_shipment_arranged = true atau fulfillment_status = LOGISTICS_REQUEST_CREATED
        if (! empty($packageList)) {
            $allArranged = true;
            foreach ($packageList as $pkg) {
                $isArranged = ! empty($pkg['is_shipment_arranged']);
                $fulfillment = strtoupper(trim((string) ($pkg['fulfillment_status'] ?? $pkg['logistics_status'] ?? '')));
                if (! $isArranged && $fulfillment !== 'LOGISTICS_REQUEST_CREATED') {
                    $allArranged = false;
                    break;
                }
            }

            if ($allArranged) {
                Log::info("[Shopee Compliance] All packages in order {$orderSn} already have shipment arranged. Skipping API ship_order.");
                $refreshedOrder = $this->refreshSingleOrder($account, $orderSn);
                return [
                    'order_sn'             => $orderSn,
                    'tracking_number'      => $refreshedOrder->tracking_number,
                    'fulfillment_method'   => $refreshedOrder->fulfillment_method,
                    'order_status'         => $refreshedOrder->order_status,
                    'shipping_arranged_at' => $refreshedOrder->shipping_arranged_at?->format('Y-m-d H:i:s'),
                    'order'                => $refreshedOrder,
                    'message'              => "Pengiriman pesanan ini sudah diatur sebelumnya. No. Resi: " . ($refreshedOrder->tracking_number ?: 'Tersedia'),
                ];
            }
        }

        $isSplitOrder = count($packageList) > 1;
        $candidatePackageNumber = trim((string) ($shipPayload['package_number'] ?? $existingOrder?->package_number ?? ''));
        // Shopee API v2 ship_order: parameter package_number HANYA boleh dikirim untuk split order.
        $packageNumber = $isSplitOrder ? $candidatePackageNumber : '';
        $method = $this->resolveShipMethod($shipPayload);

        $body = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $packageNumber,
        ]);

        $body[$method] = $this->buildMethodPayload($method, $shipPayload);

        // 3. Eksekusi API ship_order dengan penanganan transient network retry
        $maxAttempts = 2;
        $lastException = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $this->postApi($account, '/api/v2/logistics/ship_order', $body);
                $lastException = null;
                break;
            } catch (\Throwable $e) {
                $lastException = $e;
                $msg = strtolower($e->getMessage());

                // Jika Shopee menyatakan paket sudah di-ship / sudah diatur:
                // Tangani secara elegan sebagai sukses tanpa melempar kegagalan ke user
                $isAlreadyShipped = str_contains($msg, 'already been shipped')
                    || str_contains($msg, 'already been arranged')
                    || str_contains($msg, 'already arranged')
                    || str_contains($msg, 'package_has_been_shipped')
                    || str_contains($msg, 'order_already_arranged');

                if ($isAlreadyShipped) {
                    Log::info("[Shopee Compliance] Order {$orderSn} was already arranged on Shopee side: {$e->getMessage()}");
                    $lastException = null;
                    break;
                }

                // Jika error adalah transient network error (timeout / 502 / 504), lakukan 1x retry jeda 1 detik
                $isTransient = str_contains($msg, 'timed out')
                    || str_contains($msg, 'timeout')
                    || str_contains($msg, '504')
                    || str_contains($msg, '502')
                    || str_contains($msg, '503')
                    || str_contains($msg, 'connection');

                if ($isTransient && $attempt < $maxAttempts) {
                    Log::warning("[Shopee Compliance] Transient failure on ship_order for {$orderSn}, retrying in 1s (attempt {$attempt}/{$maxAttempts}): " . $e->getMessage());
                    sleep(1);
                    continue;
                }

                // Jika bukan transient dan bukan already-shipped, hentikan loop
                break;
            }
        }

        if ($lastException !== null) {
            throw $lastException;
        }

        $trackingNumber = null;
        for ($attempt = 1; $attempt <= 6; $attempt++) {
            try {
                $trackingNumber = $this->fetchTrackingNumber(
                    $account,
                    $orderSn,
                    $packageNumber !== '' ? $packageNumber : null
                );
            } catch (\Throwable $e) {
                Log::warning("Shopee fetchTrackingNumber attempt {$attempt} ({$orderSn}): " . $e->getMessage());
                $trackingNumber = null;
            }

            if (! empty($trackingNumber)) {
                break;
            }

            if ($attempt < 6) {
                // Beri jeda adaptif untuk kurir asinkron (ID Express/J&T): 600ms, 900ms, 1200ms, 1500ms, 1800ms
                $sleepMicros = min(2000000, 600000 + ($attempt * 300000));
                usleep($sleepMicros);
            }
        }

        $refreshedOrder = $this->refreshSingleOrder($account, $orderSn);

        if (empty($trackingNumber) && ! empty($refreshedOrder->tracking_number)) {
            $trackingNumber = $refreshedOrder->tracking_number;
        }

        $localUpdates = [
            'fulfillment_method'   => $method,
            'shipping_arranged_at' => $refreshedOrder->shipping_arranged_at ?? now('Asia/Jakarta'),
        ];
        if (in_array($refreshedOrder->order_status, ['READY_TO_SHIP', 'RETRY_SHIP'], true)) {
            $localUpdates['order_status'] = 'PROCESSED';
        }
        if (! empty($trackingNumber)) {
            $localUpdates['tracking_number'] = $trackingNumber;
        }
        $refreshedOrder->update($localUpdates);
        $refreshedOrder = $refreshedOrder->fresh();

        try {
            $cutOff = CutOffOrder::where('channel', 'SH')->where('order_number', $orderSn)->first();
            if ($cutOff) {
                $arrangedTs = $refreshedOrder->shipping_arranged_at ?? now('Asia/Jakarta');
                $cutOffUpdates = [
                    'order_status' => 'Diproses',
                    'processed_at' => $arrangedTs instanceof \Carbon\CarbonInterface
                        ? $arrangedTs->copy()->timezone('Asia/Jakarta')->format('Y-m-d H:i:s')
                        : (string) $arrangedTs,
                ];
                if (! empty($refreshedOrder->tracking_number)) {
                    $cutOffUpdates['package_count'] = $refreshedOrder->tracking_number;
                }
                $cutOff->update($cutOffUpdates);
                CutOffOrder::bumpCacheVersion();
            }
        } catch (\Throwable $e) {
            Log::warning("[ShopeeOrderService] Gagal update processed_at CutOffOrder ({$orderSn}): " . $e->getMessage());
        }

        return [
            'order_sn'             => $orderSn,
            'tracking_number'      => $refreshedOrder->tracking_number,
            'fulfillment_method'   => $refreshedOrder->fulfillment_method,
            'order_status'         => $refreshedOrder->order_status,
            'shipping_arranged_at' => $refreshedOrder->shipping_arranged_at?->toIso8601String(),
            'order'                => $refreshedOrder,
            'message'              => $refreshedOrder->tracking_number
                ? "Pengiriman berhasil diatur. No. Resi: {$refreshedOrder->tracking_number}"
                : 'Pengiriman berhasil diatur. No. Resi sedang diproses oleh kurir.',
        ];
    }

    /**
     * Atur pengiriman massal (1..50 pesanan) dengan isolasi kegagalan per order.
     *
     * @param  array<int, string>  $orderSns
     * @return array{total: int, succeeded: array<int, array<string, mixed>>, failed: array<int, array<string, string>>, message: string}
     */
    public function massShipOrders(
        ShopeeAccount $account,
        array $orderSns,
        string $preferredMethod = 'auto',
        array $sharedOptions = []
    ): array {
        $orderSns = $this->normalizeOrderSnList($orderSns, 'atur pengiriman massal');
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $preferredMethod = strtolower(trim($preferredMethod));
        if (! in_array($preferredMethod, ['auto', 'pickup', 'dropoff'], true)) {
            $preferredMethod = 'auto';
        }

        $ordersBySn = ShopeeOrder::where('shopee_account_id', $account->id)
            ->whereIn('order_sn', $orderSns)
            ->get()
            ->keyBy('order_sn');

        $succeeded = [];
        $failed = [];

        foreach ($orderSns as $sn) {
            try {
                /** @var ShopeeOrder|null $order */
                $order = $ordersBySn->get($sn);
                if (! $order) {
                    throw new RuntimeException("Pesanan {$sn} tidak ditemukan di database lokal. Silakan sinkronkan ulang.");
                }

                if (! in_array($order->order_status, ['READY_TO_SHIP', 'RETRY_SHIP'], true)) {
                    throw new RuntimeException("Status pesanan {$sn} ({$order->order_status}) tidak dapat diatur pengirimannya.");
                }

                $params = $this->getShippingParameter($account, $sn, $order->package_number ?: null);
                $shipPayload = $this->resolveMassShipPayload($params, $preferredMethod, $sharedOptions);
                $result = $this->shipOrder($account, $sn, $shipPayload);

                $succeeded[] = [
                    'order_sn'             => $sn,
                    'tracking_number'      => $result['tracking_number'] ?? null,
                    'fulfillment_method'   => $result['fulfillment_method'] ?? null,
                    'order_status'         => $result['order_status'] ?? 'PROCESSED',
                    'shipping_arranged_at' => $result['shipping_arranged_at'] ?? now('Asia/Jakarta')->toIso8601String(),
                ];
            } catch (\Throwable $e) {
                $failed[] = [
                    'order_sn' => $sn,
                    'message'  => $e->getMessage(),
                ];
            }
        }

        return [
            'total'     => count($orderSns),
            'succeeded' => $succeeded,
            'failed'    => $failed,
            'message'   => sprintf(
                'Atur pengiriman massal selesai: %d berhasil, %d gagal dari %d pesanan.',
                count($succeeded),
                count($failed),
                count($orderSns)
            ),
        ];
    }

    /**
     * Buat dan unduh dokumen resi PDF Thermal A6 (100x150 mm) resmi Shopee (THERMAL_AIR_WAYBILL) untuk 1..50 pesanan.
     *
     * @param  array<int, string>  $orderSns
     * @return array{pdf_binary: string, filename: string, orders: array<int, ShopeeOrder>, warnings: array<int, string>}
     */
    public function createAndDownloadWaybillA4(ShopeeAccount $account, array $orderSns): array
    {
        $orderSns = $this->normalizeOrderSnList($orderSns, 'cetak resi');
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $ordersBySn = ShopeeOrder::where('shopee_account_id', $account->id)
            ->whereIn('order_sn', $orderSns)
            ->get()
            ->keyBy('order_sn');

        /** @var array<int, ShopeeOrder> $orders */
        $orders = [];
        foreach ($orderSns as $sn) {
            $order = $ordersBySn->get($sn);
            if (! $order) {
                throw new RuntimeException("Pesanan {$sn} tidak ditemukan di database lokal. Silakan sinkronkan ulang.");
            }
            $orders[] = $order;
        }

        $invalidReasons = [];
        foreach ($orders as $order) {
            $blockedStatuses = $order->isInstant()
                ? ['UNPAID', 'CANCELLED']
                : ['UNPAID', 'READY_TO_SHIP', 'RETRY_SHIP', 'CANCELLED'];

            // Jika pesanan baru saja berhasil diatur pengirimannya (ada shipping_arranged_at atau tracking_number),
            // skip validasi blocked status karena Shopee mungkin belum update status order di sisi mereka.
            $isJustShipped = ! empty($order->tracking_number) || ! empty($order->shipping_arranged_at);

            if (! $isJustShipped && in_array($order->order_status, $blockedStatuses, true)) {
                $label = ShopeeOrder::statusLabel($order->order_status);
                $invalidReasons[] = "{$order->order_sn} ({$label})";
            }
        }
        if (! empty($invalidReasons)) {
            throw new RuntimeException(
                'Pesanan berikut belum dapat dicetak resinya: ' . implode(', ', $invalidReasons)
                . '. Pastikan pesanan sudah diatur pengirimannya (status Telah Diproses / Dikirim) dan tidak dibatalkan.'
            );
        }

        $warnings = [];
        $this->hydrateMissingTrackingNumbersForOrders($account, $orders);

        foreach ($orders as $order) {
            if (empty($order->tracking_number)) {
                $warnings[] = "No. Resi untuk {$order->order_sn} belum tersedia dari Shopee.";
            }
        }

        $createResultList = $this->requestCreateShippingDocuments($account, $orders);
        $failedSnMessages = $this->extractCreateShippingFailures($createResultList);

        // Retry bertahap khusus untuk order yang gagal sementara (mis. SPX Hemat / error_not_ready sesaat setelah ship_order)
        $createRetryDelaysMicros = [1200000, 2000000, 3000000];
        foreach ($createRetryDelaysMicros as $delayMicros) {
            if (empty($failedSnMessages)) {
                break;
            }

            $retryOrders = [];
            foreach ($orders as $order) {
                $sn = $order->order_sn;
                if (! isset($failedSnMessages[$sn])) {
                    continue;
                }
                if ($this->isTransientCreateWaybillError($failedSnMessages[$sn])) {
                    $retryOrders[] = $order;
                }
            }

            if (empty($retryOrders)) {
                break;
            }

            usleep($delayMicros);
            $this->hydrateMissingTrackingNumbersForOrders($account, $retryOrders, 2);

            $retryResultList = $this->requestCreateShippingDocuments($account, $retryOrders);
            $retryFailures = $this->extractCreateShippingFailures($retryResultList);
            foreach ($retryOrders as $retryOrder) {
                $sn = $retryOrder->order_sn;
                if (isset($retryFailures[$sn])) {
                    $failedSnMessages[$sn] = $retryFailures[$sn];
                } else {
                    unset($failedSnMessages[$sn]);
                }
            }
        }

        $this->markWaybillFailedOrders($orders, $failedSnMessages);

        $eligibleOrders = array_values(array_filter(
            $orders,
            static fn (ShopeeOrder $o): bool => ! isset($failedSnMessages[$o->order_sn])
        ));

        if (empty($eligibleOrders)) {
            throw new RuntimeException(
                'Gagal membuat dokumen resi di Shopee: ' . implode('; ', $failedSnMessages)
            );
        }

        foreach ($failedSnMessages as $sn => $msg) {
            $warnings[] = "Resi {$sn} gagal dibuat Shopee: {$msg}";
        }

        $statusBySn = [];
        $pendingOrders = $eligibleOrders;
        $maxPollAttempts = 24;
        $retriedPollingFailures = [];

        for ($attempt = 1; $attempt <= $maxPollAttempts; $attempt++) {
            $docQueryList = $this->buildWaybillOrderList($pendingOrders, true, false);
            $resultResp = $this->postApi($account, '/api/v2/logistics/get_shipping_document_result', [
                'order_list' => $docQueryList,
            ]);

            $resultList = $resultResp['response']['result_list'] ?? [];
            if (! is_array($resultList) || empty($resultList)) {
                break;
            }

            $transientPollFailOrders = [];
            foreach ($resultList as $entry) {
                if (! is_array($entry)) {
                    continue;
                }
                $sn = (string) ($entry['order_sn'] ?? '');
                $status = strtoupper((string) ($entry['status'] ?? ''));
                if ($sn !== '' && $status !== '') {
                    $statusBySn[$sn] = $status;
                }
                if ($status === 'FAILED' && $sn !== '') {
                    $failErr = trim((string) ($entry['fail_error'] ?? ''));
                    $failMsg = trim((string) ($entry['fail_message'] ?? ''));
                    $combinedFail = trim($failErr . ($failErr && $failMsg ? ': ' : '') . $failMsg) ?: 'Status dokumen FAILED';

                    if (! isset($retriedPollingFailures[$sn]) && $this->isTransientCreateWaybillError($combinedFail)) {
                        $retriedPollingFailures[$sn] = true;
                        $matchedOrder = null;
                        foreach ($eligibleOrders as $eo) {
                            if ($eo->order_sn === $sn) {
                                $matchedOrder = $eo;
                                break;
                            }
                        }
                        if ($matchedOrder !== null) {
                            $transientPollFailOrders[] = $matchedOrder;
                            $statusBySn[$sn] = 'PROCESSING';
                            continue;
                        }
                    }

                    $failedSnMessages[$sn] = $combinedFail;
                }
            }

            if (! empty($transientPollFailOrders) && $attempt < $maxPollAttempts) {
                usleep(1000000);
                $this->hydrateMissingTrackingNumbersForOrders($account, $transientPollFailOrders, 1);
                $this->requestCreateShippingDocuments($account, $transientPollFailOrders);
            }

            $pendingOrders = array_values(array_filter(
                $eligibleOrders,
                static function (ShopeeOrder $o) use ($statusBySn, $failedSnMessages): bool {
                    if (isset($failedSnMessages[$o->order_sn])) {
                        return false;
                    }
                    $st = $statusBySn[$o->order_sn] ?? null;

                    return $st === null || in_array($st, ['PROCESSING', 'WAITING'], true);
                }
            ));

            if (empty($pendingOrders)) {
                break;
            }

            if ($attempt < $maxPollAttempts) {
                usleep($attempt <= 6 ? 500000 : 900000);
            }
        }

        $this->markWaybillFailedOrders($eligibleOrders, $failedSnMessages);

        $readyOrders = [];
        $processingSns = [];
        $processingIds = [];
        foreach ($eligibleOrders as $order) {
            if (isset($failedSnMessages[$order->order_sn])) {
                $msg = $failedSnMessages[$order->order_sn];
                if (! in_array("Resi {$order->order_sn} gagal dibuat Shopee: {$msg}", $warnings, true)) {
                    $warnings[] = "Resi {$order->order_sn} gagal disiapkan Shopee: {$msg}";
                }
                continue;
            }

            $docStatus = $statusBySn[$order->order_sn] ?? null;
            if ($docStatus !== null && in_array($docStatus, ['PROCESSING', 'WAITING'], true)) {
                $processingSns[] = $order->order_sn;
                $processingIds[] = (int) $order->id;
                $warnings[] = "Dokumen resi {$order->order_sn} masih diproses Shopee ({$docStatus}), silakan cetak ulang beberapa saat lagi.";
                continue;
            }

            $readyOrders[] = $order;
        }

        if (! empty($processingIds)) {
            ShopeeOrder::whereIn('id', $processingIds)->update(['label_document_status' => 'PROCESSING']);
        }

        if (empty($readyOrders)) {
            if (! empty($processingSns)) {
                $errDetail = "Dokumen resi Shopee masih dalam proses pembuatan setelah {$maxPollAttempts}x pengecekan (" . implode(', ', $processingSns) . '). Silakan coba beberapa saat lagi.';
                if (! empty($failedSnMessages)) {
                    $errDetail .= ' Gagal: ' . implode('; ', $failedSnMessages);
                }
                throw new RuntimeException($errDetail);
            }

            throw new RuntimeException(
                'Dokumen resi Shopee gagal disiapkan: ' . implode('; ', $failedSnMessages)
            );
        }

        $downloadResp = $this->postBinaryApi(
            $account,
            '/api/v2/logistics/download_shipping_document',
            [
                'shipping_document_type' => self::WAYBILL_DOCUMENT_TYPE,
                'order_list'             => $this->buildWaybillOrderList($readyOrders, false, false),
            ],
            60
        );

        $binary = (string) $downloadResp->body();
        if (! str_starts_with($binary, '%PDF-')) {
            $decoded = json_decode($binary, true);
            if (is_array($decoded)) {
                throw new RuntimeException(
                    $this->formatShopeeApiError($decoded, $downloadResp->status(), '/api/v2/logistics/download_shipping_document')
                );
            }
            throw new RuntimeException('Respon unduhan resi Shopee bukan dokumen PDF yang valid.');
        }

        $printedAt = now('Asia/Jakarta');
        $readyIds = array_map(static fn (ShopeeOrder $o): int => (int) $o->id, $readyOrders);

        ShopeeOrder::whereIn('id', $readyIds)->update([
            'label_document_status' => 'READY',
            'label_printed_at'      => $printedAt,
            'label_print_count'     => DB::raw('COALESCE(label_print_count, 0) + 1'),
        ]);

        $updatedOrdersMap = ShopeeOrder::whereIn('id', $readyIds)->get()->keyBy('order_sn');
        $orderedResult = [];
        foreach ($readyOrders as $o) {
            $orderedResult[] = $updatedOrdersMap->get($o->order_sn) ?? $o;
        }

        $filename = count($orderedResult) === 1
            ? 'resi-shopee-' . $orderedResult[0]->order_sn . '-thermal-100x150.pdf'
            : 'resi-shopee-massal-' . count($orderedResult) . '-pesanan-' . $printedAt->format('Ymd-His') . '-thermal.pdf';

        return [
            'pdf_binary'      => $binary,
            'filename'        => $filename,
            'orders'          => $orderedResult,
            'ready_order_sns' => array_values(array_map(static fn (ShopeeOrder $o): string => $o->order_sn, $orderedResult)),
            'warnings'        => array_values(array_unique($warnings)),
        ];
    }

    /**
     * Terima (ACCEPT) atau tolak (REJECT) pengajuan pembatalan pembeli di Shopee,
     * lalu refresh shopee_orders dan cut_off_orders.
     */
    public function handleBuyerCancellation(ShopeeAccount $account, string $orderSn, string $operation): array
    {
        $operation = strtoupper(trim($operation));
        if (! in_array($operation, ['ACCEPT', 'REJECT'], true)) {
            throw new RuntimeException("Operasi pembatalan tidak valid ({$operation}). Gunakan ACCEPT atau REJECT.");
        }

        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $this->postApi($account, '/api/v2/order/handle_buyer_cancellation', [
            'order_sn'  => $orderSn,
            'operation' => $operation,
        ]);

        $order = $this->refreshSingleOrder($account, $orderSn);

        return [
            'order_sn'     => $orderSn,
            'operation'    => $operation,
            'order_status' => $order->order_status,
            'order'        => $order,
            'message'      => $operation === 'ACCEPT'
                ? "Pengajuan pembatalan pesanan {$orderSn} berhasil disetujui."
                : "Pengajuan pembatalan pesanan {$orderSn} berhasil ditolak.",
        ];
    }

    /**
     * Kumpulkan daftar unik order_sn dari get_order_list dalam jendela maksimal 14 hari per panggilan.
     *
     * @return array<int, string>
     */
    private function collectOrderSnsInWindow(
        ShopeeAccount $account,
        int $timeFrom,
        int $timeTo,
        ?string $orderStatus,
        bool $includeUpdateWindow
    ): array {
        $maxWindow = 14 * 86400;
        $allOrderSns = [];
        $timeFields = $includeUpdateWindow ? ['create_time', 'update_time'] : ['create_time'];

        foreach ($timeFields as $timeField) {
            $currentTo = $timeTo;
            while ($currentTo > $timeFrom) {
                $currentFrom = max($timeFrom, $currentTo - $maxWindow);
                $chunkList = $this->syncService->fetchOrderListRaw(
                    $account,
                    $currentFrom,
                    $currentTo,
                    100,
                    $orderStatus,
                    $timeField
                );

                foreach ($chunkList as $ord) {
                    $sn = trim((string) ($ord['order_sn'] ?? ''));
                    if ($sn !== '') {
                        $allOrderSns[$sn] = true;
                    }
                }

                $currentTo = $currentFrom;
            }
        }

        return array_keys($allOrderSns);
    }

    /**
     * Pipeline baca bersama untuk mengambil detail + escrow paralel, persist lokal & Cut Off,
     * serta melengkapi tracking number yang masih kosong.
     *
     * @param  array<int, string>  $orderSns
     * @return array{total_fetched: int, synced_orders: int, changed_orders: int, cutoff_created: int, cutoff_updated: int, last_synced_at: ?string, message: string}
     */
    private function syncOrderSnListPipeline(
        ShopeeAccount &$account,
        array $orderSns,
        bool $syncCutOff = true,
        bool $updateAccountTimestamps = true,
        string $emptyMessage = 'Tidak ada pesanan Shopee pada rentang waktu tersebut.',
        bool $lightweightAutoSync = false
    ): array {
        $normalizedSns = array_values(array_unique(array_filter(
            array_map(static fn ($sn): string => trim((string) $sn), $orderSns),
            static fn (string $sn): bool => $sn !== ''
        )));

        if (empty($normalizedSns)) {
            if ($updateAccountTimestamps) {
                $this->markAccountSyncSuccess($account);
            }

            return [
                'total_fetched'  => 0,
                'synced_orders'  => 0,
                'changed_orders' => 0,
                'cutoff_created' => 0,
                'cutoff_updated' => 0,
                'last_synced_at' => $this->formatLastSyncedAt($account->fresh() ?? $account),
                'message'        => $emptyMessage,
            ];
        }

        [
            'detailed_orders' => $detailedOrders,
            'escrow_map'      => $escrowMap,
        ] = $this->fetchDetailsAndEscrowConcurrent($account, $normalizedSns, $syncCutOff, ! $lightweightAutoSync);

        if (empty($detailedOrders)) {
            if ($updateAccountTimestamps) {
                $this->markAccountSyncSuccess($account);
            }

            return [
                'total_fetched'  => 0,
                'synced_orders'  => 0,
                'changed_orders' => 0,
                'cutoff_created' => 0,
                'cutoff_updated' => 0,
                'last_synced_at' => $this->formatLastSyncedAt($account->fresh() ?? $account),
                'message'        => 'Detail pesanan Shopee tidak ditemukan pada rentang waktu tersebut.',
            ];
        }

        $preExistingEmptyTracking = $this->collectPreExistingSameStatusEmptyTracking($account, $detailedOrders);

        if ($syncCutOff) {
            $cutOffResult = $this->syncService->ingestDetailedOrdersToCutOff(
                $account,
                $detailedOrders,
                $escrowMap,
                ! $lightweightAutoSync,
                $updateAccountTimestamps
            );
            $syncedOrders = (int) ($cutOffResult['shopee_synced'] ?? 0);
            $changedOrders = (int) ($cutOffResult['shopee_changed'] ?? 0);
            $created = (int) ($cutOffResult['created'] ?? 0);
            $updated = (int) ($cutOffResult['updated'] ?? 0);
        } else {
            $upsertStats = $this->recorder->upsertFromDetails($account, $detailedOrders);
            $syncedOrders = (int) ($upsertStats['synced'] ?? 0);
            $changedOrders = (int) ($upsertStats['changed'] ?? 0);
            $created = 0;
            $updated = 0;

            if ($updateAccountTimestamps) {
                $this->markAccountSyncSuccess($account);
            }
        }

        $trackingUpdated = 0;
        $trackingPoolLimit = $lightweightAutoSync ? 6 : 20;
        $trackingMap = $this->fetchMissingTrackingNumbersPool($account, $detailedOrders, $trackingPoolLimit, $trackingUpdated);
        if ($trackingUpdated > 0 && ! empty($preExistingEmptyTracking)) {
            $newlyTrackedExistingCount = 0;
            foreach (array_keys($trackingMap) as $trackedSn) {
                if (isset($preExistingEmptyTracking[$trackedSn])) {
                    $newlyTrackedExistingCount++;
                }
            }
            if ($newlyTrackedExistingCount > 0) {
                $changedOrders = $syncedOrders > 0
                    ? min($syncedOrders, $changedOrders + $newlyTrackedExistingCount)
                    : $newlyTrackedExistingCount;
            }
        }

        return [
            'total_fetched'  => count($detailedOrders),
            'synced_orders'  => $syncedOrders,
            'changed_orders' => $changedOrders,
            'cutoff_created' => $created,
            'cutoff_updated' => $updated,
            'last_synced_at' => $this->formatLastSyncedAt($account->fresh() ?? $account),
            'message'        => $syncCutOff
                ? "Sinkronisasi berhasil: {$syncedOrders} pesanan diperbarui di Pesanan Saya ({$created} baru, {$updated} diperbarui di Cut Off)."
                : "Sinkronisasi berhasil: {$syncedOrders} pesanan diperbarui di Pesanan Saya.",
        ];
    }

    /**
     * Ekstrak kandidat order_sn PROCESSED/SHIPPED yang belum memiliki nomor resi di detail Shopee.
     *
     * @param  array<int, array<string, mixed>>  $detailedOrders
     * @return array<string, array{status: string, package_number: string}>
     */
    private function extractMissingTrackingCandidates(array $detailedOrders): array
    {
        $candidates = [];
        foreach ($detailedOrders as $order) {
            if (! is_array($order)) {
                continue;
            }
            $sn = trim((string) ($order['order_sn'] ?? ''));
            $status = strtoupper(trim((string) ($order['order_status'] ?? '')));
            if ($sn === '' || ! in_array($status, ['PROCESSED', 'SHIPPED'], true)) {
                continue;
            }

            $packageList = is_array($order['package_list'] ?? null) ? $order['package_list'] : [];
            $trackingInDetail = trim((string) ($order['tracking_number'] ?? ''));
            $packageNumber = trim((string) ($order['package_number'] ?? ''));

            foreach ($packageList as $pkg) {
                if (! is_array($pkg)) {
                    continue;
                }
                if ($trackingInDetail === '' && ! empty($pkg['tracking_number'])) {
                    $trackingInDetail = trim((string) $pkg['tracking_number']);
                }
                if ($packageNumber === '' && ! empty($pkg['package_number'])) {
                    $packageNumber = trim((string) $pkg['package_number']);
                }
            }

            if ($trackingInDetail !== '') {
                continue;
            }

            $candidates[$sn] = [
                'status'         => $status,
                'package_number' => $packageNumber,
            ];
        }

        return $candidates;
    }

    /**
     * Identifikasi pesanan PROCESSED/SHIPPED tanpa resi yang sudah ada di shopee_orders
     * dengan status sama agar tracking backfill tidak dihitung ganda dengan order baru.
     *
     * @param  array<int, array<string, mixed>>  $detailedOrders
     * @return array<string, true>
     */
    private function collectPreExistingSameStatusEmptyTracking(ShopeeAccount $account, array $detailedOrders): array
    {
        if (! Schema::hasTable('shopee_orders')) {
            return [];
        }

        $candidates = $this->extractMissingTrackingCandidates($detailedOrders);
        if (empty($candidates)) {
            return [];
        }

        $matched = [];
        $existingRows = ShopeeOrder::where('shopee_account_id', $account->id)
            ->whereIn('order_sn', array_keys($candidates))
            ->get(['order_sn', 'order_status', 'tracking_number']);

        foreach ($existingRows as $row) {
            $sn = (string) $row->order_sn;
            if (
                isset($candidates[$sn])
                && $row->order_status === $candidates[$sn]['status']
                && trim((string) ($row->tracking_number ?? '')) === ''
            ) {
                $matched[$sn] = true;
            }
        }

        return $matched;
    }

    /**
     * Ambil detail pesanan dan escrow secara paralel dalam gelombang 6 chunk x 50 order,
     * dengan fallback berurutan hanya untuk chunk yang gagal.
     *
     * @param  array<int, string>  $orderSns
     * @return array{detailed_orders: array<int, array<string, mixed>>, escrow_map: array<string, array<string, mixed>>}
     */
    private function fetchDetailsAndEscrowConcurrent(
        ShopeeAccount &$account,
        array $orderSns,
        bool $fetchEscrow = true,
        bool $allowSerialEscrowFallback = true
    ): array {
        $normalizedSns = array_values(array_unique(array_filter(
            array_map(static fn ($sn): string => trim((string) $sn), $orderSns),
            static fn (string $sn): bool => $sn !== ''
        )));

        if (empty($normalizedSns)) {
            return [
                'detailed_orders' => [],
                'escrow_map'      => [],
            ];
        }

        $chunks = array_chunk($normalizedSns, self::MAX_BATCH_SIZE);
        $detailedOrders = [];
        $escrowMap = [];
        $failedOrderChunks = [];
        $failedEscrowChunks = [];

        foreach (array_chunk($chunks, self::POOL_WAVE_SIZE, true) as $batchGroup) {
            try {
                $escrowUrl = $fetchEscrow ? $this->syncService->buildEscrowUrl($account) : null;
                $responses = Http::pool(function (Pool $pool) use ($account, $batchGroup, $fetchEscrow, $escrowUrl): array {
                    $reqs = [];
                    foreach ($batchGroup as $idx => $chunk) {
                        $orderUrl = $this->syncService->buildOrderDetailUrl($account, $chunk, self::ORDER_DETAIL_FIELDS);
                        $reqs["order_{$idx}"] = $pool->as("order_{$idx}")->timeout(20)->get($orderUrl);
                        if ($fetchEscrow && $escrowUrl !== null) {
                            $reqs["escrow_{$idx}"] = $pool->as("escrow_{$idx}")->timeout(20)->asJson()->post($escrowUrl, [
                                'order_sn_list' => array_values($chunk),
                            ]);
                        }
                    }

                    return $reqs;
                });
            } catch (\Throwable $e) {
                Log::warning('ShopeeOrderService Http::pool wave error: ' . $e->getMessage());
                foreach ($batchGroup as $idx => $chunk) {
                    $failedOrderChunks[$idx] = $chunk;
                    if ($fetchEscrow) {
                        $failedEscrowChunks[$idx] = $chunk;
                    }
                }
                continue;
            }

            foreach ($batchGroup as $idx => $chunk) {
                $orderRes = $responses["order_{$idx}"] ?? null;
                if ($orderRes instanceof Response && $orderRes->successful()) {
                    $data = $orderRes->json();
                    if (is_array($data) && empty($data['error'])) {
                        $orderList = $data['response']['order_list'] ?? [];
                        if (is_array($orderList) && ! empty($orderList)) {
                            $detailedOrders = array_merge($detailedOrders, $orderList);
                        }
                    } else {
                        $err = is_array($data) ? ($data['message'] ?? $data['error'] ?? 'API error') : 'Respon JSON tidak valid';
                        Log::warning("ShopeeOrderService pool order_{$idx} error: {$err}");
                        $failedOrderChunks[$idx] = $chunk;
                    }
                } else {
                    $statusInfo = $orderRes instanceof Response ? ('HTTP ' . $orderRes->status()) : 'non-response';
                    Log::warning("ShopeeOrderService pool order_{$idx} failed ({$statusInfo})");
                    $failedOrderChunks[$idx] = $chunk;
                }

                if (! $fetchEscrow) {
                    continue;
                }

                $escrowRes = $responses["escrow_{$idx}"] ?? null;
                if ($escrowRes instanceof Response && $escrowRes->successful()) {
                    $data = $escrowRes->json();
                    if (is_array($data) && empty($data['error'])) {
                        $parsed = $this->syncService->parseEscrowBatchResponse($data);
                        if (! empty($parsed)) {
                            $escrowMap = array_replace($escrowMap, $parsed);
                        }
                    } else {
                        $err = is_array($data) ? ($data['message'] ?? $data['error'] ?? 'API error') : 'Respon JSON tidak valid';
                        Log::warning("ShopeeOrderService pool escrow_{$idx} error: {$err}");
                        $failedEscrowChunks[$idx] = $chunk;
                    }
                } else {
                    $statusInfo = $escrowRes instanceof Response ? ('HTTP ' . $escrowRes->status()) : 'non-response';
                    Log::warning("ShopeeOrderService pool escrow_{$idx} failed ({$statusInfo})");
                    $failedEscrowChunks[$idx] = $chunk;
                }
            }
        }

        foreach ($failedOrderChunks as $chunk) {
            $details = $this->syncService->fetchOrderDetailRaw($account, $chunk, self::ORDER_DETAIL_FIELDS);
            if (! empty($details)) {
                $detailedOrders = array_merge($detailedOrders, $details);
            }
        }

        if ($fetchEscrow && $allowSerialEscrowFallback) {
            foreach ($failedEscrowChunks as $chunk) {
                $batchEscrow = $this->syncService->fetchEscrowDetailBatch($account, $chunk);
                if (! empty($batchEscrow)) {
                    $escrowMap = array_replace($escrowMap, $batchEscrow);
                }
            }
        }

        return [
            'detailed_orders' => $detailedOrders,
            'escrow_map'      => $escrowMap,
        ];
    }

    /**
     * Lengkapi nomor resi secara paralel untuk pesanan PROCESSED/SHIPPED yang belum memiliki resi.
     *
     * @param  array<int, array<string, mixed>>  $detailedOrders
     * @return array<string, string>
     */
    private function fetchMissingTrackingNumbersPool(
        ShopeeAccount &$account,
        array $detailedOrders,
        int $limit = 20,
        ?int &$updatedCount = null
    ): array {
        $updatedCount = 0;
        if (empty($detailedOrders) || $limit <= 0) {
            return [];
        }

        $candidates = $this->extractMissingTrackingCandidates($detailedOrders);
        if (empty($candidates)) {
            return [];
        }

        $existingBySn = collect();
        if (Schema::hasTable('shopee_orders')) {
            $existingBySn = ShopeeOrder::where('shopee_account_id', $account->id)
                ->whereIn('order_sn', array_keys($candidates))
                ->get(['order_sn', 'tracking_number', 'package_number'])
                ->keyBy('order_sn');
        }

        $targets = [];
        foreach ($candidates as $sn => $meta) {
            /** @var ShopeeOrder|null $existing */
            $existing = $existingBySn->get($sn);
            if (trim((string) ($existing?->tracking_number ?? '')) !== '') {
                continue;
            }

            $packageNumber = $meta['package_number'];
            $targets[$sn] = $packageNumber !== ''
                ? $packageNumber
                : trim((string) ($existing?->package_number ?? ''));

            if (count($targets) >= $limit) {
                break;
            }
        }

        if (empty($targets)) {
            return [];
        }

        $trackingMap = [];
        foreach (array_chunk($targets, 20, true) as $targetBatch) {
            try {
                $responses = Http::pool(function (Pool $pool) use ($account, $targetBatch): array {
                    $reqs = [];
                    foreach ($targetBatch as $sn => $packageNumber) {
                        $query = $this->filterNonEmpty([
                            'order_sn'       => $sn,
                            'package_number' => $packageNumber,
                        ]);
                        $url = $this->buildSignedUrl($account, '/api/v2/logistics/get_tracking_number', $query);
                        $reqs[$sn] = $pool->as((string) $sn)->timeout(15)->get($url);
                    }

                    return $reqs;
                });
            } catch (\Throwable $e) {
                Log::warning('ShopeeOrderService fetchMissingTrackingNumbersPool warning: ' . $e->getMessage());
                continue;
            }

            foreach ($responses as $sn => $response) {
                if (! ($response instanceof Response) || ! $response->successful()) {
                    continue;
                }
                $data = $response->json();
                if (! is_array($data) || ! empty($data['error'])) {
                    continue;
                }
                $resp = is_array($data['response'] ?? null) ? $data['response'] : [];
                $trackingNumber = trim((string) (
                    $resp['tracking_number']
                    ?? $resp['last_mile_tracking_number']
                    ?? ''
                ));
                if ($trackingNumber !== '') {
                    $trackingMap[(string) $sn] = $trackingNumber;
                }
            }
        }

        if (! empty($trackingMap)) {
            $updatedCount = $this->recorder->applyTrackingNumbers($account, $trackingMap);
        }

        return $trackingMap;
    }

    private function markAccountSyncSuccess(ShopeeAccount $account): void
    {
        $account->update([
            'last_synced_at'   => now(),
            'last_sync_status' => 'success',
            'last_sync_error'  => null,
        ]);
    }

    private function formatLastSyncedAt(?ShopeeAccount $account): ?string
    {
        return $account?->last_synced_at?->copy()->setTimezone('Asia/Jakarta')->format('d M Y, H:i:s');
    }

    private function ensureConnectedAccount(ShopeeAccount &$account): ShopeeAccount
    {
        if (
            empty($account->partner_id)
            || empty($account->partner_key)
            || empty($account->shop_id)
            || empty($account->access_token)
        ) {
            throw new RuntimeException('Akun Shopee belum terhubung lengkap (Partner ID, Shop ID, atau Access Token kosong).');
        }

        $fresh = $this->syncService->getValidTokenAccount($account);
        if ($fresh !== $account) {
            $account->setRawAttributes($fresh->getAttributes(), true);
            $account->syncOriginal();
            $account->exists = $fresh->exists;
        }

        return $account;
    }

    private function buildSignedUrl(ShopeeAccount $account, string $path, array $extraQuery = []): string
    {
        $timestamp = time();
        $accessToken = (string) ($account->access_token ?? '');
        $shopId = (int) $account->shop_id;
        $partnerId = (int) $account->partner_id;
        $partnerKey = (string) $account->partner_key;

        $baseStr = sprintf('%s%s%s%s%s', $partnerId, $path, $timestamp, $accessToken, $shopId);
        $sign = hash_hmac('sha256', $baseStr, $partnerKey);

        $query = array_merge([
            'partner_id'   => $partnerId,
            'timestamp'    => $timestamp,
            'sign'         => $sign,
            'access_token' => $accessToken,
            'shop_id'      => $shopId,
        ], $this->filterNonEmpty($extraQuery));

        return $this->host . $path . '?' . http_build_query($query);
    }

    private function getApi(ShopeeAccount &$account, string $path, array $query = []): array
    {
        $this->ensureConnectedAccount($account);
        $url = $this->buildSignedUrl($account, $path, $query);

        $response = Http::timeout(25)->get($url);

        return $this->decodeJsonResponse($response, $path);
    }

    private function postApi(ShopeeAccount &$account, string $path, array $body = [], int $timeout = 25): array
    {
        $this->ensureConnectedAccount($account);
        $url = $this->buildSignedUrl($account, $path);

        $response = Http::timeout($timeout)->asJson()->post($url, $body);

        return $this->decodeJsonResponse($response, $path);
    }

    private function postBinaryApi(ShopeeAccount &$account, string $path, array $body = [], int $timeout = 40): Response
    {
        $this->ensureConnectedAccount($account);
        $url = $this->buildSignedUrl($account, $path);

        $response = Http::timeout($timeout)->asJson()->post($url, $body);

        if ($response->failed()) {
            $data = $response->json();
            throw new RuntimeException(
                $this->formatShopeeApiError(is_array($data) ? $data : null, $response->status(), $path)
            );
        }

        return $response;
    }

    private function decodeJsonResponse(Response $response, string $path): array
    {
        $data = $response->json();
        $dataArr = is_array($data) ? $data : [];

        if ($response->failed() || ! empty($dataArr['error'])) {
            throw new RuntimeException(
                $this->formatShopeeApiError($dataArr, $response->status(), $path)
            );
        }

        return $dataArr;
    }

    private function formatShopeeApiError(?array $data, int $status, string $context): string
    {
        $errorCode = trim((string) ($data['error'] ?? ''));
        $message = trim((string) ($data['message'] ?? ''));

        if ($errorCode === 'error_auth' || stripos($errorCode, 'auth') !== false || $status === 401 || $status === 403) {
            $base = 'Otorisasi Shopee ditolak (' . ($errorCode ?: "HTTP {$status}") . '): periksa masa berlaku token toko atau pastikan izin Logistics & Order API pada aplikasi Shopee Open Platform sudah aktif.';
            return $message !== '' ? "{$base} Detail: {$message}" : $base;
        }

        if (stripos($errorCode, 'packages_can_not_download_together') !== false || stripos($message, 'different channel_id') !== false) {
            return 'Cetak Resi Massal gagal: Pesanan yang dipilih memiliki kurir/ekspedisi yang berbeda. Server Shopee mewajibkan cetak resi massal dilakukan per ekspedisi yang sama (misal: sesama SPX Express, atau sesama J&T Express). Silakan gunakan filter Kurir terlebih dahulu sebelum mencetak massal.';
        }

        if ($errorCode !== '' || $message !== '') {
            $detail = trim($errorCode . ($errorCode !== '' && $message !== '' ? ': ' : '') . $message);
            return "Shopee API ({$context}) gagal: {$detail}";
        }

        return "Shopee API ({$context}) gagal dengan HTTP status {$status}.";
    }

    private function resolveShipMethod(array $shipPayload): string
    {
        $method = strtolower(trim((string) ($shipPayload['method'] ?? $shipPayload['fulfillment_method'] ?? '')));
        if ($method === '') {
            if (array_key_exists('pickup', $shipPayload)) {
                $method = 'pickup';
            } elseif (array_key_exists('dropoff', $shipPayload)) {
                $method = 'dropoff';
            } elseif (array_key_exists('non_integrated', $shipPayload)) {
                $method = 'non_integrated';
            } else {
                $method = 'dropoff';
            }
        }

        if (! in_array($method, ['pickup', 'dropoff', 'non_integrated'], true)) {
            throw new RuntimeException("Metode pengiriman tidak valid: {$method}");
        }

        return $method;
    }

    /**
     * Rakit objek metode pengiriman. Wajib memakai stdClass() jika kosong agar ter-encode menjadi `{}`.
     *
     * @return array<string, mixed>|\stdClass
     */
    private function buildMethodPayload(string $method, array $shipPayload): array|\stdClass
    {
        $src = is_array($shipPayload[$method] ?? null) ? $shipPayload[$method] : $shipPayload;

        if ($method === 'pickup') {
            $data = [];
            if (isset($src['address_id']) && $src['address_id'] !== '' && $src['address_id'] !== null) {
                $data['address_id'] = (int) $src['address_id'];
            }
            if (! empty($src['pickup_time_id'])) {
                $data['pickup_time_id'] = trim((string) $src['pickup_time_id']);
            }
            if (! empty($src['tracking_number'])) {
                $data['tracking_number'] = trim((string) $src['tracking_number']);
            }

            return empty($data) ? new \stdClass() : $data;
        }

        if ($method === 'dropoff') {
            $data = [];
            if (isset($src['branch_id']) && $src['branch_id'] !== '' && $src['branch_id'] !== null) {
                $data['branch_id'] = (int) $src['branch_id'];
            }
            if (! empty($src['sender_real_name'])) {
                $data['sender_real_name'] = trim((string) $src['sender_real_name']);
            }
            if (! empty($src['tracking_number'])) {
                $data['tracking_number'] = trim((string) $src['tracking_number']);
            }
            if (! empty($src['slug'])) {
                $data['slug'] = trim((string) $src['slug']);
            }

            return empty($data) ? new \stdClass() : $data;
        }

        $data = $this->filterNonEmpty([
            'tracking_number' => isset($src['tracking_number']) ? trim((string) $src['tracking_number']) : null,
        ]);

        return empty($data) ? new \stdClass() : $data;
    }

    private function resolveMassShipPayload(array $params, string $preferredMethod, array $sharedOptions): array
    {
        $pickupSupported = ! empty($params['pickup_supported']);
        $dropoffSupported = ! empty($params['dropoff_supported']);
        $nonIntegratedSupported = ! empty($params['non_integrated_supported']);
        $addressList = is_array($params['pickup']['address_list'] ?? null) ? $params['pickup']['address_list'] : [];
        $branchList = is_array($params['dropoff']['branch_list'] ?? null) ? $params['dropoff']['branch_list'] : [];

        $chosenMethod = match ($preferredMethod) {
            'pickup'  => $pickupSupported
                ? 'pickup'
                : throw new RuntimeException('Metode Pick-up tidak didukung untuk kurir pesanan ini.'),
            'dropoff' => $dropoffSupported
                ? 'dropoff'
                : throw new RuntimeException('Metode Drop-off (antar counter) tidak didukung untuk kurir pesanan ini.'),
            default   => match (true) {
                $pickupSupported && ! empty($addressList) => 'pickup',
                $dropoffSupported                         => 'dropoff',
                $pickupSupported                          => 'pickup',
                $nonIntegratedSupported                   => 'non_integrated',
                default => throw new RuntimeException('Tidak ada metode pengiriman yang didukung untuk kurir pesanan ini.'),
            },
        };

        if ($chosenMethod === 'pickup') {
            if (empty($addressList)) {
                throw new RuntimeException('Alamat penjemputan (pickup) belum diatur pada akun Seller Centre Shopee.');
            }

            $selectedAddress = $this->pickDefaultAddress($addressList, $sharedOptions['address_id'] ?? null);
            $timeSlots = is_array($selectedAddress['time_slot_list'] ?? null) ? $selectedAddress['time_slot_list'] : [];

            // Cocokkan pickup_time_id ke daftar slot alamat pesanan ini agar tidak error slot tidak valid
            $pickupTimeId = null;
            if (! empty($sharedOptions['pickup_time_id'])) {
                foreach ($timeSlots as $slot) {
                    if (isset($slot['pickup_time_id']) && (string) $slot['pickup_time_id'] === (string) $sharedOptions['pickup_time_id']) {
                        $pickupTimeId = (string) $slot['pickup_time_id'];
                        break;
                    }
                }
            }
            if ($pickupTimeId === null && ! empty($timeSlots)) {
                $pickupTimeId = (string) ($timeSlots[0]['pickup_time_id'] ?? '');
            }

            return $this->filterNonEmpty([
                'method'         => 'pickup',
                'address_id'     => $selectedAddress['address_id'] ?? null,
                'pickup_time_id' => $pickupTimeId,
            ]);
        }

        if ($chosenMethod === 'dropoff') {
            $branchId = $sharedOptions['branch_id'] ?? null;
            $dropoffInfoNeeded = (array) ($params['info_needed']['dropoff'] ?? []);
            if ($branchId === null && in_array('branch_id', $dropoffInfoNeeded, true) && ! empty($branchList)) {
                $branchId = $branchList[0]['branch_id'] ?? null;
            }

            return $this->filterNonEmpty([
                'method'           => 'dropoff',
                'branch_id'        => $branchId,
                'sender_real_name' => $sharedOptions['sender_real_name'] ?? null,
            ]);
        }

        return $this->filterNonEmpty([
            'method'          => 'non_integrated',
            'tracking_number' => $sharedOptions['tracking_number'] ?? null,
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $addressList
     * @return array<string, mixed>
     */
    private function pickDefaultAddress(array $addressList, mixed $preferredAddressId): array
    {
        if ($preferredAddressId !== null && $preferredAddressId !== '') {
            foreach ($addressList as $addr) {
                if (isset($addr['address_id']) && (int) $addr['address_id'] === (int) $preferredAddressId) {
                    return $addr;
                }
            }
        }

        foreach ($addressList as $addr) {
            $flags = (array) ($addr['address_flag'] ?? []);
            if (in_array('default_address', $flags, true) || ! empty($addr['default']) || ! empty($addr['is_default'])) {
                return $addr;
            }
        }

        return $addressList[0];
    }

    /**
     * Panggil create_shipping_document dengan toleransi already-created & isolasi kegagalan batch > 1 pesanan.
     *
     * @param  array<int, ShopeeOrder>  $orders
     * @return array<int, array<string, mixed>>
     */
    private function requestCreateShippingDocuments(ShopeeAccount &$account, array $orders): array
    {
        try {
            $resp = $this->postApi($account, '/api/v2/logistics/create_shipping_document', [
                'order_list' => $this->buildWaybillOrderList($orders, true, true),
            ]);

            $list = $resp['response']['result_list'] ?? [];

            return is_array($list) ? $list : [];
        } catch (\Throwable $e) {
            if ($this->isAlreadyCreatedWaybillError($e->getMessage())) {
                Log::info('Shopee create_shipping_document already created notice: ' . $e->getMessage());

                return [];
            }

            // Jika batch > 1 pesanan gagal di level HTTP/API (bukan error auth), pecah per-pesanan
            // agar pesanan yang sudah pernah dibuat atau valid tidak ikut gagal.
            $msgLower = strtolower($e->getMessage());
            $isAuthError = str_contains($msgLower, 'otorisasi shopee') || str_contains($msgLower, 'error_auth');
            if (count($orders) <= 1 || $isAuthError) {
                throw $e;
            }

            Log::warning('Shopee create_shipping_document batch fallback ke per-order: ' . $e->getMessage());
            $combinedResults = [];
            foreach ($orders as $singleOrder) {
                try {
                    $singleResp = $this->postApi($account, '/api/v2/logistics/create_shipping_document', [
                        'order_list' => $this->buildWaybillOrderList([$singleOrder], true, true),
                    ]);
                    $singleList = $singleResp['response']['result_list'] ?? [];
                    if (is_array($singleList)) {
                        foreach ($singleList as $entry) {
                            if (is_array($entry)) {
                                $combinedResults[] = $entry;
                            }
                        }
                    }
                } catch (\Throwable $singleErr) {
                    if ($this->isAlreadyCreatedWaybillError($singleErr->getMessage())) {
                        Log::info("Shopee create_shipping_document ({$singleOrder->order_sn}) already created.");
                        continue;
                    }
                    $combinedResults[] = [
                        'order_sn'     => $singleOrder->order_sn,
                        'fail_error'   => 'CREATE_FAILED',
                        'fail_message' => $singleErr->getMessage(),
                    ];
                }
            }

            return $combinedResults;
        }
    }

    /**
     * Ekstrak daftar pesanan yang benar-benar gagal dari result_list create_shipping_document.
     *
     * @param  array<int, array<string, mixed>>  $resultList
     * @return array<string, string>
     */
    private function extractCreateShippingFailures(array $resultList): array
    {
        $failed = [];
        foreach ($resultList as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $sn = (string) ($entry['order_sn'] ?? '');
            $failErr = trim((string) ($entry['fail_error'] ?? ''));
            $failMsg = trim((string) ($entry['fail_message'] ?? ''));
            if ($sn === '' || ($failErr === '' && $failMsg === '')) {
                continue;
            }

            $combined = trim($failErr . ($failErr && $failMsg ? ': ' : '') . $failMsg);
            if ($this->isAlreadyCreatedWaybillError($combined)) {
                Log::info("Shopee create_shipping_document ({$sn}) dilewati karena dokumen sudah pernah dibuat: {$combined}");
                continue;
            }

            $failed[$sn] = $combined;
        }

        return $failed;
    }

    private function isAlreadyCreatedWaybillError(string $message): bool
    {
        $lower = strtolower($message);

        return str_contains($lower, 'already')
            || str_contains($lower, 'exist')
            || str_contains($lower, 'duplicate')
            || str_contains($lower, 'created');
    }

    private function isTransientCreateWaybillError(string $message): bool
    {
        $lower = strtolower($message);

        if (
            str_contains($lower, 'error_auth')
            || str_contains($lower, 'otorisasi shopee')
            || str_contains($lower, 'different channel_id')
            || str_contains($lower, 'packages_can_not_download_together')
            || str_contains($lower, 'cancelled')
            || str_contains($lower, 'unpaid')
        ) {
            return false;
        }

        return str_contains($lower, 'not_ready')
            || str_contains($lower, 'not ready')
            || str_contains($lower, 'busy')
            || str_contains($lower, 'timeout')
            || str_contains($lower, 'try again')
            || str_contains($lower, 'system')
            || str_contains($lower, 'tracking_number')
            || str_contains($lower, 'tracking number')
            || str_contains($lower, 'order_status')
            || str_contains($lower, 'not_arranged')
            || str_contains($lower, 'not arranged')
            || str_contains($lower, 'not_processed')
            || str_contains($lower, 'not processed')
            || str_contains($lower, 'processing')
            || str_contains($lower, 'in_progress')
            || str_contains($lower, 'in progress')
            || str_contains($lower, 'package_number')
            || str_contains($lower, 'document')
            || str_contains($lower, 'waybill')
            || str_contains($lower, 'generating');
    }

    /**
     * Ambil tracking number yang masih kosong untuk batch pesanan secara paralel (dengan retry putaran singkat).
     *
     * @param  array<int, ShopeeOrder>  $orders
     */
    private function hydrateMissingTrackingNumbersForOrders(ShopeeAccount &$account, array $orders, int $maxRounds = 4): void
    {
        for ($round = 1; $round <= $maxRounds; $round++) {
            $missing = array_values(array_filter(
                $orders,
                static fn (ShopeeOrder $o): bool => trim((string) ($o->tracking_number ?? '')) === ''
            ));

            if (empty($missing)) {
                return;
            }

            if (count($missing) === 1) {
                $single = $missing[0];
                try {
                    $tn = $this->fetchTrackingNumber($account, $single->order_sn, $single->package_number ?: null);
                    if (! empty($tn)) {
                        $single->tracking_number = $tn;
                    }
                } catch (\Throwable $e) {
                    Log::warning("Shopee waybill fetchTrackingNumber round {$round} ({$single->order_sn}): " . $e->getMessage());
                }
            } else {
                $trackingMap = [];
                try {
                    $responses = Http::pool(function (Pool $pool) use ($account, $missing): array {
                        $reqs = [];
                        foreach ($missing as $order) {
                            $resolvedPkg = $this->resolvePackageNumber($account, $order->order_sn, $order->package_number ?: null);
                            $query = $this->filterNonEmpty([
                                'order_sn'       => $order->order_sn,
                                'package_number' => $resolvedPkg,
                            ]);
                            $url = $this->buildSignedUrl($account, '/api/v2/logistics/get_tracking_number', $query);
                            $reqs[$order->order_sn] = $pool->as($order->order_sn)->timeout(15)->get($url);
                        }

                        return $reqs;
                    });

                    foreach ($responses as $sn => $response) {
                        if (! ($response instanceof Response) || ! $response->successful()) {
                            continue;
                        }
                        $data = $response->json();
                        if (! is_array($data) || ! empty($data['error'])) {
                            continue;
                        }
                        $resp = is_array($data['response'] ?? null) ? $data['response'] : [];
                        $tn = trim((string) (
                            $resp['tracking_number']
                            ?? $resp['last_mile_tracking_number']
                            ?? $resp['first_mile_tracking_number']
                            ?? $resp['plp_number']
                            ?? ''
                        ));
                        if ($tn !== '') {
                            $trackingMap[(string) $sn] = $tn;
                        }
                    }
                } catch (\Throwable $e) {
                    Log::warning("Shopee waybill pool fetchTrackingNumber round {$round}: " . $e->getMessage());
                }

                if (! empty($trackingMap)) {
                    $this->recorder->applyTrackingNumbers($account, $trackingMap);
                    foreach ($missing as $order) {
                        if (isset($trackingMap[$order->order_sn])) {
                            $order->tracking_number = $trackingMap[$order->order_sn];
                        }
                    }
                }
            }

            $stillMissing = array_filter(
                $missing,
                static fn (ShopeeOrder $o): bool => trim((string) ($o->tracking_number ?? '')) === ''
            );
            if (empty($stillMissing)) {
                return;
            }

            if ($round < $maxRounds) {
                usleep(min(1800000, 700000 + ($round * 350000)));
            }
        }
    }

    /**
     * @param  array<int, ShopeeOrder>  $orders
     * @return array<int, array<string, string>>
     */
    private function buildWaybillOrderList(array $orders, bool $includeType, bool $includeTracking): array
    {
        $items = [];
        foreach ($orders as $order) {
            $pkgList = is_array($order->package_list_json) ? $order->package_list_json : [];
            $activePackages = [];

            if (count($pkgList) > 1) {
                foreach ($pkgList as $pkg) {
                    if (! is_array($pkg)) {
                        continue;
                    }
                    $pkgStatus = strtoupper(trim((string) ($pkg['logistics_status'] ?? '')));
                    if (in_array($pkgStatus, ['LOGISTICS_REQUEST_CANCELED', 'CANCELLED'], true)) {
                        continue;
                    }
                    $pkgNo = trim((string) ($pkg['package_number'] ?? ''));
                    if ($pkgNo !== '' && ! isset($activePackages[$pkgNo])) {
                        $activePackages[$pkgNo] = trim((string) ($pkg['tracking_number'] ?? ''));
                    }
                }
            }

            if (count($activePackages) > 1) {
                foreach ($activePackages as $pkgNo => $pkgTracking) {
                    $items[] = $this->filterNonEmpty([
                        'order_sn'               => $order->order_sn,
                        'package_number'         => $pkgNo,
                        'tracking_number'        => $includeTracking ? (($pkgTracking !== '' ? $pkgTracking : $order->tracking_number) ?: null) : null,
                        'shipping_document_type' => $includeType ? self::WAYBILL_DOCUMENT_TYPE : null,
                    ]);
                }
                continue;
            }

            $items[] = $this->filterNonEmpty([
                'order_sn'               => $order->order_sn,
                'package_number'         => $order->package_number ?: null,
                'tracking_number'        => $includeTracking ? ($order->tracking_number ?: null) : null,
                'shipping_document_type' => $includeType ? self::WAYBILL_DOCUMENT_TYPE : null,
            ]);
        }

        return $items;
    }

    /**
     * @param  array<int, string>  $orderSns
     * @return array<int, string>
     */
    private function normalizeOrderSnList(array $orderSns, string $actionLabel): array
    {
        $normalized = array_values(array_unique(array_filter(
            array_map(static fn ($sn): string => trim((string) $sn), $orderSns),
            static fn (string $sn): bool => $sn !== ''
        )));

        if (count($normalized) < 1) {
            throw new RuntimeException("Pilih minimal 1 pesanan untuk {$actionLabel}.");
        }

        if (count($normalized) > self::MAX_BATCH_SIZE) {
            throw new RuntimeException("Maksimal " . self::MAX_BATCH_SIZE . " pesanan per sekali {$actionLabel}.");
        }

        return $normalized;
    }

    private function resolvePackageNumber(ShopeeAccount $account, string $orderSn, ?string $packageNumber): ?string
    {
        $trimmed = $packageNumber !== null ? trim($packageNumber) : '';
        if ($trimmed !== '') {
            return $trimmed;
        }

        $existing = ShopeeOrder::where('shopee_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->first(['package_number', 'package_list_json']);

        $pkgList = is_array($existing?->package_list_json) ? $existing->package_list_json : [];
        if (count($pkgList) <= 1) {
            return null;
        }

        $fromDb = trim((string) ($existing?->package_number ?? ''));

        return $fromDb !== '' ? $fromDb : null;
    }

    /**
     * @param  array<int, ShopeeOrder>  $orders
     * @param  array<string, string>  $failedSnMessages
     */
    private function markWaybillFailedOrders(array $orders, array $failedSnMessages): void
    {
        $failedIds = [];
        foreach ($orders as $order) {
            if (isset($failedSnMessages[$order->order_sn])) {
                $failedIds[] = (int) $order->id;
            }
        }

        if (! empty($failedIds)) {
            ShopeeOrder::whereIn('id', $failedIds)->update(['label_document_status' => 'FAILED']);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function filterNonEmpty(array $data): array
    {
        $filtered = [];
        foreach ($data as $key => $value) {
            if (is_string($value)) {
                $value = trim($value);
            }
            if ($value !== null && $value !== '') {
                $filtered[$key] = $value;
            }
        }

        return $filtered;
    }
}
