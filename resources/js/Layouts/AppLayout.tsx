import { Link, router, usePage } from '@inertiajs/react';
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import NotificationBell from '../Components/NotificationBell';
import SideChatDock from '../Components/CustomerService/SideChatDock';
import MobileBottomNav from '../Components/MobileBottomNav';
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
  adminOrSuperAdminOnly?: boolean;
  customCheck?: (user: PageProps['auth']['user']) => boolean;
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
        permission: 'cs.view',
        matchPrefix: true,
        icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.965 4.966 4.966 0 00.73-1.879C3.642 16.586 3 14.412 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
      },
      {
        label: 'Report Harian Konten',
        href: '/content-reports',
        permission: 'content_reports.view',
        matchPrefix: true,
        icon: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z',
      },
      {
        label: 'Naikkan Produk',
        href: '/shopee/boost-products',
        adminOrSuperAdminOnly: true,
        matchPrefix: true,
        icon: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
      },
      {
        key: 'pesanan',
        label: 'Pesanan',
        icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
        children: [
          {
            label: 'Pesanan Shopee',
            href: '/shopee-orders',
            permission: 'orders.shopee',
            matchPrefix: true,
            icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
          },
          {
            label: 'Pesanan TikTok',
            href: '/tiktok-orders',
            permission: 'orders.tiktok',
            matchPrefix: true,
            icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
          },
          {
            label: 'Pesanan Cut Off',
            href: '/cut-off-orders',
            permission: 'orders.cutoff',
            matchPrefix: true,
            icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
          },
          {
            label: 'Retur Online',
            href: '/cut-off-returns',
            permission: 'returns.online',
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
            permission: 'stock.master',
            matchPrefix: true,
            icon: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v1.069m7.5 0c.98.058 1.95.143 2.909.255m-10.409 0A48.064 48.064 0 0112 6.75c.98 0 1.95.05 2.909.144',
          },
          {
            label: 'Stok Produk Shopee',
            href: '/shopee-products',
            permission: 'stock.shopee',
            matchPrefix: true,
            icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
          },
          {
            label: 'Stok Produk TikTok',
            href: '/tiktok-products',
            permission: 'stock.tiktok',
            matchPrefix: true,
            icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
          },
          {
            label: 'Proyeksi & Rencana PO',
            href: '/stock-forecast',
            matchPrefix: true,
            icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
            customCheck: (user) => {
              if (!user) return false;
              const roleName = user.role?.name;
              const roles = user.roles || [];
              const allowed = ['Super Admin', 'PIC', 'Direktur'];
              return (
                Boolean(user.is_super_admin) ||
                allowed.includes(roleName || '') ||
                roles.some((r) => allowed.includes(r))
              );
            },
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
        permission: 'settings.shopee',
        matchPrefix: true,
        icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h5.25m-5.25 0v-7.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21',
      },
      {
        label: 'Integrasi TikTok',
        href: '/marketplace/tiktok',
        permission: 'settings.tiktok',
        matchPrefix: true,
        icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
      },
    ],
  },
];

interface Props {
  children: ReactNode;
  headerRight?: ReactNode;
  title?: string;
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
  const isKreatif = Boolean(
    user?.role?.name === 'Kreatif' ||
    user?.roles?.includes('Kreatif')
  );

  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [csUnreadCount, setCsUnreadCount] = useState<number>(0);

  useEffect(() => {
    const handleUnread = (e: any) => {
      if (typeof e.detail === 'number') {
        setCsUnreadCount(e.detail);
      }
    };
    window.addEventListener('cs-unread-count-updated', handleUnread);
    return () => window.removeEventListener('cs-unread-count-updated', handleUnread);
  }, []);

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
    if (item.customCheck) {
      return item.customCheck(user);
    }
    if (isSuperAdmin) return true;
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOrSuperAdminOnly) {
      const userRole = (auth?.user?.role?.name || (Array.isArray(auth?.user?.roles) ? auth?.user?.roles[0] : '')) ?? '';
      const isAdmin = userRole === 'Admin' || (Array.isArray(auth?.user?.roles) && auth?.user?.roles?.includes('Admin'));
      if (!isAdmin) return false;
    }
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
  }, [menuSearch, permissions, isSuperAdmin, user]);

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
        className={`${isKreatif ? 'hidden md:flex ' : 'flex '}${sidebarOpen ? 'w-64' : 'w-[72px]'} ${justLoggedIn ? 'anim-slide-left' : ''} h-full bg-white border-r border-slate-200 transition-[width] duration-200 ease-in-out flex-col z-20 shrink-0 shadow-xs`}
      >
        {/* Logo Branding */}
        <div className={`h-16 flex items-center justify-center ${sidebarOpen ? 'px-4' : 'px-2'} border-b border-slate-100 shrink-0 overflow-hidden`}>
          {sidebarOpen ? (
            <div className="flex flex-col items-center text-center min-w-0 gap-1">
              <img
                src="/images/logo-brand.png"
                alt="Record"
                className="h-6 w-auto max-w-[175px] object-contain"
              />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold leading-none truncate">
                ERP & Operasional Sistem
              </span>
            </div>
          ) : (
            <img
              src="/images/logo-mark.png"
              alt="Record"
              className="h-8 w-8 object-contain shrink-0"
              title="Record — ERP & Operasional Sistem"
            />
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

      {/* Main content container (Reserve space for Right Rail Dock on desktop) */}
      <div className="flex-1 flex flex-col min-w-0 h-full md:mr-14">
        {/* Topbar (Crisp White + subtle border) */}
        <header className={`${justLoggedIn ? 'anim-fade-down anim-d1' : ''} h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-xs`}>
          {isKreatif ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden md:inline-flex p-2 rounded-xl text-slate-600 hover:text-blue-900 hover:bg-slate-100 transition-all border border-slate-200"
                title={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div className="flex md:hidden items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shrink-0 shadow-2xs">
                  <img
                    src="/images/logo-mark.png"
                    alt="Record"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-900 leading-tight">Tim Kreatif</span>
                  <span className="text-[10px] text-slate-500 font-medium">Record Operasional</span>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl text-slate-600 hover:text-blue-900 hover:bg-slate-100 transition-all border border-slate-200"
              title={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          )}

          {/* Topbar right items */}
          <div className="flex items-center gap-2.5">
            {headerRight}

            {/* Mobile fallback only (< md screens) */}
            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setIsChatDrawerOpen((prev) => !prev)}
                className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all border border-slate-200 cursor-pointer"
                title="Buka Chat Customer Service"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.965 4.966 4.966 0 00.73-1.879C3.642 16.586 3 14.412 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                {csUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EE4D2D] px-1 text-[9px] font-bold text-white shadow-2xs">
                    {csUnreadCount > 99 ? '99+' : csUnreadCount}
                  </span>
                )}
              </button>
              <NotificationBell queue={queue} />
            </div>

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
        <main className={`flex-1 min-h-0 p-4 sm:p-6 lg:p-8 overflow-y-auto sidebar-scroll bg-slate-50 ${isKreatif ? 'pb-24 md:pb-8' : ''}`}>
          <div key={currentPath} className={justLoggedIn ? 'anim-zoom-in anim-d2' : 'page-enter'}>
            {children}
          </div>
        </main>
      </div>

      {/* Shopee-style Right Action Rail (Persis Gambar Shopee Seller Centre) */}
      <aside className="hidden md:flex fixed top-0 right-0 bottom-0 w-14 z-40 bg-white border-l border-slate-200 flex-col items-center py-3.5 gap-4 shrink-0 select-none shadow-2xs">
        {/* 1. Profil User Avatar */}
        <div
          title={`${user?.name ?? 'User'} (${user?.role?.name ?? 'Super Admin'})`}
          className="h-9 w-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center ring-2 ring-slate-100 hover:ring-slate-300 transition-all cursor-pointer shadow-2xs"
        >
          {initials}
        </div>

        {/* 2. Notification Bell (Unchanged NotificationBell.tsx) */}
        <NotificationBell queue={queue} />

        {/* 3. Shopee-style Red Chat Bubble Button */}
        <button
          type="button"
          onClick={() => setIsChatDrawerOpen((prev) => !prev)}
          title="Chat Customer Service (Shopee & TikTok)"
          className={`relative h-9 w-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            isChatDrawerOpen
              ? 'bg-[#EE4D2D] text-white shadow-xs ring-2 ring-orange-300'
              : 'bg-[#EE4D2D] text-white hover:bg-[#d94122] shadow-2xs hover:scale-105'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4.5 w-4.5"
          >
            <path
              fillRule="evenodd"
              d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z"
              clipRule="evenodd"
            />
          </svg>
          {csUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-white shadow-2xs">
              {csUnreadCount > 99 ? '99+' : csUnreadCount}
            </span>
          )}
        </button>
      </aside>

      {/* Slide-out Drawer Panel (Positioned adjacent to Right Rail Dock on desktop) */}
      <SideChatDock isOpen={isChatDrawerOpen} onClose={() => setIsChatDrawerOpen(false)} />

      {/* Navigasi Bawah Khusus Role Kreatif di Layar HP */}
      {isKreatif && (
        <MobileBottomNav unreadChatCount={csUnreadCount} />
      )}
    </div>
  );
}
