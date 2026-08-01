<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketplaceOrder extends Model
{
    protected $fillable = [
        'marketplace_account_id',
        'marketplace',
        'external_order_id',
        'external_order_number',
        'order_status',
        'internal_status',
        'workflow_status',
        'payment_status',
        'fulfillment_status',
        'customer_name',
        'customer_phone',
        'customer_email',
        'shipping_address',
        'province',
        'city',
        'district',
        'postal_code',
        'subtotal',
        'discount',
        'voucher_discount',
        'shipping_fee',
        'service_fee',
        'tax',
        'total_amount',
        'tracking_number',
        'courier_name',
        'order_date',
        'paid_at',
        'shipped_at',
        'completed_at',
        'cancelled_at',
        'synced_at',
        'sales_order_id',
        'warehouse_id',
        'converted_at',
        'conversion_status',
        'raw_payload',
    ];

    protected $casts = [
        'subtotal'          => 'decimal:2',
        'discount'          => 'decimal:2',
        'voucher_discount'  => 'decimal:2',
        'shipping_fee'      => 'decimal:2',
        'service_fee'       => 'decimal:2',
        'tax'               => 'decimal:2',
        'total_amount'      => 'decimal:2',
        'order_date'        => 'datetime',
        'paid_at'           => 'datetime',
        'shipped_at'        => 'datetime',
        'completed_at'      => 'datetime',
        'cancelled_at'      => 'datetime',
        'synced_at'         => 'datetime',
        'converted_at'      => 'datetime',
        'raw_payload'       => 'array',
    ];

    /**
     * Normalized internal statuses.
     */
    public const INTERNAL_STATUSES = [
        'pending', 'paid', 'processing', 'shipped',
        'completed', 'cancelled', 'returned', 'failed',
    ];

    /**
     * Workflow statuses.
     */
    public const WORKFLOW_STATUSES = [
        'pending', 'ready_to_process', 'converted_to_so', 'stock_reserved',
        'processing', 'shipped', 'completed', 'cancelled', 'failed',
        'stock_insufficient', 'mapping_required',
    ];

    /**
     * Conversion statuses.
     */
    public const CONVERSION_STATUSES = ['not_converted', 'ready', 'converted', 'failed'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class, 'marketplace_account_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(MarketplaceOrderItem::class);
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function stockReservations(): HasMany
    {
        return $this->hasMany(StockReservation::class);
    }

    /**
     * Check if all items have a mapped product_id.
     */
    public function allItemsMapped(): bool
    {
        return $this->items()->whereNull('product_id')->doesntExist();
    }

    /**
     * Check if this order can be converted to a Sales Order.
     */
    public function canConvert(): bool
    {
        return $this->conversion_status !== 'converted'
            && $this->internal_status !== 'cancelled'
            && $this->allItemsMapped()
            && $this->items()->count() > 0;
    }
}
