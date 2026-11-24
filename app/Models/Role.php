<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $fillable = ['name', 'description'];

    /**
     * The permissions that belong to the role.
     */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permission');
    }

    /**
     * The users that belong to the role.
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * Ensure the 'Kreatif' role and its default permissions exist in the database.
     * Safe to call repeatedly (idempotent).
     */
    public static function ensureKreatifRoleExists(): void
    {
        try {
            $permView = Permission::firstOrCreate(
                ['name' => 'content_reports.view'],
                ['description' => 'Lihat Report Harian Konten']
            );

            $permCreate = Permission::firstOrCreate(
                ['name' => 'content_reports.create'],
                ['description' => 'Kirim Report Harian Konten']
            );

            $permReview = Permission::firstOrCreate(
                ['name' => 'content_reports.review'],
                ['description' => 'Review & Beri Feedback Report Konten']
            );

            $kreatifRole = static::firstOrCreate(
                ['name' => 'Kreatif'],
                ['description' => 'Tim Kreatif & Social Media']
            );

            if ($kreatifRole->wasRecentlyCreated || $kreatifRole->permissions()->count() === 0) {
                $permDashboard = Permission::where('name', 'dashboard.view')->first();
                $permCs = Permission::where('name', 'cs.view')->first();

                $kreatifPermissions = array_values(array_filter([
                    $permDashboard?->id,
                    $permCs?->id,
                    $permView->id,
                    $permCreate->id,
                ]));
                $kreatifRole->permissions()->sync($kreatifPermissions);
            }

            foreach (['Super Admin', 'Admin', 'Direktur', 'PIC'] as $roleName) {
                $r = static::where('name', $roleName)->first();
                if ($r) {
                    $r->permissions()->syncWithoutDetaching([$permView->id, $permCreate->id, $permReview->id]);
                }
            }
        } catch (\Throwable) {
            // Silently handle if table not ready or DB connection issue
        }
    }
}
