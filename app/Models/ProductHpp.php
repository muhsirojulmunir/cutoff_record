<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * HPP (harga pokok penjualan) per produk yang diisi Finance / Leader.
 */
class ProductHpp extends Model
{
    protected $fillable = [
        'product_id',
        'hpp',
        'effective_date',
        'notes',
        'updated_by',
    ];

    protected $casts = [
        'hpp'            => 'decimal:2',
        'effective_date' => 'date',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by')->withTrashed();
    }
}
