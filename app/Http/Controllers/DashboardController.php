<?php

namespace App\Http\Controllers;

use App\Services\Reports\DashboardReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardReportService $dashboardService) {}

    public function __invoke(Request $request): \Inertia\Response
    {
        Gate::authorize('dashboard.view');

        $range = $request->get('range', 'this_month');
        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');
        $channel  = $request->get('channel') ?: null;

        $metrics = $this->dashboardService->getDashboardMetrics($range, $dateFrom, $dateTo, $channel);

        return Inertia::render('Dashboard', [
            'metrics' => $metrics,
            'filters' => [
                'range'     => $range,
                'date_from' => $dateFrom,
                'date_to'   => $dateTo,
                'channel'   => $channel,
            ],
        ]);
    }
}
