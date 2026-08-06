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
  adjustment: 'bg-orange-50 border-orange-200 text-orange-600',
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

  // Pengosongan ledger untuk keperluan testing — khusus Super Admin.
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const canViewPo   = permissions.includes('purchase_order.view');
  const canAdjust   = permissions.includes('stock.adjust');
  const canReset    = Boolean(auth.user?.is_super_admin);

  function handleResetLedger() {
    if (resetInput.trim() !== 'KOSONGKAN') {
      setResetError('Ketik KOSONGKAN persis seperti itu untuk melanjutkan.');
      return;
    }

    setResetting(true);
    router.delete('/stock-movements/reset', {
      data: { confirmation: resetInput.trim() },
      onSuccess: () => setResetModalOpen(false),
      onError: (err) => setResetError(Object.values(err)[0] as string),
      onFinish: () => setResetting(false),
    });
  }

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
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory Ledger</h1>
            <p className="text-gray-500 text-xs mt-1">Laporan / Histori Pergerakan Stok</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
          {canReset && (
            <button
              type="button"
              onClick={() => { setResetModalOpen(true); setResetInput(''); setResetError(null); }}
              className="px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 hover:border-rose-400 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Kosongkan Ledger
            </button>
          )}

          {canAdjust && (
            <button
              onClick={handleOpenAdjustModal}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Stock Adjustment
            </button>
          )}
          </div>
        </div>

        {/* Alerts */}
        <Alert message={flash.success ?? null} type="success" />
        {flash.error && <Alert message={flash.error} type="error" />}

        {/* Filter Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xl">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nama produk, SKU, No Ref..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all placeholder:text-gray-400"
                  />
                  <div className="absolute left-3 top-2.5 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Movement Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Tipe Pergerakan</label>
                <select
                  value={movementType}
                  onChange={(e) => handleFilterChange('movement_type', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Tipe</option>
                  <option value="in">Masuk (IN)</option>
                  <option value="out">Keluar (OUT)</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>

              {/* Warehouse */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Gudang</label>
                <select
                  value={warehouseId}
                  onChange={(e) => handleFilterChange('warehouse_id', e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Semua Gudang</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                  ))}
                </select>
              </div>

              {/* Date Start */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Mulai Tanggal</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>

              {/* Date End */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Sampai Tanggal</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 hover:border-gray-300 rounded-xl text-xs font-semibold transition-all"
              >
                Reset Filter
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-xs font-semibold border border-gray-300 hover:border-gray-400 transition-all flex items-center gap-1.5 shadow-md"
              >
                Cari Data
              </button>
            </div>
          </form>
        </div>

        {/* Ledger Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
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
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {stockMovements.data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 font-medium">
                      Tidak ada data pergerakan stok ditemukan.
                    </td>
                  </tr>
                ) : (
                  stockMovements.data.map((movement) => (
                    <tr key={movement.id} className="hover:bg-teal-50/60 transition-colors">
                      <td className="py-3.5 px-6 whitespace-nowrap text-xs text-gray-500">
                        {new Date(movement.created_at).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-semibold text-gray-800 block">
                          {movement.product ? movement.product.name : '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 mt-0.5 block">
                          SKU: {movement.product ? movement.product.sku : '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        {movement.warehouse ? (
                          <>
                            <span className="text-gray-800 block font-medium">{movement.warehouse.name}</span>
                            <span className="text-[10px] text-gray-400 mt-0.5 block">WH: {movement.warehouse.code}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 border rounded-full text-xs font-bold ${typeBadgeColor[movement.movement_type]}`}>
                          {typeLabel[movement.movement_type]}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center font-bold text-gray-900">
                        {movement.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center text-gray-500">
                        {movement.stock_before.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6 text-center font-semibold text-gray-800">
                        {movement.stock_after.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-6">
                        {movement.reference_number ? (
                          movement.reference_type === 'purchase_order' && canViewPo ? (
                            <Link
                              href={`/purchase-orders/${movement.reference_id}`}
                              className="text-teal-400 hover:text-teal-600 font-semibold underline underline-offset-2 decoration-teal-500/40 hover:decoration-teal-400 transition-all text-xs"
                            >
                              {movement.reference_number}
                            </Link>
                          ) : (
                            <span className="text-gray-500 font-medium text-xs">{movement.reference_number}</span>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-gray-500 text-xs max-w-[200px] truncate" title={movement.notes ?? ''}>
                        {movement.notes || '—'}
                      </td>
                      <td className="py-3.5 px-6 text-gray-500 text-xs">
                        {movement.creator ? movement.creator.name : 'System'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-gray-200 bg-white/80 flex justify-between items-center">
            <div className="text-gray-400 text-xs font-medium">
              Menampilkan {stockMovements.data.length} dari {stockMovements.total} pergerakan stok
            </div>
            <Pagination links={stockMovements.links} />
          </div>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-gray-900">Stock Adjustment (Penyesuaian Stok)</h3>
            <p className="text-sm text-gray-500 mt-1">
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
                <label className="block text-sm font-semibold text-gray-700">Produk <span className="text-rose-500">*</span></label>
                <select
                  value={data.product_id}
                  onChange={(e) => setData('product_id', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
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
                <label className="block text-sm font-semibold text-gray-700">Gudang <span className="text-rose-500">*</span></label>
                <select
                  value={data.warehouse_id}
                  onChange={(e) => setData('warehouse_id', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all cursor-pointer"
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
                <label className="block text-sm font-semibold text-gray-700">Kuantitas Penyesuaian <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  value={data.quantity}
                  onChange={(e) => setData('quantity', e.target.value)}
                  placeholder="Gunakan tanda minus (-) untuk mengurangi stok"
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                />
                {errors.quantity && <p className="text-rose-500 text-xs">{errors.quantity}</p>}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">Alasan & Catatan <span className="text-rose-500">*</span></label>
                <textarea
                  rows={3}
                  value={data.notes}
                  onChange={(e) => setData('notes', e.target.value)}
                  placeholder="Tuliskan alasan penyesuaian stok..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder:text-gray-400 resize-none"
                />
                {errors.notes && <p className="text-rose-500 text-xs">{errors.notes}</p>}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-300">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  disabled={processing}
                  className="px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-700 rounded-xl text-sm font-semibold border border-teal-300 hover:border-teal-400 transition-all border border-gray-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-900" fill="none" viewBox="0 0 24 24">
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

      {/* Kosongkan Ledger — khusus Super Admin */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-bold text-gray-900">Kosongkan Inventory Ledger</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Untuk menyiapkan sistem dari kondisi bersih</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-rose-50/80 border border-rose-200/80">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="space-y-2 text-xs text-gray-700 leading-relaxed">
                  <p className="font-bold text-rose-700">Tindakan ini tidak bisa dibatalkan.</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Seluruh riwayat pergerakan stok dihapus permanen</li>
                    <li>Stok semua produk kembali ke <span className="font-bold">0</span></li>
                  </ul>
                  <p className="text-gray-500">
                    Master data seperti produk, kategori, customer, dan user tidak ikut terhapus.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Ketik <span className="font-mono text-rose-600">KOSONGKAN</span> untuk melanjutkan
                </label>
                <input
                  type="text"
                  value={resetInput}
                  onChange={(e) => { setResetInput(e.target.value); setResetError(null); }}
                  placeholder="KOSONGKAN"
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-800 text-sm font-mono focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                />
                {resetError && <p className="text-rose-600 text-xs mt-1.5">{resetError}</p>}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  disabled={resetting}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleResetLedger}
                  disabled={resetting || resetInput.trim() !== 'KOSONGKAN'}
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-200/50 transition-all disabled:opacity-40"
                >
                  {resetting ? 'Mengosongkan...' : 'Ya, Kosongkan Semua'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
