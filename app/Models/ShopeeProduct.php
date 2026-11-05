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
        'manual_item_code',
        'stock',
        'reserved_stock',
        'locked_campaign_qty',
        'was_campaign_locked',
        'price',
        'item_status',
        'has_model',
        'last_synced_at',
        'raw_data',
    ];

    protected $casts = [
        'item_id'        => 'integer',
        'model_id'       => 'integer',
        'stock'               => 'integer',
        'reserved_stock'      => 'integer',
        'locked_campaign_qty' => 'integer',
        'was_campaign_locked' => 'boolean',
        'price'               => 'decimal:2',
        'has_model'      => 'boolean',
        'last_synced_at' => 'datetime',
        'raw_data'       => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(ShopeeAccount::class, 'shopee_account_id');
    }
}

