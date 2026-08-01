<?php

namespace App\Providers;

use App\Models\Permission;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Dynamically register a Gate for every permission stored in the database.
        // Super Admin bypasses all checks via Gate::before.
        Gate::before(function ($user) {
            if ($user->isSuperAdmin()) {
                return true;
            }
        });

        // Use Gate::define with lazy callback — query permission on each check.
        // This avoids loading ALL permissions at boot and is safe during tests
        // where the DB may not yet exist or is in a transaction rollback state.
        Gate::guessPolicyNamesUsing(fn () => null);

        // Register a catch-all gate that checks user permissions per-ability.
        Gate::before(function ($user, $ability) {
            try {
                return $user->hasPermission($ability) ?: null;
            } catch (\Exception) {
                return null;
            }
        });
    }
}
