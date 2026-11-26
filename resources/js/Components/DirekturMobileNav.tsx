import { Link, usePage } from '@inertiajs/react';
import React from 'react';
import { PageProps } from '../Types';

interface NavTab {
  label: string;
  href: string;
  icon: string;
}

const DIREKTUR_TABS: NavTab[] = [
  {
    label: 'Cut Off',
    href: '/cut-off-orders',
    icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
  },
  {
    label: 'Retur',
    href: '/cut-off-returns',
    icon: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
  },
  {
    label: 'Rencana PO',
    href: '/stock-forecast',
    icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  },
  {
    label: 'Konten',
    href: '/content-reports',
    icon: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z',
  },
];

export default function DirekturMobileNav() {
  const { url } = usePage<PageProps>();
  const currentPath = (url ? url.split('?')[0] : '') || window.location.pathname;

  return (
    <nav
      aria-label="Navigasi Bawah Direktur"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(11,19,43,0.08)] px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around">
        {DIREKTUR_TABS.map((tab) => {
          const isActive = currentPath === tab.href || currentPath.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-150 ${
                isActive
                  ? 'text-[#0B132B] font-bold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-xl transition-colors ${
                  isActive ? 'bg-[#0B132B] text-white shadow-2xs' : ''
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.9}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
