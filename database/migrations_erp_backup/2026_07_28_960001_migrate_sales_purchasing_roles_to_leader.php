<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Ensure Leader role exists
        $leaderRole = Role::firstOrCreate(
            ['name' => 'Leader'],
            ['description' => 'Supervisi operasional & approval pengajuan (PO, Petty Cash, Budget)']
        );

        // 2. Find Sales & Purchasing roles
        $oldRoles = Role::whereIn('name', ['Sales', 'Purchasing'])->get();

        if ($oldRoles->isNotEmpty()) {
            $oldRoleIds = $oldRoles->pluck('id')->toArray();

            // Migrate all users belonging to Sales/Purchasing to Leader
            User::whereIn('role_id', $oldRoleIds)->update([
                'role_id' => $leaderRole->id,
            ]);

            // Detach permissions and delete old roles
            foreach ($oldRoles as $role) {
                $role->permissions()->detach();
                $role->delete();
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No action needed for safety to avoid breaking role IDs
    }
};
