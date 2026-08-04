<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductHpp;
use App\Services\ProductHppImportService;
use App\Services\Reports\ProductPricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Master HPP produk — hanya untuk Finance & Leader.
 * Admin mengisi data produk, angka modalnya diisi di sini.
 */
class ProductHppController extends Controller
{
    public function __construct(private readonly ProductPricingService $pricing) {}

    public function index(Request $request): Response
    {
        Gate::authorize('hpp.view');

        $products = Product::query()
            ->with(['category:id,name', 'hpp.updater:id,name'])
            ->leftJoinSub($this->pricing->costSubquery(), 'po_costs', 'po_costs.product_id', '=', 'products.id')
            ->select('products.*', DB::raw('COALESCE(po_costs.avg_cost, 0) as po_average_cost'))
            ->when($request->input('search'), function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('products.name', 'like', "%{$search}%")
                      ->orWhere('products.sku', 'like', "%{$search}%");
                });
            })
            ->when($request->input('category_id'), fn ($query, $categoryId) => $query->where('products.category_id', $categoryId))
            ->when($request->input('filled') === 'no', fn ($query) => $query->whereDoesntHave('hpp'))
            ->when($request->input('filled') === 'yes', fn ($query) => $query->whereHas('hpp'))
            ->orderBy('products.name')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('ProductHpp/Index', [
            'products'   => $products,
            'categories' => Category::orderBy('name')->get(['id', 'name']),
            'filters'    => $request->only(['search', 'category_id', 'filled']),
            'canManage'  => Gate::allows('hpp.manage'),
        ]);
    }

    /**
     * Daftar produk untuk isi template Excel — sudah terisi SKU, nama, dan
     * HPP berjalan, jadi Finance tinggal mengetik angkanya.
     */
    public function template(): JsonResponse
    {
        Gate::authorize('hpp.manage');

        $products = Product::query()
            ->with('category:id,name')
            ->leftJoinSub($this->pricing->costSubquery(), 'po_costs', 'po_costs.product_id', '=', 'products.id')
            ->leftJoin('product_hpps', 'product_hpps.product_id', '=', 'products.id')
            ->select(
                'products.id',
                'products.sku',
                'products.name',
                'products.category_id',
                DB::raw('COALESCE(po_costs.avg_cost, 0) as po_average_cost'),
                DB::raw('product_hpps.hpp as current_hpp'),
                DB::raw('product_hpps.effective_date as effective_date'),
            )
            ->orderBy('products.name')
            ->get()
            ->map(fn ($product) => [
                'sku'             => $product->sku,
                'name'            => $product->name,
                'category'        => $product->category?->name,
                'po_average_cost' => round((float) $product->po_average_cost, 2),
                'current_hpp'     => $product->current_hpp !== null ? (float) $product->current_hpp : null,
                'effective_date'  => $product->effective_date
                    ? \Carbon\CarbonImmutable::parse($product->effective_date)->format('Y-m-d')
                    : null,
            ]);

        return response()->json(['products' => $products]);
    }

    /**
     * Impor HPP massal dari template Excel yang sudah diisi.
     */
    public function import(Request $request, ProductHppImportService $importService): RedirectResponse
    {
        Gate::authorize('hpp.manage');

        $validated = $request->validate([
            'rows'   => ['required', 'array', 'min:1', 'max:5000'],
            'rows.*' => ['array'],
        ], [
            'rows.required' => 'File Excel tidak berisi baris HPP yang bisa diimpor.',
            'rows.max'      => 'Maksimal 5.000 baris per unggahan.',
        ]);

        $result = $importService->import($validated['rows'], Auth::id());

        $summary = "Impor HPP selesai: {$result['created']} produk baru diisi, {$result['updated']} diperbarui";

        if ($result['failed'] > 0) {
            $details = collect($result['errors'])
                ->map(fn ($error) => "Baris {$error['row']} ({$error['sku']}): {$error['message']}")
                ->implode(' • ');

            return back()
                ->with('success', "{$summary}, {$result['failed']} baris gagal.")
                ->with('error', $details);
        }

        return back()->with('success', "{$summary}.");
    }

    /**
     * Simpan HPP satu produk. Nilai lama ditimpa karena yang dipakai sistem
     * adalah HPP berjalan.
     */
    public function store(Request $request, Product $product): RedirectResponse
    {
        Gate::authorize('hpp.manage');

        $validated = $request->validate([
            'hpp'            => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'effective_date' => ['required', 'date'],
            'notes'          => ['nullable', 'string', 'max:500'],
        ], [], [
            'hpp'            => 'HPP',
            'effective_date' => 'Tanggal berlaku',
            'notes'          => 'Catatan',
        ]);

        ProductHpp::updateOrCreate(
            ['product_id' => $product->id],
            $validated + ['updated_by' => Auth::id()],
        );

        return back()->with('success', "HPP {$product->name} berhasil disimpan.");
    }
}
