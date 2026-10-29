import { useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';

const FEATURES = [
  'Autentikasi Aman & Role-Based Access Control',
  'Manajemen Pengguna & Hak Akses Fleksibel',
  'Arsitektur Cepat berbasis Laravel & Inertia React',
  'Fondasi Bersih Siap Dikembangkan',
];

export default function Login() {
  const { data, setData, post, processing, errors } = useForm({
    username: '',
    password: '',
    remember: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    post('/login', {
      onSuccess: () => {
        sessionStorage.setItem('app:welcome', '1');
      },
      onError: () => setLeaving(false),
    });

    setLeaving(true);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Panel kiri — Deep Navy Branding (#0B132B) */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-5/12 flex-col justify-center p-12 xl:p-14 bg-gradient-to-br from-[#070D1E] via-[#0B132B] to-[#132043] relative overflow-hidden text-white shadow-2xl">
        {/* Ornamen latar Navy Glow */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl translate-x-1/4 translate-y-1/4 pointer-events-none" />

        {/* Hero content */}
        <div className="relative z-10 space-y-9">
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-[2.65rem] font-black text-white leading-[1.2] tracking-tight anim-fade-up anim-d1">
              Platform Sistem<br />
              <span className="bg-gradient-to-r from-blue-200 via-sky-200 to-white bg-clip-text text-transparent">
                Cepat & Terstruktur
              </span>
            </h1>
            <p className="text-slate-300 text-sm max-w-sm leading-relaxed anim-fade-up anim-d2">
              Sistem kerja terintegrasi dengan performa tinggi, keamanan peran berjenjang, dan antarmuka modern bernuansa navy.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map((feat, i) => (
              <div key={feat} className={`flex items-center gap-3 anim-slide-left anim-d${i + 3}`}>
                <div className="h-5 w-5 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-2.5 h-2.5 text-blue-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <span className="text-sm text-slate-200 font-medium">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-400 text-xs absolute bottom-10 left-12 xl:left-14 z-10 anim-fade-in anim-d6">
          Sistem internal terproteksi &bull; Hak Cipta dilindungi.
        </p>
      </div>

      {/* Panel kanan — Form Putih Bersih dengan Aksen Biru Navy */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-[400px]">

          {/* Heading */}
          <div className="mb-8 anim-fade-up anim-d1">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Selamat Datang</h2>
            <p className="text-slate-500 text-sm mt-1">Masuk dengan kredensial akun Anda.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* Username */}
            <div className="space-y-1.5 anim-fade-up anim-d2">
              <label htmlFor="username" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={data.username}
                onChange={(e) => setData('username', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl bg-slate-50 border text-slate-900 text-sm placeholder-slate-400
                  focus:outline-none focus:ring-4 focus:ring-blue-900/10 focus:border-[#0B132B] focus:bg-white transition-all duration-150
                  ${errors.username ? 'border-rose-400 focus:ring-rose-500/15 focus:border-rose-500' : 'border-slate-200 hover:border-slate-300'}`}
                placeholder="superadmin"
                disabled={processing}
              />
              {errors.username && <FieldError message={errors.username} />}
            </div>

            {/* Password */}
            <div className="space-y-1.5 anim-fade-up anim-d3">
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  className={`w-full pl-4 pr-11 py-3 rounded-xl bg-slate-50 border text-slate-900 text-sm placeholder-slate-400
                    focus:outline-none focus:ring-4 focus:ring-blue-900/10 focus:border-[#0B132B] focus:bg-white transition-all duration-150
                    ${errors.password ? 'border-rose-400 focus:ring-rose-500/15 focus:border-rose-500' : 'border-slate-200 hover:border-slate-300'}`}
                  placeholder="••••••••"
                  disabled={processing}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <FieldError message={errors.password} />}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2.5 anim-fade-up anim-d4">
              <input
                id="remember"
                type="checkbox"
                checked={data.remember}
                onChange={(e) => setData('remember', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 bg-white text-[#0B132B] focus:ring-[#0B132B] cursor-pointer"
                disabled={processing}
              />
              <label htmlFor="remember" className="text-sm text-slate-600 cursor-pointer select-none">
                Ingat sesi saya
              </label>
            </div>

            {/* Submit Button (Deep Navy Blue #0B132B) */}
            <button
              type="submit"
              disabled={processing}
              className="w-full py-3 px-4 rounded-xl bg-[#0B132B] hover:bg-[#15234E] text-white font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-black/20 active:scale-[0.99] anim-fade-up anim-d5"
            >
              {processing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sedang memproses...
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
        
        </div>
      </div>

      {/* Curtain Transition (Navy) */}
      {leaving && (
        <div className="login-curtain fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-[#070D1E] via-[#0B132B] to-[#132043]">
          <div className="relative flex items-center justify-center">
            <span className="login-curtain-ring absolute h-16 w-16 rounded-full border border-blue-400/40" />
            <div className="h-16 w-16 rounded-2xl bg-[#1C2D5A] border border-blue-400/40 flex items-center justify-center shadow-lg shadow-black/50">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-blue-200">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-white font-semibold tracking-tight text-base">Menyiapkan Ruang Kerja Anda</p>
            <p className="text-blue-200/70 text-xs">Memuat data akun & sesi...</p>
          </div>

          <div className="h-1 w-48 rounded-full bg-slate-800 overflow-hidden">
            <div className="login-curtain-bar h-full w-1/2 rounded-full bg-blue-400" />
          </div>
        </div>
      )}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="text-rose-500 text-xs flex items-center gap-1 font-medium">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      {message}
    </p>
  );
}
