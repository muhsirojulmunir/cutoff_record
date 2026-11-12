<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShopeeStockZeroBatch extends Model
{
    use HasFactory;

    protected $table = 'shopee_stock_zero_batches';

    protected $fillable = [
        'shopee_account_id',
        'batch_code',
        'source',
        'note',
        'total_requested',
        'zeroed_count',
        'failed_count',
        'restored_count',
        'status',
        'zeroed_by',
        'zeroed_by_name',
        'zeroed_at',
        'restored_by',
        'restored_by_name',
        'restored_at',
    ];

    protected $casts = [
        'shopee_account_id' => 'integer',
        'total_requested'   => 'integer',
        'zeroed_count'      => 'integer',
        'failed_count'      => 'integer',
        'restored_count'    => 'integer',
        'zeroed_by'         => 'integer',
        'restored_by'       => 'integer',
        'zeroed_at'         => 'datetime',
        'restored_at'       => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(ShopeeStockZeroItem::class, 'batch_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ShopeeAccount::class, 'shopee_account_id');
    }
}

