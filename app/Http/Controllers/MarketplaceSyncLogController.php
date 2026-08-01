<?php

namespace App\Http\Controllers;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceSyncLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class MarketplaceSyncLogController extends Controller
{
    public function index(Request $request): \Inertia\Response
    {
        Gate::authorize('marketplace.sync.view');

        $query = MarketplaceSyncLog::with('account', 'creator')->latest('started_at');

        if ($request->filled('account_id')) {
            $query->where('marketplace_account_id', $request->account_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('sync_type')) {
            $query->where('sync_type', $request->sync_type);
        }

        $logs     = $query->paginate(20)->withQueryString();
        $accounts = MarketplaceAccount::all(['id', 'account_name', 'marketplace']);

        return Inertia::render('Marketplace/SyncLogs/Index', [
            'logs'      => $logs,
            'accounts'  => $accounts,
            'filters'   => $request->only(['account_id', 'status', 'sync_type']),
            'syncTypes' => MarketplaceSyncLog::SYNC_TYPES,
            'statuses'  => MarketplaceSyncLog::STATUSES,
        ]);
    }

    public function show(MarketplaceSyncLog $marketplaceSyncLog): \Inertia\Response
    {
        Gate::authorize('marketplace.sync.view');

        $marketplaceSyncLog->load('account', 'creator');

        return Inertia::render('Marketplace/SyncLogs/Show', [
            'log' => $marketplaceSyncLog,
        ]);
    }
}
