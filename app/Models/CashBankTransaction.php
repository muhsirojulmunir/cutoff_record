<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CashBankTransaction extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'cash_bank_transactions';

    protected $fillable = [
        'transaction_number',
        'account_id',
        'transaction_date',
        'transaction_type',
        'direction',
        'amount',
        'balance_before',
        'balance_after',
        'source_type',
        'source_id',
        'description',
        'reference_number',
        'created_by',
        'status',
    ];

    protected $casts = [
        'amount'         => 'decimal:2',
        'balance_before' => 'decimal:2',
        'balance_after'  => 'decimal:2',
        'transaction_date' => 'date',
    ];

    // ─── Relationships ─────────────────────────────────────────────────────────

    public function account(): BelongsTo
    {
        return $this->belongsTo(CashBankAccount::class, 'account_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    /**
     * Polymorphic: source can be Payment or PettyCashTransaction.
     */
    public function source(): MorphTo
    {
        return $this->morphTo('source', 'source_type', 'source_id');
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    public function isIn(): bool
    {
        return $this->direction === 'in';
    }

    public function isOut(): bool
    {
        return $this->direction === 'out';
    }

    public function getTypeLabelAttribute(): string
    {
        return match ($this->transaction_type) {
            'opening_balance'   => 'Saldo Awal',
            'customer_payment'  => 'Pembayaran Customer',
            'supplier_payment'  => 'Pembayaran Supplier',
            'petty_cash'        => 'Petty Cash',
            'cash_in'           => 'Cash In (Manual)',
            'cash_out'          => 'Cash Out (Manual)',
            'adjustment'        => 'Adjustment',
            default             => $this->transaction_type,
        };
    }
}
