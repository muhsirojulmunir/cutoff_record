import { Link, router, usePage } from '@inertiajs/react';
import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

import NotificationBell from '../Components/NotificationBell';
import { PageProps } from '../Types';

/** Key sessionStorage untuk menyimpan posisi scroll sidebar antar navigasi Inertia. */
const SIDEBAR_SCROLL_KEY = 'app.sidebar.scrollTop';

interface NavItem {
  label: string;
  href: string;
  permission?: string;
  soon?: boolean;
  icon: string;
  matchPrefix?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Menu Utama',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        permission: 'dashboard.view',
        icon: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
      },
      {
        label: 'Pesanan Cut Off',
        href: '/cut-off-orders',
        matchPrefix: true,
        icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
      },
    ],
  },
  {
    title: 'Pengaturan',
    items: [
      {
        label: 'User Management',
        href: '/users',
        permission: 'user.view',
        matchPrefix: true,
        icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
      },
      {
        label: 'Role & Permission',
        href: '/roles',
        permission: 'role.view',
        icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
      },
      {
        label: 'Integrasi Shopee',
        href: '/marketplace/shopee',
        permission: 'user.view',
        matchPrefix: true,
        icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h5.25m-5.25 0v-7.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21',
      },
    ],
  },
];

interface Props {
  children: ReactNode;
}

function isNavActive(currentPath: string, item: NavItem): boolean {
  if (item.matchPrefix && item.href !== '/dashboard') {
    return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
  }
  return currentPath === item.href;
}

export default function AppLayout({ children }: Props) {
  const { auth, workQueue } = usePage<PageProps>().props;
  const user = auth.user;
  const queue = workQueue ?? { items: [], total: 0, critical: 0 };
  const permissions = user?.permissions ?? [];

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuSearch, setMenuSearch] = useState('');
  const [currentPath] = useState(window.location.pathname);
  const navRef = useRef<HTMLElement>(null);

  const [justLoggedIn] = useState(() => {
    if (sessionStorage.getItem('app:welcome') !== '1') return false;
    sessionStorage.removeItem('app:welcome');
    return true;
  });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) ?? 0);
    if (saved > 0) nav.scrollTop = saved;

    const handleScroll = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop));
    };

    nav.addEventListener('scroll', handleScroll, { passive: true });
    return () => nav.removeEventListener('scroll', handleScroll);
  }, []);

  function canSee(item: NavItem): boolean {
    if (!item.permission) return true;
    return permissions.includes(item.permission);
  }

  const filteredSections = useMemo(() => {
    const keyword = menuSearch.trim().toLowerCase();

    return navSections
      .map((section) => {
        const visible = section.items.filter(canSee);
        if (keyword === '') return { ...section, items: visible };

        return {
          ...section,
          items: visible.filter((item) => item.label.toLowerCase().includes(keyword)),
        };
      })
      .filter((section) => section.items.length > 0);
  }, [menuSearch, permissions]);

  const noMenuFound = menuSearch.trim() !== '' && filteredSections.length === 0;

  function handleLogout() {
    router.post('/logout');
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex font-sans">
      {/* Sidebar (Deep Navy Blue #0f172a) */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-[72px]'} ${justLoggedIn ? 'anim-slide-left' : ''} h-full bg-[#0B132B] border-r border-slate-800 transition-[width] duration-200 ease-in-out flex flex-col z-20 shrink-0 shadow-lg`}
      >
        {/* Logo Branding */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-800/80 shrink-0 overflow-hidden">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          {sidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm text-white tracking-wide uppercase truncate">
                Koding App
              </span>
              <span className="text-[10px] text-blue-300/70 uppercase tracking-wider font-semibold">
                Control Panel
              </span>
            </div>
          )}
        </div>

        {/* Pencarian menu */}
        {sidebarOpen && (
          <div className="px-3 pt-3 shrink-0">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Cari menu..."
                autoComplete="off"
                className="w-full pl-8 pr-8 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {menuSearch !== '' && (
                <button
                  type="button"
                  onClick={() => setMenuSearch('')}
                  title="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nav list */}
        <nav ref={navRef} className="flex-1 min-h-0 py-4 overflow-y-auto overflow-x-hidden space-y-5 px-3 sidebar-scroll">
          {noMenuFound && (
            <p className="px-3 text-xs text-slate-400">
              Menu "{menuSearch}" tidak ditemukan.
            </p>
          )}

          {filteredSections.map((section) => {
            const visible = section.items;

            return (
              <div key={section.title || 'main'}>
                {section.title && sidebarOpen && (
                  <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </p>
                )}
                <div className="space-y-1">
                  {visible.map((item) => {
                    const isActive = isNavActive(currentPath, item);
                    return (
                      <Link
                        key={`${section.title}-${item.href}-${item.label}`}
                        href={item.href}
                        title={!sidebarOpen ? item.label : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group
                          ${isActive
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                          }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                          className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-300'} transition-colors`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {sidebarOpen && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {sidebarOpen && item.soon && (
                          <span className="ml-auto text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                            Soon
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User profile (Bottom sidebar) */}
        <div className="shrink-0 border-t border-slate-800/90 p-3 bg-slate-900/40">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-blue-900/60 border border-blue-700/50 flex items-center justify-center shrink-0 text-xs font-bold text-blue-200">
              {initials}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.name ?? '—'}</p>
                <p className="text-xs text-blue-300/70 truncate">{user?.role?.name ?? 'User'}</p>
              </div>
            )}
            {sidebarOpen && (
              <button
                onClick={handleLogout}
                title="Keluar"
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content container */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Topbar (Crisp White + subtle border) */}
        <header className={`${justLoggedIn ? 'anim-fade-down anim-d1' : ''} h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-xs`}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl text-slate-600 hover:text-blue-900 hover:bg-slate-100 transition-all border border-slate-200"
            title={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Topbar right items */}
          <div className="flex items-center gap-3">
            <NotificationBell queue={queue} />
            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />
            <span className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {user?.role?.name ?? 'User'}
            </span>
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 p-6 sm:p-8 overflow-y-auto sidebar-scroll bg-slate-50">
          <div key={currentPath} className={justLoggedIn ? 'anim-zoom-in anim-d2' : 'page-enter'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
