<?php

namespace App\Services;

use App\Models\DailyContentReport;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ContentMetricsService
{
    /**
     * User-Agent browser modern agar tidak mudah dicurigai bot saat request metadata publik.
     */
    protected string $userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    /**
     * Sinkronkan tayangan (views) untuk seluruh laporan aktif dalam N hari terakhir.
     */
    public function syncRecentReports(int $days = 30): array
    {
        DailyContentReport::ensureViewsColumnsExist();

        $cutoffDate = Carbon::now()->subDays($days)->toDateString();

        $reports = DailyContentReport::whereDate('reported_at', '>=', $cutoffDate)
            ->whereNull('deleted_at')
            ->orderByDesc('reported_at')
            ->get();

        $successCount = 0;
        $failedCount = 0;

        foreach ($reports as $report) {
            try {
                $this->syncReportViews($report);
                $successCount++;
            } catch (\Throwable $e) {
                Log::warning("Gagal sinkron views report ID {$report->id}: " . $e->getMessage());
                $failedCount++;
            }
        }

        return [
            'total'   => $reports->count(),
            'success' => $successCount,
            'failed'  => $failedCount,
        ];
    }

    /**
     * Sinkronkan views untuk satu laporan konten tertentu.
     */
    public function syncReportViews(DailyContentReport $report): DailyContentReport
    {
        $tiktokViews = $report->tiktok_views ?? 0;
        $igViews     = $report->ig_views ?? 0;
        $shopeeViews = $report->shopee_views ?? 0;

        // 1. Ekstrak views dari TikTok
        if (!empty($report->tiktok_link)) {
            $fetchedTiktokViews = $this->fetchTiktokViews($report->tiktok_link);
            if ($fetchedTiktokViews !== null && $fetchedTiktokViews > 0) {
                $tiktokViews = $fetchedTiktokViews;
            }
        }

        // 2. Ekstrak views dari Instagram
        if (!empty($report->ig_link)) {
            $fetchedIgViews = $this->fetchInstagramViews($report->ig_link);
            if ($fetchedIgViews !== null && $fetchedIgViews > 0) {
                $igViews = $fetchedIgViews;
            }
        }

        // 3. Ekstrak views dari Shopee Video
        if (!empty($report->shopee_link)) {
            $fetchedShopeeViews = $this->fetchShopeeViews($report->shopee_link);
            if ($fetchedShopeeViews !== null && $fetchedShopeeViews > 0) {
                $shopeeViews = $fetchedShopeeViews;
            }
        }

        $totalViews = (int)$tiktokViews + (int)$igViews + (int)$shopeeViews;

        $report->update([
            'tiktok_views'      => $tiktokViews,
            'ig_views'          => $igViews,
            'shopee_views'      => $shopeeViews,
            'total_views'       => $totalViews,
            'views_synced_at'   => Carbon::now(),
            'views_sync_status' => 'synced',
        ]);

        return $report;
    }

    /**
     * Ambil estimasi/angka views publik dari link video TikTok.
     */
    protected function fetchTiktokViews(string $url): ?int
    {
        try {
            $cleanUrl = trim($url);

            // Ikuti redirect jika link pendek vt.tiktok.com
            $response = Http::withHeaders([
                'User-Agent'      => $this->userAgent,
                'Accept-Language' => 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ])->timeout(4)->withOptions(['allow_redirects' => true])->get($cleanUrl);

            if ($response->successful()) {
                $html = $response->body();

                // Cari pola playCount di dalam script state TikTok
                if (preg_match('/["&quot;]playCount["&quot;]:\s*(\d+)/i', $html, $matches)) {
                    return (int) $matches[1];
                }

                if (preg_match('/["&quot;]viewCount["&quot;]:\s*["&quot;]*(\d+)["&quot;]*/i', $html, $matches)) {
                    return (int) $matches[1];
                }

                if (preg_match('/"play_count":\s*(\d+)/i', $html, $matches)) {
                    return (int) $matches[1];
                }
            }
        } catch (\Throwable $e) {
            // Safe fallback
        }

        return null;
    }

    /**
     * Ambil estimasi/angka views publik dari link video Instagram (Reels/Post).
     */
    protected function fetchInstagramViews(string $url): ?int
    {
        try {
            $cleanUrl = trim($url);

            $response = Http::withHeaders([
                'User-Agent' => $this->userAgent,
                'Accept'     => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ])->timeout(4)->withOptions(['allow_redirects' => true])->get($cleanUrl);

            if ($response->successful()) {
                $html = $response->body();

                // Cek OpenGraph video view count jika tersedia
                if (preg_match('/"video_view_count":\s*(\d+)/i', $html, $matches)) {
                    return (int) $matches[1];
                }

                if (preg_match('/"play_count":\s*(\d+)/i', $html, $matches)) {
                    return (int) $matches[1];
                }
            }
        } catch (\Throwable $e) {
            // Safe fallback
        }

        return null;
    }

    /**
     * Ambil estimasi/angka views dari link Shopee Video.
     */
    protected function fetchShopeeViews(string $url): ?int
    {
        try {
            $cleanUrl = trim($url);

            $response = Http::withHeaders([
                'User-Agent' => $this->userAgent,
            ])->timeout(4)->withOptions(['allow_redirects' => true])->get($cleanUrl);

            if ($response->successful()) {
                $html = $response->body();

                if (preg_match('/"play_count":\s*(\d+)/i', $html, $matches)) {
                    return (int) $matches[1];
                }
                if (preg_match('/"view_count":\s*(\d+)/i', $html, $matches)) {
                    return (int) $matches[1];
                }
            }
        } catch (\Throwable $e) {
            // Safe fallback
        }

        return null;
    }
}
