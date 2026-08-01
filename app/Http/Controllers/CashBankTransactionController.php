<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCashBankTransactionRequest;
use App\Models\CashBankAccount;
use App\Models\CashBankTransaction;
use App\Services\CashBankService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class CashBankTransactionController extends Controller
{
    public function __construct(private readonly CashBankService $service) {}

    public function index(Request $request): Response
    {
        Gate::authorize('cash_transaction.view');

        $txns = CashBankTransaction::with(['account', 'creator'])
            ->when($request->search, fn($q, $s) => $q->where(function ($q) use ($s) {
                $q->where('transaction_number', 'like', "%{$s}%")
                  ->orWhere('reference_number', 'like', "%{$s}%")
                  ->orWhere('description', 'like', "%{$s}%");
            }))
            ->when($request->account_id,        fn($q, $v) => $q->where('account_id', $v))
            ->when($request->transaction_type,  fn($q, $v) => $q->where('transaction_type', $v))
            ->when($request->direction,         fn($q, $v) => $q->where('direction', $v))
            ->when($request->date_from,         fn($q, $v) => $q->whereDate('transaction_date', '>=', $v))
            ->when($request->date_to,           fn($q, $v) => $q->whereDate('transaction_date', '<=', $v))
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->paginate(20)
            ->withQueryString();

        $accounts = CashBankAccount::orderBy('account_code')->get(['id', 'account_code', 'account_name']);

        return Inertia::render('CashBank/Transactions/Index', [
            'transactions'     => $txns,
            'accounts'         => $accounts,
            'filters'          => $request->only(['search', 'account_id', 'transaction_type', 'direction', 'date_from', 'date_to']),
            'transactionTypes' => $this->transactionTypes(),
        ]);
    }

    public function show(CashBankTransaction $cashBankTransaction): Response
    {
        Gate::authorize('cash_transaction.view');

        $cashBankTransaction->load(['account', 'creator']);

        // Load source polymorphically with eager loading
        $source = null;
        if ($cashBankTransaction->source_type && $cashBankTransaction->source_id) {
            $model = app($cashBankTransaction->source_type);
            if ($model) {
                $source = $model::with($this->sourceRelations($cashBankTransaction->source_type))
                    ->find($cashBankTransaction->source_id);
            }
        }

        return Inertia::render('CashBank/Transactions/Show', [
            'transaction' => $cashBankTransaction,
            'source'      => $source,
            'sourceType'  => $cashBankTransaction->source_type,
        ]);
    }

    /**
     * Record manual cash in.
     */
    public function storeCashIn(StoreCashBankTransactionRequest $request): RedirectResponse
    {
        Gate::authorize('cash_transaction.create');

        $account = CashBankAccount::findOrFail($request->account_id);

        try {
            $this->service->recordCashIn($account, $request->validated(), auth()->id());
            return redirect('/cash-bank/transactions')->with('success', 'Cash In berhasil dicatat.');
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    /**
     * Record manual cash out.
     */
    public function storeCashOut(StoreCashBankTransactionRequest $request): RedirectResponse
    {
        Gate::authorize('cash_transaction.create');

        $account = CashBankAccount::findOrFail($request->account_id);

        try {
            $this->service->recordCashOut($account, $request->validated(), auth()->id());
            return redirect('/cash-bank/transactions')->with('success', 'Cash Out berhasil dicatat.');
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    /**
     * Record adjustment (admin only).
     */
    public function storeAdjustment(StoreCashBankTransactionRequest $request): RedirectResponse
    {
        Gate::authorize('cash_transaction.adjust');

        $request->validate(['direction' => ['required', 'in:in,out']]);

        $account = CashBankAccount::findOrFail($request->account_id);

        try {
            $this->service->recordAdjustment($account, $request->validated(), auth()->id());
            return redirect('/cash-bank/transactions')->with('success', 'Adjustment berhasil dicatat.');
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    private function sourceRelations(string $sourceType): array
    {
        return match ($sourceType) {
            'App\\Models\\Payment' => [
                'creator',
                'allocations.invoice.salesOrder.customer',
                'allocations.factoryReceivable.supplier',
            ],
            'App\\Models\\PettyCashTransaction' => ['category', 'creator'],
            default => [],
        };
    }

    private function transactionTypes(): array
    {
        return [
            ['value' => 'opening_balance',  'label' => 'Saldo Awal'],
            ['value' => 'customer_payment', 'label' => 'Pembayaran Customer'],
            ['value' => 'supplier_payment', 'label' => 'Pembayaran Supplier'],
            ['value' => 'petty_cash',       'label' => 'Petty Cash'],
            ['value' => 'cash_in',          'label' => 'Cash In (Manual)'],
            ['value' => 'cash_out',         'label' => 'Cash Out (Manual)'],
            ['value' => 'adjustment',       'label' => 'Adjustment'],
        ];
    }

    /**
     * Delete cash/bank transaction (Super Admin only). Reverses balance on the account.
     */
    public function destroy(CashBankTransaction $cashBankTransaction): RedirectResponse
    {
        $user = auth()->user();
        if (!$user || !$user->isSuperAdmin()) {
            abort(403, 'Hanya Super Admin yang berhak menghapus transaksi Kas & Bank.');
        }

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($cashBankTransaction) {
                // Reverse balance on account
                $account = $cashBankTransaction->account;
                if ($account) {
                    if ($cashBankTransaction->direction === 'in') {
                        $account->decrement('current_balance', $cashBankTransaction->amount);
                    } else {
                        $account->increment('current_balance', $cashBankTransaction->amount);
                    }
                }
                $cashBankTransaction->delete();
            });

            return redirect('/cash-bank/transactions')
                ->with('success', "Transaksi {$cashBankTransaction->transaction_number} berhasil dihapus dan saldo dibalik.");
        } catch (\Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}

