<?php

namespace App\Http\Controllers;

use App\Http\Requests\UserRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('user.view');

        $search = $request->input('search');
        $roleId = $request->input('role_id');
        $status = $request->input('status');

        $users = User::with('role')
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->when($roleId, function ($query, $roleId) {
                $query->where('role_id', $roleId);
            })
            ->when($status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        $roles = Role::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Users/Index', [
            'users'   => $users,
            'roles'   => $roles,
            'filters' => $request->only(['search', 'role_id', 'status']),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('user.create');

        $roles = Role::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Users/Create', [
            'roles' => $roles,
        ]);
    }

    public function store(UserRequest $request): RedirectResponse
    {
        Gate::authorize('user.create');

        $data = $request->validated();
        $data['password'] = Hash::make($data['password']);

        // Email unik untuk satu tabel penuh, termasuk user yang sudah dihapus.
        // Kalau emailnya pernah dipakai, akun lamanya dipulihkan dan seluruh
        // datanya ditimpa isian baru — termasuk role dan password.
        $archived = User::onlyTrashed()->where('email', $data['email'])->first();

        if ($archived) {
            $archived->restore();
            $archived->update($data);

            return redirect()->route('users.index')
                ->with('success', 'User berhasil dibuat kembali dengan data terbaru.');
        }

        User::create($data);

        return redirect()->route('users.index')
            ->with('success', 'User berhasil dibuat.');
    }

    public function edit(User $user): Response
    {
        Gate::authorize('user.edit');

        $roles = Role::orderBy('name')->get(['id', 'name']);

        return Inertia::render('Users/Edit', [
            'user'  => $user->load('role'),
            'roles' => $roles,
        ]);
    }

    public function update(UserRequest $request, User $user): RedirectResponse
    {
        Gate::authorize('user.edit');

        $data = $request->validated();

        // Hanya update password jika diisi
        if (empty($data['password'])) {
            unset($data['password']);
        } else {
            $data['password'] = Hash::make($data['password']);
        }

        $user->update($data);

        return redirect()->route('users.index')
            ->with('success', 'User berhasil diperbarui.');
    }

    public function destroy(User $user): RedirectResponse
    {
        Gate::authorize('user.delete');

        // Cegah hapus diri sendiri
        if ($user->id === auth()->id()) {
            return back()->withErrors(['error' => 'Anda tidak dapat menghapus akun Anda sendiri.']);
        }

        // Cegah sistem kehilangan seluruh akses: minimal satu Super Admin harus tersisa.
        if ($user->role?->name === 'Super Admin' && User::whereHas('role', fn($q) => $q->where('name', 'Super Admin'))->count() <= 1) {
            return back()->withErrors(['error' => 'Super Admin terakhir tidak dapat dihapus.']);
        }

        // Soft delete: baris user tetap ada agar dokumen lama (PO, SO, invoice)
        // tidak kehilangan referensi created_by / approved_by-nya.
        $user->delete();

        return redirect()->route('users.index')
            ->with('success', "User {$user->name} berhasil dihapus.");
    }
}
