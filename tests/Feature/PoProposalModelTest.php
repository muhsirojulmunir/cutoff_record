<?php

namespace Tests\Feature;

use App\Models\PoProposal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PoProposalModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_and_manage_po_proposal(): void
    {
        $picUser = User::factory()->create(['name' => 'PIC Sepatu']);
        $mgmtUser = User::factory()->create(['name' => 'Direktur Utama']);

        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0001',
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids Merah Hitam 38',
            'supplier_name'         => 'Pabrik Utama Surabaya',
            'warehouse'             => 'G',
            'current_stock'         => 400,
            'monthly_velocity'      => 100.00,
            'stock_coverage_months' => 4.00,
            'recommended_qty'       => 100,
            'proposed_qty'          => 100,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $picUser->id,
            'notes'                 => 'Pengajuan dari analitik proyeksi stok 5 bulan',
        ]);

        $this->assertDatabaseHas('po_proposals', [
            'po_number' => 'PO-PRO-20261121-0001',
            'status'    => 'pending_approval',
        ]);

        $this->assertEquals('PIC Sepatu', $proposal->proposer->name);
        $this->assertTrue($proposal->isPending());

        // Approve proposal
        $proposal->approveBy($mgmtUser);
        $this->assertEquals(PoProposal::STATUS_APPROVED, $proposal->status);
        $this->assertEquals($mgmtUser->id, $proposal->reviewed_by);
        $this->assertNotNull($proposal->reviewed_at);
    }

    public function test_can_reject_proposal(): void
    {
        $picUser = User::factory()->create(['name' => 'PIC Sepatu']);
        $mgmtUser = User::factory()->create(['name' => 'Direktur Utama']);

        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0001',
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids Merah Hitam 38',
            'supplier_name'         => 'Pabrik Utama Surabaya',
            'warehouse'             => 'G',
            'current_stock'         => 400,
            'monthly_velocity'      => 100.00,
            'stock_coverage_months' => 4.00,
            'recommended_qty'       => 100,
            'proposed_qty'          => 100,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $picUser->id,
            'notes'                 => 'Pengajuan',
        ]);

        $proposal->rejectBy($mgmtUser, 'Over budget');
        $this->assertEquals(PoProposal::STATUS_REJECTED, $proposal->status);
        $this->assertEquals($mgmtUser->id, $proposal->reviewed_by);
        $this->assertEquals('Over budget', $proposal->rejection_reason);
        $this->assertNotNull($proposal->reviewed_at);
    }

    public function test_can_generate_po_number(): void
    {
        $poNumber1 = PoProposal::generatePoNumber();
        $today = now()->format('Ymd');
        $this->assertEquals("PO-PRO-{$today}-0001", $poNumber1);

        $picUser = User::factory()->create();
        PoProposal::create([
            'po_number'    => $poNumber1,
            'sku'          => 'TEST-SKU',
            'product_name' => 'Test Product',
            'proposed_by'  => $picUser->id,
        ]);

        $poNumber2 = PoProposal::generatePoNumber();
        $this->assertEquals("PO-PRO-{$today}-0002", $poNumber2);
    }
}
