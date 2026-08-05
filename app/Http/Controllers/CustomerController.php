<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Http\Requests\CustomerRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('customer.view');

        $search = $request->input('search');
        $status = $request->input('status');

        $customers = Customer::query()
            ->when($search, function ($query, $search) {
                $query->where(function($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('customer_code', 'like', "%{$search}%")
                      ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('customer_code')
            ->paginate(10)
            ->withQueryString();

        return Inertia::render('Customers/Index', [
            'customers' => $customers,
            'filters'   => $request->only(['search', 'status']),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('customer.create');

        return Inertia::render('Customers/Create');
    }

    /**
     * Nomor urut customer dibuat otomatis & berurutan: CUST-01, CUST-02, CUST-03, dst.
     */
    private function generateCustomerCode(): string
    {
        $lastNumber = Customer::withTrashed()
            ->pluck('customer_code')
            ->map(fn ($code) => (int) preg_replace('/\D/', '', (string) $code))
            ->max() ?? 0;

        return 'CUST-' . str_pad((string) ($lastNumber + 1), 2, '0', STR_PAD_LEFT);
    }

    public function store(CustomerRequest $request): RedirectResponse
    {
        Gate::authorize('customer.create');

        $data = $request->validated();
        
        $data['customer_code'] = $this->generateCustomerCode();
        $data['created_by'] = Auth::id();

        Customer::create($data);

        return redirect()->route('customers.index')
            ->with('success', 'Customer berhasil ditambahkan.');
    }

    public function show(Customer $customer): Response
    {
        Gate::authorize('customer.view');

        $customer->load('creator');

        return Inertia::render('Customers/Show', [
            'customer' => $customer,
        ]);
    }

    public function edit(Customer $customer): Response
    {
        Gate::authorize('customer.edit');

        return Inertia::render('Customers/Edit', [
            'customer' => $customer,
        ]);
    }

    public function update(CustomerRequest $request, Customer $customer): RedirectResponse
    {
        Gate::authorize('customer.edit');

        $customer->update($request->validated());

        return redirect()->route('customers.index')
            ->with('success', 'Customer berhasil diperbarui.');
    }

    public function destroy(Customer $customer): RedirectResponse
    {
        Gate::authorize('customer.delete');

        $customer->delete();

        return redirect()->route('customers.index')
            ->with('success', 'Customer berhasil dihapus.');
    }
}
