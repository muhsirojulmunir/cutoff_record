<?php

namespace App\Services;

use App\Models\CashBankAccount;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\Invoice;
use App\Models\FactoryReceivable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PaymentService
{
    public function __construct(private readonly CashBankService $cashBankService) {}

    /**
     * Create a payment allocated to a Customer Invoice.
     */
    public function createForInvoice(Invoice $invoice, array $data, int $userId): Payment
    {
        return DB::transaction(function () use ($invoice, $data, $userId) {
            // Lock Invoice to prevent concurrency issues
            $lockedInvoice = Invoice::where('id', $invoice->id)->lockForUpdate()->firstOrFail();

            if ($lockedInvoice->status === 'cancelled') {
                throw new InvalidArgumentException('Tidak dapat melakukan pembayaran pada Invoice yang sudah dibatalkan.');
            }

            if ($lockedInvoice->status === 'paid') {
                throw new InvalidArgumentException('Tidak dapat melakukan pembayaran pada Invoice yang sudah lunas.');
            }

            $amount    = (float) $data['amount'];
            $remaining = (float) $lockedInvoice->remaining_amount;

            if ($amount <= 0) {
                throw new InvalidArgumentException('Nominal pembayaran harus lebih besar dari nol.');
            }

            if ($amount > $remaining) {
                throw new InvalidArgumentException('Nominal pembayaran tidak boleh melebihi sisa tagihan.');
            }

            // Resolve cash/bank account
            $account = null;
            if (! empty($data['cash_bank_account_id'])) {
                $account = CashBankAccount::where('id', $data['cash_bank_account_id'])
                    ->where('status', 'active')
                    ->firstOrFail();
            }

            $paymentNumber = $this->generatePaymentNumber(now()->format('Y-m-d'));

            // Create Payment Header
            $payment = Payment::create([
                'payment_number'       => $paymentNumber,
                'payment_date'         => $data['payment_date'],
                'payment_type'         => 'customer_invoice',
                'payment_method'       => $data['payment_method'],
                'amount'               => $amount,
                'reference_number'     => $data['reference_number'] ?? null,
                'bank_account'         => $data['bank_account'] ?? null,
                'cash_account'         => $data['cash_account'] ?? null,
                'notes'                => $data['notes'] ?? null,
                'cash_bank_account_id' => $account?->id,
                'created_by'           => $userId,
                'status'               => 'posted',
            ]);

            // Create Allocation
            PaymentAllocation::create([
                'payment_id'  => $payment->id,
                'invoice_id'  => $lockedInvoice->id,
                'allocated_amount' => $amount,
            ]);

            // Update Invoice Paid Amount
            $lockedInvoice->update([
                'paid_amount' => (float) $lockedInvoice->paid_amount + $amount,
            ]);

            $this->recalculateSourceBalance('customer_invoice', $lockedInvoice);

            // Integrate Cash & Bank Ledger
            if ($account) {
                $this->cashBankService->recordCustomerPayment($payment, $account, $userId);
            }

            return $payment;
        });
    }

    /**
     * Create a payment allocated to a Factory Receivable.
     */
    public function createForFactoryReceivable(FactoryReceivable $fr, array $data, int $userId): Payment
    {
        return DB::transaction(function () use ($fr, $data, $userId) {
            // Lock Factory Receivable
            $lockedFr = FactoryReceivable::where('id', $fr->id)->lockForUpdate()->firstOrFail();

            if ($lockedFr->status === 'cancelled') {
                throw new InvalidArgumentException('Tidak dapat melakukan pembayaran pada Piutang Pabrik yang sudah dibatalkan.');
            }

            if ($lockedFr->status === 'paid') {
                throw new InvalidArgumentException('Tidak dapat melakukan pembayaran pada Piutang Pabrik yang sudah lunas.');
            }

            $amount    = (float) $data['amount'];
            $remaining = (float) $lockedFr->remaining_amount;

            if ($amount <= 0) {
                throw new InvalidArgumentException('Nominal pembayaran harus lebih besar dari nol.');
            }

            if ($amount > $remaining) {
                throw new InvalidArgumentException('Nominal pembayaran tidak boleh melebihi sisa kewajiban.');
            }

            // Resolve cash/bank account
            $account = null;
            if (! empty($data['cash_bank_account_id'])) {
                $account = CashBankAccount::where('id', $data['cash_bank_account_id'])
                    ->where('status', 'active')
                    ->firstOrFail();
            }

            $paymentNumber = $this->generatePaymentNumber(now()->format('Y-m-d'));

            // Create Payment Header
            $payment = Payment::create([
                'payment_number'       => $paymentNumber,
                'payment_date'         => $data['payment_date'],
                'payment_type'         => 'factory_receivable',
                'payment_method'       => $data['payment_method'],
                'amount'               => $amount,
                'reference_number'     => $data['reference_number'] ?? null,
                'bank_account'         => $data['bank_account'] ?? null,
                'cash_account'         => $data['cash_account'] ?? null,
                'notes'                => $data['notes'] ?? null,
                'cash_bank_account_id' => $account?->id,
                'created_by'           => $userId,
                'status'               => 'posted',
            ]);

            // Create Allocation
            PaymentAllocation::create([
                'payment_id'            => $payment->id,
                'factory_receivable_id' => $lockedFr->id,
                'allocated_amount'      => $amount,
            ]);

            // Update FR Paid Amount
            $lockedFr->update([
                'paid_amount' => (float) $lockedFr->paid_amount + $amount,
            ]);

            $this->recalculateSourceBalance('factory_receivable', $lockedFr);

            // Integrate Cash & Bank Ledger
            if ($account) {
                $this->cashBankService->recordSupplierPayment($payment, $account, $userId);
            }

            return $payment;
        });
    }

    /**
     * Cancel an existing posted payment and restore balances.
     */
    public function cancelPayment(Payment $payment): Payment
    {
        return DB::transaction(function () use ($payment) {
            // Lock Payment
            $lockedPayment = Payment::where('id', $payment->id)->lockForUpdate()->firstOrFail();

            if ($lockedPayment->status === 'cancelled') {
                throw new InvalidArgumentException('Payment sudah dalam status Dibatalkan.');
            }

            // Lock Allocation & Source Model
            $allocation = PaymentAllocation::where('payment_id', $lockedPayment->id)->firstOrFail();

            if ($lockedPayment->payment_type === 'customer_invoice') {
                $invoice = Invoice::where('id', $allocation->invoice_id)->lockForUpdate()->firstOrFail();

                if ($invoice->status === 'cancelled') {
                    throw new InvalidArgumentException('Tidak dapat membatalkan pembayaran untuk Invoice yang sudah dibatalkan.');
                }

                $newPaid = (float) $invoice->paid_amount - (float) $allocation->allocated_amount;
                $invoice->update(['paid_amount' => max(0.00, $newPaid)]);

                $this->recalculateSourceBalance('customer_invoice', $invoice);

            } elseif ($lockedPayment->payment_type === 'factory_receivable') {
                $fr = FactoryReceivable::where('id', $allocation->factory_receivable_id)->lockForUpdate()->firstOrFail();

                if ($fr->status === 'cancelled') {
                    throw new InvalidArgumentException('Tidak dapat membatalkan pembayaran untuk Piutang Pabrik yang sudah dibatalkan.');
                }

                $newPaid = (float) $fr->paid_amount - (float) $allocation->allocated_amount;
                $fr->update(['paid_amount' => max(0.00, $newPaid)]);

                $this->recalculateSourceBalance('factory_receivable', $fr);
            }

            // Reverse Cash Bank Transaction if exists
            $cashTxn = $this->cashBankService->findPaymentTransaction($lockedPayment);
            if ($cashTxn) {
                $this->cashBankService->reverseTransaction(
                    $cashTxn,
                    "Reversal Payment {$lockedPayment->payment_number}",
                    auth()->id() ?? $lockedPayment->created_by
                );
            }

            $lockedPayment->update(['status' => 'cancelled']);

            return $lockedPayment->fresh();
        });
    }

    /**
     * Recalculate remaining balances and statuses of the source transaction.
     */
    public function recalculateSourceBalance(string $type, $sourceModel): void
    {
        if ($type === 'customer_invoice') {
            $total     = (float) $sourceModel->total_amount;
            $paid      = (float) $sourceModel->paid_amount;
            $remaining = $total - $paid;

            $status = $sourceModel->status;
            if ($status !== 'cancelled') {
                if ($remaining <= 0) {
                    $status    = 'paid';
                    $remaining = 0.00;
                } else {
                    $isOverdue = false;
                    if ($sourceModel->due_date) {
                        $due   = new \DateTime($sourceModel->due_date->format('Y-m-d'));
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

            $sourceModel->update([
                'remaining_amount' => $remaining,
                'status'           => $status,
            ]);

            if ($sourceModel->sales_order_id) {
                $so = \App\Models\SalesOrder::find($sourceModel->sales_order_id);
                if ($so) {
                    app(\App\Services\SalesOrderService::class)->syncPaymentStatus($so);
                    if ($status === 'paid') {
                        app(\App\Services\SalesOrderService::class)->syncCompletion($so);
                    }
                }
            }

        } elseif ($type === 'factory_receivable') {
            $total     = (float) $sourceModel->original_amount;
            $paid      = (float) $sourceModel->paid_amount;
            $remaining = $total - $paid;

            $status = $sourceModel->status;
            if ($status !== 'cancelled') {
                if ($remaining <= 0) {
                    $status    = 'paid';
                    $remaining = 0.00;
                } else {
                    $isOverdue = false;
                    if ($sourceModel->due_date) {
                        $due   = new \DateTime($sourceModel->due_date->format('Y-m-d'));
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

            $sourceModel->update([
                'remaining_amount' => $remaining,
                'status'           => $status,
            ]);
        }
    }

    /**
     * Generate unique Payment sequential number.
     * Format: PAY-YYYYMM-XXXX
     */
    protected function generatePaymentNumber(string $dateString): string
    {
        $date      = new \DateTime($dateString);
        $yearMonth = $date->format('Ym'); // YYYYMM
        $prefix    = "PAY-{$yearMonth}";

        $lastPayment = Payment::withTrashed()->where('payment_number', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->orderBy('payment_number', 'desc')
            ->first();

        if ($lastPayment) {
            $parts        = explode('-', $lastPayment->payment_number);
            $sequence     = (int) end($parts);
            $nextSequence = $sequence + 1;
        } else {
            $nextSequence = 1;
        }

        return $prefix . '-' . str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);
    }
}
