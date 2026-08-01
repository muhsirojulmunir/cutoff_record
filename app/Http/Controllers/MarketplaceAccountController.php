<?php

namespace App\Http\Controllers;

use App\Models\MarketplaceAccount;
use App\Services\Marketplace\Shopee\ShopeeApiService;
use App\Services\Marketplace\TikTok\TikTokShopApiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class MarketplaceAccountController extends Controller
{
    public function __construct(
        private readonly ShopeeApiService $shopeeService,
        private readonly TikTokShopApiService $tikTokService,
    ) {}

    public function index(): \Inertia\Response
    {
        Gate::authorize('marketplace.view');

        $accounts = MarketplaceAccount::with('creator')
            ->latest()
            ->paginate(20);

        return Inertia::render('Marketplace/Accounts/Index', [
            'accounts' => $accounts,
        ]);
    }

    public function create(): \Inertia\Response
    {
        Gate::authorize('marketplace.account.create');

        return Inertia::render('Marketplace/Accounts/Create', [
            'marketplaces' => MarketplaceAccount::MARKETPLACES,
        ]);
    }

    public function store(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.create');

        $validated = $request->validate([
            'marketplace'  => 'required|string|in:' . implode(',', MarketplaceAccount::MARKETPLACES),
            'account_name' => 'required|string|max:255',
            'shop_id'      => 'nullable|string|max:255',
            'shop_name'    => 'nullable|string|max:255',
        ]);

        MarketplaceAccount::create([
            ...$validated,
            'status'             => 'active',
            'credentials_status' => 'not_configured',
            'connection_status'  => 'disconnected',
            'created_by'         => $request->user()->id,
        ]);

        return redirect()->route('marketplace.accounts.index')
            ->with('success', 'Akun marketplace berhasil ditambahkan.');
    }

    public function show(MarketplaceAccount $marketplaceAccount): \Inertia\Response
    {
        Gate::authorize('marketplace.view');

        $marketplaceAccount->load(['syncLogs' => fn ($q) => $q->latest()->limit(10)]);
        $ordersCount = $marketplaceAccount->orders()->count();

        return Inertia::render('Marketplace/Accounts/Show', [
            'account'      => $marketplaceAccount->toSafeArray(),
            'ordersCount'  => $ordersCount,
        ]);
    }

    public function edit(MarketplaceAccount $marketplaceAccount): \Inertia\Response
    {
        Gate::authorize('marketplace.account.edit');

        return Inertia::render('Marketplace/Accounts/Edit', [
            'account'      => $marketplaceAccount->toSafeArray(),
            'marketplaces' => MarketplaceAccount::MARKETPLACES,
        ]);
    }

    public function update(Request $request, MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.edit');

        $validated = $request->validate([
            'account_name' => 'required|string|max:255',
            'shop_id'      => 'nullable|string|max:255',
            'shop_name'    => 'nullable|string|max:255',
        ]);

        $marketplaceAccount->update($validated);

        return redirect()->route('marketplace.accounts.show', $marketplaceAccount)
            ->with('success', 'Akun marketplace berhasil diperbarui.');
    }

    public function connectCredentials(Request $request, MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.edit');

        $validated = $request->validate([
            'access_token'  => 'required|string',
            'refresh_token' => 'nullable|string',
            'app_key'       => 'nullable|string',
            'app_secret'    => 'nullable|string',
            'shop_id'       => 'nullable|string',
        ]);

        $credentials = [
            'access_token'  => $validated['access_token'],
            'refresh_token' => $validated['refresh_token'] ?? null,
            'app_key'       => $validated['app_key'] ?? null,
            'app_secret'    => $validated['app_secret'] ?? null,
        ];

        $marketplaceAccount->update([
            'credentials'       => $credentials,
            'shop_id'           => $validated['shop_id'] ?? $marketplaceAccount->shop_id,
            'credentials_status'=> 'configured',
            'connection_status' => 'connected',
            'last_connected_at' => now(),
            'last_sync_error'   => null,
        ]);

        return back()->with('success', 'Kredensial API marketplace berhasil disimpan secara aman.');
    }

    public function testConnection(MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.edit');

        $success = false;

        if ($marketplaceAccount->marketplace === 'shopee') {
            $success = $this->shopeeService->testConnection($marketplaceAccount);
        } elseif ($marketplaceAccount->marketplace === 'tiktok_shop') {
            $success = $this->tikTokService->testConnection($marketplaceAccount);
        }

        if ($success) {
            return back()->with('success', 'Koneksi ke API marketplace berhasil!');
        }

        return back()->with('error', 'Koneksi ke API marketplace gagal: ' . $marketplaceAccount->fresh()->last_sync_error);
    }

    public function disconnect(MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.edit');

        $marketplaceAccount->update([
            'credentials'       => null,
            'credentials_status'=> 'not_configured',
            'connection_status' => 'disconnected',
        ]);

        return back()->with('success', 'Koneksi akun marketplace berhasil diputuskan.');
    }

    public function deactivate(MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.deactivate');

        if ($marketplaceAccount->status === 'inactive') {
            return back()->with('error', 'Akun sudah dalam keadaan tidak aktif.');
        }

        $marketplaceAccount->update(['status' => 'inactive']);

        return redirect()->route('marketplace.accounts.index')
            ->with('success', 'Akun marketplace berhasil dinonaktifkan.');
    }

    public function activate(MarketplaceAccount $marketplaceAccount): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.account.edit');

        $marketplaceAccount->update(['status' => 'active']);

        return redirect()->route('marketplace.accounts.index')
            ->with('success', 'Akun marketplace berhasil diaktifkan kembali.');
    }
}
