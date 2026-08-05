<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Satu baris riwayat unduhan file export.
 */
class ExportLog extends Model
{
    /** Riwayat yang disimpan per pengguna; sisanya dibuang beserta berkasnya. */
    public const MAX_PER_USER = 10;

    /** Disk penyimpanan berkas export. */
    public const DISK = 'local';

    protected $fillable = [
        'user_id',
        'file_name',
        'file_path',
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
     * Catat satu unduhan, lalu buang riwayat terlama bila sudah melewati batas.
     */
    public static function record(
        string $fileName,
        string $module,
        ?string $description = null,
        ?int $userId = null,
        ?string $filePath = null,
    ): self {
        $userId ??= auth()->id();

        $log = self::create([
            'user_id'     => $userId,
            'file_name'   => $fileName,
            'file_path'   => $filePath,
            'module'      => $module,
            'description' => $description,
            'exported_at' => now(),
        ]);

        self::pruneFor($userId);

        return $log;
    }

    /**
     * Sisakan sepuluh riwayat terbaru milik pengguna. Berkas milik riwayat yang
     * dibuang ikut dihapus agar tidak ada file yatim di disk.
     */
    public static function pruneFor(?int $userId): void
    {
        if (!$userId) return;

        $stale = self::where('user_id', $userId)
            ->orderByDesc('id')
            ->skip(self::MAX_PER_USER)
            ->take(PHP_INT_MAX)
            ->get();

        foreach ($stale as $log) {
            $log->deleteFile();
            $log->delete();
        }
    }

    /** Hapus berkas fisiknya bila masih ada. */
    public function deleteFile(): void
    {
        if ($this->file_path && Storage::disk(self::DISK)->exists($this->file_path)) {
            Storage::disk(self::DISK)->delete($this->file_path);
        }
    }

    /** Berkasnya masih tersimpan sehingga bisa diunduh ulang. */
    public function isDownloadable(): bool
    {
        return $this->file_path !== null
            && Storage::disk(self::DISK)->exists($this->file_path);
    }
}
