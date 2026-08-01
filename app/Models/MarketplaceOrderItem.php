<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceOrderItem extends Model
{
    protected $fillable = [
        'marketplace_order_id',
        'external_item_id',
        'external_product_id',
        'external_sku',
        'product_id',
        'product_name',
        'product_sku',
        'quantity',
        'unit_price',
        'discount',
        'tax',
        'subtotal',
        'raw_payload',
    ];

    protected $casts = [
        'quantity'    => 'integer',
        'unit_price'  => 'decimal:2',
        'discount'    => 'decimal:2',
        'tax'         => 'decimal:2',
        'subtotal'    => 'decimal:2',
        'raw_payload' => 'array',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(MarketplaceOrder::class, 'marketplace_order_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function isMapped(): bool
    {
        return $this->product_id !== null;
    }
}
