<?php

namespace App\Http\Controllers;

use App\Models\MarketplaceAccount;
use App\Services\Marketplace\MarketplaceSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class MarketplaceSyncController extends Controller
{
    public function __construct(private readonly MarketplaceSyncService $syncService) {}

    public function syncNow(Request $request, MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.sync.view');

        $validated = $request->validate([
            'date_from' => 'required|date',
            'date_to'   => 'required|date|after_or_equal:date_from',
        ]);

        $log = $this->syncService->syncOrders(
            $marketplaceAccount,
            $validated['date_from'] . ' 00:00:00',
            $validated['date_to'] . ' 23:59:59',
            $request->user()->id
        );

        if ($log->status === 'failed') {
            return back()->with('error', "Sinkronisasi gagal: {$log->error_message}");
        }

        return back()->with('success', "Sinkronisasi selesai. {$log->records_created} baru, {$log->records_updated} diperbarui, {$log->records_failed} gagal.");
    }
}
