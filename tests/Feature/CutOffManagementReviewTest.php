<?php

namespace Tests\Feature;

use App\Models\CutOffOrder;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleAndPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CutOffManagementReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $direktur;
    private User $pic;
    private User $superAdmin;
    private User $admin;
    private CutOffOrder $order;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleAndPermissionSeeder::class);

        $this->direktur = User::where('email', 'direktur')->firstOrFail();
        $this->pic = User::where('email', 'pic')->firstOrFail();
        $this->superAdmin = User::where('email', 'superadmin')->firstOrFail();
        $this->admin = User::where('email', 'admin')->firstOrFail();

        $this->order = CutOffOrder::create([
            'order_date'     => now('Asia/Jakarta')->toDateTimeString(),
            'processed_at'   => now('Asia/Jakarta')->toDateTimeString(),
            'channel'        => 'SH - Toko Test',
            'order_number'   => '261126TESTREVIEW01',
            'buyer_username' => 'pembeli_test',
            'product_name'   => 'Sepatu Sekolah',
            'qty'            => 1,
            'order_status'   => 'Diproses',
            'est_net_income' => 45000,
        ]);
    }

    public function test_direktur_tidak_memiliki_akses_pesanan_shopee_dan_tiktok(): void
    {
        $direkturPerms = $this->direktur->getPermissions();

        $this->assertNotContains('orders.shopee', $direkturPerms);
        $this->assertNotContains('orders.tiktok', $direkturPerms);
        $this->assertContains('orders.cutoff', $direkturPerms);
        $this->assertContains('returns.online', $direkturPerms);

        $this->actingAs($this->direktur)->get('/shopee-orders')->assertStatus(403);
        $this->actingAs($this->direktur)->get('/tiktok-orders')->assertStatus(403);
    }

    public function test_direktur_dapat_memberi_dan_menghapus_tanda_review_pesanan_cut_off(): void
    {
        $this->actingAs($this->direktur)
            ->post("/cut-off-orders/{$this->order->id}/review", [
                'management_flag' => 'harga_bermasalah',
                'management_note' => 'Harga jual terlalu rendah di bawah modal.',
            ])
            ->assertRedirect();

        $this->order->refresh();
        $this->assertSame('harga_bermasalah', $this->order->management_flag);
        $this->assertSame('Harga jual terlalu rendah di bawah modal.', $this->order->management_note);
        $this->assertSame($this->direktur->id, $this->order->management_reviewed_by);
        $this->assertNotNull($this->order->management_reviewed_at);

        // Hapus tanda review
        $this->actingAs($this->direktur)
            ->post("/cut-off-orders/{$this->order->id}/review", [
                'management_flag' => null,
                'management_note' => null,
            ])
            ->assertRedirect();

        $this->order->refresh();
        $this->assertNull($this->order->management_flag);
        $this->assertNull($this->order->management_note);
    }

    public function test_admin_dan_pic_tidak_dapat_membuat_tanda_review_direktur(): void
    {
        $this->actingAs($this->admin)
            ->post("/cut-off-orders/{$this->order->id}/review", [
                'management_flag' => 'margin_tipis',
            ])
            ->assertStatus(403);

        $this->actingAs($this->pic)
            ->post("/cut-off-orders/{$this->order->id}/review", [
                'management_flag' => 'margin_tipis',
            ])
            ->assertStatus(403);
    }

    public function test_review_direktur_hanya_muncul_untuk_pic_super_admin_dan_direktur(): void
    {
        $this->actingAs($this->direktur)
            ->post("/cut-off-orders/{$this->order->id}/review", [
                'management_flag' => 'ongkir_tidak_wajar',
                'management_note' => 'Ongkir & potongan terlalu besar.',
            ])
            ->assertRedirect();

        // PIC dapat melihat review & summary
        $this->actingAs($this->pic)
            ->get('/cut-off-orders')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('CutOff/Index')
                ->where('orders.data.0.management_flag', 'ongkir_tidak_wajar')
                ->where('orders.data.0.management_note', 'Ongkir & potongan terlalu besar.')
                ->where('reviewSummary.total_unresolved', 1)
                ->where('reviewSummary.ongkir_tidak_wajar', 1)
            );

        // Super Admin dapat melihat review & summary
        $this->actingAs($this->superAdmin)
            ->get('/cut-off-orders')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('CutOff/Index')
                ->where('orders.data.0.management_flag', 'ongkir_tidak_wajar')
                ->where('reviewSummary.total_unresolved', 1)
            );

        // Admin TIDAK boleh melihat review maupun summary
        $this->actingAs($this->admin)
            ->get('/cut-off-orders')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('CutOff/Index')
                ->where('orders.data.0.management_flag', null)
                ->where('orders.data.0.management_note', null)
                ->where('reviewSummary', null)
            );
    }

    public function test_pic_dan_super_admin_dapat_menandai_review_sudah_ditindaklanjuti(): void
    {
        $this->actingAs($this->direktur)
            ->post("/cut-off-orders/{$this->order->id}/review", [
                'management_flag' => 'margin_tipis',
                'management_note' => 'Cek setting voucher toko.',
            ])
            ->assertRedirect();

        $this->actingAs($this->pic)
            ->post("/cut-off-orders/{$this->order->id}/review/resolve", [
                'resolved'        => true,
                'resolution_note' => 'Subsidi Shopee',
            ])
            ->assertRedirect();

        $this->order->refresh();
        $this->assertNotNull($this->order->management_resolved_at);
        $this->assertSame($this->pic->name, $this->order->management_resolved_by_name);
        $this->assertSame('Subsidi Shopee', $this->order->management_resolved_note);

        // Direktur dapat melihat tanggapan PIC di response Inertia
        $this->actingAs($this->direktur)
            ->get('/cut-off-orders')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('CutOff/Index')
                ->where('orders.data.0.management_resolved_note', 'Subsidi Shopee')
                ->where('reviewSummary.total_unresolved', 0)
            );

        // Admin ditolak saat mencoba resolve
        $this->actingAs($this->admin)
            ->post("/cut-off-orders/{$this->order->id}/review/resolve", ['resolved' => true])
            ->assertStatus(403);
    }
}
