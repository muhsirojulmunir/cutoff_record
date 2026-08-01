<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('factory_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number')->unique();
            $table->foreignId('supplier_id')->constrained('suppliers');
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->foreignId('factory_receivable_id')->nullable()->constrained('factory_receivables')->nullOnDelete();
            $table->date('invoice_date');
            $table->date('due_date')->nullable();
            $table->string('supplier_invoice_number')->nullable()->comment('Nomor invoice dari pihak pabrik/supplier');
            $table->decimal('subtotal', 18, 2)->default(0);
            $table->decimal('discount_amount', 18, 2)->default(0);
            $table->decimal('tax_amount', 18, 2)->default(0);
            $table->decimal('shipping_cost', 18, 2)->default(0);
            $table->decimal('total_amount', 18, 2)->default(0);
            $table->decimal('paid_amount', 18, 2)->default(0);
            $table->decimal('remaining_amount', 18, 2)->default(0);
            $table->string('status')->default('unpaid'); // unpaid, partially_paid, paid, overdue, cancelled
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->softDeletes();
            $table->timestamps();
        });

        Schema::create('factory_invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('factory_invoice_id')->constrained('factory_invoices')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('product_code')->nullable();
            $table->string('product_name');
            $table->integer('quantity')->default(1);
            $table->string('unit')->default('pcs');
            $table->decimal('unit_price', 18, 2)->default(0);
            $table->decimal('discount_amount', 18, 2)->default(0);
            $table->decimal('tax_amount', 18, 2)->default(0);
            $table->decimal('subtotal', 18, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('factory_invoice_items');
        Schema::dropIfExists('factory_invoices');
    }
};
