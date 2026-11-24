<?php

namespace App\Http\Controllers;

use App\Models\DailyContentReport;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class DailyContentReportController extends Controller
{
    /**
     * Menampilkan daftar Report Harian Konten dan form unggah laporan.
     */
    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = Auth::user();

        if (!$user->isSuperAdmin() && !$user->hasPermission('content_reports.view')) {
            abort(403, 'Anda tidak memiliki hak akses untuk melihat Report Harian Konten.');
        }

        $now = Carbon::now();
        $todayDate = $now->toDateString();

        // 1. Ambil Statistik Ringkasan Konten
        $todayReports = DailyContentReport::whereDate('reported_at', $todayDate)->get();
        $todayTotal   = $todayReports->count();
        $todaySantai  = $todayReports->where('content_type', 'santai')->count();
        $todayProduk  = $todayReports->where('content_type', 'produk')->count();
        $todaySemua   = $todayReports->where('content_type', 'semua')->count();

        $thisMonthTotal = DailyContentReport::whereYear('reported_at', $now->year)
            ->whereMonth('reported_at', $now->month)
            ->count();

        $myTodayReports = $todayReports->where('user_id', $user->id);
        $myTodayCount   = $myTodayReports->count();
        $myTodayHasSantai = $myTodayReports->contains(fn ($r) => in_array($r->content_type, ['santai', 'semua']));
        $myTodayHasProduk = $myTodayReports->contains(fn ($r) => in_array($r->content_type, ['produk', 'semua']));

        // 2. Filter & Query Daftar Laporan
        $search      = trim((string) $request->input('search', ''));
        $contentType = trim((string) $request->input('content_type', ''));
        $creatorId   = $request->input('user_id');
        $status      = trim((string) $request->input('status', ''));
        $dateFrom    = $request->input('date_from');
        $dateTo      = $request->input('date_to');

        $query = DailyContentReport::with([
            'user:id,name,email',
            'reviewer:id,name,email',
        ]);

        if (!empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%"));
            });
        }

        if (!empty($contentType) && in_array($contentType, ['santai', 'produk', 'semua'])) {
            $query->where('content_type', $contentType);
        }

        if (!empty($creatorId)) {
            $query->where('user_id', (int) $creatorId);
        }

        if (!empty($status) && in_array($status, ['submitted', 'reviewed'])) {
            $query->where('status', $status);
        }

        if (!empty($dateFrom)) {
            $query->whereDate('reported_at', '>=', $dateFrom);
        }
        if (!empty($dateTo)) {
            $query->whereDate('reported_at', '<=', $dateTo);
        }

        $reports = $query->orderBy('reported_at', 'desc')
            ->paginate(20)
            ->withQueryString();

        // 3. Daftar Staf Kreatif untuk Filter Dropdown
        $creators = User::whereHas('role', fn ($r) => $r->where('name', 'Kreatif'))
            ->orWhereIn('id', DailyContentReport::select('user_id')->distinct())
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        // 4. Hak Akses / Capabilities
        $userRoleName = $user->role?->name ?? '';
        $canReview = $user->isSuperAdmin() ||
                     in_array($userRoleName, ['Super Admin', 'Direktur', 'PIC']) ||
                     $user->hasPermission('content_reports.review');
        $canCreate = $user->isSuperAdmin() || $user->hasPermission('content_reports.create');

        return Inertia::render('ContentReports/Index', [
            'reports' => $reports,
            'filters' => [
                'search'       => $search,
                'content_type' => $contentType,
                'user_id'      => $creatorId,
                'status'       => $status,
                'date_from'    => $dateFrom,
                'date_to'      => $dateTo,
            ],
            'stats' => [
                'today_total'        => $todayTotal,
                'today_santai'       => $todaySantai,
                'today_produk'       => $todayProduk,
                'today_semua'        => $todaySemua,
                'this_month_total'   => $thisMonthTotal,
                'my_today_count'     => $myTodayCount,
                'my_today_has_santai'=> $myTodayHasSantai,
                'my_today_has_produk'=> $myTodayHasProduk,
                'server_time'        => $now->isoFormat('D MMMM Y, HH:mm') . ' WIB',
            ],
            'creators'     => $creators,
            'capabilities' => [
                'can_create' => $canCreate,
                'can_review' => $canReview,
                'is_kreatif' => $userRoleName === 'Kreatif',
            ],
        ]);
    }

    /**
     * Simpan laporan konten harian baru.
     */
    public function store(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = Auth::user();

        if (!$user->isSuperAdmin() && !$user->hasPermission('content_reports.create')) {
            abort(403, 'Anda tidak memiliki hak akses untuk membuat laporan konten.');
        }

        $validated = $request->validate([
            'content_type' => 'required|in:santai,produk,semua',
            'title'        => 'required|string|max:255',
            'ig_link'      => 'nullable|string|url|max:1000',
            'tiktok_link'  => 'nullable|string|url|max:1000',
            'shopee_link'  => 'nullable|string|url|max:1000',
            'notes'        => 'nullable|string|max:2000',
        ], [
            'title.required' => 'Judul / topik konten wajib diisi.',
            'ig_link.url'    => 'Link Instagram harus berupa format URL valid (https://...).',
            'tiktok_link.url'=> 'Link TikTok harus berupa format URL valid (https://...).',
            'shopee_link.url'=> 'Link Shopee Video harus berupa format URL valid (https://...).',
        ]);

        $igLink     = trim((string) ($validated['ig_link'] ?? ''));
        $tiktokLink = trim((string) ($validated['tiktok_link'] ?? ''));
        $shopeeLink = trim((string) ($validated['shopee_link'] ?? ''));

        // Validasi: minimal ada 1 link yang diisi
        if (empty($igLink) && empty($tiktokLink) && empty($shopeeLink)) {
            return back()->withErrors([
                'ig_link' => 'Harap isi minimal salah satu tautan konten (Instagram, TikTok, atau Shopee Video).',
            ])->withInput();
        }

        $now = Carbon::now();

        DailyContentReport::create([
            'user_id'      => $user->id,
            'content_type' => $validated['content_type'],
            'title'        => trim($validated['title']),
            'ig_link'      => $igLink !== '' ? $igLink : null,
            'tiktok_link'  => $tiktokLink !== '' ? $tiktokLink : null,
            'shopee_link'  => $shopeeLink !== '' ? $shopeeLink : null,
            'notes'        => !empty($validated['notes']) ? trim($validated['notes']) : null,
            'status'       => 'submitted',
            'reported_at'  => $now,
        ]);

        $waktuFormatted = $now->format('H:i') . ' WIB';

        return redirect()->route('content-reports.index')->with(
            'success',
            "Report konten '{$validated['title']}' berhasil dikirim dan tercatat otomatis pada pukul {$waktuFormatted}!"
        );
    }

    /**
     * Berikan status review / feedback untuk laporan konten (khusus PIC, Direktur, Super Admin).
     */
    public function review(Request $request, int $id): RedirectResponse
    {
        /** @var User $user */
        $user = Auth::user();
        $userRoleName = $user->role?->name ?? '';

        $canReview = $user->isSuperAdmin() ||
                     in_array($userRoleName, ['Super Admin', 'Direktur', 'PIC']) ||
                     $user->hasPermission('content_reports.review');

        if (!$canReview) {
            abort(403, 'Hanya PIC, Direktur, atau Super Admin yang dapat mereview laporan konten.');
        }

        $report = DailyContentReport::findOrFail($id);

        $validated = $request->validate([
            'feedback' => 'nullable|string|max:1000',
        ]);

        $report->update([
            'status'      => 'reviewed',
            'reviewed_by' => $user->id,
            'reviewed_at' => Carbon::now(),
            'feedback'    => !empty($validated['feedback']) ? trim($validated['feedback']) : null,
        ]);

        return back()->with('success', "Laporan konten '{$report->title}' berhasil ditandai telah ditinjau.");
    }

    /**
     * Hapus laporan konten.
     */
    public function destroy(int $id): RedirectResponse
    {
        /** @var User $user */
        $user = Auth::user();
        $report = DailyContentReport::findOrFail($id);

        $isOwner = (int) $report->user_id === (int) $user->id;
        $isManager = $user->isSuperAdmin() || in_array($user->role?->name, ['Super Admin', 'Direktur', 'PIC']);

        if (!$isOwner && !$isManager) {
            abort(403, 'Anda tidak berhak menghapus laporan ini.');
        }

        $title = $report->title;
        $report->delete();

        return back()->with('success', "Laporan konten '{$title}' berhasil dihapus.");
    }
}
