import React, { useRef, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import Modal from '../../Components/Modal';
import { PageProps } from '../../Types';
import { downloadProductTemplate, readProductRows } from '../../Utils/productExcel';
import ProductImportPreview, { PreviewRow } from '../../Components/ProductImportPreview';

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  photo_url: string | null;
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

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Hapus massal — khusus Super Admin.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importRowErrors, setImportRowErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');

  /** Baca file Excel di browser, lalu kirim barisnya ke server untuk disimpan. */
  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportRowErrors([]);

    try {
      const rows = await readProductRows(file);

      if (rows.length === 0) {
        setImportError('File Excel tidak berisi baris produk yang valid. Pastikan data diisi di sheet "Produk" dan baris contoh sudah dihapus.');
        return;
      }

      // File tidak langsung dikirim — admin memeriksa isinya dulu di pratinjau.
      setPreviewFileName(file.name);
      setPreviewRows(rows.map((row, index) => ({
        excelRow: index + 2,
        sku: String(row['SKU'] ?? row['sku'] ?? '').trim(),
        name: String(row['Nama Produk'] ?? row['nama_produk'] ?? '').trim(),
        raw: row,
      })));
    } catch {
      setImportError('File tidak bisa dibaca. Pastikan formatnya .xlsx atau .xls sesuai template.');
    } finally {
      // Reset agar file yang sama bisa dipilih ulang setelah diperbaiki.
      event.target.value = '';
    }
  }

  /** Dipanggil setelah admin menekan Import di layar pratinjau. */
  function submitImport(rows: Record<string, unknown>[]) {
    setImporting(true);

    router.post('/products/import', { rows } as never, {
      preserveScroll: true,
      onSuccess: () => setPreviewRows(null),
      onError: (errors) => setImportError(Object.values(errors)[0] as string),
      onFinish: () => setImporting(false),
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.get('/products', { search }, { preserveState: true });
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

  // Hanya Super Admin yang boleh menghapus produk sekaligus banyak.
  const canBulkDelete = Boolean(auth.user?.is_super_admin) && canDelete;

  const pageIds = products.data.map((p) => p.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  function toggleSelectAll() {
    setSelectedIds(allOnPageSelected ? [] : pageIds);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function handleBulkDeleteExecute() {
    setBulkDeleting(true);

    router.delete('/products/bulk-destroy', {
      data: { ids: selectedIds },
      onSuccess: () => {
        setBulkModalOpen(false);
        setSelectedIds([]);
      },
      onFinish: () => setBulkDeleting(false),
    });
  }

  return (
    <AppLayout>
      <Head title="Master Produk" />
      <Alert message={flash.success ?? null} type="success" />

      {/* Error global impor (validasi server) */}
      {importError && <Alert message={importError} type="error" />}

      {/* Error detail per baris */}
      {flash.error && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-rose-500 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-rose-700 font-bold text-sm">Beberapa baris gagal diimpor:</p>
          </div>
          <ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {flash.error.split(' • ').map((errMsg, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-rose-600">
                <span className="mt-0.5 shrink-0 inline-block w-4 h-4 rounded-full bg-rose-200 text-rose-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                <span>{errMsg}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-rose-500">Perbaiki baris tersebut di file Excel Anda, lalu unggah ulang.</p>
        </div>
      )}

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

        {/* Search */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari SKU atau nama produk..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
            >
              Cari
            </button>
          </form>
        </div>

        {/* Bilah aksi untuk produk yang dicentang */}
        {canBulkDelete && selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-5 py-3.5">
            <p className="text-sm font-semibold text-rose-700">
              {selectedIds.length} produk dipilih
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold border border-gray-300 transition-all"
              >
                Batalkan Pilihan
              </button>
              <button
                type="button"
                onClick={() => setBulkModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-200/50 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Hapus {selectedIds.length} Produk
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                  {canBulkDelete && (
                    <th className="pl-6 pr-2 py-3.5 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        title="Pilih semua produk di halaman ini"
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3.5">Produk</th>
                  <th className="px-6 py-3.5">SKU</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {products.data.length === 0 ? (
                  <tr>
                    <td colSpan={canBulkDelete ? 4 : 3} className="px-6 py-12 text-center text-gray-400 font-medium">
                      Tidak ada data produk ditemukan.
                    </td>
                  </tr>
                ) : (
                  products.data.map((product) => (
                    <tr
                      key={product.id}
                      className={`group transition-all ${
                        selectedIds.includes(product.id) ? 'bg-teal-50/80' : 'hover:bg-teal-50/60'
                      }`}
                    >
                      {canBulkDelete && (
                        <td className="pl-6 pr-2 py-3.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                        </td>
                      )}
                      {/* Foto + nama jadi satu kolom, seperti tampilan katalog */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3.5">
                          {product.photo_url ? (
                            <img
                              src={product.photo_url}
                              alt={product.name}
                              loading="lazy"
                              className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0 group-hover:border-teal-300 transition-colors"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-300">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                            </div>
                          )}

                          <Link
                            href={`/products/${product.id}`}
                            className="min-w-0 text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors line-clamp-2 leading-snug"
                            title={product.name}
                          >
                            {product.name}
                          </Link>
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 group-hover:bg-teal-50 border border-gray-200 group-hover:border-teal-200 text-gray-600 group-hover:text-teal-700 text-xs font-mono font-semibold whitespace-nowrap transition-colors">
                          {product.sku}
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
        title="Hapus Produk"
        maxWidth="md"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-rose-50/80 border border-rose-200/80">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Konfirmasi Penghapusan</p>
              <p className="text-xs text-gray-700 leading-relaxed">
                Apakah Anda yakin ingin menghapus produk ini dari master data?
              </p>
              <div className="p-3 bg-white rounded-xl border border-rose-200/80 shadow-sm space-y-1 mt-1">
                <div className="font-bold text-gray-900 text-xs break-words">{deletingProduct?.name}</div>
                <div className="text-[11px] font-mono text-teal-600 font-bold">SKU: {deletingProduct?.sku}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all"
              disabled={deleting}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteExecute}
              className="px-5 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-200/50 transition-all disabled:opacity-50"
              disabled={deleting}
            >
              {deleting ? 'Menghapus...' : 'Ya, Hapus Produk'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Konfirmasi hapus massal */}
      <Modal
        show={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title="Hapus Produk Terpilih"
        maxWidth="md"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-rose-50/80 border border-rose-200/80">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Konfirmasi Penghapusan Massal</p>
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-bold">{selectedIds.length} produk</span> akan dihapus dari master data sekaligus.
                Pastikan pilihan Anda sudah benar sebelum melanjutkan.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setBulkModalOpen(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all"
              disabled={bulkDeleting}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteExecute}
              className="px-5 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-200/50 transition-all disabled:opacity-50"
              disabled={bulkDeleting}
            >
              {bulkDeleting ? 'Menghapus...' : `Ya, Hapus ${selectedIds.length} Produk`}
            </button>
          </div>
        </div>
      </Modal>

      {previewRows && (
        <ProductImportPreview
          rows={previewRows}
          fileName={previewFileName}
          processing={importing}
          onCancel={() => setPreviewRows(null)}
          onConfirm={submitImport}
        />
      )}
    </AppLayout>
  );
}
