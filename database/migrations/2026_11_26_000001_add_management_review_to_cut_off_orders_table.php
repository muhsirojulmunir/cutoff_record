<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('cut_off_orders')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                if (! Schema::hasColumn('cut_off_orders', 'management_flag')) {
                    $table->string('management_flag', 50)->nullable()->index()->after('dpp_number');
                }
                if (! Schema::hasColumn('cut_off_orders', 'management_note')) {
                    $table->text('management_note')->nullable()->after('management_flag');
                }
                if (! Schema::hasColumn('cut_off_orders', 'management_reviewed_by')) {
                    $table->unsignedBigInteger('management_reviewed_by')->nullable()->after('management_note');
                }
                if (! Schema::hasColumn('cut_off_orders', 'management_reviewed_by_name')) {
                    $table->string('management_reviewed_by_name', 120)->nullable()->after('management_reviewed_by');
                }
                if (! Schema::hasColumn('cut_off_orders', 'management_reviewed_at')) {
                    $table->timestamp('management_reviewed_at')->nullable()->after('management_reviewed_by_name');
                }
                if (! Schema::hasColumn('cut_off_orders', 'management_resolved_at')) {
                    $table->timestamp('management_resolved_at')->nullable()->after('management_reviewed_at');
                }
                if (! Schema::hasColumn('cut_off_orders', 'management_resolved_by_name')) {
                    $table->string('management_resolved_by_name', 120)->nullable()->after('management_resolved_at');
                }
            });
        }

        // Cabut akses Pesanan Shopee & TikTok dari role Direktur agar fokus ke manajemen
        if (Schema::hasTable('roles') && Schema::hasTable('permissions') && Schema::hasTable('role_permission')) {
            $direkturId = DB::table('roles')->where('name', 'Direktur')->value('id');
            if ($direkturId) {
                $revokePermissionIds = DB::table('permissions')
                    ->whereIn('name', ['orders.shopee', 'orders.tiktok'])
                    ->pluck('id')
                    ->all();

                if (! empty($revokePermissionIds)) {
                    DB::table('role_permission')
                        ->where('role_id', $direkturId)
                        ->whereIn('permission_id', $revokePermissionIds)
                        ->delete();
                }
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('cut_off_orders')) {
            Schema::table('cut_off_orders', function (Blueprint $table) {
                $cols = [
                    'management_resolved_by_name',
                    'management_resolved_at',
                    'management_reviewed_at',
                    'management_reviewed_by_name',
                    'management_reviewed_by',
                    'management_note',
                    'management_flag',
                ];
                foreach ($cols as $col) {
                    if (Schema::hasColumn('cut_off_orders', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }
    }
};
