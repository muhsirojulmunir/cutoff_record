import React, { useState } from 'react';
import { Head, Link, router, usePage, useForm } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import Pagination from '../../Components/Pagination';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Product {
  id: number;
  sku: string;
  name: string;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface Creator {
  id: number;
  name: string;
}

interface StockMovement {
  id: number;
  product_id: number;
  warehouse_id: number | null;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  stock_before: number;
  stock_after: number;
  reference_type: string | null;
  reference_id: number | null;
  reference_number: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  product: Product | null;
  warehouse: Warehouse | null;
  creator: Creator | null;
}

interface StockMovementIndexProps {
  stockMovements: {
    data: StockMovement[];
    links: any[];
    current_page: number;
    total: number;
  };
  warehouses: Warehouse[];
  products: Product[];
  filters: {
    search?: string;
    movement_type?: string;
    warehouse_id?: string;
    start_date?: string;
    end_date?: string;
  };
}

const typeBadgeColor: Record<string, string> = {
  in:         'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  out:        'bg-rose-500/10 border-rose-500/20 text-rose-400',
  adjustment: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
};

const typeLabel: Record<string, string> = {
  in:         'Masuk (IN)',
  out:        'Keluar (OUT)',
  adjustment: 'Adjustment',
};

export default function Index({ stockMovements, warehouses, products, filters }: StockMovementIndexProps) {
  const { flash, auth, errors: pageErrors } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const [search, setSearch] = useState(filters.search ?? '');
  const [movementType, setMovementType] = useState(filters.movement_type ?? '');
  const [warehouseId, setWarehouseId] = useState(filters.warehouse_id ?? '');
  const [startDate, setStartDate] = useState(filters.start_date ?? '');
  const [endDate, setEndDate] = useState(filters.end_date ?? '');

  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  const canViewPo   = permissions.includes('purchase_order.view');
  const canAdjust   = permissions.includes('stock.adjust');

  const { data, setData, post, processing, errors, reset } = useForm({
    product_id: '',
    warehouse_id: '',
    quantity: '',
    notes: '',
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.get('/stock-movements', {
      search,
      movement_type: movementType,
      warehouse_id: warehouseId,
      start_date: startDate,
      end_date: endDate,
    }, { preserveState: true });
  }

  function handleFilterChange(key: string, value: string) {
    const newFilters = {
      search,
      movement_type: movementType,
      warehouse_id: warehouseId,
      start_date: startDate,
      end_date: endDate,
      [key]: value,
    };

    if (key === 'movement_type') setMovementType(value);
    if (key === 'warehouse_id') setWarehouseId(value);

    router.get('/stock-movements', newFilters, { preserveState: true });
  }

  function handleResetFilters() {
    setSearch('');
    setMovementType('');
    setWarehouseId('');
    setStartDate('');
    setEndDate('');
    router.get('/stock-movements', {}, { preserveState: true });
  }

  function handleOpenAdjustModal() {
    reset();
    setAdjustModalOpen(true);
  }

  function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/stock-movements/adjust', {
      onSuccess: () => {
        setAdjustModalOpen(false);
        reset();
      },
    });
  }

  return (
    <AppLayout>
      <Head title="Inventory Ledger (Histori Stok)" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Inventory Ledger</h1>
            <p className="text-slate-400 text-xs mt-1">Laporan / Histori Pergerakan Stok</p>
          </div>

          {canAdjust && (
            <button
              onClick={handleOpenAdjustModal}
              className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-950/40 transition-all flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Stock Adjustment
            </button>
          )}
        </div>

        {/* Alerts */}
        <Alert message={flash.success ?? null} type="success" />
        {flash.error && <Alert message={flash.error} type="error" />}

        {/* Filter Card */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-xl">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nama produk, SKU, No Ref..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all placeholder:text-slate-600"
                  />
                  <div className="absolute left-3 top-2.5 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Movement Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Tipe Pergerakan</label>
                <select
                  value={movementType}
                  onChange={(e) => handleFilterChange('movement_type', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Tipe</option>
                  <option value="in">Masuk (IN)</option>
                  <option value="out">Keluar (OUT)</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>

              {/* Warehouse */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Gudang</label>
                <select
                  value={warehouseId}
                  onChange={(e) => handleFilterChange('warehouse_id', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Gudang</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                  ))}
                </select>
              </div>

              {/* Date Start */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Mulai Tanggal</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>

              {/* Date End */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">Sampai Tanggal</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                Reset Filter
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5 shadow-md"
              >
                Cari Data
              </button>
            </div>
          </form>
        </div>

        {/* Ledger Table */}
        <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-slate-400 text-[10px] font-bold uppercase tracking-wider bg-slate-950/60">
                  <th className="py-3 px-6">Tanggal</th>
                  <th className="py-3 px-6">Produk</th>
                  <th className="py-3 px-6">Gudang</th>
                  <th className="py-3 px-6 text-center">Tipe</th>
                  <th className="py-3 px-6 text-center">Qty</th>
                  <th className="py-3 px-6 text-center">Sebelum</th>
                  <th className="py-3 px-6 text-center">Sesudah</th>
                  <th className="py-3 px-6">No. Referensi</th>
                  <th className="py-3 px-6">Catatan</th>
                  <th className="py-3 px-6">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-sm text-slate-300">
                {stockMovements.data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500 font-medium">
                      Tidak ada data pergerakan stok ditemukan.
                    </td>
                  </tr>
                ) : (
                  stockMovements.data.map((movement) => (
                    <tr key={movement.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 px-6 whitespace-nowrap text-xs text-slate-400">
                        {new Date(movement.created_at).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-slate-200 block">
                          {movement.product ? movement.product.name : '—'}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          SKU: {movement.product ? movement.product.sku : '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        {movement.warehouse ? (
                          <>
                            <span className="text-slate-200 block font-medium">{movement.warehouse.name}</span>
                            <span className="text-[10px] text-slate-500 mt-0.5 block">WH: {movement.warehouse.code}</span>
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-bold ${typeBadgeColor[movement.movement_type]}`}>
                          {typeLabel[movement.movement_type]}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center font-bold text-slate-100">
                        {movement.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center text-slate-400">
                        {movement.stock_before.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center font-semibold text-slate-200">
                        {movement.stock_after.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6">
                        {movement.reference_number ? (
                          movement.reference_type === 'purchase_order' && canViewPo ? (
                            <Link
                              href={`/purchase-orders/${movement.reference_id}`}
                              className="text-violet-400 hover:text-violet-300 font-semibold underline underline-offset-2 decoration-violet-500/40 hover:decoration-violet-400 transition-all text-xs"
                            >
                              {movement.reference_number}
                            </Link>
                          ) : (
                            <span className="text-slate-400 font-medium text-xs">{movement.reference_number}</span>
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-slate-400 text-xs max-w-[200px] truncate" title={movement.notes ?? ''}>
                        {movement.notes || '—'}
                      </td>
                      <td className="py-3.5 px-6 text-slate-400 text-xs">
                        {movement.creator ? movement.creator.name : 'System'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-900 bg-slate-950/40 flex justify-between items-center">
            <div className="text-slate-500 text-xs font-medium">
              Menampilkan {stockMovements.data.length} dari {stockMovements.total} pergerakan stok
            </div>
            <Pagination links={stockMovements.links} />
          </div>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-white">Stock Adjustment (Penyesuaian Stok)</h3>
            <p className="text-sm text-slate-400 mt-1">
              Melakukan penyesuaian stok manual pada produk dan gudang tertentu.
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 mt-6">
              {pageErrors?.error && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs font-semibold leading-relaxed">
                  {pageErrors.error}
                </div>
              )}

              {/* Product */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">Produk <span className="text-rose-500">*</span></label>
                <select
                  value={data.product_id}
                  onChange={(e) => setData('product_id', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">Pilih Produk...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
                {errors.product_id && <p className="text-rose-500 text-xs">{errors.product_id}</p>}
              </div>

              {/* Warehouse */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">Gudang <span className="text-rose-500">*</span></label>
                <select
                  value={data.warehouse_id}
                  onChange={(e) => setData('warehouse_id', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">Pilih Gudang...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
                {errors.warehouse_id && <p className="text-rose-500 text-xs">{errors.warehouse_id}</p>}
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">Kuantitas Penyesuaian <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  value={data.quantity}
                  onChange={(e) => setData('quantity', e.target.value)}
                  placeholder="Gunakan tanda minus (-) untuk mengurangi stok"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
                {errors.quantity && <p className="text-rose-500 text-xs">{errors.quantity}</p>}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">Alasan & Catatan <span className="text-rose-500">*</span></label>
                <textarea
                  rows={3}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Tuliskan alasan penyesuaian stok..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all placeholder:text-slate-600 resize-none"
                />
                {errors.notes && <p className="text-rose-500 text-xs">{errors.notes}</p>}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  disabled={processing}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all border border-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-950/40 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Menyimpan...
                    </>
                  ) : 'Simpan Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
