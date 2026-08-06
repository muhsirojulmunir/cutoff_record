// TypeScript types for the ERP application

export interface Permission {
  id: number;
  name: string;
  description?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions?: Permission[];
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  role: {
    id: number;
    name: string;
  } | null;
  roles?: string[];
  permissions: string[];
  /** Aksi tertentu — seperti hapus massal produk — khusus Super Admin. */
  is_super_admin?: boolean;
}

export type WorkQueueSeverity = 'critical' | 'warning' | 'info';

export type WorkQueueType =
  | 'purchase_order'
  | 'sales_order'
  | 'petty_cash'
  | 'invoice'
  | 'factory_receivable'
  | 'marketplace'
  | 'stock';

export interface WorkQueueItem {
  key: string;
  type: WorkQueueType;
  title: string;
  description: string;
  count: number;
  /** Nilai rupiah terkait (khusus task pembayaran), null bila tidak relevan. */
  amount: number | null;
  href: string;
  severity: WorkQueueSeverity;
}

export interface WorkQueue {
  items: WorkQueueItem[];
  total: number;
  critical: number;
}

export interface PageProps {
  auth: {
    user: AuthUser | null;
  };
  flash: {
    success?: string | null;
    error?: string | null;
  };
  workQueue: WorkQueue;
  errors?: Record<string, string>;
  [key: string]: unknown;
}
