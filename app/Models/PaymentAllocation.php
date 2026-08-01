<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentAllocation extends Model
{
    protected $fillable = [
        'payment_id',
        'invoice_id',
        'factory_receivable_id',
        'allocated_amount',
    ];

    protected $casts = [
        'allocated_amount' => 'decimal:2',
    ];

    /**
     * Get the payment transaction that owns this allocation.
     */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    /**
     * Get the allocated customer invoice.
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /**
     * Get the allocated factory receivable.
     */
    public function factoryReceivable(): BelongsTo
    {
        return $this->belongsTo(FactoryReceivable::class);
    }
}
