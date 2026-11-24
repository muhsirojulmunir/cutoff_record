<?php

namespace App\Console\Commands;

use App\Models\DailyContentReport;
use App\Services\ContentMetricsService;
use Illuminate\Console\Command;

class SyncContentViewsCommand extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'content:sync-views {--days=30 : Rentang hari laporan yang akan disinkronkan} {--id= : ID laporan konten spesifik}';

    /**
     * The console command description.
     */
    protected $description = 'Sinkronisasi otomatis angka views video konten (TikTok, Instagram, Shopee Video) setiap jam 12 malam';

    /**
     * Execute the console command.
     */
    public function handle(ContentMetricsService $service): int
    {
        $id = $this->option('id');
        $days = (int) ($this->option('days') ?: 30);

        $this->info("Memulai sinkronisasi tayangan konten harian...");

        if ($id) {
            $report = DailyContentReport::find($id);
            if (!$report) {
                $this->error("Laporan konten ID {$id} tidak ditemukan.");
                return 1;
            }

            $this->info("Sinkronisasi report #{$report->id}: '{$report->title}'...");
            $updated = $service->syncReportViews($report);

            $this->info("✓ Selesai. Total views: " . number_format($updated->total_views));
            return 0;
        }

        $result = $service->syncRecentReports($days);

        $this->info("✓ Sinkronisasi selesai! Total: {$result['total']} laporan diproses (Sukses: {$result['success']}, Gagal: {$result['failed']}).");

        return 0;
    }
}
