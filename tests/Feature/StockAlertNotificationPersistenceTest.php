<?php

namespace Tests\Feature;

use App\Models\MasterStock;
use App\Models\Role;
use App\Models\ShopeeAccount;
use App\Models\ShopeeProduct;
use App\Models\TiktokAccount;
use App\Models\TiktokProduct;
use App\Models\User;
use App\Services\ShopeeSyncService;
use App\Services\TiktokSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class StockAlertNotificationPersistenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::store('file')->forget('shopee_stock_alert_queue');
        Cache::store('file')->forget('tiktok_stock_alert_queue');
    }

    protected function tearDown(): void
    {
        Cache::store('file')->forget('shopee_stock_alert_queue');
        Cache::store('file')->forget('tiktok_stock_alert_queue');
        parent::tearDown();
    }

    private function seedStockDiscrepancyData(): void
    {
        $shopeeAcc = ShopeeAccount::firstOrCreate(
            ['id' => 1],
            [
                'shop_id'           => '1001',
                'shop_name'         => 'Record Shopee',
                'status'            => 'active',
                'connection_status' => 'connected',
                'access_token'      => 'tok',
            ]
        );

        $tiktokAcc = TiktokAccount::firstOrCreate(
            ['id' => 1],
            [
                'account_name'      => 'Record TikTok',
                'shop_id'           => '2001',
                'status'            => 'active',
                'connection_status' => 'connected',
                'access_token'      => 'tok',
            ]
        );

        app(ShopeeSyncService::class)->ensureProductSchema();
        app(TiktokSyncService::class)->ensureProductSchema();

        if (! Schema::hasColumn('shopee_products', 'manual_item_code')) {
            Schema::table('shopee_products', function ($table) {
                $table->string('manual_item_code', 50)->nullable()->index();
            });
        }

        MasterStock::create([
            'warehouse' => 'G',
            'item_code' => '01246239',
            'item_name' => 'RECORD BLANCO 39',
            'qty_pcs'   => 0,
            'raw_qty'   => 0,
            'unit'      => 'PCS',
        ]);

        // Stok gudang 0 tapi di Shopee masih 5 -> masuk SKU Habis di Gudang + Selisih
        ShopeeProduct::create([
            'shopee_account_id' => $shopeeAcc->id,
            'item_id'           => 9001,
            'model_id'          => 90011,
            'item_name'         => 'RECORD BLANCO',
            'model_name'        => 'Hitam, 39',
            'sku'               => 'RECORD-BLANCO-H-39_01246239',
            'manual_item_code'  => '01246239',
            'stock'             => 5,
            'item_status'       => 'NORMAL',
        ]);

        // Stok gudang 0 tapi di TikTok masih 3 -> masuk SKU Habis di Gudang + Selisih
        TiktokProduct::create([
            'tiktok_account_id' => $tiktokAcc->id,
            'item_id'           => '8001',
            'model_id'          => '80011',
            'item_name'         => 'RECORD BLANCO',
            'model_name'        => 'Hitam, 39',
            'sku'               => 'RECORD-BLANCO-H-39_01246239',
            'manual_item_code'  => '01246239',
            'stock'             => 3,
            'item_status'       => 'ACTIVATE',
        ]);
    }

    public function test_stock_notifications_appear_on_cold_cache_for_super_admin_admin_and_pic_without_visiting_stock_pages(): void
    {
        $this->seedStockDiscrepancyData();

        foreach (['Super Admin', 'Admin', 'PIC'] as $roleName) {
            Cache::store('file')->forget('shopee_stock_alert_queue');
            Cache::store('file')->forget('tiktok_stock_alert_queue');

            $role = Role::firstOrCreate(['name' => $roleName]);
            $user = User::create([
                'name'     => "User {$roleName}",
                'email'    => strtolower(str_replace(' ', '', $roleName)) . '@test.local',
                'password' => Hash::make('password'),
                'role_id'  => $role->id,
                'status'   => 'active',
            ]);

            // Buka halaman /users atau /master-stock atau /dashboard (bukan /shopee-products maupun /tiktok-products)
            $response = $this->actingAs($user)->get('/dashboard');
            $response->assertStatus(200);
            $response->assertInertia(fn (AssertableInertia $page) => $page
                ->where('workQueue.total', 4)
                ->where('workQueue.critical', 2)
                ->has('workQueue.items', 4)
            );
        }
    }

    public function test_non_alert_roles_like_gudang_do_not_receive_marketplace_stock_alerts(): void
    {
        $this->seedStockDiscrepancyData();

        $gudangRole = Role::firstOrCreate(['name' => 'Gudang']);
        $user = User::create([
            'name'     => 'User Gudang',
            'email'    => 'gudang@test.local',
            'password' => Hash::make('password'),
            'role_id'  => $gudangRole->id,
            'status'   => 'active',
        ]);

        $response = $this->actingAs($user)->get('/dashboard');
        $response->assertStatus(200);
        $response->assertInertia(fn (AssertableInertia $page) => $page
            ->where('workQueue.total', 0)
            ->has('workQueue.items', 0)
        );
    }
}
