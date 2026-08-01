<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CashBankAccount extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'cash_bank_accounts';

    protected $fillable = [
        'account_code',
        'account_name',
        'account_type',
        'account_number',
        'bank_name',
        'account_holder',
        'opening_balance',
        'current_balance',
        'allow_negative_balance',
        'status',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'opening_balance'       => 'decimal:2',
        'current_balance'       => 'decimal:2',
        'allow_negative_balance'=> 'boolean',
    ];

    // ─── Relationships ─────────────────────────────────────────────────────────

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(CashBankTransaction::class, 'account_id');
    }

    // ─── Scopes ────────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Get masked account number (last 4 digits).
     */
    public function getMaskedAccountNumberAttribute(): ?string
    {
        if (! $this->account_number) {
            return null;
        }
        $clean = preg_replace('/\s+/', '', $this->account_number);
        $len = strlen($clean);
        if ($len <= 4) {
            return $clean;
        }
        return str_repeat('*', $len - 4) . substr($clean, -4);
    }

    /**
     * Get type label for display.
     */
    public function getTypeLabelAttribute(): string
    {
        return match ($this->account_type) {
            'cash'     => 'Kas / Cash',
            'bank'     => 'Bank',
            'e_wallet' => 'E-Wallet',
            default    => $this->account_type,
        };
    }
}
