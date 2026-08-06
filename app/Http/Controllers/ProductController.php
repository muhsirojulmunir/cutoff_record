<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Category;
use App\Http\Requests\ProductRequest;
use App\Services\ProductImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('product.view');

        $search = $request->input('search');

        $products = Product::query()
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('sku', 'like', "%{$search}%");
                });
            })
            ->orderBy('sku')
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($p) => [
                'id'        => $p->id,
                'sku'       => $p->sku,
                'name'      => $p->name,
                'photo_url' => $p->photo_url ?? null,
            ]);

        return Inertia::render('Products/Index', [
            'products' => $products,
            'categories' => [],
            'filters'  => $request->only(['search']),
        ]);
    }

    /**
     * Dipakai layar pratinjau impor: menandai SKU mana yang sudah ada,
     * supaya admin tahu baris mana yang menambah dan mana yang memperbarui.
     */
    public function checkSkus(Request $request): JsonResponse
    {
        Gate::authorize('product.create');

        $validated = $request->validate([
            'skus'   => ['required', 'array', 'max:5000'],
            'skus.*' => ['nullable', 'string', 'max:100'],
        ]);

        $skus = collect($validated['skus'])->filter()->values();

        $existing = Product::withTrashed()
            ->whereIn('sku', $skus)
            ->pluck('sku');

        return response()->json(['existing' => $existing]);
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

    /**
     * Foto produk disimpan menggunakan PHP native move() untuk menghindari
     * ketergantungan pada finfo (league/mime-type-detection) yang tidak tersedia
     * di beberapa shared hosting.
     *
     * Jika remove_photo=1 dikirim tanpa file baru → foto lama dihapus, photo_path jadi null.
     */
    private function withPhoto(array $data, Request $request, ?Product $product = null): array
    {
        unset($data['photo']);

        $removePhoto = $request->input('remove_photo') === '1';

        // Kasus: hapus foto tanpa upload foto baru
        if ($removePhoto && ! $request->hasFile('photo')) {
            if ($product?->photo_path) {
                $oldPath = storage_path('app/public/' . $product->photo_path);
                if (file_exists($oldPath)) {
                    @unlink($oldPath);
                }
            }
            $data['photo_path'] = null;
            return $data;
        }

        if (! $request->hasFile('photo')) {
            return $data;
        }

        $file = $request->file('photo');

        // Validasi ekstensi manual (tanpa finfo / MIME detection)
        $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        $ext = strtolower($file->getClientOriginalExtension());

        if (! in_array($ext, $allowedExtensions)) {
            return $data;
        }

        // Validasi ukuran maks 2MB
        if ($file->getSize() > 2097152) {
            return $data;
        }

        // Hapus foto lama menggunakan PHP native (bypass Flysystem/finfo)
        if ($product?->photo_path) {
            $oldPath = storage_path('app/public/' . $product->photo_path);
            if (file_exists($oldPath)) {
                @unlink($oldPath);
            }
        }

        // Simpan file dengan PHP native move() — ZERO finfo dependency
        $destDir = storage_path('app/public/produk');
        if (! is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }

        $filename = uniqid('foto_') . '_' . time() . '.' . $ext;
        $file->move($destDir, $filename);

        $data['photo_path'] = 'produk/' . $filename;

        return $data;
    }


    public function store(ProductRequest $request): RedirectResponse
    {
        Gate::authorize('product.create');

        $data = $this->withPhoto($request->validated(), $request);
        $data['created_by'] = Auth::id();

        // SKU unik untuk satu tabel penuh, termasuk produk yang sudah dihapus.
        // Kalau SKU-nya pernah dipakai, produk lamanya dipulihkan dan diisi
        // data baru — jadi input ulang tidak pernah kena error duplikat.
        $archived = Product::onlyTrashed()->where('sku', $data['sku'])->first();

        if ($archived) {
            $archived->restore();
            $archived->update($data);

            return redirect()->route('products.index')
                ->with('success', 'Produk berhasil ditambahkan kembali dengan data terbaru.');
        }

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

        return Inertia::render('Products/Edit', [
            'product' => $product->only(['id', 'sku', 'name', 'photo_url']),
        ]);
    }

    public function update(ProductRequest $request, Product $product): RedirectResponse
    {
        Gate::authorize('product.edit');

        $product->update($this->withPhoto($request->validated(), $request, $product));

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

    /**
     * Hapus beberapa produk sekaligus. Sengaja dibatasi Super Admin karena
     * cakupannya luas dan tidak bisa dibatalkan dari layar produk.
     */
    public function bulkDestroy(Request $request): RedirectResponse
    {
        Gate::authorize('product.delete');

        abort_unless(
            Auth::user()?->isSuperAdmin(),
            403,
            'Hapus massal produk hanya dapat dilakukan oleh Super Admin.'
        );

        $validated = $request->validate([
            'ids'   => ['required', 'array', 'min:1', 'max:1000'],
            'ids.*' => ['integer', 'exists:products,id'],
        ], [], [
            'ids' => 'produk yang dipilih',
        ]);

        $deleted = Product::whereIn('id', $validated['ids'])->get()
            ->each(fn (Product $product) => $product->delete())
            ->count();

        return redirect()->route('products.index')
            ->with('success', "{$deleted} produk berhasil dihapus.");
    }
}
