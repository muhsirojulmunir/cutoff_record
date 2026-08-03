<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePettyCashRequest;
use App\Http\Requests\UpdatePettyCashRequest;
use App\Models\ExpenseCategory;
use App\Models\FundAllocation;
use App\Models\PettyCashTransaction;
use App\Services\FundAllocationService;
use App\Services\GoogleDriveService;
use App\Services\PettyCashService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class PettyCashController extends Controller
{
    public function __construct(
        private readonly PettyCashService $service,
        private readonly FundAllocationService $fundService,
        private readonly GoogleDriveService $drive,
    ) {}

    /**
     * Bukti pembayaran diunggah ke folder Google Drive minggu berjalan.
     * Data hasil unggahan digabung ke payload transaksi.
     */
    private function withAttachment(array $data, Request $request): array
    {
        if (! $request->hasFile('attachment_file')) {
            return $data;
        }

        $uploaded = $this->drive->uploadReceipt(
            $request->file('attachment_file'),
            $data['transaction_date'],
            $data['fund_type'] ?? 'petty_cash',
        );

        $data['attachment_name'] = $uploaded['name'];
        $data['attachment_link'] = $uploaded['link'];
        $data['attachment'] = $uploaded['link'];

        return $data;
    }

    public function index(Request $request): Response
    {
        Gate::authorize('petty_cash.view');

        $query = PettyCashTransaction::with(['category', 'creator'])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('transaction_number', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        if ($request->filled('category_id')) {
            $query->where('expense_category_id', $request->category_id);
        }

        if ($request->filled('fund_type')) {
            $query->where('fund_type', $request->fund_type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('date_from')) {
            $query->whereDate('transaction_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('transaction_date', '<=', $request->date_to);
        }

        $transactions = $query->paginate(15)->withQueryString();
        $categories   = ExpenseCategory::where('status', 'active')->orderBy('name')->get(['id', 'name', 'code']);

        return Inertia::render('PettyCash/Index', [
            'transactions'   => $transactions,
            'categories'     => $categories,
            'filters'        => $request->only(['search', 'category_id', 'fund_type', 'status', 'payment_method', 'date_from', 'date_to']),
            'paymentMethods' => $this->paymentMethods(),
            'statuses'       => $this->statuses(),
            'fundTypes'      => FundAllocation::TYPES,
            'summaries'      => [
                'petty_cash'  => $this->fundService->summary('petty_cash'),
                'dana_kelola' => $this->fundService->summary('dana_kelola'),
            ],
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('petty_cash.create');

        $cashBankAccounts = \App\Models\CashBankAccount::where('status', 'active')
            ->orderBy('account_code')
            ->get(['id', 'account_code', 'account_name', 'account_type']);

        return Inertia::render('PettyCash/Create', [
            'categories'       => ExpenseCategory::where('status', 'active')->orderBy('name')->get(['id', 'name', 'code']),
            'fundTypes'        => FundAllocation::TYPES,
            'driveEnabled'     => $this->drive->driveEnabled(),
            'summaries'        => [
                'petty_cash'  => $this->fundService->summary('petty_cash'),
                'dana_kelola' => $this->fundService->summary('dana_kelola'),
            ],
            'paymentMethods'   => $this->paymentMethods(),
            'cashBankAccounts' => $cashBankAccounts,
        ]);
    }

    public function store(StorePettyCashRequest $request): RedirectResponse
    {
        Gate::authorize('petty_cash.create');

        $data = $this->withAttachment($request->validated(), $request);

        $transaction = $this->service->create($data, auth()->id());

        return redirect()
            ->route('petty-cash.show', $transaction)
            ->with('success', "Transaksi {$transaction->transaction_number} berhasil dibuat.");
    }

    public function show(PettyCashTransaction $pettyCash): Response
    {
        Gate::authorize('petty_cash.view');

        $pettyCash->load([
            'category',
            'creator',
            'submitter',
            'approver',
            'rejector',
            'canceller',
            'cashBankAccount',
            'leaderApprover',
            'financeApprover',
            'executor',
        ]);

        return Inertia::render('PettyCash/Show', [
            'transaction'      => $pettyCash,
            'canEdit'          => $pettyCash->status === 'draft' && Gate::check('petty_cash.edit'),
            'canSubmit'        => $pettyCash->status === 'draft' && Gate::check('petty_cash.submit'),
            'canLeaderApprove' => $pettyCash->status === 'pending_leader_approval'
                && Gate::check('petty_cash.leader_approve')
                && $pettyCash->created_by !== auth()->id(),
            'canFinanceApprove'=> in_array($pettyCash->status, ['pending_finance_approval', 'approved'])
                && Gate::check('petty_cash.finance_approve'),
            'canReject'        => in_array($pettyCash->status, ['pending_leader_approval', 'pending_finance_approval'])
                && Gate::check('petty_cash.reject'),
            'canCancel'        => in_array($pettyCash->status, ['draft', 'rejected']) && Gate::check('petty_cash.cancel'),
            'paymentMethods'   => $this->paymentMethods(),
        ]);
    }

    public function edit(PettyCashTransaction $pettyCash): Response
    {
        Gate::authorize('petty_cash.edit');

        if ($pettyCash->status !== 'draft') {
            abort(403, 'Hanya transaksi berstatus draft yang dapat diubah.');
        }

        $cashBankAccounts = \App\Models\CashBankAccount::where('status', 'active')
            ->orderBy('account_code')
            ->get(['id', 'account_code', 'account_name', 'account_type']);

        return Inertia::render('PettyCash/Edit', [
            'transaction'      => $pettyCash->load('category'),
            'fundTypes'        => FundAllocation::TYPES,
            'driveEnabled'     => $this->drive->driveEnabled(),
            'categories'       => ExpenseCategory::where('status', 'active')->orderBy('name')->get(['id', 'name', 'code']),
            'paymentMethods'   => $this->paymentMethods(),
            'cashBankAccounts' => $cashBankAccounts,
        ]);
    }

    public function update(UpdatePettyCashRequest $request, PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.edit');

        if ($pettyCash->status !== 'draft') {
            abort(403, 'Hanya transaksi berstatus draft yang dapat diubah.');
        }

        try {
            $data = $this->withAttachment($request->validated(), $request);
            $transaction = $this->service->update($pettyCash, $data);
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} berhasil diperbarui.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['status' => $e->getMessage()]);
        }
    }

    public function submit(PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.submit');

        try {
            $transaction = $this->service->submitForApproval($pettyCash, auth()->id());
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} berhasil diajukan untuk persetujuan.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['status' => $e->getMessage()]);
        }
    }

    public function leaderApprove(PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.leader_approve');

        try {
            $transaction = $this->service->leaderApprove($pettyCash, auth()->id());
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} disetujui Leader. Menunggu persetujuan Finance.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['status' => $e->getMessage()]);
        }
    }

    public function financeApprove(PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.finance_approve');

        try {
            $transaction = $this->service->financeApprove($pettyCash, auth()->id());
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} disetujui Finance. Siap untuk dicairkan.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['status' => $e->getMessage()]);
        }
    }

    public function disburse(PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.finance_approve');

        try {
            $transaction = $this->service->disburse($pettyCash, auth()->id());
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} berhasil dicairkan.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['status' => $e->getMessage()]);
        }
    }

    public function reject(Request $request, PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.reject');

        $request->validate([
            'rejection_reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        try {
            $transaction = $this->service->reject($pettyCash, auth()->id(), $request->rejection_reason);
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} telah ditolak.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['rejection_reason' => $e->getMessage()]);
        }
    }

    public function cancel(Request $request, PettyCashTransaction $pettyCash): RedirectResponse
    {
        Gate::authorize('petty_cash.cancel');

        $request->validate([
            'cancellation_reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        try {
            $transaction = $this->service->cancel($pettyCash, auth()->id(), $request->cancellation_reason);
            return redirect()
                ->route('petty-cash.show', $transaction)
                ->with('success', "Transaksi {$transaction->transaction_number} telah dibatalkan.");
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['cancellation_reason' => $e->getMessage()]);
        }
    }

    public function destroy(PettyCashTransaction $pettyCash): RedirectResponse
    {
        $user = auth()->user();
        if (!$user || (!$user->isSuperAdmin() && !Gate::allows('petty_cash.delete'))) {
            abort(403, 'Hanya Super Admin yang berhak menghapus transaksi Petty Cash.');
        }

        try {
            $pettyCash->delete();

            return redirect()
                ->route('petty-cash.index')
                ->with('success', "Transaksi Petty Cash {$pettyCash->transaction_number} berhasil dihapus.");
        } catch (\Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    private function paymentMethods(): array

    {
        return [
            ['value' => 'cash', 'label' => 'Cash / Tunai'],
            ['value' => 'bank_transfer', 'label' => 'Transfer Bank'],
            ['value' => 'debit_card', 'label' => 'Kartu Debit'],
            ['value' => 'credit_card', 'label' => 'Kartu Kredit'],
            ['value' => 'e_wallet', 'label' => 'E-Wallet'],
            ['value' => 'other', 'label' => 'Lainnya'],
        ];
    }

    private function statuses(): array
    {
        return [
            ['value' => 'draft',                    'label' => 'Draft'],
            ['value' => 'pending_leader_approval',  'label' => 'Menunggu Leader'],
            ['value' => 'pending_finance_approval', 'label' => 'Menunggu Finance'],
            ['value' => 'approved',                 'label' => 'Disetujui'],
            ['value' => 'paid',                     'label' => 'Sudah Dibayar'],
            ['value' => 'rejected',                 'label' => 'Ditolak'],
            ['value' => 'cancelled',                'label' => 'Dibatalkan'],
        ];
    }
}
