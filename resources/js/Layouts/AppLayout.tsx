import { Link, router, usePage } from '@inertiajs/react';
import { ReactNode, useLayoutEffect, useRef, useState } from 'react';

import NotificationBell from '../Components/NotificationBell';
import { PageProps } from '../Types';

/** Key sessionStorage untuk menyimpan posisi scroll sidebar antar navigasi Inertia. */
const SIDEBAR_SCROLL_KEY = 'erp.sidebar.scrollTop';

interface NavItem {
  label: string;
  href: string;
  permission?: string;
  soon?: boolean;
  icon: string;
  /** Match child routes (e.g. /sales-orders/123 highlights Sales Order) */
  matchPrefix?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: '',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        permission: 'dashboard.view',
        icon: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
      },
    ],
  },
  {
    title: 'Operasional',
    items: [
      {
        label: 'Sales Order',
        href: '/sales-orders',
        permission: 'sales_order.view',
        matchPrefix: true,
        icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
      },
      {
        label: 'PO',
        href: '/purchase-orders',
        permission: 'purchase_order.view',
        matchPrefix: true,
        icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z',
      },
    ],
  },
  {
    title: 'Master Data Pembelian',
    items: [
      {
        label: 'Supplier / Pabrik',
        href: '/suppliers',
        permission: 'supplier.view',
        matchPrefix: true,
        icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
      },
      {
        label: 'Kategori',
        href: '/categories',
        permission: 'category.view',
        icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.5 1.5 0 002.122 0l4.318-4.318a1.5 1.5 0 000-2.122L10.159 3.659A2.25 2.25 0 009.568 3z',
      },
      {
        label: 'Produk',
        href: '/products',
        permission: 'product.view',
        matchPrefix: true,
        icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
      },
      {
        label: 'Gudang',
        href: '/warehouses',
        permission: 'warehouse.view',
        matchPrefix: true,
        icon: 'M8.25 21h8.25M17.25 21v-3.75c0-1.242-1.008-2.25-2.25-2.25h-3c-1.242 0-2.25 1.008-2.25 2.25V21m11.25 0h.75a.75.75 0 00.75-.75V8.877c0-.527-.209-1.034-.582-1.408l-6-6A1.5 1.5 0 0012 1h-1.5A1.5 1.5 0 009 2.5v.75m-6 3h18',
      },
      {
        label: 'Invoice Pabrik',
        href: '/factory-invoices',
        permission: 'factory_receivable.view',
        matchPrefix: true,
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      },
      {
        label: 'Piutang Pabrik',
        href: '/factory-receivables',
        permission: 'factory_receivable.view',
        matchPrefix: true,
        icon: 'M12 6v12m-3-2.818l.879.879c1.003 1.003 2.63 1.003 3.633 0L14 15m-1.879-8.919l-.621.621c-1.129 1.129-1.129 2.96 0 4.089l.879.879',
      },
    ],
  },
  {
    title: 'Master Data Penjualan',
    items: [
      {
        label: 'Customer',
        href: '/customers',
        permission: 'customer.view',
        matchPrefix: true,
        icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
      },
      {
        label: 'Kategori',
        href: '/categories',
        permission: 'category.view',
        icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.5 1.5 0 002.122 0l4.318-4.318a1.5 1.5 0 000-2.122L10.159 3.659A2.25 2.25 0 009.568 3z',
      },
      {
        label: 'Produk',
        href: '/products',
        permission: 'product.view',
        matchPrefix: true,
        icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
      },
      {
        label: 'HPP Produk',
        href: '/product-hpp',
        permission: 'hpp.view',
        matchPrefix: true,
        icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
      },
      {
        label: 'Invoice Tripaq',
        href: '/invoices',
        permission: 'invoice.view',
        matchPrefix: true,
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      },
    ],
  },
  {
    title: 'Integrasi Marketplace',
    items: [
      {
        label: 'Akun Marketplace',
        href: '/marketplace/accounts',
        permission: 'marketplace.view',
        matchPrefix: true,
        icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z',
      },
      {
        label: 'Order Marketplace',
        href: '/marketplace/orders',
        permission: 'marketplace.order.view',
        matchPrefix: true,
        icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
      },
      {
        label: 'Mapping Produk',
        href: '/marketplace/mappings',
        permission: 'marketplace.manage',
        matchPrefix: true,
        icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
      },
      {
        label: 'Log Sync',
        href: '/marketplace/sync-logs',
        permission: 'marketplace.sync',
        matchPrefix: true,
        icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
      },
    ],
  },
  {
    title: 'Membuat Invoice',
    items: [
      {
        label: 'Invoice Penjualan',
        href: '/invoices',
        permission: 'invoice.view',
        matchPrefix: true,
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      },
      {
        label: 'Invoice Pabrik',
        href: '/factory-invoices',
        permission: 'factory_receivable.view',
        matchPrefix: true,
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      },
    ],
  },
  {
    title: 'Form Payment',
    items: [
      {
        label: 'Payment',
        href: '/payments',
        permission: 'payment.view',
        matchPrefix: true,
        icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5',
      },
      {
        label: 'Piutang Customer',
        href: '/piutang-customer',
        permission: 'invoice.view',
        matchPrefix: true,
        icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        label: 'Petty Cash',
        href: '/petty-cash',
        permission: 'petty_cash.view',
        matchPrefix: true,
        icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6m18 0V6M3 6v-.75A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25V6',
      },
      {
        label: 'Pengisian Dana',
        href: '/fund-allocations',
        permission: 'fund_allocation.view',
        matchPrefix: true,
        icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        label: 'Rekening',
        href: '/cash-bank/accounts',
        permission: 'cash_bank.view',
        matchPrefix: true,
        icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
      },
      {
        label: 'Ledger Transaksi',
        href: '/cash-bank/transactions',
        permission: 'cash_transaction.view',
        matchPrefix: true,
        icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801-1.206a2.25 2.25 0 00-3.302 0m3.302 0a2.247 2.247 0 011.85 1.197M1.5 10.125C1.5 8.953 2.453 8 3.625 8h10.75c1.172 0 2.125.953 2.125 2.125v7.75c0 1.172-.953 2.125-2.125 2.125H3.625A2.125 2.125 0 011.5 17.875v-7.75z',
      },
    ],
  },
  {
    title: 'Inventori & Analitik',
    items: [
      {
        label: 'All Stock',
        href: '/all-stock',
        permission: 'stock.view',
        icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
      },
      {
        label: 'HPP Report',
        href: '/reports/hpp',
        permission: 'reports.purchase.view',
        icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125v12.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125z',
      },
      {
        label: 'Sales Summary',
        href: '/reports/sales-summary',
        permission: 'reports.sales.view',
        icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125v12.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125z',
      },
      {
        label: 'Cek Produk Hero & Slow',
        href: '/reports/product-velocity',
        permission: 'reports.sales.view',
        icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6.75v6.75',
      },
    ],
  },
  {
    title: 'Laporan Center',
    items: [
      {
        label: 'Barang Masuk',
        href: '/barang-masuk',
        permission: 'stock.view',
        matchPrefix: true,
        icon: 'M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75M3 3h18',
      },
      {
        label: 'Adjustment Stok',
        href: '/adjustment-stok',
        permission: 'stock.adjustment.manage',
        matchPrefix: true,
        icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
      },
      {
        label: 'Gudang — Pengiriman',
        href: '/gudang/pengiriman',
        permission: 'stock.view',
        matchPrefix: true,
        icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h.375c.621 0 1.125-.504 1.125-1.125V11.25c0-.621-.504-1.125-1.125-1.125h-1.5M14.25 5.25v9.75m0 0h-6',
      },
      {
        label: 'Inventory Ledger',
        href: '/stock-movements',
        permission: 'stock.view',
        icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801-1.206a2.25 2.25 0 00-3.302 0m3.302 0a2.247 2.247 0 011.85 1.197M1.5 10.125C1.5 8.953 2.453 8 3.625 8h10.75c1.172 0 2.125.953 2.125 2.125v7.75c0 1.172-.953 2.125-2.125 2.125H3.625A2.125 2.125 0 011.5 17.875v-7.75z',
      },
      {
        label: 'Retur Stok',
        href: '/stock-returns',
        permission: 'stock_return.view',
        matchPrefix: true,
        icon: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
      },
      {
        label: 'Laporan Penjualan',
        href: '/reports/sales',
        permission: 'reports.sales.view',
        icon: 'M2.25 18L9 11.25l4.306 4.307a.5.5 0 00.71 0l7.184-7.184M19 8.25H21.75V11',
      },
      {
        label: 'Laporan Pembelian',
        href: '/reports/purchase',
        permission: 'reports.purchase.view',
        icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
      },
      {
        label: 'Laporan Inventory',
        href: '/reports/inventory',
        permission: 'reports.inventory.view',
        icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
      },
      {
        label: 'Laporan Keuangan',
        href: '/reports/financial',
        permission: 'reports.financial.view',
        icon: 'M12 6v12m-3-2.818l.879.879c1.003 1.003 2.63 1.003 3.633 0L14 15m-1.879-8.919l-.621.621c-1.129 1.129-1.129 2.96 0 4.089l.879.879M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
      {
        label: 'Laporan Marketplace',
        href: '/reports/marketplace',
        permission: 'reports.marketplace.view',
        icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z',
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
  const [currentPath] = useState(window.location.pathname);
  const navRef = useRef<HTMLElement>(null);

  /**
   * Flag diset saat login berhasil. Animasi masuk aplikasi (sidebar + topbar)
   * hanya diputar sekali, navigasi berikutnya cukup animasi konten.
   */
  const [justLoggedIn] = useState(() => {
    if (sessionStorage.getItem('erp:welcome') !== '1') return false;
    sessionStorage.removeItem('erp:welcome');
    return true;
  });

  /**
   * AppLayout di-mount ulang setiap navigasi Inertia, sehingga scroll sidebar
   * kembali ke atas. Restore sebelum paint agar tidak terlihat "melompat".
   */
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
    <div className="h-screen overflow-hidden bg-gray-50 text-gray-900 flex font-sans">
      {/* Sidebar — scroll independen dari konten halaman */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-[70px]'} ${justLoggedIn ? 'anim-slide-left' : ''} h-full bg-teal-950 border-r border-teal-800/50 transition-[width] duration-200 ease-in-out flex flex-col z-20 shrink-0`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-teal-800/50 shrink-0 overflow-hidden">
          <span className="font-bold text-base text-white whitespace-nowrap truncate tracking-tight">
            {sidebarOpen ? 'SISTEM ERP' : 'ERP'}
          </span>
        </div>

        {/* Nav */}
        <nav ref={navRef} className="flex-1 min-h-0 py-4 overflow-y-auto overflow-x-hidden space-y-5 px-2 sidebar-scroll">
          {navSections.map((section) => {
            const visible = section.items.filter(canSee);
            if (visible.length === 0) return null;

            return (
              <div key={section.title || 'dashboard'}>
                {section.title && sidebarOpen && (
                  <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-teal-400/50">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visible.map((item) => {
                    const isActive = isNavActive(currentPath, item);
                    return (
                      <Link
                        key={`${section.title}-${item.href}-${item.label}`}
                        href={item.href}
                        title={!sidebarOpen ? item.label : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-100 group
                          ${isActive
                            ? 'bg-white/15 text-white border border-white/20'
                            : 'text-teal-200/70 hover:text-white hover:bg-teal-800/40 border border-transparent'
                          }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor"
                          className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-teal-400/60 group-hover:text-teal-200'} transition-colors`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {sidebarOpen && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {sidebarOpen && item.soon && (
                          <span className="ml-auto text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-600 border border-slate-700/50 shrink-0">
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

        {/* User profile */}
        <div className="shrink-0 border-t border-teal-800/50 p-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-full bg-teal-800/60 border border-teal-700/40 flex items-center justify-center shrink-0 text-sm font-bold text-teal-200">
              {initials}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.name ?? '—'}</p>
                <p className="text-xs text-teal-300/50 truncate">{user?.role?.name ?? 'No Role'}</p>
              </div>
            )}
            {sidebarOpen && (
              <button
                onClick={handleLogout}
                title="Keluar"
                className="shrink-0 p-1.5 rounded-lg text-teal-400/60 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Topbar */}
        <header className={`${justLoggedIn ? 'anim-fade-down anim-d1' : ''} h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-10`}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all border border-gray-200 hover:border-gray-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Topbar right */}
          <div className="flex items-center gap-3">
            <NotificationBell queue={queue} />
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {user?.role?.name ?? 'No Role'}
            </span>
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 hover:text-rose-500 transition-colors px-2 py-1"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-h-0 p-6 sm:p-8 overflow-y-auto sidebar-scroll">
          <div key={currentPath} className={justLoggedIn ? 'anim-zoom-in anim-d2' : 'page-enter'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
