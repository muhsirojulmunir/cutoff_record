import React, { useRef, useState } from 'react';
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(product.photo_url);
  const [removePhoto, setRemovePhoto] = useState(false);

  function handlePhotoChange(file: File | null) {
    if (!file) return;
    setData('photo', file);
    setPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  function handleRemovePhoto() {
    setData('photo', null);
    setPreview(null);
    setRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handlePhotoChange(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.post(`/products/${product.id}`, {
      ...data,
      _method: 'put',
      remove_photo: removePhoto ? '1' : '0',
    }, { forceFormData: true });
  }

  return (
    <AppLayout>
      <Head title={`Edit Produk — ${product.sku}`} />

      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Produk</h1>
          <p className="text-gray-400 text-xs mt-1">Master Data / Produk / Edit</p>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-lg space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── FOTO PRODUK ── */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Foto Produk</p>

              {preview ? (
                /* Preview card — seperti referensi */
                <div className="relative w-48 group">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative rounded-2xl overflow-hidden border-2 border-teal-400 cursor-pointer aspect-square bg-gray-100"
                  >
                    <img
                      src={preview}
                      alt="Preview produk"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Badge COVER */}
                    <span className="absolute top-2 left-2 bg-teal-500 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow">
                      COVER
                    </span>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="bg-white/90 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                        </svg>
                        Ganti Foto
                      </div>
                    </div>
                  </div>

                  {/* Tombol hapus × */}
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors z-10"
                    title="Hapus foto"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

              ) : (
                /* Drop zone kosong */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="w-48 aspect-square rounded-2xl border-2 border-dashed border-gray-300 hover:border-teal-400 bg-gray-50 hover:bg-teal-50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-teal-100 flex items-center justify-center transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400 group-hover:text-teal-500 transition-colors">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-400 group-hover:text-teal-600 font-medium text-center leading-tight px-2 transition-colors">
                    Klik atau seret<br />foto ke sini
                  </p>
                  <p className="text-[10px] text-gray-300 group-hover:text-teal-400 transition-colors">JPG · PNG · WEBP · maks 2MB</p>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {errors.photo && <p className="text-rose-400 text-xs">{errors.photo}</p>}
            </div>

            <div className="border-t border-gray-100" />

            {/* ── NAMA PRODUK ── */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Nama Produk <span className="text-teal-500 normal-case font-normal">(wajib)</span>
              </label>
              <input
                id="name"
                type="text"
                value={data.name}
                onChange={(e) => setData('name', e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                  ${errors.name ? 'border-rose-400' : 'border-gray-200'}`}
                disabled={processing}
                placeholder="Contoh: Kardus Polos 30x20x15"
              />
              {errors.name && <p className="text-rose-400 text-xs">{errors.name}</p>}
            </div>

            {/* ── SKU ── */}
            <div className="space-y-1.5">
              <label htmlFor="sku" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                SKU <span className="text-teal-500 normal-case font-normal">(wajib · unik)</span>
              </label>
              <input
                id="sku"
                type="text"
                value={data.sku}
                onChange={(e) => setData('sku', e.target.value.toUpperCase())}
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border font-mono text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all
                  ${errors.sku ? 'border-rose-400' : 'border-gray-200'}`}
                disabled={processing}
                placeholder="Contoh: KRD-30X20X15"
              />
              {errors.sku && <p className="text-rose-400 text-xs">{errors.sku}</p>}
            </div>

            {/* ── ACTIONS ── */}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Link
                href="/products"
                className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {processing && (
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                {processing ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
