<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cut_off_returns', function (Blueprint $table) {
            if (! Schema::hasColumn('cut_off_returns', 'no_rj')) {
                $table->string('no_rj', 100)->nullable()->after('no_retur')->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('cut_off_returns', function (Blueprint $table) {
            if (Schema::hasColumn('cut_off_returns', 'no_rj')) {
                $table->dropColumn('no_rj');
            }
        });
    }
};
