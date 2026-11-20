<?php

namespace App\Services;

use App\Models\DownloadedWaybill;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class WaybillArchiveService
{
    /**
     * Pastikan tabel migration siap di database.
     */
    public function ensureSchema(): void
    {
        if (Schema::hasTable('downloaded_waybills')) {
            return;
        }

        try {
            Schema::create('downloaded_waybills', function (Blueprint $table) {
                $table->id();
                $table->string('channel', 32)->index();
                $table->string('file_name', 255);
                $table->string('file_path', 255);
                $table->unsignedInteger('file_size')->default(0);
                $table->unsignedInteger('order_count')->default(1);
                $table->json('order_sns');
                $table->unsignedBigInteger('downloaded_by')->nullable()->index();
                $table->string('downloaded_by_name', 100)->nullable();
                $table->timestamp('downloaded_at')->index();
                $table->timestamp('expires_at')->index();
                $table->timestamps();

                $table->index(['channel', 'expires_at']);
                $table->index(['channel', 'downloaded_at']);
            });
        } catch (\Throwable $e) {
            Log::warning('WaybillArchiveService ensureSchema error: ' . $e->getMessage());
        }
    }

    /**
     * Simpan file PDF Resi fisik ke storage (zero database bloat) dan catat metadata.
     * Retensi otomatis 90 hari (3 bulan).
     *
     * @param  string  $channel   'shopee' | 'tiktok'
     * @param  string  $pdfBinary Binary stream data PDF
     * @param  array<int, string>  $orderSns  Daftar order SN yang tercakup di dalam PDF
     * @param  User|null  $user   Pengguna yang melakukan download/cetak
     */
    public function archiveWaybill(string $channel, string $pdfBinary, array $orderSns, ?User $user = null): DownloadedWaybill
    {
        $this->ensureSchema();

        $channel = strtolower(trim($channel));
        $normalizedOrderSns = array_values(array_unique(array_filter(array_map('strval', $orderSns))));
        $orderCount = count($normalizedOrderSns);

        $now = Carbon::now('Asia/Jakarta');
        $dateStamp = $now->format('Ymd_Hi');
        $channelUpper = strtoupper($channel);

        // Penamaan standar:
        // Satuan: RESI_SHOPEE_240501ABC123_20261120_1530.pdf
        // Massal: RESI_SHOPEE_MASSAL_15PESANAN_20261120_1530WIB.pdf
        if ($orderCount <= 1 && ! empty($normalizedOrderSns)) {
            $firstSn = preg_replace('/[^A-Za-z0-9_-]/', '', $normalizedOrderSns[0]);
            $fileName = "RESI_{$channelUpper}_{$firstSn}_{$dateStamp}.pdf";
        } else {
            $fileName = "RESI_{$channelUpper}_MASSAL_{$orderCount}PESANAN_{$dateStamp}WIB.pdf";
        }

        $year = $now->format('Y');
        $month = $now->format('m');
        $storageDir = "waybills/{$channel}/{$year}/{$month}";
        $filePath = "{$storageDir}/{$fileName}";

        // Tulis file fisik ke disk 'local' (storage/app/waybills/...)
        Storage::disk('local')->put($filePath, $pdfBinary);
        $fileSize = strlen($pdfBinary);

        // Retensi 90 hari (3 bulan)
        $expiresAt = $now->copy()->addDays(90);

        $waybill = DownloadedWaybill::create([
            'channel'            => $channel,
            'file_name'          => $fileName,
            'file_path'          => $filePath,
            'file_size'          => $fileSize,
            'order_count'        => max(1, $orderCount),
            'order_sns'          => $normalizedOrderSns,
            'downloaded_by'      => $user?->id,
            'downloaded_by_name' => $user?->name ?? 'Admin',
            'downloaded_at'      => $now,
            'expires_at'         => $expiresAt,
        ]);

        // Cleanup ringan oportunistik untuk menghapus file kadaluarsa
        $this->opportunisticPrune();

        return $waybill;
    }

    /**
     * Ambil riwayat unduhan resi terfilter untuk channel tertentu.
     */
    public function getHistory(string $channel, ?string $search = null, int $perPage = 15): LengthAwarePaginator
    {
        $this->ensureSchema();

        $query = DownloadedWaybill::query()
            ->channel($channel)
            ->active()
            ->search($search)
            ->latest('downloaded_at');

        return $query->paginate($perPage);
    }

    /**
     * Stream atau unduh kembali file resi yang tersimpan.
     */
    public function getWaybillForDownload(int $id, string $expectedChannel): ?DownloadedWaybill
    {
        $this->ensureSchema();

        $waybill = DownloadedWaybill::query()
            ->channel($expectedChannel)
            ->where('id', $id)
            ->first();

        if (! $waybill || ! $waybill->fileExists()) {
            return null;
        }

        return $waybill;
    }

    /**
     * Bersihkan file dan metadata resi yang sudah berumur lebih dari 90 hari (expired).
     */
    public function pruneExpired(int $limit = 200): int
    {
        $this->ensureSchema();

        $expiredWaybills = DownloadedWaybill::query()
            ->expired()
            ->limit($limit)
            ->get();

        $deletedCount = 0;
        foreach ($expiredWaybills as $waybill) {
            try {
                $waybill->deleteFile();
                $waybill->delete();
                $deletedCount++;
            } catch (\Throwable $e) {
                Log::warning("Gagal prune resi {$waybill->id}: " . $e->getMessage());
            }
        }

        if ($deletedCount > 0) {
            Log::info("WaybillArchiveService: Berhasil membersihkan {$deletedCount} resi kadaluarsa (>90 hari).");
        }

        return $deletedCount;
    }

    /**
     * Pembersihan ringan berkala tanpa membebani request pengguna.
     */
    private function opportunisticPrune(): void
    {
        // 1 dari 10 request menjalankan prune cepat (maksimal 20 item per run)
        if (random_int(1, 10) === 1) {
            try {
                $this->pruneExpired(20);
            } catch (\Throwable $e) {
                // Abaikan jika error agar tidak mengganggu proses cetak resi
            }
        }
    }
}
