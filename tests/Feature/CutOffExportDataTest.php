<?php

namespace Tests\Feature;

use App\Models\CutOffOrder;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CutOffExportDataTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $gudangUser;

    protected function setUp(): void
    {
        parent::setUp();

        $superAdminRole = Role::create([
            'name'        => 'Super Admin',
            'description' => 'Akses penuh sistem',
        ]);

        $gudangRole = Role::create([
            'name'        => 'Gudang',
            'description' => 'Akses gudang',
        ]);

        $this->superAdmin = User::create([
            'name'     => 'Super Admin Test',
            'email'    => 'super-export@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $superAdminRole->id,
            'status'   => 'active',
        ]);

        $this->gudangUser = User::create([
            'name'     => 'Gudang Test',
            'email'    => 'gudang-export@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $gudangRole->id,
            'status'   => 'active',
        ]);
    }

    public function test_export_data_returns_exact_columns_with_varian_and_multi_row_for_super_admin(): void
    {
        CutOffOrder::create([
            'order_date'       => '2026-11-25 08:00:00',
            'processed_at'     => '2026-11-25 09:10:00',
            'channel'          => 'TT',
            'order_number'     => '58736115099958768',
            'sku_utama'        => 'RECORD-SPK19-MH-31',
            'variation_name'   => 'MERAH HITAM, 31',
            'qty'              => 1,
            'buyer_username'   => 'z***nnurdiansyah',
            'est_net_income'   => 158989,
            'shipping_courier' => 'J&T Express',
            'order_status'     => 'Diproses',
        ]);

        CutOffOrder::create([
            'order_date'       => '2026-11-25 07:30:00',
            'processed_at'     => '2026-11-25 08:15:00',
            'channel'          => 'SH',
            'order_number'     => '2611245X556WEE',
            'sku_utama'        => 'RECORD-SPK19-MH-31_01273631',
            'variation_name'   => 'STRIDE HITAM,41',
            'qty'              => 2,
            'buyer_username'   => 'v8jcu_bhh0',
            'est_net_income'   => 150099,
            'shipping_courier' => 'Hemat Kargo-SPX Hemat',
            'order_status'     => 'Diproses',
            'financial_breakdown' => [
                'items' => [
                    ['name' => 'Sepatu A', 'variation' => 'VARIAN A, 40', 'sku' => 'SKU-MULTI-1', 'qty' => 1, 'est_net_income' => 80000],
                    ['name' => 'Sepatu B', 'variation' => 'VARIAN B, 41', 'sku' => 'SKU-MULTI-2', 'qty' => 1, 'est_net_income' => 70099],
                ],
            ],
        ]);

        // Pesanan belum diproses tidak boleh ikut masuk export Cut Off
        CutOffOrder::create([
            'order_date'       => '2026-11-25 10:00:00',
            'processed_at'     => null,
            'channel'          => 'SH',
            'order_number'     => '261124UNPAID001',
            'sku_utama'        => 'SKU-UNPAID',
            'qty'              => 1,
            'buyer_username'   => 'unpaid_user',
            'est_net_income'   => 100000,
            'shipping_courier' => 'SPX Standard',
            'order_status'     => 'Perlu Dikirim',
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/cut-off-orders/export-data?date_from=2026-11-25&date_to=2026-11-25');

        $response->assertOk()
            ->assertJsonPath('total_orders', 3)
            ->assertJsonPath('headers', [
                'Tanggal',
                'Nomor Urut',
                'Platform',
                'No Pesanan',
                'SKU',
                'Varian',
                'QTY',
                'Username',
                'Est Bersih',
                'Ekspedisi',
                'Status',
            ]);

        $rows = $response->json('rows');
        // Shopee diurutkan sebelum TikTok pada tanggal yang sama, multi-item dipecah menjadi 2 baris
        $this->assertSame([
            '25-11-26',
            1,
            'Shopee',
            '2611245X556WEE',
            'SKU-MULTI-1',
            'VARIAN A, 40',
            1,
            'v8jcu_bhh0',
            80000,
            'Hemat Kargo-SPX Hemat',
            '',
        ], $rows[0]);

        $this->assertSame([
            '25-11-26',
            2,
            'Shopee',
            '2611245X556WEE',
            'SKU-MULTI-2',
            'VARIAN B, 41',
            1,
            'v8jcu_bhh0',
            70099,
            'Hemat Kargo-SPX Hemat',
            '',
        ], $rows[1]);

        $this->assertSame([
            '25-11-26',
            3,
            'TikTok',
            '58736115099958768',
            'RECORD-SPK19-MH-31',
            'MERAH HITAM, 31',
            1,
            'z***nnurdiansyah',
            158989,
            'J&T Express',
            '',
        ], $rows[2]);
    }

    public function test_export_data_hides_est_bersih_column_for_non_financial_roles(): void
    {
        CutOffOrder::create([
            'order_date'       => '2026-11-25 08:00:00',
            'processed_at'     => '2026-11-25 09:10:00',
            'channel'          => 'SH',
            'order_number'     => '261125GUDANG01',
            'sku_utama'        => 'SKU-GUDANG-1',
            'variation_name'   => 'HITAM, 40',
            'qty'              => 1,
            'buyer_username'   => 'pembeli_1',
            'est_net_income'   => 125000,
            'shipping_courier' => 'SPX Standard',
            'order_status'     => 'Diproses',
        ]);

        $response = $this->actingAs($this->gudangUser)
            ->getJson('/cut-off-orders/export-data?date_from=2026-11-25&date_to=2026-11-25');

        $response->assertOk()
            ->assertJsonPath('headers', [
                'Tanggal',
                'Nomor Urut',
                'Platform',
                'No Pesanan',
                'SKU',
                'Varian',
                'QTY',
                'Username',
                'Ekspedisi',
                'Status',
            ]);

        $this->assertSame([
            '25-11-26',
            1,
            'Shopee',
            '261125GUDANG01',
            'SKU-GUDANG-1',
            'HITAM, 40',
            1,
            'pembeli_1',
            'SPX Standard',
            '',
        ], $response->json('rows.0'));
    }
}
