import React, { useRef, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import CurrencyInput from '@/Components/CurrencyInput';
import { PageProps } from '../../Types';
import { downloadHppTemplate, readHppRows } from '../../Utils/productHppExcel';

interface Category {
  id: number;
  name: string;
}

interface Hpp {
  id: number;
  hpp: string;
  effective_date: string;
  notes: string | null;
  updated_at: string;
  updater: { id: number; name: string } | null;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  category: Category | null;
  po_average_cost: string | number;
  hpp: Hpp | null;
}

interface Props {
  products: {
    data: Product[];
    links: { url: string | null; label: string; active: boolean }[];
    from: number;
    to: number;
    total: number;
  };
  categories: Category[];
  filters: { search?: string; category_id?: string; filled?: string };
  canManage: boolean;
}

const fmt = (value: string | number) =>
  'Rp ' + Number(value ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const today = () => new Date().toISOString().split('T')[0];

export default function ProductHppIndex({ products, categories, filters, canManage }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [categoryId, setCategoryId] = useState(filters.category_id ?? '');
  const [filled, setFilled] = useState(filters.filled ?? '');
  const [editingId, setEditingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

  async function handleDownloadTemplate() {
    setDownloading(true);
    setExcelError(null);

    try {
      await downloadHppTemplate();
    } catch {
      setExcelError('Gagal menyiapkan template HPP. Coba ulangi beberapa saat lagi.');
    } finally {
      setDownloading(false);
    }
  }

  /** Baca file Excel di browser, lalu kirim barisnya ke server. */
  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setExcelError(null);

    try {
      const rows = await readHppRows(file);

      if (rows.length === 0) {
        setExcelError('File Excel tidak berisi baris HPP. Pastikan data diisi di sheet "HPP".');
        return;
      }

      router.post('/product-hpp/import', { rows } as never, {
        preserveScroll: true,
        onError: (errors) => setExcelError(Object.values(errors)[0] as string),
        onFinish: () => setImporting(false),
      });
    } catch {
      setExcelError('File tidak bisa dibaca. Pastikan formatnya .xlsx atau .xls sesuai template.');
    } finally {
      event.target.value = '';
      setImporting(false);
    }
  }

  const { data, setData, post, processing, errors, reset } = useForm({
    hpp: '',
    effective_date: today(),
    notes: '',
  });

  function applyFilters(next: Partial<{ search: string; category_id: string; filled: string }>) {
    router.get('/product-hpp', {
      search: next.search ?? search,
      category_id: next.category_id ?? categoryId,
      filled: next.filled ?? filled,
    }, { preserveState: true, replace: true });
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setData({
      hpp: product.hpp ? String(Number(product.hpp.hpp)) : '',
      effective_date: product.hpp?.effective_date?.split('T')[0] ?? today(),
      notes: product.hpp?.notes ?? '',
    });
  }

  function submit(e: React.FormEvent, product: Product) {
    e.preventDefault();
    post(`/product-hpp/${product.id}`, {
      preserveScroll: true,
      onSuccess: () => { setEditingId(null); reset(); },
    });
  }

  return (
    <AppLayout>
      <Head title="Master HPP Produk" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}
      {excelError && <Alert message={excelError} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HPP Produk</h1>
            <p className="text-gray-500 text-xs mt-1">
              Master Data / HPP — hanya Finance &amp; Leader yang dapat melihat dan mengisi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-xl border border-gray-300 hover:border-gray-400 transition-all disabled:opacity-60"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {downloading ? 'Menyiapkan...' : 'Download Template'}
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 font-semibold text-sm rounded-xl border border-teal-400 hover:border-teal-500 transition-all disabled:opacity-60"
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

          </div>
        </div>

        {/* Filter */}
        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters({})}
                placeholder="Cari SKU atau nama produk..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
              </svg>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); applyFilters({ category_id: e.target.value }); }}
                className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <select
                value={filled}
                onChange={(e) => { setFilled(e.target.value); applyFilters({ filled: e.target.value }); }}
                className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="">Semua Produk</option>
                <option value="yes">HPP sudah diisi</option>
                <option value="no">HPP belum diisi</option>
              </select>

              <button
                type="button"
                onClick={() => applyFilters({})}
                className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
              >
                Cari
              </button>
            </div>
          </div>
        </div>

        {/* Tabel */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                  <th className="px-6 py-3.5">SKU</th>
                  <th className="px-6 py-3.5">Nama Produk</th>
                  <th className="px-6 py-3.5">Kategori</th>
                  <th className="px-6 py-3.5 text-right">Rata-rata Beli PO</th>
                  <th className="px-6 py-3.5 text-right">HPP</th>
                  <th className="px-6 py-3.5">Diperbarui</th>
                  {canManage && <th className="px-6 py-3.5 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {products.data.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-6 py-12 text-center text-gray-400 font-medium">
                      Tidak ada produk ditemukan.
                    </td>
                  </tr>
                ) : (
                  products.data.map((product) => {
                    const isEditing = editingId === product.id;

                    return (
                      <React.Fragment key={product.id}>
                        <tr className="hover:bg-teal-50/60 group transition-all">
                          <td className="px-6 py-3.5 font-mono font-bold text-teal-600 text-xs">{product.sku}</td>
                          <td className="px-6 py-3.5 font-semibold text-gray-800 text-xs">{product.name}</td>
                          <td className="px-6 py-3.5 text-xs text-gray-500">{product.category?.name ?? '—'}</td>
                          <td className="px-6 py-3.5 text-right font-mono text-xs text-gray-500">
                            {Number(product.po_average_cost) > 0 ? fmt(product.po_average_cost) : '—'}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            {product.hpp ? (
                              <span className="font-mono font-bold text-gray-900">{fmt(product.hpp.hpp)}</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-[10px] font-bold">
                                Belum diisi
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-[11px] text-gray-400">
                            {product.hpp ? (
                              <>
                                <span className="block">{fmtDate(product.hpp.effective_date)}</span>
                                <span className="block">{product.hpp.updater?.name ?? '—'}</span>
                              </>
                            ) : '—'}
                          </td>
                          {canManage && (
                            <td className="px-6 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => (isEditing ? setEditingId(null) : startEdit(product))}
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 hover:border-teal-400 text-xs font-semibold transition-all"
                              >
                                {isEditing ? 'Batal' : product.hpp ? 'Ubah' : 'Isi HPP'}
                              </button>
                            </td>
                          )}
                        </tr>

                        {isEditing && canManage && (
                          <tr className="bg-teal-50/40">
                            <td colSpan={7} className="px-6 py-4">
                              <form onSubmit={(e) => submit(e, product)} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                                    HPP per Unit <span className="text-rose-500">*</span>
                                  </label>
                                  <CurrencyInput
                                    value={data.hpp}
                                    onChange={(v) => setData('hpp', String(v))}
                                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                                  />
                                  {errors.hpp && <p className="text-rose-500 text-xs mt-1">{errors.hpp}</p>}
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                                    Berlaku Sejak <span className="text-rose-500">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={data.effective_date}
                                    onChange={(e) => setData('effective_date', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                                  />
                                  {errors.effective_date && <p className="text-rose-500 text-xs mt-1">{errors.effective_date}</p>}
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Catatan</label>
                                  <input
                                    type="text"
                                    value={data.notes}
                                    onChange={(e) => setData('notes', e.target.value)}
                                    placeholder="Opsional — mis. sumber perhitungan"
                                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                                  />
                                </div>

                                <button
                                  type="submit"
                                  disabled={processing}
                                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-50"
                                >
                                  {processing ? 'Menyimpan...' : 'Simpan HPP'}
                                </button>
                              </form>

                              {Number(product.po_average_cost) > 0 && (
                                <p className="text-[11px] text-gray-500 mt-2">
                                  Acuan: rata-rata harga beli dari Purchase Order yang sudah diterima
                                  <span className="font-mono font-semibold text-gray-700"> {fmt(product.po_average_cost)}</span>.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-400">
              Menampilkan {products.from ?? 0}–{products.to ?? 0} dari {products.total} produk
            </p>
            <Pagination links={products.links} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
