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
  size: string | null;
  color: string | null;
  unit: string;
  purchase_price: string;
  selling_price: string;
  minimum_stock: number;
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

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{product.name}</h1>
            <p className="text-slate-400 text-xs mt-1">Master Data / Produk / Detail ({product.sku})</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/products"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-sm font-semibold transition-all"
            >
              Kembali
            </Link>
            {canEdit && (
              <Link
                href={`/products/${product.id}/edit`}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-violet-900/20"
              >
                Edit Produk
              </Link>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stock Keeping Unit (SKU)</span>
              <p className="text-sm font-mono font-bold text-violet-400">{product.sku}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nama Produk</span>
              <p className="text-sm font-semibold text-slate-200">{product.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kategori</span>
              <p className="text-sm font-semibold text-slate-200">{product.category?.name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Brand / Merek</span>
              <p className="text-sm text-slate-300">{product.brand ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Satuan</span>
              <p className="text-sm text-slate-300">{product.unit}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ukuran (Size)</span>
              <p className="text-sm text-slate-300">{product.size ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Warna (Color)</span>
              <p className="text-sm text-slate-300">{product.color ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Minimum Stok</span>
              <p className="text-sm font-mono font-bold text-amber-500">{product.minimum_stock} {product.unit}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6 p-4 rounded-xl bg-slate-900/40 border border-slate-800/60">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Harga Beli</span>
              <p className="text-sm font-semibold text-slate-300">Rp {Number(product.purchase_price).toLocaleString('id-ID')}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Harga Jual</span>
              <p className="text-base font-bold text-emerald-400">Rp {Number(product.selling_price).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">NPWP / Status</span>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                    ${product.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${product.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {product.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dibuat Oleh</span>
              <p className="text-xs text-slate-300 pt-1">{product.creator?.name ?? 'Sistem'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800/80 pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Terakhir Diperbarui</span>
              <p className="text-xs text-slate-400 pt-1">{new Date(product.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Deskripsi</span>
            <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{product.description ?? 'Tidak ada deskripsi.'}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
