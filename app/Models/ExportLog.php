<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
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
     * Pastikan tabel export_logs sudah dibuat di database.
     */
    public static function ensureSchema(): void
    {
        if (Schema::hasTable('export_logs')) {
            return;
        }

        try {
            Schema::create('export_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('file_name', 255);
                $table->string('file_path', 255)->nullable();
                $table->string('module', 100)->index();
                $table->string('description', 255)->nullable();
                $table->timestamp('exported_at')->nullable()->index();
                $table->timestamps();

                $table->index(['user_id', 'id']);
            });
        } catch (\Throwable $e) {
            Log::warning('ExportLog ensureSchema error: ' . $e->getMessage());
        }
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
        self::ensureSchema();

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
