import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import Modal from '../../Components/Modal';
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
  unit: string;
  purchase_price: string;
  selling_price: string;
  minimum_stock: number;
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

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Daftar Produk</h1>
            <p className="text-slate-400 text-xs mt-1">Master Data / Produk</p>
          </div>
          {canCreate && (
            <Link
              href="/products/create"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-violet-900/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Produk
            </Link>
          )}
        </div>

        {/* Filters & Search */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU, nama produk, atau brand..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={categoryId}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
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
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold border border-slate-700 transition-all"
              >
                Cari
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/30">
                  <th className="px-6 py-4">SKU</th>
                  <th className="px-6 py-4">Nama Produk</th>
                  <th className="px-6 py-4">Kategori / Brand</th>
                  <th className="px-6 py-4">Harga Beli / Jual</th>
                  <th className="px-6 py-4">Min. Stok</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {products.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      Tidak ada data produk ditemukan.
                    </td>
                  </tr>
                ) : (
                  products.data.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-900/20 group transition-all">
                      <td className="px-6 py-4 font-mono font-bold text-violet-400">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-200 group-hover:text-white transition-colors">
                        <Link href={`/products/${product.id}`} className="hover:underline">
                          {product.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-300 font-medium">{product.category?.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{product.brand ?? 'No Brand'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[11px] text-slate-500">Beli: <span className="text-slate-300 font-semibold">Rp {Number(product.purchase_price).toLocaleString('id-ID')}</span></div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Jual: <span className="text-emerald-400 font-semibold">Rp {Number(product.selling_price).toLocaleString('id-ID')}</span></div>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-300">
                        {product.minimum_stock} {product.unit}
                      </td>
                      <td className="px-6 py-4">
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
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/products/${product.id}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-all"
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
                              className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 border border-transparent hover:border-violet-500/10 transition-all"
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
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 transition-all"
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
          <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/10">
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
          <p className="text-slate-300 text-sm leading-relaxed">
            Apakah Anda yakin ingin menghapus produk <span className="font-bold text-white">{deletingProduct?.name}</span> ({deletingProduct?.sku})? Data produk akan disembunyikan (soft delete) untuk mempertahankan integritas data transaksi.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all"
              disabled={deleting}
            >
              Batal
            </button>
            <button
              onClick={handleDeleteExecute}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-rose-900/20 transition-all"
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
