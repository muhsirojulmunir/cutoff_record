<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'supplier_code',
        'name',
        'contact_person',
        'phone',
        'email',
        'address',
        'payment_terms',
        'status',
        'notes',
        'created_by',
    ];

    /**
     * Rekening bank pabrik — satu pabrik bisa punya banyak rekening.
     */
    public function bankAccounts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SupplierBankAccount::class);
    }

    /**
     * Get the user who created the supplier.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Get the purchase orders associated with the supplier.
     */
    public function purchaseOrders(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    /**
     * Get the factory receivables associated with the supplier.
     */
    public function factoryReceivables(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(FactoryReceivable::class);
    }
}
