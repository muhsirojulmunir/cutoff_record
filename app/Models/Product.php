<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'sku',
        'name',
        'photo_path',
        'category_id',
        'brand',
        'color',
        'is_box',
        'length',
        'width',
        'height',
        'purchase_price',
        'selling_price',
        'minimum_stock',
        'stock',
        'status',
        'description',
        'created_by',
    ];

    protected $casts = [
        'is_box'         => 'boolean',
        'length'         => 'decimal:2',
        'width'          => 'decimal:2',
        'height'         => 'decimal:2',
        'purchase_price' => 'decimal:2',
        'selling_price'  => 'decimal:2',
        'minimum_stock'  => 'integer',
        'stock'          => 'integer',
    ];

    protected $appends = ['dimension_label', 'photo_url'];

    /** Tautan foto siap pakai di frontend; null bila produk belum berfoto. */
    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path
            ? asset('storage/' . $this->photo_path)
            : null;
    }

    /**
     * Ukuran siap tampil: "40 x 30 cm", atau "40 x 30 x 25 cm" untuk kardus.
     */
    public function getDimensionLabelAttribute(): ?string
    {
        if ($this->length === null || $this->width === null) {
            return null;
        }

        $parts = [$this->length, $this->width];

        if ($this->is_box && $this->height !== null) {
            $parts[] = $this->height;
        }

        $numbers = array_map(
            fn ($value) => rtrim(rtrim(number_format((float) $value, 2, ',', '.'), '0'), ','),
            $parts
        );

        return implode(' × ', $numbers) . ' cm';
    }

    /**
     * Get the category that owns the product.
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * HPP produk — diisi Finance / Leader lewat master HPP.
     */
    public function hpp(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ProductHpp::class);
    }

    /**
     * Get the user who created the product.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Get the sales order items associated with the product.
     */
    public function salesOrderItems(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SalesOrderItem::class);
    }

    /**
     * Get the purchase order items associated with the product.
     */
    public function purchaseOrderItems(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    /**
     * Get the stock movements associated with the product.
     */
    public function stockMovements(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(StockMovement::class);
    }
}
