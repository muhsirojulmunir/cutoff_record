<?php

namespace App\Services;

use App\Models\CashBankAccount;
use App\Models\CashBankTransaction;
use App\Models\FundAllocation;
use App\Models\Payment;
use App\Models\PettyCashTransaction;
use App\Models\PurchaseOrder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class CashBankService
{
    // ─── Account Management ───────────────────────────────────────────────────

    /**
     * Create a new Cash/Bank/E-Wallet account.
     */
    public function createAccount(array $data, int $userId): CashBankAccount
    {
        return DB::transaction(function () use ($data, $userId) {
            $code = $this->generateAccountCode();

            $account = CashBankAccount::create([
                'account_code'           => $code,
                'account_name'           => $data['account_name'],
                'account_type'           => $data['account_type'],
                'account_number'         => $data['account_number'] ?? null,
                'bank_name'              => $data['bank_name'] ?? null,
                'account_holder'         => $data['account_holder'] ?? null,
                'opening_balance'        => $data['opening_balance'] ?? 0,
                'current_balance'        => $data['opening_balance'] ?? 0,
                'allow_negative_balance' => $data['allow_negative_balance'] ?? false,
                'status'                 => 'active',
                'notes'                  => $data['notes'] ?? null,
                'created_by'             => $userId,
            ]);

            // Record opening balance as a ledger entry (only if > 0)
            if ((float) $account->opening_balance > 0) {
                $this->createLedgerEntry($account, [
                    'transaction_date' => now()->toDateString(),
                    'transaction_type' => 'opening_balance',
                    'direction'        => 'in',
                    'amount'           => $account->opening_balance,
                    'balance_before'   => 0,
                    'balance_after'    => $account->opening_balance,
                    'description'      => 'Saldo Awal Rekening',
                ], $userId);
            }

            return $account;
        });
    }

    /**
     * Update account details (non-balance fields).
     */
    public function updateAccount(CashBankAccount $account, array $data): CashBankAccount
    {
        $account->update([
            'account_name'    => $data['account_name'],
            'account_type'    => $data['account_type'],
            'account_number'  => $data['account_number'] ?? null,
            'bank_name'       => $data['bank_name'] ?? null,
            'account_holder'  => $data['account_holder'] ?? null,
            'notes'           => $data['notes'] ?? null,
        ]);

        return $account->fresh();
    }

    /**
     * Deactivate (soft-disable) an account.
     */
    public function deactivateAccount(CashBankAccount $account): CashBankAccount
    {
        if ($account->status === 'inactive') {
            throw new InvalidArgumentException('Rekening sudah dalam status tidak aktif.');
        }

        $account->update(['status' => 'inactive']);
        return $account->fresh();
    }

    /**
     * Reactivate an account.
     */
    public function activateAccount(CashBankAccount $account): CashBankAccount
    {
        if ($account->status === 'active') {
            throw new InvalidArgumentException('Rekening sudah dalam status aktif.');
        }

        $account->update(['status' => 'active']);
        return $account->fresh();
    }

    // ─── Manual Cash In / Cash Out ────────────────────────────────────────────

    /**
     * Manual cash in (increases balance).
     */
    public function recordCashIn(CashBankAccount $account, array $data, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($account, $data, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount = $this->assertPositiveAmount($data['amount']);

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore + $amount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $data['transaction_date'],
                'transaction_type' => 'cash_in',
                'direction'        => 'in',
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'description'      => $data['description'],
                'reference_number' => $data['reference_number'] ?? null,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    /**
     * Manual cash out (decreases balance).
     */
    public function recordCashOut(CashBankAccount $account, array $data, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($account, $data, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount = $this->assertPositiveAmount($data['amount']);
            $this->assertSufficientBalance($locked, $amount);

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore - $amount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $data['transaction_date'],
                'transaction_type' => 'cash_out',
                'direction'        => 'out',
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'description'      => $data['description'],
                'reference_number' => $data['reference_number'] ?? null,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    /**
     * Manual adjustment (admin only — can go in or out).
     */
    public function recordAdjustment(CashBankAccount $account, array $data, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($account, $data, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount    = $this->assertPositiveAmount($data['amount']);
            $direction = $data['direction']; // 'in' or 'out'

            $balanceBefore = (float) $locked->current_balance;

            if ($direction === 'in') {
                $balanceAfter = $balanceBefore + $amount;
            } else {
                $this->assertSufficientBalance($locked, $amount);
                $balanceAfter = $balanceBefore - $amount;
            }

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $data['transaction_date'],
                'transaction_type' => 'adjustment',
                'direction'        => $direction,
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'description'      => $data['description'],
                'reference_number' => $data['reference_number'] ?? null,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    // ─── Payment Integration ──────────────────────────────────────────────────

    /**
     * Record a cash bank transaction for Customer Payment (cash in).
     * Called from PaymentService after payment is created.
     */
    public function recordCustomerPayment(Payment $payment, CashBankAccount $account, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($payment, $account, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount = (float) $payment->amount;

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore + $amount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $payment->payment_date,
                'transaction_type' => 'customer_payment',
                'direction'        => 'in',
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'source_type'      => Payment::class,
                'source_id'        => $payment->id,
                'description'      => "Pembayaran Customer - {$payment->payment_number}",
                'reference_number' => $payment->reference_number,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    /**
     * Record a cash bank transaction for Supplier/Factory Payment (cash out).
     */
    public function recordSupplierPayment(Payment $payment, CashBankAccount $account, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($payment, $account, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount = (float) $payment->amount;
            $this->assertSufficientBalance($locked, $amount);

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore - $amount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $payment->payment_date,
                'transaction_type' => 'supplier_payment',
                'direction'        => 'out',
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'source_type'      => Payment::class,
                'source_id'        => $payment->id,
                'description'      => "Pembayaran Supplier - {$payment->payment_number}",
                'reference_number' => $payment->reference_number,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    /**
     * Record Down Payment for a Purchase Order (cash out).
     * Called from PurchaseOrderService::payDownPayment.
     */
    public function recordPurchaseOrderDP(PurchaseOrder $po, CashBankAccount $account, float $dpAmount, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($po, $account, $dpAmount, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $this->assertSufficientBalance($locked, $dpAmount);

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore - $dpAmount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => now()->format('Y-m-d'),
                'transaction_type' => 'purchase_order_dp',
                'direction'        => 'out',
                'amount'           => $dpAmount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'source_type'      => PurchaseOrder::class,
                'source_id'        => $po->id,
                'description'      => "Down Payment PO {$po->po_number}",
                'reference_number' => $po->po_number,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    /**
     * Record petty cash deduction upon approval (cash out).
     * IDEMPOTENT: Checks for existing transaction to prevent duplicates.
     */
    public function recordApprovedPettyCash(PettyCashTransaction $pettyCash, CashBankAccount $account, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($pettyCash, $account, $userId) {
            // Re-lock petty cash to get fresh state
            $lockedPc = PettyCashTransaction::where('id', $pettyCash->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedPc->status, ['approved', 'paid'])) {
                throw new InvalidArgumentException('Hanya Petty Cash yang sudah disetujui yang dapat memotong saldo rekening.');
            }

            // Idempotency check: prevent duplicate deduction
            $existing = CashBankTransaction::where('source_type', PettyCashTransaction::class)
                ->where('source_id', $lockedPc->id)
                ->first();

            if ($existing) {
                throw new InvalidArgumentException('Deduction untuk Petty Cash ini sudah pernah dilakukan sebelumnya.');
            }

            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount = (float) $lockedPc->amount;
            $this->assertSufficientBalance($locked, $amount);

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore - $amount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $lockedPc->transaction_date,
                'transaction_type' => 'petty_cash',
                'direction'        => 'out',
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'source_type'      => PettyCashTransaction::class,
                'source_id'        => $lockedPc->id,
                'description'      => "Petty Cash Approved - {$lockedPc->transaction_number}",
                'reference_number' => $lockedPc->reference_number,
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    /**
     * Record weekly fund hand-over to Finance (cash out).
     * Dana ini yang kemudian dipakai untuk Petty Cash / Dana Kelola.
     */
    public function recordFundAllocation(FundAllocation $allocation, CashBankAccount $account, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($allocation, $account, $userId) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $this->assertActive($locked);
            $amount = (float) $allocation->amount;
            $this->assertSufficientBalance($locked, $amount);

            $balanceBefore = (float) $locked->current_balance;
            $balanceAfter  = $balanceBefore - $amount;

            $txn = $this->createLedgerEntry($locked, [
                'transaction_date' => $allocation->period_start,
                'transaction_type' => 'petty_cash',
                'direction'        => 'out',
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'source_type'      => FundAllocation::class,
                'source_id'        => $allocation->id,
                'description'      => "Pengisian {$allocation->fund_type_label} periode {$allocation->period_label}",
            ], $userId);

            $locked->update(['current_balance' => $balanceAfter]);

            return $txn;
        });
    }

    // ─── Reversal ─────────────────────────────────────────────────────────────

    /**
     * Reverse a cash bank transaction (for payment or petty cash cancellations).
     * Creates a new reversal ledger entry instead of deleting the original.
     */
    public function reverseTransaction(CashBankTransaction $originalTxn, string $reason, int $userId): CashBankTransaction
    {
        return DB::transaction(function () use ($originalTxn, $reason, $userId) {
            if ($originalTxn->status === 'reversed') {
                throw new InvalidArgumentException('Transaksi ini sudah pernah di-reverse sebelumnya.');
            }

            $account = CashBankAccount::where('id', $originalTxn->account_id)->lockForUpdate()->firstOrFail();

            $this->assertActive($account);

            $amount        = (float) $originalTxn->amount;
            $balanceBefore = (float) $account->current_balance;

            // Reversal is opposite direction
            $reversalDirection = $originalTxn->direction === 'in' ? 'out' : 'in';

            if ($reversalDirection === 'out') {
                $this->assertSufficientBalance($account, $amount);
                $balanceAfter = $balanceBefore - $amount;
            } else {
                $balanceAfter = $balanceBefore + $amount;
            }

            $reversalTxn = $this->createLedgerEntry($account, [
                'transaction_date' => now()->toDateString(),
                'transaction_type' => 'adjustment',
                'direction'        => $reversalDirection,
                'amount'           => $amount,
                'balance_before'   => $balanceBefore,
                'balance_after'    => $balanceAfter,
                'source_type'      => $originalTxn->source_type,
                'source_id'        => $originalTxn->source_id,
                'description'      => "Reversal - {$reason}",
                'reference_number' => "REV-{$originalTxn->transaction_number}",
            ], $userId);

            // Mark original as reversed
            $originalTxn->update(['status' => 'reversed']);

            $account->update(['current_balance' => $balanceAfter]);

            return $reversalTxn;
        });
    }

    /**
     * Find the active cash bank transaction for a Payment (not reversed).
     */
    public function findPaymentTransaction(Payment $payment): ?CashBankTransaction
    {
        return CashBankTransaction::where('source_type', Payment::class)
            ->where('source_id', $payment->id)
            ->where('status', 'posted')
            ->first();
    }

    /**
     * Find the active cash bank transaction for an approved PettyCash (not reversed).
     */
    public function findPettyCashTransaction(PettyCashTransaction $pettyCash): ?CashBankTransaction
    {
        return CashBankTransaction::where(function ($query) use ($pettyCash) {
            $query->where('source_type', PettyCashTransaction::class)
                  ->orWhere('source_type', 'petty_cash');
        })
            ->where('source_id', $pettyCash->id)
            ->where('status', 'posted')
            ->first();
    }

    // ─── Recalculate ──────────────────────────────────────────────────────────

    /**
     * Recalculate current_balance from ledger (for audits/repairs).
     * opening_balance + total_in - total_out of posted transactions.
     */
    public function recalculateBalance(CashBankAccount $account): CashBankAccount
    {
        return DB::transaction(function () use ($account) {
            $locked = CashBankAccount::where('id', $account->id)->lockForUpdate()->firstOrFail();

            $totalIn = CashBankTransaction::where('account_id', $locked->id)
                ->where('direction', 'in')
                ->where('status', 'posted')
                ->sum('amount');

            $totalOut = CashBankTransaction::where('account_id', $locked->id)
                ->where('direction', 'out')
                ->where('status', 'posted')
                ->sum('amount');

            $recalculated = (float) $totalIn - (float) $totalOut;
            $locked->update(['current_balance' => $recalculated]);

            return $locked->fresh();
        });
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    private function createLedgerEntry(CashBankAccount $account, array $data, int $userId): CashBankTransaction
    {
        $number = $this->generateTransactionNumber();

        return CashBankTransaction::create([
            'transaction_number' => $number,
            'account_id'         => $account->id,
            'transaction_date'   => $data['transaction_date'],
            'transaction_type'   => $data['transaction_type'],
            'direction'          => $data['direction'],
            'amount'             => $data['amount'],
            'balance_before'     => $data['balance_before'],
            'balance_after'      => $data['balance_after'],
            'source_type'        => $data['source_type'] ?? null,
            'source_id'          => $data['source_id'] ?? null,
            'description'        => $data['description'],
            'reference_number'   => $data['reference_number'] ?? null,
            'created_by'         => $userId,
            'status'             => 'posted',
        ]);
    }

    private function generateAccountCode(): string
    {
        $last = CashBankAccount::withTrashed()
            ->where('account_code', 'like', 'ACC-%')
            ->lockForUpdate()
            ->orderByDesc('account_code')
            ->first();

        if ($last) {
            $parts = explode('-', $last->account_code);
            $next  = (int) end($parts) + 1;
        } else {
            $next = 1;
        }

        return 'ACC-' . str_pad($next, 4, '0', STR_PAD_LEFT);
    }

    private function generateTransactionNumber(): string
    {
        $prefix = 'CB-' . now()->format('Ym') . '-';

        $last = CashBankTransaction::withTrashed()
            ->where('transaction_number', 'like', $prefix . '%')
            ->lockForUpdate()
            ->orderByDesc('transaction_number')
            ->first();

        $next = $last
            ? (int) substr($last->transaction_number, -4) + 1
            : 1;

        return $prefix . str_pad($next, 4, '0', STR_PAD_LEFT);
    }

    private function assertActive(CashBankAccount $account): void
    {
        if ($account->status !== 'active') {
            throw new InvalidArgumentException("Rekening '{$account->account_name}' tidak aktif dan tidak dapat digunakan untuk transaksi.");
        }
    }

    private function assertPositiveAmount(mixed $amount): float
    {
        $float = (float) $amount;
        if ($float <= 0) {
            throw new InvalidArgumentException('Nominal transaksi harus lebih besar dari nol.');
        }
        return $float;
    }

    private function assertSufficientBalance(CashBankAccount $account, float $amount): void
    {
        if (! $account->allow_negative_balance) {
            $remaining = (float) $account->current_balance - $amount;
            if ($remaining < 0) {
                throw new InvalidArgumentException(
                    "Saldo rekening '{$account->account_name}' tidak mencukupi. " .
                    "Saldo tersedia: Rp " . number_format($account->current_balance, 0, ',', '.') .
                    ", Dibutuhkan: Rp " . number_format($amount, 0, ',', '.')
                );
            }
        }
    }
}
