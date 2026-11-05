<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('master_stocks', function (Blueprint $table) {
            $table->id();
            $table->string('warehouse', 10)->comment('G = Gudang G (Eceran), A = Gudang A (Grosir)');
            $table->string('item_code', 50)->index()->comment('Kode barang dari sistem internal (misal 01247938)');
            $table->string('item_name')->nullable();
            $table->string('unit', 20)->default('PSG')->comment('Satuan asli: PSG, LSN, PCS, dll');
            $table->decimal('raw_qty', 12, 2)->default(0)->comment('Jumlah quantity asli dari Excel');
            $table->integer('qty_pcs')->default(0)->comment('Kuantitas efektif dalam Pcs');
            $table->timestamp('last_imported_at')->nullable();
            $table->timestamps();

            $table->unique(['warehouse', 'item_code']);
            $table->index(['warehouse', 'qty_pcs']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('master_stocks');
    }
};
