import { Link, router, usePage } from '@inertiajs/react';
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import NotificationBell from '../Components/NotificationBell';
import SideChatDock from '../Components/CustomerService/SideChatDock';
import { PageProps } from '../Types';

/** Key sessionStorage untuk menyimpan posisi scroll sidebar antar navigasi Inertia. */
const SIDEBAR_SCROLL_KEY = 'app.sidebar.scrollTop';
/** Key localStorage untuk menyimpan state buka/tutup group dropdown sidebar. */
const SIDEBAR_GROUPS_KEY = 'app.sidebar.openGroups';

interface NavItem {
  key?: string;
  label: string;
  href?: string;
  permission?: string;
  soon?: boolean;
  icon: string;
  matchPrefix?: boolean;
  superAdminOnly?: boolean;
  children?: NavItem[];
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
        label: 'Customer Service',
        href: '/customer-service',
        matchPrefix: true,
        icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.965 4.966 4.966 0 00.73-1.879C3.642 16.586 3 14.412 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
      },
      {
        key: 'pesanan',
        label: 'Pesanan',
        icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
        children: [
          {
            label: 'Pesanan Saya',
            href: '/shopee-orders',
            matchPrefix: true,
            superAdminOnly: true,
            icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
          },
          {
            label: 'Pesanan Cut Off',
            href: '/cut-off-orders',
            matchPrefix: true,
            icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
          },
          {
            label: 'Retur Online',
            href: '/cut-off-returns',
            matchPrefix: true,
            icon: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
          },
        ],
      },
      {
        key: 'stok',
        label: 'Stok',
        icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
        children: [
          {
            label: 'Master Stok',
            href: '/master-stock',
            matchPrefix: true,
            icon: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v1.069m7.5 0c.98.058 1.95.143 2.909.255m-10.409 0A48.064 48.064 0 0112 6.75c.98 0 1.95.05 2.909.144',
          },
          {
            label: 'Stok Produk Shopee',
            href: '/shopee-products',
            matchPrefix: true,
            icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
          },
        ],
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
      {
        label: 'Integrasi TikTok',
        href: '/marketplace/tiktok',
        permission: 'user.view',
        matchPrefix: true,
        icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
      },
    ],
  },
];

interface Props {
  children: ReactNode;
  headerRight?: ReactNode;
}

function isNavActive(currentPath: string, item: NavItem): boolean {
  if (item.children && item.children.length > 0) {
    return item.children.some((child) => isNavActive(currentPath, child));
  }
  if (!item.href) return false;
  if (item.matchPrefix && item.href !== '/dashboard') {
    return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
  }
  return currentPath === item.href;
}

function readInitialOpenGroups(currentPath: string): Record<string, boolean> {
  const defaults: Record<string, boolean> = {
    pesanan: true,
    stok: true,
  };

  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      Object.keys(defaults).forEach((k) => {
        if (typeof parsed[k] === 'boolean') {
          defaults[k] = parsed[k] as boolean;
        }
      });
    }
  } catch {
    // Abaikan error localStorage pada private mode
  }

  for (const section of navSections) {
    for (const item of section.items) {
      if (item.key && item.children && isNavActive(currentPath, item)) {
        defaults[item.key] = true;
      }
    }
  }

  return defaults;
}

export default function AppLayout({ children, headerRight }: Props) {
  const { props: { auth, workQueue }, url } = usePage<PageProps>();
  const user = auth.user;
  const queue = workQueue ?? { items: [], total: 0, critical: 0 };
  const permissions = user?.permissions ?? [];
  const isSuperAdmin = Boolean(
    user?.is_super_admin ||
    user?.role?.name === 'Super Admin' ||
    user?.roles?.includes('Super Admin')
  );

  const currentPath = (url ? url.split('?')[0] : '') || window.location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuSearch, setMenuSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => readInitialOpenGroups(currentPath));
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const section of navSections) {
        for (const item of section.items) {
          if (item.key && item.children && isNavActive(currentPath, item) && !next[item.key]) {
            next[item.key] = true;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [currentPath]);

  function toggleGroup(groupKey: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [groupKey]: !prev[groupKey] };
      try {
        localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Abaikan error penyimpanan localStorage
      }
      return next;
    });
  }

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
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (!item.permission) return true;
    return permissions.includes(item.permission);
  }

  const filteredSections = useMemo(() => {
    const keyword = menuSearch.trim().toLowerCase();

    return navSections
      .map((section) => {
        const items = section.items
          .map((item) => {
            if (!canSee(item)) return null;

            if (item.children && item.children.length > 0) {
              const visibleChildren = item.children.filter(canSee);
              if (visibleChildren.length === 0) return null;

              if (keyword === '') {
                return { ...item, children: visibleChildren };
              }

              const parentMatch = item.label.toLowerCase().includes(keyword);
              const matchingChildren = parentMatch
                ? visibleChildren
                : visibleChildren.filter((child) => child.label.toLowerCase().includes(keyword));

              if (matchingChildren.length === 0) return null;

              return { ...item, children: matchingChildren };
            }

            if (keyword !== '' && !item.label.toLowerCase().includes(keyword)) {
              return null;
            }

            return item;
          })
          .filter((item): item is NavItem => item !== null);

        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [menuSearch, permissions, isSuperAdmin]);

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
      {/* Sidebar (Clean Crisp White Modern SaaS) */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-[72px]'} ${justLoggedIn ? 'anim-slide-left' : ''} h-full bg-white border-r border-slate-200 transition-[width] duration-200 ease-in-out flex flex-col z-20 shrink-0 shadow-xs`}
      >
        {/* Logo Branding */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-100 shrink-0 overflow-hidden">
          <div className="h-9 w-9 rounded-xl bg-[#0B132B] flex items-center justify-center shrink-0 shadow-xs">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          {sidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm text-slate-900 tracking-wide uppercase truncate">
                Koding App
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
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
                className="w-full pl-8 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:border-[#0B132B] focus:bg-white transition-all"
              />
              {menuSearch !== '' && (
                <button
                  type="button"
                  onClick={() => setMenuSearch('')}
                  title="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
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
                    const hasChildren = Boolean(item.children && item.children.length > 0);
                    const isActive = isNavActive(currentPath, item);

                    if (hasChildren && item.children) {
                      const groupKey = item.key ?? item.label.toLowerCase();
                      const isSearchActive = menuSearch.trim() !== '';
                      const isExpanded = isSearchActive || Boolean(openGroups[groupKey]);

                      if (!sidebarOpen) {
                        return (
                          <div key={`${section.title}-collapsed-${groupKey}`} className="space-y-1 pt-1 border-t border-slate-100 first:border-t-0 first:pt-0">
                            {item.children.map((child) => {
                              const childActive = isNavActive(currentPath, child);
                              return (
                                <Link
                                  key={`${section.title}-${child.href}-${child.label}`}
                                  href={child.href ?? '#'}
                                  title={`${item.label} — ${child.label}`}
                                  className={`flex items-center justify-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer
                                    ${childActive
                                      ? 'bg-[#0B132B] text-white shadow-xs font-semibold'
                                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                                    }`}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                                    className={`w-5 h-5 shrink-0 ${childActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'} transition-colors`}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={child.icon} />
                                  </svg>
                                </Link>
                              );
                            })}
                          </div>
                        );
                      }

                      return (
                        <div key={`${section.title}-${groupKey}`} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => toggleGroup(groupKey)}
                            aria-expanded={isExpanded}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer
                              ${isActive && !isExpanded
                                ? 'bg-[#0B132B]/10 text-[#0B132B] font-semibold'
                                : isActive
                                  ? 'text-slate-900 bg-slate-100/70 font-semibold'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                              }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                              className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#0B132B]' : 'text-slate-400 group-hover:text-slate-700'} transition-colors`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                            </svg>
                            <span className="truncate flex-1 text-left">{item.label}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>

                          {isExpanded && (
                            <div className="ml-4 pl-2.5 border-l border-slate-200 space-y-1">
                              {item.children.map((child) => {
                                const childActive = isNavActive(currentPath, child);
                                return (
                                  <Link
                                    key={`${section.title}-${child.href}-${child.label}`}
                                    href={child.href ?? '#'}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group cursor-pointer
                                      ${childActive
                                        ? 'bg-[#0B132B] text-white shadow-xs font-semibold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                                      }`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                                      className={`w-4 h-4 shrink-0 ${childActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'} transition-colors`}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d={child.icon} />
                                    </svg>
                                    <span className="truncate flex-1">{child.label}</span>
                                    {child.soon && (
                                      <span className="ml-auto text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                                        Soon
                                      </span>
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={`${section.title}-${item.href}-${item.label}`}
                        href={item.href ?? '#'}
                        title={!sidebarOpen ? item.label : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer
                          ${isActive
                            ? 'bg-[#0B132B] text-white shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                          }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                          className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'} transition-colors`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {sidebarOpen && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {sidebarOpen && item.soon && (
                          <span className="ml-auto text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
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
        <div className="shrink-0 border-t border-slate-100 p-3 bg-slate-50/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-[#0B132B] flex items-center justify-center shrink-0 text-xs font-bold text-white shadow-2xs">
              {initials}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.name ?? '—'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.role?.name ?? 'User'}</p>
              </div>
            )}
            {sidebarOpen && (
              <button
                onClick={handleLogout}
                title="Keluar"
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
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
          <div className="flex items-center gap-2.5">
            {headerRight}

            {/* Quick Trigger Side Chat Dock (Customer Service) */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-side-chat-dock'))}
              className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all border border-slate-200 cursor-pointer"
              title="Buka Chat Customer Service"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.965 4.966 4.966 0 00.73-1.879C3.642 16.586 3 14.412 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EE4D2D] px-1 text-[9px] font-bold text-white shadow-2xs">
                2
              </span>
            </button>

            <NotificationBell queue={queue} />
            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />
            <span className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {user?.role?.name ?? 'User'}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl px-3.5 py-1.5 shadow-2xs transition-all cursor-pointer"
              title="Keluar dari sistem"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
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

      {/* Omnichannel Side Chat Dock & Slide-out Drawer */}
      <SideChatDock />
    </div>
  );
}
