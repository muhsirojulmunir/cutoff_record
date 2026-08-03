<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\SalesOrder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class InvoiceService
{
    /**
     * Create a new Invoice from a Sales Order.
     */
    public function createFromSalesOrder(
        SalesOrder $so,
        ?string $dueDate = null,
        ?string $notes = null,
        ?int $userId = null
    ): Invoice {
        return DB::transaction(function () use ($so, $dueDate, $notes, $userId) {
            // Lock Sales Order header to prevent race conditions
            $lockedSo = SalesOrder::where('id', $so->id)->lockForUpdate()->firstOrFail();

            // Validate status: must be approved, processing, or completed
            if (!in_array($lockedSo->status, ['approved', 'processing', 'completed'])) {
                throw new InvalidArgumentException('Invoice hanya dapat dibuat dari Sales Order berstatus Approved, Processing, atau Completed.');
            }

            // Check if active invoice already exists for this SO to prevent duplicates
            $exists = Invoice::where('sales_order_id', $lockedSo->id)
                ->where('status', '!=', 'cancelled')
                ->exists();
            if ($exists) {
                throw new InvalidArgumentException('Sales Order ini sudah memiliki dokumen Invoice aktif.');
            }

            $invoiceNumber = $this->generateInvoiceNumber(now()->format('Y-m-d'));

            $status = 'unpaid';
            if ($dueDate) {
                $dueDateTime = new \DateTime($dueDate);
                $today = new \DateTime(now()->format('Y-m-d'));
                if ($dueDateTime < $today && (float)$lockedSo->grand_total > 0) {
                    $status = 'overdue';
                }
            }

            // Create Invoice Header
            $invoice = Invoice::create([
                'invoice_number'   => $invoiceNumber,
                'sales_order_id'   => $lockedSo->id,
                'customer_id'      => $lockedSo->customer_id,
                'invoice_date'     => now()->format('Y-m-d'),
                'due_date'         => $dueDate,
                'subtotal'         => $lockedSo->subtotal,
                'discount_amount'  => $lockedSo->discount_amount,
                'tax_amount'       => $lockedSo->tax_amount,
                'shipping_cost'    => $lockedSo->shipping_cost,
                'total_amount'     => $lockedSo->grand_total,
                'paid_amount'      => 0.00,
                'remaining_amount' => $lockedSo->grand_total,
                'status'           => $status,
                'notes'            => $notes ?? "Dibuat otomatis dari SO {$lockedSo->so_number}",
                'created_by'       => $userId,
            ]);

            // Copy items to invoice_items (snapshot)
            foreach ($lockedSo->items as $soItem) {
                InvoiceItem::create([
                    'invoice_id'      => $invoice->id,
                    'product_id'      => $soItem->product_id,
                    'product_name'    => $soItem->product_name,
                    'sku'             => $soItem->sku,
                    'quantity'        => $soItem->quantity,
                    'unit'            => $soItem->unit,
                    'unit_price'      => $soItem->price,
                    'discount_amount' => $soItem->discount_amount,
                    'tax_amount'      => $soItem->tax_amount,
                    'subtotal'        => $soItem->subtotal,
                ]);
            }

            return $invoice;
        });
    }

    /**
     * Recalculate remaining amount and status of an invoice.
     */
    public function recalculateBalance(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            // Lock invoice row
            $lockedInvoice = Invoice::where('id', $invoice->id)->lockForUpdate()->firstOrFail();

            $total = (float) $lockedInvoice->total_amount;
            $paid = (float) $lockedInvoice->paid_amount;
            $remaining = $total - $paid;

            if ($paid < 0 || $total < 0) {
                throw new InvalidArgumentException('Nominal pembayaran atau nominal tagihan tidak boleh bernilai negatif.');
            }

            if ($paid > $total) {
                throw new InvalidArgumentException('Nominal pembayaran tidak boleh melebihi nominal tagihan total.');
            }

            $status = $lockedInvoice->status;

            if ($status !== 'cancelled') {
                if ($remaining == 0) {
                    $status = 'paid';
                } else {
                    // Check if overdue
                    $isOverdue = false;
                    if ($lockedInvoice->due_date) {
                        $due = new \DateTime($lockedInvoice->due_date->format('Y-m-d'));
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

            $lockedInvoice->update([
                'remaining_amount' => $remaining,
                'status'           => $status,
            ]);

            $freshInvoice = $lockedInvoice->fresh();

            if ($freshInvoice->salesOrder) {
                // Status bayar pada SO mengikuti uang yang benar-benar masuk di
                // invoice, supaya daftar SO tidak menampilkan status usang.
                app(SalesOrderService::class)->syncPaymentStatus($freshInvoice->salesOrder);

                // Invoice lunas ⇒ coba tutup Sales Order-nya (baru jadi bila resi
                // sudah terbit juga). Aman dipanggil berulang kali.
                if ($status === 'paid') {
                    app(SalesOrderService::class)->syncCompletion($freshInvoice->salesOrder);
                }
            }

            return $freshInvoice;
        });
    }

    /**
     * Mark invoice as overdue if applicable.
     */
    public function markAsOverdue(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            $locked = Invoice::where('id', $invoice->id)->lockForUpdate()->firstOrFail();

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
     * Cancel the Invoice.
     */
    public function cancel(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            $locked = Invoice::where('id', $invoice->id)->lockForUpdate()->firstOrFail();

            if ($locked->status === 'paid') {
                throw new InvalidArgumentException('Invoice yang sudah lunas tidak dapat dibatalkan.');
            }

            if ((float) $locked->paid_amount > 0) {
                throw new InvalidArgumentException('Invoice yang sudah menerima pembayaran tidak dapat dibatalkan.');
            }

            $locked->update(['status' => 'cancelled']);

            return $locked->fresh();
        });
    }

    /**
     * Generate unique Invoice sequential number safely using database pessimistic lock.
     */
    protected function generateInvoiceNumber(string $dateString): string
    {
        $date = new \DateTime($dateString);
        $yearMonth = $date->format('Ym'); // YYYYMM
        $prefix = "INV-" . $yearMonth;

        // Query last record on the same month using write lock
        $lastInvoice = Invoice::withTrashed()->where('invoice_number', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->orderBy('invoice_number', 'desc')
            ->first();

        if ($lastInvoice) {
            $parts = explode('-', $lastInvoice->invoice_number);
            $sequence = (int) end($parts);
            $nextSequence = $sequence + 1;
        } else {
            $nextSequence = 1;
        }

        return $prefix . "-" . str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);
    }
}
