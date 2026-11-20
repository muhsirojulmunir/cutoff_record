<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class DownloadedWaybill extends Model
{
    use HasFactory;

    protected $table = 'downloaded_waybills';

    protected $fillable = [
        'channel',
        'file_name',
        'file_path',
        'file_size',
        'order_count',
        'order_sns',
        'downloaded_by',
        'downloaded_by_name',
        'downloaded_at',
        'expires_at',
    ];

    protected $casts = [
        'order_sns'     => 'array',
        'file_size'     => 'integer',
        'order_count'   => 'integer',
        'downloaded_at' => 'datetime',
        'expires_at'    => 'datetime',
    ];

    protected $appends = [
        'days_remaining',
        'file_size_formatted',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'downloaded_by');
    }

    public function scopeChannel(Builder $query, string $channel): Builder
    {
        return $query->where('channel', strtolower(trim($channel)));
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('expires_at', '>=', Carbon::now());
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('expires_at', '<', Carbon::now());
    }

    public function scopeSearch(Builder $query, ?string $search): Builder
    {
        $term = trim((string) $search);
        if ($term === '') {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('file_name', 'like', "%{$term}%")
              ->orWhere('downloaded_by_name', 'like', "%{$term}%")
              ->orWhereJsonContains('order_sns', $term)
              ->orWhere('order_sns', 'like', "%{$term}%");
        });
    }

    public function getDaysRemainingAttribute(): int
    {
        if (! $this->expires_at) {
            return 0;
        }

        $now = Carbon::now();
        if ($this->expires_at->isPast()) {
            return 0;
        }

        return (int) $now->diffInDays($this->expires_at, false);
    }

    public function getFileSizeFormattedAttribute(): string
    {
        $bytes = (int) $this->file_size;
        if ($bytes <= 0) {
            return '0 B';
        }

        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }

        return round($bytes, 1) . ' ' . $units[$i];
    }

    public function fileExists(): bool
    {
        return ! empty($this->file_path) && Storage::disk('local')->exists($this->file_path);
    }

    public function deleteFile(): bool
    {
        if (! empty($this->file_path) && Storage::disk('local')->exists($this->file_path)) {
            return Storage::disk('local')->delete($this->file_path);
        }

        return true;
    }
}
