<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceSyncLog extends Model
{
    protected $fillable = [
        'marketplace_account_id',
        'marketplace',
        'sync_type',
        'status',
        'started_at',
        'completed_at',
        'records_fetched',
        'records_created',
        'records_updated',
        'records_skipped',
        'records_failed',
        'error_message',
        'metadata',
        'created_by',
    ];

    protected $casts = [
        'started_at'      => 'datetime',
        'completed_at'    => 'datetime',
        'records_fetched' => 'integer',
        'records_created' => 'integer',
        'records_updated' => 'integer',
        'records_skipped' => 'integer',
        'records_failed'  => 'integer',
        'metadata'        => 'array',
    ];

    public const SYNC_TYPES = ['orders', 'products', 'inventory', 'shipments'];
    public const STATUSES   = ['running', 'success', 'partial', 'failed'];

    public function account(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class, 'marketplace_account_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }
}
