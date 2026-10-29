<?php

namespace App\Http\Controllers;

use App\Models\CutOffOrder;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __invoke(Request $request): \Inertia\Response
    {
        Gate::authorize('dashboard.view');

        $range = $request->query('range', 'all'); // 'all', 'today', 'yesterday', '7days', '30days', 'this_month', 'custom'
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        $todayStr = now()->toDateString();
        $yesterdayStr = now()->subDay()->toDateString();

        // 1. Metrik Khusus HARI INI (Realtime Live Card)
        $todayQuery = CutOffOrder::whereDate('order_date', $todayStr);
        $todayOrders = (clone $todayQuery)->count();
        $todayEstIncome = (float) (clone $todayQuery)->sum('est_net_income');
        $todayNetPayout = (float) (clone $todayQuery)->sum('marketplace_net_payout');
        $todayOos = (clone $todayQuery)->where('info_gudang', 'like', '%OOS%')->count();
        $todayRj = (clone $todayQuery)->where(function ($q) {
            $q->where('order_status', 'like', '%RJ%')
              ->orWhere('order_status', 'like', '%Retur%');
        })->count();
        $todayDpp = (clone $todayQuery)->whereNotNull('dpp_number')->where('dpp_number', '!=', '')->count();

        // 2. Filter Builder untuk Periode Terpilih
        $periodQuery = CutOffOrder::query();

        if ($range === 'today') {
            $periodQuery->whereDate('order_date', $todayStr);
        } elseif ($range === 'yesterday') {
            $periodQuery->whereDate('order_date', $yesterdayStr);
        } elseif ($range === '7days') {
            $periodQuery->whereDate('order_date', '>=', now()->subDays(6)->toDateString())
                        ->whereDate('order_date', '<=', $todayStr);
        } elseif ($range === '30days') {
            $periodQuery->whereDate('order_date', '>=', now()->subDays(29)->toDateString())
                        ->whereDate('order_date', '<=', $todayStr);
        } elseif ($range === 'this_month') {
            $periodQuery->whereYear('order_date', now()->year)
                        ->whereMonth('order_date', now()->month);
        } elseif ($range === 'custom') {
            if ($dateFrom) {
                $periodQuery->whereDate('order_date', '>=', $dateFrom);
            }
            if ($dateTo) {
                $periodQuery->whereDate('order_date', '<=', $dateTo);
            }
        }

        // Metrik Sesuai Periode
        $totalOrders = (clone $periodQuery)->count();
        $totalOos = (clone $periodQuery)->where('info_gudang', 'like', '%OOS%')->count();
        $totalRj = (clone $periodQuery)->where(function ($q) {
            $q->where('order_status', 'like', '%RJ%')
              ->orWhere('order_status', 'like', '%Retur%');
        })->count();
        $totalDpp = (clone $periodQuery)->whereNotNull('dpp_number')->where('dpp_number', '!=', '')->count();
        $estNetIncome = (float) (clone $periodQuery)->sum('est_net_income');
        $netPayout = (float) (clone $periodQuery)->sum('marketplace_net_payout');

        // Breakdown Marketplace / Channel
        $channelBreakdown = (clone $periodQuery)
            ->select('channel', DB::raw('count(*) as count'), DB::raw('coalesce(sum(est_net_income), 0) as total_income'))
            ->whereNotNull('channel')
            ->where('channel', '!=', '')
            ->groupBy('channel')
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        // Breakdown Kurir / Ekspedisi
        $courierBreakdown = (clone $periodQuery)
            ->select('shipping_courier', DB::raw('count(*) as count'), DB::raw('coalesce(sum(est_net_income), 0) as total_income'))
            ->whereNotNull('shipping_courier')
            ->where('shipping_courier', '!=', '')
            ->groupBy('shipping_courier')
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        // Trend Harian (14 hari terakhir untuk grafik batang / tren)
        $dailyTrend = CutOffOrder::select(
                DB::raw('DATE(order_date) as date'),
                DB::raw('count(*) as order_count'),
                DB::raw('coalesce(sum(est_net_income), 0) as total_income')
            )
            ->whereDate('order_date', '>=', now()->subDays(13)->toDateString())
            ->whereDate('order_date', '<=', $todayStr)
            ->groupBy('date')
            ->orderBy('date', 'asc')
            ->get();

        // Pesanan Terbaru (untuk monitoring cepat)
        $recentOrders = (clone $periodQuery)
            ->select('id', 'order_number', 'order_date', 'channel', 'buyer_username', 'shipping_courier', 'order_status', 'info_gudang', 'est_net_income', 'dpp_number')
            ->orderByDesc('order_date')
            ->orderByDesc('id')
            ->limit(6)
            ->get();

        $totalUsers = User::count();
        $activeUsers = User::where('status', 'active')->count();
        $totalRoles = Role::count();

        return Inertia::render('Dashboard', [
            'filters' => [
                'range'     => $range,
                'date_from' => $dateFrom ?? '',
                'date_to'   => $dateTo ?? '',
            ],
            'todayStats' => [
                'date'         => $todayStr,
                'orders'       => $todayOrders,
                'estNetIncome' => $todayEstIncome,
                'netPayout'    => $todayNetPayout,
                'oos'          => $todayOos,
                'rj'           => $todayRj,
                'dpp'          => $todayDpp,
            ],
            'periodStats' => [
                'range'        => $range,
                'totalOrders'  => $totalOrders,
                'totalOos'     => $totalOos,
                'totalRj'      => $totalRj,
                'totalDpp'     => $totalDpp,
                'estNetIncome' => $estNetIncome,
                'netPayout'    => $netPayout,
            ],
            // Backward-compatible cutOff prop
            'cutOff' => [
                'totalOrders'      => $totalOrders,
                'totalOos'         => $totalOos,
                'totalRj'          => $totalRj,
                'totalDpp'         => $totalDpp,
                'estNetIncome'     => $estNetIncome,
                'netPayout'        => $netPayout,
                'channelBreakdown' => $channelBreakdown,
            ],
            'channelBreakdown' => $channelBreakdown,
            'courierBreakdown' => $courierBreakdown,
            'dailyTrend'       => $dailyTrend,
            'recentOrders'     => $recentOrders,
            'stats'            => [
                'totalUsers'  => $totalUsers,
                'activeUsers' => $activeUsers,
                'totalRoles'  => $totalRoles,
                'database'    => config('database.connections.mysql.database'),
                'appName'     => config('app.name'),
            ],
        ]);
    }
}
