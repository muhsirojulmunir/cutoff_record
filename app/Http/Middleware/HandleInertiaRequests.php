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

                ] : null,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error'   => $request->session()->get('error'),
            ],
            // Antrian tugas per-role untuk lonceng notifikasi di topbar & dashboard.
            'workQueue' => fn() => app(WorkQueueService::class)->getForUser($user),
        ];
    }
}
