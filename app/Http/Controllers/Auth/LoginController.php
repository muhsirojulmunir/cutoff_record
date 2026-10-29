<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class LoginController extends Controller
{
    /**
     * Show the login form.
     */
    public function showLoginForm(): Response
    {
        return Inertia::render('Auth/Login');
    }

    /**
     * Handle the incoming login request.
     */
    public function login(Request $request): RedirectResponse
    {
        $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $username = trim($request->input('username'));
        $password = $request->input('password');
        $remember = $request->boolean('remember');

        // Cek login via username (pada kolom email)
        $attempt = Auth::attempt(['email' => $username, 'password' => $password], $remember);

        if (!$attempt) {
            if (!str_contains($username, '@')) {
                $attempt = Auth::attempt(['email' => $username . '@company.com', 'password' => $password], $remember);
            } else {
                $stripped = explode('@', $username)[0];
                $attempt = Auth::attempt(['email' => $stripped, 'password' => $password], $remember);
            }
        }

        if (!$attempt) {
            return back()->withErrors([
                'username' => 'Username atau password yang Anda masukkan tidak sesuai.',
            ])->onlyInput('username');
        }

        // Block inactive accounts
        if (!Auth::user()->isActive()) {
            Auth::logout();
            return back()->withErrors([
                'username' => 'Akun Anda telah dinonaktifkan. Hubungi administrator.',
            ])->onlyInput('username');
        }

        $request->session()->regenerate();

        return redirect()->intended(route('dashboard'));
    }

    /**
     * Destroy the user's session.
     */
    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
