<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'invoice_number',
        'sales_order_id',
        'customer_id',
        'invoice_date',
        'due_date',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'shipping_cost',
        'total_amount',
        'paid_amount',
        'remaining_amount',
        'status', // unpaid, partially_paid, paid, overdue, cancelled
        'notes',
        'created_by',
    ];

    protected $casts = [
        'invoice_date'     => 'date',
        'due_date'         => 'date',
        'subtotal'         => 'decimal:2',
        'discount_amount'  => 'decimal:2',
        'tax_amount'       => 'decimal:2',
        'shipping_cost'    => 'decimal:2',
        'total_amount'     => 'decimal:2',
        'paid_amount'      => 'decimal:2',
        'remaining_amount' => 'decimal:2',
    ];

    /**
     * Get the sales order associated with the invoice.
     */
    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class);
    }

    /**
     * Get the customer that owns the invoice.
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the user who created the invoice.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Get the items for the invoice.
     */
    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    /**
     * Get the payment allocations associated with the invoice.
     */
    public function paymentAllocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }
}
