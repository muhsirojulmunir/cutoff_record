<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceItem extends Model
{
    protected $fillable = [
        'invoice_id',
        'product_id',
        'product_name',
        'sku',
        'quantity',
        'unit',
        'unit_price',
        'discount_amount',
        'tax_amount',
        'subtotal',
    ];

    protected $casts = [
        'quantity'        => 'integer',
        'unit_price'      => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount'      => 'decimal:2',
        'subtotal'        => 'decimal:2',
    ];

    /**
     * Get the invoice that owns the item.
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /**
     * Get the product associated with the invoice item.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
