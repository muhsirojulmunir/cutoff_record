<?php

namespace App\Services;

use App\Models\FactoryReceivable;
use App\Models\Invoice;
use App\Models\MarketplaceOrder;
use App\Models\PettyCashTransaction;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Membangun daftar "tugas menunggu" (work queue) untuk user yang sedang login.
 *
 * Notifikasi di sini bersifat *derived*: dihitung langsung dari status dokumen,
 * bukan dari tabel notifikasi. Konsekuensinya badge selalu akurat dan hilang
 * sendiri begitu dokumennya diproses — tidak ada notifikasi basi.
 */
class WorkQueueService
{
    /** Severity: dampak paling tinggi lebih dulu saat diurutkan. */
    private const SEVERITY_ORDER = ['critical' => 0, 'warning' => 1, 'info' => 2];

    /**
     * @return array{items: array<int, array<string, mixed>>, total: int, critical: int}
     */
    public function getForUser(?User $user): array
    {
        if (!$user) {
            return ['items' => [], 'total' => 0, 'critical' => 0];
        }

        $permissions = $user->getPermissions();
        $items       = [];

        foreach ($this->definitions() as $definition) {
            if (!in_array($definition['permission'], $permissions, true)) {
                continue;
            }

            $count = ($definition['count'])();
            if ($count === 0) {
                continue;
            }

            $amount = isset($definition['amount']) ? (float) ($definition['amount'])() : null;

            $items[] = [
                'key'         => $definition['key'],
                'type'        => $definition['type'],
                'title'       => $definition['title'],
                'description' => strtr($definition['description'], [
                    ':count'  => (string) $count,
                    ':amount' => $this->formatRupiah($amount ?? 0),
                ]),
                'count'       => $count,
                'amount'      => $amount,
                'href'        => $definition['href'],
                'severity'    => $definition['severity'],
            ];
        }

        usort($items, function (array $a, array $b) {
            $bySeverity = self::SEVERITY_ORDER[$a['severity']] <=> self::SEVERITY_ORDER[$b['severity']];
            return $bySeverity !== 0 ? $bySeverity : $b['count'] <=> $a['count'];
        });

        return [
            'items'    => $items,
            'total'    => array_sum(array_column($items, 'count')),
            'critical' => array_sum(array_column(
                array_filter($items, fn($i) => $i['severity'] === 'critical'),
                'count'
            )),
        ];
    }

    private function formatRupiah(float $value): string
    {
        return 'Rp ' . number_format($value, 0, ',', '.');
    }

    /** Invoice customer yang masih menyisakan tagihan. */
    private function unpaidInvoices(): Builder
    {
        return Invoice::whereNotIn('status', ['paid', 'cancelled'])
            ->whereColumn('paid_amount', '<', 'total_amount');
    }

    /** Tagihan pabrik yang masih menyisakan kewajiban bayar. */
    private function unpaidFactoryReceivables(): Builder
    {
        return FactoryReceivable::whereNotIn('status', ['paid', 'cancelled'])
            ->whereColumn('paid_amount', '<', 'original_amount');
    }

    /** PO yang barangnya sudah masuk gudang tapi belum dibayar sama sekali. */
    private function unpaidPurchaseOrders(): Builder
    {
        return PurchaseOrder::where('payment_status', 'unpaid')
            ->whereIn('status', ['received', 'partially_received', 'finance_validated']);
    }

    /**
     * Definisi semua jenis pengingat. Setiap entri hanya dihitung bila user
     * memegang permission-nya, sehingga tiap role melihat antrian kerjanya sendiri.
     *
     * @return array<int, array<string, mixed>>
     */
    private function definitions(): array
    {
        $today = now()->toDateString();

        return [
            [
                'key'         => 'po_leader_approval',
                'type'        => 'purchase_order',
                'permission'  => 'purchase_order.leader_approve',
                'title'       => 'PO menunggu approval Leader',
                'description' => ':count purchase order diajukan dan menunggu persetujuan Anda.',
                'severity'    => 'critical',
                'href'        => '/purchase-orders?status=pending_leader_approval',
                'count'       => fn() => PurchaseOrder::where('status', 'pending_leader_approval')->count(),
            ],
            [
                'key'         => 'po_finance_approval',
                'type'        => 'purchase_order',
                'permission'  => 'purchase_order.finance_approve',
                'title'       => 'PO menunggu approval Finance',
                'description' => ':count purchase order sudah disetujui Leader dan menunggu Finance.',
                'severity'    => 'critical',
                'href'        => '/purchase-orders?status=pending_finance_approval',
                'count'       => fn() => PurchaseOrder::where('status', 'pending_finance_approval')->count(),
            ],
            [
                'key'         => 'po_ready_to_receive',
                'type'        => 'purchase_order',
                'permission'  => 'purchase_order.receive',
                'title'       => 'PO siap terima barang',
                'description' => ':count purchase order sudah approved dan menunggu penerimaan barang.',
                'severity'    => 'info',
                'href'        => '/purchase-orders?status=approved',
                'count'       => fn() => PurchaseOrder::whereIn('status', ['approved', 'ordered'])->count(),
            ],
            [
                'key'         => 'so_approval',
                'type'        => 'sales_order',
                'permission'  => 'sales_order.approve',
                'title'       => 'Sales Order menunggu approval',
                'description' => ':count sales order menunggu persetujuan Anda.',
                'severity'    => 'critical',
                'href'        => '/sales-orders?status=pending_approval',
                'count'       => fn() => SalesOrder::where('status', 'pending_approval')->count(),
            ],
            [
                'key'         => 'petty_cash_leader_approval',
                'type'        => 'petty_cash',
                'permission'  => 'petty_cash.leader_approve',
                'title'       => 'Petty Cash menunggu Leader',
                'description' => ':count pengajuan petty cash menunggu persetujuan Anda.',
                'severity'    => 'critical',
                'href'        => '/petty-cash?status=pending_leader_approval',
                'count'       => fn() => PettyCashTransaction::where('status', 'pending_leader_approval')->count(),
            ],
            [
                'key'         => 'petty_cash_finance_approval',
                'type'        => 'petty_cash',
                'permission'  => 'petty_cash.finance_approve',
                'title'       => 'Petty Cash menunggu pencairan',
                'description' => ':count pengajuan petty cash menunggu approval & pencairan Finance.',
                'severity'    => 'critical',
                'href'        => '/petty-cash?status=pending_finance_approval',
                'count'       => fn() => PettyCashTransaction::where('status', 'pending_finance_approval')->count(),
            ],
            // ── Penagihan ke customer (uang masuk) ──────────────────────────────
            [
                'key'         => 'invoice_overdue',
                'type'        => 'invoice',
                'permission'  => 'invoice.view',
                'title'       => 'Customer telat bayar',
                'description' => ':count invoice sudah lewat jatuh tempo, total :amount belum tertagih.',
                'severity'    => 'critical',
                'href'        => '/invoices?status=overdue',
                'count'       => fn() => $this->unpaidInvoices()->whereDate('due_date', '<', $today)->count(),
                'amount'      => fn() => $this->unpaidInvoices()->whereDate('due_date', '<', $today)
                    ->sum(DB::raw('total_amount - paid_amount')),
            ],
            [
                'key'         => 'invoice_awaiting_payment',
                'type'        => 'invoice',
                'permission'  => 'payment.create',
                'title'       => 'Menunggu pembayaran customer',
                'description' => ':count invoice belum lunas dan belum jatuh tempo, nilai :amount.',
                'severity'    => 'info',
                'href'        => '/invoices?status=unpaid',
                'count'       => fn() => $this->unpaidInvoices()
                    ->where(fn($q) => $q->whereNull('due_date')->orWhereDate('due_date', '>=', $today))
                    ->count(),
                'amount'      => fn() => $this->unpaidInvoices()
                    ->where(fn($q) => $q->whereNull('due_date')->orWhereDate('due_date', '>=', $today))
                    ->sum(DB::raw('total_amount - paid_amount')),
            ],

            // ── Kewajiban bayar ke pabrik / supplier (uang keluar) ──────────────
            [
                'key'         => 'factory_receivable_overdue',
                'type'        => 'factory_receivable',
                'permission'  => 'factory_receivable.payment',
                'title'       => 'Hutang pabrik jatuh tempo',
                'description' => ':count tagihan pabrik sudah jatuh tempo, segera bayar :amount.',
                'severity'    => 'critical',
                'href'        => '/factory-receivables?status=unpaid',
                'count'       => fn() => $this->unpaidFactoryReceivables()->whereDate('due_date', '<=', $today)->count(),
                'amount'      => fn() => $this->unpaidFactoryReceivables()->whereDate('due_date', '<=', $today)
                    ->sum(DB::raw('original_amount - paid_amount')),
            ],
            [
                'key'         => 'factory_receivable_upcoming',
                'type'        => 'factory_receivable',
                'permission'  => 'factory_receivable.payment',
                'title'       => 'Hutang pabrik belum dibayar',
                'description' => ':count tagihan pabrik belum lunas dan belum jatuh tempo, nilai :amount.',
                'severity'    => 'warning',
                'href'        => '/factory-receivables?status=unpaid',
                'count'       => fn() => $this->unpaidFactoryReceivables()
                    ->where(fn($q) => $q->whereNull('due_date')->orWhereDate('due_date', '>', $today))
                    ->count(),
                'amount'      => fn() => $this->unpaidFactoryReceivables()
                    ->where(fn($q) => $q->whereNull('due_date')->orWhereDate('due_date', '>', $today))
                    ->sum(DB::raw('original_amount - paid_amount')),
            ],
            [
                'key'         => 'po_unpaid',
                'type'        => 'purchase_order',
                'permission'  => 'factory_receivable.payment',
                'title'       => 'PO belum dibayar',
                'description' => ':count purchase order barangnya sudah diterima tapi belum lunas, nilai :amount.',
                'severity'    => 'warning',
                'href'        => '/purchase-orders?payment_status=unpaid',
                'count'       => fn() => $this->unpaidPurchaseOrders()->count(),
                'amount'      => fn() => $this->unpaidPurchaseOrders()->sum('grand_total'),
            ],
            [
                'key'         => 'marketplace_order_blocked',
                'type'        => 'marketplace',
                'permission'  => 'marketplace.order.view',
                'title'       => 'Order marketplace butuh tindakan',
                'description' => ':count order tertahan karena mapping produk / stok tidak cukup.',
                'severity'    => 'warning',
                'href'        => '/marketplace/orders',
                'count'       => fn() => MarketplaceOrder::whereIn('workflow_status', ['mapping_required', 'stock_insufficient'])->count(),
            ],
            [
                'key'         => 'product_low_stock',
                'type'        => 'stock',
                'permission'  => 'stock.view',
                'title'       => 'Stok produk menipis',
                'description' => ':count produk berada di bawah atau sama dengan stok minimum.',
                'severity'    => 'warning',
                'href'        => '/all-stock',
                'count'       => fn() => Product::where('status', 'active')
                    ->where('minimum_stock', '>', 0)
                    ->whereColumn('stock', '<=', 'minimum_stock')
                    ->count(),
            ],
        ];
    }
}
