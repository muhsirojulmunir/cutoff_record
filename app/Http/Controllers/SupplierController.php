<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use App\Http\Requests\SupplierRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('supplier.view');

        $search = $request->input('search');
        $status = $request->input('status');

        $suppliers = Supplier::query()
            ->with('bankAccounts')
            ->when($search, function ($query, $search) {
                $query->where(function($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('supplier_code', 'like', "%{$search}%")
                      ->orWhere('contact_person', 'like', "%{$search}%")
                      ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('supplier_code')
            ->paginate(10)
            ->withQueryString();

        return Inertia::render('Suppliers/Index', [
            'suppliers' => $suppliers,
            'filters'   => $request->only(['search', 'status']),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('supplier.create');

        return Inertia::render('Suppliers/Create');
    }

    public function store(SupplierRequest $request): RedirectResponse
    {
        Gate::authorize('supplier.create');

        $data = $request->validated();
        $bankAccounts = $data['bank_accounts'] ?? [];
        unset($data['bank_accounts']);

        // Generate Supplier Code (e.g. SUP-000001)
        $lastSupplier = Supplier::withTrashed()->orderBy('id', 'desc')->first();
        $nextNumber = $lastSupplier ? ((int) str_replace('SUP-', '', $lastSupplier->supplier_code)) + 1 : 1;
        $data['supplier_code'] = 'SUP-' . str_pad($nextNumber, 6, '0', STR_PAD_LEFT);
        $data['created_by'] = Auth::id();

        DB::transaction(function () use ($data, $bankAccounts) {
            $supplier = Supplier::create($data);
            $supplier->bankAccounts()->createMany($bankAccounts);
        });

        return redirect()->route('suppliers.index')
            ->with('success', 'Supplier berhasil ditambahkan.');
    }

    public function show(Supplier $supplier): Response
    {
        Gate::authorize('supplier.view');

        $supplier->load('creator', 'bankAccounts');

        return Inertia::render('Suppliers/Show', [
            'supplier' => $supplier,
        ]);
    }

    public function edit(Supplier $supplier): Response
    {
        Gate::authorize('supplier.edit');

        $supplier->load('bankAccounts');

        return Inertia::render('Suppliers/Edit', [
            'supplier' => $supplier,
        ]);
    }

    public function update(SupplierRequest $request, Supplier $supplier): RedirectResponse
    {
        Gate::authorize('supplier.edit');

        $data = $request->validated();
        $bankAccounts = $data['bank_accounts'] ?? [];
        unset($data['bank_accounts']);

        DB::transaction(function () use ($supplier, $data, $bankAccounts) {
            $supplier->update($data);

            // Rekening ditulis ulang mengikuti isi form.
            $supplier->bankAccounts()->delete();
            $supplier->bankAccounts()->createMany($bankAccounts);
        });

        return redirect()->route('suppliers.index')
            ->with('success', 'Supplier berhasil diperbarui.');
    }

    public function destroy(Supplier $supplier): RedirectResponse
    {
        Gate::authorize('supplier.delete');

        $supplier->delete();

        return redirect()->route('suppliers.index')
            ->with('success', 'Supplier berhasil dihapus (soft delete).');
    }
}
