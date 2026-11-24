<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class DailyContentReport extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'content_type',
        'title',
        'ig_link',
        'tiktok_link',
        'shopee_link',
        'notes',
        'status',
        'reviewed_by',
        'reviewed_at',
        'feedback',
        'reported_at',
    ];

    protected $casts = [
        'reported_at' => 'datetime',
        'reviewed_at' => 'datetime',
    ];

    /**
     * Staf kreatif yang mengunggah laporan.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * PIC / Management yang mereview laporan.
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /**
     * Scope untuk laporan hari ini.
     */
    public function scopeToday($query)
    {
        return $query->whereDate('reported_at', now()->toDateString());
    }

    /**
     * Scope untuk laporan bulan ini.
     */
    public function scopeThisMonth($query)
    {
        return $query->whereMonth('reported_at', now()->month)
                     ->whereYear('reported_at', now()->year);
    }
}
