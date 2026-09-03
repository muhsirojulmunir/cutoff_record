<?php

namespace App\Console\Commands;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrder;
use App\Models\MarketplaceOrderItem;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderItem;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixMarketplaceOrdersCommand extends Command
{
    protected $signature = 'marketplace:fix-orders';
    protected $description = 'Perbaiki status pesanan marketplace ke confirmed dan koreksi nominal harga yang terpotong titik ribuan.';

    public function handle(): int
    {
        $this->info('Memeriksa pesanan marketplace di database...');

        $orders = SalesOrder::with('items')
            ->whereIn('sales_channel', ['shopee', 'tiktok'])
            ->get();

        if ($orders->isEmpty()) {
            $this->info('Tidak ada pesanan marketplace yang perlu diperbaiki.');
            return 0;
        }

        $fixedCount = 0;

        foreach ($orders as $so) {
            DB::transaction(function () use ($so, &$fixedCount) {
                $computedSubtotal = 0;

                foreach ($so->items as $item) {
                    $product = Product::find($item->product_id);
                    $price = (float)$item->price;
                    $qty = max(1, (int)$item->quantity);

                    // Jika harga terpotong titik ribuan (misal 40 padahal harga produk 40000)
                    if ($price > 0 && $price < 1000 && $product && (float)$product->selling_price >= 1000) {
                        $price = (float)$product->selling_price;
                    } elseif ($price > 0 && $price < 1000) {
                        $price = $price * 1000;
                    }

                    $subtotal = $price * $qty;
                    $item->update([
                        'price'    => $price,
                        'subtotal' => $subtotal,
                    ]);

                    $computedSubtotal += $subtotal;
                }

                $channel = $so->sales_channel;
                $grandTotal = (float)$so->grand_total;
                if ($grandTotal < 1000 && $computedSubtotal >= 1000) {
                    $grandTotal = $computedSubtotal;
                }

                $estimatedPayout = (float)$so->estimated_payout;
                if ($estimatedPayout <= 0 || ($estimatedPayout < 1000 && $grandTotal >= 1000)) {
                    $estimatedPayout = max(0, $grandTotal - (float)$so->shipping_cost);
                }

                // Update status SO langsung confirmed (tanpa draft / acc leader)
                $so->update([
                    'status'           => 'confirmed',
                    'subtotal'         => $computedSubtotal,
                    'grand_total'      => $grandTotal,
                    'estimated_payout' => $estimatedPayout,
                ]);

                // Sinkronkan ke MarketplaceOrder agar muncul di /marketplace/orders
                $marketplaceType = $channel === 'tiktok' ? 'tiktok_shop' : 'shopee';
                $adminUser = \App\Models\User::first();
                $mpAccount = MarketplaceAccount::firstOrCreate(
                    ['marketplace' => $marketplaceType],
                    [
                        'account_name'       => $marketplaceType === 'tiktok_shop' ? 'TikTok Shop' : 'Shopee',
                        'status'             => 'active',
                        'credentials_status' => 'configured',
                        'created_by'         => $adminUser ? $adminUser->id : 1,
                    ]
                );

                $mpOrder = MarketplaceOrder::updateOrCreate(
                    ['external_order_id' => $so->external_order_id ?: $so->so_number],
                    [
                        'marketplace_account_id' => $mpAccount->id,
                        'marketplace'            => $marketplaceType,
                        'external_order_number'  => $so->external_order_id ?: $so->so_number,
                        'order_status'           => 'completed',
                        'internal_status'        => 'ready_to_process',
                        'workflow_status'        => !empty($so->tracking_number) ? 'shipped' : 'completed',
                        'payment_status'         => 'paid',
                        'fulfillment_status'     => 'fulfilled',
                        'customer_name'          => $so->recipient_name,
                        'customer_phone'         => $so->customer_phone,
                        'shipping_address'       => $so->shipping_address,
                        'city'                   => $so->city,
                        'province'               => $so->province,
                        'subtotal'               => $computedSubtotal,
                        'discount'               => (float)$so->discount_amount,
                        'shipping_fee'           => (float)$so->shipping_cost,
                        'total_amount'           => $estimatedPayout > 0 ? $estimatedPayout : $grandTotal,
                        'tracking_number'        => $so->tracking_number,
                        'order_date'             => $so->order_date,
                        'paid_at'                => $so->payment_date ?: now(),
                        'sales_order_id'         => $so->id,
                        'conversion_status'      => 'converted',
                        'converted_at'           => now(),
                    ]
                );

                $so->update(['marketplace_order_id' => $mpOrder->id]);

                MarketplaceOrderItem::where('marketplace_order_id', $mpOrder->id)->delete();
                foreach ($so->items as $item) {
                    MarketplaceOrderItem::create([
                        'marketplace_order_id' => $mpOrder->id,
                        'product_id'           => $item->product_id,
                        'product_name'         => $item->product_name,
                        'product_sku'          => $item->sku,
                        'quantity'             => $item->quantity,
                        'unit_price'           => $item->price,
                        'subtotal'             => $item->subtotal,
                    ]);
                }

                $fixedCount++;
            });
        }

        $this->info("Berhasil memperbaiki {$fixedCount} pesanan marketplace.");
        return 0;
    }
}
