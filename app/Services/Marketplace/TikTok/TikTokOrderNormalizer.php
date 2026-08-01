<?php

namespace App\Services\Marketplace\TikTok;

use App\DTOs\Marketplace\NormalizedMarketplaceOrder;
use App\Models\MarketplaceAccount;
use App\Services\Marketplace\Normalizers\MarketplaceOrderPayloadNormalizer;

class TikTokOrderNormalizer implements MarketplaceOrderPayloadNormalizer
{
    private const STATUS_MAP = [
        'UNPAID'             => 'pending',
        'AWAITING_SHIPMENT'  => 'processing',
        'AWAITING_COLLECTION'=> 'processing',
        'IN_TRANSIT'         => 'shipped',
        'DELIVERED'          => 'completed',
        'COMPLETED'          => 'completed',
        'CANCELLED'          => 'cancelled',
        'REFUND_PENDING'     => 'returned',
    ];

    public function normalize(MarketplaceAccount $account, array $rawOrder): NormalizedMarketplaceOrder
    {
        $orderId = (string) ($rawOrder['id'] ?? $rawOrder['order_id'] ?? $rawOrder['external_order_id'] ?? '');
        $orderStatus = strtoupper((string) ($rawOrder['status'] ?? $rawOrder['order_status'] ?? 'UNPAID'));
        $internalStatus = self::STATUS_MAP[$orderStatus] ?? 'pending';

        $recipient = $rawOrder['recipient_address'] ?? $rawOrder['shipping_address'] ?? [];
        $payment   = $rawOrder['payment'] ?? [];

        $subtotal    = (float) ($payment['subtotal'] ?? $rawOrder['subtotal'] ?? 0);
        $discount    = (float) ($payment['seller_discount'] ?? $rawOrder['discount'] ?? 0);
        $voucher     = (float) ($payment['platform_discount'] ?? 0);
        $shippingFee = (float) ($payment['shipping_fee'] ?? $rawOrder['shipping_fee'] ?? 0);
        $serviceFee  = (float) ($payment['small_order_fee'] ?? 0);
        $tax         = (float) ($payment['tax'] ?? $rawOrder['tax'] ?? 0);
        $totalAmount = (float) ($payment['total_amount'] ?? $rawOrder['total_amount'] ?? 0);

        $items = [];
        $itemList = $rawOrder['item_list'] ?? $rawOrder['items'] ?? $rawOrder['line_items'] ?? [];
        foreach ($itemList as $item) {
            $items[] = [
                'external_item_id'    => (string) ($item['id'] ?? $item['item_id'] ?? ''),
                'external_product_id' => (string) ($item['product_id'] ?? $item['external_product_id'] ?? ''),
                'external_sku'        => (string) ($item['seller_sku'] ?? $item['sku_id'] ?? $item['external_sku'] ?? ''),
                'product_name'        => (string) ($item['product_name'] ?? 'TikTok Shop Product'),
                'variation_name'      => (string) ($item['sku_name'] ?? $item['variation_name'] ?? ''),
                'quantity'            => (int) ($item['quantity'] ?? 1),
                'unit_price'          => (float) ($item['sku_sale_price'] ?? $item['unit_price'] ?? 0),
                'discount'            => (float) ($item['sku_seller_discount'] ?? $item['discount'] ?? 0),
                'subtotal'            => (float) ($item['sku_sale_price'] ?? 0) * (int) ($item['quantity'] ?? 1),
                'raw_payload'         => $item,
            ];
        }

        $createTime = $rawOrder['create_time'] ?? null;
        $orderDateStr = $createTime
            ? (is_numeric($createTime) ? date('Y-m-d H:i:s', (int) $createTime) : $createTime)
            : ($rawOrder['order_date'] ?? now()->toDateTimeString());

        $paidAt = isset($rawOrder['paid_time']) ? date('Y-m-d H:i:s', (int) $rawOrder['paid_time']) : null;
        $shippedAt = isset($rawOrder['rts_time']) ? date('Y-m-d H:i:s', (int) $rawOrder['rts_time']) : null;
        $completedAt = isset($rawOrder['delivery_time']) ? date('Y-m-d H:i:s', (int) $rawOrder['delivery_time']) : null;
        $cancelledAt = isset($rawOrder['cancel_time']) ? date('Y-m-d H:i:s', (int) $rawOrder['cancel_time']) : null;

        return new NormalizedMarketplaceOrder(
            platform: 'tiktok_shop',
            marketplaceAccountId: $account->id,
            externalOrderId: $orderId,
            externalOrderNumber: $rawOrder['order_id'] ?? null,
            orderStatus: $orderStatus,
            internalStatus: $internalStatus,
            customerName: is_array($recipient) ? ($recipient['name'] ?? $recipient['full_name'] ?? 'TikTok Buyer') : 'TikTok Buyer',
            customerPhone: is_array($recipient) ? ($recipient['phone_number'] ?? $recipient['phone'] ?? null) : null,
            customerEmail: $rawOrder['buyer_email'] ?? null,
            shippingAddress: is_array($recipient) ? ($recipient['address_detail'] ?? $recipient['full_address'] ?? null) : null,
            province: is_array($recipient) ? ($recipient['state'] ?? $recipient['province'] ?? null) : null,
            city: is_array($recipient) ? ($recipient['city'] ?? null) : null,
            district: is_array($recipient) ? ($recipient['district'] ?? null) : null,
            postalCode: is_array($recipient) ? ($recipient['zipcode'] ?? $recipient['postal_code'] ?? null) : null,
            subtotal: $subtotal,
            discount: $discount,
            voucherDiscount: $voucher,
            shippingFee: $shippingFee,
            serviceFee: $serviceFee,
            tax: $tax,
            totalAmount: $totalAmount,
            paymentStatus: $paidAt ? 'paid' : 'unpaid',
            fulfillmentStatus: $shippedAt ? 'shipped' : 'unfulfilled',
            trackingNumber: $rawOrder['tracking_number'] ?? $rawOrder['tracking_no'] ?? null,
            courierName: $rawOrder['shipping_provider'] ?? $rawOrder['courier_name'] ?? null,
            orderDate: $orderDateStr,
            paidAt: $paidAt,
            shippedAt: $shippedAt,
            completedAt: $completedAt,
            cancelledAt: $cancelledAt,
            items: $items,
            rawPayload: $rawOrder,
        );
    }
}
