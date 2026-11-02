<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TiktokAccount extends Model
{
    use HasFactory;

    protected $table = 'tiktok_accounts';

    protected $fillable = [
        'account_name',
        'app_key',
        'app_secret',
        'service_id',
        'shop_id',
        'shop_cipher',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'refresh_expires_at',
        'status',
        'connection_status',
        'last_synced_at',
        'last_sync_status',
        'last_sync_error',
        'created_by',
    ];

    protected $hidden = [
        'app_secret',
        'access_token',
        'refresh_token',
        'shop_cipher',
    ];

    protected $casts = [
        'token_expires_at'   => 'datetime',
        'refresh_expires_at' => 'datetime',
        'last_synced_at'     => 'datetime',
        'app_secret'         => 'encrypted',
        'access_token'       => 'encrypted',
        'refresh_token'      => 'encrypted',
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
        unset($arr['app_secret'], $arr['access_token'], $arr['refresh_token'], $arr['shop_cipher']);
        $arr['has_credentials'] = ! empty($this->app_key) && ! empty($this->app_secret);
        $arr['has_tokens']      = ! empty($this->access_token);
        return $arr;
    }
}

