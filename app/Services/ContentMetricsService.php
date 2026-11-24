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
        $cleanUrl = trim($url);

        // 1. Ekstrak langsung menggunakan TikWM API (sangat cepat, akurat & tembus bot protection TikTok)
        try {
            $apiUrl = 'https://www.tikwm.com/api/?url=' . urlencode($cleanUrl);
            $res = Http::timeout(8)->get($apiUrl);
            if ($res->successful()) {
                $data = $res->json();
                if (isset($data['code']) && (int)$data['code'] === 0 && isset($data['data']['play_count'])) {
                    return (int) $data['data']['play_count'];
                }
            }
        } catch (\Throwable $e) {}

        // 2. Jika link pendek (vt.tiktok.com / vm.tiktok.com), ikuti redirect untuk mendapatkan URL video utuh
        if (str_contains($cleanUrl, 'vt.tiktok.com') || str_contains($cleanUrl, 'vm.tiktok.com')) {
            try {
                $redir = Http::timeout(5)->withOptions(['allow_redirects' => false])->get($cleanUrl);
                if ($redir->status() >= 300 && $redir->status() < 400 && $redir->header('Location')) {
                    $canonicalUrl = $redir->header('Location');
                    $res2 = Http::timeout(8)->get('https://www.tikwm.com/api/?url=' . urlencode($canonicalUrl));
                    if ($res2->successful()) {
                        $d = $res2->json();
                        if (isset($d['code']) && (int)$d['code'] === 0 && isset($d['data']['play_count'])) {
                            return (int) $d['data']['play_count'];
                        }
                    }
                }
            } catch (\Throwable $e) {}
        }

        // 3. Fallback: Request halaman langsung jika memungkinkan
        try {
            $response = Http::withHeaders([
                'User-Agent'      => $this->userAgent,
                'Accept-Language' => 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ])->timeout(4)->withOptions(['allow_redirects' => true])->get($cleanUrl);

            if ($response->successful()) {
                $html = $response->body();

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
        } catch (\Throwable $e) {}

        return null;
    }

    /**
     * Ambil estimasi/angka views dari link video Instagram (Reels/Post) via Meta Graph API atau fallback.
     */
    protected function fetchInstagramViews(string $url): ?int
    {
        $cleanUrl = trim($url);

        // Ekstrak shortcode dari link Instagram (misal: /reel/C8-q0V1S5j2/ atau /p/C8-q0V1S5j2/)
        preg_match('/(?:reel|p)\/([A-Za-z0-9_-]+)/', $cleanUrl, $matches);
        $shortcode = $matches[1] ?? null;

        $token     = config('services.instagram.access_token') ?: env('INSTAGRAM_ACCESS_TOKEN');
        $accountId = config('services.instagram.account_id') ?: env('INSTAGRAM_ACCOUNT_ID');

        // 1. Integrasi Resmi: Meta Graph API (Khusus Akun Instagram Bisnis/Creator)
        if (!empty($token)) {
            try {
                // A. Query melalui Instagram Business Account ID jika tersedia
                if (!empty($accountId)) {
                    $endpoint = "https://graph.facebook.com/v21.0/{$accountId}/media";
                    $res = Http::timeout(8)->get($endpoint, [
                        'fields'       => 'id,shortcode,permalink,insights.metric(plays,views)',
                        'limit'        => 50,
                        'access_token' => $token,
                    ]);

                    if ($res->successful()) {
                        $items = $res->json('data') ?? [];
                        foreach ($items as $item) {
                            if ((isset($item['shortcode']) && $item['shortcode'] === $shortcode) ||
                                (isset($item['permalink']) && $shortcode && str_contains($item['permalink'], (string)$shortcode))) {
                                if (isset($item['insights']['data'])) {
                                    foreach ($item['insights']['data'] as $insight) {
                                        if (in_array($insight['name'], ['plays', 'views'])) {
                                            $val = $insight['values'][0]['value'] ?? null;
                                            if ($val !== null && (int)$val > 0) {
                                                return (int)$val;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // B. Query langsung per media insight jika numeric ID berhasil dihitung
                if ($shortcode) {
                    $numericMediaId = $this->shortcodeToInstagramMediaId($shortcode);
                    if ($numericMediaId) {
                        $insightUrl = "https://graph.facebook.com/v21.0/{$numericMediaId}/insights";
                        $resDirect = Http::timeout(8)->get($insightUrl, [
                            'metric'       => 'plays,views',
                            'access_token' => $token,
                        ]);
                        if ($resDirect->successful()) {
                            $insights = $resDirect->json('data') ?? [];
                            foreach ($insights as $insight) {
                                if (in_array($insight['name'], ['plays', 'views'])) {
                                    $val = $insight['values'][0]['value'] ?? null;
                                    if ($val !== null && (int)$val > 0) {
                                        return (int)$val;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::warning("Instagram Graph API error: " . $e->getMessage());
            }
        }

        // 2. Fallback: Request metadata publik jika memungkinkan
        try {
            $response = Http::withHeaders([
                'User-Agent' => $this->userAgent,
                'Accept'     => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ])->timeout(4)->withOptions(['allow_redirects' => true])->get($cleanUrl);

            if ($response->successful()) {
                $html = $response->body();

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
     * Konversi Instagram URL shortcode menjadi numeric media ID.
     */
    protected function shortcodeToInstagramMediaId(string $shortcode): ?string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        $id = '0';
        for ($i = 0; $i < strlen($shortcode); $i++) {
            $char = $shortcode[$i];
            $pos = strpos($alphabet, $char);
            if ($pos === false) return null;
            if (function_exists('bcmul') && function_exists('bcadd')) {
                $id = bcadd(bcmul($id, '64'), (string)$pos);
            } else {
                $id = (string) (((int)$id * 64) + $pos);
            }
        }
        return (string)$id;
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
