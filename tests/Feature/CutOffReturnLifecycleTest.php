<?php

namespace Tests\Feature;

use App\Models\CutOffReturn;
use App\Models\User;
use Database\Seeders\RoleAndPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CutOffReturnLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $direktur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleAndPermissionSeeder::class);

        $this->admin = User::where('email', 'admin')->firstOrFail();
        $this->direktur = User::where('email', 'direktur')->firstOrFail();
    }

    public function test_otw_return_is_classified_automatically_with_eta_and_moves_to_awaiting_appeal_on_delivery(): void
    {
        $shippedTs = now('Asia/Jakarta')->subHours(10)->timestamp;

        $otwPayload = CutOffReturn::resolveSyncStagePayload([
            'return_status'           => 'PROCESSING',
            'return_logistics_status' => 'LOGISTICS_PICKUP_DONE',
            'shipped_epoch'           => $shippedTs,
            'courier'                 => 'ID Express Reguler',
        ]);

        $ret = CutOffReturn::create(array_merge([
            'marketplace'    => 'SH',
            'no_retur'       => '261126RETOTW01',
            'no_invoice_mp'  => '261126ORD01',
            'nama_barang_mp' => 'SPK-04',
            'jml_produk_mp'  => 1,
            'return_status'  => 'PROCESSING',
        ], $otwPayload));

        $this->assertSame('otw_office', $ret->workflow_stage);
        $this->assertFalse($ret->needs_action);
        $this->assertSame('estimated_sla', $ret->arrival_eta_source);
        $this->assertNotNull($ret->estimated_arrival_at);

        // Saat sync berikutnya kurir mengirim status paket tiba (DELIVERY_DONE)
        $arrivedPayload = CutOffReturn::resolveSyncStagePayload([
            'return_status'           => 'PROCESSING',
            'return_logistics_status' => 'LOGISTICS_DELIVERY_DONE',
            'due_date_epoch'          => now('Asia/Jakarta')->addDays(2)->timestamp,
            'shipped_epoch'           => $shippedTs,
            'existing'                => $ret,
        ]);
        $ret->update($arrivedPayload);

        $this->assertSame('awaiting_appeal', $ret->fresh()->workflow_stage);
        $this->assertTrue($ret->fresh()->needs_action);
    }

    public function test_admin_can_mark_appeal_submitted_or_no_appeal_needed_and_sync_preserves_decision(): void
    {
        $retAppeal = CutOffReturn::create([
            'marketplace'             => 'SH',
            'no_retur'                => '261126APPEAL01',
            'no_invoice_mp'           => '261126ORD02',
            'nama_barang_mp'          => 'CONFERO-M',
            'jml_produk_mp'           => 1,
            'return_status'           => 'PROCESSING',
            'return_logistics_status' => 'LOGISTICS_DELIVERY_DONE',
            'due_date'                => now('Asia/Jakarta')->addDay(),
            'needs_action'            => true,
        ]);

        $retNoAppeal = CutOffReturn::create([
            'marketplace'             => 'TT',
            'no_retur'                => '261126NORMAL01',
            'no_invoice_mp'           => '261126ORD03',
            'nama_barang_mp'          => 'RECORD-SPK19',
            'jml_produk_mp'           => 1,
            'return_status'           => 'AWAITING_SELLER_REVIEW',
            'due_date'                => now('Asia/Jakarta')->addDays(2),
            'needs_action'            => true,
        ]);

        $this->actingAs($this->admin)
            ->post("/cut-off-returns/{$retAppeal->id}/dispute-action", [
                'action' => 'appeal_submitted',
                'note'   => 'Video unboxing sudah diupload di Shopee',
            ])
            ->assertRedirect();

        $this->actingAs($this->admin)
            ->post("/cut-off-returns/{$retNoAppeal->id}/dispute-action", [
                'action' => 'no_appeal_needed',
                'note'   => 'Barang sesuai / Layak',
            ])
            ->assertRedirect();

        $retAppeal->refresh();
        $retNoAppeal->refresh();

        $this->assertSame('appeal_submitted', $retAppeal->workflow_stage);
        $this->assertFalse($retAppeal->needs_action);

        $this->assertSame('no_appeal_needed', $retNoAppeal->workflow_stage);
        $this->assertFalse($retNoAppeal->needs_action);

        // Sync ulang dari marketplace yang statusnya masih PROCESSING tidak boleh menimpa keputusan Admin
        $resyncNoAppeal = CutOffReturn::resolveSyncStagePayload([
            'return_status' => 'AWAITING_SELLER_REVIEW',
            'due_date_epoch' => now('Asia/Jakarta')->addDay()->timestamp,
            'existing' => $retNoAppeal,
        ]);
        $retNoAppeal->update($resyncNoAppeal);

        $this->assertSame('no_appeal_needed', $retNoAppeal->fresh()->workflow_stage);
        $this->assertFalse($retNoAppeal->fresh()->needs_action);
    }

    public function test_index_groups_stage_tasks_and_blocks_direktur_from_dispute_action(): void
    {
        $otw = CutOffReturn::create([
            'marketplace'             => 'SH',
            'no_retur'                => 'RET-OTW-1',
            'nama_barang_mp'          => 'SKU-OTW',
            'return_status'           => 'PROCESSING',
            'return_logistics_status' => 'LOGISTICS_PICKUP_DONE',
            'return_shipped_at'       => now('Asia/Jakarta')->subDay(),
            'estimated_arrival_at'    => now('Asia/Jakarta')->addDays(2),
            'arrival_eta_source'      => 'estimated_sla',
            'needs_action'            => false,
        ]);

        $awaiting = CutOffReturn::create([
            'marketplace'             => 'SH',
            'no_retur'                => 'RET-AWAIT-1',
            'nama_barang_mp'          => 'SKU-AWAIT',
            'return_status'           => 'PROCESSING',
            'return_logistics_status' => 'LOGISTICS_DELIVERY_DONE',
            'due_date'                => now('Asia/Jakarta')->addDays(2),
            'needs_action'            => true,
        ]);

        $submitted = CutOffReturn::create([
            'marketplace'    => 'SH',
            'no_retur'       => 'RET-DONE-1',
            'nama_barang_mp' => 'SKU-DONE',
            'return_status'  => 'SELLER_DISPUTE',
            'dispute_action' => 'appeal_submitted',
            'needs_action'   => false,
        ]);

        // Status REQUESTED (Peninjauan Tim Shopee) meski punya due_date & needs_action lama harus masuk platform_review, bukan awaiting_appeal
        $requested = CutOffReturn::create([
            'marketplace'    => 'SH',
            'no_retur'       => '26112507UV0FT4A',
            'nama_barang_mp' => 'RECORD-SPK19',
            'return_status'  => 'REQUESTED',
            'due_date'       => now('Asia/Jakarta')->addDays(2),
            'needs_action'   => true,
        ]);

        $this->assertSame('platform_review', $requested->workflow_stage);

        $this->actingAs($this->admin)
            ->get('/cut-off-returns')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('CutOff/Returns')
                ->where('summary.total_awaiting_appeal', 1)
                ->where('summary.total_otw_office', 1)
                ->where('summary.total_platform_review', 1)
                ->where('summary.total_appeal_submitted', 1)
                ->has('stageTasks.awaiting_appeal', 1)
                ->where('stageTasks.awaiting_appeal.0.id', $awaiting->id)
                ->has('stageTasks.otw_office', 1)
                ->where('stageTasks.otw_office.0.id', $otw->id)
                ->has('stageTasks.platform_review', 1)
                ->where('stageTasks.platform_review.0.id', $requested->id)
                ->has('stageTasks.appeal_submitted', 1)
                ->where('stageTasks.appeal_submitted.0.id', $submitted->id)
            );

        $this->actingAs($this->direktur)
            ->post("/cut-off-returns/{$awaiting->id}/dispute-action", [
                'action' => 'appeal_submitted',
            ])
            ->assertForbidden();
    }
}
