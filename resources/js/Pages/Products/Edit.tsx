import React from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import CurrencyInput from '@/Components/CurrencyInput';

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  brand: string | null;
  size: string | null;
  color: string | null;
  unit: string;
  purchase_price: string;
  selling_price: string;
  minimum_stock: number;
  status: 'active' | 'inactive';
  description: string | null;
}

interface EditProps {
  product: Product;
  categories: Category[];
}

export default function Edit({ product, categories }: EditProps) {
  const { data, setData, put, processing, errors } = useForm({
    sku: product.sku,
    name: product.name,
    category_id: product.category_id,
    brand: product.brand ?? '',
    size: product.size ?? '',
    color: product.color ?? '',
    unit: product.unit,
    purchase_price: String(Number(product.purchase_price)),
    selling_price: String(Number(product.selling_price)),
    minimum_stock: String(product.minimum_stock),
    status: product.status,
    description: product.description ?? '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    put(`/products/${product.id}`);
  }

  return (
    <AppLayout>
      <Head title="Edit Produk" />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Edit Produk: {product.sku}</h1>
          <p className="text-slate-400 text-xs mt-1">Master Data / Produk / Edit</p>
        </div>

        {/* Form Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* SKU */}
              <div className="space-y-1.5">
                <label htmlFor="sku" className="block text-sm font-semibold text-slate-300">
                  Stock Keeping Unit (SKU) <span className="text-violet-400">*</span>
                </label>
                <input
                  id="sku"
                  type="text"
                  value={data.sku}
                  onChange={(e) => setData('sku', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.sku ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                  disabled={processing}
                />
                {errors.sku && <p className="text-rose-400 text-xs mt-1">{errors.sku}</p>}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-semibold text-slate-300">
                  Nama Produk <span className="text-violet-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={data.name}
                  onChange={(e) => setData('name', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.name ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                  disabled={processing}
                />
                {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-1.5">
                <label htmlFor="category_id" className="block text-sm font-semibold text-slate-300">
                  Kategori <span className="text-violet-400">*</span>
                </label>
                <select
                  id="category_id"
                  value={data.category_id}
                  onChange={(e) => setData('category_id', Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                  disabled={processing}
                >
                  <option value="">Pilih Kategori</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {errors.category_id && <p className="text-rose-400 text-xs mt-1">{errors.category_id}</p>}
              </div>

              {/* Brand */}
              <div className="space-y-1.5">
                <label htmlFor="brand" className="block text-sm font-semibold text-slate-300">
                  Brand / Merek
                </label>
                <input
                  id="brand"
                  type="text"
                  value={data.brand}
                  onChange={(e) => setData('brand', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.brand && <p className="text-rose-400 text-xs mt-1">{errors.brand}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Size */}
              <div className="space-y-1.5">
                <label htmlFor="size" className="block text-sm font-semibold text-slate-300">
                  Ukuran (Size)
                </label>
                <input
                  id="size"
                  type="text"
                  value={data.size}
                  onChange={(e) => setData('size', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
              </div>

              {/* Color */}
              <div className="space-y-1.5">
                <label htmlFor="color" className="block text-sm font-semibold text-slate-300">
                  Warna (Color)
                </label>
                <input
                  id="color"
                  type="text"
                  value={data.color}
                  onChange={(e) => setData('color', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
              </div>

              {/* Unit */}
              <div className="space-y-1.5">
                <label htmlFor="unit" className="block text-sm font-semibold text-slate-300">
                  Satuan <span className="text-violet-400">*</span>
                </label>
                <input
                  id="unit"
                  type="text"
                  value={data.unit}
                  onChange={(e) => setData('unit', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.unit ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                  disabled={processing}
                />
                {errors.unit && <p className="text-rose-400 text-xs mt-1">{errors.unit}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Purchase Price */}
              <div className="space-y-1.5">
                <label htmlFor="purchase_price" className="block text-sm font-semibold text-slate-300">
                  Harga Beli <span className="text-violet-400">*</span>
                </label>
                <CurrencyInput
                  id="purchase_price"
                  value={data.purchase_price}
                  onChange={(v) => setData('purchase_price', String(v))}
                  disabled={processing}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.purchase_price ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                />
                {errors.purchase_price && <p className="text-rose-400 text-xs mt-1">{errors.purchase_price}</p>}
              </div>

              {/* Selling Price */}
              <div className="space-y-1.5">
                <label htmlFor="selling_price" className="block text-sm font-semibold text-slate-300">
                  Harga Jual <span className="text-violet-400">*</span>
                </label>
                <CurrencyInput
                  id="selling_price"
                  value={data.selling_price}
                  onChange={(v) => setData('selling_price', String(v))}
                  disabled={processing}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.selling_price ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                />
                {errors.selling_price && <p className="text-rose-400 text-xs mt-1">{errors.selling_price}</p>}
              </div>

              {/* Minimum Stock */}
              <div className="space-y-1.5">
                <label htmlFor="minimum_stock" className="block text-sm font-semibold text-slate-300">
                  Minimum Stok <span className="text-violet-400">*</span>
                </label>
                <CurrencyInput
                  id="minimum_stock"
                  hidePrefix
                  value={data.minimum_stock}
                  onChange={(v) => setData('minimum_stock', String(v))}
                  disabled={processing}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-900 border text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all
                    ${errors.minimum_stock ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'}`}
                />
                {errors.minimum_stock && <p className="text-rose-400 text-xs mt-1">{errors.minimum_stock}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status */}
              <div className="space-y-1.5">
                <label htmlFor="status" className="block text-sm font-semibold text-slate-300">
                  Status
                </label>
                <select
                  id="status"
                  value={data.status}
                  onChange={(e) => setData('status', e.target.value as 'active' | 'inactive')}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                  disabled={processing}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
                {errors.status && <p className="text-rose-400 text-xs mt-1">{errors.status}</p>}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-semibold text-slate-300">
                Deskripsi Produk
              </label>
              <textarea
                id="description"
                value={data.description}
                onChange={(e) => setData('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.description && <p className="text-rose-400 text-xs mt-1">{errors.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
              <Link
                href="/products"
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-violet-900/20 transition-all flex items-center gap-2"
              >
                {processing ? 'Menyimpan...' : 'Perbarui Produk'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
