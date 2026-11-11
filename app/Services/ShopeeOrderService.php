<?php

namespace App\Services;

use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use Carbon\Carbon;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class ShopeeOrderService
{
    public const ORDER_DETAIL_FIELDS = 'buyer_user_id,buyer_username,recipient_address,item_list,package_list,shipping_carrier,total_amount,cancel_by,cancel_reason,buyer_cancel_reason,payment_info,payment_method,ship_by_date,message_to_seller,note,estimated_shipping_fee,cod';

    public const WAYBILL_DOCUMENT_TYPE = 'NORMAL_AIR_WAYBILL';

    public const MAX_BATCH_SIZE = 50;

    private string $host;

    public function __construct(
        private readonly ShopeeSyncService $syncService,
    ) {
        $this->host = rtrim((string) config('services.shopee.host', 'https://partner.shopeemobile.com'), '/');
    }

    /**
     * Pastikan tabel shopee_orders tersedia di database (aman untuk deploy tanpa shell).
     */
    public function ensureSchema(): void
    {
        try {
            if (! Schema::hasTable('shopee_orders')) {
                Schema::create('shopee_orders', ShopeeOrder::buildSchemaCallback());
            }
        } catch (\Throwable $e) {
            Log::warning('ShopeeOrderService ensureSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Sinkronisasi pesanan dari Shopee API v2 ke shopee_orders dan (opsional) cut_off_orders.
     *
     * @return array{total_fetched: int, synced_orders: int, cutoff_created: int, cutoff_updated: int, message: string}
     */
    public function syncOrders(
        ShopeeAccount $account,
        int $timeFrom,
        int $timeTo,
        ?string $orderStatus = null,
        bool $syncCutOff = true
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
            $maxWindow = 14 * 86400;
            $allOrderSns = [];
            $currentTo = $timeTo;

            while ($currentTo > $timeFrom) {
                $currentFrom = max($timeFrom, $currentTo - $maxWindow);
                $chunkList = $this->syncService->fetchOrderListRaw($account, $currentFrom, $currentTo, 100, $orderStatus);

                foreach ($chunkList as $ord) {
                    if (! empty($ord['order_sn'])) {
                        $allOrderSns[(string) $ord['order_sn']] = true;
                    }
                }

                $currentTo = $currentFrom;
            }

            $orderSns = array_keys($allOrderSns);
            if (empty($orderSns)) {
                $account->update([
                    'last_synced_at'   => now(),
                    'last_sync_status' => 'success',
                    'last_sync_error'  => null,
                ]);

                return [
                    'total_fetched'  => 0,
                    'synced_orders'  => 0,
                    'cutoff_created' => 0,
                    'cutoff_updated' => 0,
                    'message'        => 'Tidak ada pesanan Shopee pada rentang waktu tersebut.',
                ];
            }

            $detailedOrders = [];
            $escrowMap = [];
            foreach (array_chunk($orderSns, self::MAX_BATCH_SIZE) as $chunk) {
                $details = $this->syncService->fetchOrderDetailRaw($account, $chunk, self::ORDER_DETAIL_FIELDS);
                if (! empty($details)) {
                    $detailedOrders = array_merge($detailedOrders, $details);
                }
                if ($syncCutOff) {
                    $batchEscrow = $this->syncService->fetchEscrowDetailBatch($account, $chunk);
                    if (! empty($batchEscrow)) {
                        $escrowMap = array_replace($escrowMap, $batchEscrow);
                    }
                }
            }

            if (empty($detailedOrders)) {
                $account->update([
                    'last_synced_at'   => now(),
                    'last_sync_status' => 'success',
                    'last_sync_error'  => null,
                ]);

                return [
                    'total_fetched'  => 0,
                    'synced_orders'  => 0,
                    'cutoff_created' => 0,
                    'cutoff_updated' => 0,
                    'message'        => 'Detail pesanan Shopee tidak ditemukan pada rentang waktu tersebut.',
                ];
            }

            $syncedCount = $this->upsertShopeeOrdersFromDetails($account, $detailedOrders);

            $cutOffResult = ['created' => 0, 'updated' => 0];
            if ($syncCutOff) {
                $cutOffResult = $this->syncService->ingestDetailedOrdersToCutOff($account, $detailedOrders, $escrowMap, true);
            } else {
                $account->update([
                    'last_synced_at'   => now(),
                    'last_sync_status' => 'success',
                    'last_sync_error'  => null,
                ]);
            }

            $created = (int) ($cutOffResult['created'] ?? 0);
            $updated = (int) ($cutOffResult['updated'] ?? 0);

            return [
                'total_fetched'  => count($detailedOrders),
                'synced_orders'  => $syncedCount,
                'cutoff_created' => $created,
                'cutoff_updated' => $updated,
                'message'        => $syncCutOff
                    ? "Sinkronisasi berhasil: {$syncedCount} pesanan diperbarui di Pesanan Saya ({$created} baru, {$updated} diperbarui di Cut Off)."
                    : "Sinkronisasi berhasil: {$syncedCount} pesanan diperbarui di Pesanan Saya.",
            ];
        } catch (\Throwable $e) {
            $account->update([
                'last_sync_status' => 'failed',
                'last_sync_error'  => $e->getMessage(),
            ]);
            throw $e;
        }
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

        $this->upsertShopeeOrdersFromDetails($account, $detailedOrders);

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

        return $order;
    }

    /**
     * Ambil nomor resi dari Shopee API v2 untuk 1 pesanan dan simpan ke shopee_orders.
     */
    public function fetchTrackingNumber(ShopeeAccount $account, string $orderSn, ?string $packageNumber = null): ?string
    {
        $this->ensureSchema();

        $query = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $packageNumber,
        ]);

        $data = $this->getApi($account, '/api/v2/logistics/get_tracking_number', $query);
        $resp = is_array($data['response'] ?? null) ? $data['response'] : [];

        $trackingNumber = trim((string) (
            $resp['tracking_number']
            ?? $resp['last_mile_tracking_number']
            ?? ''
        ));

        if ($trackingNumber !== '') {
            ShopeeOrder::where('shopee_account_id', $account->id)
                ->where('order_sn', $orderSn)
                ->update(['tracking_number' => $trackingNumber]);

            return $trackingNumber;
        }

        return null;
    }

    /**
     * Ambil opsi parameter pengiriman (Pickup / Drop-off / Non-integrated) dari Shopee API v2.
     */
    public function getShippingParameter(ShopeeAccount $account, string $orderSn, ?string $packageNumber = null): array
    {
        $this->ensureSchema();

        if ($packageNumber === null || $packageNumber === '') {
            $existing = ShopeeOrder::where('shopee_account_id', $account->id)
                ->where('order_sn', $orderSn)
                ->first(['package_number']);
            $packageNumber = $existing?->package_number ?: null;
        }

        $query = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $packageNumber,
        ]);

        $data = $this->getApi($account, '/api/v2/logistics/get_shipping_parameter', $query);
        $resp = is_array($data['response'] ?? null) ? $data['response'] : [];
        $infoNeeded = is_array($resp['info_needed'] ?? null) ? $resp['info_needed'] : [];

        return [
            'order_sn'                 => $orderSn,
            'package_number'           => $packageNumber ?: null,
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
     */
    public function shipOrder(ShopeeAccount $account, string $orderSn, array $shipPayload): array
    {
        $this->ensureSchema();
        $account = $this->ensureConnectedAccount($account);

        $existingOrder = ShopeeOrder::where('shopee_account_id', $account->id)
            ->where('order_sn', $orderSn)
            ->first();

        $packageNumber = trim((string) ($shipPayload['package_number'] ?? $existingOrder?->package_number ?? ''));
        $method = $this->resolveShipMethod($shipPayload);

        $body = $this->filterNonEmpty([
            'order_sn'       => $orderSn,
            'package_number' => $packageNumber,
        ]);

        $body[$method] = $this->buildMethodPayload($method, $shipPayload);

        $this->postApi($account, '/api/v2/logistics/ship_order', $body);

        $trackingNumber = null;
        for ($attempt = 1; $attempt <= 2; $attempt++) {
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

            if ($attempt < 2) {
                usleep(400000);
            }
        }

        $refreshedOrder = $this->refreshSingleOrder($account, $orderSn);

        $localUpdates = [
            'fulfillment_method'   => $method,
            'shipping_arranged_at' => $refreshedOrder->shipping_arranged_at ?? now('Asia/Jakarta'),
        ];
        if (! empty($trackingNumber)) {
            $localUpdates['tracking_number'] = $trackingNumber;
        }
        $refreshedOrder->update($localUpdates);
        $refreshedOrder = $refreshedOrder->fresh();

        return [
            'order_sn'             => $orderSn,
            'tracking_number'      => $refreshedOrder->tracking_number,
            'fulfillment_method'   => $refreshedOrder->fulfillment_method,
            'order_status'         => $refreshedOrder->order_status,
            'shipping_arranged_at' => $refreshedOrder->shipping_arranged_at?->format('Y-m-d H:i:s'),
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
                    'order_sn'           => $sn,
                    'tracking_number'    => $result['tracking_number'] ?? null,
                    'fulfillment_method' => $result['fulfillment_method'] ?? null,
                    'order_status'       => $result['order_status'] ?? 'PROCESSED',
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
     * Buat dan unduh dokumen resi PDF A4 resmi Shopee (NORMAL_AIR_WAYBILL) untuk 1..50 pesanan.
     *
     * @param  array<int, string>  $orderSns
     * @return array{pdf_binary: string, filename: string, orders: array<int, ShopeeOrder>, warnings: array<int, string>}
     */
    public function createAndDownloadWaybillA4(ShopeeAccount $account, array $orderSns): array
    {
        $orderSns = $this->normalizeOrderSnList($orderSns, 'cetak resi A4');
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

        $blockedStatuses = ['UNPAID', 'READY_TO_SHIP', 'RETRY_SHIP', 'CANCELLED'];
        $invalidReasons = [];
        foreach ($orders as $order) {
            if (in_array($order->order_status, $blockedStatuses, true)) {
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
        foreach ($orders as $order) {
            if (empty($order->tracking_number)) {
                $tn = $this->fetchTrackingNumber($account, $order->order_sn, $order->package_number ?: null);
                if (! empty($tn)) {
                    $order->tracking_number = $tn;
                } else {
                    $warnings[] = "No. Resi untuk {$order->order_sn} belum tersedia dari Shopee.";
                }
            }
        }

        $createResp = $this->postApi($account, '/api/v2/logistics/create_shipping_document', [
            'order_list' => $this->buildWaybillOrderList($orders, true, true),
        ]);

        $failedSnMessages = [];
        foreach (($createResp['response']['result_list'] ?? []) as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $sn = (string) ($entry['order_sn'] ?? '');
            $failErr = trim((string) ($entry['fail_error'] ?? ''));
            $failMsg = trim((string) ($entry['fail_message'] ?? ''));
            if ($sn !== '' && ($failErr !== '' || $failMsg !== '')) {
                $failedSnMessages[$sn] = trim($failErr . ($failErr && $failMsg ? ': ' : '') . $failMsg);
            }
        }

        $eligibleOrders = array_values(array_filter(
            $orders,
            static fn (ShopeeOrder $o): bool => ! isset($failedSnMessages[$o->order_sn])
        ));

        if (empty($eligibleOrders)) {
            throw new RuntimeException(
                'Gagal membuat dokumen resi A4 di Shopee: ' . implode('; ', $failedSnMessages)
            );
        }

        foreach ($failedSnMessages as $sn => $msg) {
            $warnings[] = "Resi {$sn} gagal dibuat Shopee: {$msg}";
        }

        $docQueryList = $this->buildWaybillOrderList($eligibleOrders, true, false);

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $resultResp = $this->postApi($account, '/api/v2/logistics/get_shipping_document_result', [
                'order_list' => $docQueryList,
            ]);

            $resultList = $resultResp['response']['result_list'] ?? [];
            if (! is_array($resultList) || empty($resultList)) {
                break;
            }

            $hasProcessing = false;
            foreach ($resultList as $entry) {
                if (! is_array($entry)) {
                    continue;
                }
                $sn = (string) ($entry['order_sn'] ?? '');
                $status = strtoupper((string) ($entry['status'] ?? ''));
                if ($status === 'FAILED' && $sn !== '') {
                    $failErr = trim((string) ($entry['fail_error'] ?? ''));
                    $failMsg = trim((string) ($entry['fail_message'] ?? ''));
                    $failedSnMessages[$sn] = trim($failErr . ($failErr && $failMsg ? ': ' : '') . $failMsg) ?: 'Status dokumen FAILED';
                } elseif (in_array($status, ['PROCESSING', 'WAITING'], true)) {
                    $hasProcessing = true;
                }
            }

            if (! $hasProcessing) {
                break;
            }

            if ($attempt < 5) {
                usleep(500000);
            }
        }

        $readyOrders = array_values(array_filter(
            $eligibleOrders,
            static fn (ShopeeOrder $o): bool => ! isset($failedSnMessages[$o->order_sn])
        ));

        $failedIds = [];
        foreach ($eligibleOrders as $order) {
            if (isset($failedSnMessages[$order->order_sn])) {
                $failedIds[] = $order->id;
                $msg = $failedSnMessages[$order->order_sn];
                if (! in_array("Resi {$order->order_sn} gagal dibuat Shopee: {$msg}", $warnings, true)) {
                    $warnings[] = "Resi {$order->order_sn} gagal disiapkan Shopee: {$msg}";
                }
            }
        }
        if (! empty($failedIds)) {
            ShopeeOrder::whereIn('id', $failedIds)->update(['label_document_status' => 'FAILED']);
        }

        if (empty($readyOrders)) {
            throw new RuntimeException(
                'Dokumen resi A4 Shopee gagal disiapkan: ' . implode('; ', $failedSnMessages)
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
            ? 'resi-shopee-' . $orderedResult[0]->order_sn . '-A4.pdf'
            : 'resi-shopee-massal-' . count($orderedResult) . '-pesanan-' . $printedAt->format('Ymd-His') . '-A4.pdf';

        return [
            'pdf_binary' => $binary,
            'filename'   => $filename,
            'orders'     => $orderedResult,
            'warnings'   => array_values(array_unique($warnings)),
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
     * Simpan atau perbarui daftar detail pesanan Shopee ke tabel shopee_orders.
     *
     * @param  array<int, array<string, mixed>>  $detailedOrders
     */
    private function upsertShopeeOrdersFromDetails(ShopeeAccount $account, array $detailedOrders): int
    {
        $orderSns = [];
        foreach ($detailedOrders as $order) {
            if (! empty($order['order_sn'])) {
                $orderSns[] = (string) $order['order_sn'];
            }
        }

        if (empty($orderSns)) {
            return 0;
        }

        $existingOrders = ShopeeOrder::where('shopee_account_id', $account->id)
            ->whereIn('order_sn', $orderSns)
            ->get()
            ->keyBy('order_sn');

        $syncedCount = 0;

        DB::transaction(function () use ($account, $detailedOrders, $existingOrders, &$syncedCount): void {
            $nowWib = now('Asia/Jakarta');

            foreach ($detailedOrders as $order) {
                $orderSn = trim((string) ($order['order_sn'] ?? ''));
                if ($orderSn === '') {
                    continue;
                }

                /** @var ShopeeOrder|null $existing */
                $existing = $existingOrders->get($orderSn);

                $packageList = is_array($order['package_list'] ?? null) ? array_values($order['package_list']) : [];
                $firstPackage = is_array($packageList[0] ?? null) ? $packageList[0] : [];

                $packageNumber = trim((string) ($firstPackage['package_number'] ?? $order['package_number'] ?? ''));
                $packageNumber = $packageNumber !== '' ? $packageNumber : $existing?->package_number;

                $logisticsStatus = trim((string) ($firstPackage['logistics_status'] ?? $order['logistics_status'] ?? ''));
                $logisticsStatus = $logisticsStatus !== '' ? $logisticsStatus : $existing?->logistics_status;

                $shippingCarrier = trim((string) ($order['shipping_carrier'] ?? ''));
                if ($shippingCarrier === '') {
                    $shippingCarrier = (string) ($this->extractFirstPackageString($packageList, 'shipping_carrier') ?? '');
                }
                $shippingCarrier = $shippingCarrier !== '' ? $shippingCarrier : $existing?->shipping_carrier;

                $trackingNumber = trim((string) ($order['tracking_number'] ?? ''));
                if ($trackingNumber === '') {
                    $trackingNumber = (string) ($this->extractFirstPackageString($packageList, 'tracking_number') ?? '');
                }
                $trackingNumber = $trackingNumber !== '' ? $trackingNumber : $existing?->tracking_number;

                $rawPayment = trim((string) ($order['payment_method'] ?? ''));
                $isExplicitNonCod = stripos($rawPayment, 'non-cod') !== false || stripos($rawPayment, 'non cod') !== false;
                $isCod = ! empty($order['cod'])
                    || (! $isExplicitNonCod && (stripos($rawPayment, 'cash on delivery') !== false || stripos($rawPayment, 'cod') !== false));

                $msgToSeller = isset($order['message_to_seller']) ? trim((string) $order['message_to_seller']) : '';
                $note = isset($order['note']) ? trim((string) $order['note']) : '';
                $buyerNote = $msgToSeller !== '' ? $msgToSeller : ($note !== '' ? $note : null);

                $cancelBy = $this->formatCancelByLabel(isset($order['cancel_by']) ? (string) $order['cancel_by'] : null);
                $cancelReason = isset($order['cancel_reason']) && trim((string) $order['cancel_reason']) !== ''
                    ? trim((string) $order['cancel_reason'])
                    : null;
                $buyerCancelReason = isset($order['buyer_cancel_reason']) && trim((string) $order['buyer_cancel_reason']) !== ''
                    ? trim((string) $order['buyer_cancel_reason'])
                    : null;

                $orderCreatedAt = ! empty($order['create_time'])
                    ? Carbon::createFromTimestamp((int) $order['create_time'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                    : ($existing?->order_created_at?->format('Y-m-d H:i:s') ?? $nowWib->format('Y-m-d H:i:s'));

                $shipByDate = ! empty($order['ship_by_date'])
                    ? Carbon::createFromTimestamp((int) $order['ship_by_date'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                    : $existing?->ship_by_date?->format('Y-m-d H:i:s');

                $attributes = [
                    'package_number'         => $packageNumber,
                    'order_status'           => strtoupper((string) ($order['order_status'] ?? 'READY_TO_SHIP')),
                    'logistics_status'       => $logisticsStatus,
                    'shipping_carrier'       => $shippingCarrier,
                    'tracking_number'        => $trackingNumber,
                    'buyer_user_id'          => ! empty($order['buyer_user_id']) ? (int) $order['buyer_user_id'] : null,
                    'buyer_username'         => ! empty($order['buyer_username']) ? (string) $order['buyer_username'] : null,
                    'buyer_note'             => $buyerNote,
                    'recipient_data'         => is_array($order['recipient_address'] ?? null) ? $order['recipient_address'] : null,
                    'items_json'             => $this->normalizeItemsList($order, $packageList),
                    'package_list_json'      => ! empty($packageList) ? $packageList : null,
                    'payment_method'         => $rawPayment !== '' ? $rawPayment : ($isCod ? 'Cash on Delivery' : null),
                    'is_cod'                 => $isCod,
                    'total_amount'           => (float) ($order['total_amount'] ?? 0),
                    'estimated_shipping_fee' => (float) ($order['estimated_shipping_fee'] ?? 0),
                    'cancel_by'              => $cancelBy ?? $existing?->cancel_by,
                    'cancel_reason'          => $cancelReason ?? $existing?->cancel_reason,
                    'buyer_cancel_reason'    => $buyerCancelReason ?? $existing?->buyer_cancel_reason,
                    'order_created_at'       => $orderCreatedAt,
                    'ship_by_date'           => $shipByDate,
                    'label_document_status'  => $existing?->label_document_status ?? 'NONE',
                    'label_print_count'      => $existing?->label_print_count ?? 0,
                    'raw_payload'            => json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'last_synced_at'         => $nowWib,
                ];

                ShopeeOrder::updateOrCreate(
                    [
                        'shopee_account_id' => $account->id,
                        'order_sn'          => $orderSn,
                    ],
                    $attributes
                );

                $syncedCount++;
            }
        });

        return $syncedCount;
    }

    /**
     * Ekstrak daftar item lengkap thumbnail gambar, SKU, variasi, qty, dan harga.
     *
     * @param  array<string, mixed>  $order
     * @param  array<int, array<string, mixed>>  $packageList
     * @return array<int, array<string, mixed>>
     */
    private function normalizeItemsList(array $order, array $packageList): array
    {
        $rawItems = is_array($order['item_list'] ?? null) ? $order['item_list'] : [];
        if (empty($rawItems) && ! empty($packageList)) {
            foreach ($packageList as $pkg) {
                if (! empty($pkg['item_list']) && is_array($pkg['item_list'])) {
                    $rawItems = array_merge($rawItems, $pkg['item_list']);
                }
            }
        }

        $items = [];
        foreach ($rawItems as $it) {
            if (! is_array($it)) {
                continue;
            }

            $imageUrl = $it['image_info']['image_url'] ?? $it['item_image'] ?? null;
            $modelSku = ShopeeSyncService::normalizeSku(isset($it['model_sku']) ? (string) $it['model_sku'] : null);
            $itemSku = ShopeeSyncService::normalizeSku(isset($it['item_sku']) ? (string) $it['item_sku'] : null);

            $items[] = [
                'item_id'                  => isset($it['item_id']) ? (int) $it['item_id'] : null,
                'item_name'                => (string) ($it['item_name'] ?? 'Produk Shopee'),
                'item_sku'                 => $itemSku,
                'model_id'                 => isset($it['model_id']) ? (int) $it['model_id'] : null,
                'model_name'               => ! empty($it['model_name']) ? trim((string) $it['model_name']) : null,
                'model_sku'                => $modelSku,
                'sku'                      => $modelSku ?? $itemSku,
                'model_quantity_purchased' => max(1, (int) ($it['model_quantity_purchased'] ?? $it['quantity_purchased'] ?? $it['model_quantity'] ?? 1)),
                'model_original_price'     => (float) ($it['model_original_price'] ?? $it['original_price'] ?? 0),
                'model_discounted_price'   => (float) ($it['model_discounted_price'] ?? $it['discounted_price'] ?? 0),
                'image_url'                => ! empty($imageUrl) ? (string) $imageUrl : null,
            ];
        }

        return $items;
    }

    private function extractFirstPackageString(array $packageList, string $key): ?string
    {
        foreach ($packageList as $pkg) {
            if (is_array($pkg) && ! empty($pkg[$key])) {
                $val = trim((string) $pkg[$key]);
                if ($val !== '') {
                    return $val;
                }
            }
        }

        return null;
    }

    private function ensureConnectedAccount(ShopeeAccount $account): ShopeeAccount
    {
        if (
            empty($account->partner_id)
            || empty($account->partner_key)
            || empty($account->shop_id)
            || empty($account->access_token)
        ) {
            throw new RuntimeException('Akun Shopee belum terhubung lengkap (Partner ID, Shop ID, atau Access Token kosong).');
        }

        return $this->syncService->getValidTokenAccount($account);
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

    private function getApi(ShopeeAccount $account, string $path, array $query = []): array
    {
        $account = $this->ensureConnectedAccount($account);
        $url = $this->buildSignedUrl($account, $path, $query);

        $response = Http::timeout(25)->get($url);

        return $this->decodeJsonResponse($response, $path);
    }

    private function postApi(ShopeeAccount $account, string $path, array $body = [], int $timeout = 25): array
    {
        $account = $this->ensureConnectedAccount($account);
        $url = $this->buildSignedUrl($account, $path);

        $response = Http::timeout($timeout)->asJson()->post($url, $body);

        return $this->decodeJsonResponse($response, $path);
    }

    private function postBinaryApi(ShopeeAccount $account, string $path, array $body = [], int $timeout = 40): Response
    {
        $account = $this->ensureConnectedAccount($account);
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
                default => throw new RuntimeException('Tidak ada metode pengiriman yang tersedia dari Shopee untuk pesanan ini.'),
            },
        };

        if ($chosenMethod === 'pickup') {
            if (empty($addressList)) {
                throw new RuntimeException('Alamat penjemputan (pickup) belum diatur pada akun Seller Centre Shopee.');
            }

            $selectedAddress = $this->pickDefaultAddress($addressList, $sharedOptions['address_id'] ?? null);
            $timeSlots = is_array($selectedAddress['time_slot_list'] ?? null) ? $selectedAddress['time_slot_list'] : [];
            $pickupTimeId = $sharedOptions['pickup_time_id'] ?? ($timeSlots[0]['pickup_time_id'] ?? null);

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
     * @param  array<int, ShopeeOrder>  $orders
     * @return array<int, array<string, string>>
     */
    private function buildWaybillOrderList(array $orders, bool $includeType, bool $includeTracking): array
    {
        return array_values(array_map(
            function (ShopeeOrder $order) use ($includeType, $includeTracking): array {
                return $this->filterNonEmpty([
                    'order_sn'               => $order->order_sn,
                    'package_number'         => $order->package_number ?: null,
                    'tracking_number'        => $includeTracking ? ($order->tracking_number ?: null) : null,
                    'shipping_document_type' => $includeType ? self::WAYBILL_DOCUMENT_TYPE : null,
                ]);
            },
            $orders
        ));
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

    private function formatCancelByLabel(?string $rawCancelBy): ?string
    {
        if ($rawCancelBy === null) {
            return null;
        }
        $trimmed = trim($rawCancelBy);
        if ($trimmed === '') {
            return null;
        }

        return match (strtolower($trimmed)) {
            'buyer', 'pembeli'               => 'Pembeli',
            'seller', 'penjual'              => 'Penjual',
            'shopee', 'system', 'sistem shopee' => 'Sistem Shopee',
            default                          => ucfirst($trimmed),
        };
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function filterNonEmpty(array $data): array
    {
        return array_filter($data, static fn ($value): bool => $value !== null && $value !== '');
    }
}
