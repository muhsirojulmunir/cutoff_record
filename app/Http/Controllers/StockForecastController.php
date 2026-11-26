<?php

namespace App\Http\Controllers;

use App\Models\PoProposal;
use App\Services\StockForecastService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class StockForecastController extends Controller
{
    public function __construct(private readonly StockForecastService $forecastService) {}

    /**
     * Get all role names associated with the authenticated user.
     *
     * @return array<string>
     */
    private function getUserRoleNames(): array
    {
        $user = auth()->user();
        if (!$user) {
            return [];
        }

        $roles = [];
        if ($user->role?->name) {
            $roles[] = $user->role->name;
        }

        if (method_exists($user, 'roles') && $user->roles) {
            foreach ($user->roles as $r) {
                $roles[] = is_string($r) ? $r : ($r->name ?? '');
            }
        }

        return array_unique($roles);
    }

    private function authorizeAccess(): void
    {
        $user = auth()->user();
        if (!$user) {
            abort(403);
        }

        $roles = $this->getUserRoleNames();
        $isAllowed = in_array('Super Admin', $roles, true)
            || in_array('PIC', $roles, true)
            || in_array('Direktur', $roles, true);

        if (!$isAllowed) {
            abort(403, 'Akses terbatas untuk Super Admin dan PIC.');
        }
    }

    private function authorizeManagement(): void
    {
        $user = auth()->user();
        if (!$user) {
            abort(403);
        }

        $roles = $this->getUserRoleNames();
        $isMgmt = in_array('Super Admin', $roles, true) || in_array('Direktur', $roles, true);

        if (!$isMgmt) {
            abort(403, 'Hanya akun Manajemen (Super Admin / Direktur) yang dapat menyetujui pengajuan PO.');
        }
    }

    private function authorizeProposer(): void
    {
        $user = auth()->user();
        if (!$user) {
            abort(403);
        }

        $roles = $this->getUserRoleNames();
        $canPropose = in_array('Super Admin', $roles, true) || in_array('PIC', $roles, true);

        if (!$canPropose) {
            abort(403, 'Hanya PIC atau Super Admin yang dapat mengajukan, mengubah, atau membatalkan PO.');
        }
    }

    public function index(Request $request): Response
    {
        $this->authorizeAccess();

        $roles = $this->getUserRoleNames();
        $isManagement = in_array('Super Admin', $roles, true) || in_array('Direktur', $roles, true);
        $isDirekturOnly = in_array('Direktur', $roles, true) && ! in_array('Super Admin', $roles, true);
        $canPropose = in_array('Super Admin', $roles, true) || in_array('PIC', $roles, true);

        $targetMonths = max(1, min(24, (int)$request->input('target_months', 5) ?: 5));
        $leadTimeMonths = max(1, min(12, (int)$request->input('lead_time_months', 3) ?: 3));
        $search          = $request->input('search');
        $statusFilter    = $request->input('status', 'all');

        $forecast = $isDirekturOnly
            ? [
                'rows'        => [],
                'stats'       => [
                    'total_items'          => 0,
                    'harus_po_count'       => 0,
                    'siap_po_count'        => 0,
                    'aman_count'           => 0,
                    'tenang_count'         => 0,
                    'total_recommended_po' => 0,
                ],
                'date_ranges' => ['m3_label' => '', 'm2_label' => '', 'm1_label' => ''],
                'parameters'  => ['target_months' => $targetMonths, 'lead_time_months' => $leadTimeMonths],
            ]
            : $this->forecastService->getForecastData(
                $targetMonths,
                $leadTimeMonths,
                $search,
                $statusFilter
            );

        $proposals = Schema::hasTable('po_proposals')
            ? PoProposal::with(['proposer:id,name', 'reviewer:id,name'])
                ->orderByDesc('id')
                ->limit(100)
                ->get()
            : collect([]);

        return Inertia::render('Stock/Forecast', [
            'forecast'       => $forecast,
            'proposals'      => $proposals,
            'filters'        => [
                'target_months'    => $targetMonths,
                'lead_time_months' => $leadTimeMonths,
                'search'           => $search,
                'status'           => $statusFilter,
            ],
            'isManagement'   => $isManagement,
            'isDirekturOnly' => $isDirekturOnly,
            'canPropose'     => $canPropose,
        ]);
    }

    public function propose(Request $request): RedirectResponse
    {
        $this->authorizeProposer();

        $validated = $request->validate([
            'sku'                   => ['required', 'string', 'max:100'],
            'product_name'          => ['required', 'string', 'max:255'],
            'supplier_name'         => ['nullable', 'string', 'max:255'],
            'warehouse'             => ['required', 'string', 'in:G,A'],
            'current_stock'         => ['required', 'integer'],
            'monthly_velocity'      => ['required', 'numeric'],
            'stock_coverage_months' => ['nullable', 'numeric'],
            'target_months'         => ['nullable', 'integer', 'min:1', 'max:24'],
            'target_stock'          => ['nullable', 'integer', 'min:0'],
            'recommended_qty'       => ['required', 'integer'],
            'proposed_qty'          => ['required', 'integer', 'min:1'],
            'notes'                 => ['nullable', 'string', 'max:1000'],
        ]);

        $poNumber = PoProposal::generatePoNumber();

        $payload = [
            'po_number'             => $poNumber,
            'sku'                   => $validated['sku'],
            'product_name'          => $validated['product_name'],
            'supplier_name'         => $validated['supplier_name'] ?? null,
            'warehouse'             => $validated['warehouse'],
            'current_stock'         => $validated['current_stock'],
            'monthly_velocity'      => $validated['monthly_velocity'],
            'stock_coverage_months' => $validated['stock_coverage_months'] ?? 0,
            'recommended_qty'       => $validated['recommended_qty'],
            'proposed_qty'          => $validated['proposed_qty'],
            'status'                => PoProposal::STATUS_PENDING,
            'proposed_by'           => auth()->id(),
            'notes'                 => $validated['notes'] ?? null,
        ];

        if (Schema::hasColumn('po_proposals', 'target_months')) {
            $payload['target_months'] = $validated['target_months'] ?? 5;
        }
        if (Schema::hasColumn('po_proposals', 'target_stock')) {
            $payload['target_stock'] = $validated['target_stock'] ?? null;
        }

        PoProposal::create($payload);

        return back()->with('success', "Pengajuan PO {$poNumber} berhasil diajukan dan diteruskan ke antrean Manajemen.");
    }

    public function updateProposal(Request $request, PoProposal $poProposal): RedirectResponse
    {
        $this->authorizeProposer();

        if ($poProposal->status !== PoProposal::STATUS_PENDING) {
            return back()->with('error', 'Hanya pengajuan PO dengan status Menunggu yang dapat diubah.');
        }

        $validated = $request->validate([
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'warehouse'     => ['required', 'string', 'in:G,A'],
            'proposed_qty'  => ['required', 'integer', 'min:1'],
            'notes'         => ['nullable', 'string', 'max:1000'],
        ]);

        $poProposal->update([
            'supplier_name' => $validated['supplier_name'] ?? null,
            'warehouse'     => $validated['warehouse'],
            'proposed_qty'  => $validated['proposed_qty'],
            'notes'         => $validated['notes'] ?? null,
        ]);

        return back()->with('success', "Pengajuan PO {$poProposal->po_number} berhasil diperbarui.");
    }

    public function cancelProposal(PoProposal $poProposal): RedirectResponse
    {
        $this->authorizeProposer();

        if ($poProposal->status !== PoProposal::STATUS_PENDING) {
            return back()->with('error', 'Hanya pengajuan PO dengan status Menunggu yang dapat dibatalkan.');
        }

        $poNumber = $poProposal->po_number;
        $poProposal->delete();

        return back()->with('success', "Pengajuan PO {$poNumber} berhasil dibatalkan.");
    }

    public function approve(PoProposal $poProposal): RedirectResponse
    {
        $this->authorizeManagement();

        if ($poProposal->status !== PoProposal::STATUS_PENDING) {
            return back()->with('error', 'Hanya pengajuan dengan status Menunggu yang dapat disetujui.');
        }

        $poProposal->approveBy(auth()->user());

        return back()->with('success', "Pengajuan PO {$poProposal->po_number} berhasil disetujui oleh Manajemen.");
    }

    public function reject(Request $request, PoProposal $poProposal): RedirectResponse
    {
        $this->authorizeManagement();

        if ($poProposal->status !== PoProposal::STATUS_PENDING) {
            return back()->with('error', 'Hanya pengajuan dengan status Menunggu yang dapat ditolak.');
        }

        $validated = $request->validate([
            'rejection_reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $poProposal->rejectBy(auth()->user(), $validated['rejection_reason']);

        return back()->with('success', "Pengajuan PO {$poProposal->po_number} telah ditolak.");
    }
}
