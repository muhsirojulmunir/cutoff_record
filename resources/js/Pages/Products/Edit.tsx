import React from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import ProductDimensionFields from '@/Components/ProductDimensionFields';

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
  color: string | null;
  is_box: boolean;
  length: string | null;
  width: string | null;
  height: string | null;
  photo_url: string | null;
  status: 'active' | 'inactive';
  description: string | null;
}

interface EditProps {
  product: Product;
  categories: Category[];
}

export default function Edit({ product, categories }: EditProps) {
  const { data, setData, processing, errors } = useForm({
    sku: product.sku,
    name: product.name,
    category_id: product.category_id,
    brand: product.brand ?? '',
    color: product.color ?? '',
    is_box: product.is_box,
    length: product.length ? String(Number(product.length)) : '',
    width: product.width ? String(Number(product.width)) : '',
    height: product.height ? String(Number(product.height)) : '',
    status: product.status,
    description: product.description ?? '',
    photo: null as File | null,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.post(`/products/${product.id}`, {
      ...data,
      _method: 'put',
    }, { forceFormData: true });
  }

  return (
    <AppLayout>
      <Head title="Edit Produk" />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Produk: {product.sku}</h1>
          <p className="text-gray-500 text-xs mt-1">Master Data / Produk / Edit</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* SKU */}
              <div className="space-y-1.5">
                <label htmlFor="sku" className="block text-sm font-semibold text-gray-700">
                  Stock Keeping Unit (SKU) <span className="text-teal-400">*</span>
                </label>
                <input
                  id="sku"
                  type="text"
                  value={data.sku}
                  onChange={(e) => setData('sku', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                    ${errors.sku ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                  disabled={processing}
                />
                {errors.sku && <p className="text-rose-400 text-xs mt-1">{errors.sku}</p>}
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-semibold text-gray-700">
                  Nama Produk <span className="text-teal-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={data.name}
                  onChange={(e) => setData('name', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                    ${errors.name ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
                  disabled={processing}
                />
                {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-1.5">
                <label htmlFor="category_id" className="block text-sm font-semibold text-gray-700">
                  Kategori <span className="text-teal-400">*</span>
                </label>
                <select
                  id="category_id"
                  value={data.category_id}
                  onChange={(e) => setData('category_id', Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
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
                <label htmlFor="brand" className="block text-sm font-semibold text-gray-700">
                  Brand / Merek
                </label>
                <input
                  id="brand"
                  type="text"
                  value={data.brand}
                  onChange={(e) => setData('brand', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
                {errors.brand && <p className="text-rose-400 text-xs mt-1">{errors.brand}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Color */}
              <div className="space-y-1.5">
                <label htmlFor="color" className="block text-sm font-semibold text-gray-700">
                  Warna (Color)
                </label>
                <input
                  id="color"
                  type="text"
                  value={data.color}
                  onChange={(e) => setData('color', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  disabled={processing}
                />
              </div>

              {/* Jenis produk kardus */}
              <div className="space-y-1.5">
                <span className="block text-sm font-semibold text-gray-700">Jenis Produk</span>
                <label
                  htmlFor="is_box"
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-teal-400 cursor-pointer transition-all"
                >
                  <input
                    id="is_box"
                    type="checkbox"
                    checked={data.is_box}
                    onChange={(e) => {
                      setData('is_box', e.target.checked);
                      if (!e.target.checked) setData('height', '');
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    disabled={processing}
                  />
                  <span className="text-sm text-gray-700">Kardus (pakai Tinggi)</span>
                </label>
              </div>
            </div>

            {/* Ukuran */}
            <ProductDimensionFields
              isBox={data.is_box}
              length={data.length}
              width={data.width}
              height={data.height}
              onChange={(field, value) => setData(field, value)}
              errors={errors}
              disabled={processing}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status */}
              <div className="space-y-1.5">
                <label htmlFor="status" className="block text-sm font-semibold text-gray-700">
                  Status
                </label>
                <select
                  id="status"
                  value={data.status}
                  onChange={(e) => setData('status', e.target.value as 'active' | 'inactive')}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                  disabled={processing}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
                {errors.status && <p className="text-rose-400 text-xs mt-1">{errors.status}</p>}
              </div>

            </div>

            {/* Foto Produk */}
            <div className="space-y-1.5">
              <label htmlFor="photo" className="block text-sm font-semibold text-gray-700">Foto Produk</label>
              {product.photo_url && (
                <img src={product.photo_url} alt={product.name} className="w-20 h-20 rounded-xl object-cover border border-gray-200 mb-2" />
              )}
              <input
                id="photo"
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => setData('photo', e.target.files?.[0] ?? null)}
                disabled={processing}
                className="w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:text-xs file:font-semibold hover:file:bg-teal-100 cursor-pointer"
              />
              <p className="text-[11px] text-gray-400">JPG, PNG, atau WEBP maksimal 2 MB. Unggah berkas baru untuk mengganti foto.</p>
              {errors.photo && <p className="text-rose-400 text-xs mt-1">{errors.photo}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-semibold text-gray-700">
                Deskripsi Produk
              </label>
              <textarea
                id="description"
                value={data.description}
                onChange={(e) => setData('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 hover:border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                disabled={processing}
              />
              {errors.description && <p className="text-rose-400 text-xs mt-1">{errors.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-300/80">
              <Link
                href="/products"
                className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all flex items-center gap-2"
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
