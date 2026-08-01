<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceProductMapping extends Model
{
    protected $fillable = [
        'marketplace_account_id',
        'marketplace',
        'external_product_id',
        'external_sku',
        'product_id',
        'external_product_name',
        'status',
        'created_by',
    ];

    public const STATUSES = ['active', 'inactive'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class, 'marketplace_account_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
