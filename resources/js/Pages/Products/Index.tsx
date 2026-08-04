import React, { useRef, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import Modal from '../../Components/Modal';
import { PageProps } from '../../Types';
import { downloadProductTemplate, readProductRows } from '../../Utils/productExcel';

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
  is_box: boolean;
  dimension_label: string | null;
  purchase_price: string;
  selling_price: string;
  stock: number;
  status: 'active' | 'inactive';
}

interface ProductIndexProps {
  products: {
    data: Product[];
    links: any[];
    total: number;
  };
  categories: Category[];
  filters: {
    search?: string;
    category_id?: string;
    status?: string;
  };
}

export default function Index({ products, categories, filters }: ProductIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [categoryId, setCategoryId] = useState(filters.category_id ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  /** Baca file Excel di browser, lalu kirim barisnya ke server untuk disimpan. */
  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);

    try {
      const rows = await readProductRows(file);

      if (rows.length === 0) {
        setImportError('File Excel tidak berisi baris produk. Pastikan data diisi di sheet "Produk".');
        return;
      }

      router.post('/products/import', { rows } as never, {
        preserveScroll: true,
        onError: (errors) => setImportError(Object.values(errors)[0] as string),
        onFinish: () => setImporting(false),
      });
    } catch {
      setImportError('File tidak bisa dibaca. Pastikan formatnya .xlsx atau .xls sesuai template.');
    } finally {
      // Reset agar file yang sama bisa dipilih ulang setelah diperbaiki.
      event.target.value = '';
      setImporting(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.get('/products', { search, category_id: categoryId, status }, { preserveState: true });
  }

  function handleCategoryFilterChange(newCatId: string) {
    setCategoryId(newCatId);
    router.get('/products', { search, category_id: newCatId, status }, { preserveState: true });
  }

  function handleStatusFilterChange(newStatus: string) {
    setStatus(newStatus);
    router.get('/products', { search, category_id: categoryId, status: newStatus }, { preserveState: true });
  }

  function confirmDelete(product: Product) {
    setDeletingProduct(product);
    setDeleteModalOpen(true);
  }

  function handleDeleteExecute() {
    if (deletingProduct) {
      setDeleting(true);
      router.delete(`/products/${deletingProduct.id}`, {
        onSuccess: () => {
          setDeleteModalOpen(false);
          setDeletingProduct(null);
          setDeleting(false);
        },
        onError: () => {
          setDeleting(false);
        }
      });
    }
  }

  const canCreate = permissions.includes('product.create');
  const canEdit = permissions.includes('product.edit');
  const canDelete = permissions.includes('product.delete');

  return (
    <AppLayout>
      <Head title="Master Produk" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}
      {importError && <Alert message={importError} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daftar Produk</h1>
            <p className="text-gray-500 text-xs mt-1">Master Data / Produk</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canCreate && (
              <>
                <button
                  type="button"
                  onClick={downloadProductTemplate}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl border border-gray-300 hover:border-gray-400 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download Template
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 font-semibold text-sm rounded-xl border border-teal-400 hover:border-teal-500 transition-all disabled:opacity-60"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  {importing ? 'Mengimpor...' : 'Import Excel'}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </>
            )}

            {canCreate && (
            <Link
              href="/products/create"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 active:scale-[0.99] text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-teal-200/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Produk
            </Link>
            )}
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, nama produk, atau brand..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={categoryId}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
                className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
              >
                Cari
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                  <th className="px-6 py-3.5">SKU</th>
                  <th className="px-6 py-3.5">Nama Produk</th>
                  <th className="px-6 py-3.5">Kategori / Brand</th>
                  <th className="px-6 py-3.5">Ukuran</th>
                  <th className="px-6 py-3.5 text-center">Stok</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {products.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-medium">
                      Tidak ada data produk ditemukan.
                    </td>
                  </tr>
                ) : (
                  products.data.map((product) => (
                    <tr key={product.id} className="hover:bg-teal-50/60 group transition-all">
                      <td className="px-6 py-3.5 font-mono font-bold text-teal-400 text-xs">
                        {product.sku}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-gray-800 group-hover:text-gray-900 transition-colors text-xs">
                        <Link href={`/products/${product.id}`} className="hover:underline">
                          {product.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="text-gray-700 font-medium text-xs">{product.category?.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{product.brand ?? 'No Brand'}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="font-mono text-xs text-gray-700">{product.dimension_label ?? '—'}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{product.is_box ? 'P × L × T' : 'P × L'}</div>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center min-w-[3rem] px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 border border-slate-300 text-slate-700">
                          {product.stock ?? 0}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
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
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/products/${product.id}`}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent hover:border-gray-300 transition-all"
                            title="Detail"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </Link>
                          {canEdit && (
                            <Link
                              href={`/products/${product.id}/edit`}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-teal-400 hover:bg-gray-50 border border-transparent hover:border-gray-300 transition-all"
                              title="Edit"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Link>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => confirmDelete(product)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-50 border border-transparent hover:border-rose-900/40 transition-all"
                              title="Hapus"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 bg-white/80">
            <Pagination links={products.links} />
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      <Modal
        show={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Konfirmasi Hapus (Soft Delete)"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 text-sm leading-relaxed">
            Apakah Anda yakin ingin menghapus produk <span className="font-bold text-gray-900">{deletingProduct?.name}</span> ({deletingProduct?.sku})? Data produk akan disembunyikan (soft delete) untuk mempertahankan integritas data transaksi.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-300/80">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-300 hover:border-teal-400 transition-all"
              disabled={deleting}
            >
              Batal
            </button>
            <button
              onClick={handleDeleteExecute}
              className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-200/40 transition-all"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Hapus Produk'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
