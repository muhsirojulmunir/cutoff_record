<?php

namespace App\Http\Controllers;

use App\Models\CutOffOrder;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __invoke(Request $request): \Inertia\Response
    {
        Gate::authorize('dashboard.view');

        Carbon::setLocale('id');

        $now = Carbon::now();
        $user = $request->user();
        
        $roleName = strtolower($user?->role?->name ?? '');
        $isKreatif = $user && (
            str_contains($roleName, 'kreatif') ||
            str_contains($roleName, 'creator') ||
            ($user->roles && $user->roles->contains(fn($r) => str_contains(strtolower($r->name ?? ''), 'kreatif') || str_contains(strtolower($r->name ?? ''), 'creator')))
        );

        // Dashboard Eksklusif untuk Role Kreatif (Fokus 100% pada performa konten & social media)
        if ($isKreatif) {
            $todayStr = $now->toDateString();
            $todayReports = \App\Models\DailyContentReport::whereDate('reported_at', $todayStr)->get();
            $myTodayReports = $todayReports->where('user_id', $user->id);

            $monthReports = \App\Models\DailyContentReport::whereYear('reported_at', $now->year)
                ->whereMonth('reported_at', $now->month)
                ->get();
            $myMonthReports = $monthReports->where('user_id', $user->id);

            // Metrik Statistik Konten
            $topReport = $monthReports->sortByDesc('total_views')->first();
            $lastSync = $monthReports->whereNotNull('views_synced_at')->max('views_synced_at');

            $kreatifStats = [
                'today_total'        => $todayReports->count(),
                'my_today_total'     => $myTodayReports->count(),
                'today_ig'           => $todayReports->filter(fn($r) => !empty($r->ig_link))->count(),
                'today_tiktok'       => $todayReports->filter(fn($r) => !empty($r->tiktok_link))->count(),
                'today_shopee'       => $todayReports->filter(fn($r) => !empty($r->shopee_link))->count(),
                'month_total'        => $monthReports->count(),
                'my_month_total'     => $myMonthReports->count(),
                'month_views'        => (int) $monthReports->sum('total_views'),
                'my_month_views'     => (int) $myMonthReports->sum('total_views'),
                'top_video_title'    => $topReport?->title ?? 'Belum ada data',
                'top_video_views'    => (int) ($topReport?->total_views ?? 0),
                'last_synced_at'     => $lastSync ? Carbon::parse($lastSync)->isoFormat('D MMM, HH:mm') . ' WIB' : 'Setiap 00:00 WIB',
                'my_has_ig'          => $myTodayReports->contains(fn($r) => !empty($r->ig_link)),
                'my_has_tiktok'      => $myTodayReports->contains(fn($r) => !empty($r->tiktok_link)),
                'my_has_shopee'      => $myTodayReports->contains(fn($r) => !empty($r->shopee_link)),
            ];

            // 7 Hari Terakhir Trend Upload Konten
            $contentDailyTrend = [];
            for ($i = 6; $i >= 0; $i--) {
                $targetDate = $now->copy()->subDays($i);
                $dateKey = $targetDate->toDateString();
                $dayReports = \App\Models\DailyContentReport::whereDate('reported_at', $dateKey)->get();

                $contentDailyTrend[] = [
                    'date'         => $dateKey,
                    'label'        => $targetDate->isoFormat('D MMM'),
                    'dayName'      => $targetDate->isoFormat('ddd'),
                    'total'        => $dayReports->count(),
                    'ig_count'     => $dayReports->filter(fn($r) => !empty($r->ig_link))->count(),
                    'tiktok_count' => $dayReports->filter(fn($r) => !empty($r->tiktok_link))->count(),
                    'shopee_count' => $dayReports->filter(fn($r) => !empty($r->shopee_link))->count(),
                ];
            }

            // 6 Laporan Terakhir
            $recentReports = \App\Models\DailyContentReport::with(['user:id,name', 'reviewer:id,name'])
                ->orderBy('reported_at', 'desc')
                ->take(6)
                ->get()
                ->map(fn($r) => [
                    'id'          => $r->id,
                    'title'       => $r->title,
                    'author'      => $r->user?->name ?? 'Kreatif',
                    'is_mine'     => (int)$r->user_id === (int)$user->id,
                    'reported_at' => $r->reported_at ? Carbon::parse($r->reported_at)->isoFormat('D MMM Y, HH:mm') . ' WIB' : '-',
                    'ig_link'     => $r->ig_link,
                    'tiktok_link' => $r->tiktok_link,
                    'shopee_link' => $r->shopee_link,
                    'total_views' => (int) ($r->total_views ?? 0),
                    'ig_views'    => (int) ($r->ig_views ?? 0),
                    'tiktok_views'=> (int) ($r->tiktok_views ?? 0),
                    'shopee_views'=> (int) ($r->shopee_views ?? 0),
                    'views_synced_at' => $r->views_synced_at ? Carbon::parse($r->views_synced_at)->isoFormat('D MMM, HH:mm') : null,
                    'status'      => $r->status,
                    'feedback'    => $r->feedback,
                ]);

            return Inertia::render('Dashboard', [
                'isKreatif'         => true,
                'kreatifStats'      => $kreatifStats,
                'contentDailyTrend' => $contentDailyTrend,
                'recentReports'     => $recentReports,
                'timeframeTitle'    => 'Dashboard Konten & Sosial Media',
                'dateSubtitle'      => $now->isoFormat('dddd, D MMMM Y'),
                'filters'           => ['range' => 'today', 'channel' => 'all'],
                'channels'          => [],
                'summary'           => [
                    'omset' => 0, 'omsetChange' => '', 'labaBersih' => 0, 'labaChange' => '',
                    'totalOrders' => 0, 'ordersChange' => '', 'pengiriman' => 0, 'pengirimanChange' => '',
                ],
                'profitFunnel'      => [],
                'dailyTrend'        => [],
                'channelBreakdown'  => [],
                'courierBreakdown'  => [],
                'topProducts'       => [],
                'stats'             => [
                    'totalUsers'  => User::count(),
                    'activeUsers' => User::where('status', 'active')->count(),
                    'totalRoles'  => Role::count(),
                    'appName'     => config('app.name'),
                ],
            ]);
        }

        // Parameter filter
        $range = $request->query('range', 'year'); // 'today', 'week', 'month', 'year', 'all'
        $channel = $request->query('channel', 'all');

        $now = Carbon::now();

        // Daftar Channel untuk Dropdown
        $availableChannels = CutOffOrder::query()
            ->onlyProcessed()
            ->select('channel', DB::raw('count(*) as count'))
            ->whereNotNull('channel')
            ->where('channel', '!=', '')
            ->groupBy('channel')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($item) => [
                'id'    => $item->channel,
                'name'  => $item->channel,
                'count' => $item->count,
            ])
            ->toArray();

        // 1. Query Periode Terpilih (pakai rentang tanggal [start, nextDay) agar index order_date terpakai)
        $query = CutOffOrder::query()->onlyProcessed();
        $prevQuery = CutOffOrder::query()->onlyProcessed();

        if ($channel && $channel !== 'all') {
            $query->where('channel', $channel);
            $prevQuery->where('channel', $channel);
        }

        $applyDateRange = static function ($builder, Carbon $startDate, Carbon $endDate): void {
            $start = $startDate->toDateString();
            $end = $endDate->copy()->addDay()->toDateString();
            $builder->where(function ($q) use ($start, $end) {
                $q->where(function ($p) use ($start, $end) {
                    $p->whereNotNull('processed_at')
                      ->where('processed_at', '>=', $start)
                      ->where('processed_at', '<', $end);
                })->orWhere(function ($o) use ($start, $end) {
                    $o->whereNull('processed_at')
                      ->where('order_date', '>=', $start)
                      ->where('order_date', '<', $end);
                });
            });
        };

        // Tentukan rentang tanggal & judul
        if ($range === 'today') {
            $timeframeTitle = 'Performa Hari Ini';
            $dateSubtitle = $now->isoFormat('dddd, D MMMM Y');
            $funnelPeriod = 'Hari Ini · ' . $now->isoFormat('D MMMM Y');

            $applyDateRange($query, $now, $now);
            $yesterday = $now->copy()->subDay();
            $applyDateRange($prevQuery, $yesterday, $yesterday);
            $comparisonLabel = 'dari kemarin';
        } elseif ($range === 'week') {
            $startWeek = $now->copy()->startOfWeek();
            $endWeek = $now->copy()->endOfWeek();
            $timeframeTitle = 'Performa Minggu Ini';
            $dateSubtitle = $startWeek->isoFormat('D MMMM') . ' – ' . $endWeek->isoFormat('D MMMM Y');
            $funnelPeriod = 'Minggu Ini · ' . $dateSubtitle;

            $applyDateRange($query, $startWeek, $endWeek);
            $applyDateRange($prevQuery, $startWeek->copy()->subWeek(), $endWeek->copy()->subWeek());
            $comparisonLabel = 'dari minggu lalu';
        } elseif ($range === 'month') {
            $timeframeTitle = 'Performa Bulan Ini';
            $dateSubtitle = $now->isoFormat('MMMM Y');
            $funnelPeriod = 'Bulan Ini · ' . $dateSubtitle;

            $applyDateRange($query, $now->copy()->startOfMonth(), $now->copy()->endOfMonth());
            $prevMonth = $now->copy()->subMonth();
            $applyDateRange($prevQuery, $prevMonth->copy()->startOfMonth(), $prevMonth->copy()->endOfMonth());
            $comparisonLabel = 'dari bulan lalu';
        } elseif ($range === 'all') {
            $timeframeTitle = 'Performa Semua Waktu';
            $dateSubtitle = 'Seluruh Transaksi Cut Off';
            $funnelPeriod = 'Semua Waktu';
            $comparisonLabel = 'kumulatif';
        } else {
            // Default: year (Tahun Ini)
            $range = 'year';
            $timeframeTitle = 'Performa Tahun Ini';
            $dateSubtitle = '01 Jan ' . $now->year . ' – 31 Des ' . $now->year;
            $funnelPeriod = 'Tahun Ini · ' . $dateSubtitle;

            $startYear = $now->copy()->startOfYear();
            $endYear = $now->copy()->endOfYear();
            $applyDateRange($query, $startYear, $endYear);
            $applyDateRange($prevQuery, $startYear->copy()->subYear(), $endYear->copy()->subYear());
            $comparisonLabel = 'dari tahun lalu';
        }

        // Perhitungan Metrik Utama (1 query agregasi per periode, abaikan pesanan dibatalkan pembeli)
        $metricCols = "
            COALESCE(SUM(est_net_income), 0) as total_omset,
            COALESCE(SUM(marketplace_net_payout), 0) as total_net_payout,
            COUNT(CASE WHEN order_status NOT LIKE '%Batal%' AND order_status NOT LIKE '%Cancel%' THEN 1 END) as total_orders,
            COALESCE(SUM(CASE WHEN shipping_courier IS NOT NULL AND shipping_courier != '' AND order_status NOT LIKE '%Batal%' AND order_status NOT LIKE '%Cancel%' THEN 1 ELSE 0 END), 0) as total_pengiriman
        ";

        $currentStats = (clone $query)->selectRaw($metricCols)->first();
        $omset = (float) ($currentStats->total_omset ?? 0);
        $netPayout = (float) ($currentStats->total_net_payout ?? 0);
        $totalOrders = (int) ($currentStats->total_orders ?? 0);
        $pengiriman = (int) ($currentStats->total_pengiriman ?? 0);

        // Data Periode Sebelumnya (lewati untuk 'all' karena tidak dibandingkan)
        $prevOmset = 0.0;
        $prevNetPayout = 0.0;
        $prevTotalOrders = 0;
        $prevPengiriman = 0;
        if ($range !== 'all') {
            $prevStats = (clone $prevQuery)->selectRaw($metricCols)->first();
            $prevOmset = (float) ($prevStats->total_omset ?? 0);
            $prevNetPayout = (float) ($prevStats->total_net_payout ?? 0);
            $prevTotalOrders = (int) ($prevStats->total_orders ?? 0);
            $prevPengiriman = (int) ($prevStats->total_pengiriman ?? 0);
        }

        $calcChange = function ($current, $prev) use ($range) {
            if ($range === 'all' || $prev == 0) {
                return '0% ';
            }
            $diff = (($current - $prev) / $prev) * 100;
            $sign = $diff >= 0 ? '+' : '';
            return $sign . round($diff, 1) . '% ';
        };

        // 2. Perhitungan Profit Funnel
        $hpp = $omset * 0.564; // Modal ~56.4% sesuai rasio standar
        $labaKotor = max(0, $omset - $hpp);
        $labaBersih = $netPayout > 0 ? $netPayout : $labaKotor;
        $marginPercent = $omset > 0 ? round(($labaBersih / $omset) * 100, 1) : 43.6;
        $hppPercent = $omset > 0 ? round(($hpp / $omset) * 100, 1) : 56.4;

        $profitFunnel = [
            'period'          => $funnelPeriod,
            'margin'          => $marginPercent,
            'labaBersih'      => $labaBersih,
            'labaKotor'       => $labaKotor,
            'labaKotorPercent'=> $marginPercent,
            'omset'           => $omset,
            'omsetPercent'    => 100.0,
            'hpp'             => $hpp,
            'hppPercent'      => $hppPercent,
            'biayaOps'        => 0.0,
            'biayaOpsPercent' => 0.0,
            'ongkir'          => 0.0,
            'ongkirPercent'   => 0.0,
        ];

        // 3. Tren Volume & Penjualan Harian (14 Hari Transaksi Terakhir, lookback 120 hari + cache 60s)
        CutOffOrder::ensurePerformanceIndexesOnce();
        $cacheVer = CutOffOrder::getCacheVersion();

        $computeDailyTrend = static function () use ($channel): array {
            $recentCutoff = Carbon::now('Asia/Jakarta')->subDays(120)->toDateString();

            $runTrend = static function (string $fromDate) use ($channel): array {
                $dailyTrendQuery = CutOffOrder::query()->onlyProcessed();
                if ($channel && $channel !== 'all') {
                    $dailyTrendQuery->where('channel', $channel);
                }

                // Abaikan pesanan yang dibatalkan
                $dailyTrendQuery->where(function ($q) {
                    $q->whereNull('order_status')
                      ->orWhere(function ($s) {
                          $s->where('order_status', 'not like', '%Batal%')
                            ->where('order_status', 'not like', '%Cancel%');
                      });
                });

                return $dailyTrendQuery
                    ->select(
                        DB::raw('DATE(COALESCE(processed_at, order_date)) as date'),
                        DB::raw('count(*) as order_count'),
                        DB::raw('coalesce(sum(est_net_income), 0) as total_income')
                    )
                    ->where(function ($q) use ($fromDate) {
                        $q->where(function ($p) use ($fromDate) {
                            $p->whereNotNull('processed_at')
                              ->where('processed_at', '>=', $fromDate);
                        })->orWhere(function ($o) use ($fromDate) {
                            $o->whereNull('processed_at')
                              ->where('order_date', '>=', $fromDate);
                        });
                    })
                    ->where('order_date', '<', '2028-01-01')
                    ->groupBy('date')
                    ->orderByDesc('date')
                    ->limit(14)
                    ->get()
                    ->sortBy('date')
                    ->values()
                    ->map(fn ($item) => [
                        'date'         => (string) $item->date,
                        'order_count'  => (int) $item->order_count,
                        'total_income' => (float) $item->total_income,
                    ])
                    ->toArray();
            };

            $trend = $runTrend($recentCutoff);
            if (count($trend) < 14) {
                $trend = $runTrend('2024-01-01');
            }

            return $trend;
        };

        $computeBreakdowns = static function () use ($query): array {
            $channelBreakdown = (clone $query)
                ->select('channel', DB::raw('count(*) as count'), DB::raw('coalesce(sum(est_net_income), 0) as total_income'))
                ->whereNotNull('channel')
                ->where('channel', '!=', '')
                ->groupBy('channel')
                ->orderByDesc('count')
                ->limit(6)
                ->get()
                ->map(fn ($item) => [
                    'channel'      => (string) $item->channel,
                    'count'        => (int) $item->count,
                    'total_income' => (float) $item->total_income,
                ])
                ->toArray();

            $courierBreakdown = (clone $query)
                ->select('shipping_courier', DB::raw('count(*) as count'), DB::raw('coalesce(sum(est_net_income), 0) as total_income'))
                ->whereNotNull('shipping_courier')
                ->where('shipping_courier', '!=', '')
                ->groupBy('shipping_courier')
                ->orderByDesc('count')
                ->limit(6)
                ->get()
                ->map(fn ($item) => [
                    'shipping_courier' => (string) $item->shipping_courier,
                    'count'            => (int) $item->count,
                    'total_income'     => (float) $item->total_income,
                ])
                ->toArray();

            $rawTopProducts = (clone $query)
                ->select(
                    'sku_utama',
                    'product_name',
                    DB::raw('count(*) as total_orders'),
                    DB::raw('sum(qty) as total_qty'),
                    DB::raw('coalesce(sum(est_net_income), 0) as total_omset')
                )
                ->whereNotNull('sku_utama')
                ->where('sku_utama', '!=', '')
                ->groupBy('sku_utama', 'product_name')
                ->orderByDesc('total_omset')
                ->limit(6)
                ->get();

            $maxProfit = 0;
            $topProducts = [];
            foreach ($rawTopProducts as $idx => $item) {
                $prodOmset = (float) $item->total_omset;
                $prodModal = $prodOmset * 0.564;
                $prodLaba = max(0, $prodOmset - $prodModal);

                if ($idx === 0) {
                    $maxProfit = $prodLaba > 0 ? $prodLaba : 1;
                }

                $topProducts[] = [
                    'rank'    => $idx + 1,
                    'sku'     => $item->sku_utama,
                    'name'    => $item->product_name ?: $item->sku_utama,
                    'orders'  => (int) $item->total_orders,
                    'qty'     => (int) $item->total_qty,
                    'omset'   => $prodOmset,
                    'modal'   => $prodModal,
                    'laba'    => $prodLaba,
                    'percent' => $maxProfit > 0 ? min(100, round(($prodLaba / $maxProfit) * 100)) : 0,
                ];
            }

            return [
                'channelBreakdown' => $channelBreakdown,
                'courierBreakdown' => $courierBreakdown,
                'topProducts'      => $topProducts,
            ];
        };

        $todayStr = Carbon::now('Asia/Jakarta')->toDateString();
        if (app()->runningUnitTests()) {
            $dailyTrend = $computeDailyTrend();
            $breakdowns = $computeBreakdowns();
        } else {
            try {
                $store = \Illuminate\Support\Facades\Cache::store('file');
                $dailyTrend = $store->remember(
                    'dashboard_daily_trend_v2_' . md5("{$cacheVer}|{$channel}|{$todayStr}"),
                    60,
                    $computeDailyTrend
                );
                $breakdowns = $store->remember(
                    'dashboard_breakdowns_v2_' . md5("{$cacheVer}|{$range}|{$channel}|{$todayStr}"),
                    30,
                    $computeBreakdowns
                );
            } catch (\Throwable) {
                $dailyTrend = $computeDailyTrend();
                $breakdowns = $computeBreakdowns();
            }
        }

        $channelBreakdown = $breakdowns['channelBreakdown'];
        $courierBreakdown = $breakdowns['courierBreakdown'];
        $topProducts      = $breakdowns['topProducts'];

        // Metrik Ringkasan untuk Card
        $summary = [
            'omset'            => $omset,
            'omsetChange'      => $calcChange($omset, $prevOmset) . $comparisonLabel,
            'labaBersih'       => $labaBersih,
            'labaChange'       => $calcChange($labaBersih, $prevNetPayout > 0 ? $prevNetPayout : ($prevOmset - ($prevOmset * 0.564))) . $comparisonLabel,
            'totalOrders'      => $totalOrders,
            'ordersChange'     => $calcChange($totalOrders, $prevTotalOrders) . $comparisonLabel,
            'pengiriman'       => $pengiriman,
            'pengirimanChange' => $calcChange($pengiriman, $prevPengiriman) . $comparisonLabel,
        ];

        $userStats = User::query()
            ->selectRaw("COUNT(*) as total_users, COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active_users")
            ->first();

        return Inertia::render('Dashboard', [
            'filters' => [
                'range'   => $range,
                'channel' => $channel,
            ],
            'timeframeTitle'   => $timeframeTitle,
            'dateSubtitle'     => $dateSubtitle,
            'channels'         => $availableChannels,
            'summary'          => $summary,
            'profitFunnel'     => $profitFunnel,
            'dailyTrend'       => $dailyTrend,
            'channelBreakdown' => $channelBreakdown,
            'courierBreakdown' => $courierBreakdown,
            'topProducts'      => $topProducts,
            'stats'            => [
                'totalUsers'  => (int) ($userStats->total_users ?? 0),
                'activeUsers' => (int) ($userStats->active_users ?? 0),
                'totalRoles'  => Role::count(),
                'appName'     => config('app.name'),
            ],
        ]);
    }
}
