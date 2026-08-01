import React, { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Modal from '../../Components/Modal';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Category {
  id: number;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

interface CategoryIndexProps {
  categories: {
    data: Category[];
    links: any[];
    current_page: number;
    total: number;
  };
  filters: {
    search?: string;
    status?: string;
  };
}

export default function Index({ categories, filters }: CategoryIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Delete State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const { data, setData, post, put, delete: destroy, processing, errors, reset, clearErrors } = useForm({
    name: '',
    description: '',
    status: 'active' as 'active' | 'inactive',
  });

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.get('/categories', { search, status }, { preserveState: true });
  }

  function handleFilterChange(newStatus: string) {
    setStatus(newStatus);
    router.get('/categories', { search, status: newStatus }, { preserveState: true });
  }

  function openCreateModal() {
    setEditingCategory(null);
    reset();
    clearErrors();
    setModalOpen(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setData({
      name: category.name,
      description: category.description ?? '',
      status: category.status,
    });
    clearErrors();
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingCategory) {
      put(`/categories/${editingCategory.id}`, {
        onSuccess: () => {
          setModalOpen(false);
          reset();
        },
      });
    } else {
      post('/categories', {
        onSuccess: () => {
          setModalOpen(false);
          reset();
        },
      });
    }
  }

  function openDeleteConfirm(category: Category) {
    setDeletingCategory(category);
    setDeleteConfirmOpen(true);
  }

  function handleDeleteSubmit() {
    if (deletingCategory) {
      destroy(`/categories/${deletingCategory.id}`, {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          setDeletingCategory(null);
        },
      });
    }
  }

  const canCreate = permissions.includes('category.create');
  const canEdit = permissions.includes('category.edit');
  const canDelete = permissions.includes('category.delete');

  return (
    <AppLayout>
      <Head title="Master Kategori" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Kategori Produk</h1>
            <p className="text-slate-400 text-xs mt-1">Master Data / Kategori</p>
          </div>
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-violet-900/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Kategori
            </button>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau deskripsi kategori..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-500 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>
            <div className="flex gap-2">
              <select
                value={status}
                onChange={(e) => handleFilterChange(e.target.value)}
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

        {/* Data Table */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/30">
                  <th className="px-6 py-4">Nama Kategori</th>
                  <th className="px-6 py-4">Deskripsi</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {categories.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      Tidak ada data kategori ditemukan.
                    </td>
                  </tr>
                ) : (
                  categories.data.map((category) => (
                    <tr key={category.id} className="hover:bg-slate-900/20 group transition-all">
                      <td className="px-6 py-4 font-semibold text-slate-200 group-hover:text-white transition-colors">
                        {category.name}
                      </td>
                      <td className="px-6 py-4 text-slate-400 max-w-xs truncate">
                        {category.description ?? '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                            ${category.status === 'active'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                            }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${category.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {category.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(category)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 border border-transparent hover:border-violet-500/10 transition-all"
                              title="Edit"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => openDeleteConfirm(category)}
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
            <Pagination links={categories.links} />
          </div>
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      <Modal
        show={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? 'Edit Kategori Kategori' : 'Tambah Kategori Baru'}
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">Nama Kategori</label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData('name', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              placeholder="Masukkan nama kategori..."
              disabled={processing}
            />
            {errors.name && <p className="text-rose-400 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">Deskripsi</label>
            <textarea
              value={data.description}
              onChange={(e) => setData('description', e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none"
              placeholder="Tulis penjelasan singkat kategori..."
              disabled={processing}
            />
            {errors.description && <p className="text-rose-400 text-xs mt-1">{errors.description}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-300">Status</label>
            <select
              value={data.status}
              onChange={(e) => setData('status', e.target.value as 'active' | 'inactive')}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
              disabled={processing}
            >
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
            {errors.status && <p className="text-rose-400 text-xs mt-1">{errors.status}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all"
              disabled={processing}
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-violet-900/20 transition-all"
              disabled={processing}
            >
              {processing ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        show={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Konfirmasi Hapus"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-300 text-sm leading-relaxed">
            Apakah Anda yakin ingin menghapus kategori <span className="font-bold text-white">{deletingCategory?.name}</span>? Tindakan ini tidak dapat dibatalkan jika kategori telah terikat pada produk.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all"
              disabled={processing}
            >
              Batal
            </button>
            <button
              onClick={handleDeleteSubmit}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-rose-900/20 transition-all"
              disabled={processing}
            >
              {processing ? 'Menghapus...' : 'Hapus Kategori'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
