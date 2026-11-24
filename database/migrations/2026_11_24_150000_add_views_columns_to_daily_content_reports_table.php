<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('daily_content_reports')) {
            Schema::table('daily_content_reports', function (Blueprint $table) {
                if (!Schema::hasColumn('daily_content_reports', 'ig_views')) {
                    $table->unsignedBigInteger('ig_views')->default(0)->after('notes');
                }
                if (!Schema::hasColumn('daily_content_reports', 'tiktok_views')) {
                    $table->unsignedBigInteger('tiktok_views')->default(0)->after('ig_views');
                }
                if (!Schema::hasColumn('daily_content_reports', 'shopee_views')) {
                    $table->unsignedBigInteger('shopee_views')->default(0)->after('tiktok_views');
                }
                if (!Schema::hasColumn('daily_content_reports', 'total_views')) {
                    $table->unsignedBigInteger('total_views')->default(0)->after('shopee_views');
                }
                if (!Schema::hasColumn('daily_content_reports', 'views_synced_at')) {
                    $table->timestamp('views_synced_at')->nullable()->after('total_views');
                }
                if (!Schema::hasColumn('daily_content_reports', 'views_sync_status')) {
                    $table->string('views_sync_status', 30)->default('pending')->after('views_synced_at');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('daily_content_reports')) {
            Schema::table('daily_content_reports', function (Blueprint $table) {
                $columns = ['ig_views', 'tiktok_views', 'shopee_views', 'total_views', 'views_synced_at', 'views_sync_status'];
                foreach ($columns as $column) {
                    if (Schema::hasColumn('daily_content_reports', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
