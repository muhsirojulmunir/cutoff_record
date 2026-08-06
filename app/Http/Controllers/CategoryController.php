<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Http\Requests\CategoryRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('category.view');

        $search = $request->input('search');
        $status = $request->input('status');

        $categories = Category::query()
            ->when($search, function ($query, $search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('name')
            ->paginate(10)
            ->withQueryString();

        return Inertia::render('Categories/Index', [
            'categories' => $categories,
            'filters'    => $request->only(['search', 'status']),
        ]);
    }

    public function store(CategoryRequest $request): RedirectResponse
    {
        Gate::authorize('category.create');

        Category::create($request->validated());

        return redirect()->route('categories.index')
            ->with('success', 'Kategori berhasil dibuat.');
    }

    public function update(CategoryRequest $request, Category $category): RedirectResponse
    {
        Gate::authorize('category.edit');

        $category->update($request->validated());

        return redirect()->route('categories.index')
            ->with('success', 'Kategori berhasil diperbarui.');
    }

    public function destroy(Category $category): RedirectResponse
    {
        Gate::authorize('category.delete');

        $activeProducts = $category->products()->count();

        if ($activeProducts > 0) {
            return back()->withErrors([
                'error' => "Kategori tidak dapat dihapus karena masih dipakai oleh {$activeProducts} produk aktif. "
                    . 'Pindahkan produk tersebut ke kategori lain terlebih dahulu.',
            ]);
        }

        // Nama kategori unik untuk satu tabel penuh. Lepas namanya agar nama
        // yang sama bisa dipakai lagi setelah kategori ini diarsipkan.
        $category->update([
            'name' => mb_substr('ARSIP-' . $category->id . '-' . $category->name, 0, 255),
        ]);

        $category->delete();

        return redirect()->route('categories.index')
            ->with('success', 'Kategori berhasil dihapus.');
    }
}
