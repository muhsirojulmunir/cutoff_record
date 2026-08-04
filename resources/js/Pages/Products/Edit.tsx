import React from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface Product {
  id: number;
  sku: string;
  name: string;
  photo_url: string | null;
}

interface EditProps {
  product: Product;
}

export default function Edit({ product }: EditProps) {
  const { data, setData, processing, errors } = useForm({
    sku:   product.sku,
    name:  product.name,
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
      <Head title={`Edit Produk — ${product.sku}`} />

      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Produk</h1>
          <p className="text-gray-500 text-xs mt-1">Master Data / Produk / Edit — hanya SKU, Nama, dan Foto</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* SKU */}
            <div className="space-y-1.5">
              <label htmlFor="sku" className="block text-sm font-semibold text-gray-700">
                SKU (Stock Keeping Unit) <span className="text-teal-500">*</span>
              </label>
              <input
                id="sku"
                type="text"
                value={data.sku}
                onChange={(e) => setData('sku', e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                  ${errors.sku ? 'border-rose-400' : 'border-gray-300'}`}
                disabled={processing}
                placeholder="Contoh: KRD-30X20X15"
              />
              {errors.sku && <p className="text-rose-400 text-xs">{errors.sku}</p>}
            </div>

            {/* Nama Produk */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700">
                Nama Produk <span className="text-teal-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={data.name}
                onChange={(e) => setData('name', e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                  ${errors.name ? 'border-rose-400' : 'border-gray-300'}`}
                disabled={processing}
                placeholder="Contoh: Kardus Polos 30x20x15"
              />
              {errors.name && <p className="text-rose-400 text-xs">{errors.name}</p>}
            </div>

            {/* Foto Produk */}
            <div className="space-y-2">
              <label htmlFor="photo" className="block text-sm font-semibold text-gray-700">
                Foto Produk
              </label>
              {product.photo_url && (
                <img
                  src={product.photo_url}
                  alt={product.name}
                  className="w-24 h-24 rounded-xl object-cover border border-gray-200"
                />
              )}
              <input
                id="photo"
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => setData('photo', e.target.files?.[0] ?? null)}
                disabled={processing}
                className="w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:text-xs file:font-semibold hover:file:bg-teal-100 cursor-pointer"
              />
              <p className="text-[11px] text-gray-400">JPG, PNG, atau WEBP — maks. 2 MB. Kosongkan jika tidak ingin mengubah foto.</p>
              {errors.photo && <p className="text-rose-400 text-xs">{errors.photo}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <Link
                href="/products"
                className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-gray-400 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-60"
              >
                {processing ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
