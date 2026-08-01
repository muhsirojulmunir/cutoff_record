<?php

namespace App\Services;

use App\Models\FactoryReceivable;
use App\Models\PurchaseOrder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class FactoryReceivableService
{
    /**
     * Create a new Factory Receivable from a received Purchase Order.
     */
    public function createFromPurchaseOrder(
        PurchaseOrder $po,
        ?string $dueDate = null,
        ?string $notes = null,
        ?int $userId = null
    ): FactoryReceivable {
        return DB::transaction(function () use ($po, $dueDate, $notes, $userId) {
            // Lock PO header to prevent race conditions
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->firstOrFail();

            if ($lockedPo->status !== 'received') {
                throw new InvalidArgumentException('Piutang Pabrik hanya dapat dibuat dari Purchase Order berstatus Received.');
            }

            // Check if factory receivable already exists for this PO to prevent duplicate
            $exists = FactoryReceivable::where('purchase_order_id', $lockedPo->id)->exists();
            if ($exists) {
                throw new InvalidArgumentException('Purchase Order ini sudah memiliki dokumen Piutang Pabrik.');
            }

            $originalAmount = $lockedPo->grand_total;
            $receivableNumber = $this->generateReceivableNumber(now()->format('Y-m-d'));

            // If due_date is passed, we check if it is already overdue
            $status = 'unpaid';
            if ($dueDate) {
                $dueDateTime = new \DateTime($dueDate);
                $today = new \DateTime(now()->format('Y-m-d'));
                if ($dueDateTime < $today && $originalAmount > 0) {
                    $status = 'overdue';
                }
            }

            return FactoryReceivable::create([
                'receivable_number' => $receivableNumber,
                'supplier_id'       => $lockedPo->supplier_id,
                'purchase_order_id' => $lockedPo->id,
                'warehouse_id'      => $lockedPo->warehouse_id,
                'transaction_date'  => now()->format('Y-m-d'),
                'due_date'          => $dueDate,
                'original_amount'   => $originalAmount,
                'paid_amount'       => 0.00,
                'remaining_amount'  => $originalAmount,
                'status'            => $status,
                'notes'             => $notes ?? "Dibuat otomatis dari PO {$lockedPo->po_number}",
                'created_by'        => $userId,
            ]);
        });
    }

    /**
     * Recalculate remaining amount and status of a factory receivable.
     */
    public function recalculateBalance(FactoryReceivable $receivable): FactoryReceivable
    {
        return DB::transaction(function () use ($receivable) {
            // Lock receivable row
            $lockedReceivable = FactoryReceivable::where('id', $receivable->id)->lockForUpdate()->firstOrFail();

            $original = (float) $lockedReceivable->original_amount;
            $paid = (float) $lockedReceivable->paid_amount;
            $remaining = $original - $paid;

            if ($paid < 0 || $original < 0) {
                throw new InvalidArgumentException('Nominal pembayaran atau nominal awal tidak boleh bernilai negatif.');
            }

            if ($paid > $original) {
                throw new InvalidArgumentException('Nominal pembayaran tidak boleh melebihi nominal kewajiban awal.');
            }

            $status = $lockedReceivable->status;

            if ($status !== 'cancelled') {
                if ($remaining == 0) {
                    $status = 'paid';
                } else {
                    // Check if overdue
                    $isOverdue = false;
                    if ($lockedReceivable->due_date) {
                        $due = new \DateTime($lockedReceivable->due_date->format('Y-m-d'));
                        $today = new \DateTime(now()->format('Y-m-d'));
                        if ($due < $today) {
                            $isOverdue = true;
                        }
                    }

                    if ($isOverdue) {
                        $status = 'overdue';
                    } elseif ($paid > 0) {
                        $status = 'partially_paid';
                    } else {
                        $status = 'unpaid';
                    }
                }
            }

            $lockedReceivable->update([
                'remaining_amount' => $remaining,
                'status'           => $status,
            ]);

            return $lockedReceivable->fresh();
        });
    }

    /**
     * Mark receivable as overdue if applicable.
     */
    public function markAsOverdue(FactoryReceivable $receivable): FactoryReceivable
    {
        return DB::transaction(function () use ($receivable) {
            $locked = FactoryReceivable::where('id', $receivable->id)->lockForUpdate()->firstOrFail();

            if ($locked->status === 'cancelled' || $locked->status === 'paid') {
                return $locked;
            }

            if ($locked->due_date) {
                $due = new \DateTime($locked->due_date->format('Y-m-d'));
                $today = new \DateTime(now()->format('Y-m-d'));
                if ($due < $today && $locked->remaining_amount > 0) {
                    $locked->update(['status' => 'overdue']);
                }
            }

            return $locked->fresh();
        });
    }

    /**
     * Cancel the factory receivable.
     */
    public function cancel(FactoryReceivable $receivable): FactoryReceivable
    {
        return DB::transaction(function () use ($receivable) {
            $locked = FactoryReceivable::where('id', $receivable->id)->lockForUpdate()->firstOrFail();

            if ($locked->status === 'paid') {
                throw new InvalidArgumentException('Piutang Pabrik yang sudah lunas tidak dapat dibatalkan.');
            }

            $locked->update(['status' => 'cancelled']);

            return $locked->fresh();
        });
    }

    /**
     * Generate unique Factory Receivable sequential number safely using database pessimistic lock.
     */
    protected function generateReceivableNumber(string $dateString): string
    {
        $date = new \DateTime($dateString);
        $yearMonth = $date->format('Ym'); // YYYYMM
        $prefix = "FP-" . $yearMonth;

        // Query last record on the same month using write lock
        $lastReceivable = FactoryReceivable::withTrashed()->where('receivable_number', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->orderBy('receivable_number', 'desc')
            ->first();

        if ($lastReceivable) {
            $parts = explode('-', $lastReceivable->receivable_number);
            $sequence = (int) end($parts);
            $nextSequence = $sequence + 1;
        } else {
            $nextSequence = 1;
        }

        return $prefix . "-" . str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);
    }
}
