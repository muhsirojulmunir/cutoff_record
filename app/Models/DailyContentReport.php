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
        'ig_views',
        'tiktok_views',
        'shopee_views',
        'total_views',
        'views_synced_at',
        'views_sync_status',
        'status',
        'reviewed_by',
        'reviewed_at',
        'feedback',
        'reported_at',
    ];

    protected $casts = [
        'reported_at'       => 'datetime',
        'reviewed_at'       => 'datetime',
        'views_synced_at'   => 'datetime',
        'ig_views'          => 'integer',
        'tiktok_views'      => 'integer',
        'shopee_views'      => 'integer',
        'total_views'       => 'integer',
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
        return $query->whereYear('reported_at', now()->year)
            ->whereMonth('reported_at', now()->month);
    }

    /**
     * Pecah kolom link (multi-baris) menjadi array URL bersih.
     *
     * @return array<int, string>
     */
    public static function parseLinks(?string $raw): array
    {
        if ($raw === null || trim($raw) === '') {
            return [];
        }

        $parts = preg_split('/\r?\n/', $raw) ?: [];

        return array_values(array_filter(array_map('trim', $parts), fn (string $url) => $url !== ''));
    }

    /**
     * Hitung jumlah URL dalam satu kolom link.
     */
    public static function countLinks(?string $raw): int
    {
        return count(self::parseLinks($raw));
    }

    /**
     * Pastikan kolom metrik tayangan (views) tersedia di database.
     */
    public static function ensureViewsColumnsExist(): void
    {
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('daily_content_reports') &&
                !\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'total_views')) {
                \Illuminate\Support\Facades\Schema::table('daily_content_reports', function (\Illuminate\Database\Schema\Blueprint $table) {
                    if (!\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'ig_views')) {
                        $table->unsignedBigInteger('ig_views')->default(0)->after('notes');
                    }
                    if (!\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'tiktok_views')) {
                        $table->unsignedBigInteger('tiktok_views')->default(0)->after('ig_views');
                    }
                    if (!\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'shopee_views')) {
                        $table->unsignedBigInteger('shopee_views')->default(0)->after('tiktok_views');
                    }
                    if (!\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'total_views')) {
                        $table->unsignedBigInteger('total_views')->default(0)->after('shopee_views');
                    }
                    if (!\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'views_synced_at')) {
                        $table->timestamp('views_synced_at')->nullable()->after('total_views');
                    }
                    if (!\Illuminate\Support\Facades\Schema::hasColumn('daily_content_reports', 'views_sync_status')) {
                        $table->string('views_sync_status', 30)->default('pending')->after('views_synced_at');
                    }
                });
            }
        } catch (\Throwable) {
            // Silently handle if table not ready or DB lock
        }
    }
}
