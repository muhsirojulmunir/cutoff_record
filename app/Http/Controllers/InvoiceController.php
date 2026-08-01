<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Models\Invoice;
use App\Models\SalesOrder;
use App\Services\InvoiceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Exception;

class InvoiceController extends Controller
{
    protected InvoiceService $invoiceService;

    public function __construct(InvoiceService $invoiceService)
    {
        $this->invoiceService = $invoiceService;
    }

    /**
     * Display a listing of invoices.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('invoice.view');

        $search = $request->input('search');
        $status = $request->input('status');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');
        $dueStartDate = $request->input('due_start_date');
        $dueEndDate = $request->input('due_end_date');

        // Automatically update overdue status on view for accuracy
        $unpaidOrOverdue = Invoice::whereIn('status', ['unpaid', 'overdue'])->get();
        foreach ($unpaidOrOverdue as $inv) {
            $this->invoiceService->markAsOverdue($inv);
        }

        $invoices = Invoice::with(['customer', 'salesOrder', 'creator'])
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('invoice_number', 'like', "%{$search}%")
                      ->orWhereHas('customer', function ($subQ) use ($search) {
                          $subQ->where('name', 'like', "%{$search}%");
                      })
                      ->orWhereHas('salesOrder', function ($subQ) use ($search) {
                          $subQ->where('so_number', 'like', "%{$search}%");
                      });
                });
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->when($startDate, function ($query, $startDate) {
                $query->whereDate('invoice_date', '>=', $startDate);
            })
            ->when($endDate, function ($query, $endDate) {
                $query->whereDate('invoice_date', '<=', $endDate);
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

        return Inertia::render('Invoices/Index', [
            'invoices' => $invoices,
            'filters'  => $request->only(['search', 'status', 'start_date', 'end_date', 'due_start_date', 'due_end_date']),
        ]);
    }

    /**
     * Store a newly created invoice in storage.
     */
    public function store(StoreInvoiceRequest $request): RedirectResponse
    {
        Gate::authorize('invoice.create');

        try {
            $so = SalesOrder::findOrFail($request->input('sales_order_id'));
            
            $invoice = $this->invoiceService->createFromSalesOrder(
                $so,
                $request->input('due_date'),
                $request->input('notes'),
                auth()->id()
            );

            return redirect()->route('invoices.show', $invoice->id)
                ->with('success', 'Invoice berhasil diterbitkan.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Display the specified invoice.
     */
    public function show(Invoice $invoice): Response
    {
        Gate::authorize('invoice.view');

        $invoice->load(['customer', 'salesOrder', 'creator', 'items.product']);

        return Inertia::render('Invoices/Show', [
            'invoice' => $invoice,
        ]);
    }

    /**
     * Show print / PDF preview of the invoice.
     */
    public function printView(Invoice $invoice): Response
    {
        Gate::authorize('invoice.view');

        $invoice->load(['customer', 'salesOrder', 'creator', 'items.product']);

        return Inertia::render('Invoices/Print', [
            'invoice' => $invoice,
        ]);
    }

    /**
     * Show the form for editing the specified invoice.
     */
    public function edit(Invoice $invoice): Response
    {
        Gate::authorize('invoice.edit');

        if ($invoice->status === 'cancelled') {
            abort(403, 'Invoice yang sudah dibatalkan tidak dapat diubah.');
        }

        if ((float) $invoice->paid_amount > 0) {
            abort(403, 'Invoice yang sudah memiliki pembayaran tidak dapat diubah.');
        }

        $invoice->load(['customer', 'salesOrder']);

        return Inertia::render('Invoices/Edit', [
            'invoice' => $invoice,
        ]);
    }

    /**
     * Update the specified invoice in storage.
     */
    public function update(UpdateInvoiceRequest $request, Invoice $invoice): RedirectResponse
    {
        Gate::authorize('invoice.edit');

        if ($invoice->status === 'cancelled') {
            abort(403, 'Invoice yang sudah dibatalkan tidak dapat diubah.');
        }

        if ((float) $invoice->paid_amount > 0) {
            abort(403, 'Invoice yang sudah memiliki pembayaran tidak dapat diubah.');
        }

        try {
            $invoice->update([
                'due_date' => $request->input('due_date'),
                'notes'    => $request->input('notes'),
            ]);

            // Recalculate balance to update overdue status if due_date changed
            $this->invoiceService->recalculateBalance($invoice);

            return redirect()->route('invoices.show', $invoice->id)
                ->with('success', 'Invoice berhasil diperbarui.');
        } catch (Exception $e) {
            return back()->withErrors(['error' => $e->getMessage()])->withInput();
        }
    }

    /**
     * Cancel the specified invoice.
     */
    public function cancel(Invoice $invoice): RedirectResponse
    {
        Gate::authorize('invoice.cancel');

        try {
            $this->invoiceService->cancel($invoice);
            return back()->with('success', 'Invoice berhasil dibatalkan.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Remove invoice (Super Admin only).
     */
    public function destroy(Invoice $invoice): RedirectResponse
    {
        $user = auth()->user();
        if (!$user || !$user->isSuperAdmin()) {
            abort(403, 'Hanya Super Admin yang berhak menghapus Invoice.');
        }

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($invoice) {
                $invoice->items()->delete();
                $invoice->delete();
            });

            return redirect()->route('invoices.index')
                ->with('success', "Invoice {$invoice->invoice_number} berhasil dihapus.");
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}
