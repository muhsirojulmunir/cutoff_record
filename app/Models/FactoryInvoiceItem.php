<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FactoryInvoiceItem extends Model
{
    protected $fillable = [
        'factory_invoice_id',
        'product_id',
        'product_code',
        'product_name',
        'quantity',
        'unit',
        'unit_price',
        'discount_amount',
        'tax_amount',
        'subtotal',
        'notes',
    ];

    protected $casts = [
        'unit_price'      => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount'      => 'decimal:2',
        'subtotal'        => 'decimal:2',
    ];

    public function factoryInvoice(): BelongsTo
    {
        return $this->belongsTo(FactoryInvoice::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
