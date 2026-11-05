<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterStock extends Model
{
    use HasFactory;

    protected $table = 'master_stocks';

    protected $fillable = [
        'warehouse',
        'item_code',
        'item_name',
        'unit',
        'raw_qty',
        'qty_pcs',
        'last_imported_at',
    ];

    protected $casts = [
        'raw_qty'          => 'decimal:2',
        'qty_pcs'          => 'integer',
        'last_imported_at' => 'datetime',
    ];

    public function scopeForWarehouse($query, ?string $warehouse)
    {
        if (! empty($warehouse) && in_array(strtoupper($warehouse), ['A', 'G'])) {
            return $query->where('warehouse', strtoupper($warehouse));
        }
        return $query;
    }

    public function scopeSearch($query, ?string $search)
    {
        if (empty($search)) {
            return $query;
        }

        $term = trim($search);
        return $query->where(function ($q) use ($term) {
            $q->where('item_code', 'like', "%{$term}%")
              ->orWhere('item_name', 'like', "%{$term}%");
        });
    }

    public function getWarehouseLabelAttribute(): string
    {
        return $this->warehouse === 'G' ? 'Gudang G (Eceran / Pcs)' : 'Gudang A (Grosir / Lusin)';
    }
}

