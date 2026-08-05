import React from 'react';
import { Head, usePage } from '@inertiajs/react';
import * as XLSX from 'xlsx';

/** Catat unduhan ke riwayat. Kegagalan pencatatan tidak mengganggu unduhan. */
async function catatRiwayatUnduhan(fileName: string, module: string, description?: string) {
  try {
    await fetch('/export-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ file_name: fileName, module, description }),
    });
  } catch {
    // Diabaikan: file sudah berhasil diunduh, riwayat hanya catatan tambahan.
  }
}

interface InvoiceItem {
  id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  subtotal: string;
}
interface Customer {
  id: number;
  name: string;
  customer_code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city?: string | null;
  province?: string | null;
}
interface SalesOrder {
  id: number;
  so_number: string;
  sales_channel: string;
  tracking_number?: string | null;
  shipping_address?: string | null;
  city?: string | null;
  province?: string | null;
  customer_phone?: string | null;
  account_name?: string | null;
  dp_amount?: string | null;
}
interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  shipping_cost: string;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: string;
  notes: string | null;
  customer: Customer | null;
  sales_order: SalesOrder | null;
  creator: { id: number; name: string } | null;
  items: InvoiceItem[];
}

// ── SESUAIKAN DATA PERUSAHAAN DI SINI ──────────────────────────────────────
const COMPANY = {
  name:    'TRIPAQ',
  tagline: 'Head of Marketing Tripaq',
  signer:  'ALFAT SANJAYA',
  bank:    'BCA',
  account: '6100236123',
  holder:  'ELCO NOYAL LUAN NANDA',
};
// ───────────────────────────────────────────────────────────────────────────

const fmt = (v: string | number) =>
  Number(v).toLocaleString('id-ID');

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

const STATUS_LABEL: Record<string, string> = {
  unpaid: 'BELUM LUNAS', partially_paid: 'DP', paid: 'LUNAS', overdue: 'JATUH TEMPO', cancelled: 'BATAL',
};

// ─── Template Invoice ────────────────────────────────────────────────────────
function InvoiceTemplate({ invoice }: { invoice: Invoice }) {
  const subtotal  = Number(invoice.subtotal);
  const discount  = Number(invoice.discount_amount);
  const shipping  = Number(invoice.shipping_cost ?? 0);
  // Ambil nominal DP dari sales_order / paid_amount, atau ekstrak dari teks catatan jika terformat "DP 30% 2.500.000"
  let dp = Number(invoice.sales_order?.dp_amount ?? invoice.paid_amount ?? 0);
  if (dp === 0 && invoice.notes) {
    const match = invoice.notes.match(/dp[^\d]*(\d[\d\.\,]*)/i);
    if (match && match[1]) {
      const parsed = Number(match[1].replace(/[\.,]/g, ''));
      if (!isNaN(parsed)) dp = parsed;
    }
  }

  const total     = Number(invoice.total_amount);
  const remaining = Math.max(0, total - dp);
  const phone     = invoice.sales_order?.customer_phone ?? invoice.customer?.phone ?? '';

  // Alamat pengiriman di Excel terpecah jadi Alamat / Kota / Provinsi, jadi
  // ketiganya digabung agar invoice cetak memuat alamat yang utuh.
  const address = [
    invoice.sales_order?.shipping_address ?? invoice.customer?.address,
    invoice.sales_order?.city ?? invoice.customer?.city,
    invoice.sales_order?.province ?? invoice.customer?.province,
  ]
    .map((part) => (part ?? '').trim())
    .filter((part, idx, parts) => part !== '' && parts.indexOf(part) === idx)
    .join(', ');

  const TEAL = '#00b8b0';

  return (
    <div
      id="invoice-print-area"
      style={{
        // Arial Narrow sering tidak terpasang sehingga fallback-nya berbeda antara
        // layar dan hasil cetak. Stack ini tersedia di semua mesin cetak/PDF.
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
        background: '#fff',
        color: '#111',
        width: '794px',
        minHeight: '1050px',
        margin: '0 auto',
        padding: '40px 48px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* ── TOP: Logo + Title / Date + Invoice No ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* LEFT — Logo & Customer Info */}
        <div style={{ flex: 1 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="4" fill="none"/>
              <polygon points="20,4 34,14 34,28 20,38 6,28 6,14" fill="none" stroke={TEAL} strokeWidth="2.5"/>
              <line x1="20" y1="4" x2="20" y2="38" stroke={TEAL} strokeWidth="1.5"/>
              <line x1="6" y1="14" x2="34" y2="14" stroke={TEAL} strokeWidth="1.5"/>
              <line x1="6" y1="28" x2="34" y2="28" stroke={TEAL} strokeWidth="1.5"/>
            </svg>
            <span style={{ fontFamily: 'Arial, sans-serif', fontWeight: 900, fontSize: 14, letterSpacing: '0.25em', color: '#111' }}>
              {COMPANY.name}
            </span>
          </div>

          {/* INVOICE Title */}
          <div style={{ fontWeight: 900, fontSize: 32, color: TEAL, letterSpacing: '0.05em', marginBottom: 10 }}>
            INVOICE
          </div>

          {/* Customer Data Table */}
          <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#111', minWidth: 260 }}>
            <tbody>
              <tr>
                <td style={{ paddingRight: 8, paddingBottom: 3, fontWeight: 700, whiteSpace: 'nowrap' }}>NAMA</td>
                <td style={{ paddingRight: 8, paddingBottom: 3 }}>:</td>
                <td style={{ paddingBottom: 3, fontWeight: 700 }}>{invoice.customer?.name ?? '—'}</td>
              </tr>
              <tr>
                <td style={{ paddingRight: 8, paddingBottom: 3, whiteSpace: 'nowrap' }}>NOMOR TELEPON</td>
                <td style={{ paddingRight: 8, paddingBottom: 3 }}>:</td>
                <td style={{ paddingBottom: 3 }}>{phone || '—'}</td>
              </tr>
              <tr>
                <td style={{ paddingRight: 8 }}>ALAMAT</td>
                <td style={{ paddingRight: 8 }}>:</td>
                <td style={{ maxWidth: 220, lineHeight: 1.4 }}>{address || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Vertical Divider */}
        <div style={{ width: 1, background: '#bbb', alignSelf: 'stretch', margin: '0 24px', minHeight: 90 }} />

        {/* RIGHT — Date & Invoice No */}
        <div style={{ minWidth: 220 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#111', marginTop: 50 }}>
            <tbody>
              <tr>
                <td style={{ paddingRight: 8, paddingBottom: 4, fontWeight: 700 }}>TANGGAL</td>
                <td style={{ paddingRight: 8, paddingBottom: 4 }}>:</td>
                <td style={{ paddingBottom: 4 }}>{fmtDate(invoice.invoice_date)}</td>
              </tr>
              <tr>
                <td style={{ paddingRight: 8, fontWeight: 700 }}>INVOICE</td>
                <td style={{ paddingRight: 8 }}>:</td>
                <td style={{ fontWeight: 700 }}>{invoice.invoice_number}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop: `2.5px solid ${TEAL}`, margin: '18px 0 0' }} />

      {/* ── Items Table ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 0 }}>
        <thead>
          <tr style={{ background: TEAL, color: '#fff' }}>
            <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', width: '50%' }}>BARANG</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', width: '10%' }}>QTY</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', width: '18%' }}>HARGA</th>
            <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', width: '22%' }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#aaa', fontSize: 11 }}>
                Tidak ada item.
              </td>
            </tr>
          ) : (
            invoice.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '9px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {item.product_name}
                </td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: 11 }}>{item.quantity}</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: 11 }}>{fmt(item.unit_price)}</td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11 }}>
                  <span style={{ color: '#555', marginRight: 4 }}>Rp</span>
                  <span style={{ fontWeight: 700 }}>{fmt(item.subtotal)}</span>
                </td>
              </tr>
            ))
          )}

          {/* Spacer rows so there's always empty lines like reference */}
          {Array.from({ length: Math.max(0, 6 - invoice.items.length) }).map((_, i) => (
            <tr key={`spacer-${i}`}>
              <td colSpan={4} style={{ height: 28, borderBottom: '1px solid #f0f0f0' }} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Footer ── */}
      <div style={{ borderTop: '2px solid #bbb', marginTop: 4, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* LEFT — Payment To */}
        <div style={{ fontSize: 11, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 900, letterSpacing: '0.05em' }}>PAYMENT TO :</div>
          <div style={{ fontWeight: 900 }}>{COMPANY.bank}</div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>{COMPANY.account}</div>
          <div style={{ fontWeight: 900 }}>{COMPANY.holder}</div>
          {(() => {
            // Filter out DP text from notes so it doesn't show under PAYMENT TO
            const cleanNotes = invoice.notes
              ?.split('\n')
              .filter((line) => !/^dp\b/i.test(line.trim()))
              .join('\n')
              .trim();

            return cleanNotes ? (
              <div style={{ marginTop: 8, fontSize: 10, color: '#555', fontStyle: 'italic', maxWidth: 220 }}>
                {cleanNotes}
              </div>
            ) : null;
          })()}
        </div>

        {/* RIGHT — Summary & Signature */}
        <div style={{ textAlign: 'right', minWidth: 280 }}>
          {/* Summary table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              <tr>
                <td style={{ paddingBottom: 4, fontWeight: 700 }}>Sub Total</td>
                <td style={{ paddingBottom: 4, paddingLeft: 12 }}>:</td>
                <td style={{ paddingBottom: 4, paddingLeft: 8 }}>Rp</td>
                <td style={{ paddingBottom: 4, textAlign: 'right', minWidth: 90 }}>{fmt(subtotal)}</td>
              </tr>
              <tr>
                <td style={{ paddingBottom: 4 }}>DISKON</td>
                <td style={{ paddingBottom: 4, paddingLeft: 12 }}>:</td>
                <td style={{ paddingBottom: 4, paddingLeft: 8 }}>{discount > 0 ? 'Rp' : ''}</td>
                <td style={{ paddingBottom: 4, textAlign: 'right' }}>{discount > 0 ? fmt(discount) : ''}</td>
              </tr>
              {shipping > 0 && (
                <tr>
                  <td style={{ paddingBottom: 4 }}>ONGKIR</td>
                  <td style={{ paddingBottom: 4, paddingLeft: 12 }}>:</td>
                  <td style={{ paddingBottom: 4, paddingLeft: 8 }}>Rp</td>
                  <td style={{ paddingBottom: 4, textAlign: 'right' }}>{fmt(shipping)}</td>
                </tr>
              )}
              <tr style={{ borderTop: '1px solid #ccc' }}>
                <td style={{ paddingTop: 6, fontWeight: 900, fontSize: 13 }}>TOTAL</td>
                <td style={{ paddingTop: 6, paddingLeft: 12, fontWeight: 900 }}>:</td>
                <td style={{ paddingTop: 6, paddingLeft: 8, fontWeight: 900 }}>Rp</td>
                <td style={{ paddingTop: 6, textAlign: 'right', fontWeight: 900, fontSize: 13 }}>{fmt(total)}</td>
              </tr>

              {/* DP dan sisa tagihan hanya muncul bila memang ada uang muka,
                  supaya invoice lunas/tanpa DP tetap ringkas. */}
              {dp > 0 && (
                <>
                  <tr>
                    <td style={{ paddingTop: 6, fontWeight: 700, color: '#0f766e' }}>DP / UANG MUKA</td>
                    <td style={{ paddingTop: 6, paddingLeft: 12, color: '#0f766e' }}>:</td>
                    <td style={{ paddingTop: 6, paddingLeft: 8, color: '#0f766e' }}>Rp</td>
                    <td style={{ paddingTop: 6, textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>-{fmt(dp)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ paddingTop: 6 }}>
                      <div style={{
                        background: '#0f766e',
                        color: '#fff',
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 13,
                        fontWeight: 900,
                        letterSpacing: '0.03em',
                      }}>
                        <span>SISA TAGIHAN</span>
                        <span>Rp {fmt(remaining)}</span>
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {/* Signature */}
          <div style={{ marginTop: 32, fontSize: 11, textAlign: 'center' }}>
            <div style={{ marginBottom: 20, color: '#555' }}>HORMAT KAMI</div>
            <div style={{ borderTop: '1px solid #333', paddingTop: 8, display: 'inline-block', minWidth: 160 }}>
              <div style={{ fontWeight: 900, letterSpacing: '0.05em' }}>{COMPANY.signer}</div>
              <div style={{ fontWeight: 700, fontSize: 10, color: '#444' }}>{COMPANY.tagline}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  @media print {
    /* Tanpa ini browser membuang background & warna saat cetak, sehingga header
       tabel teal, judul INVOICE, dan garis pemisah hilang di hasil PDF. */
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .no-print { display: none !important; }

    /* Bingkai preview (latar abu & padding toolbar) tidak ikut tercetak. */
    .print-shell {
      padding: 0 !important;
      background: #fff !important;
      min-height: 0 !important;
    }

    /* Ukuran dipertahankan persis seperti preview: 794px = lebar A4 pada 96dpi.
       Padding elemen dibiarkan apa adanya dan margin @page dibuat 0, sehingga
       hasil cetak identik dengan yang terlihat di layar. */
    #invoice-print-area {
      width: 794px !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      box-shadow: none !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table { page-break-inside: auto; }
    tr    { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }

    @page { size: A4 portrait; margin: 0; }
  }
`;

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InvoicePrint() {
  const { invoice } = usePage<{ invoice: Invoice; [key: string]: any }>().props;

  function handleDownloadExcel() {
    const wb = XLSX.utils.book_new();
    const dpAmount = Number(invoice.sales_order?.dp_amount ?? invoice.paid_amount ?? 0);

    const header = [
      ['INVOICE', invoice.invoice_number],
      ['Tanggal', fmtDate(invoice.invoice_date)],
      ['Customer', invoice.customer?.name ?? ''],
      ['Nomor Telepon', invoice.sales_order?.customer_phone ?? invoice.customer?.phone ?? ''],
      ['Alamat', [
        invoice.sales_order?.shipping_address ?? invoice.customer?.address,
        invoice.sales_order?.city ?? invoice.customer?.city,
        invoice.sales_order?.province ?? invoice.customer?.province,
      ].map((p) => (p ?? '').trim()).filter(Boolean).join(', ')],
      ['No. Resi / AWB', invoice.sales_order?.tracking_number ?? ''],
      ['Status', STATUS_LABEL[invoice.status] ?? invoice.status],
      [],
      ['BARANG', 'QTY', 'HARGA SATUAN', 'TOTAL'],
      ...invoice.items.map(i => [i.product_name, i.quantity, Number(i.unit_price), Number(i.subtotal)]),
      [],
      ['Sub Total', '', '', Number(invoice.subtotal)],
      ['DISKON', '', '', Number(invoice.discount_amount) > 0 ? -Number(invoice.discount_amount) : ''],
      ['TOTAL', '', '', Number(invoice.total_amount)],
      ['DP / UANG MUKA', '', '', dpAmount > 0 ? -dpAmount : ''],
      ['SISA TAGIHAN', '', '', dpAmount > 0 ? Math.max(0, Number(invoice.total_amount) - dpAmount) : ''],
      [],
      ['PAYMENT TO:', COMPANY.bank],
      ['No. Rek:', COMPANY.account],
      ['Atas Nama:', COMPANY.holder],
    ];

    const ws = XLSX.utils.aoa_to_sheet(header);
    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
    XLSX.writeFile(wb, `Invoice_${invoice.invoice_number}.xlsx`);
    catatRiwayatUnduhan(`Invoice_${invoice.invoice_number}.xlsx`, 'Invoice', invoice.invoice_number);
  }

  return (
    <>
      <Head title={`Invoice ${invoice.invoice_number}`} />
      <style>{PRINT_CSS}</style>

      {/* Toolbar */}
      <div
        className="no-print"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
          background: 'rgba(2,6,23,0.97)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          padding: '10px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <a
          href={`/invoices/${invoice.id}`}
          style={{
            color: '#94a3b8', fontSize: 13, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Kembali
        </a>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDownloadExcel}
            style={{
              background: 'linear-gradient(135deg,#16a34a,#15803d)',
              color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ⬇ Download Excel
          </button>
          <button
            onClick={() => window.print()}
            style={{
              background: 'linear-gradient(135deg,#00b8b0,#0891b2)',
              color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🖨 Cetak / PDF
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="print-shell" style={{ paddingTop: 70, paddingBottom: 40, background: '#cbd5e1', minHeight: '100vh' }}>
        <InvoiceTemplate invoice={invoice} />
      </div>
    </>
  );
}
