<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    public function index(): Response
    {
        Gate::authorize('role.view');

        $roles = Role::with(['permissions', 'users'])
            ->orderBy('name')
            ->get()
            ->map(function ($role) {
                return [
                    'id'               => $role->id,
                    'name'             => $role->name,
                    'description'      => $role->description,
                    'user_count'       => $role->users->count(),
                    'permission_count' => $role->permissions->count(),
                    'permissions'      => $role->permissions->pluck('name')->toArray(),
                ];
            });

        $permissions = Permission::orderBy('name')->get(['id', 'name', 'description']);

        // Kelompokkan permission berdasarkan prefix (modul)
        $groupedPermissions = $permissions->groupBy(function ($permission) {
            return explode('.', $permission->name)[0];
        });

        return Inertia::render('Roles/Index', [
            'roles'              => $roles,
            'groupedPermissions' => $groupedPermissions,
        ]);
    }
}
