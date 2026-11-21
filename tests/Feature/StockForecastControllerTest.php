<?php

namespace Tests\Feature;

use App\Models\PoProposal;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockForecastControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $picUser;
    private User $superAdminUser;
    private User $direkturUser;
    private User $gudangUser;

    protected function setUp(): void
    {
        parent::setUp();

        $picRole = Role::firstOrCreate(['name' => 'PIC']);
        $saRole = Role::firstOrCreate(['name' => 'Super Admin']);
        $dirRole = Role::firstOrCreate(['name' => 'Direktur']);
        $gudangRole = Role::firstOrCreate(['name' => 'Gudang']);

        $this->picUser = User::factory()->create(['name' => 'PIC User', 'role_id' => $picRole->id]);
        $this->superAdminUser = User::factory()->create(['name' => 'Super Admin User', 'role_id' => $saRole->id]);
        $this->direkturUser = User::factory()->create(['name' => 'Direktur User', 'role_id' => $dirRole->id]);
        $this->gudangUser = User::factory()->create(['name' => 'Gudang User', 'role_id' => $gudangRole->id]);
    }

    public function test_access_control(): void
    {
        // Gudang user cannot access
        $this->actingAs($this->gudangUser)->get('/stock-forecast')->assertStatus(403);

        // PIC user can access
        $this->actingAs($this->picUser)->get('/stock-forecast')->assertStatus(200);

        // Super Admin user can access
        $this->actingAs($this->superAdminUser)->get('/stock-forecast')->assertStatus(200);

        // Direktur user can access
        $this->actingAs($this->direkturUser)->get('/stock-forecast')->assertStatus(200);
    }

    public function test_pic_can_propose_po(): void
    {
        $payload = [
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids Merah Hitam 38',
            'supplier_name'         => 'Pabrik Surabaya',
            'warehouse'             => 'G',
            'current_stock'         => 400,
            'monthly_velocity'      => 100.00,
            'stock_coverage_months' => 4.00,
            'recommended_qty'       => 100,
            'proposed_qty'          => 120,
            'notes'                 => 'Permintaan tambah 20 pcs untuk antisipasi promo',
        ];

        $response = $this->actingAs($this->picUser)->post('/stock-forecast/propose', $payload);
        $response->assertSessionHas('success');

        $this->assertDatabaseHas('po_proposals', [
            'sku'          => 'RECORD-SPK-MH-38',
            'proposed_qty' => 120,
            'status'       => 'pending_approval',
            'proposed_by'  => $this->picUser->id,
        ]);
    }

    public function test_management_can_approve_po_proposal(): void
    {
        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0001',
            'sku'                   => 'RECORD-SPK-MH-38',
            'product_name'          => 'Sepatu Super Kids',
            'warehouse'             => 'G',
            'current_stock'         => 400,
            'monthly_velocity'      => 100,
            'stock_coverage_months' => 4,
            'recommended_qty'       => 100,
            'proposed_qty'          => 100,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $this->picUser->id,
        ]);

        // Regular Gudang cannot approve
        $this->actingAs($this->gudangUser)->post("/stock-forecast/proposals/{$proposal->id}/approve")
            ->assertStatus(403);

        // Direktur can approve
        $response = $this->actingAs($this->direkturUser)->post("/stock-forecast/proposals/{$proposal->id}/approve");
        $response->assertSessionHas('success');

        $proposal->refresh();
        $this->assertEquals(PoProposal::STATUS_APPROVED, $proposal->status);
        $this->assertEquals($this->direkturUser->id, $proposal->reviewed_by);
    }

    public function test_management_can_reject_po_proposal(): void
    {
        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0002',
            'sku'                   => 'RECORD-SPK-MH-39',
            'product_name'          => 'Sepatu Super Kids 39',
            'warehouse'             => 'G',
            'current_stock'         => 500,
            'monthly_velocity'      => 50,
            'stock_coverage_months' => 10,
            'recommended_qty'       => 0,
            'proposed_qty'          => 50,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $this->picUser->id,
        ]);

        $response = $this->actingAs($this->superAdminUser)->post("/stock-forecast/proposals/{$proposal->id}/reject", [
            'rejection_reason' => 'Stok gudang masih sangat banyak (10 bulan).',
        ]);
        $response->assertSessionHas('success');

        $proposal->refresh();
        $this->assertEquals(PoProposal::STATUS_REJECTED, $proposal->status);
        $this->assertEquals('Stok gudang masih sangat banyak (10 bulan).', $proposal->rejection_reason);
    }

    public function test_cannot_approve_or_reject_non_pending_proposal(): void
    {
        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0003',
            'sku'                   => 'RECORD-SPK-MH-40',
            'product_name'          => 'Sepatu Super Kids 40',
            'warehouse'             => 'G',
            'current_stock'         => 100,
            'monthly_velocity'      => 50,
            'stock_coverage_months' => 2,
            'recommended_qty'       => 150,
            'proposed_qty'          => 150,
            'status'                => PoProposal::STATUS_APPROVED,
            'proposed_by'           => $this->picUser->id,
            'reviewed_by'           => $this->direkturUser->id,
            'reviewed_at'           => now(),
        ]);

        $responseApprove = $this->actingAs($this->direkturUser)->post("/stock-forecast/proposals/{$proposal->id}/approve");
        $responseApprove->assertSessionHas('error');

        $responseReject = $this->actingAs($this->superAdminUser)->post("/stock-forecast/proposals/{$proposal->id}/reject", [
            'rejection_reason' => 'Sudah disetujui sebelumnya',
        ]);
        $responseReject->assertSessionHas('error');
    }

    public function test_propose_validation_errors(): void
    {
        $response = $this->actingAs($this->picUser)->post('/stock-forecast/propose', []);
        $response->assertSessionHasErrors(['sku', 'product_name', 'warehouse', 'current_stock', 'monthly_velocity', 'recommended_qty', 'proposed_qty']);
    }

    public function test_reject_requires_rejection_reason(): void
    {
        $proposal = PoProposal::create([
            'po_number'             => 'PO-PRO-20261121-0004',
            'sku'                   => 'RECORD-SPK-MH-41',
            'product_name'          => 'Sepatu Super Kids 41',
            'warehouse'             => 'G',
            'current_stock'         => 100,
            'monthly_velocity'      => 50,
            'stock_coverage_months' => 2,
            'recommended_qty'       => 150,
            'proposed_qty'          => 150,
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => $this->picUser->id,
        ]);

        $response = $this->actingAs($this->direkturUser)->post("/stock-forecast/proposals/{$proposal->id}/reject", [
            'rejection_reason' => '',
        ]);
        $response->assertSessionHasErrors(['rejection_reason']);
    }
}
