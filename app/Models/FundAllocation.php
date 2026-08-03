<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pengisian dana mingguan yang diterima Finance, baik untuk Petty Cash
 * (kebutuhan kantor) maupun Dana Kelola (kebutuhan lain).
 */
class FundAllocation extends Model
{
    public const TYPES = [
        'petty_cash'  => 'Petty Cash (Kebutuhan Kantor)',
        'dana_kelola' => 'Dana Kelola (Kebutuhan Lain)',
    ];

    protected $fillable = [
        'fund_type',
        'period_start',
        'period_end',
        'amount',
        'cash_bank_account_id',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end'   => 'date',
        'amount'       => 'decimal:2',
    ];

    protected $appends = ['fund_type_label', 'period_label'];

    public function cashBankAccount(): BelongsTo
    {
        return $this->belongsTo(CashBankAccount::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function getFundTypeLabelAttribute(): string
    {
        return self::TYPES[$this->fund_type] ?? $this->fund_type;
    }

    /** Contoh: "04 Agu – 10 Agu 2026". */
    public function getPeriodLabelAttribute(): string
    {
        return $this->period_start->translatedFormat('d M') . ' – ' . $this->period_end->translatedFormat('d M Y');
    }
}
