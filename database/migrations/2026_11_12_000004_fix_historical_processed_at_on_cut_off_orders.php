<?php

use App\Models\CutOffOrder;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        CutOffOrder::cleanupHistoricalProcessedAt();
    }

    public function down(): void
    {
        // Pembersihan data historis processed_at tidak perlu di-rollback.
    }
};

