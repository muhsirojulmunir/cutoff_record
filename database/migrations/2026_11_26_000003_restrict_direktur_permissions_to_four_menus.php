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
            if ($direkturId) {
                $allowedIds = DB::table('permissions')
                    ->whereIn('name', [
                        'orders.cutoff',
                        'returns.online',
                        'content_reports.view',
                        'content_reports.create',
                        'content_reports.review',
                    ])
                    ->pluck('id')
                    ->all();

                DB::table('role_permission')->where('role_id', $direkturId)->delete();

                $rows = array_map(static fn ($pid) => [
                    'role_id'       => $direkturId,
                    'permission_id' => $pid,
                ], $allowedIds);

                if (! empty($rows)) {
                    DB::table('role_permission')->insert($rows);
                }
            }
        }
    }

    public function down(): void
    {
        // Tidak perlu mengembalikan permission operasional lama secara otomatis
    }
};
