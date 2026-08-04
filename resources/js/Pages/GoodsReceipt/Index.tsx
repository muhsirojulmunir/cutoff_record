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

interface Movement {
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
  movements: {
    data: Movement[];
    links: { url: string | null; label: string; active: boolean }[];
    from: number;
    to: number;
    total: number;
  };
  filters: { search?: string; warehouse_id?: string };
  products: Product[];
  warehouses: Warehouse[];
  canCreate: boolean;
}

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const inputClass =
  'w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all';

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function GoodsReceiptIndex({ movements, filters, products, warehouses, canCreate }: Props) {
  const { flash } = usePage<PageProps>().props;

  const [search, setSearch] = useState(filters.search ?? '');
  const [warehouseId, setWarehouseId] = useState(filters.warehouse_id ?? '');

  const { data, setData, post, processing, errors, reset } = useForm({
    product_id: '',
    warehouse_id: warehouses[0]?.id ? String(warehouses[0].id) : '',
    quantity: '',
    notes: '',
  });

  const selectedProduct = useMemo(
    () => products.find((product) => String(product.id) === data.product_id) ?? null,
    [products, data.product_id],
  );

  function applyFilter(next?: { search?: string; warehouse_id?: string }) {
    router.get('/barang-masuk', {
      search: next?.search ?? search,
      warehouse_id: next?.warehouse_id ?? warehouseId,
    }, { preserveState: true, replace: true });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    post('/barang-masuk', {
      preserveScroll: true,
      onSuccess: () => reset('product_id', 'quantity', 'notes'),
    });
  }

  return (
    <AppLayout>
      <Head title="Barang Masuk" />
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Barang Masuk</h1>
          <p className="text-gray-500 text-xs mt-1">Stok / Penambahan stok manual beserta riwayatnya</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form penambahan stok */}
          {canCreate && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden h-fit">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">Catat Barang Masuk</h2>
              </div>

              <form onSubmit={submit} className="p-6 space-y-4">
                <div>
                  <label htmlFor="product_id" className={labelClass}>
                    Produk <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="product_id"
                    value={data.product_id}
                    onChange={(e) => setData('product_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Pilih Produk --</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        [{product.sku}] {product.name}
                      </option>
                    ))}
                  </select>
                  {selectedProduct && (
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      Stok saat ini{' '}
                      <span className="font-mono font-bold text-gray-800">{selectedProduct.stock} pcs</span>
                      {data.quantity && Number(data.quantity) > 0 && (
                        <>
                          {' → menjadi '}
                          <span className="font-mono font-bold text-teal-600">
                            {selectedProduct.stock + Number(data.quantity)} pcs
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  {errors.product_id && <p className="text-rose-500 text-xs mt-1">{errors.product_id}</p>}
                </div>

                <div>
                  <label htmlFor="warehouse_id" className={labelClass}>
                    Gudang <span className="text-rose-500">*</span>
                  </label>
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
                    Jumlah Masuk (pcs) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="quantity"
                    type="number"
                    min={1}
                    value={data.quantity}
                    onChange={(e) => setData('quantity', e.target.value)}
                    placeholder="Contoh: 50"
                    className={inputClass}
                  />
                  {errors.quantity && <p className="text-rose-500 text-xs mt-1">{errors.quantity}</p>}
                </div>

                <div>
                  <label htmlFor="notes" className={labelClass}>
                    Keterangan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="notes"
                    type="text"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                    placeholder="Mis. stok awal, retur customer, kiriman pabrik"
                    className={inputClass}
                  />
                  {errors.notes && <p className="text-rose-500 text-xs mt-1">{errors.notes}</p>}
                </div>

                <button
                  type="submit"
                  disabled={processing}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-teal-200/40 disabled:opacity-50"
                >
                  {processing ? 'Menyimpan...' : 'Tambah Stok'}
                </button>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Penerimaan barang dari Purchase Order tidak perlu dicatat di sini — stoknya bertambah
                  otomatis saat penerimaan PO.
                </p>
              </form>
            </div>
          )}

          {/* Riwayat barang masuk */}
          <div className={`${canCreate ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-4`}>
            <div className="bg-white border border-gray-300 rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                    placeholder="Cari SKU atau nama produk..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 absolute left-3.5 top-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                  </svg>
                </div>

                <select
                  value={warehouseId}
                  onChange={(e) => { setWarehouseId(e.target.value); applyFilter({ warehouse_id: e.target.value }); }}
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-600 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">Semua Gudang</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => applyFilter()}
                  className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-400 hover:border-teal-500 transition-all"
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
                      <th className="px-5 py-3.5">Gudang</th>
                      <th className="px-5 py-3.5 text-center">Masuk</th>
                      <th className="px-5 py-3.5 text-center">Stok</th>
                      <th className="px-5 py-3.5">Keterangan</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 text-sm">
                    {movements.data.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-14 text-center text-gray-400">
                          Belum ada catatan barang masuk.
                        </td>
                      </tr>
                    ) : (
                      movements.data.map((movement) => (
                        <tr key={movement.id} className="hover:bg-teal-50/60 transition-colors">
                          <td className="px-5 py-3.5 text-[11px] text-gray-500 whitespace-nowrap">
                            {fmtDateTime(movement.created_at)}
                            <span className="block text-gray-400">{movement.creator?.name ?? '—'}</span>
                          </td>

                          <td className="px-5 py-3.5">
                            <p className="text-xs font-semibold text-gray-800">{movement.product?.name ?? '—'}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{movement.product?.sku ?? '—'}</p>
                          </td>

                          <td className="px-5 py-3.5 text-xs text-gray-600">{movement.warehouse?.name ?? '—'}</td>

                          <td className="px-5 py-3.5 text-center whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold font-mono">
                              +{movement.quantity}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-center text-[11px] font-mono text-gray-500 whitespace-nowrap">
                            {movement.stock_before} → <span className="font-bold text-gray-800">{movement.stock_after}</span>
                          </td>

                          <td className="px-5 py-3.5 text-xs text-gray-600 max-w-xs truncate" title={movement.notes ?? ''}>
                            {movement.notes ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-[11px] text-gray-400">
                  Menampilkan {movements.from ?? 0}–{movements.to ?? 0} dari {movements.total} catatan
                </p>
                <Pagination links={movements.links} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
