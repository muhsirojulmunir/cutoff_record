<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class ShopeeAutoBoostConfig extends Model
{
    use HasFactory;

    protected $table = 'shopee_auto_boost_configs';

    protected $fillable = [
        'shopee_account_id',
        'is_enabled',
        'target_item_ids',
        'last_boosted_index',
        'last_run_at',
        'last_run_status',
        'last_run_message',
    ];

    protected $casts = [
        'is_enabled'         => 'boolean',
        'target_item_ids'    => 'array',
        'last_boosted_index' => 'integer',
        'last_run_at'        => 'datetime',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(ShopeeAccount::class, 'shopee_account_id');
    }

    /**
     * Pastikan tabel shopee_auto_boost_configs tersedia di database secara aman.
     */
    public static function ensureSchema(): void
    {
        try {
            if (! Schema::hasTable('shopee_auto_boost_configs')) {
                Schema::create('shopee_auto_boost_configs', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('shopee_account_id')->index();
                    $table->boolean('is_enabled')->default(false);
                    $table->json('target_item_ids')->nullable();
                    $table->integer('last_boosted_index')->default(0);
                    $table->dateTime('last_run_at')->nullable();
                    $table->string('last_run_status', 50)->nullable();
                    $table->text('last_run_message')->nullable();
                    $table->timestamps();
                });
            }
        } catch (\Throwable $e) {
            // Abaikan jika tabel sudah terbuat
        }
    }
}
