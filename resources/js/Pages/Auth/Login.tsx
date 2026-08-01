import { useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

export default function Login() {
  const { data, setData, post, processing, errors } = useForm({
    email: '',
    password: '',
    remember: false,
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    post('/login');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 border-r border-slate-800 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl translate-x-1/4 translate-y-1/4 pointer-events-none" />

        {/* Wordmark */}
        <div className="flex items-center gap-3 relative z-10">
          <span className="font-bold text-lg text-white tracking-tight">Sistem ERP</span>
        </div>

        {/* Hero content */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-white leading-tight">
              Sistem ERP<br />
              <span className="bg-gradient-to-r from-violet-400 to-indigo-300 bg-clip-text text-transparent">
                Internal Perusahaan
              </span>
            </h1>
            <p className="text-slate-400 text-base max-w-sm leading-relaxed">
              Kelola operasional bisnis dari satu platform—sales, purchasing, keuangan, dan marketplace terintegrasi.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {[
              'Sales Order & Purchase Order',
              'Invoice dan Pembayaran',
              'Piutang Pabrik',
              'Integrasi Shopee & TikTok Shop',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-2.5 h-2.5 text-violet-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <span className="text-sm text-slate-300">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-xs relative z-10">Untuk penggunaan internal.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile wordmark */}
          <div className="flex lg:hidden items-center gap-3 mb-2">
            <span className="font-bold text-white text-base">Sistem ERP</span>
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl font-bold text-white">Masuk ke akun Anda</h2>
            <p className="text-slate-400 text-sm mt-1.5">Masukkan email dan password yang terdaftar.</p>
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={data.email}
                onChange={(e) => setData('email', e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-100 text-sm placeholder-slate-600
                  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                  ${errors.email ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                placeholder="anda@perusahaan.com"
                disabled={processing}
              />
              {errors.email && (
                <p className="text-rose-400 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={data.password}
                onChange={(e) => setData('password', e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-100 text-sm placeholder-slate-600
                  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                  ${errors.password ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                placeholder="••••••••"
                disabled={processing}
              />
              {errors.password && (
                <p className="text-rose-400 text-xs mt-1">{errors.password}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2.5">
              <input
                id="remember"
                type="checkbox"
                checked={data.remember}
                onChange={(e) => setData('remember', e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-slate-950 cursor-pointer"
                disabled={processing}
              />
              <label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer select-none">
                Ingat sesi saya
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={processing}
              className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700
                text-white font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-violet-900/40"
            >
              {processing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sedang masuk...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          <p className="text-xs text-slate-600 text-center">
            Sistem ini hanya untuk penggunaan internal. Hubungi admin jika lupa password.
          </p>
        </div>
      </div>
    </div>
  );
}
