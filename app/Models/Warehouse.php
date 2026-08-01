<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    protected $fillable = [
        'code',
        'name',
        'location',
        'person_in_charge',
        'phone',
        'status',
        'notes',
    ];

    /**
     * Get the purchase orders associated with the warehouse.
     */
    public function purchaseOrders(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    /**
     * Get the stock movements associated with the warehouse.
     */
    public function stockMovements(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /**
     * Get the factory receivables associated with the warehouse.
     */
    public function factoryReceivables(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(FactoryReceivable::class);
    }
}
