import React from 'react';
import { Head, Link, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  category: Category;
  brand: string | null;
  color: string | null;
  is_box: boolean;
  dimension_label: string | null;
  status: 'active' | 'inactive';
  description: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    name: string;
  } | null;
}

interface ShowProps {
  product: Product;
}

export default function Show({ product }: ShowProps) {
  const { auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];
  const canEdit = permissions.includes('product.edit');

  return (
    <AppLayout>
      <Head title={`Detail Produk - ${product.sku}`} />

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 truncate">Detail Produk — {product.sku}</h1>
            <p className="text-gray-500 text-xs mt-0.5 truncate" title={product.name}>
              {product.name}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/products"
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
            >
              Kembali
            </Link>
            {canEdit && (
              <Link
                href={`/products/${product.id}/edit`}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-teal-200/40"
              >
                Edit Produk
              </Link>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Stock Keeping Unit (SKU)</span>
              <p className="text-sm font-mono font-bold text-teal-400">{product.sku}</p>
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nama Produk</span>
              <p className="text-sm font-semibold text-gray-800 break-words leading-snug">{product.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kategori</span>
              <p className="text-sm font-semibold text-gray-800">{product.category?.name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Brand / Merek</span>
              <p className="text-sm text-gray-700">{product.brand ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Jenis Produk</span>
              <p className="text-sm text-gray-700">{product.is_box ? 'Kardus' : 'Umum'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Ukuran {product.is_box ? '(P × L × T)' : '(P × L)'}
              </span>
              <p className="text-sm font-mono text-gray-700">{product.dimension_label ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Warna (Color)</span>
              <p className="text-sm text-gray-700">{product.color ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</span>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                    ${product.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${product.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {product.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dibuat Oleh</span>
              <p className="text-xs text-gray-700 pt-1">{product.creator?.name ?? 'Sistem'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-300/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Terakhir Diperbarui</span>
              <p className="text-xs text-gray-500 pt-1">{new Date(product.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Deskripsi</span>
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{product.description ?? 'Tidak ada deskripsi.'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
