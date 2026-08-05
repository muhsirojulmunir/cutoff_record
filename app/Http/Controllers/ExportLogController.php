<?php

namespace App\Http\Controllers;

use App\Models\ExportLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Riwayat unduhan file export milik pengguna yang sedang login.
 *
 * Berkasnya ikut disimpan sehingga bisa diunduh ulang dari panel riwayat.
 * Hanya sepuluh riwayat terbaru yang dipertahankan; sisanya terhapus otomatis
 * beserta berkasnya supaya tidak memenuhi disk.
 */
class ExportLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;

        $logs = ExportLog::where('user_id', $userId)
            ->orderByDesc('id')
            ->limit(ExportLog::MAX_PER_USER)
            ->get(['id', 'file_name', 'file_path', 'module', 'description', 'exported_at']);

        return response()->json([
            'logs' => $logs->map(fn (ExportLog $log) => [
                'id'           => $log->id,
                'file_name'    => $log->file_name,
                'module'       => $log->module,
                'description'  => $log->description,
                'exported_at'  => $log->exported_at,
                'downloadable' => $log->isDownloadable(),
            ]),
            'total' => $logs->count(),
        ]);
    }

    /**
     * Catat unduhan. Berkas boleh disertakan agar bisa diunduh ulang;
     * bila tidak ada, riwayatnya tetap tercatat tanpa tombol unduh.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file_name'   => ['required', 'string', 'max:255'],
            'module'      => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
            'file'        => ['nullable', 'file', 'max:20480'],
        ], [], [
            'file_name'   => 'Nama file',
            'module'      => 'Modul',
            'description' => 'Keterangan',
            'file'        => 'Berkas',
        ]);

        $userId = $request->user()?->id;
        $path   = null;

        if ($request->hasFile('file')) {
            $path = $request->file('file')->store("exports/{$userId}", ExportLog::DISK);
        }

        $log = ExportLog::record(
            $validated['file_name'],
            $validated['module'],
            $validated['description'] ?? null,
            $userId,
            $path,
        );

        return response()->json(['log' => $log], 201);
    }

    /** Unduh ulang berkas dari riwayat. */
    public function download(Request $request, ExportLog $exportLog): StreamedResponse
    {
        // Riwayat bersifat pribadi: tidak boleh mengunduh berkas milik orang lain.
        abort_unless($exportLog->user_id === $request->user()?->id, 403);
        abort_unless($exportLog->isDownloadable(), 404, 'Berkas sudah tidak tersedia.');

        return \Illuminate\Support\Facades\Storage::disk(ExportLog::DISK)
            ->download($exportLog->file_path, $exportLog->file_name);
    }
}
