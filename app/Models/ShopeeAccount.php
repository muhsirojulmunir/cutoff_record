<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopeeAccount extends Model
{
    use HasFactory;

    protected $table = 'shopee_accounts';

    protected $fillable = [
        'account_name',
        'shop_id',
        'partner_id',
        'partner_key',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'status',
        'connection_status',
        'last_synced_at',
        'last_sync_status',
        'last_sync_error',
        'created_by',
    ];

    protected $hidden = [
        'partner_key',
        'access_token',
        'refresh_token',
    ];

    protected $casts = [
        'token_expires_at' => 'datetime',
        'last_synced_at'   => 'datetime',
        'partner_key'      => 'encrypted',
        'access_token'     => 'encrypted',
        'refresh_token'    => 'encrypted',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isConnected(): bool
    {
        return $this->connection_status === 'connected';
    }

    public function toSafeArray(): array
    {
        $arr = $this->toArray();
        unset($arr['partner_key'], $arr['access_token'], $arr['refresh_token']);
        $arr['has_credentials'] = ! empty($this->partner_id) && ! empty($this->partner_key);
        $arr['has_tokens']      = ! empty($this->access_token);
        return $arr;
    }
}
