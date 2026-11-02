<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cut_off_orders', function (Blueprint $table) {
            $table->string('cancel_by', 50)->nullable()->after('keterangan_solutif');
            $table->text('cancel_reason')->nullable()->after('cancel_by');
        });
    }

    public function down(): void
    {
        Schema::table('cut_off_orders', function (Blueprint $table) {
            $table->dropColumn(['cancel_by', 'cancel_reason']);
        });
    }
};
