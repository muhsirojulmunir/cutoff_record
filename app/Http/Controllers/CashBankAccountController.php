<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCashBankAccountRequest;
use App\Http\Requests\UpdateCashBankAccountRequest;
use App\Models\CashBankAccount;
use App\Services\CashBankService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class CashBankAccountController extends Controller
{
    public function __construct(private readonly CashBankService $service) {}

    public function index(Request $request): Response
    {
        Gate::authorize('cash_bank.view');

        $accounts = CashBankAccount::with('creator')
            ->when($request->search, fn($q, $s) => $q->where(function ($q) use ($s) {
                $q->where('account_code', 'like', "%{$s}%")
                  ->orWhere('account_name', 'like', "%{$s}%")
                  ->orWhere('bank_name', 'like', "%{$s}%");
            }))
            ->when($request->type,   fn($q, $t) => $q->where('account_type', $t))
            ->when($request->status, fn($q, $s) => $q->where('status', $s))
            ->orderBy('account_code')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('CashBank/Accounts/Index', [
            'accounts'     => $accounts,
            'filters'      => $request->only(['search', 'type', 'status']),
            'accountTypes' => $this->accountTypes(),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('cash_bank.create');

        return Inertia::render('CashBank/Accounts/Create', [
            'accountTypes' => $this->accountTypes(),
        ]);
    }

    public function store(StoreCashBankAccountRequest $request): RedirectResponse
    {
        Gate::authorize('cash_bank.create');

        try {
            $account = $this->service->createAccount($request->validated(), auth()->id());

            return redirect("/cash-bank/accounts/{$account->id}")
                ->with('success', "Rekening {$account->account_code} - {$account->account_name} berhasil dibuat.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        } catch (\Exception $e) {
            return back()->with('error', 'Terjadi kesalahan: ' . $e->getMessage())->withInput();
        }
    }

    public function show(CashBankAccount $cashBankAccount): Response
    {
        Gate::authorize('cash_bank.view');

        $cashBankAccount->load('creator');

        // Summary stats
        $totalIn  = $cashBankAccount->transactions()->where('direction', 'in')->where('status', 'posted')->sum('amount');
        $totalOut = $cashBankAccount->transactions()->where('direction', 'out')->where('status', 'posted')->sum('amount');
        $txnCount = $cashBankAccount->transactions()->count();

        // Recent 10 transactions
        $recentTransactions = $cashBankAccount->transactions()
            ->with('creator')
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->limit(10)
            ->get();

        return Inertia::render('CashBank/Accounts/Show', [
            'account'            => $cashBankAccount,
            'totalIn'            => $totalIn,
            'totalOut'           => $totalOut,
            'txnCount'           => $txnCount,
            'recentTransactions' => $recentTransactions,
            'canEdit'            => Gate::check('cash_bank.edit'),
            'canAdjust'          => Gate::check('cash_bank.adjust'),
            'canDeactivate'      => Gate::check('cash_bank.deactivate'),
        ]);
    }

    public function edit(CashBankAccount $cashBankAccount): Response
    {
        Gate::authorize('cash_bank.edit');

        return Inertia::render('CashBank/Accounts/Edit', [
            'account'      => $cashBankAccount,
            'accountTypes' => $this->accountTypes(),
        ]);
    }

    public function update(UpdateCashBankAccountRequest $request, CashBankAccount $cashBankAccount): RedirectResponse
    {
        Gate::authorize('cash_bank.edit');

        try {
            $this->service->updateAccount($cashBankAccount, $request->validated());

            return redirect("/cash-bank/accounts/{$cashBankAccount->id}")
                ->with('success', 'Rekening berhasil diperbarui.');
        } catch (\Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    public function deactivate(CashBankAccount $cashBankAccount): RedirectResponse
    {
        Gate::authorize('cash_bank.deactivate');

        try {
            $this->service->deactivateAccount($cashBankAccount);
            return back()->with('success', 'Rekening berhasil dinonaktifkan.');
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    public function activate(CashBankAccount $cashBankAccount): RedirectResponse
    {
        Gate::authorize('cash_bank.deactivate');

        try {
            $this->service->activateAccount($cashBankAccount);
            return back()->with('success', 'Rekening berhasil diaktifkan kembali.');
        } catch (\InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    private function accountTypes(): array
    {
        return [
            ['value' => 'cash',     'label' => 'Kas / Cash'],
            ['value' => 'bank',     'label' => 'Bank'],
            ['value' => 'e_wallet', 'label' => 'E-Wallet'],
        ];
    }
}
