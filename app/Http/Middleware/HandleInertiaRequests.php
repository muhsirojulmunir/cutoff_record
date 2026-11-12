<?php

namespace App\Http\Middleware;

use App\Services\WorkQueueService;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        if ($user) {
            $user->loadMissing('role');
        }

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user ? [
                    'id'          => $user->id,
                    'name'        => $user->name,
                    'email'       => $user->email,
                    'status'      => $user->status,
                    'role'        => $user->role ? [
                        'id'   => $user->role->id,
                        'name' => $user->role->name,
                    ] : null,
                    'roles'       => method_exists($user, 'roles') && $user->roles->count() > 0 ? $user->roles->pluck('name')->toArray() : ($user->role ? [$user->role->name] : []),
                    'permissions' => $user->getPermissions(),
                    // Dipakai untuk aksi yang hanya boleh dilakukan Super Admin,
                    // misalnya hapus massal produk.
                    'is_super_admin' => $user->isSuperAdmin(),
                ] : null,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error'   => $request->session()->get('error'),
            ],
            // Antrian notifikasi stok Shopee (hanya tampil untuk Super Admin).
            // Closure membuat prop hanya dievaluasi saat benar-benar dibutuhkan (lewati partial reload & redirect).
            'workQueue' => function () use ($request): array {
                $currentUser = $request->user();
                if (! ($currentUser?->isSuperAdmin() ?? false)) {
                    return ['items' => [], 'total' => 0, 'critical' => 0];
                }

                return app(\App\Http\Controllers\ShopeeProductController::class)->getStockAlertWorkQueue();
            },
        ];
    }
}
