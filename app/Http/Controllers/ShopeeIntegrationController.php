<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Services\ShopeeSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class ShopeeIntegrationController extends Controller
{
    public function __construct(private readonly ShopeeSyncService $syncService) {}

    /**
     * Display Shopee Integration Settings & Sync Page.
     */
    public function index(Request $request): \Inertia\Response
    {
        Gate::authorize('user.view'); // Only admin/authorized operators

        $account = ShopeeAccount::firstOrCreate(
            ['id' => 1],
            [
                'account_name'       => 'Toko Shopee Utama',
                'connection_status'  => 'disconnected',
                'status'             => 'active',
            ]
        );

        return Inertia::render('Shopee/Index', [
            'account'     => $account->toSafeArray(),
            'callbackUrl' => url('/marketplace/shopee/callback'),
        ]);
    }

    /**
     * Save Shopee API credentials (Partner ID, Partner Key, Shop ID).
     */
    public function saveCredentials(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $validated = $request->validate([
            'account_name' => 'required|string|max:100',
            'partner_id'   => 'required|string|max:100',
            'partner_key'  => 'required|string|max:255',
            'shop_id'      => 'nullable|string|max:100',
        ]);

        $account = ShopeeAccount::firstOrCreate(['id' => 1]);
        $account->update([
            'account_name' => $validated['account_name'],
            'partner_id'   => trim($validated['partner_id']),
            'partner_key'  => trim($validated['partner_key']),
            'shop_id'      => $validated['shop_id'] ? trim($validated['shop_id']) : $account->shop_id,
            'created_by'   => $request->user()?->id,
        ]);

        return back()->with('success', 'Kredensial Shopee API berhasil disimpan.');
    }

    /**
     * Redirect to Shopee OAuth authorization URL.
     */
    public function authorizeShop(Request $request)
    {
        Gate::authorize('user.view');

        $account = ShopeeAccount::firstOrFail();
        $redirectUrl = url('/marketplace/shopee/callback');

        try {
            $url = $this->syncService->getAuthorizationUrl($account, $redirectUrl);
            return Inertia::location($url);
        } catch (\Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Handle OAuth callback from Shopee.
     */
    public function handleCallback(Request $request): \Illuminate\Http\RedirectResponse
    {
        $code   = $request->query('code');
        $shopId = $request->query('shop_id');

        if (empty($code) || empty($shopId)) {
            return redirect('/marketplace/shopee')->with('error', 'Otorisasi Shopee gagal atau dibatalkan.');
        }

        $account = ShopeeAccount::firstOrFail();

        try {
            $this->syncService->exchangeCode($account, $code, $shopId);
            return redirect('/marketplace/shopee')->with('success', "Toko Shopee (Shop ID: {$shopId}) berhasil dihubungkan!");
        } catch (\Exception $e) {
            return redirect('/marketplace/shopee')->with('error', $e->getMessage());
        }
    }

    /**
     * Test connection to Shopee API.
     */
    public function testConnection(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $account = ShopeeAccount::firstOrFail();
        $res = $this->syncService->testConnection($account);

        if ($res['success']) {
            return back()->with('success', $res['message']);
        }

        return back()->with('error', $res['message']);
    }

    /**
     * Trigger order sync from Shopee API directly to cut_off_orders.
     */
    public function syncNow(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $days = (int) $request->input('days', 7);
        if ($days < 1 || $days > 14) {
            $days = 7;
        }

        $timeTo = time();
        $timeFrom = $timeTo - ($days * 86400);

        $account = ShopeeAccount::firstOrFail();

        if (empty($account->partner_id) || empty($account->access_token)) {
            return back()->with('error', 'Akun Shopee belum terhubung. Harap isi kredensial dan hubungkan toko terlebih dahulu.');
        }

        try {
            $result = $this->syncService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
            return back()->with('success', $result['message']);
        } catch (\Exception $e) {
            return back()->with('error', 'Gagal sinkronisasi: ' . $e->getMessage());
        }
    }
}
