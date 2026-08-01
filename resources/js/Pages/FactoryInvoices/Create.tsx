import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PageProps } from '../../Types';

interface Supplier { id: number; name: string; supplier_code: string; }
interface PO { id: number; po_number: string; supplier_id: number; grand_total: string; }
interface Product { id: number; sku: string; name: string; selling_price: string; unit: string; }

interface FormItem {
  [key: string]: unknown;
  product_id: number | null;
  product_name: string;
  product_code: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID');

export default function Create({ suppliers, purchaseOrders, products }: { suppliers: Supplier[]; purchaseOrders: PO[]; products: Product[] }) {
  const { flash } = usePage<PageProps>().props;

  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [poId, setPoId] = useState<number | ''>('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [notes, setNotes] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [items, setItems] = useState<FormItem[]>([
    { product_id: null, product_name: '', product_code: '', quantity: 1, unit: 'pcs', unit_price: 0, discount_amount: 0, tax_amount: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When PO selected, autofill supplier
  function handlePoChange(val: number | '') {
    setPoId(val);
    if (val) {
      const po = purchaseOrders.find(p => p.id === val);
      if (po) setSupplierId(po.supplier_id);
    }
  }

  function addItem() {
    setItems([...items, { product_id: null, product_name: '', product_code: '', quantity: 1, unit: 'pcs', unit_price: 0, discount_amount: 0, tax_amount: 0 }]);
  }
  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, field: keyof FormItem, val: unknown) {
    const updated = [...items];
    (updated[i] as Record<string, unknown>)[field] = val;
    if (field === 'product_id' && val) {
      const p = products.find(pr => pr.id === val);
      if (p) {
        updated[i].product_name = p.name;
        updated[i].product_code = p.sku;
        updated[i].unit         = p.unit || 'pcs';
        updated[i].unit_price   = Number(p.selling_price);
      }
    }
    setItems(updated);
  }

  const itemSubtotals = items.map(it => it.quantity * it.unit_price - it.discount_amount + it.tax_amount);
  const rawSubtotal   = itemSubtotals.reduce((a, b) => a + b, 0);
  const grandTotal    = rawSubtotal - discountAmount + taxAmount + shippingCost;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supplierId) { setError('Pilih supplier terlebih dahulu.'); return; }
    if (items.some(it => !it.product_name.trim())) { setError('Nama produk wajib diisi untuk semua item.'); return; }
    setLoading(true);
    router.post('/factory-invoices', {
      supplier_id: supplierId,
      purchase_order_id: poId || null,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      supplier_invoice_number: supplierInvNo || null,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      shipping_cost: shippingCost,
      notes: notes || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: items as any,
    }, {
      onError: errs => { setError(Object.values(errs)[0] as string); setLoading(false); },
      onFinish: () => setLoading(false),
    });
  }

  return (
    <AppLayout>
      <Head title="Buat Invoice Pabrik" />
      <div className="flex items-center gap-4 mb-6">
        <Link href="/factory-invoices" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
        </Link>
        <h1 className="text-2xl font-bold text-white">Buat Invoice Pabrik</h1>
      </div>

      {error && <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-sm font-semibold">{error}</div>}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Header */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Info Invoice</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Referensi PO (opsional)</label>
                <select value={poId} onChange={e => handlePoChange(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none">
                  <option value="">— Tanpa Referensi PO —</option>
                  {purchaseOrders.map(po => <option key={po.id} value={po.id}>{po.po_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Supplier / Pabrik *</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none">
                  <option value="">— Pilih Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">No. Invoice dari Supplier</label>
                <input value={supplierInvNo} onChange={e => setSupplierInvNo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none"
                  placeholder="Misal: INV/PAB/2026/001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Tgl Invoice *</label>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Jatuh Tempo</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Item / SKU</h3>
              <button type="button" onClick={addItem} className="text-xs text-violet-400 hover:text-violet-300 font-semibold">+ Tambah Item</button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Produk (opsional)</label>
                      <select value={item.product_id ?? ''} onChange={e => updateItem(i, 'product_id', e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none">
                        <option value="">— Produk Lainnya —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Nama Item *</label>
                      <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Qty</label>
                      <input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs text-right font-bold focus:ring-1 focus:ring-violet-500 focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Satuan</label>
                      <input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:ring-1 focus:ring-violet-500 focus:outline-none" />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Harga Satuan (Rp)</label>
                      <input type="number" min="0" step="100" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs text-right font-bold focus:ring-1 focus:ring-violet-500 focus:outline-none" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Diskon Item</label>
                      <input type="number" min="0" value={item.discount_amount} onChange={e => updateItem(i, 'discount_amount', Number(e.target.value))}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-rose-300 text-xs text-right font-bold focus:ring-1 focus:ring-rose-500 focus:outline-none" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Pajak Item</label>
                      <input type="number" min="0" value={item.tax_amount} onChange={e => updateItem(i, 'tax_amount', Number(e.target.value))}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-emerald-300 text-xs text-right font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                    </div>
                    <div className="col-span-2 flex items-end justify-between">
                      <div>
                        <p className="text-[10px] text-slate-500">Subtotal</p>
                        <p className="text-xs font-extrabold text-emerald-400">Rp {fmt(itemSubtotals[i] ?? 0)}</p>
                      </div>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="text-rose-400 hover:text-rose-300 text-xs font-bold">✕</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Catatan Internal</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm focus:ring-1 focus:ring-violet-500 focus:outline-none resize-none" />
          </div>
        </div>

        {/* Right — Totals */}
        <div className="space-y-5">
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Biaya Tambahan</h3>
            {[{ label: 'Diskon PO', val: discountAmount, set: setDiscountAmount, cls: 'text-rose-400' },
              { label: 'Pajak PO', val: taxAmount, set: setTaxAmount, cls: 'text-emerald-400' },
              { label: 'Ongkos Kirim', val: shippingCost, set: setShippingCost, cls: 'text-slate-200' }].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{f.label} (Rp)</label>
                <input type="number" min="0" step="100" value={f.val} onChange={e => f.set(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 ${f.cls} text-xs text-right font-bold focus:ring-1 focus:ring-violet-500 focus:outline-none`} />
              </div>
            ))}
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ringkasan</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>Subtotal Item</span><span className="font-semibold text-slate-200">Rp {fmt(rawSubtotal)}</span></div>
              <div className="flex justify-between text-slate-400"><span>Diskon PO</span><span className="font-semibold text-rose-400">-Rp {fmt(discountAmount)}</span></div>
              <div className="flex justify-between text-slate-400"><span>Pajak PO</span><span className="font-semibold text-emerald-400">+Rp {fmt(taxAmount)}</span></div>
              <div className="flex justify-between text-slate-400"><span>Ongkir</span><span className="font-semibold text-slate-200">Rp {fmt(shippingCost)}</span></div>
              <div className="border-t border-slate-900 pt-2.5 flex justify-between items-center">
                <span className="font-extrabold text-white">Total Invoice</span>
                <span className="text-lg font-extrabold text-emerald-400">Rp {fmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-950/40 transition-all disabled:opacity-50">
            {loading ? 'Menyimpan...' : '💾 Simpan Invoice Pabrik'}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
