<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseOrder extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'po_number',
        'supplier_id',
        'warehouse_id',
        'order_date',
        'production_lead_time_days',
        'status',
        'payment_status',
        'subtotal',
        'shipping_cost',
        'is_free_shipping',
        'grand_total',
        'notes',
        'created_by',
        // Leader Approval
        'leader_approved_by',
        'leader_approved_at',
        // Finance Approval
        'finance_approved_by',
        'finance_approved_at',
        // Rejection
        'rejected_by',
        'rejected_at',
        'reject_reason',
        // Down Payment
        'dp_amount',
        'dp_paid_amount',
        'dp_payment_date',
        'dp_cash_bank_account_id',
        // Payment Terms
        'payment_terms',
        // Finance Validation (after receiving)
        'validated_subtotal',
        'validated_grand_total',
        'final_bill_amount',
        'is_finance_validated',
        'finance_validated_by',
        'finance_validated_at',
    ];

    protected $casts = [
        'order_date'             => 'date',
        'subtotal'               => 'decimal:2',
        'shipping_cost'          => 'decimal:2',
        'is_free_shipping'       => 'boolean',
        'production_lead_time_days' => 'integer',
        'grand_total'            => 'decimal:2',
        'leader_approved_at'     => 'datetime',
        'finance_approved_at'    => 'datetime',
        'rejected_at'            => 'datetime',
        'dp_amount'              => 'decimal:2',
        'dp_paid_amount'         => 'decimal:2',
        'dp_payment_date'        => 'date',
        'validated_subtotal'     => 'decimal:2',
        'validated_grand_total'  => 'decimal:2',
        'final_bill_amount'      => 'decimal:2',
        'is_finance_validated'   => 'boolean',
        'finance_validated_at'   => 'datetime',
    ];

    /**
     * Get the supplier that owns the purchase order.
     */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /**
     * Get the warehouse that owns the purchase order.
     */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /**
     * Get the user who created the purchase order.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Get the user who approved as Leader.
     */
    public function leaderApprover(): BelongsTo
    {
        return $this->belongsTo(User::class, 'leader_approved_by')->withTrashed();
    }

    /**
     * Get the user who approved as Finance.
     */
    public function financeApprover(): BelongsTo
    {
        return $this->belongsTo(User::class, 'finance_approved_by')->withTrashed();
    }

    /**
     * Get the user who rejected the purchase order.
     */
    public function rejector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by')->withTrashed();
    }

    /**
     * Get the items for the purchase order.
     */
    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    /**
     * Get the factory receivable associated with the purchase order.
     */
    public function factoryReceivable(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(FactoryReceivable::class);
    }

    /**
     * Get the cash/bank account used for Down Payment.
     */
    public function dpCashBankAccount(): BelongsTo
    {
        return $this->belongsTo(CashBankAccount::class, 'dp_cash_bank_account_id');
    }

    /**
     * Get the Finance user who validated the receiving.
     */
    public function financeValidator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'finance_validated_by')->withTrashed();
    }
}
