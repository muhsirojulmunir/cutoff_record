<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Revisi permintaan klien: Sales Order langsung disetujui Finance.
 * Leader tetap bisa melihat & membuat SO, tapi tidak lagi memegang approval
 * (auto ACC Leader), sehingga izin approve dipindah ke role Finance.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->syncApproval(revokeFromLeader: true);
    }

    public function down(): void
    {
        $this->syncApproval(revokeFromLeader: false);
    }

    /**
     * @param bool $revokeFromLeader true = izin pindah ke Finance, false = kembalikan ke Leader.
     */
    protected function syncApproval(bool $revokeFromLeader): void
    {
        $approve = DB::table('permissions')->where('name', 'sales_order.approve')->first();
        $view    = DB::table('permissions')->where('name', 'sales_order.view')->first();
        $finance = DB::table('roles')->where('name', 'Finance')->first();
        $leader  = DB::table('roles')->where('name', 'Leader')->first();

        if (! $approve || ! $finance || ! $leader) {
            return;
        }

        $gainer = $revokeFromLeader ? $finance : $leader;
        $loser  = $revokeFromLeader ? $leader : $finance;

        foreach (array_filter([$approve, $view]) as $permission) {
            $exists = DB::table('role_permission')
                ->where('role_id', $gainer->id)
                ->where('permission_id', $permission->id)
                ->exists();

            if (! $exists) {
                DB::table('role_permission')->insert([
                    'role_id'       => $gainer->id,
                    'permission_id' => $permission->id,
                ]);
            }
        }

        // Hanya izin approve yang dicabut — role yang kehilangan tetap bisa melihat SO.
        DB::table('role_permission')
            ->where('role_id', $loser->id)
            ->where('permission_id', $approve->id)
            ->delete();
    }
};
