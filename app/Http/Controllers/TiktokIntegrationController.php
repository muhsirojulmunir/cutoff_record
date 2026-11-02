<?php

namespace App\Http\Controllers;

use App\Models\TiktokAccount;
use App\Services\TiktokSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class TiktokIntegrationController extends Controller
{
    public function __construct(private readonly TiktokSyncService $syncService) {}

    /**
     * Display TikTok Shop Integration Settings & Sync Page.
     */
    public function index(Request $request): \Inertia\Response
    {
        Gate::authorize('user.view');

        try {
            \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('TikTok index auto-migrate notice: ' . $e->getMessage());
        }

        $account = TiktokAccount::firstOrCreate(
            ['id' => 1],
            [
                'account_name'       => 'RecordShoesOfficial',
                'app_key'            => '6lpakhma3ecn8',
                'service_id'         => '7702820460932712212',
                'shop_id'            => '7494083438199277309',
                'connection_status'  => 'disconnected',
                'status'             => 'active',
            ]
        );

        return Inertia::render('Tiktok/Index', [
            'account'     => $account->toSafeArray(),
            'callbackUrl' => url('/marketplace/tiktok/callback'),
        ]);
    }

    /**
     * Save TikTok API credentials (App Key, App Secret, Service ID, Shop ID).
     */
    public function saveCredentials(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $validated = $request->validate([
            'account_name' => 'required|string|max:100',
            'app_key'      => 'required|string|max:100',
            'app_secret'   => 'nullable|string|max:255',
            'service_id'   => 'nullable|string|max:100',
            'shop_id'      => 'nullable|string|max:100',
        ]);

        $account = TiktokAccount::firstOrCreate(['id' => 1]);

        $updateData = [
            'account_name' => $validated['account_name'],
            'app_key'      => trim($validated['app_key']),
            'service_id'   => ! empty($validated['service_id']) ? trim($validated['service_id']) : $account->service_id,
            'shop_id'      => ! empty($validated['shop_id']) ? trim($validated['shop_id']) : $account->shop_id,
            'created_by'   => $request->user()?->id,
        ];

        if (! empty($validated['app_secret'])) {
            $updateData['app_secret'] = trim($validated['app_secret']);
        }

        $account->update($updateData);

        return back()->with('success', 'Kredensial TikTok Shop API berhasil disimpan.');
    }

    /**
     * Redirect to TikTok OAuth authorization URL.
     */
    public function authorizeShop(Request $request)
    {
        Gate::authorize('user.view');

        $account = TiktokAccount::firstOrFail();
        $redirectUrl = url('/marketplace/tiktok/callback');

        try {
            $url = $this->syncService->getAuthorizationUrl($account, $redirectUrl);
            return Inertia::location($url);
        } catch (\Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Handle OAuth callback from TikTok Shop.
     */
    public function handleCallback(Request $request): \Illuminate\Http\RedirectResponse
    {
        $code = $request->query('code') ?: $request->query('auth_code');

        if (empty($code)) {
            return redirect('/marketplace/tiktok')->with('error', 'Otorisasi TikTok Shop dibatalkan atau tidak menerima kode otorisasi.');
        }

        $account = TiktokAccount::firstOrFail();

        try {
            $this->syncService->exchangeCode($account, $code);
            $shopName = $account->account_name ?: 'Toko TikTok';
            return redirect('/marketplace/tiktok')->with('success', "Toko TikTok ({$shopName}) berhasil dihubungkan!");
        } catch (\Exception $e) {
            return redirect('/marketplace/tiktok')->with('error', $e->getMessage());
        }
    }

    /**
     * Manual exchange of authorization code or full callback URL.
     */
    public function manualExchange(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $input = trim((string) $request->input('code_or_url', ''));

        if (empty($input)) {
            return back()->with('error', 'Harap masukkan kode otorisasi (auth_code) atau tautan callback.');
        }

        // Ekstrak code jika user menempelkan full URL
        $code = $input;
        if (str_contains($input, 'code=') || str_contains($input, 'auth_code=')) {
            parse_str(parse_url($input, PHP_URL_QUERY) ?? '', $queryParams);
            $code = $queryParams['code'] ?? $queryParams['auth_code'] ?? $input;
        }

        $account = TiktokAccount::firstOrFail();

        try {
            $this->syncService->exchangeCode($account, $code);
            $shopName = $account->account_name ?: 'Toko TikTok';
            return back()->with('success', "Toko TikTok ({$shopName}) berhasil dihubungkan!");
        } catch (\Exception $e) {
            return back()->with('error', 'Gagal menukar kode otorisasi: ' . $e->getMessage());
        }
    }

    /**
     * Test connection to TikTok API.
     */
    public function testConnection(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $account = TiktokAccount::firstOrFail();
        $res = $this->syncService->testConnection($account);

        if ($res['success']) {
            return back()->with('success', $res['message']);
        }

        return back()->with('error', $res['message']);
    }

    /**
     * Trigger order sync from TikTok Shop API directly to cut_off_orders.
     */
    public function syncNow(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('user.view');

        $days = (int) $request->input('days', 7);
        if ($days < 1) {
            $days = 7;
        } elseif ($days > 90) {
            $days = 90;
        }

        @set_time_limit(300);

        try {
            \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('TikTok syncNow auto-migrate notice: ' . $e->getMessage());
        }

        $timeTo = time();
        $timeFrom = $timeTo - ($days * 86400);

        $account = TiktokAccount::firstOrFail();

        if (empty($account->app_key) || empty($account->access_token)) {
            return back()->with('error', 'Akun TikTok Shop belum terhubung. Harap lengkapi kredensial dan hubungkan toko terlebih dahulu.');
        }

        try {
            $result = $this->syncService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
            return back()->with('success', $result['message']);
        } catch (\Exception $e) {
            return back()->with('error', 'Gagal sinkronisasi pesanan TikTok: ' . $e->getMessage());
        }
    }
}

