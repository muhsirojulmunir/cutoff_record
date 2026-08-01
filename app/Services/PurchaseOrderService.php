<?php

namespace App\Services;

use App\Models\CashBankAccount;
use App\Models\CashBankTransaction;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PurchaseOrderService
{
    /**
     * Create a new Purchase Order.
     */
    public function create(array $data, int $userId): PurchaseOrder
    {
        return DB::transaction(function () use ($data, $userId) {
            $orderDate = $data['order_date'];
            $poNumber = $this->generatePoNumber($orderDate);

            // Calculate totals and compile item snapshots
            $itemsData = [];
            $subtotal = 0;

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);

                $price = $item['price'] ?? $product->purchase_price;
                $quantity = $item['quantity'];
                $itemDiscount = $item['discount_amount'] ?? 0;
                $itemTax = $item['tax_amount'] ?? 0;

                $itemSubtotal = ($price * $quantity) - $itemDiscount + $itemTax;

                $itemsData[] = [
                    'product_id'      => $product->id,
                    'product_code'    => $product->sku, // Snapshot SKU
                    'product_name'    => $product->name, // Snapshot Name
                    'quantity'        => $quantity,
                    'unit'            => $product->unit ?? 'pcs',
                    'unit_price'      => $price, // Snapshot Price
                    'discount_amount' => $itemDiscount,
                    'tax_amount'      => $itemTax,
                    'subtotal'        => $itemSubtotal,
                    'received_quantity' => 0,
                ];

                $subtotal += $itemSubtotal;
            }

            $discount = $data['discount_amount'] ?? 0;
            $tax = $data['tax_amount'] ?? 0;
            $shipping = $data['shipping_cost'] ?? 0;
            $grandTotal = $subtotal - $discount + $tax + $shipping;

            // Create header
            $purchaseOrder = PurchaseOrder::create([
                'po_number'              => $poNumber,
                'supplier_id'            => $data['supplier_id'],
                'warehouse_id'           => $data['warehouse_id'] ?? null,
                'order_date'             => $orderDate,
                'expected_delivery_date' => $data['expected_delivery_date'] ?? null,
                'source'                 => $data['source'] ?? 'manual',
                'status'                 => 'draft',
                'payment_status'         => 'unpaid',
                'subtotal'               => $subtotal,
                'discount_amount'        => $discount,
                'tax_amount'             => $tax,
                'shipping_cost'          => $shipping,
                'grand_total'            => $grandTotal,
                'notes'                  => $data['notes'] ?? null,
                'created_by'             => $userId,
            ]);

            // Save items
            foreach ($itemsData as $item) {
                $purchaseOrder->items()->create($item);
            }

            return $purchaseOrder;
        });
    }

    /**
     * Update an existing Purchase Order.
     */
    public function update(PurchaseOrder $po, array $data): PurchaseOrder
    {
        if ($po->status !== 'draft') {
            throw new InvalidArgumentException('Hanya Purchase Order dengan status Draft yang dapat diperbarui.');
        }

        return DB::transaction(function () use ($po, $data) {
            $itemsData = [];
            $subtotal = 0;

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);

                $price = $item['price'] ?? $product->purchase_price;
                $quantity = $item['quantity'];
                $itemDiscount = $item['discount_amount'] ?? 0;
                $itemTax = $item['tax_amount'] ?? 0;

                $itemSubtotal = ($price * $quantity) - $itemDiscount + $itemTax;

                $itemsData[] = [
                    'product_id'      => $product->id,
                    'product_code'    => $product->sku,
                    'product_name'    => $product->name,
                    'quantity'        => $quantity,
                    'unit'            => $product->unit ?? 'pcs',
                    'unit_price'      => $price,
                    'discount_amount' => $itemDiscount,
                    'tax_amount'      => $itemTax,
                    'subtotal'        => $itemSubtotal,
                    'received_quantity' => 0,
                ];

                $subtotal += $itemSubtotal;
            }

            $discount = $data['discount_amount'] ?? 0;
            $tax = $data['tax_amount'] ?? 0;
            $shipping = $data['shipping_cost'] ?? 0;
            $grandTotal = $subtotal - $discount + $tax + $shipping;

            $po->update([
                'supplier_id'            => $data['supplier_id'],
                'warehouse_id'           => $data['warehouse_id'] ?? null,
                'order_date'             => $data['order_date'],
                'expected_delivery_date' => $data['expected_delivery_date'] ?? null,
                'source'                 => $data['source'] ?? 'manual',
                'subtotal'               => $subtotal,
                'discount_amount'        => $discount,
                'tax_amount'             => $tax,
                'shipping_cost'          => $shipping,
                'grand_total'            => $grandTotal,
                'notes'                  => $data['notes'] ?? null,
            ]);

            // Recreate items
            $po->items()->delete();
            foreach ($itemsData as $item) {
                $po->items()->create($item);
            }

            return $po->fresh();
        });
    }

    /**
     * Submit Purchase Order for Leader approval.
     */
    public function submitApproval(PurchaseOrder $po): PurchaseOrder
    {
        if ($po->status !== 'draft') {
            throw new InvalidArgumentException('Hanya Purchase Order berstatus Draft yang dapat diajukan persetujuan.');
        }

        $po->update(['status' => 'pending_leader_approval']);
        return $po;
    }

    /**
     * Leader approves the Purchase Order → moves to pending Finance approval.
     */
    public function leaderApprove(PurchaseOrder $po, int $userId): PurchaseOrder
    {
        if ($po->status !== 'pending_leader_approval') {
            throw new InvalidArgumentException('Hanya PO berstatus Pending Leader Approval yang dapat disetujui oleh Leader.');
        }

        $po->update([
            'status'              => 'pending_finance_approval',
            'leader_approved_by'  => $userId,
            'leader_approved_at'  => now(),
        ]);
        return $po;
    }

    /**
     * Finance approves the Purchase Order → moves to approved.
     */
    public function financeApprove(PurchaseOrder $po, int $userId): PurchaseOrder
    {
        if ($po->status !== 'pending_finance_approval') {
            throw new InvalidArgumentException('Hanya PO berstatus Pending Finance Approval yang dapat disetujui oleh Finance.');
        }

        $po->update([
            'status'               => 'approved',
            'finance_approved_by'  => $userId,
            'finance_approved_at'  => now(),
        ]);
        return $po;
    }

    /**
     * Reject a Purchase Order (Leader or Finance can reject).
     */
    public function reject(PurchaseOrder $po, int $userId, string $reason): PurchaseOrder
    {
        if (!in_array($po->status, ['pending_leader_approval', 'pending_finance_approval'])) {
            throw new InvalidArgumentException('Hanya PO yang sedang dalam proses approval yang dapat ditolak.');
        }

        $po->update([
            'status'        => 'rejected',
            'rejected_by'   => $userId,
            'rejected_at'   => now(),
            'reject_reason' => $reason,
        ]);
        return $po;
    }

    /**
     * Mark the Purchase Order as ordered.
     */
    public function markAsOrdered(PurchaseOrder $po): PurchaseOrder
    {
        if ($po->status !== 'approved') {
            throw new InvalidArgumentException('Hanya Purchase Order berstatus Approved yang dapat diproses ke Ordered.');
        }

        $po->update(['status' => 'ordered']);
        return $po;
    }

    protected StockMovementService $stockMovementService;
    protected FactoryReceivableService $factoryReceivableService;
    protected CashBankService $cashBankService;

    public function __construct(
        StockMovementService $stockMovementService,
        FactoryReceivableService $factoryReceivableService,
        CashBankService $cashBankService
    ) {
        $this->stockMovementService    = $stockMovementService;
        $this->factoryReceivableService = $factoryReceivableService;
        $this->cashBankService         = $cashBankService;
    }

    /**
     * Finance pays Down Payment (DP) for an approved PO.
     * Deducts the chosen Cash/Bank account balance.
     */
    public function payDownPayment(PurchaseOrder $po, array $dpData, int $userId): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $dpData, $userId) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->firstOrFail();

            if ($lockedPo->status !== 'approved') {
                throw new InvalidArgumentException('Hanya PO berstatus Approved yang dapat diproses Down Payment.');
            }

            $dpAmount = (float) ($dpData['dp_amount'] ?? 0);
            if ($dpAmount <= 0) {
                throw new InvalidArgumentException('Nominal Down Payment harus lebih dari nol.');
            }

            if ($dpAmount > (float) $lockedPo->grand_total) {
                throw new InvalidArgumentException('Nominal Down Payment tidak boleh melebihi Grand Total PO.');
            }

            $paymentTerms   = $dpData['payment_terms'] ?? 'cash_on_delivery';
            $cashBankAccountId = $dpData['cash_bank_account_id'] ?? null;

            // Deduct from Cash/Bank Account if provided
            if ($cashBankAccountId) {
                $account = CashBankAccount::where('id', $cashBankAccountId)
                    ->where('status', 'active')
                    ->firstOrFail();

                $this->cashBankService->recordPurchaseOrderDP($lockedPo, $account, $dpAmount, $userId);
            }

            $lockedPo->update([
                'dp_amount'              => $dpAmount,
                'dp_paid_amount'         => $dpAmount,
                'dp_payment_date'        => now()->format('Y-m-d'),
                'dp_cash_bank_account_id'=> $cashBankAccountId,
                'payment_terms'          => $paymentTerms,
            ]);

            return $lockedPo->fresh();
        });
    }

    /**
     * Finance validates received goods: accepts, revises qty/price, or rejects items.
     * Calculates the final bill (validated_grand_total - dp_paid_amount).
     */
    public function validateReceivedItems(PurchaseOrder $po, array $validationItems, int $userId): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $validationItems, $userId) {
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedPo->status, ['received', 'partially_received'])) {
                throw new InvalidArgumentException('Finance hanya dapat memvalidasi PO berstatus Received atau Partially Received.');
            }

            if ($lockedPo->is_finance_validated) {
                throw new InvalidArgumentException('PO ini sudah divalidasi oleh Finance sebelumnya.');
            }

            $validatedSubtotal = 0.0;

            foreach ($validationItems as $validationItem) {
                $poItem = $lockedPo->items()
                    ->where('id', $validationItem['item_id'])
                    ->first();

                if (!$poItem) {
                    throw new InvalidArgumentException("Item ID {$validationItem['item_id']} tidak ditemukan dalam PO ini.");
                }

                $action          = $validationItem['action'] ?? 'accepted';
                $acceptedQty     = (int) ($validationItem['accepted_quantity'] ?? $poItem->received_quantity);
                $rejectedQty     = (int) ($validationItem['rejected_quantity'] ?? 0);
                $rejectedReason  = $validationItem['rejected_reason'] ?? null;
                $validatedPrice  = (float) ($validationItem['validated_unit_price'] ?? $poItem->unit_price);

                // Validation
                if ($acceptedQty < 0 || $rejectedQty < 0) {
                    throw new InvalidArgumentException("Qty accepted/rejected untuk item {$poItem->product_name} tidak boleh negatif.");
                }

                if ($action === 'rejected') {
                    // Full rejection — no billing for this item
                    $acceptedQty    = 0;
                    $rejectedQty    = $poItem->received_quantity;
                    $validatedPrice = 0;
                    $validatedTotal = 0;
                } else {
                    $validatedTotal = $acceptedQty * $validatedPrice;
                    $validatedSubtotal += $validatedTotal;
                }

                $poItem->update([
                    'accepted_quantity'    => $acceptedQty,
                    'rejected_quantity'    => $rejectedQty,
                    'action_taken'         => $action,
                    'rejected_reason'      => $rejectedReason,
                    'validated_unit_price' => $validatedPrice,
                    'validated_total_price'=> $validatedTotal ?? $validatedTotal,
                ]);
            }

            // Calculate validated grand total (apply original PO level discount/tax/shipping)
            $validatedGrandTotal = $validatedSubtotal
                - (float) $lockedPo->discount_amount
                + (float) $lockedPo->tax_amount
                + (float) $lockedPo->shipping_cost;

            $finalBill = max(0, $validatedGrandTotal - (float) $lockedPo->dp_paid_amount);

            $lockedPo->update([
                'validated_subtotal'    => $validatedSubtotal,
                'validated_grand_total' => $validatedGrandTotal,
                'final_bill_amount'     => $finalBill,
                'is_finance_validated'  => true,
                'finance_validated_by'  => $userId,
                'finance_validated_at'  => now(),
                'status'                => 'finance_validated',
            ]);

            // Update existing FactoryReceivable amount to reflect validated final bill
            $existingReceivable = $lockedPo->factoryReceivable;
            if ($existingReceivable) {
                $existingReceivable->update([
                    'original_amount'  => $validatedGrandTotal,
                    'remaining_amount' => max(0, $validatedGrandTotal - (float) $existingReceivable->paid_amount),
                    'notes'            => "Diperbarui Finance: tagihan tervalidasi PO {$lockedPo->po_number}. DP: Rp " . number_format((float) $lockedPo->dp_paid_amount, 0, ',', '.'),
                ]);
            }

            return $lockedPo->fresh();
        });
    }

    /**
     * Record receipt of goods (Goods Receipt) with optional SKU-level reject, revision, and notes.
     */
    public function receiveGoods(PurchaseOrder $po, array $receivingData): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $receivingData) {
            // Lock PO header
            $lockedPo = PurchaseOrder::where('id', $po->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedPo->status, ['approved', 'ordered', 'partially_received'])) {
                throw new InvalidArgumentException('Hanya Purchase Order berstatus Approved, Ordered, atau Partially Received yang dapat menerima barang.');
            }

            $validatedSubtotal = 0.0;

            foreach ($receivingData['items'] as $recvItem) {
                $poItem = $lockedPo->items()->where('product_id', $recvItem['product_id'])->first();

                if (!$poItem) {
                    throw new InvalidArgumentException("Produk ID {$recvItem['product_id']} tidak terdaftar di Purchase Order ini.");
                }

                $recvQty       = (int) ($recvItem['received_qty'] ?? 0);
                $rejectedQty   = (int) ($recvItem['rejected_qty'] ?? 0);
                $actionTaken   = $recvItem['action_taken'] ?? ($rejectedQty > 0 ? 'revised' : 'accepted');
                $rejectReason  = $recvItem['rejected_reason'] ?? null;
                $validatedUnitPrice = (float) ($recvItem['validated_unit_price'] ?? $poItem->unit_price);

                if ($recvQty < 0 || $rejectedQty < 0) {
                    throw new InvalidArgumentException("Jumlah penerimaan/reject untuk {$poItem->product_name} tidak boleh negatif.");
                }

                if ($rejectedQty > $recvQty) {
                    throw new InvalidArgumentException("Jumlah reject ({$rejectedQty}) untuk {$poItem->product_name} tidak boleh melebihi jumlah barang yang datang ({$recvQty}).");
                }

                if ($recvQty === 0) {
                    continue;
                }

                $newReceivedQty = $poItem->received_quantity + $recvQty;

                if ($newReceivedQty > $poItem->quantity) {
                    $remaining = $poItem->quantity - $poItem->received_quantity;
                    throw new InvalidArgumentException("Jumlah penerimaan barang untuk {$poItem->product_name} ({$recvQty}) melebihi sisa ordered quantity ({$remaining}).");
                }

                // Net accepted qty entering stock is received_qty minus rejected_qty
                $goodQty = max(0, $recvQty - $rejectedQty);
                $acceptedQty = ($poItem->accepted_quantity ?? 0) + $goodQty;

                // Lock product row
                $product = Product::where('id', $poItem->product_id)->lockForUpdate()->firstOrFail();

                // Only add good/accepted quantity to warehouse stock
                if ($goodQty > 0) {
                    $this->stockMovementService->recordStockIn(
                        $product,
                        $lockedPo->warehouse_id,
                        $goodQty,
                        'purchase_order',
                        $lockedPo->id,
                        $lockedPo->po_number,
                        "Penerimaan barang dari PO {$lockedPo->po_number}" . ($rejectedQty > 0 ? " ({$rejectedQty} reject)" : ""),
                        auth()->id()
                    );
                }

                $itemValidatedTotal = $goodQty * $validatedUnitPrice;
                $validatedSubtotal += $itemValidatedTotal;

                $poItem->update([
                    'received_quantity'     => $newReceivedQty,
                    'accepted_quantity'     => $acceptedQty,
                    'rejected_quantity'     => ($poItem->rejected_quantity ?? 0) + $rejectedQty,
                    'action_taken'          => $actionTaken,
                    'rejected_reason'       => $rejectReason ?? $poItem->rejected_reason,
                    'validated_unit_price'  => $validatedUnitPrice,
                    'validated_total_price' => ($poItem->validated_total_price ?? 0) + $itemValidatedTotal,
                ]);
            }

            // Determine status based on total items
            $lockedPo->load('items');
            $allReceived = true;
            $anyReceived = false;

            foreach ($lockedPo->items as $item) {
                if ($item->received_quantity < $item->quantity) {
                    $allReceived = false;
                }
                if ($item->received_quantity > 0) {
                    $anyReceived = true;
                }
            }

            // Calculate validated grand total
            $validatedGrandTotal = $validatedSubtotal
                - (float) $lockedPo->discount_amount
                + (float) $lockedPo->tax_amount
                + (float) $lockedPo->shipping_cost;

            $finalBill = max(0, $validatedGrandTotal - (float) $lockedPo->dp_paid_amount);

            if ($allReceived) {
                $lockedPo->update([
                    'status'                 => 'received',
                    'validated_subtotal'     => $validatedSubtotal,
                    'validated_grand_total'  => $validatedGrandTotal,
                    'final_bill_amount'      => $finalBill,
                ]);
                // Auto-create FactoryReceivable upon full receipt
                // (Throws exception if receivable already exists, rolling back transaction)
                $this->factoryReceivableService->createFromPurchaseOrder(
                    $lockedPo,
                    null,
                    null,
                    auth()->id()
                );
            } elseif ($anyReceived) {
                $lockedPo->update([
                    'status'                 => 'partially_received',
                    'validated_subtotal'     => $validatedSubtotal,
                    'validated_grand_total'  => $validatedGrandTotal,
                    'final_bill_amount'      => $finalBill,
                ]);
            }

            return $lockedPo->fresh();
        });
    }

    /**
     * Cancel the Purchase Order.
     */
    public function cancel(PurchaseOrder $po): PurchaseOrder
    {
        if (!in_array($po->status, ['draft', 'pending_leader_approval', 'pending_finance_approval', 'approved', 'rejected'])) {
            throw new InvalidArgumentException('Purchase Order dengan status saat ini tidak dapat dibatalkan.');
        }

        $po->update(['status' => 'cancelled']);
        return $po;
    }

    /**
     * Generate unique PO Number safely using database pessimistic lock.
     */
    protected function generatePoNumber(string $dateString): string
    {
        $date = new \DateTime($dateString);
        $yearMonth = $date->format('Ym'); // YYYYMM
        $prefix = "PO-" . $yearMonth;

        // Query last record on the same month using write lock
        $lastOrder = PurchaseOrder::withTrashed()->where('po_number', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->orderBy('po_number', 'desc')
            ->first();

        if ($lastOrder) {
            $parts = explode('-', $lastOrder->po_number);
            $sequence = (int) end($parts);
            $nextSequence = $sequence + 1;
        } else {
            $nextSequence = 1;
        }

        return $prefix . "-" . str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);
    }
}
