<?php

namespace App\Services\Reports;

use App\Models\CashBankAccount;
use App\Models\CashBankTransaction;
use App\Models\FactoryReceivable;
use App\Models\Invoice;
use App\Models\PettyCashTransaction;
use App\Models\PurchaseOrder;
use App\Models\SalesOrder;
use App\Models\SalesOrderItem;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class FinancialReportService
{
    public function __construct(
        private readonly ProductPricingService $pricingService,
    ) {}

    public function getSummary(?string $dateFrom = null, ?string $dateTo = null): array
    {
        // 1. Customer Receivables
        $invoices = Invoice::whereNotIn('status', ['cancelled'])->get();
        $totalReceivables = 0.0;
        $overdueAmount    = 0.0;
        $unpaidCount      = 0;
        $overdueCount     = 0;

        foreach ($invoices as $inv) {
            $remaining = max(0, $inv->total_amount - $inv->paid_amount);
            if ($remaining > 0) {
                $totalReceivables += $remaining;
                $unpaidCount++;
                if ($inv->due_date && Carbon::parse($inv->due_date)->isPast() && $inv->status !== 'paid') {
                    $overdueAmount += $remaining;
                    $overdueCount++;
                }
            }
        }

        // 2. Supplier Payables (FactoryReceivable)
        $factoryReceivables = FactoryReceivable::whereNotIn('status', ['cancelled'])->get();
        $totalPayables = 0.0;
        foreach ($factoryReceivables as $fr) {
            $rem = max(0, (float) $fr->original_amount - (float) $fr->paid_amount);
            if ($rem > 0) {
                $totalPayables += $rem;
            }
        }

        // 3. Cash & Bank Balance
        $cashBankAccounts = CashBankAccount::where('status', 'active')->get();
        $totalCashBalance = (float) $cashBankAccounts->sum('current_balance');

        // 4. Petty Cash Expenses
        $pcQuery = PettyCashTransaction::query();
        if ($dateFrom) $pcQuery->where('transaction_date', '>=', $dateFrom);
        if ($dateTo)   $pcQuery->where('transaction_date', '<=', $dateTo);

        $totalPettyCashApproved = (float) (clone $pcQuery)->where('status', 'approved')->sum('amount');
        $totalPettyCashPending  = (float) (clone $pcQuery)->where('status', 'submitted')->sum('amount');

        // 5. Estimated Gross Profit & Net Profit Calculation
        $soQuery = SalesOrder::whereNotIn('status', ['cancelled', 'rejected']);

        if ($dateFrom) {
            $soQuery->where('order_date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $soQuery->where('order_date', '<=', $dateTo);
        }

        $revenue = (float) $soQuery->sum('grand_total');

        // HPP barang terjual yang sebenarnya (COGS) dari SalesOrderItem x HPP produk
        $cogs = (float) SalesOrderItem::query()
            ->join('sales_orders', 'sales_orders.id', '=', 'sales_order_items.sales_order_id')
            ->leftJoinSub($this->pricingService->effectiveCostSubquery(), 'po_costs', 'po_costs.product_id', '=', 'sales_order_items.product_id')
            ->whereNull('sales_orders.deleted_at')
            ->whereNotIn('sales_orders.status', ['cancelled', 'rejected'])
            ->when($dateFrom, fn($q) => $q->where('sales_orders.order_date', '>=', $dateFrom))
            ->when($dateTo, fn($q) => $q->where('sales_orders.order_date', '<=', $dateTo))
            ->sum(DB::raw('sales_order_items.quantity * COALESCE(po_costs.avg_cost, 0)'));

        $operating = (float) $totalPettyCashApproved;

        $estimatedGrossProfit = $revenue - $cogs;
        $estimatedNetProfit   = $estimatedGrossProfit - $operating;

        return [
            'total_receivables'      => $totalReceivables,
            'overdue_receivables'    => $overdueAmount,
            'unpaid_invoices_count'  => $unpaidCount,
            'overdue_invoices_count' => $overdueCount,
            'total_payables'         => $totalPayables,
            'total_cash_balance'     => $totalCashBalance,
            'petty_cash_approved'    => $totalPettyCashApproved,
            'petty_cash_pending'     => $totalPettyCashPending,
            'estimated_revenue'      => $revenue,
            'estimated_cogs'         => $cogs,
            'operating_expenses'     => $operating,
            'estimated_gross_profit' => $estimatedGrossProfit,
            'estimated_net_profit'   => $estimatedNetProfit,
        ];
    }

    public function getCustomerReceivables(int $perPage = 20): \Illuminate\Contracts\Pagination\LengthAwarePaginator
    {
        return Invoice::with('customer:id,name,customer_code')
            ->whereNotIn('status', ['cancelled'])
            ->orderBy('due_date', 'asc')
            ->paginate($perPage);
    }

    public function getSupplierPayables(int $perPage = 20): \Illuminate\Contracts\Pagination\LengthAwarePaginator
    {
        return FactoryReceivable::with('supplier:id,name', 'purchaseOrder:id,po_number')
            ->whereNotIn('status', ['cancelled'])
            ->orderBy('due_date', 'asc')
            ->paginate($perPage);
    }

    public function getCashBankSummary(): array
    {
        $accounts = CashBankAccount::where('status', 'active')->get();

        return $accounts->map(fn($acc) => [
            'id'             => $acc->id,
            'account_name'   => $acc->account_name,
            'account_type'   => $acc->account_type,
            'account_number' => $acc->account_number,
            'bank_name'      => $acc->bank_name,
            'balance'        => (float) $acc->current_balance,
            'total_in'       => (float) CashBankTransaction::where('account_id', $acc->id)->where('direction', 'in')->sum('amount'),
            'total_out'      => (float) CashBankTransaction::where('account_id', $acc->id)->where('direction', 'out')->sum('amount'),
        ])->toArray();
    }
}
