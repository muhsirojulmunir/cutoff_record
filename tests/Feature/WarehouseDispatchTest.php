<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WarehouseDispatchTest extends TestCase
{
    use RefreshDatabase;

    protected User $picGudang;
    protected SalesOrder $order;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['stock.view', 'dispatch.scan'] as $name) {
            Permission::firstOrCreate(['name' => $name]);
        }

        // Role ini sudah dibuat oleh migration, jadi cukup diambil kembali.
        $role = Role::firstOrCreate(['name' => 'PIC Gudang']);
        $role->permissions()->sync(Permission::all()->pluck('id'));

        $this->picGudang = User::create([
            'name' => 'Petugas Gudang', 'email' => 'gudang@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id, 'status' => 'active',
        ]);

        $customer = Customer::create([
            'customer_code' => 'CUST-01', 'name' => 'Customer Uji',
            'status' => 'active', 'created_by' => $this->picGudang->id,
        ]);

        $this->order = SalesOrder::create([
            'so_number'       => 'SO-202608-0001',
            'customer_id'     => $customer->id,
            'order_date'      => now()->toDateString(),
            'source'          => 'manual',
            'sales_channel'   => 'manual',
            'status'          => 'approved',
            'payment_status'  => 'unpaid',
            'tracking_number' => 'JNE-0001',
            'subtotal'        => 100000,
            'grand_total'     => 100000,
            'created_by'      => $this->picGudang->id,
        ]);
    }

    public function test_page_opens_for_warehouse_staff(): void
    {
        $this->actingAs($this->picGudang)->get('/gudang/pengiriman')->assertOk();
    }

    public function test_scanning_resi_marks_order_ready_for_courier(): void
    {
        $this->actingAs($this->picGudang)
            ->post('/gudang/pengiriman/scan', ['tracking_number' => 'JNE-0001'])
            ->assertRedirect();

        $fresh = $this->order->fresh();
        $this->assertNotNull($fresh->resi_scanned_at);
        $this->assertEquals($this->picGudang->id, $fresh->resi_scanned_by);
    }

    /** Resi yang sudah divalidasi tidak boleh divalidasi ulang. */
    public function test_second_scan_is_rejected(): void
    {
        $this->actingAs($this->picGudang)->post('/gudang/pengiriman/scan', ['tracking_number' => 'JNE-0001']);
        $firstScan = $this->order->fresh()->resi_scanned_at;

        $this->actingAs($this->picGudang)
            ->post('/gudang/pengiriman/scan', ['tracking_number' => 'JNE-0001'])
            ->assertSessionHas('error');

        $this->assertEquals($firstScan, $this->order->fresh()->resi_scanned_at);
    }

    public function test_unknown_resi_is_reported(): void
    {
        $this->actingAs($this->picGudang)
            ->post('/gudang/pengiriman/scan', ['tracking_number' => 'TIDAK-ADA'])
            ->assertSessionHas('error');

        $this->assertNull($this->order->fresh()->resi_scanned_at);
    }

    public function test_validation_can_be_undone(): void
    {
        $this->actingAs($this->picGudang)->post('/gudang/pengiriman/scan', ['tracking_number' => 'JNE-0001']);

        $this->actingAs($this->picGudang)
            ->post("/gudang/pengiriman/{$this->order->id}/batal-validasi")
            ->assertRedirect();

        $this->assertNull($this->order->fresh()->resi_scanned_at);
    }

    /** Tanpa hak dispatch.scan, resi tidak boleh divalidasi. */
    public function test_user_without_scan_permission_is_blocked(): void
    {
        $role = Role::firstOrCreate(['name' => 'Sales Tanpa Scan']);
        $role->permissions()->sync(Permission::where('name', 'stock.view')->pluck('id'));

        $sales = User::create([
            'name' => 'Sales', 'email' => 'sales@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id, 'status' => 'active',
        ]);

        $this->actingAs($sales)
            ->post('/gudang/pengiriman/scan', ['tracking_number' => 'JNE-0001'])
            ->assertForbidden();

        $this->assertNull($this->order->fresh()->resi_scanned_at);
    }
}
