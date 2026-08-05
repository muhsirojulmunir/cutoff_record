import { Head, Link, useForm } from '@inertiajs/react';
import { useState } from 'react';
import AppLayout from '../../Layouts/AppLayout';

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  stock: number;
}

interface Props {
  products: ProductOption[];
}

export default function Create({ products }: Props) {
  const { data, setData, post, processing, errors } = useForm({
    invoice_number: '',
    product_id: '' as string | number,
    quantity: '' as string | number,
    reason: '',
  });

  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredProducts = products.filter(p =>
    p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  function selectProduct(product: ProductOption) {
    setSelectedProduct(product);
    setData('product_id', product.id);
    setProductSearch(`${product.sku} — ${product.name}`);
    setShowDropdown(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    post('/stock-returns');
  }

  return (
    <AppLayout>
      <Head title="Ajukan Retur Stok" />

      <div className="max-w-lg mx-auto space-y-6">
        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ajukan Retur Stok</h1>
          <p className="text-gray-400 text-xs mt-1">Inventori / Retur Stok / Ajukan Baru</p>
        </div>

        {/* ── Form Card ── */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Info banner */}
          <div className="px-6 py-4 bg-amber-50/70 border-b border-amber-100 flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-amber-500 shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-amber-800">Retur menunggu persetujuan Leader</p>
              <p className="text-xs text-amber-600 mt-0.5">Stok belum akan berubah sampai Leader menyetujui retur ini.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Nomor Invoice */}
            <div className="space-y-1.5">
              <label htmlFor="invoice_number" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Nomor Invoice <span className="text-rose-500 normal-case font-normal">(wajib)</span>
              </label>
              <input
                id="invoice_number"
                type="text"
                value={data.invoice_number}
                onChange={e => setData('invoice_number', e.target.value)}
                placeholder="Contoh: INV-202408-0001"
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm font-mono focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all ${errors.invoice_number ? 'border-rose-400' : 'border-gray-200'}`}
                disabled={processing}
              />
              {errors.invoice_number && <p className="text-rose-400 text-xs">{errors.invoice_number}</p>}
            </div>

            {/* Pilih Produk */}
            <div className="space-y-1.5 relative">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Produk (SKU) <span className="text-rose-500 normal-case font-normal">(wajib)</span>
              </label>
              <input
                type="text"
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowDropdown(true); setSelectedProduct(null); setData('product_id', ''); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Ketik SKU atau nama produk..."
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all ${errors.product_id ? 'border-rose-400' : 'border-gray-200'}`}
                disabled={processing}
                autoComplete="off"
              />
              {errors.product_id && <p className="text-rose-400 text-xs">{errors.product_id}</p>}

              {/* Dropdown */}
              {showDropdown && filteredProducts.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto">
                  {filteredProducts.slice(0, 30).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProduct(p)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-violet-50 transition-colors text-left"
                    >
                      <div>
                        <span className="font-mono text-xs font-semibold text-violet-600">{p.sku}</span>
                        <span className="text-gray-600 text-xs ml-2 truncate">{p.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 ml-2 shrink-0">Stok: {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && filteredProducts.length === 0 && productSearch && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 px-4 py-3 text-xs text-gray-400 text-center">
                  Produk tidak ditemukan
                </div>
              )}
            </div>

            {/* Info stok saat ini */}
            {selectedProduct && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                <span className="text-xs text-slate-600">Stok saat ini: <strong className="text-slate-800">{selectedProduct.stock}</strong> unit</span>
              </div>
            )}

            {/* Qty */}
            <div className="space-y-1.5">
              <label htmlFor="quantity" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Jumlah Qty (Unit) <span className="text-rose-500 normal-case font-normal">(wajib)</span>
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                value={data.quantity}
                onChange={e => setData('quantity', e.target.value)}
                placeholder="Contoh: 5"
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all ${errors.quantity ? 'border-rose-400' : 'border-gray-200'}`}
                disabled={processing}
              />
              {errors.quantity && <p className="text-rose-400 text-xs">{errors.quantity}</p>}
            </div>

            {/* Keterangan Retur */}
            <div className="space-y-1.5">
              <label htmlFor="reason" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Keterangan Retur <span className="text-rose-500 normal-case font-normal">(wajib)</span>
              </label>
              <textarea
                id="reason"
                rows={3}
                value={data.reason}
                onChange={e => setData('reason', e.target.value)}
                placeholder="Contoh: Barang cacat / rusak saat diterima customer, customer komplain warna tidak sesuai..."
                className={`w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all resize-none ${errors.reason ? 'border-rose-400' : 'border-gray-200'}`}
                disabled={processing}
              />
              {errors.reason && <p className="text-rose-400 text-xs">{errors.reason}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Link
                href="/stock-returns"
                className="px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300 rounded-xl text-sm font-semibold transition-all"
              >
                Batal
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 active:scale-[0.99] text-white rounded-xl text-sm font-semibold shadow-lg shadow-violet-200/40 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {processing && (
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                {processing ? 'Mengajukan...' : 'Ajukan Retur'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
      )}
    </AppLayout>
  );
}
