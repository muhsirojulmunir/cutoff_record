<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreFundAllocationRequest;
use App\Models\CashBankAccount;
use App\Models\FundAllocation;
use App\Services\FundAllocationService;
use App\Support\WeekPeriod;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * Pengisian dana mingguan yang diterima Finance untuk Petty Cash dan Dana Kelola.
 */
class FundAllocationController extends Controller
{
    public function __construct(private readonly FundAllocationService $service) {}

    public function index(Request $request): Response
    {
        Gate::authorize('fund_allocation.view');

        $allocations = FundAllocation::with(['cashBankAccount', 'creator'])
            ->when($request->filled('fund_type'), fn ($q) => $q->where('fund_type', $request->fund_type))
            ->orderByDesc('period_start')
            ->orderByDesc('id')
            ->paginate(15)
            ->withQueryString();

        $currentWeek = WeekPeriod::containing();

        return Inertia::render('FundAllocations/Index', [
            'allocations' => $allocations,
            'filters'     => $request->only(['fund_type']),
            'fundTypes'   => FundAllocation::TYPES,
            'summaries'   => [
                'petty_cash'  => $this->service->summary('petty_cash'),
                'dana_kelola' => $this->service->summary('dana_kelola'),
            ],
            'currentWeek' => [
                'period_start' => $currentWeek->startDate(),
                'period_end'   => $currentWeek->endDate(),
                'label'        => $currentWeek->label(),
            ],
            'cashBankAccounts' => CashBankAccount::where('status', 'active')
                ->orderBy('account_code')
                ->get(['id', 'account_code', 'account_name', 'account_type', 'current_balance']),
        ]);
    }

    public function store(StoreFundAllocationRequest $request): RedirectResponse
    {
        Gate::authorize('fund_allocation.create');

        try {
            $allocation = $this->service->create($request->validated(), auth()->id());
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with(
            'success',
            "Pengisian {$allocation->fund_type_label} periode {$allocation->period_label} berhasil dicatat."
        );
    }

    public function destroy(FundAllocation $fundAllocation): RedirectResponse
    {
        Gate::authorize('fund_allocation.create');

        try {
            $this->service->delete($fundAllocation);
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Pengisian dana berhasil dihapus.');
    }
}
