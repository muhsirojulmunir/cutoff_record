<?php

namespace App\Http\Controllers;

use App\Models\Warehouse;
use App\Http\Requests\WarehouseRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class WarehouseController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('warehouse.view');

        $search = $request->input('search');
        $status = $request->input('status');

        $warehouses = Warehouse::query()
            ->when($search, function ($query, $search) {
                $query->where(function($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('code', 'like', "%{$search}%")
                      ->orWhere('location', 'like', "%{$search}%");
                });
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('code')
            ->paginate(10)
            ->withQueryString();

        return Inertia::render('Warehouses/Index', [
            'warehouses' => $warehouses,
            'filters'    => $request->only(['search', 'status']),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('warehouse.create');

        return Inertia::render('Warehouses/Create');
    }

    public function store(WarehouseRequest $request): RedirectResponse
    {
        Gate::authorize('warehouse.create');

        Warehouse::create($request->validated());

        return redirect()->route('warehouses.index')
            ->with('success', 'Gudang berhasil ditambahkan.');
    }

    public function show(Warehouse $warehouse): Response
    {
        Gate::authorize('warehouse.view');

        return Inertia::render('Warehouses/Show', [
            'warehouse' => $warehouse,
        ]);
    }

    public function edit(Warehouse $warehouse): Response
    {
        Gate::authorize('warehouse.edit');

        return Inertia::render('Warehouses/Edit', [
            'warehouse' => $warehouse,
        ]);
    }

    public function update(WarehouseRequest $request, Warehouse $warehouse): RedirectResponse
    {
        Gate::authorize('warehouse.edit');

        $warehouse->update($request->validated());

        return redirect()->route('warehouses.index')
            ->with('success', 'Gudang berhasil diperbarui.');
    }

    public function destroy(Warehouse $warehouse): RedirectResponse
    {
        Gate::authorize('warehouse.delete');

        $warehouse->delete();

        return redirect()->route('warehouses.index')
            ->with('success', 'Gudang berhasil dihapus.');
    }
}
