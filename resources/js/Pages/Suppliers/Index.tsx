import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import Modal from '../../Components/Modal';
import { PageProps } from '../../Types';

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string;
  status: 'active' | 'inactive';
}

interface SupplierIndexProps {
  suppliers: {
    data: Supplier[];
    links: any[];
    total: number;
  };
  filters: {
    search?: string;
    status?: string;
  };
}

export default function Index({ suppliers, filters }: SupplierIndexProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.get('/suppliers', { search, status }, { preserveState: true });
  }

  function handleFilterChange(newStatus: string) {
    setStatus(newStatus);
    router.get('/suppliers', { search, status: newStatus }, { preserveState: true });
  }

  function confirmDelete(supplier: Supplier) {
    setDeletingSupplier(supplier);
    setDeleteModalOpen(true);
  }

  function handleDeleteExecute() {
    if (deletingSupplier) {
      setDeleting(true);
      router.delete(`/suppliers/${deletingSupplier.id}`, {
        onSuccess: () => {
          setDeleteModalOpen(false);
          setDeletingSupplier(null);
          setDeleting(false);
        },
        onError: () => {
          setDeleting(false);
        }
      });
    }
  }

  const canCreate = permissions.includes('supplier.create');
  const canEdit = permissions.includes('supplier.edit');
  const canDelete = permissions.includes('supplier.delete');

  return (
    <AppLayout>
      <Head title="Master Supplier" />
      <Alert message={flash.success ?? null} type="success" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Daftar Supplier / Pabrik</h1>
            <p className="text-slate-400 text-xs mt-1">Master Data / Supplier</p>
          </div>
          {canCreate && (
            <Link
              href="/suppliers/create"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-violet-900/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Supplier
            </Link>
          )}
        </div>

        {/* Filter & Search */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode, nama, contact person, atau telepon supplier..."
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

        {/* Table */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/30">
                  <th className="px-6 py-4">Kode</th>
                  <th className="px-6 py-4">Nama Supplier</th>
                  <th className="px-6 py-4">Contact Person</th>
                  <th className="px-6 py-4">Termin Pembayaran</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {suppliers.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      Tidak ada data supplier ditemukan.
                    </td>
                  </tr>
                ) : (
                  suppliers.data.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-slate-900/20 group transition-all">
                      <td className="px-6 py-4 font-mono font-bold text-violet-400">
                        {supplier.supplier_code}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-200 group-hover:text-white transition-colors">
                        <Link href={`/suppliers/${supplier.id}`} className="hover:underline">
                          {supplier.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-300 font-medium">{supplier.contact_person ?? '—'}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{supplier.phone ?? '—'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400">
                          {supplier.payment_terms}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border
                            ${supplier.status === 'active'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                            }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${supplier.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {supplier.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/suppliers/${supplier.id}`}
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
                              href={`/suppliers/${supplier.id}/edit`}
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
                              onClick={() => confirmDelete(supplier)}
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
            <Pagination links={suppliers.links} />
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
            Apakah Anda yakin ingin menghapus supplier <span className="font-bold text-white">{deletingSupplier?.name}</span> ({deletingSupplier?.supplier_code})? Data supplier ini akan dinonaktifkan (soft delete) namun datanya tetap tersimpan untuk kebutuhan historis transaksi ERP.
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
              {deleting ? 'Deleting...' : 'Hapus Supplier'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
