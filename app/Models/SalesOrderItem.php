<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesOrderItem extends Model
{
    protected $fillable = [
        'sales_order_id',
        'product_id',
        'sku',
        'product_name',
        'quantity',
        'unit',
        'price',
        'discount_amount',
        'tax_amount',
        'subtotal',
    ];

    protected $casts = [
        'price'           => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount'      => 'decimal:2',
        'subtotal'        => 'decimal:2',
        'quantity'        => 'integer',
    ];

    /**
     * Get the sales order that owns the item.
     */
    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class);
    }

    /**
     * Get the product associated with the item.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
