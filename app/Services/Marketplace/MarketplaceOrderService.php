<?php

namespace App\Services\Marketplace;

use App\DTOs\Marketplace\NormalizedMarketplaceOrder;
use App\Models\Customer;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrder;
use App\Models\MarketplaceOrderItem;
use App\Models\MarketplaceProductMapping;
use App\Services\SalesOrderService;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class MarketplaceOrderService
{
    public function __construct(private readonly SalesOrderService $salesOrderService) {}

    /**
     * Ingest order from NormalizedMarketplaceOrder DTO into marketplace_orders table.
     * Idempotent: same (marketplace_account_id, external_order_id) will update, not duplicate.
     */
    public function createOrUpdateFromNormalized(NormalizedMarketplaceOrder $dto): MarketplaceOrder
    {
        return DB::transaction(function () use ($dto) {
            $data = $dto->toArray();

            $order = MarketplaceOrder::updateOrCreate(
                [
                    'marketplace_account_id' => $dto->marketplaceAccountId,
                    'external_order_id'      => $dto->externalOrderId,
                ],
                $data
            );

            // Sync items if provided
            if (! empty($dto->items)) {
                $this->syncItems($order, $dto->items, $dto->marketplaceAccountId);
            }

            // Auto mapping check
            $this->updateItemMappings($order);

            // Refresh conversion status
            $this->refreshConversionStatus($order);

            return $order->fresh();
        });
    }

    /**
     * Legacy/Generic payload ingestion helper (delegates to Shopee or TikTok normalizers).
     */
    public function createOrUpdateFromPayload(
        MarketplaceAccount $account,
        array $payload,
        array $items = []
    ): MarketplaceOrder {
        if (! $account->isActive()) {
            throw new InvalidArgumentException("Akun marketplace '{$account->account_name}' tidak aktif.");
        }

        // If items are passed separately in array format
        if (! empty($items) && ! isset($payload['items'])) {
            $payload['items'] = $items;
        }

        $normalizer = $account->marketplace === 'shopee'
            ? new \App\Services\Marketplace\Shopee\ShopeeOrderNormalizer()
            : new \App\Services\Marketplace\TikTok\TikTokOrderNormalizer();

        $dto = $normalizer->normalize($account, $payload);
        return $this->createOrUpdateFromNormalized($dto);
    }

    /**
     * Sync order items (replace all if not converted).
     */
    private function syncItems(MarketplaceOrder $order, array $items, int $accountId): void
    {
        if ($order->conversion_status === 'converted') {
            return;
        }

        $order->items()->delete();

        foreach ($items as $item) {
            $externalSku = $item['external_sku'] ?? null;
            $productId   = null;

            if ($externalSku) {
                $mapping = MarketplaceProductMapping::where('marketplace_account_id', $accountId)
                    ->where('external_sku', $externalSku)
                    ->where('status', 'active')
                    ->first();

                if ($mapping) {
                    $productId = $mapping->product_id;
                }
            }

            $order->items()->create([
                'external_item_id'    => $item['external_item_id'] ?? null,
                'external_product_id' => $item['external_product_id'] ?? null,
                'external_sku'        => $externalSku,
                'product_id'          => $productId,
                'product_name'        => $item['product_name'] ?? 'Marketplace Item',
                'product_sku'         => $item['product_sku'] ?? null,
                'quantity'            => $item['quantity'] ?? 1,
                'unit_price'          => $item['unit_price'] ?? 0,
                'discount'            => $item['discount'] ?? 0,
                'tax'                 => $item['tax'] ?? 0,
                'subtotal'            => $item['subtotal'] ?? 0,
                'raw_payload'         => $item['raw_payload'] ?? null,
            ]);
        }
    }

    /**
     * Re-scan items and update product_id from active mappings.
     */
    public function updateItemMappings(MarketplaceOrder $order): void
    {
        $order->items()->whereNull('product_id')->each(function (MarketplaceOrderItem $item) use ($order) {
            if (! $item->external_sku) {
                return;
            }

            $mapping = MarketplaceProductMapping::where('marketplace_account_id', $order->marketplace_account_id)
                ->where('external_sku', $item->external_sku)
                ->where('status', 'active')
                ->first();

            if ($mapping) {
                $item->update(['product_id' => $mapping->product_id]);
            }
        });
    }

    /**
     * Update conversion_status based on item mapping state.
     */
    public function refreshConversionStatus(MarketplaceOrder $order): void
    {
        if ($order->conversion_status === 'converted') {
            return;
        }

        $status = $order->allItemsMapped() && $order->items()->count() > 0
            ? 'ready'
            : 'not_converted';

        $order->update(['conversion_status' => $status]);
    }

    /**
     * Convert a Marketplace Order to a Sales Order.
     * Uses pessimistic locking and DB transaction to prevent duplicate conversion.
     */
    public function convertToSalesOrder(MarketplaceOrder $order, int $userId): MarketplaceOrder
    {
        return DB::transaction(function () use ($order, $userId) {
            $locked = MarketplaceOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();

            if ($locked->conversion_status === 'converted') {
                throw new InvalidArgumentException('Order marketplace ini sudah pernah dikonversi menjadi Sales Order.');
            }

            if ($locked->internal_status === 'cancelled') {
                throw new InvalidArgumentException('Order yang dibatalkan tidak dapat dikonversi.');
            }

            if (! $locked->allItemsMapped()) {
                throw new InvalidArgumentException('Semua item order harus memiliki mapping produk internal sebelum dapat dikonversi.');
            }

            if ($locked->items()->count() === 0) {
                throw new InvalidArgumentException('Order tidak memiliki item.');
            }

            // Resolve or create Customer
            $customer = $this->resolveCustomer($locked, $userId);

            // Build items data for SalesOrderService
            $itemsData = [];
            foreach ($locked->items as $item) {
                $itemsData[] = [
                    'product_id'      => $item->product_id,
                    'quantity'        => $item->quantity,
                    'price'           => (float) $item->unit_price,
                    'discount_amount' => (float) $item->discount,
                    'tax_amount'      => (float) $item->tax,
                ];
            }

            // Create Sales Order via SalesOrderService
            $salesOrder = $this->salesOrderService->create([
                'customer_id'     => $customer->id,
                'order_date'      => $locked->order_date->toDateString(),
                'source'          => 'marketplace',
                'sales_channel'   => $locked->marketplace,
                'discount_amount' => (float) $locked->discount,
                'tax_amount'      => (float) $locked->tax,
                'shipping_cost'   => (float) $locked->shipping_fee,
                'items'           => $itemsData,
                'notes'           => "Converted from Marketplace Order #{$locked->external_order_id}",
            ], $userId);

            // Mark as converted
            $locked->update([
                'sales_order_id'    => $salesOrder->id,
                'converted_at'      => now(),
                'conversion_status' => 'converted',
            ]);

            return $locked->fresh();
        });
    }

    /**
     * Find or create a Customer based on marketplace order customer data.
     */
    private function resolveCustomer(MarketplaceOrder $order, int $userId): Customer
    {
        $customer = null;

        if ($order->customer_phone) {
            $customer = Customer::where('phone', $order->customer_phone)->first();
        }

        if (! $customer && $order->customer_email) {
            $customer = Customer::where('email', $order->customer_email)->first();
        }

        if ($customer) {
            return $customer;
        }

        $code = $this->generateCustomerCode();

        return Customer::create([
            'customer_code' => $code,
            'name'          => $order->customer_name ?? 'Pelanggan Marketplace',
            'phone'         => $order->customer_phone ?? null,
            'email'         => $order->customer_email ?? null,
            'address'       => $order->shipping_address ?? null,
            'status'        => 'active',
            'created_by'    => $userId,
        ]);
    }

    private function generateCustomerCode(): string
    {
        $last = Customer::withTrashed()
            ->where('customer_code', 'like', 'CUST-%')
            ->lockForUpdate()
            ->orderByDesc('id')
            ->first();

        $next = $last
            ? (int) substr($last->customer_code, 5) + 1
            : 1;

        return 'CUST-' . str_pad($next, 4, '0', STR_PAD_LEFT);
    }
}
