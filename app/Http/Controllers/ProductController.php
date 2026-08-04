<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Category;
use App\Http\Requests\ProductRequest;
use App\Services\ProductImportService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('product.view');

        $search = $request->input('search');
        $categoryId = $request->input('category_id');
        $status = $request->input('status');

        $products = Product::query()
            ->with('category')
            ->when($search, function ($query, $search) {
                $query->where(function($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('sku', 'like', "%{$search}%")
                      ->orWhere('brand', 'like', "%{$search}%");
                });
            })
            ->when($categoryId, function ($query, $categoryId) {
                $query->where('category_id', $categoryId);
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('sku')
            ->paginate(10)
            ->withQueryString();

        $categories = Category::where('status', 'active')->orderBy('name')->get(['id', 'name']);

        return Inertia::render('Products/Index', [
            'products'   => $products,
            'categories' => $categories,
            'filters'    => $request->only(['search', 'category_id', 'status']),
        ]);
    }

    /**
     * Impor produk massal dari template Excel yang sudah diisi admin.
     * Barisnya dikirim frontend dalam bentuk JSON hasil pembacaan SheetJS.
     */
    public function import(Request $request, ProductImportService $importService): RedirectResponse
    {
        Gate::authorize('product.create');

        $validated = $request->validate([
            'rows'   => ['required', 'array', 'min:1', 'max:2000'],
            'rows.*' => ['array'],
        ], [
            'rows.required' => 'File Excel tidak berisi baris data yang bisa diimpor.',
            'rows.max'      => 'Maksimal 2.000 baris per unggahan. Pecah file menjadi beberapa bagian.',
        ]);

        $result = $importService->import($validated['rows'], Auth::id());

        $createdStr = "{$result['created']} produk baru ditambahkan";
        $updatedStr = "{$result['updated']} produk diperbarui";
        $summary = "Berhasil mengimpor: {$createdStr} dan {$updatedStr}";

        if ($result['failed'] > 0) {
            $details = collect($result['errors'])
                ->map(fn ($error) => "Baris {$error['row']} (SKU: {$error['sku']}): {$error['message']}")
                ->implode(' • ');

            return redirect()->route('products.index')
                ->with('error', "Impor Gagal Total (0 data disimpan)! Terdapat {$result['failed']} baris bermasalah dalam file Excel Anda • {$details}");
        }

        return redirect()->route('products.index')->with('success', "{$summary}.");
    }

    public function create(): Response
    {
        Gate::authorize('product.create');

        $categories = Category::where('status', 'active')->orderBy('name')->get(['id', 'name']);

        return Inertia::render('Products/Create', [
            'categories' => $categories,
        ]);
    }

    public function store(ProductRequest $request): RedirectResponse
    {
        Gate::authorize('product.create');

        $data = $request->validated();
        $data['created_by'] = Auth::id();

        Product::create($data);

        return redirect()->route('products.index')
            ->with('success', 'Produk berhasil ditambahkan.');
    }

    public function show(Product $product): Response
    {
        Gate::authorize('product.view');

        $product->load(['category', 'creator']);

        return Inertia::render('Products/Show', [
            'product' => $product,
        ]);
    }

    public function edit(Product $product): Response
    {
        Gate::authorize('product.edit');

        $categories = Category::where('status', 'active')->orderBy('name')->get(['id', 'name']);

        return Inertia::render('Products/Edit', [
            'product'    => $product,
            'categories' => $categories,
        ]);
    }

    public function update(ProductRequest $request, Product $product): RedirectResponse
    {
        Gate::authorize('product.edit');

        $product->update($request->validated());

        return redirect()->route('products.index')
            ->with('success', 'Produk berhasil diperbarui.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        Gate::authorize('product.delete');

        $product->delete();

        return redirect()->route('products.index')
            ->with('success', 'Produk berhasil dihapus.');
    }
}
