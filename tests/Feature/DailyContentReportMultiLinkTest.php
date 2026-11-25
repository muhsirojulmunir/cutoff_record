<?php

namespace Tests\Feature;

use App\Models\DailyContentReport;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DailyContentReportMultiLinkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasColumn('users', 'role_id')) {
            Schema::table('users', function ($table) {
                $table->unsignedBigInteger('role_id')->nullable();
            });
        }

        DailyContentReport::ensureViewsColumnsExist();
    }

    private function createKreatifUser(): User
    {
        $role = Role::firstOrCreate(['name' => 'Kreatif']);
        $viewPerm = Permission::firstOrCreate(['name' => 'content_reports.view'], ['group' => 'content_reports']);
        $createPerm = Permission::firstOrCreate(['name' => 'content_reports.create'], ['group' => 'content_reports']);
        $role->permissions()->syncWithoutDetaching([$viewPerm->id, $createPerm->id]);

        return User::factory()->create([
            'role_id' => $role->id,
        ]);
    }

    public function test_kreatif_can_store_multiple_links_per_channel_and_sum_views(): void
    {
        $user = $this->createKreatifUser();

        Http::fake([
            'https://www.tikwm.com/*' => Http::sequence()
                ->push(['code' => 0, 'data' => ['play_count' => 1200]], 200)
                ->push(['code' => 0, 'data' => ['play_count' => 800]], 200),
            '*' => Http::response('', 200),
        ]);

        $response = $this->actingAs($user)->post('/content-reports', [
            'title'         => 'Kampanye Sepatu Sekolah',
            'reported_date' => now()->toDateString(),
            'reported_time' => '10:30',
            'ig_links'      => [
                'https://www.instagram.com/reel/abc123/',
                'https://www.instagram.com/reel/def456/',
            ],
            'tiktok_links'  => [
                'https://www.tiktok.com/@record/video/111',
                'https://www.tiktok.com/@record/video/222',
            ],
            'shopee_links'  => [
                'https://id.shp.ee/v/shopee1',
            ],
            'notes'         => 'Upload pagi hari',
        ]);

        $response->assertRedirect(route('content-reports.index'));
        $response->assertSessionHasNoErrors();

        $report = DailyContentReport::firstOrFail();
        $this->assertSame('semua', $report->content_type);
        $this->assertSame([
            'https://www.instagram.com/reel/abc123/',
            'https://www.instagram.com/reel/def456/',
        ], DailyContentReport::parseLinks($report->ig_link));
        $this->assertSame([
            'https://www.tiktok.com/@record/video/111',
            'https://www.tiktok.com/@record/video/222',
        ], DailyContentReport::parseLinks($report->tiktok_link));
        $this->assertSame(2000, $report->tiktok_views);
        $this->assertSame(2000, $report->total_views);
    }

    public function test_kreatif_can_update_multi_links_on_existing_report(): void
    {
        $user = $this->createKreatifUser();

        Http::fake(['*' => Http::response('', 200)]);

        $report = DailyContentReport::create([
            'user_id'      => $user->id,
            'content_type' => 'santai',
            'title'        => 'Awal',
            'ig_link'      => 'https://www.instagram.com/reel/old1/',
            'reported_at'  => now(),
        ]);

        $response = $this->actingAs($user)->put("/content-reports/{$report->id}", [
            'title'         => 'Update Multi Link',
            'reported_date' => now()->toDateString(),
            'reported_time' => '14:15',
            'ig_links'      => [
                'https://www.instagram.com/reel/new1/',
                'https://www.instagram.com/reel/new2/',
                '',
            ],
            'tiktok_links'  => [''],
            'shopee_links'  => ['https://id.shp.ee/v/sp1'],
        ]);

        $response->assertSessionHasNoErrors();
        $report->refresh();

        $this->assertSame('Update Multi Link', $report->title);
        $this->assertSame('semua', $report->content_type);
        $this->assertSame(2, DailyContentReport::countLinks($report->ig_link));
        $this->assertNull($report->tiktok_link);
        $this->assertSame(1, DailyContentReport::countLinks($report->shopee_link));
    }

    public function test_empty_links_returns_validation_error(): void
    {
        $user = $this->createKreatifUser();

        $response = $this->actingAs($user)->post('/content-reports', [
            'title'        => 'Tanpa Link',
            'ig_links'     => ['', '   '],
            'tiktok_links' => [''],
            'shopee_links' => [],
        ]);

        $response->assertSessionHasErrors('ig_links');
    }
}
