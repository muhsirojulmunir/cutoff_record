<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Services\ShopeeBoostService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Throwable;

class ShopeeBoostController extends Controller
{
    public function __construct(
        protected ShopeeBoostService $boostService
    ) {}

    /**
     * Tampilkan halaman utama Naikkan Produk Shopee (Dashboard 5 Slot).
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorizeAccess($request);

        $account = $this->resolveShopeeAccount();
        $accountConnected = (bool) ($account && ! empty($account->access_token));

        $boostData = [
            'slots'           => [],
            'active_count'    => 0,
            'available_count' => 5,
            'raw_items'       => [],
        ];
        $errorMessage = null;

        if ($accountConnected) {
            try {
                $boostData = $this->boostService->getBoostedStatus($account);
            } catch (Throwable $e) {
                $errorMessage = $e->getMessage();
            }
        }

        return Inertia::render('Shopee/BoostProducts', [
            'account'         => $account ? [
                'id'                => $account->id,
                'account_name'      => $account->account_name,
                'shop_id'           => $account->shop_id,
                'connection_status' => $account->connection_status,
                'connected'         => $accountConnected,
            ] : null,
            'boostData'       => $boostData,
            'errorMessage'    => $errorMessage,
        ]);
    }

    /**
     * Endpoint API untuk memuat status 5 slot terkini secara realtime.
     */
    public function status(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);

        $account = $this->resolveShopeeAccount();
        if (! $account || empty($account->access_token)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung dengan token aktif.',
            ], 422);
        }

        try {
            $boostData = $this->boostService->getBoostedStatus($account);

            return response()->json([
                'status' => 'success',
                'data'   => $boostData,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Eksekusi menaikkan 1-5 produk ke urutan teratas Shopee.
     */
    public function boost(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);

        $validated = $request->validate([
            'item_ids'   => ['required', 'array', 'min:1', 'max:5'],
            'item_ids.*' => ['required', 'integer'],
        ]);

        $account = $this->resolveShopeeAccount();
        if (! $account || empty($account->access_token)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Toko Shopee belum terhubung dengan token aktif.',
            ], 422);
        }

        try {
            $result = $this->boostService->boostProducts($account, $validated['item_ids']);

            return response()->json([
                'status'  => 'success',
                'message' => $result['message'],
                'data'    => $result,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Endpoint pencarian produk Shopee lokal untuk modal pemilihan produk.
     */
    public function searchProducts(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);

        $account = $this->resolveShopeeAccount();
        if (! $account) {
            return response()->json(['products' => []]);
        }

        $keyword = (string) $request->query('keyword', '');
        $excludeIds = array_filter(array_map('intval', (array) $request->query('exclude_ids', [])));

        $products = $this->boostService->searchProducts($account, $keyword, $excludeIds);

        return response()->json([
            'products' => $products,
        ]);
    }

    /**
     * Batasi akses khusus Super Admin dan Admin.
     */
    private function authorizeAccess(Request $request): void
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        // Cek Super Admin atau Admin
        if ($user->isSuperAdmin()) {
            return;
        }

        if (method_exists($user, 'roles') && ($user->roles->contains('name', 'Super Admin') || $user->roles->contains('name', 'Admin'))) {
            return;
        }

        if (isset($user->role) && in_array($user->role->name ?? '', ['Super Admin', 'Admin'], true)) {
            return;
        }

        if (method_exists($user, 'hasPermission') && $user->hasPermission('products.boost')) {
            return;
        }

        abort(403, 'Akses menu Naikkan Produk khusus untuk peran Admin dan Super Admin.');
    }

    private function resolveShopeeAccount(): ?ShopeeAccount
    {
        return ShopeeAccount::where('status', 'active')->whereNotNull('access_token')->first()
            ?? ShopeeAccount::whereNotNull('access_token')->first()
            ?? ShopeeAccount::first();
    }
}
