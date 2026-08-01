<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class FactoryReceivable extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'receivable_number',
        'supplier_id',
        'purchase_order_id',
        'warehouse_id',
        'transaction_date',
        'due_date',
        'original_amount',
        'paid_amount',
        'remaining_amount',
        'status', // unpaid, partially_paid, paid, overdue, cancelled
        'notes',
        'created_by',
    ];

    protected $casts = [
        'transaction_date' => 'date',
        'due_date'         => 'date',
        'original_amount'  => 'decimal:2',
        'paid_amount'      => 'decimal:2',
        'remaining_amount' => 'decimal:2',
    ];

    /**
     * Get the supplier that owns the factory receivable.
     */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /**
     * Get the purchase order associated with the factory receivable.
     */
    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    /**
     * Get the warehouse associated with the factory receivable.
     */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /**
     * Get the user who created the factory receivable.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Get the payment allocations associated with the factory receivable.
     */
    public function paymentAllocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }
}
