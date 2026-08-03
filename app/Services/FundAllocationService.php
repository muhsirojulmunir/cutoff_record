<?php

namespace App\Services;

use App\Models\CashBankAccount;
use App\Models\FundAllocation;
use App\Models\PettyCashTransaction;
use App\Support\WeekPeriod;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Pengisian dana mingguan Finance beserta perhitungan sisa saldonya.
 */
class FundAllocationService
{
    /** Status transaksi yang dianggap memakai dana. */
    private const CONSUMING_STATUSES = ['pending_leader_approval', 'pending_finance_approval', 'approved', 'paid'];

    public function __construct(private readonly CashBankService $cashBankService) {}

    public function create(array $data, int $userId): FundAllocation
    {
        $period = WeekPeriod::containing($data['period_start']);

        return DB::transaction(function () use ($data, $userId, $period) {
            $allocation = FundAllocation::create([
                'fund_type'            => $data['fund_type'],
                'period_start'         => $period->startDate(),
                'period_end'           => $period->endDate(),
                'amount'               => $data['amount'],
                'cash_bank_account_id' => $data['cash_bank_account_id'] ?? null,
                'notes'                => $data['notes'] ?? null,
                'created_by'           => $userId,
            ]);

            // Dana yang diserahkan ke Finance keluar dari kas/bank sumber.
            if ($allocation->cash_bank_account_id) {
                $account = CashBankAccount::where('id', $allocation->cash_bank_account_id)
                    ->where('status', 'active')
                    ->firstOrFail();

                $this->cashBankService->recordFundAllocation($allocation, $account, $userId);
            }

            return $allocation;
        });
    }

    public function delete(FundAllocation $allocation): void
    {
        $usage = $this->usage($allocation->fund_type, WeekPeriod::containing($allocation->period_start));

        if ($usage > 0) {
            throw new InvalidArgumentException('Pengisian dana tidak dapat dihapus karena sudah ada pengeluaran pada minggu tersebut.');
        }

        $allocation->delete();
    }

    /** Total dana yang diisi untuk satu jenis dana pada satu minggu. */
    public function allocated(string $fundType, WeekPeriod $period): float
    {
        return (float) FundAllocation::where('fund_type', $fundType)
            ->whereBetween('period_start', [$period->startDate(), $period->endDate()])
            ->sum('amount');
    }

    /** Total pengeluaran yang sudah berjalan pada minggu tersebut. */
    public function usage(string $fundType, WeekPeriod $period): float
    {
        return (float) PettyCashTransaction::where('fund_type', $fundType)
            ->whereIn('status', self::CONSUMING_STATUSES)
            ->whereBetween('transaction_date', [$period->startDate(), $period->endDate()])
            ->sum('amount');
    }

    /**
     * Ringkasan dana minggu berjalan untuk ditampilkan di halaman kas kecil.
     *
     * @return array<string, mixed>
     */
    public function summary(string $fundType, ?string $reference = null): array
    {
        $period = WeekPeriod::containing($reference);
        $allocated = $this->allocated($fundType, $period);
        $used = $this->usage($fundType, $period);

        return [
            'fund_type'    => $fundType,
            'period_start' => $period->startDate(),
            'period_end'   => $period->endDate(),
            'period_label' => $period->label(),
            'allocated'    => $allocated,
            'used'         => $used,
            'remaining'    => $allocated - $used,
            'over_budget'  => $used > $allocated,
        ];
    }
}
