<?php

namespace App\Http\Controllers;

use App\Models\ExportLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Riwayat unduhan file export milik pengguna yang sedang login.
 *
 * Dipanggil lewat fetch dari komponen Riwayat Download, bukan halaman Inertia,
 * supaya panelnya bisa dibuka tanpa memuat ulang halaman.
 */
class ExportLogController extends Controller
{
    /** Batas riwayat yang ditampilkan di panel. */
    private const LIMIT = 30;

    public function index(Request $request): JsonResponse
    {
        $logs = ExportLog::where('user_id', $request->user()?->id)
            ->orderByDesc('id')
            ->limit(self::LIMIT)
            ->get(['id', 'file_name', 'module', 'description', 'exported_at']);

        return response()->json([
            'logs'  => $logs,
            'total' => ExportLog::where('user_id', $request->user()?->id)->count(),
        ]);
    }

    /**
     * Catat export yang file-nya dirakit di peramban, misalnya template Excel
     * dan unduhan yang memakai SheetJS.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file_name'   => ['required', 'string', 'max:255'],
            'module'      => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
        ], [], [
            'file_name'   => 'Nama file',
            'module'      => 'Modul',
            'description' => 'Keterangan',
        ]);

        $log = ExportLog::record(
            $validated['file_name'],
            $validated['module'],
            $validated['description'] ?? null,
            $request->user()?->id
        );

        return response()->json(['log' => $log], 201);
    }
}
