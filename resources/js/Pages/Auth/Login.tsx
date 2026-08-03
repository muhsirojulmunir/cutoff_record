import { useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';

const FEATURES = [
  'Sales Order & Purchase Order',
  'Invoice & Pembayaran Otomatis',
  'Piutang & Kas Terkontrol',
  'Integrasi Shopee & TikTok Shop',
];

const ICON_BUILDING =
  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21';

export default function Login() {
  const { data, setData, post, processing, errors } = useForm({
    email: '',
    password: '',
    remember: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    post('/login', {
      onSuccess: () => {
        // Dipakai AppLayout untuk memainkan animasi masuk aplikasi sekali saja.
        sessionStorage.setItem('erp:welcome', '1');
      },
      onError: () => setLeaving(false),
    });

    setLeaving(true);
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Panel kiri — branding */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-5/12 flex-col justify-between p-12 xl:p-14 bg-gradient-to-br from-teal-950 via-teal-900 to-cyan-900 relative overflow-hidden">
        {/* Ornamen latar */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-400/10 rounded-full blur-3xl translate-x-1/4 translate-y-1/4 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-teal-400/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        {/* Wordmark */}
        <div className="flex items-center gap-3 relative z-10 anim-fade-down">
          <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-teal-200">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_BUILDING} />
            </svg>
          </div>
          <span className="font-bold text-lg text-white tracking-tight">Sistem ERP</span>
        </div>

        {/* Hero */}
        <div className="relative z-10 space-y-9">
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-[2.75rem] font-black text-white leading-[1.15] anim-fade-up anim-d1">
              Kelola Bisnis<br />
              <span className="bg-gradient-to-r from-teal-300 to-cyan-200 bg-clip-text text-transparent">
                Lebih Cerdas
              </span>
            </h1>
            <p className="text-teal-200/80 text-sm max-w-sm leading-relaxed anim-fade-up anim-d2">
              Satu platform terintegrasi untuk sales, purchasing, keuangan, dan marketplace. Efisien dari ujung ke ujung.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map((feat, i) => (
              <div key={feat} className={`flex items-center gap-3 anim-slide-left anim-d${i + 3}`}>
                <div className="h-5 w-5 rounded-full bg-teal-400/20 border border-teal-400/30 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-2.5 h-2.5 text-teal-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <span className="text-sm text-teal-100/90">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-teal-400/50 text-xs relative z-10 anim-fade-in anim-d6">
          Hanya untuk penggunaan internal perusahaan.
        </p>
      </div>

      {/* Panel kanan — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          {/* Wordmark mobile */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8 anim-fade-down">
            <div className="h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_BUILDING} />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-base tracking-tight">Sistem ERP</span>
          </div>

          {/* Judul */}
          <div className="mb-8 anim-fade-up anim-d1">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Selamat Datang</h2>
            <p className="text-gray-500 text-sm mt-1.5">Masuk ke akun Anda untuk melanjutkan.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5 anim-fade-up anim-d2">
              <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={data.email}
                onChange={(e) => setData('email', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl bg-gray-50 border text-gray-900 text-sm placeholder-gray-400
                  focus:outline-none focus:ring-4 focus:ring-teal-500/15 focus:border-teal-500 focus:bg-white transition-all duration-150
                  ${errors.email ? 'border-rose-300 focus:ring-rose-500/15 focus:border-rose-400' : 'border-gray-200 hover:border-gray-300'}`}
                placeholder="anda@perusahaan.com"
                disabled={processing}
              />
              {errors.email && <FieldError message={errors.email} />}
            </div>

            {/* Password */}
            <div className="space-y-1.5 anim-fade-up anim-d3">
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  className={`w-full pl-4 pr-11 py-3 rounded-xl bg-gray-50 border text-gray-900 text-sm placeholder-gray-400
                    focus:outline-none focus:ring-4 focus:ring-teal-500/15 focus:border-teal-500 focus:bg-white transition-all duration-150
                    ${errors.password ? 'border-rose-300 focus:ring-rose-500/15 focus:border-rose-400' : 'border-gray-200 hover:border-gray-300'}`}
                  placeholder="••••••••"
                  disabled={processing}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <FieldError message={errors.password} />}
            </div>

            {/* Ingat sesi */}
            <div className="flex items-center gap-2.5 anim-fade-up anim-d4">
              <input
                id="remember"
                type="checkbox"
                checked={data.remember}
                onChange={(e) => setData('remember', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 bg-white text-teal-600 focus:ring-teal-500 cursor-pointer"
                disabled={processing}
              />
              <label htmlFor="remember" className="text-sm text-gray-500 cursor-pointer select-none">
                Ingat sesi saya
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={processing}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500
                text-white font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2
                disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-teal-600/20 hover:shadow-teal-500/30
                active:scale-[0.99] anim-fade-up anim-d5"
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
                <>
                  Masuk ke Sistem
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-8 leading-relaxed anim-fade-in anim-d6">
            Sistem ini hanya untuk penggunaan internal.<br />
            Hubungi admin jika lupa password.
          </p>
        </div>
      </div>

      {/* Tirai transisi menuju dashboard */}
      {leaving && (
        <div className="login-curtain fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-teal-950 via-teal-900 to-cyan-900">
          <div className="relative flex items-center justify-center">
            <span className="login-curtain-ring absolute h-16 w-16 rounded-full border border-teal-300/50" />
            <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-teal-200">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_BUILDING} />
              </svg>
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-white font-semibold tracking-tight">Menyiapkan ruang kerja Anda</p>
            <p className="text-teal-300/60 text-xs">Memuat data & hak akses...</p>
          </div>

          <div className="h-1 w-44 rounded-full bg-white/10 overflow-hidden">
            <div className="login-curtain-bar h-full w-1/2 rounded-full bg-gradient-to-r from-teal-400 to-cyan-300" />
          </div>
        </div>
      )}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="text-rose-500 text-xs flex items-center gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      {message}
    </p>
  );
}
