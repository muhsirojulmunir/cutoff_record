<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopeeProduct extends Model
{
    use HasFactory;

    protected $fillable = [
        'shopee_account_id',
        'item_id',
        'model_id',
        'item_name',
        'model_name',
        'sku',
        'stock',
        'reserved_stock',
        'price',
        'item_status',
        'has_model',
        'last_synced_at',
        'raw_data',
    ];

    protected $casts = [
        'item_id'        => 'integer',
        'model_id'       => 'integer',
        'stock'          => 'integer',
        'reserved_stock' => 'integer',
        'price'          => 'decimal:2',
        'has_model'      => 'boolean',
        'last_synced_at' => 'datetime',
        'raw_data'       => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(ShopeeAccount::class, 'shopee_account_id');
    }
}

