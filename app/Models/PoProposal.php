<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class PoProposal extends Model
{
    use HasFactory, SoftDeletes;

    public const STATUS_PENDING  = 'pending_approval';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_ORDERED  = 'ordered';

    protected $fillable = [
        'po_number',
        'sku',
        'product_name',
        'supplier_name',
        'warehouse',
        'current_stock',
        'monthly_velocity',
        'stock_coverage_months',
        'target_months',
        'target_stock',
        'recommended_qty',
        'proposed_qty',
        'status',
        'proposed_by',
        'reviewed_by',
        'reviewed_at',
        'notes',
        'rejection_reason',
    ];

    protected $casts = [
        'current_stock'         => 'integer',
        'monthly_velocity'      => 'decimal:2',
        'stock_coverage_months' => 'decimal:2',
        'target_months'         => 'integer',
        'target_stock'          => 'integer',
        'recommended_qty'       => 'integer',
        'proposed_qty'          => 'integer',
        'reviewed_at'           => 'datetime',
    ];

    public function proposer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'proposed_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function approveBy(User $user): void
    {
        $this->update([
            'status'      => self::STATUS_APPROVED,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
        ]);
    }

    public function rejectBy(User $user, string $reason): void
    {
        $this->update([
            'status'           => self::STATUS_REJECTED,
            'reviewed_by'      => $user->id,
            'reviewed_at'      => now(),
            'rejection_reason' => $reason,
        ]);
    }

    public static function generatePoNumber(): string
    {
        $date = now()->format('Ymd');
        $prefix = "PO-PRO-{$date}-";
        $last = self::withTrashed()
            ->where('po_number', 'like', "{$prefix}%")
            ->orderByDesc('id')
            ->first();

        $seq = 1;
        if ($last && preg_match('/-(\d{4})$/', $last->po_number, $matches)) {
            $seq = ((int)$matches[1]) + 1;
        }

        return sprintf('%s%04d', $prefix, $seq);
    }
}
