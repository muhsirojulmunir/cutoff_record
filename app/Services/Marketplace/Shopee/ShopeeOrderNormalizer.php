<?php

namespace App\Services\Marketplace\Shopee;

use App\DTOs\Marketplace\NormalizedMarketplaceOrder;
use App\Models\MarketplaceAccount;
use App\Services\Marketplace\Normalizers\MarketplaceOrderPayloadNormalizer;

class ShopeeOrderNormalizer implements MarketplaceOrderPayloadNormalizer
{
    private const STATUS_MAP = [
        'UNPAID'        => 'pending',
        'READY_TO_SHIP' => 'processing',
        'PROCESSED'     => 'processing',
        'SHIPPED'       => 'shipped',
        'COMPLETED'     => 'completed',
        'CANCELLED'     => 'cancelled',
        'IN_CANCEL'     => 'cancelled',
        'TO_RETURN'     => 'returned',
    ];

    public function normalize(MarketplaceAccount $account, array $rawOrder): NormalizedMarketplaceOrder
    {
        $orderSn = $rawOrder['order_sn'] ?? $rawOrder['external_order_id'] ?? '';
        $orderStatus = strtoupper($rawOrder['order_status'] ?? 'UNPAID');
        $internalStatus = self::STATUS_MAP[$orderStatus] ?? 'pending';

        $recipient = $rawOrder['recipient_address'] ?? [];

        $subtotal    = (float) ($rawOrder['total_amount'] ?? 0);
        $discount    = (float) ($rawOrder['seller_discount'] ?? $rawOrder['discount'] ?? 0);
        $voucher     = (float) ($rawOrder['voucher_from_seller'] ?? 0);
        $shippingFee = (float) ($rawOrder['actual_shipping_fee'] ?? $rawOrder['shipping_fee'] ?? 0);
        $serviceFee  = (float) ($rawOrder['service_fee'] ?? 0);
        $tax         = (float) ($rawOrder['tax_amount'] ?? $rawOrder['tax'] ?? 0);

        $totalAmount = $subtotal - $discount - $voucher + $shippingFee + $serviceFee + $tax;
        if ($totalAmount < 0) {
            $totalAmount = (float) ($rawOrder['total_amount'] ?? 0);
        }

        $items = [];
        $itemList = $rawOrder['item_list'] ?? $rawOrder['items'] ?? [];
        foreach ($itemList as $item) {
            $items[] = [
                'external_item_id'    => (string) ($item['item_id'] ?? $item['external_item_id'] ?? ''),
                'external_product_id' => (string) ($item['model_id'] ?? $item['external_product_id'] ?? ''),
                'external_sku'        => (string) ($item['item_sku'] ?? $item['model_sku'] ?? $item['external_sku'] ?? ''),
                'product_name'        => (string) ($item['item_name'] ?? $item['product_name'] ?? 'Shopee Product'),
                'variation_name'      => (string) ($item['model_name'] ?? $item['variation_name'] ?? ''),
                'quantity'            => (int) ($item['model_quantity_purchased'] ?? $item['quantity'] ?? 1),
                'unit_price'          => (float) ($item['model_discounted_price'] ?? $item['model_original_price'] ?? $item['unit_price'] ?? 0),
                'discount'            => (float) ($item['discount'] ?? 0),
                'subtotal'            => (float) ($item['subtotal'] ?? (($item['model_discounted_price'] ?? 0) * ($item['model_quantity_purchased'] ?? 1))),
                'raw_payload'         => $item,
            ];
        }

        $orderDateStr = isset($rawOrder['create_time'])
            ? date('Y-m-d H:i:s', $rawOrder['create_time'])
            : ($rawOrder['order_date'] ?? now()->toDateTimeString());

        $paidAt = isset($rawOrder['pay_time']) ? date('Y-m-d H:i:s', $rawOrder['pay_time']) : null;
        $shippedAt = isset($rawOrder['ship_time']) ? date('Y-m-d H:i:s', $rawOrder['ship_time']) : null;
        $completedAt = isset($rawOrder['completion_time']) ? date('Y-m-d H:i:s', $rawOrder['completion_time']) : null;
        $cancelledAt = isset($rawOrder['cancel_time']) ? date('Y-m-d H:i:s', $rawOrder['cancel_time']) : null;

        return new NormalizedMarketplaceOrder(
            platform: 'shopee',
            marketplaceAccountId: $account->id,
            externalOrderId: $orderSn,
            externalOrderNumber: $rawOrder['order_sn'] ?? null,
            orderStatus: $orderStatus,
            internalStatus: $internalStatus,
            customerName: $recipient['name'] ?? $rawOrder['customer_name'] ?? 'Shopee Buyer',
            customerPhone: $recipient['phone'] ?? $rawOrder['customer_phone'] ?? null,
            customerEmail: $rawOrder['customer_email'] ?? null,
            shippingAddress: $recipient['full_address'] ?? $rawOrder['shipping_address'] ?? null,
            province: $recipient['state'] ?? $rawOrder['province'] ?? null,
            city: $recipient['city'] ?? $rawOrder['city'] ?? null,
            district: $recipient['district'] ?? $rawOrder['district'] ?? null,
            postalCode: $recipient['zipcode'] ?? $rawOrder['postal_code'] ?? null,
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
            courierName: $rawOrder['shipping_carrier'] ?? $rawOrder['courier_name'] ?? null,
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
