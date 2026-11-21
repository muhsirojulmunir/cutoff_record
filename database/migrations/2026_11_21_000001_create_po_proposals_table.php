<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('po_proposals', function (Blueprint $table) {
            $table->id();
            $table->string('po_number')->unique();
            $table->string('sku')->index();
            $table->string('product_name');
            $table->string('supplier_name')->nullable();
            $table->string('warehouse', 10)->default('G');
            $table->integer('current_stock')->default(0);
            $table->decimal('monthly_velocity', 10, 2)->default(0);
            $table->decimal('stock_coverage_months', 8, 2)->default(0);
            $table->integer('recommended_qty')->default(0);
            $table->integer('proposed_qty')->default(0);
            $table->string('status', 30)->default('pending_approval')->index();
            $table->foreignId('proposed_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('po_proposals');
    }
};
