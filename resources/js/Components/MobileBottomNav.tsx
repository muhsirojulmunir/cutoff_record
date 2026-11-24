import { Link, router, usePage } from '@inertiajs/react';
import React from 'react';
import { PageProps } from '../Types';

interface Props {
  onQuickReportClick?: () => void;
  unreadChatCount?: number;
}

export default function MobileBottomNav({ onQuickReportClick, unreadChatCount = 0 }: Props) {
  const { url } = usePage<PageProps>();
  const currentPath = (url ? url.split('?')[0] : '') || window.location.pathname;

  const isDashboardActive = currentPath === '/dashboard';
  const isReportsActive = currentPath === '/content-reports' || currentPath.startsWith('/content-reports/');
  const isCsActive = currentPath === '/customer-service' || currentPath.startsWith('/customer-service/');

  function handleLogout() {
    if (confirm('Apakah Anda yakin ingin keluar dari akun?')) {
      router.post('/logout');
    }
  }

  return (
    <nav
      aria-label="Navigasi Bawah Khusus Tim Kreatif"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(11,19,43,0.08)] px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around relative">
        {/* 1. Beranda / Dashboard */}
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-150 ${
            isDashboardActive
              ? 'text-[#0B132B] font-bold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors ${
              isDashboardActive ? 'bg-[#0B132B]/10 text-[#0B132B]' : ''
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill={isDashboardActive ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Beranda</span>
        </Link>

        {/* 2. Report Konten */}
        <Link
          href="/content-reports"
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-150 ${
            isReportsActive
              ? 'text-[#0B132B] font-bold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition-colors ${
              isReportsActive ? 'bg-[#0B132B]/10 text-[#0B132B]' : ''
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill={isReportsActive ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
              />
            </svg>
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Report</span>
        </Link>

        {/* 3. Tombol Tengah Aksi Cepat (+ Buat Konten) */}
        <div className="flex-1 flex justify-center -mt-5">
          {onQuickReportClick ? (
            <button
              type="button"
              onClick={onQuickReportClick}
              title="Kirim Laporan Konten Baru"
              className="h-12 w-12 rounded-full bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] text-white flex items-center justify-center shadow-[0_6px_20px_rgba(11,19,43,0.35)] ring-4 ring-white active:scale-95 transition-transform cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          ) : (
            <Link
              href="/content-reports?create=1"
              title="Kirim Laporan Konten Baru"
              className="h-12 w-12 rounded-full bg-gradient-to-r from-[#0B132B] to-[#1E3A8A] text-white flex items-center justify-center shadow-[0_6px_20px_rgba(11,19,43,0.35)] ring-4 ring-white active:scale-95 transition-transform cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </Link>
          )}
        </div>

        {/* 4. Customer Service */}
        <Link
          href="/customer-service"
          className={`flex flex-col items-center justify-center flex-1 py-1 relative transition-all duration-150 ${
            isCsActive
              ? 'text-[#0B132B] font-bold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div
            className={`p-1 rounded-xl relative transition-colors ${
              isCsActive ? 'bg-[#0B132B]/10 text-[#0B132B]' : ''
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill={isCsActive ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.965 4.966 4.966 0 00.73-1.879C3.642 16.586 3 14.412 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EE4D2D] px-1 text-[9px] font-bold text-white ring-1 ring-white">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">CS Chat</span>
        </Link>

        {/* 5. Keluar Akun */}
        <button
          type="button"
          onClick={handleLogout}
          title="Keluar dari Akun"
          className="flex flex-col items-center justify-center flex-1 py-1 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <div className="p-1 rounded-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5 text-slate-500 hover:text-rose-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Keluar</span>
        </button>
      </div>
    </nav>
  );
}
