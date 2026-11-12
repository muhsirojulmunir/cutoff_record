<?php

namespace App\Services;

use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ShopeeOrderRecorder
{
    private const SCHEMA_CACHE_KEY = 'shopee_orders_schema_exists_v1';

    private bool $schemaEnsured = false;

    public function resetSchemaCache(): void
    {
        $this->schemaEnsured = false;
        try {
            Cache::store('file')->forget(self::SCHEMA_CACHE_KEY);
        } catch (\Throwable) {
            // Abaikan error cache file
        }
    }

    /**
     * Pastikan tabel shopee_orders tersedia di database (aman untuk deploy tanpa shell).
     */
    public function ensureSchema(): void
    {
        if ($this->schemaEnsured) {
            return;
        }

        if (! app()->runningUnitTests()) {
            try {
                if (Cache::store('file')->get(self::SCHEMA_CACHE_KEY) === true) {
                    $this->schemaEnsured = true;
                    return;
                }
            } catch (\Throwable) {
                // Lanjutkan pengecekan langsung jika cache file gagal
            }
        }

        try {
            if (! Schema::hasTable('shopee_orders')) {
                Schema::create('shopee_orders', ShopeeOrder::buildSchemaCallback());
            }
            if (Schema::hasTable('shopee_orders')) {
                $this->schemaEnsured = true;
                if (! app()->runningUnitTests()) {
                    try {
                        Cache::store('file')->put(self::SCHEMA_CACHE_KEY, true, 86400);
                    } catch (\Throwable) {
                        // Abaikan error tulis cache file
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('ShopeeOrderRecorder ensureSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Simpan atau perbarui daftar detail pesanan Shopee ke tabel shopee_orders.
     * HANYA mengubah tabel lokal (tidak pernah memanggil API mutasi Shopee).
     *
     * @param  array<int, array<string, mixed>>  $detailedOrders
     * @return array{synced: int, changed: int}
     */
    public function upsertFromDetails(ShopeeAccount $account, array $detailedOrders): array
    {
        $this->ensureSchema();

        $orderSns = [];
        foreach ($detailedOrders as $order) {
            if (is_array($order) && ! empty($order['order_sn'])) {
                $orderSns[] = trim((string) $order['order_sn']);
            }
        }

        $orderSns = array_values(array_unique(array_filter($orderSns, static fn (string $sn): bool => $sn !== '')));
        if (empty($orderSns)) {
            return ['synced' => 0, 'changed' => 0];
        }

        $existingOrders = ShopeeOrder::where('shopee_account_id', $account->id)
            ->whereIn('order_sn', $orderSns)
            ->get()
            ->keyBy('order_sn');

        $syncedCount = 0;
        $changedCount = 0;

        DB::transaction(function () use ($account, $detailedOrders, $existingOrders, &$syncedCount, &$changedCount): void {
            $nowWib = now('Asia/Jakarta');

            foreach ($detailedOrders as $order) {
                if (! is_array($order)) {
                    continue;
                }

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

                $orderStatus = strtoupper(trim((string) ($order['order_status'] ?? 'READY_TO_SHIP')));
                if ($orderStatus === '') {
                    $orderStatus = $existing?->order_status ?? 'READY_TO_SHIP';
                }

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

                $shippingArrangedAt = $existing?->shipping_arranged_at?->format('Y-m-d H:i:s');
                if ($shippingArrangedAt === null && in_array($orderStatus, ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'], true)) {
                    $shippingArrangedAt = ! empty($order['update_time'])
                        ? Carbon::createFromTimestamp((int) $order['update_time'], 'Asia/Jakarta')->format('Y-m-d H:i:s')
                        : $nowWib->format('Y-m-d H:i:s');
                }

                $itemsNormalized = $this->normalizeItemsList($order, $packageList);
                $recipientData = is_array($order['recipient_address'] ?? null)
                    ? $order['recipient_address']
                    : $existing?->recipient_data;

                $attributes = [
                    'package_number'         => $packageNumber,
                    'order_status'           => $orderStatus,
                    'logistics_status'       => $logisticsStatus,
                    'shipping_carrier'       => $shippingCarrier,
                    'tracking_number'        => $trackingNumber,
                    'buyer_user_id'          => ! empty($order['buyer_user_id']) ? (int) $order['buyer_user_id'] : $existing?->buyer_user_id,
                    'buyer_username'         => ! empty($order['buyer_username']) ? (string) $order['buyer_username'] : $existing?->buyer_username,
                    'buyer_note'             => $buyerNote ?? $existing?->buyer_note,
                    'recipient_data'         => $recipientData,
                    'items_json'             => ! empty($itemsNormalized) ? $itemsNormalized : ($existing?->items_json ?? []),
                    'package_list_json'      => ! empty($packageList) ? $packageList : $existing?->package_list_json,
                    'payment_method'         => $rawPayment !== '' ? $rawPayment : ($isCod ? 'Cash on Delivery' : $existing?->payment_method),
                    'is_cod'                 => $isCod,
                    'total_amount'           => (float) ($order['total_amount'] ?? ($existing?->total_amount ?? 0)),
                    'estimated_shipping_fee' => (float) ($order['estimated_shipping_fee'] ?? ($existing?->estimated_shipping_fee ?? 0)),
                    'cancel_by'              => $cancelBy ?? $existing?->cancel_by,
                    'cancel_reason'          => $cancelReason ?? $existing?->cancel_reason,
                    'buyer_cancel_reason'    => $buyerCancelReason ?? $existing?->buyer_cancel_reason,
                    'order_created_at'       => $orderCreatedAt,
                    'ship_by_date'           => $shipByDate,
                    'shipping_arranged_at'   => $shippingArrangedAt,
                    'label_document_status'  => $existing?->label_document_status ?? 'NONE',
                    'label_print_count'      => $existing?->label_print_count ?? 0,
                    'raw_payload'            => json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'last_synced_at'         => $nowWib,
                ];

                $hasMeaningfulChange = $existing === null
                    || $existing->order_status !== $orderStatus
                    || (string) ($existing->logistics_status ?? '') !== (string) ($logisticsStatus ?? '')
                    || (string) ($existing->tracking_number ?? '') !== (string) ($trackingNumber ?? '')
                    || (string) ($existing->shipping_carrier ?? '') !== (string) ($shippingCarrier ?? '')
                    || (string) ($existing->cancel_by ?? '') !== (string) ($attributes['cancel_by'] ?? '')
                    || (string) ($existing->cancel_reason ?? '') !== (string) ($attributes['cancel_reason'] ?? '')
                    || (string) ($existing->buyer_cancel_reason ?? '') !== (string) ($attributes['buyer_cancel_reason'] ?? '');

                ShopeeOrder::updateOrCreate(
                    [
                        'shopee_account_id' => $account->id,
                        'order_sn'          => $orderSn,
                    ],
                    $attributes
                );

                $syncedCount++;
                if ($hasMeaningfulChange) {
                    $changedCount++;
                }
            }
        });

        return [
            'synced'  => $syncedCount,
            'changed' => $changedCount,
        ];
    }

    /**
     * Perbarui nomor resi hasil lookup get_tracking_number tanpa menyentuh field lain.
     *
     * @param  array<string, string>  $trackingBySn
     */
    public function applyTrackingNumbers(ShopeeAccount $account, array $trackingBySn): int
    {
        if (empty($trackingBySn)) {
            return 0;
        }

        $updated = 0;
        foreach ($trackingBySn as $orderSn => $trackingNumber) {
            $trimmedTracking = trim((string) $trackingNumber);
            if ($trimmedTracking === '') {
                continue;
            }

            $affected = ShopeeOrder::where('shopee_account_id', $account->id)
                ->where('order_sn', (string) $orderSn)
                ->where(function ($q) use ($trimmedTracking): void {
                    $q->whereNull('tracking_number')
                        ->orWhere('tracking_number', '')
                        ->orWhere('tracking_number', '!=', $trimmedTracking);
                })
                ->update([
                    'tracking_number' => $trimmedTracking,
                    'last_synced_at'  => now('Asia/Jakarta'),
                ]);

            if ($affected > 0) {
                $updated += $affected;
            }
        }

        return $updated;
    }

    /**
     * @param  array<string, mixed>  $order
     * @param  array<int, array<string, mixed>>  $packageList
     * @return array<int, array<string, mixed>>
     */
    public function normalizeItemsList(array $order, array $packageList): array
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

    public function formatCancelByLabel(?string $rawCancelBy): ?string
    {
        if ($rawCancelBy === null) {
            return null;
        }
        $trimmed = trim($rawCancelBy);
        if ($trimmed === '') {
            return null;
        }

        return match (strtolower($trimmed)) {
            'buyer', 'pembeli'                  => 'Pembeli',
            'seller', 'penjual'                 => 'Penjual',
            'shopee', 'system', 'sistem shopee' => 'Sistem Shopee',
            default                             => ucfirst($trimmed),
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $packageList
     */
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
}
