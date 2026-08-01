<?php

namespace App\Services;

use App\Models\CashBankAccount;
use App\Models\CashBankTransaction;
use App\Models\PettyCashTransaction;
use Illuminate\Support\Facades\DB;

class PettyCashService
{
    private const VALID_TRANSITIONS = [
        'draft'                    => ['pending_leader_approval', 'cancelled'],
        'pending_leader_approval'  => ['pending_finance_approval', 'rejected'],
        'pending_finance_approval' => ['approved', 'rejected'],
        'approved'                 => ['paid', 'cancelled'],
        'rejected'                 => ['cancelled'],
    ];

    public function __construct(private readonly CashBankService $cashBankService) {}

    public function create(array $data, int $userId): PettyCashTransaction
    {
        return DB::transaction(function () use ($data, $userId) {
            $number = $this->generateTransaction();

            return PettyCashTransaction::create([
                'transaction_number'  => $number,
                'transaction_date'    => $data['transaction_date'],
                'expense_category_id' => $data['expense_category_id'],
                'payment_method'      => $data['payment_method'],
                'cash_bank_account_id'=> $data['cash_bank_account_id'] ?? null,
                'amount'              => $data['amount'],
                'vendor_name'         => $data['vendor_name'] ?? null,
                'reference_number'    => $data['reference_number'] ?? null,
                'description'         => $data['description'],
                'attachment'          => $data['attachment'] ?? null,
                'status'              => 'draft',
                'created_by'          => $userId,
            ]);
        });
    }

    public function update(PettyCashTransaction $transaction, array $data): PettyCashTransaction
    {
        if ($transaction->status !== 'draft') {
            throw new \InvalidArgumentException('Hanya transaksi berstatus draft yang dapat diubah.');
        }

        $transaction->update([
            'transaction_date'    => $data['transaction_date'],
            'expense_category_id' => $data['expense_category_id'],
            'payment_method'      => $data['payment_method'],
            'cash_bank_account_id'=> $data['cash_bank_account_id'] ?? null,
            'amount'              => $data['amount'],
            'vendor_name'         => $data['vendor_name'] ?? null,
            'reference_number'    => $data['reference_number'] ?? null,
            'description'         => $data['description'],
            'attachment'          => $data['attachment'] ?? null,
        ]);

        return $transaction->fresh();
    }

    public function submitForApproval(PettyCashTransaction $transaction, int $userId): PettyCashTransaction
    {
        if ($transaction->status !== 'draft') {
            throw new \InvalidArgumentException('Hanya transaksi berstatus draft yang dapat diajukan.');
        }

        DB::transaction(function () use ($transaction, $userId) {
            $transaction->update([
                'status'       => 'pending_leader_approval',
                'submitted_by' => $userId,
                'submitted_at' => now(),
            ]);
        });

        return $transaction->fresh();
    }

    /**
     * Leader approves petty cash → moves to pending Finance approval.
     */
    public function leaderApprove(PettyCashTransaction $transaction, int $userId): PettyCashTransaction
    {
        if ($transaction->status !== 'pending_leader_approval') {
            throw new \InvalidArgumentException('Hanya transaksi berstatus Pending Leader Approval yang dapat disetujui oleh Leader.');
        }

        if ($transaction->created_by === $userId) {
            throw new \InvalidArgumentException('Anda tidak dapat menyetujui transaksi yang Anda buat sendiri.');
        }

        DB::transaction(function () use ($transaction, $userId) {
            $transaction->update([
                'status'              => 'pending_finance_approval',
                'leader_approved_by'  => $userId,
                'leader_approved_at'  => now(),
            ]);
        });

        return $transaction->fresh();
    }

    /**
     * Finance approves petty cash → moves to approved (ready for disbursement).
     */
    public function financeApprove(PettyCashTransaction $transaction, int $userId): PettyCashTransaction
    {
        if ($transaction->status !== 'pending_finance_approval') {
            throw new \InvalidArgumentException('Hanya transaksi berstatus Pending Finance Approval yang dapat disetujui oleh Finance.');
        }

        DB::transaction(function () use ($transaction, $userId) {
            $transaction->update([
                'status'               => 'approved',
                'finance_approved_by'  => $userId,
                'finance_approved_at'  => now(),
                'approved_by'          => $userId,
                'approved_at'          => now(),
            ]);
        });

        return $transaction->fresh();
    }

    public function reject(PettyCashTransaction $transaction, int $userId, string $reason): PettyCashTransaction
    {
        if (!in_array($transaction->status, ['pending_leader_approval', 'pending_finance_approval'])) {
            throw new \InvalidArgumentException('Hanya transaksi yang sedang dalam proses approval yang dapat ditolak.');
        }

        if (empty(trim($reason))) {
            throw new \InvalidArgumentException('Alasan penolakan wajib diisi.');
        }

        DB::transaction(function () use ($transaction, $userId, $reason) {
            $transaction->update([
                'status'           => 'rejected',
                'rejected_by'      => $userId,
                'rejected_at'      => now(),
                'rejection_reason' => $reason,
            ]);
        });

        return $transaction->fresh();
    }

    /**
     * Finance disburses / pays out petty cash → status paid, deducts cash/bank balance.
     */
    public function disburse(PettyCashTransaction $transaction, int $userId): PettyCashTransaction
    {
        if ($transaction->status !== 'approved') {
            throw new \InvalidArgumentException('Hanya transaksi berstatus Approved yang dapat dicairkan.');
        }

        DB::transaction(function () use ($transaction, $userId) {
            $transaction->update([
                'status'      => 'paid',
                'executed_by' => $userId,
                'executed_at' => now(),
            ]);

            // Deduct from cash/bank account
            if ($transaction->cash_bank_account_id) {
                $account = CashBankAccount::where('id', $transaction->cash_bank_account_id)
                    ->where('status', 'active')
                    ->first();

                if ($account) {
                    $this->cashBankService->recordApprovedPettyCash($transaction, $account, $userId);
                }
            }
        });

        return $transaction->fresh();
    }

    /**
     * Cancel petty cash. If it was approved and has a cash transaction, create reversal.
     */
    public function cancel(PettyCashTransaction $transaction, int $userId, string $reason): PettyCashTransaction
    {
        if (!in_array($transaction->status, ['draft', 'pending_leader_approval', 'pending_finance_approval', 'approved', 'paid', 'rejected'])) {
            throw new \InvalidArgumentException('Transaksi dengan status saat ini tidak dapat dibatalkan.');
        }

        if (empty(trim($reason))) {
            throw new \InvalidArgumentException('Alasan pembatalan wajib diisi.');
        }

        DB::transaction(function () use ($transaction, $userId, $reason) {
            $fresh = $transaction->fresh();
            // If approved/paid and has cash bank transaction, reverse it
            if (in_array($fresh->status, ['approved', 'paid'])) {
                $cashTxn = $this->cashBankService->findPettyCashTransaction($fresh);
                if ($cashTxn) {
                    $this->cashBankService->reverseTransaction(
                        $cashTxn,
                        "Reversal Petty Cash {$fresh->transaction_number} - {$reason}",
                        $userId
                    );
                }
            }

            $transaction->update([
                'status'              => 'cancelled',
                'cancelled_by'        => $userId,
                'cancelled_at'        => now(),
                'cancellation_reason' => $reason,
            ]);
        });

        return $transaction->fresh();
    }

    private function assertTransition(string $current, string $target): void
    {
        $allowed = self::VALID_TRANSITIONS[$current] ?? [];

        if (! in_array($target, $allowed, true)) {
            throw new \InvalidArgumentException("Transisi status dari '{$current}' ke '{$target}' tidak diizinkan.");
        }
    }

    private function generateTransaction(): string
    {
        $prefix = 'PC-' . now()->format('Ym') . '-';

        $last = PettyCashTransaction::withTrashed()
            ->where('transaction_number', 'like', $prefix . '%')
            ->lockForUpdate()
            ->orderByDesc('transaction_number')
            ->first();

        $next = $last
            ? (int) substr($last->transaction_number, -4) + 1
            : 1;

        return $prefix . str_pad($next, 4, '0', STR_PAD_LEFT);
    }
}
