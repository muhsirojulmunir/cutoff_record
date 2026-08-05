import React, { useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Alert from '../../Components/Alert';
import Pagination from '../../Components/Pagination';
import { PageProps } from '../../Types';

interface Product {
  id: number;
  sku: string;
  name: string;
  stock: number;
}

interface Warehouse {
  id: number;
  code: string;
  name: string;
}

interface Adjustment {
  id: number;
  quantity: number;
  stock_before: number;
  stock_after: number;
  notes: string | null;
  created_at: string;
  product: { id: number; sku: string; name: string } | null;
  warehouse: { id: number; name: string } | null;
  creator: { id: number; name: string } | null;
}

interface Props {
  adjustments: {
    data: Adjustment[];
    links: { url: string | null; label: string; active: boolean }[];
    from: number;
    to: number;
    total: number;
  };
  filters: { search?: string };
  products: Product[];
  warehouses: Warehouse[];
}

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const inputClass =
  'w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all';

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function StockAdjustment({ adjustments, filters, products, warehouses }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');

  const { data, setData, post, processing, errors, reset } = useForm({
    product_id: '',
    warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '',
    quantity: '',
    notes: '',
  });

  const [sku, setSku] = useState('');

  /** Cocokkan SKU tanpa peduli huruf besar/kecil maupun spasi berlebih. */
  const findProductBySku = useMemo(() => {
    const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
    return (value: string): Product | undefined => bySku.get(String(value ?? '').trim().toLowerCase());
  }, [products]);

  const selected = findProductBySku(sku);
  const delta = Number(data.quantity) || 0;

  function handleSkuChange(value: string) {
    setSku(value);
    const product = findProductBySku(value);
    setData('product_id', product ? String(product.id) : '');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    post('/adjustment-stok', {
      preserveScroll: true,
      onSuccess: () => {
        reset('quantity', 'notes');
        setSku('');
        setData('product_id', '');
      },
    });
  }

  return (
    <AppLayout>
      <Head title="Adjustment Stok" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Adjustment Stok</h1>
          <p className="text-gray-500 text-xs mt-1">
            Koreksi stok hasil opname, barang hilang, atau salah input — berlaku langsung dan tercatat di Inventory Ledger
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form koreksi */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden h-fit">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="font-semibold text-gray-800 text-sm">Koreksi Stok</h2>
            </div>

            <form onSubmit={submit} className="p-6 space-y-4">
              <datalist id="adj-sku-options">
                {products.map((product) => (
                  <option key={product.id} value={product.sku}>{product.name}</option>
                ))}
              </datalist>

              <div>
                <label htmlFor="sku" className={labelClass}>
                  SKU Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  id="sku"
                  list="adj-sku-options"
                  value={sku}
                  onChange={(e) => handleSkuChange(e.target.value)}
                  placeholder="Ketik / tempel SKU"
                  autoComplete="off"
                  className={`${inputClass} font-mono ${
                    sku.trim() !== '' && !selected ? 'border-rose-300 bg-rose-50 text-rose-700' : ''
                  }`}
                />
                {sku.trim() !== '' && !selected && (
                  <p className="text-rose-500 text-xs mt-1">SKU tidak ditemukan.</p>
                )}
                {selected && (
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    {selected.name} · Stok saat ini{' '}
                    <span className="font-mono font-bold text-gray-800">{selected.stock}</span>
                    {delta !== 0 && (
                      <>
                        {' → menjadi '}
                        <span className={`font-mono font-bold ${selected.stock + delta < 0 ? 'text-rose-600' : 'text-teal-600'}`}>
                          {selected.stock + delta}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {errors.product_id && <p className="text-rose-500 text-xs mt-1">{errors.product_id}</p>}
              </div>

              <div>
                <label htmlFor="warehouse_id" className={labelClass}>Gudang</label>
                <select
                  id="warehouse_id"
                  value={data.warehouse_id}
                  onChange={(e) => setData('warehouse_id', e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Pilih Gudang --</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      [{warehouse.code}] {warehouse.name}
                    </option>
                  ))}
                </select>
                {errors.warehouse_id && <p className="text-rose-500 text-xs mt-1">{errors.warehouse_id}</p>}
              </div>

              <div>
                <label htmlFor="quantity" className={labelClass}>
                  Jumlah Koreksi <span className="text-rose-500">*</span>
                </label>
                <input
                  id="quantity"
                  type="number"
                  value={data.quantity}
                  onChange={(e) => setData('quantity', e.target.value)}
                  placeholder="Contoh: 5 untuk menambah, -3 untuk mengurangi"
                  className={`${inputClass} font-mono`}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Isi angka positif untuk menambah stok, atau beri tanda minus untuk mengurangi.
                </p>
                {errors.quantity && <p className="text-rose-500 text-xs mt-1">{errors.quantity}</p>}
              </div>

              <div>
                <label htmlFor="notes" className={labelClass}>
                  Alasan Koreksi <span className="text-rose-500">*</span>
                </label>
                <input
                  id="notes"
                  type="text"
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Mis. hasil stock opname 5 Agustus"
                  className={inputClass}
                />
                {errors.notes && <p className="text-rose-500 text-xs mt-1">{errors.notes}</p>}
              </div>

              <button
                type="submit"
                disabled={processing || !selected}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-xs transition-all disabled:opacity-50"
              >
                {processing ? 'Menyimpan...' : 'Simpan Koreksi'}
              </button>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                Koreksi langsung mengubah stok tanpa persetujuan, karena ini wewenang Leader. Untuk
                barang datang dari pabrik, gunakan menu Barang Masuk agar melewati verifikasi gudang.
              </p>
            </form>
          </div>

          {/* Riwayat koreksi */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-gray-300 rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && router.get('/adjustment-stok', { search }, { preserveState: true, replace: true })}
                  placeholder="Cari SKU atau nama produk..."
                  className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => router.get('/adjustment-stok', { search }, { preserveState: true, replace: true })}
                  className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 transition-all"
                >
                  Cari
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50">
                      <th className="px-5 py-3.5">Waktu</th>
                      <th className="px-5 py-3.5">Produk</th>
                      <th className="px-5 py-3.5 text-center">Koreksi</th>
                      <th className="px-5 py-3.5 text-center">Stok</th>
                      <th className="px-5 py-3.5">Alasan</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 text-sm">
                    {adjustments.data.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-14 text-center text-gray-400">
                          Belum ada koreksi stok.
                        </td>
                      </tr>
                    ) : (
                      adjustments.data.map((row) => (
                        <tr key={row.id} className="hover:bg-teal-50/60 transition-colors">
                          <td className="px-5 py-3.5 text-[11px] text-gray-500 whitespace-nowrap">
                            {fmtDateTime(row.created_at)}
                            <span className="block text-gray-400">{row.creator?.name ?? '—'}</span>
                          </td>

                          <td className="px-5 py-3.5">
                            <p className="text-xs font-semibold text-gray-800">{row.product?.name ?? '—'}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{row.product?.sku ?? '—'}</p>
                          </td>

                          {/* Ledger menyimpan kuantitas sebagai nilai mutlak, jadi arah
                              koreksi dibaca dari selisih stok sebelum dan sesudah. */}
                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            {(() => {
                              const delta = row.stock_after - row.stock_before;
                              return (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-bold font-mono ${
                                  delta >= 0
                                    ? 'bg-teal-50 border-teal-200 text-teal-700'
                                    : 'bg-rose-50 border-rose-200 text-rose-700'
                                }`}>
                                  {delta >= 0 ? `+${delta}` : delta}
                                </span>
                              );
                            })()}
                          </td>

                          <td className="px-5 py-3.5 text-center text-[11px] font-mono text-gray-500 whitespace-nowrap">
                            {row.stock_before} → <span className="font-bold text-gray-800">{row.stock_after}</span>
                          </td>

                          <td className="px-5 py-3.5 text-xs text-gray-600 max-w-xs truncate" title={row.notes ?? ''}>
                            {row.notes ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-[11px] text-gray-400">
                  Menampilkan {adjustments.from ?? 0}–{adjustments.to ?? 0} dari {adjustments.total} koreksi
                </p>
                <Pagination links={adjustments.links} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
