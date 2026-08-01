<?php

namespace App\Http\Controllers;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceProductMapping;
use App\Models\Product;
use App\Services\Marketplace\MarketplaceProductMappingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class MarketplaceProductMappingController extends Controller
{
    public function __construct(private readonly MarketplaceProductMappingService $mappingService) {}

    public function index(Request $request): \Inertia\Response
    {
        Gate::authorize('marketplace.mapping.view');

        $query = MarketplaceProductMapping::with('account', 'product', 'creator')->latest();

        if ($request->filled('marketplace')) {
            $query->where('marketplace', $request->marketplace);
        }
        if ($request->filled('account_id')) {
            $query->where('marketplace_account_id', $request->account_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn ($q) => $q
                ->where('external_sku', 'like', "%{$s}%")
                ->orWhere('external_product_name', 'like', "%{$s}%")
            );
        }

        $mappings = $query->paginate(20)->withQueryString();
        $accounts = MarketplaceAccount::where('status', 'active')->get(['id', 'account_name', 'marketplace']);

        return Inertia::render('Marketplace/ProductMappings/Index', [
            'mappings'     => $mappings,
            'accounts'     => $accounts,
            'filters'      => $request->only(['marketplace', 'account_id', 'status', 'search']),
        ]);
    }

    public function create(Request $request): \Inertia\Response
    {
        Gate::authorize('marketplace.mapping.create');

        $accounts = MarketplaceAccount::where('status', 'active')->get(['id', 'account_name', 'marketplace']);
        $products = Product::where('status', 'active')->get(['id', 'sku', 'name']);

        return Inertia::render('Marketplace/ProductMappings/Create', [
            'accounts' => $accounts,
            'products' => $products,
            'preselectedAccountId' => $request->query('account_id'),
        ]);
    }

    public function store(Request $request): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.mapping.create');

        $validated = $request->validate([
            'marketplace_account_id' => 'required|exists:marketplace_accounts,id',
            'external_sku'           => 'required|string|max:255',
            'product_id'             => 'required|exists:products,id',
            'external_product_id'    => 'nullable|string|max:255',
            'external_product_name'  => 'nullable|string|max:255',
        ]);

        $account = MarketplaceAccount::findOrFail($validated['marketplace_account_id']);

        try {
            $this->mappingService->create($account, $validated, $request->user()->id);
            return redirect()->route('marketplace.mappings.index')
                ->with('success', 'Mapping produk berhasil ditambahkan.');
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['external_sku' => $e->getMessage()]);
        }
    }

    public function edit(MarketplaceProductMapping $marketplaceMapping): \Inertia\Response
    {
        Gate::authorize('marketplace.mapping.edit');

        $products = Product::where('status', 'active')->get(['id', 'sku', 'name']);

        return Inertia::render('Marketplace/ProductMappings/Edit', [
            'mapping'  => $marketplaceMapping->load('account', 'product'),
            'products' => $products,
        ]);
    }

    public function update(Request $request, MarketplaceProductMapping $marketplaceMapping): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.mapping.edit');

        $validated = $request->validate([
            'product_id'            => 'required|exists:products,id',
            'external_product_id'   => 'nullable|string|max:255',
            'external_product_name' => 'nullable|string|max:255',
            'status'                => 'required|in:active,inactive',
        ]);

        $this->mappingService->update($marketplaceMapping, $validated);

        return redirect()->route('marketplace.mappings.index')
            ->with('success', 'Mapping produk berhasil diperbarui.');
    }

    public function destroy(MarketplaceProductMapping $marketplaceMapping): \Illuminate\Http\RedirectResponse
    {
        Gate::authorize('marketplace.mapping.delete');

        $this->mappingService->delete($marketplaceMapping);

        return redirect()->route('marketplace.mappings.index')
            ->with('success', 'Mapping produk berhasil dihapus.');
    }
}
