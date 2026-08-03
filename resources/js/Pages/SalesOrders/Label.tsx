import { Head, Link, usePage } from '@inertiajs/react';

interface SalesOrderItem {
  id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit: string;
}

interface Customer {
  id: number;
  name: string;
  customer_code: string;
  phone: string | null;
  address: string | null;
  city?: string | null;
  province?: string | null;
}

interface SalesOrder {
  id: number;
  so_number: string;
  order_date: string;
  sales_channel: string;
  tracking_number: string | null;
  recipient_name: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  city: string | null;
  province: string | null;
  total_weight: string | null;
  notes: string | null;
  customer: Customer | null;
  items: SalesOrderItem[];
}

// ── SESUAIKAN DATA PENGIRIM DI SINI ────────────────────────────────────────
const SHIPPER = {
  name:    'TRIPAQ',
  phone:   '0812-0000-0000',
  address: 'Gudang Pusat — Jl. Contoh No. 1, Surabaya, Jawa Timur',
};
// ───────────────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  manual: 'Manual',
  grosir: 'Grosir Offline',
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  website: 'Website',
  other: 'Lainnya',
};

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Garis-garis barcode dibangun dari kode resi sendiri (deterministik),
 * jadi label tetap punya penanda visual tanpa perlu pustaka barcode.
 */
function BarcodeStrip({ code }: { code: string }) {
  const bars = Array.from(code).flatMap((char, index) => {
    const value = char.charCodeAt(0) + index;
    return [
      { width: (value % 3) + 1, filled: true },
      { width: (value % 2) + 1, filled: false },
    ];
  });

  return (
    <div className="flex items-end gap-[1px] h-12 overflow-hidden" aria-hidden="true">
      {bars.map((bar, index) => (
        <span
          key={index}
          style={{ width: bar.width * 2, backgroundColor: bar.filled ? '#0f172a' : 'transparent' }}
          className="h-full inline-block"
        />
      ))}
    </div>
  );
}

export default function SalesOrderLabel() {
  const { salesOrder } = usePage<{ salesOrder: SalesOrder; [key: string]: unknown }>().props;

  const resi = salesOrder.tracking_number;
  const address = [salesOrder.shipping_address, salesOrder.city, salesOrder.province]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');

  const totalQty = salesOrder.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <Head title={`Label ${salesOrder.so_number}`} />
      <style>{PRINT_CSS}</style>

      <div className="print-shell min-h-screen bg-gray-100 p-6">
        {/* Toolbar */}
        <div className="no-print max-w-[560px] mx-auto mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/sales-orders/${salesOrder.id}`}
            className="px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:border-gray-400 transition-all"
          >
            ← Kembali ke Sales Order
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!resi}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cetak Label
          </button>
        </div>

        {!resi && (
          <div className="no-print max-w-[560px] mx-auto mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-3">
            No. Resi / AWB belum diisi. Isi resinya dulu di halaman Sales Order agar label bisa dicetak.
          </div>
        )}

        {/* Label 10 × 15 cm */}
        <div id="label-print-area" className="mx-auto bg-white text-gray-900" style={{ width: 560 }}>
          <div className="border-2 border-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-gray-900">
              <div>
                <p className="text-lg font-black tracking-tight leading-none">{SHIPPER.name}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{CHANNEL_LABEL[salesOrder.sales_channel] ?? salesOrder.sales_channel}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-600">No. SO</p>
                <p className="text-sm font-bold font-mono leading-tight">{salesOrder.so_number}</p>
                <p className="text-[10px] text-gray-600">{fmtDate(salesOrder.order_date)}</p>
              </div>
            </div>

            {/* Resi + barcode */}
            <div className="px-4 py-3 border-b-2 border-gray-900 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">No. Resi / AWB</p>
              <p className="text-2xl font-black font-mono tracking-wider mt-1">{resi ?? '— BELUM DIISI —'}</p>
              {resi && (
                <div className="mt-2 flex justify-center">
                  <BarcodeStrip code={resi} />
                </div>
              )}
            </div>

            {/* Penerima */}
            <div className="px-4 py-3 border-b border-gray-300">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Penerima</p>
              <p className="text-base font-bold leading-tight mt-1">
                {salesOrder.recipient_name || salesOrder.customer?.name || '—'}
              </p>
              <p className="text-xs font-mono text-gray-700">
                {salesOrder.customer_phone || salesOrder.customer?.phone || '—'}
              </p>
              <p className="text-xs leading-relaxed mt-1">{address || salesOrder.customer?.address || '—'}</p>
            </div>

            {/* Pengirim */}
            <div className="px-4 py-2.5 border-b border-gray-300 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Pengirim</p>
              <p className="text-xs font-bold mt-0.5">{SHIPPER.name} · {SHIPPER.phone}</p>
              <p className="text-[11px] text-gray-700 leading-relaxed">{SHIPPER.address}</p>
            </div>

            {/* Isi paket */}
            <div className="px-4 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Isi Paket</p>
                <p className="text-[10px] text-gray-600">
                  {totalQty} pcs
                  {Number(salesOrder.total_weight) > 0 && ` · ${Number(salesOrder.total_weight).toLocaleString('id-ID')} kg`}
                </p>
              </div>
              <table className="w-full text-[11px] mt-1.5">
                <tbody>
                  {salesOrder.items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-1 pr-2 align-top">
                        <span className="font-semibold">{item.product_name}</span>
                        <span className="block text-[10px] text-gray-500 font-mono">{item.sku}</span>
                      </td>
                      <td className="py-1 text-right align-top font-mono font-bold whitespace-nowrap">
                        {item.quantity} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {salesOrder.notes && (
                <p className="text-[10px] text-gray-600 italic mt-2 leading-relaxed border-t border-gray-200 pt-1.5">
                  Catatan: {salesOrder.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const PRINT_CSS = `
  @media print {
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .no-print { display: none !important; }

    .print-shell {
      padding: 0 !important;
      background: #fff !important;
      min-height: 0 !important;
    }

    /* Label 10 x 15 cm — ukuran standar kertas thermal kurir. */
    #label-print-area {
      width: 100mm !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    @page { size: 100mm 150mm; margin: 3mm; }
  }
`;
