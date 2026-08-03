<?php

namespace App\Services;

use App\Models\DriveWeekFolder;
use App\Support\WeekPeriod;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Unggah bukti pembayaran ke Google Drive memakai Service Account.
 *
 * Setiap minggu dibuatkan satu folder baru bernama "YYYY-MM-DD sd YYYY-MM-DD"
 * di dalam folder induk yang dibagikan ke service account, supaya file bukti
 * tidak menumpuk di hosting.
 *
 * Bila kredensial belum diisi, file disimpan di storage publik aplikasi agar
 * fitur tetap jalan (mode darurat) — statusnya dilaporkan lewat driveEnabled().
 */
class GoogleDriveService
{
    private const TOKEN_CACHE_KEY = 'google-drive.access-token';
    private const SCOPE = 'https://www.googleapis.com/auth/drive';

    public function driveEnabled(): bool
    {
        return $this->credentials() !== null && $this->rootFolderId() !== null;
    }

    /**
     * Unggah satu berkas bukti ke folder minggu terkait.
     *
     * @return array{name: string, link: string, on_drive: bool}
     */
    public function uploadReceipt(UploadedFile $file, string $transactionDate, string $prefix): array
    {
        $period = WeekPeriod::containing($transactionDate);
        $fileName = $prefix . '-' . now()->format('YmdHis') . '.' . $file->getClientOriginalExtension();

        if (! $this->driveEnabled()) {
            $path = $file->storeAs('bukti-kas', $fileName, 'public');

            return [
                'name'     => $file->getClientOriginalName(),
                'link'     => Storage::disk('public')->url($path),
                'on_drive' => false,
            ];
        }

        $folder = $this->ensureWeekFolder($period);
        $link = $this->upload($file, $fileName, $folder->folder_id);

        return [
            'name'     => $file->getClientOriginalName(),
            'link'     => $link,
            'on_drive' => true,
        ];
    }

    /**
     * Folder minggu dibuat sekali lalu dicatat, jadi unggahan berikutnya
     * pada minggu yang sama langsung memakai folder tersebut.
     */
    public function ensureWeekFolder(WeekPeriod $period): DriveWeekFolder
    {
        $existing = DriveWeekFolder::where('period_start', $period->startDate())->first();

        if ($existing) {
            return $existing;
        }

        $folderName = $period->folderName();

        $response = $this->client()->post('https://www.googleapis.com/drive/v3/files', [
            'name'     => $folderName,
            'mimeType' => 'application/vnd.google-apps.folder',
            'parents'  => [$this->rootFolderId()],
        ]);

        if ($response->failed()) {
            throw new RuntimeException('Gagal membuat folder mingguan di Google Drive: ' . $response->body());
        }

        return DriveWeekFolder::create([
            'period_start' => $period->startDate(),
            'period_end'   => $period->endDate(),
            'folder_name'  => $folderName,
            'folder_id'    => $response->json('id'),
            'folder_link'  => $response->json('webViewLink'),
        ]);
    }

    /** Unggah berkas memakai multipart upload, kembalikan tautan yang bisa dibuka. */
    protected function upload(UploadedFile $file, string $fileName, string $folderId): string
    {
        $metadata = json_encode([
            'name'    => $fileName,
            'parents' => [$folderId],
        ]);

        $response = Http::withToken($this->accessToken())
            ->attach('metadata', $metadata, 'metadata.json', ['Content-Type' => 'application/json'])
            ->attach('file', file_get_contents($file->getRealPath()), $fileName)
            ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink');

        if ($response->failed()) {
            throw new RuntimeException('Gagal mengunggah bukti ke Google Drive: ' . $response->body());
        }

        return $response->json('webViewLink')
            ?? 'https://drive.google.com/file/d/' . $response->json('id') . '/view';
    }

    protected function client(): PendingRequest
    {
        return Http::withToken($this->accessToken())
            ->acceptJson()
            ->withQueryParameters([
                'supportsAllDrives' => 'true',
                'fields'            => 'id,name,webViewLink',
            ]);
    }

    /**
     * Token OAuth service account (JWT bearer). Google memberi masa berlaku
     * satu jam, jadi disimpan di cache sedikit lebih pendek dari itu.
     */
    protected function accessToken(): string
    {
        return Cache::remember(self::TOKEN_CACHE_KEY, now()->addMinutes(50), function () {
            $credentials = $this->credentials();

            if (! $credentials) {
                throw new RuntimeException('Kredensial Google Drive belum dikonfigurasi.');
            }

            $now = time();
            $claims = [
                'iss'   => $credentials['client_email'],
                'scope' => self::SCOPE,
                'aud'   => 'https://oauth2.googleapis.com/token',
                'iat'   => $now,
                'exp'   => $now + 3600,
            ];

            $segments = [
                $this->base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])),
                $this->base64Url(json_encode($claims)),
            ];

            $signature = '';
            openssl_sign(implode('.', $segments), $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256);
            $segments[] = $this->base64Url($signature);

            $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => implode('.', $segments),
            ]);

            if ($response->failed()) {
                Log::error('Google Drive token gagal diambil', ['body' => $response->body()]);
                throw new RuntimeException('Gagal mendapatkan akses Google Drive. Periksa kembali Service Account.');
            }

            return $response->json('access_token');
        });
    }

    /** @return array{client_email: string, private_key: string}|null */
    protected function credentials(): ?array
    {
        $path = config('services.google_drive.credentials');

        if (! $path || ! is_readable($path)) {
            return null;
        }

        $decoded = json_decode(file_get_contents($path), true);

        if (! isset($decoded['client_email'], $decoded['private_key'])) {
            return null;
        }

        return $decoded;
    }

    /**
     * Folder induk boleh diisi ID maupun link penuh Google Drive —
     * link yang ditempel apa adanya tetap dikenali.
     */
    protected function rootFolderId(): ?string
    {
        $value = config('services.google_drive.root_folder');

        if (! $value) {
            return null;
        }

        if (preg_match('#/folders/([A-Za-z0-9_-]+)#', $value, $matches)) {
            return $matches[1];
        }

        if (preg_match('#[?&]id=([A-Za-z0-9_-]+)#', $value, $matches)) {
            return $matches[1];
        }

        return $value;
    }

    protected function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
