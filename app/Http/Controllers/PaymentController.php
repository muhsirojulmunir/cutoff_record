<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreInvoicePaymentRequest;
use App\Http\Requests\StoreFactoryReceivablePaymentRequest;
use App\Models\Payment;
use App\Models\Invoice;
use App\Models\FactoryReceivable;
use App\Services\PaymentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Exception;

class PaymentController extends Controller
{
    protected PaymentService $paymentService;

    public function __construct(PaymentService $paymentService)
    {
        $this->paymentService = $paymentService;
    }

    /**
     * Display a listing of payments.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('payment.view');

        $search = $request->input('search');
        $type = $request->input('type');
        $method = $request->input('method');
        $status = $request->input('status');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        $payments = Payment::with(['creator', 'allocations.invoice', 'allocations.factoryReceivable'])
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('payment_number', 'like', "%{$search}%")
                      ->orWhere('reference_number', 'like', "%{$search}%")
                      ->orWhereHas('allocations.invoice', function ($sub) use ($search) {
                          $sub->where('invoice_number', 'like', "%{$search}%");
                      })
                      ->orWhereHas('allocations.factoryReceivable', function ($sub) use ($search) {
                          $sub->where('receivable_number', 'like', "%{$search}%");
                      });
                });
            })
            ->when($type, function ($query, $type) {
                $query->where('payment_type', $type);
            })
            ->when($method, function ($query, $method) {
                $query->where('payment_method', $method);
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->when($startDate, function ($query, $startDate) {
                $query->whereDate('payment_date', '>=', $startDate);
            })
            ->when($endDate, function ($query, $endDate) {
                $query->whereDate('payment_date', '<=', $endDate);
            })
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('Payments/Index', [
            'payments' => $payments,
            'filters'  => $request->only(['search', 'type', 'method', 'status', 'start_date', 'end_date']),
        ]);
    }

    /**
     * Display the specified payment.
     */
    public function show(Payment $payment): Response
    {
        Gate::authorize('payment.view');

        $payment->load([
            'creator',
            'allocations.invoice.salesOrder.customer',
            'allocations.factoryReceivable.purchaseOrder.supplier',
            'allocations.factoryReceivable.warehouse',
        ]);

        return Inertia::render('Payments/Show', [
            'payment' => $payment,
        ]);
    }

    /**
     * Show the form to create a payment for a Customer Invoice.
     */
    public function createInvoicePayment(Invoice $invoice): Response
    {
        Gate::authorize('payment.create');

        if ($invoice->status === 'cancelled') {
            abort(403, 'Invoice yang sudah dibatalkan tidak dapat menerima pembayaran.');
        }

        if ($invoice->status === 'paid') {
            abort(403, 'Invoice yang sudah lunas tidak dapat menerima pembayaran.');
        }

        $invoice->load(['customer', 'salesOrder']);

        $cashBankAccounts = \App\Models\CashBankAccount::where('status', 'active')
            ->orderBy('account_code')
            ->get(['id', 'account_code', 'account_name', 'account_type']);

        return Inertia::render('Payments/CreateInvoicePayment', [
            'invoice'           => $invoice,
            'cashBankAccounts'  => $cashBankAccounts,
        ]);
    }

    /**
     * Store a payment for a Customer Invoice.
     */
    public function storeInvoicePayment(StoreInvoicePaymentRequest $request, Invoice $invoice): RedirectResponse
    {
        Gate::authorize('payment.create');

        try {
            $payment = $this->paymentService->createForInvoice(
                $invoice,
                $request->validated(),
                auth()->id()
            );

            return redirect()->route('invoices.show', $invoice->id)
                ->with('success', "Pembayaran {$payment->payment_number} berhasil dicatat.");
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    /**
     * Show the form to create a payment for a Factory Receivable.
     */
    public function createFactoryReceivablePayment(FactoryReceivable $factoryReceivable): Response
    {
        Gate::authorize('payment.create');

        if ($factoryReceivable->status === 'cancelled') {
            abort(403, 'Piutang Pabrik yang sudah dibatalkan tidak dapat menerima pembayaran.');
        }

        if ($factoryReceivable->status === 'paid') {
            abort(403, 'Piutang Pabrik yang sudah lunas tidak dapat menerima pembayaran.');
        }

        $factoryReceivable->load(['supplier', 'purchaseOrder']);

        $cashBankAccounts = \App\Models\CashBankAccount::where('status', 'active')
            ->orderBy('account_code')
            ->get(['id', 'account_code', 'account_name', 'account_type']);

        return Inertia::render('Payments/CreateFactoryReceivablePayment', [
            'factoryReceivable' => $factoryReceivable,
            'cashBankAccounts'  => $cashBankAccounts,
        ]);
    }

    /**
     * Store a payment for a Factory Receivable.
     */
    public function storeFactoryReceivablePayment(StoreFactoryReceivablePaymentRequest $request, FactoryReceivable $factoryReceivable): RedirectResponse
    {
        Gate::authorize('payment.create');

        try {
            $payment = $this->paymentService->createForFactoryReceivable(
                $factoryReceivable,
                $request->validated(),
                auth()->id()
            );

            return redirect()->route('factory-receivables.show', $factoryReceivable->id)
                ->with('success', "Pembayaran {$payment->payment_number} berhasil dicatat.");
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage())->withInput();
        }
    }

    /**
     * Cancel the specified payment.
     */
    public function cancel(Payment $payment): RedirectResponse
    {
        Gate::authorize('payment.cancel');

        try {
            $this->paymentService->cancelPayment($payment);
            return back()->with('success', 'Pembayaran berhasil dibatalkan.');
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }

    /**
     * Remove payment (Super Admin only).
     */
    public function destroy(Payment $payment): RedirectResponse
    {
        $user = auth()->user();
        if (!$user || !$user->isSuperAdmin()) {
            abort(403, 'Hanya Super Admin yang berhak menghapus data Payment.');
        }

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($payment) {
                // Delete allocations first
                $payment->allocations()->delete();
                $payment->delete();
            });

            return redirect()->route('payments.index')
                ->with('success', "Payment {$payment->payment_number} berhasil dihapus.");
        } catch (Exception $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}
