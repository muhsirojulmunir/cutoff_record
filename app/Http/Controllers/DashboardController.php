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

        // Parameter filter
        $range = $request->query('range', 'year'); // 'today', 'week', 'month', 'year', 'all'
        $channel = $request->query('channel', 'all');

        $now = Carbon::now();
        $todayStr = $now->toDateString();
        $yesterdayStr = $now->copy()->subDay()->toDateString();

        // Daftar Channel untuk Dropdown
        $availableChannels = CutOffOrder::query()
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

        // 1. Query Periode Terpilih
        $query = CutOffOrder::query();
        $prevQuery = CutOffOrder::query();

        if ($channel && $channel !== 'all') {
            $query->where('channel', $channel);
            $prevQuery->where('channel', $channel);
        }

        // Tentukan rentang tanggal & judul
        if ($range === 'today') {
            $timeframeTitle = 'Performa Hari Ini';
            $dateSubtitle = $now->isoFormat('dddd, D MMMM Y');
            $funnelPeriod = 'Hari Ini · ' . $now->isoFormat('D MMMM Y');

            $query->whereDate('order_date', $todayStr);
            $prevQuery->whereDate('order_date', $yesterdayStr);
            $comparisonLabel = 'dari kemarin';
        } elseif ($range === 'week') {
            $startWeek = $now->copy()->startOfWeek();
            $endWeek = $now->copy()->endOfWeek();
            $timeframeTitle = 'Performa Minggu Ini';
            $dateSubtitle = $startWeek->isoFormat('D MMMM') . ' – ' . $endWeek->isoFormat('D MMMM Y');
            $funnelPeriod = 'Minggu Ini · ' . $dateSubtitle;

            $query->whereDate('order_date', '>=', $startWeek->toDateString())
                  ->whereDate('order_date', '<=', $endWeek->toDateString());
            $prevQuery->whereDate('order_date', '>=', $startWeek->copy()->subWeek()->toDateString())
                      ->whereDate('order_date', '<=', $endWeek->copy()->subWeek()->toDateString());
            $comparisonLabel = 'dari minggu lalu';
        } elseif ($range === 'month') {
            $timeframeTitle = 'Performa Bulan Ini';
            $dateSubtitle = $now->isoFormat('MMMM Y');
            $funnelPeriod = 'Bulan Ini · ' . $dateSubtitle;

            $query->whereYear('order_date', $now->year)->whereMonth('order_date', $now->month);
            $prevMonth = $now->copy()->subMonth();
            $prevQuery->whereYear('order_date', $prevMonth->year)->whereMonth('order_date', $prevMonth->month);
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

            $query->whereYear('order_date', $now->year);
            $prevQuery->whereYear('order_date', $now->year - 1);
            $comparisonLabel = 'dari tahun lalu';
        }

        // Perhitungan Metrik Utama
        $omset = (float) (clone $query)->sum('est_net_income');
        $netPayout = (float) (clone $query)->sum('marketplace_net_payout');
        $totalOrders = (int) (clone $query)->count();
        $pengiriman = (int) (clone $query)->whereNotNull('shipping_courier')->where('shipping_courier', '!=', '')->count();

        // Data Periode Sebelumnya (Untuk Perbandingan % Tren)
        $prevOmset = (float) (clone $prevQuery)->sum('est_net_income');
        $prevNetPayout = (float) (clone $prevQuery)->sum('marketplace_net_payout');
        $prevTotalOrders = (int) (clone $prevQuery)->count();
        $prevPengiriman = (int) (clone $prevQuery)->whereNotNull('shipping_courier')->where('shipping_courier', '!=', '')->count();

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

        // 3. Tren Volume & Penjualan Harian (14 Hari Transaksi Terakhir)
        $dailyTrendQuery = CutOffOrder::query();
        if ($channel && $channel !== 'all') {
            $dailyTrendQuery->where('channel', $channel);
        }
        $dailyTrend = $dailyTrendQuery
            ->select(
                DB::raw('DATE(order_date) as date'),
                DB::raw('count(*) as order_count'),
                DB::raw('coalesce(sum(est_net_income), 0) as total_income')
            )
            ->whereYear('order_date', '>=', 2024)
            ->whereYear('order_date', '<=', 2027)
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

        // 4. Performa Toko & Marketplace
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

        // 5. Performa Jasa Pengiriman (Kurir)
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

        // 6. Produk Paling Menguntungkan
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
                'totalUsers'  => User::count(),
                'activeUsers' => User::where('status', 'active')->count(),
                'totalRoles'  => Role::count(),
                'appName'     => config('app.name'),
            ],
        ]);
    }
}
