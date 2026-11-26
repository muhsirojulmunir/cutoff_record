<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('roles') && Schema::hasTable('permissions') && Schema::hasTable('role_permission')) {
            $direkturId = DB::table('roles')->where('name', 'Direktur')->value('id');
            $dashboardPermId = DB::table('permissions')->where('name', 'dashboard.view')->value('id');

            if ($direkturId && $dashboardPermId) {
                $exists = DB::table('role_permission')
                    ->where('role_id', $direkturId)
                    ->where('permission_id', $dashboardPermId)
                    ->exists();

                if (! $exists) {
                    DB::table('role_permission')->insert([
                        'role_id'       => $direkturId,
                        'permission_id' => $dashboardPermId,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        // Biarkan permission tetap ada saat rollback jika dibutuhkan
    }
};
