<?php

namespace App\DTOs\Marketplace;

class NormalizedMarketplaceOrder
{
    public function __construct(
        public string $platform,
        public int $marketplaceAccountId,
        public string $externalOrderId,
        public ?string $externalOrderNumber,
        public string $orderStatus,
        public string $internalStatus,
        public ?string $customerName,
        public ?string $customerPhone,
        public ?string $customerEmail,
        public ?string $shippingAddress,
        public ?string $province,
        public ?string $city,
        public ?string $district,
        public ?string $postalCode,
        public float $subtotal,
        public float $discount,
        public float $voucherDiscount,
        public float $shippingFee,
        public float $serviceFee,
        public float $tax,
        public float $totalAmount,
        public ?string $paymentStatus,
        public ?string $fulfillmentStatus,
        public ?string $trackingNumber,
        public ?string $courierName,
        public string $orderDate,
        public ?string $paidAt = null,
        public ?string $shippedAt = null,
        public ?string $completedAt = null,
        public ?string $cancelledAt = null,
        public array $items = [],
        public ?array $rawPayload = null,
    ) {}

    public function toArray(): array
    {
        return [
            'marketplace_account_id' => $this->marketplaceAccountId,
            'marketplace'            => $this->platform,
            'external_order_id'      => $this->externalOrderId,
            'external_order_number'  => $this->externalOrderNumber,
            'order_status'           => $this->orderStatus,
            'internal_status'        => $this->internalStatus,
            'payment_status'         => $this->paymentStatus,
            'fulfillment_status'     => $this->fulfillmentStatus,
            'customer_name'          => $this->customerName,
            'customer_phone'         => $this->customerPhone,
            'customer_email'         => $this->customerEmail,
            'shipping_address'       => $this->shippingAddress,
            'province'               => $this->province,
            'city'                   => $this->city,
            'district'               => $this->district,
            'postal_code'            => $this->postalCode,
            'subtotal'               => $this->subtotal,
            'discount'               => $this->discount,
            'voucher_discount'       => $this->voucherDiscount,
            'shipping_fee'           => $this->shippingFee,
            'service_fee'            => $this->serviceFee,
            'tax'                    => $this->tax,
            'total_amount'           => $this->totalAmount,
            'tracking_number'        => $this->trackingNumber,
            'courier_name'           => $this->courierName,
            'order_date'             => $this->orderDate,
            'paid_at'                => $this->paidAt,
            'shipped_at'             => $this->shippedAt,
            'completed_at'           => $this->completedAt,
            'cancelled_at'           => $this->cancelledAt,
            'synced_at'              => now()->toDateTimeString(),
            'raw_payload'            => $this->rawPayload,
        ];
    }
}
