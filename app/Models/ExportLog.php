<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris riwayat unduhan file export.
 */
class ExportLog extends Model
{
    protected $fillable = [
        'user_id',
        'file_name',
        'module',
        'description',
        'exported_at',
    ];

    protected $casts = [
        'exported_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    /**
     * Catat satu unduhan. Dipakai controller export di server maupun
     * endpoint pencatatan untuk export yang dirakit di peramban.
     */
    public static function record(string $fileName, string $module, ?string $description = null, ?int $userId = null): self
    {
        return self::create([
            'user_id'     => $userId ?? auth()->id(),
            'file_name'   => $fileName,
            'module'      => $module,
            'description' => $description,
            'exported_at' => now(),
        ]);
    }
}
