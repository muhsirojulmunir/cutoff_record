<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'payment_number',
        'payment_date',
        'payment_type', // customer_invoice, factory_receivable
        'payment_method', // cash, bank_transfer, credit_card, debit_card, e_wallet, other
        'amount',
        'reference_number',
        'bank_account',
        'cash_account',
        'notes',
        'cash_bank_account_id',
        'created_by',
        'status', // posted, cancelled
    ];

    protected $casts = [
        'payment_date' => 'date',
        'amount'       => 'decimal:2',
    ];

    /**
     * Get the user who created this payment transaction.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Get the allocations associated with this payment.
     */
    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }

    /**
     * Get the associated Cash/Bank Account.
     */
    public function cashBankAccount(): BelongsTo
    {
        return $this->belongsTo(CashBankAccount::class, 'cash_bank_account_id');
    }
}
