<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class MarketplaceAccount extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'marketplace',
        'account_name',
        'shop_id',
        'shop_name',
        'external_account_id',
        'status',
        'credentials_status',
        'connection_status',
        'last_synced_at',
        'token_expires_at',
        'last_connected_at',
        'last_sync_status',
        'last_sync_error',
        'settings',
        'credentials',
        'created_by',
    ];

    protected $hidden = [
        'credentials', // Never serialize tokens to JSON/Inertia
    ];

    protected $casts = [
        'settings'          => 'encrypted:array',
        'credentials'       => 'encrypted:array',
        'last_synced_at'    => 'datetime',
        'token_expires_at'  => 'datetime',
        'last_connected_at' => 'datetime',
    ];

    /**
     * Valid marketplace providers.
     */
    public const MARKETPLACES = ['shopee', 'tiktok_shop'];

    /**
     * Valid account statuses.
     */
    public const STATUSES = ['active', 'inactive', 'error'];

    /**
     * Valid connection statuses.
     */
    public const CONNECTION_STATUSES = ['connected', 'disconnected', 'expired', 'error'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function orders(): HasMany
    {
        return $this->hasMany(MarketplaceOrder::class);
    }

    public function productMappings(): HasMany
    {
        return $this->hasMany(MarketplaceProductMapping::class);
    }

    public function syncLogs(): HasMany
    {
        return $this->hasMany(MarketplaceSyncLog::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isConnected(): bool
    {
        return $this->connection_status === 'connected';
    }

    /**
     * Get safe array representation for frontend (masking sensitive tokens).
     */
    public function toSafeArray(): array
    {
        $arr = $this->toArray();
        unset($arr['credentials'], $arr['settings']);

        $arr['has_credentials'] = ! empty($this->credentials);
        return $arr;
    }
}
