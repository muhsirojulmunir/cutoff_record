<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    protected $fillable = [
        'purchase_order_id',
        'product_id',
        'product_code',
        'product_name',
        'quantity',
        'unit',
        'unit_price',
        'subtotal',
        'received_quantity',
        // Finance validation fields
        'accepted_quantity',
        'rejected_quantity',
        'action_taken',
        'rejected_reason',
        'validated_unit_price',
        'validated_total_price',
    ];

    protected $casts = [
        'quantity'              => 'integer',
        'unit_price'            => 'decimal:2',
        'subtotal'              => 'decimal:2',
        'received_quantity'     => 'integer',
        'accepted_quantity'     => 'integer',
        'rejected_quantity'     => 'integer',
        'validated_unit_price'  => 'decimal:2',
        'validated_total_price' => 'decimal:2',
    ];

    /**
     * Get the purchase order that owns the item.
     */
    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    /**
     * Get the product that owns the item.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
