<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateFactoryReceivableRequest;
use App\Models\FactoryReceivable;
use App\Models\StockMovement;
use App\Services\FactoryReceivableService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Exception;

class FactoryReceivableController extends Controller
{
    protected FactoryReceivableService $receivableService;

    public function __construct(FactoryReceivableService $receivableService)
    {
        $this->receivableService = $receivableService;
    }

    /**
     * Display a listing of factory receivables.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('factory_receivable.view');

        $search = $request->input('search');
        $status = $request->input('status');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');
        $dueStartDate = $request->input('due_start_date');
        $dueEndDate = $request->input('due_end_date');

        // Automatically update overdue status on view for accuracy
        $unpaidOrOverdue = FactoryReceivable::whereIn('status', ['unpaid', 'overdue'])->get();
        foreach ($unpaidOrOverdue as $fr) {
            $this->receivableService->markAsOverdue($fr);
        }

        $factoryReceivables = FactoryReceivable::with(['supplier', 'purchaseOrder', 'warehouse', 'creator'])
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('receivable_number', 'like', "%{$search}%")
                      ->orWhereHas('supplier', function ($subQ) use ($search) {
                          $subQ->where('name', 'like', "%{$search}%");
                      })
                      ->orWhereHas('purchaseOrder', function ($subQ) use ($search) {
                          $subQ->where('po_number', 'like', "%{$search}%");
                      });
                });
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->when($startDate, function ($query, $startDate) {
                $query->whereDate('transaction_date', '>=', $startDate);
            })
            ->when($endDate, function ($query, $endDate) {
                $query->whereDate('transaction_date', '<=', $endDate);
            })
            ->when($dueStartDate, function ($query, $dueStartDate) {
                $query->whereDate('due_date', '>=', $dueStartDate);
            })
            ->when($dueEndDate, function ($query, $dueEndDate) {
                $query->whereDate('due_date', '<=', $dueEndDate);
            })
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('FactoryReceivables/Index', [
            'factoryReceivables' => $factoryReceivables,
            'filters'            => $request->only(['search', 'status', 'start_date', 'end_date', 'due_start_date', 'due_end_date']),
        ]);
    }

    /**
     * Display the specified factory receivable.
     */
    public function show(FactoryReceivable $factoryReceivable): Response
    {
        Gate::authorize('factory_receivable.view');

        $factoryReceivable->load(['supplier', 'purchaseOrder.items.product', 'warehouse', 'creator']);

        // Load related stock movements for PO traceability
        $stockMovements = StockMovement::where('reference_type', 'purchase_order')
            ->where('reference_id', $factoryReceivable->purchase_order_id)
            ->with(['product', 'warehouse'])
            ->get();

        return Inertia::render('FactoryReceivables/Show', [
            'factoryReceivable' => $factoryReceivable,
            'stockMovements'    => $stockMovements,
        ]);
    }

    /**
     * Show the form for editing the specified factory receivable.
     */
    public function edit(FactoryReceivable $factoryReceivable): Response
    {
        Gate::authorize('factory_receivable.edit');

        if ($factoryReceivable->status === 'cancelled') {
            abort(403, 'Piutang Pabrik yang sudah dibatalkan tidak dapat diubah.');
        }

        $factoryReceivable->load(['supplier', 'purchaseOrder']);

        return Inertia::render('FactoryReceivables/Edit', [
            'factoryReceivable' => $factoryReceivable,
        ]);
    }

    /**
     * Update the specified factory receivable in storage.
     */
    public function update(UpdateFactoryReceivableRequest $request, FactoryReceivable $factoryReceivable): RedirectResponse
    {
        Gate::authorize('factory_receivable.edit');

        if ($factoryReceivable->status === 'cancelled') {
            return back()->with('error', 'Piutang Pabrik yang sudah dibatalkan tidak dapat diubah.');
        }

        try {
            $factoryReceivable->update([
                'due_date' => $request->input('due_date'),
                'notes'    => $request->input('notes'),
            ]);

            // Recalculate to ensure status is updated in case due_date changed
            $this->receivableService->recalculateBalance($factoryReceivable);

            return redirect()->route('factory-receivables.show', $factoryReceivable->id)
                ->with('success', 'Piutang Pabrik berhasil diperbarui.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        }
    }

    /**
     * Cancel the specified factory receivable.
     */
    public function cancel(FactoryReceivable $factoryReceivable): RedirectResponse
    {
        Gate::authorize('factory_receivable.cancel');

        try {
            $this->receivableService->cancel($factoryReceivable);
            return back()->with('success', 'Piutang Pabrik berhasil dibatalkan.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}
