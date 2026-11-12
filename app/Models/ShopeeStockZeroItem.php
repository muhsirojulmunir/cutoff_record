<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopeeStockZeroItem extends Model
{
    use HasFactory;

    protected $table = 'shopee_stock_zero_items';

    protected $fillable = [
        'batch_id',
        'shopee_account_id',
        'shopee_product_id',
        'item_id',
        'model_id',
        'item_name',
        'model_name',
        'sku',
        'previous_stock',
        'previous_reserved_stock',
        'previous_locked_campaign_qty',
        'previous_was_campaign_locked',
        'zeroed_stock',
        'status',
        'error_message',
        'restored_by',
        'restored_by_name',
        'restored_at',
    ];

    protected $casts = [
        'batch_id'                     => 'integer',
        'shopee_account_id'            => 'integer',
        'shopee_product_id'            => 'integer',
        'item_id'                      => 'integer',
        'model_id'                     => 'integer',
        'previous_stock'               => 'integer',
        'previous_reserved_stock'      => 'integer',
        'previous_locked_campaign_qty' => 'integer',
        'previous_was_campaign_locked' => 'boolean',
        'zeroed_stock'                 => 'integer',
        'restored_by'                  => 'integer',
        'restored_at'                  => 'datetime',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ShopeeStockZeroBatch::class, 'batch_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(ShopeeProduct::class, 'shopee_product_id');
    }
}

