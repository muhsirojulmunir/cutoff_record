<?php

namespace App\Services\Reports;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Sumber harga produk untuk pelaporan.
 *
 * Master produk tidak lagi menyimpan harga beli/jual, jadi angkanya diambil
 * dari transaksi yang benar-benar terjadi:
 *  - Harga beli (HPP) → rata-rata tertimbang dari barang yang diterima di PO.
 *  - Harga jual        → rata-rata tertimbang dari item Sales Order.
 *
 * Keduanya dikembalikan sebagai subquery agar bisa di-join langsung,
 * sehingga tidak ada query tambahan per baris produk.
 */
class ProductPricingService
{
    /** Status PO yang barangnya sudah benar-benar diterima. */
    private const RECEIVED_STATUSES = ['received', 'finance_validated', 'partially_received'];

    /** Status SO yang batal — tidak boleh ikut menghitung harga jual. */
    private const VOID_SO_STATUSES = ['cancelled', 'rejected'];

    /**
     * Modal yang dipakai seluruh laporan: HPP yang diinput Finance / Leader
     * lebih diutamakan, dan bila belum diisi dipakai rata-rata harga beli PO
     * sebagai perkiraan sementara.
     */
    public function effectiveCostSubquery(): Builder
    {
        return DB::query()
            ->fromSub($this->costSubquery(), 'po_costs')
            ->rightJoin('products', 'products.id', '=', 'po_costs.product_id')
            ->leftJoin('product_hpps', 'product_hpps.product_id', '=', 'products.id')
            ->whereNull('products.deleted_at')
            ->select(
                'products.id as product_id',
                DB::raw('COALESCE(product_hpps.hpp, po_costs.avg_cost, products.purchase_price, 0) as avg_cost'),
                DB::raw('COALESCE(po_costs.avg_cost, products.purchase_price, 0) as po_average_cost'),
                DB::raw('product_hpps.hpp as manual_hpp'),
            );
    }

    /**
     * HPP rata-rata tertimbang per produk: total biaya pembelian dibagi
     * total kuantitas yang diterima.
     */
    public function costSubquery(): Builder
    {
        $qty = 'COALESCE(NULLIF(purchase_order_items.accepted_quantity, 0), purchase_order_items.received_quantity, purchase_order_items.quantity)';

        // Harga barang: koreksi Finance dipakai bila ada, kalau tidak harga PO.
        $goodsPrice = 'COALESCE(purchase_order_items.validated_unit_price, purchase_order_items.unit_price)';

        // Ongkir per unit = selisih landed price terhadap harga barang. Ditambahkan
        // terpisah agar tetap ikut terhitung walau Finance mengoreksi harga barang;
        // kalau digabung lewat COALESCE, koreksi Finance akan menghapus ongkirnya.
        $shippingPerUnit = 'COALESCE(purchase_order_items.landed_unit_price - purchase_order_items.unit_price, 0)';

        $cost = "{$qty} * ({$goodsPrice} + {$shippingPerUnit})";

        return DB::table('purchase_order_items')
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->whereIn('purchase_orders.status', self::RECEIVED_STATUSES)
            ->whereNull('purchase_orders.deleted_at')
            ->groupBy('purchase_order_items.product_id')
            ->select(
                'purchase_order_items.product_id',
                DB::raw("SUM({$qty}) as total_qty"),
                DB::raw("SUM({$cost}) as total_cost"),
                DB::raw("CASE WHEN SUM({$qty}) > 0 THEN SUM({$cost}) / SUM({$qty}) ELSE 0 END as avg_cost"),
            );
    }

    /**
     * Harga jual rata-rata tertimbang per produk, dihitung dari item Sales Order
     * yang tidak dibatalkan.
     */
    public function sellingSubquery(): Builder
    {
        return DB::table('sales_order_items')
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->whereNotIn('sales_orders.status', self::VOID_SO_STATUSES)
            ->whereNull('sales_orders.deleted_at')
            ->groupBy('sales_order_items.product_id')
            ->select(
                'sales_order_items.product_id',
                DB::raw('SUM(sales_order_items.quantity) as sold_qty'),
                DB::raw('CASE WHEN SUM(sales_order_items.quantity) > 0
                              THEN SUM(sales_order_items.quantity * sales_order_items.price) / SUM(sales_order_items.quantity)
                              ELSE 0 END as avg_selling_price'),
            );
    }
}
