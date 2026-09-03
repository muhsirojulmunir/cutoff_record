<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderItem;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class SalesOrderService
{
    public function __construct(
        private readonly StockMovementService $stockMovementService,
    ) {}

    /**
     * Create a new Sales Order.
     */
    public function create(array $data, int $userId): SalesOrder
    {
        return DB::transaction(function () use ($data, $userId) {
            $orderDate = $data['order_date'];
            $soNumber = $this->generateSoNumber($orderDate);

            // Calculate totals
            $itemsData = [];
            $subtotal = 0;

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);

                $price = $item['price'] ?? $product->selling_price;
                $quantity = $item['quantity'];
                $itemDiscount = $item['discount_amount'] ?? 0;
                $itemTax = $item['tax_amount'] ?? 0;

                // Item Subtotal = (Price * Qty) - Discount + Tax
                $itemSubtotal = ($price * $quantity) - $itemDiscount + $itemTax;

                $itemsData[] = [
                    'product_id'      => $product->id,
                    'sku'             => $product->sku,
                    'product_name'    => $product->name,
                    'quantity'        => $quantity,
                    'unit'            => 'pcs',
                    'price'           => $price,
                    'discount_amount' => $itemDiscount,
                    'tax_amount'      => $itemTax,
                    'subtotal'        => $itemSubtotal,
                ];

                $subtotal += $itemSubtotal;
            }

            $discount = $data['discount_amount'] ?? 0;
            $tax = $data['tax_amount'] ?? 0;
            $shipping = $data['shipping_cost'] ?? 0;
            $adminFee = (float) ($data['admin_fee'] ?? 0);
            $otherFee = (float) ($data['other_fee'] ?? 0);

            // Grand Total = Subtotal - Discount + Tax + Shipping Cost + Admin Fee + Other Fee
            $grandTotal = max(0, $subtotal - $discount + $tax + $shipping + $adminFee + $otherFee);

            $dpAmount = (float) ($data['dp_amount'] ?? 0);
            $paymentStatus = 'unpaid';
            if ($dpAmount > 0) {
                $paymentStatus = $dpAmount >= $grandTotal ? 'paid' : 'partially_paid';
            }

            $paymentTerms = $data['payment_terms'] ?? 'cash';
            $dueDate = match ($paymentTerms) {
                'cod'       => $orderDate,
                'tempo_7'   => date('Y-m-d', strtotime($orderDate . ' +7 days')),
                'tempo_14'  => date('Y-m-d', strtotime($orderDate . ' +14 days')),
                'tempo_30'  => date('Y-m-d', strtotime($orderDate . ' +30 days')),
                default     => null, // cash = tidak ada jatuh tempo
            };

            $salesOrder = SalesOrder::create([
                'so_number'       => $soNumber,
                'customer_id'     => $data['customer_id'] ?? null,
                'order_date'      => $orderDate,
                'payment_terms'   => $paymentTerms,
                'due_date'        => $dueDate,
                'source'          => $data['source'],
                'sales_channel'   => $data['sales_channel'],
                'status'          => 'draft',
                'payment_status'  => $paymentStatus,
                'subtotal'        => $subtotal,
                'discount_amount' => $discount,
                'tax_amount'      => $tax,
                'shipping_cost'   => $shipping,
                'admin_fee'       => $adminFee,
                'other_fee'       => $otherFee,
                'grand_total'     => $grandTotal,
                'dp_amount'       => $dpAmount,
                'notes'           => $data['notes'] ?? null,
                'created_by'      => $userId,
            ]);

            foreach ($itemsData as $item) {
                $salesOrder->items()->create($item);
            }

            return $salesOrder;
        });
    }

    /**
     * Update an existing Sales Order.
     */
    public function update(SalesOrder $salesOrder, array $data): SalesOrder
    {
        if ($salesOrder->status !== 'draft') {
            throw new InvalidArgumentException('Hanya Sales Order dengan status Draft yang dapat diperbarui.');
        }

        return DB::transaction(function () use ($salesOrder, $data) {
            // Recalculate totals
            $itemsData = [];
            $subtotal = 0;

            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);

                $price = $item['price'] ?? $product->selling_price;
                $quantity = $item['quantity'];
                $itemDiscount = $item['discount_amount'] ?? 0;
                $itemTax = $item['tax_amount'] ?? 0;

                $itemSubtotal = ($price * $quantity) - $itemDiscount + $itemTax;

                $itemsData[] = [
                    'product_id'      => $product->id,
                    'sku'             => $product->sku,
                    'product_name'    => $product->name,
                    'quantity'        => $quantity,
                    'unit'            => 'pcs',
                    'price'           => $price,
                    'discount_amount' => $itemDiscount,
                    'tax_amount'      => $itemTax,
                    'subtotal'        => $itemSubtotal,
                ];

                $subtotal += $itemSubtotal;
            }

            $discount = $data['discount_amount'] ?? 0;
            $tax = $data['tax_amount'] ?? 0;
            $shipping = $data['shipping_cost'] ?? 0;
            $adminFee = (float) ($data['admin_fee'] ?? $salesOrder->admin_fee ?? 0);
            $otherFee = (float) ($data['other_fee'] ?? $salesOrder->other_fee ?? 0);
            $grandTotal = max(0, $subtotal - $discount + $tax + $shipping + $adminFee + $otherFee);

            $paymentTerms = $data['payment_terms'] ?? 'cash';
            $orderDateForDue = $data['order_date'] ?? $salesOrder->order_date->format('Y-m-d');
            $dueDate = match ($paymentTerms) {
                'cod'       => $orderDateForDue,
                'tempo_7'   => date('Y-m-d', strtotime($orderDateForDue . ' +7 days')),
                'tempo_14'  => date('Y-m-d', strtotime($orderDateForDue . ' +14 days')),
                'tempo_30'  => date('Y-m-d', strtotime($orderDateForDue . ' +30 days')),
                default     => null,
            };

            $salesOrder->update([
                'customer_id'     => $data['customer_id'] ?? null,
                'order_date'      => $data['order_date'],
                'payment_terms'   => $paymentTerms,
                'due_date'        => $dueDate,
                'source'          => $data['source'],
                'sales_channel'   => $data['sales_channel'],
                'subtotal'        => $subtotal,
                'discount_amount' => $discount,
                'tax_amount'      => $tax,
                'shipping_cost'   => $shipping,
                'admin_fee'       => $adminFee,
                'other_fee'       => $otherFee,
                'grand_total'     => $grandTotal,
                'notes'           => $data['notes'] ?? null,
            ]);

            // Delete old items and save new ones
            $salesOrder->items()->delete();

            foreach ($itemsData as $item) {
                $salesOrder->items()->create($item);
            }

            return $salesOrder->fresh();
        });
    }

    /**
     * Submit a Sales Order for approval.
     */
    public function submitForApproval(SalesOrder $salesOrder): bool
    {
        if ($salesOrder->status !== 'draft') {
            throw new InvalidArgumentException('Hanya Sales Order dengan status Draft yang dapat diajukan persetujuan.');
        }

        return $salesOrder->update([
            'status'       => 'pending_approval',
            'submitted_by' => auth()->id(),
            'submitted_at' => now(),
        ]);
    }

    /**
     * Approve a Sales Order.
     */
    public function approve(SalesOrder $salesOrder): bool
    {
        if ($salesOrder->status !== 'pending_approval') {
            throw new InvalidArgumentException('Hanya Sales Order dengan status Pending Approval yang dapat disetujui.');
        }

        return DB::transaction(function () use ($salesOrder) {
            $approved = $salesOrder->update([
                'status'      => 'approved',
                'approved_by' => auth()->id(),
                'approved_at' => now(),
            ]);

            // Barang dinyatakan keluar untuk pelanggan pada titik ini. Bila stok
            // kurang, exception dari sini membatalkan seluruh persetujuan.
            $this->deductStock($salesOrder->fresh(['items']), auth()->id());

            // SO Grosir dibayar di kasir, jadi invoicenya terbit begitu disetujui.
            $this->issueGrosirInvoice($salesOrder->fresh(['invoice']));

            return $approved;
        });
    }

    /**
     * Order marketplace memotong stoknya sendiri lewat reservasi saat
     * fulfillment, jadi jalur ini harus melewatinya agar stok tidak
     * terpotong dua kali.
     */
    private function usesOwnStockFlow(SalesOrder $salesOrder): bool
    {
        return $salesOrder->source === 'marketplace' || $salesOrder->marketplace_order_id !== null;
    }

    /**
     * Gudang tujuan pengeluaran barang. SO lama banyak yang belum mengisi
     * gudang, jadi dipakai gudang aktif pertama sebagai penanda. Nilai null
     * tetap diterima — saldo stok bersifat global, gudang hanya keterangan
     * pada catatan pergerakan, sehingga stok tidak boleh gagal terpotong
     * hanya karena gudang belum disiapkan.
     */
    private function resolveWarehouseId(SalesOrder $salesOrder): ?int
    {
        if ($salesOrder->warehouse_id) return (int) $salesOrder->warehouse_id;

        $warehouseId = Warehouse::where('status', 'active')->orderBy('id')->value('id')
            ?? Warehouse::orderBy('id')->value('id');

        return $warehouseId ? (int) $warehouseId : null;
    }

    /**
     * Periksa kecukupan stok seluruh item lebih dulu.
     *
     * Pemeriksaan dilakukan sekaligus supaya penyetuju melihat seluruh produk
     * yang kurang dalam satu pesan, lengkap dengan jumlah yang dibutuhkan dan
     * yang tersedia — bukan menemukannya satu per satu setiap kali menekan
     * tombol approve.
     */
    private function assertStockIsSufficient(SalesOrder $salesOrder): void
    {
        $shortages = [];

        foreach ($salesOrder->items as $item) {
            if (!$item->product_id || $item->quantity <= 0) continue;

            $product = Product::find($item->product_id);
            if (!$product) continue;

            $available = (int) $product->stock;
            $needed    = (int) $item->quantity;

            if ($available < $needed) {
                $shortages[] = sprintf(
                    '%s (%s) butuh %d, tersedia %d',
                    $product->name,
                    $product->sku,
                    $needed,
                    $available
                );
            }
        }

        if ($shortages === []) return;

        throw new InvalidArgumentException(
            'Stok tidak mencukupi sehingga Sales Order belum bisa disetujui — '
            . implode('; ', $shortages)
            . '. Lakukan penerimaan barang dari PO atau penyesuaian stok terlebih dahulu.'
        );
    }

    /**
     * Potong stok fisik untuk seluruh item Sales Order.
     *
     * Dipanggil saat SO disetujui — pada titik itu barang sudah dipastikan
     * keluar untuk pelanggan. Bila stok tidak mencukupi, StockMovementService
     * melempar exception sehingga persetujuan ikut dibatalkan; ini yang
     * mencegah penjualan barang yang sebenarnya sudah habis.
     */
    public function deductStock(SalesOrder $salesOrder, ?int $userId = null): bool
    {
        if ($this->usesOwnStockFlow($salesOrder) || $salesOrder->stock_deducted_at) {
            return false;
        }

        $warehouseId = $this->resolveWarehouseId($salesOrder);
        $salesOrder->loadMissing('items');

        $this->assertStockIsSufficient($salesOrder);

        foreach ($salesOrder->items as $item) {
            if (!$item->product_id || $item->quantity <= 0) continue;

            $product = Product::find($item->product_id);
            if (!$product) continue;

            $this->stockMovementService->recordStockOut(
                $product,
                $warehouseId,
                (int) $item->quantity,
                'sales_order',
                $salesOrder->id,
                $salesOrder->so_number,
                "Penjualan SO {$salesOrder->so_number}",
                $userId
            );
        }

        $salesOrder->update(['stock_deducted_at' => now()]);

        return true;
    }

    /**
     * Kembalikan stok saat SO dibatalkan, hanya bila stoknya memang pernah
     * dipotong. Tanpa ini, pembatalan akan menghilangkan barang dari catatan.
     */
    public function restoreStock(SalesOrder $salesOrder, ?int $userId = null): bool
    {
        if (!$salesOrder->stock_deducted_at) {
            return false;
        }

        $warehouseId = $this->resolveWarehouseId($salesOrder);
        $salesOrder->loadMissing('items');

        foreach ($salesOrder->items as $item) {
            if (!$item->product_id || $item->quantity <= 0) continue;

            $product = Product::find($item->product_id);
            if (!$product) continue;

            $this->stockMovementService->recordStockIn(
                $product,
                $warehouseId,
                (int) $item->quantity,
                'sales_order',
                $salesOrder->id,
                $salesOrder->so_number,
                "Pembatalan SO {$salesOrder->so_number} — stok dikembalikan",
                $userId
            );
        }

        $salesOrder->update(['stock_deducted_at' => null]);

        return true;
    }

    /**
     * Selaraskan status bayar SO dengan uang yang sudah masuk di invoicenya.
     * Dipanggil setiap kali pembayaran invoice berubah.
     */
    public function syncPaymentStatus(SalesOrder $salesOrder): SalesOrder
    {
        $invoice = \App\Models\Invoice::where('sales_order_id', $salesOrder->id)
            ->where('status', '!=', 'cancelled')
            ->first();

        $dp = (float) $salesOrder->dp_amount;
        $grandTotal = (float) $salesOrder->grand_total;

        if ($invoice) {
            $paid = (float) $invoice->paid_amount;
            $remaining = (float) $invoice->remaining_amount;

            $paymentStatus = match (true) {
                $invoice->status === 'paid' || ($remaining <= 0 && $grandTotal > 0) || ($paid >= $grandTotal && $grandTotal > 0) => 'paid',
                $paid > 0 || $dp > 0 || $invoice->status === 'partially_paid' => 'partially_paid',
                default => 'unpaid',
            };
        } else {
            $paymentStatus = match (true) {
                $dp >= $grandTotal && $grandTotal > 0 => 'paid',
                $dp > 0 => 'partially_paid',
                default => 'unpaid',
            };
        }

        if ($salesOrder->payment_status !== $paymentStatus) {
            $salesOrder->update(['payment_status' => $paymentStatus]);
        }

        return $salesOrder->fresh();
    }

    /**
     * Sales Order dianggap lunas bila invoice-nya berstatus paid. Untuk SO Grosir
     * yang dibuat langsung lunas tanpa invoice, dipakai payment_status pada SO.
     */
    public function isFullyPaid(SalesOrder $salesOrder): bool
    {
        if ($salesOrder->invoice) {
            return $salesOrder->invoice->status === 'paid';
        }

        return $salesOrder->payment_status === 'paid';
    }

    /**
     * Syarat SO boleh ditutup otomatis: barang sudah dikirim (resi terbit) dan
     * uangnya sudah masuk. Selama salah satu belum, SO tetap berjalan.
     */
    public function isReadyToComplete(SalesOrder $salesOrder): bool
    {
        if (!in_array($salesOrder->status, ['approved', 'processing'], true)) {
            return false;
        }

        return filled($salesOrder->tracking_number) && $this->isFullyPaid($salesOrder);
    }

    /**
     * Tutup SO otomatis bila syaratnya sudah terpenuhi. Dipanggil setelah resi
     * diisi dan setelah pembayaran invoice masuk; aman dipanggil berkali-kali.
     */
    public function syncCompletion(SalesOrder $salesOrder): bool
    {
        if (!$this->isReadyToComplete($salesOrder->fresh(['invoice']))) {
            return false;
        }

        // completed_by dibiarkan null: penutupan ini dilakukan sistem, bukan orang.
        return $salesOrder->update([
            'status'       => 'completed',
            'completed_at' => now(),
        ]);
    }

    /**
     * Tutup SO secara manual. Dipakai untuk kasus yang tidak lewat jalur normal,
     * misalnya grosir yang barangnya diambil langsung sehingga tidak ada resi.
     */
    public function markAsCompleted(SalesOrder $salesOrder): bool
    {
        if (in_array($salesOrder->status, ['completed', 'cancelled'], true)) {
            throw new InvalidArgumentException('Sales Order ini sudah Selesai atau Dibatalkan.');
        }

        if (!in_array($salesOrder->status, ['approved', 'processing'], true)) {
            throw new InvalidArgumentException('Hanya Sales Order yang sudah Disetujui yang dapat ditandai Selesai.');
        }

        if (!$this->isFullyPaid($salesOrder)) {
            throw new InvalidArgumentException('Sales Order belum lunas, tidak dapat ditandai Selesai.');
        }

        return $salesOrder->update([
            'status'       => 'completed',
            'completed_by' => auth()->id(),
            'completed_at' => now(),
        ]);
    }

    /**
     * Cancel a Sales Order.
     */
    public function cancel(SalesOrder $salesOrder): bool
    {
        if (in_array($salesOrder->status, ['completed', 'cancelled'])) {
            throw new InvalidArgumentException('Sales Order yang sudah Selesai atau Dibatalkan tidak dapat diubah lagi.');
        }

        return DB::transaction(function () use ($salesOrder) {
            // Barang batal keluar ⇒ stok yang sempat dipotong dikembalikan.
            $this->restoreStock($salesOrder->fresh(['items']), auth()->id());

            return $salesOrder->update(['status' => 'cancelled']);
        });
    }

    /**
     * Create a Grosir (Offline) Sales Order and automatically issue Invoice.
     */
    public function createGrosirOrder(array $data, int $userId): SalesOrder
    {
        return DB::transaction(function () use ($data, $userId) {
            $paymentDateStr = !empty($data['payment_date']) ? $data['payment_date'] : null;
            $orderDate = $paymentDateStr ? date('Y-m-d', strtotime($paymentDateStr)) : ($data['order_date'] ?? now()->format('Y-m-d'));
            $soNumber = $this->generateSoNumber($orderDate);

            // Find or create Customer
            $recipientName = trim($data['recipient_name'] ?? 'Customer Grosir');
            $customerPhone = trim($data['customer_phone'] ?? '');

            $customer = null;
            if ($customerPhone !== '') {
                $customer = \App\Models\Customer::where('phone', $customerPhone)->first();
            }
            if (!$customer && $recipientName !== '') {
                $customer = \App\Models\Customer::where('name', $recipientName)->first();
            }
            if (!$customer) {
                $customerCode = 'CUST-GRS-' . strtoupper(\Illuminate\Support\Str::random(5));
                $customer = \App\Models\Customer::create([
                    'customer_code' => $customerCode,
                    'name'          => $recipientName,
                    'phone'         => $customerPhone ?: null,
                    'address'       => $data['shipping_address'] ?? null,
                    'city'          => $data['city'] ?? null,
                    'province'      => $data['province'] ?? null,
                ]);
            }

            // Product Lookup by SKU or ID
            $sku = trim((string)($data['sku'] ?? ''));
            $product = null;
            if ($sku !== '') {
                $product = Product::where('sku', $sku)->first();
                if (!$product) {
                    $product = Product::where('sku', 'like', "%{$sku}%")->first();
                }
            }
            if (!$product && !empty($data['product_id'])) {
                $product = Product::find($data['product_id']);
            }
            if (!$product) {
                throw new InvalidArgumentException("Produk dengan SKU '{$sku}' tidak ditemukan di master data produk.");
            }

            $qty = (int) ($data['quantity'] ?? 1);
            $unitPrice = (float) ($data['unit_price'] ?? $product->selling_price);
            $voucher = (float) ($data['voucher'] ?? $data['discount_amount'] ?? 0);
            $tax = (float) ($data['tax'] ?? $data['tax_amount'] ?? 0);
            $shippingCost = (float) ($data['shipping_cost'] ?? 0);
            $adminFee = (float) ($data['admin_fee'] ?? 0);
            $otherFee = (float) ($data['other_fee'] ?? 0);
            $totalWeight = (float) ($data['total_weight'] ?? 0);
            $dpAmount = (float) ($data['dp_amount'] ?? 0);

            $subtotal = $unitPrice * $qty;
            $grandTotal = max(0, $subtotal - $voucher + $tax + $shippingCost + $adminFee + $otherFee);

            // Status bayar hanya boleh ditentukan oleh uang yang benar-benar
            // diterima. Tanggal pembayaran di form hanyalah catatan waktu, jadi
            // tidak lagi dipakai untuk menandai lunas — dulu inilah yang membuat
            // SO baru langsung berstatus Lunas padahal belum dibayar.
            $paymentStatus = 'unpaid';
            if ($dpAmount > 0) {
                $paymentStatus = $dpAmount >= $grandTotal ? 'paid' : 'partially_paid';
            }

            $salesOrder = SalesOrder::create([
                'so_number'        => $soNumber,
                'tracking_number'  => $data['tracking_number'] ?? null,
                'account_name'     => $data['account_name'] ?? 'Grosir Offline',
                'customer_id'      => $customer->id,
                'recipient_name'   => $recipientName,
                'customer_phone'   => $customerPhone,
                'shipping_address' => $data['shipping_address'] ?? null,
                'city'             => $data['city'] ?? null,
                'province'         => $data['province'] ?? null,
                'order_date'       => $orderDate,
                'payment_date'     => $paymentDateStr ? date('Y-m-d H:i:s', strtotime($paymentDateStr)) : null,
                'source'           => 'manual',
                'sales_channel'    => 'grosir',
                // Grosir tetap melewati alur normal: Draft → Pending Approval →
                // Disetujui. Invoice baru terbit setelah disetujui.
                'status'           => 'draft',
                'payment_status'   => $paymentStatus,
                'subtotal'         => $subtotal,
                'discount_amount'  => $voucher,
                'tax_amount'       => $tax,
                'shipping_cost'    => $shippingCost,
                'admin_fee'        => $adminFee,
                'other_fee'        => $otherFee,
                'grand_total'      => $grandTotal,
                'total_weight'     => $totalWeight,
                'dp_amount'        => $dpAmount,
                'notes'            => $data['notes'] ?? 'Order Grosir (Offline)',
                'created_by'       => $userId,
            ]);

            // Create Sales Order Item
            $salesOrder->items()->create([
                'product_id'      => $product->id,
                'sku'             => $product->sku,
                'product_name'    => $product->name,
                'quantity'        => $qty,
                'unit'            => 'pcs',
                'price'           => $unitPrice,
                'discount_amount' => $voucher,
                'tax_amount'      => $tax,
                'subtotal'        => $grandTotal,
            ]);

            // Invoice tidak diterbitkan di sini. InvoiceService mensyaratkan SO
            // sudah Approved, dan penerbitannya memang seharusnya menyusul
            // persetujuan — lihat issueGrosirInvoice() yang dipanggil saat approve.

            return $salesOrder;
        });
    }

    /**
     * Terbitkan invoice untuk SO Grosir yang baru disetujui, sekaligus mencatat
     * pembayaran yang sudah diterima di kasir (lunas atau DP).
     */
    private function issueGrosirInvoice(SalesOrder $salesOrder): void
    {
        if ($salesOrder->sales_channel !== 'grosir' || $salesOrder->invoice) {
            return;
        }

        $invoice = app(InvoiceService::class)->createFromSalesOrder(
            $salesOrder,
            null,
            'Invoice Terbit Otomatis (Grosir Offline)',
            $salesOrder->created_by
        );

        $grandTotal = (float) $salesOrder->grand_total;
        $dpAmount   = (float) $salesOrder->dp_amount;

        if ($salesOrder->payment_status === 'paid') {
            $invoice->update([
                'paid_amount'      => $grandTotal,
                'remaining_amount' => 0,
                'status'           => 'paid',
            ]);
            return;
        }

        if ($salesOrder->payment_status === 'partially_paid') {
            $invoice->update([
                'paid_amount'      => $dpAmount,
                'remaining_amount' => max(0, $grandTotal - $dpAmount),
                'status'           => 'partially_paid',
            ]);
        }
    }

    /**
     * Update Tracking Number (Resi / AWB) for Delivery Order.
     */
    public function updateTrackingNumber(SalesOrder $salesOrder, string $trackingNumber): SalesOrder
    {
        $salesOrder->update([
            'tracking_number' => $trackingNumber,
            'status'          => $salesOrder->status === 'approved' ? 'processing' : $salesOrder->status,
        ]);

        // Resi terbit + invoice sudah lunas ⇒ SO langsung ditutup.
        $this->syncCompletion($salesOrder);

        return $salesOrder->fresh();
    }

    /**
     * Generate sequential unique SO Number.
     * Format: SO-YYYYMM-0001
     */
    private function generateSoNumber(string $orderDate): string
    {
        $prefix = 'SO-' . date('Ym', strtotime($orderDate));

        // withTrashed() wajib: nomor SO yang sudah dihapus (soft delete) barisnya
        // masih ada di tabel, jadi unique index tetap menolak pemakaian ulang.
        $latestOrder = SalesOrder::withTrashed()
            ->where('so_number', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->orderBy('so_number', 'desc')
            ->first();

        if ($latestOrder) {
            $parts = explode('-', $latestOrder->so_number);
            $sequence = (int) end($parts);
            $nextSequence = $sequence + 1;
        } else {
            $nextSequence = 1;
        }

        return $prefix . '-' . str_pad((string)$nextSequence, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Create Marketplace (Shopee / TikTok) Sales Orders in Batch from parsed Excel.
     */
    public function createMarketplaceOrdersBatch(array $orders, int $userId): array
    {
        $created = [];

        DB::transaction(function () use ($orders, $userId, &$created) {
            foreach ($orders as $index => $row) {
                try {
                    $created[] = $this->createSingleMarketplaceOrder($row, $userId);
                } catch (\Exception $e) {
                    throw new \Exception('Pesanan ' . ($row['external_order_id'] ?? ('#' . ($index + 1))) . ': ' . $e->getMessage());
                }
            }
        });

        return $created;
    }

    /**
     * Create single Marketplace Sales Order from parsed data.
     */
    public function createSingleMarketplaceOrder(array $data, int $userId): SalesOrder
    {
        $channel = in_array($data['sales_channel'] ?? '', ['shopee', 'tiktok'], true)
            ? $data['sales_channel']
            : 'shopee';

        $orderDate = !empty($data['order_date']) ? date('Y-m-d', strtotime($data['order_date'])) : now()->format('Y-m-d');
        $paymentDateStr = !empty($data['payment_date']) ? $data['payment_date'] : null;
        $soNumber = $this->generateSoNumber($orderDate);

        // Find or create customer
        $recipientName = trim($data['recipient_name'] ?? ('Pembeli ' . ucfirst($channel)));
        $customerPhone = trim($data['customer_phone'] ?? '');

        $customer = null;
        if ($customerPhone !== '') {
            $customer = \App\Models\Customer::where('phone', $customerPhone)->first();
        }
        if (!$customer && $recipientName !== '') {
            $customer = \App\Models\Customer::where('name', $recipientName)->first();
        }
        if (!$customer) {
            $prefixCode = strtoupper(substr($channel, 0, 3));
            $customerCode = 'CUST-' . $prefixCode . '-' . strtoupper(\Illuminate\Support\Str::random(5));
            $customer = \App\Models\Customer::create([
                'customer_code' => $customerCode,
                'name'          => $recipientName,
                'phone'         => $customerPhone ?: null,
                'address'       => $data['shipping_address'] ?? null,
                'city'          => $data['city'] ?? null,
                'province'      => $data['province'] ?? null,
            ]);
        }

        // Process items
        $itemsData = [];
        $computedSubtotal = 0;

        foreach ($data['items'] as $itemRow) {
            $sku = trim((string)($itemRow['sku'] ?? ''));
            $product = null;
            if ($sku !== '' && $sku !== 'NO-SKU') {
                $product = Product::where('sku', $sku)->first();
                if (!$product) {
                    $product = Product::where('sku', 'like', "%{$sku}%")->first();
                }
            }
            if (!$product && !empty($itemRow['product_id'])) {
                $product = Product::find($itemRow['product_id']);
            }
            if (!$product) {
                throw new InvalidArgumentException("Produk dengan SKU '{$sku}' ({$itemRow['product_name']}) tidak ditemukan di master data produk.");
            }

            $qty = max(1, (int)($itemRow['quantity'] ?? 1));
            $price = (float)($itemRow['price'] ?? $product->selling_price);
            $itemDiscount = (float)($itemRow['discount_amount'] ?? 0);
            $itemSubtotal = max(0, ($price * $qty) - $itemDiscount);

            $itemsData[] = [
                'product_id'      => $product->id,
                'sku'             => $product->sku,
                'product_name'    => $itemRow['product_name'] ?? $product->name,
                'quantity'        => $qty,
                'unit'            => 'pcs',
                'price'           => $price,
                'discount_amount' => $itemDiscount,
                'tax_amount'      => 0,
                'subtotal'        => $itemSubtotal,
            ];

            $computedSubtotal += $itemSubtotal;
        }

        $shippingCost = (float)($data['shipping_cost'] ?? 0);
        $discountAmount = (float)($data['discount_amount'] ?? 0);
        $taxAmount = (float)($data['tax_amount'] ?? 0);
        $adminFee = (float)($data['admin_fee'] ?? 0);
        $otherFee = (float)($data['other_fee'] ?? 0);
        $grandTotal = (float)($data['grand_total'] ?? max(0, $computedSubtotal - $discountAmount + $shippingCost + $adminFee + $otherFee));

        // Estimasi pembayaran bersih dari marketplace (income seller setelah potong komisi dll)
        // Jika tidak ada, fallback ke grand_total - shipping (perkiraan)
        $estimatedPayout = isset($data['estimated_payout']) && (float)$data['estimated_payout'] > 0
            ? (float)$data['estimated_payout']
            : max(0, $grandTotal - $shippingCost);

        $salesOrder = SalesOrder::create([
            'so_number'          => $soNumber,
            'tracking_number'    => $data['tracking_number'] ?? null,
            'external_order_id'  => $data['external_order_id'] ?? null,
            'account_name'       => $data['account_name'] ?? ucfirst($channel),
            'customer_id'        => $customer->id,
            'recipient_name'     => $recipientName,
            'customer_phone'     => $customerPhone,
            'shipping_address'   => $data['shipping_address'] ?? null,
            'city'               => $data['city'] ?? null,
            'province'           => $data['province'] ?? null,
            'order_date'         => $orderDate,
            'payment_date'       => $paymentDateStr ? date('Y-m-d H:i:s', strtotime($paymentDateStr)) : null,
            'source'             => 'marketplace',
            'sales_channel'      => $channel,
            'status'             => 'confirmed',  // Tanpa acc leader, langsung confirmed
            'payment_status'     => 'paid',
            'subtotal'           => $computedSubtotal,
            'discount_amount'    => $discountAmount,
            'tax_amount'         => $taxAmount,
            'shipping_cost'      => $shippingCost,
            'admin_fee'          => $adminFee,
            'other_fee'          => $otherFee,
            'grand_total'        => $grandTotal,
            'estimated_payout'   => $estimatedPayout,
            'dp_amount'          => 0,
            'notes'              => $data['notes'] ?? ('Import ' . ucfirst($channel) . ' Order #' . ($data['external_order_id'] ?? '')),
            'created_by'         => $userId,
        ]);

        foreach ($itemsData as $item) {
            $salesOrder->items()->create($item);
        }

        // Simpan juga ke MarketplaceOrder agar langsung muncul di menu /marketplace/orders tanpa perlu API
        $marketplaceType = $channel === 'tiktok' ? 'tiktok_shop' : 'shopee';
        $adminUser = \App\Models\User::first();
        $mpAccount = \App\Models\MarketplaceAccount::firstOrCreate(
            ['marketplace' => $marketplaceType],
            [
                'account_name'       => $marketplaceType === 'tiktok_shop' ? 'TikTok Shop' : 'Shopee',
                'status'             => 'active',
                'credentials_status' => 'configured',
                'created_by'         => $adminUser ? $adminUser->id : 1,
            ]
        );

        $mpOrder = \App\Models\MarketplaceOrder::updateOrCreate(
            ['external_order_id' => $data['external_order_id']],
            [
                'marketplace_account_id' => $mpAccount->id,
                'marketplace'            => $marketplaceType,
                'external_order_number'  => $data['external_order_id'],
                'order_status'           => $data['order_status'] ?? 'completed',
                'internal_status'        => 'ready_to_process',
                'workflow_status'        => !empty($data['tracking_number']) ? 'shipped' : 'completed',
                'payment_status'         => 'paid',
                'fulfillment_status'     => 'fulfilled',
                'customer_name'          => $recipientName,
                'customer_phone'         => $customerPhone,
                'shipping_address'       => $data['shipping_address'] ?? null,
                'city'                   => $data['city'] ?? null,
                'province'               => $data['province'] ?? null,
                'subtotal'               => $computedSubtotal,
                'discount'               => $discountAmount,
                'shipping_fee'           => $shippingCost,
                'total_amount'           => $estimatedPayout > 0 ? $estimatedPayout : $grandTotal,
                'tracking_number'        => $data['tracking_number'] ?? null,
                'courier_name'           => $data['courier_name'] ?? null,
                'order_date'             => $orderDate,
                'paid_at'                => $paymentDateStr ? date('Y-m-d H:i:s', strtotime($paymentDateStr)) : now(),
                'sales_order_id'         => $salesOrder->id,
                'conversion_status'      => 'converted',
                'converted_at'           => now(),
            ]
        );

        $salesOrder->update(['marketplace_order_id' => $mpOrder->id]);

        \App\Models\MarketplaceOrderItem::where('marketplace_order_id', $mpOrder->id)->delete();
        foreach ($itemsData as $item) {
            \App\Models\MarketplaceOrderItem::create([
                'marketplace_order_id' => $mpOrder->id,
                'product_id'           => $item['product_id'],
                'product_name'         => $item['product_name'],
                'product_sku'          => $item['sku'],
                'quantity'             => $item['quantity'],
                'unit_price'           => $item['price'],
                'subtotal'             => $item['subtotal'],
            ]);
        }

        return $salesOrder;
    }
}

