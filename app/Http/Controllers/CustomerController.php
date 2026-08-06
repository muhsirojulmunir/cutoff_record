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

        // Otomatis rapikan seluruh kode customer agar selalu berurutan dari CUST-01
        $this->renumberCustomerCodes();

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
            ->orderBy('id')
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
     * Otomatis merapikan penomoran kode seluruh customer yang ada di database
     * agar selalu berurutan murni: CUST-01, CUST-02, CUST-03, dst.
     */
    private function renumberCustomerCodes(): void
    {
        $customers = Customer::orderBy('id')->get();
        if ($customers->isEmpty()) {
            return;
        }

        // Tahap 1: Rename sementara agar tidak bentrok dengan unique constraint
        foreach ($customers as $customer) {
            $customer->update(['customer_code' => 'TEMP-' . $customer->id]);
        }

        // Tahap 2: Urutkan murni dari CUST-01
        foreach ($customers as $index => $customer) {
            $code = 'CUST-' . str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT);
            $customer->update(['customer_code' => $code]);
        }
    }

    /**
     * Kode customer unik untuk satu tabel penuh, jadi nomor urut berikutnya
     * dicari sampai benar-benar belum terpakai.
     */
    private function generateCustomerCode(): string
    {
        $sequence = Customer::count() + 1;

        while (Customer::withTrashed()->where('customer_code', $this->formatCustomerCode($sequence))->exists()) {
            $sequence++;
        }

        return $this->formatCustomerCode($sequence);
    }

    private function formatCustomerCode(int $sequence): string
    {
        return 'CUST-' . str_pad((string) $sequence, 2, '0', STR_PAD_LEFT);
    }

    public function store(CustomerRequest $request): RedirectResponse
    {
        Gate::authorize('customer.create');

        $data = $request->validated();
        
        $data['customer_code'] = $this->generateCustomerCode();
        $data['created_by'] = Auth::id();

        Customer::create($data);

        // Rapikan kembali agar urutan dijamin berurutan murni dari CUST-01
        $this->renumberCustomerCodes();

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

        // Kode dilepas dulu supaya nomor urutnya bisa dipakai lagi oleh customer
        // aktif saat penomoran dirapikan — tanpa ini penomoran ulang bentrok
        // dengan kode milik customer yang sudah diarsipkan.
        $customer->update([
            'customer_code' => mb_substr('ARSIP-' . $customer->id . '-' . $customer->customer_code, 0, 255),
        ]);

        $customer->delete();

        // Rapikan kembali agar urutan dijamin berurutan murni setelah ada data yang dihapus
        $this->renumberCustomerCodes();

        return redirect()->route('customers.index')
            ->with('success', 'Customer berhasil dihapus.');
    }
}
