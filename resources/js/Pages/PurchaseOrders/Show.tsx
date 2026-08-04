import React, { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';
import { PO_PAYMENT_TERMS, poPaymentTermLabel } from '@/Constants/purchaseOrder';
import CurrencyInput from '@/Components/CurrencyInput';
import Alert from '../../Components/Alert';
import { PageProps } from '../../Types';

interface Product {
  id: number;
  sku: string;
  name: string;
}

interface DBOrderItem {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: string;
  subtotal: string;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  action_taken: 'accepted' | 'revised' | 'rejected';
  rejected_reason: string | null;
  validated_unit_price: string | null;
  validated_total_price: string | null;
  product: Product | null;
}

interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
  phone: string | null;
  address: string | null;
}

interface Warehouse {
  id: number;
  code: string;
  name: string;
  location: string | null;
}

interface UserInfo {
  id: number;
  name: string;
  email: string;
}

interface CashBankAccount {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  current_balance: string;
}

interface DBPurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  warehouse_id: number | null;
  order_date: string;
  production_lead_time_days: number | null;
  is_free_shipping: boolean;
  status: string;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  subtotal: string;
  shipping_cost: string;
  grand_total: string;
  notes: string | null;
  created_at: string;
  // DP fields
  dp_amount: string | null;
  dp_paid_amount: string | null;
  dp_payment_date: string | null;
  dp_cash_bank_account_id: number | null;
  payment_terms: string | null;
  // Finance validation
  validated_subtotal: string | null;
  validated_grand_total: string | null;
  final_bill_amount: string | null;
  is_finance_validated: boolean;
  finance_validated_at: string | null;
  // Relations
  supplier: Supplier | null;
  warehouse: Warehouse | null;
  creator: UserInfo | null;
  leaderApprover: UserInfo | null;
  financeApprover: UserInfo | null;
  financeValidator: UserInfo | null;
  dpCashBankAccount: CashBankAccount | null;
  items: DBOrderItem[];
}

interface PurchaseOrderShowProps {
  purchaseOrder: DBPurchaseOrder;
  cashBankAccounts: CashBankAccount[];
  can: {
    finance_approve: boolean;
    leader_approve: boolean;
    edit: boolean;
    receive: boolean;
  };
}

const statusBadgeColor: Record<string, string> = {
  draft:                     'bg-gray-100 border-gray-300 text-gray-500',
  pending_leader_approval:   'bg-orange-50 border-orange-200 text-orange-600',
  pending_finance_approval:  'bg-violet-50 border-violet-200 text-violet-600',
  approved:                  'bg-blue-500/10 border-blue-500/20 text-blue-400',
  ordered:                   'bg-teal-500/10 border-teal-500/20 text-teal-400',
  partially_received:        'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  received:                  'bg-teal-500/10 border-teal-500/20 text-teal-400',
  finance_validated:         'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  rejected:                  'bg-rose-500/10 border-rose-500/20 text-rose-400',
  cancelled:                 'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const statusLabel: Record<string, string> = {
  draft:                     'Draft',
  pending_leader_approval:   '⏳ Menunggu Leader',
  pending_finance_approval:  '⏳ Menunggu Finance',
  approved:                  '✅ Disetujui',
  ordered:                   '📦 Dipesan',
  partially_received:        '📥 Diterima Sebagian',
  received:                  '✅ Diterima Lengkap',
  finance_validated:         '✅ Tervalidasi Finance',
  rejected:                  '❌ Ditolak',
  cancelled:                 '🚫 Dibatalkan',
};

const accountTypeIcon: Record<string, string> = {
  cash:         '💵',
  bank:         '🏦',
  petty_cash:   '🪙',
};

const fmt = (n: string | number | null | undefined) =>
  n !== null && n !== undefined ? Number(n).toLocaleString('id-ID') : '0';

export default function Show({ purchaseOrder, cashBankAccounts, can }: PurchaseOrderShowProps) {
  const { flash, auth } = usePage<PageProps>().props;
  const permissions = auth.user?.permissions ?? [];

  const canLeaderApprove  = can?.leader_approve  ?? permissions.includes('purchase_order.leader_approve');
  const canFinanceApprove = can?.finance_approve  ?? permissions.includes('purchase_order.finance_approve');
  const canReceive        = can?.receive          ?? permissions.includes('purchase_order.receive');
  const canEdit           = can?.edit             ?? permissions.includes('purchase_order.edit');
  const canDelete         = permissions.includes('purchase_order.delete');

  const [actionLoading, setActionLoading] = useState(false);

  // ── Delete Modal ──────────────────────────────────────────
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // ── Reject Modal ──────────────────────────────────────────
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // ── Receive Modal ─────────────────────────────────────────
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<Record<number, number>>({});
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveShippingCost, setReceiveShippingCost] = useState<number>(Number(purchaseOrder.shipping_cost) || 0);

  // ── DP Modal ──────────────────────────────────────────────
  const [dpModalOpen, setDpModalOpen] = useState(false);
  const [dpAmount, setDpAmount] = useState('');
  const [dpAccountId, setDpAccountId] = useState<number | null>(null);
  const [dpPaymentTerms, setDpPaymentTerms] = useState(purchaseOrder.payment_terms ?? 'cash_to_cash');
  const [dpError, setDpError] = useState<string | null>(null);

  // ── Finance Validation Modal ──────────────────────────────
  const [validateModalOpen, setValidateModalOpen] = useState(false);
  type ValidationItem = {
    item_id: number;
    action: 'accepted' | 'revised' | 'rejected';
    accepted_quantity: number;
    rejected_quantity: number;
    rejected_reason: string;
    validated_unit_price: number;
  };
  const [validationItems, setValidationItems] = useState<ValidationItem[]>([]);

  // ─────────── Helpers ──────────────────────────────────────
  function handleAction(url: string) {
    setActionLoading(true);
    router.post(url, {}, {
      onFinish: () => setActionLoading(false),
    });
  }

  function handleDelete() {
    setActionLoading(true);
    router.delete(`/purchase-orders/${purchaseOrder.id}`, {
      onFinish: () => { setActionLoading(false); setDeleteModalOpen(false); },
    });
  }

  // ─────────── Receive ──────────────────────────────────────
  interface ReceiveItemState {
    product_id: number;
    received_qty: number;
    rejected_qty: number;
    rejected_reason: string;
    validated_unit_price: number;
    action_taken: 'accepted' | 'revised' | 'rejected';
  }
  const [receiveItemStates, setReceiveItemStates] = useState<Record<number, ReceiveItemState>>({});

  function handleOpenReceiveModal() {
    const states: Record<number, ReceiveItemState> = {};
    purchaseOrder.items.forEach((item) => {
      const remaining = Math.max(0, item.quantity - item.received_quantity);
      states[item.product_id] = {
        product_id: item.product_id,
        received_qty: remaining,
        rejected_qty: 0,
        rejected_reason: '',
        validated_unit_price: Number(item.unit_price),
        action_taken: 'accepted',
      };
    });
    setReceiveItemStates(states);
    setReceiveError(null);
    setReceiveModalOpen(true);
  }

  function updateReceiveItemState(productId: number, field: keyof ReceiveItemState, val: unknown) {
    setReceiveItemStates(prev => {
      const current = prev[productId] || {
        product_id: productId,
        received_qty: 0,
        rejected_qty: 0,
        rejected_reason: '',
        validated_unit_price: 0,
        action_taken: 'accepted',
      };
      return {
        ...prev,
        [productId]: {
          ...current,
          [field]: val,
        },
      };
    });
  }

  function submitReceipt(e: React.FormEvent) {
    e.preventDefault();
    setReceiveError(null);
    const itemsPayload: {
      product_id: number;
      received_qty: number;
      rejected_qty: number;
      rejected_reason: string | null;
      validated_unit_price: number;
      action_taken: string;
    }[] = [];

    for (const item of purchaseOrder.items) {
      const state = receiveItemStates[item.product_id];
      if (!state) continue;

      const remaining = item.quantity - item.received_quantity;
      if (state.received_qty < 0) { setReceiveError(`Qty penerimaan ${item.product_name} tidak boleh negatif.`); return; }
      if (state.received_qty > remaining) { setReceiveError(`Qty penerimaan ${item.product_name} (${state.received_qty}) melebihi sisa ordered (${remaining}).`); return; }
      if (state.rejected_qty < 0) { setReceiveError(`Qty reject ${item.product_name} tidak boleh negatif.`); return; }
      if (state.rejected_qty > state.received_qty) { setReceiveError(`Qty reject ${item.product_name} (${state.rejected_qty}) tidak boleh melebihi total barang tiba (${state.received_qty}).`); return; }

      itemsPayload.push({
        product_id: item.product_id,
        received_qty: state.received_qty,
        rejected_qty: state.rejected_qty,
        rejected_reason: state.rejected_qty > 0 || state.action_taken !== 'accepted' ? state.rejected_reason : null,
        validated_unit_price: state.validated_unit_price,
        action_taken: state.rejected_qty > 0 ? (state.rejected_qty === state.received_qty ? 'rejected' : 'revised') : state.action_taken,
      });
    }

    if (itemsPayload.every(i => i.received_qty === 0)) {
      setReceiveError('Masukkan minimal 1 barang yang diterima.'); return;
    }

    setActionLoading(true);
    router.post(`/purchase-orders/${purchaseOrder.id}/receive`, {
      items: itemsPayload,
      shipping_cost: purchaseOrder.is_free_shipping ? 0 : receiveShippingCost,
    }, {
      onSuccess: () => setReceiveModalOpen(false),
      onError: (errs) => setReceiveError(Object.values(errs)[0] as string),
      onFinish: () => setActionLoading(false),
    });
  }

  // ─────────── Down Payment ─────────────────────────────────
  function handleOpenDpModal() {
    setDpAmount('');
    setDpAccountId(cashBankAccounts[0]?.id ?? null);
    setDpPaymentTerms(purchaseOrder.payment_terms ?? 'cash_to_cash');
    setDpError(null);
    setDpModalOpen(true);
  }

  function submitDownPayment(e: React.FormEvent) {
    e.preventDefault();
    setDpError(null);
    const amt = Number(dpAmount);
    if (!amt || amt <= 0) { setDpError('Nominal DP harus lebih dari 0.'); return; }
    if (amt > Number(purchaseOrder.grand_total)) { setDpError('DP tidak boleh melebihi Grand Total PO.'); return; }
    setActionLoading(true);
    router.post(`/purchase-orders/${purchaseOrder.id}/pay-dp`, {
      dp_amount: amt,
      cash_bank_account_id: dpAccountId,
      payment_terms: dpPaymentTerms,
    }, {
      onSuccess: () => setDpModalOpen(false),
      onError: (errors) => { setDpError(Object.values(errors)[0] as string); },
      onFinish: () => setActionLoading(false),
    });
  }

  // ─────────── Finance Validate ─────────────────────────────
  function handleOpenValidateModal() {
    const items: ValidationItem[] = purchaseOrder.items.map(item => ({
      item_id: item.id,
      action: 'accepted' as const,
      accepted_quantity: item.received_quantity,
      rejected_quantity: 0,
      rejected_reason: '',
      validated_unit_price: Number(item.unit_price),
    }));
    setValidationItems(items);
    setValidateModalOpen(true);
  }

  function updateValidationItem(index: number, field: keyof ValidationItem, value: string | number) {
    const updated = [...validationItems];
    (updated[index] as Record<string, unknown>)[field] = value;
    // If action changes to rejected, set accepted to 0
    if (field === 'action') {
      if (value === 'rejected') {
        updated[index].accepted_quantity = 0;
        updated[index].rejected_quantity = purchaseOrder.items[index]?.received_quantity ?? 0;
      } else if (value === 'accepted') {
        updated[index].accepted_quantity = purchaseOrder.items[index]?.received_quantity ?? 0;
        updated[index].rejected_quantity = 0;
      }
    }
    setValidationItems(updated);
  }

  function submitValidation(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    router.post(`/purchase-orders/${purchaseOrder.id}/validate-receiving`, {
      items: validationItems,
    }, {
      onSuccess: () => setValidateModalOpen(false),
      onFinish: () => setActionLoading(false),
    });
  }

  const hasDp = Number(purchaseOrder.dp_paid_amount) > 0;
  const isValidated = purchaseOrder.is_finance_validated;
  const canValidate = canFinanceApprove && ['received', 'partially_received'].includes(purchaseOrder.status) && !isValidated;
  const canPayDp = canFinanceApprove && purchaseOrder.status === 'approved' && !hasDp;

  return (
    <AppLayout>
      <Head title={`PO: ${purchaseOrder.po_number}`} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/purchase-orders"
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{purchaseOrder.po_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor[purchaseOrder.status] ?? 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                {statusLabel[purchaseOrder.status] ?? purchaseOrder.status}
              </span>
              {isValidated && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  ✅ Finance Validated
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Dibuat {new Date(purchaseOrder.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} oleh {purchaseOrder.creator?.name}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* DRAFT */}
          {purchaseOrder.status === 'draft' && (<>
            {canEdit && <Link href={`/purchase-orders/${purchaseOrder.id}/edit`} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-300 hover:border-gray-300 rounded-xl text-sm font-semibold transition-all">Edit PO</Link>}
            {canDelete && <button type="button" onClick={() => setDeleteModalOpen(true)} className="px-4 py-2 bg-gray-50 hover:bg-rose-50 text-rose-500 border border-gray-300 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all">Hapus PO</button>}
            {canEdit && <button type="button" onClick={() => handleAction(`/purchase-orders/${purchaseOrder.id}/submit-approval`)} disabled={actionLoading} className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-50">Ajukan Persetujuan</button>}
          </>)}

          {/* PENDING LEADER */}
          {purchaseOrder.status === 'pending_leader_approval' && (<>
            {canLeaderApprove && <button type="button" onClick={() => handleAction(`/purchase-orders/${purchaseOrder.id}/leader-approve`)} disabled={actionLoading} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-200/40 transition-all disabled:opacity-50">✅ Approve (Leader)</button>}
            {(canLeaderApprove || canFinanceApprove) && <button type="button" onClick={() => setRejectModalOpen(true)} disabled={actionLoading} className="px-4 py-2 bg-gray-50 hover:bg-rose-50 text-rose-400 border border-gray-300 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50">❌ Tolak</button>}
          </>)}

          {/* PENDING FINANCE */}
          {purchaseOrder.status === 'pending_finance_approval' && (<>
            {canFinanceApprove && <button type="button" onClick={() => handleAction(`/purchase-orders/${purchaseOrder.id}/finance-approve`)} disabled={actionLoading} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-200/40 transition-all disabled:opacity-50">✅ Approve (Finance)</button>}
            {(canLeaderApprove || canFinanceApprove) && <button type="button" onClick={() => setRejectModalOpen(true)} disabled={actionLoading} className="px-4 py-2 bg-gray-50 hover:bg-rose-50 text-rose-400 border border-gray-300 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50">❌ Tolak</button>}
          </>)}

          {/* APPROVED — Finance can pay DP & Admin can mark ordered / receive */}
          {purchaseOrder.status === 'approved' && (<>
            {canPayDp && <button type="button" onClick={handleOpenDpModal} className="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-600 hover:to-orange-500 text-gray-900 rounded-xl text-sm font-semibold shadow-lg shadow-orange-950/40 transition-all">💳 Bayar Down Payment</button>}
            {(canEdit || canReceive) && <button type="button" onClick={() => handleAction(`/purchase-orders/${purchaseOrder.id}/mark-ordered`)} disabled={actionLoading} className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all disabled:opacity-50">📦 Tandai Dipesan</button>}
            {(canReceive || canEdit) && <button type="button" onClick={handleOpenReceiveModal} className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all">📥 Terima Barang</button>}
            {(canEdit || canFinanceApprove) && <button type="button" onClick={() => handleAction(`/purchase-orders/${purchaseOrder.id}/cancel`)} disabled={actionLoading} className="px-4 py-2 bg-gray-50 hover:bg-rose-50 text-rose-500 border border-gray-300 hover:border-rose-900/50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50">Batalkan</button>}
          </>)}

          {/* ORDERED / PARTIALLY RECEIVED */}
          {(purchaseOrder.status === 'ordered' || purchaseOrder.status === 'partially_received') && (<>
            {(canReceive || canEdit) && <button type="button" onClick={handleOpenReceiveModal} className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 transition-all">📥 Terima Barang</button>}
          </>)}

          {/* RECEIVED — Finance validates */}
          {(purchaseOrder.status === 'received' || purchaseOrder.status === 'partially_received') && !isValidated && (<>
            {canValidate && <button type="button" onClick={handleOpenValidateModal} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-gray-900 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-all">🔍 Validasi Penerimaan (Finance)</button>}
          </>)}
        </div>
      </div>

      {/* Alerts */}
      <Alert message={flash.success ?? null} type="success" />
      {flash.error && <Alert message={flash.error} type="error" />}

      {/* ── Info Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Supplier */}
        <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5">Supplier / Pabrik</h3>
          {purchaseOrder.supplier ? (
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-gray-900">{purchaseOrder.supplier.name}</h4>
              <p className="text-sm text-gray-500">Kode: {purchaseOrder.supplier.supplier_code}</p>
              {purchaseOrder.supplier.phone && <p className="text-sm text-gray-500">Tlp: {purchaseOrder.supplier.phone}</p>}
              {purchaseOrder.supplier.address && <p className="text-sm text-gray-500 line-clamp-2">{purchaseOrder.supplier.address}</p>}
            </div>
          ) : <p className="text-sm text-gray-400">—</p>}
        </div>

        {/* Warehouse */}
        <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5">Gudang Penerimaan</h3>
          {purchaseOrder.warehouse ? (
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-gray-900">{purchaseOrder.warehouse.name}</h4>
              <p className="text-sm text-gray-500">Kode: {purchaseOrder.warehouse.code}</p>
              {purchaseOrder.warehouse.location && <p className="text-sm text-gray-500">{purchaseOrder.warehouse.location}</p>}
            </div>
          ) : <p className="text-sm text-gray-400">Gudang tidak ditentukan</p>}
        </div>

        {/* Order Detail */}
        <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3.5">Detail Order</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 font-semibold text-xs">Tgl Order</p>
              <p className="text-gray-800 font-medium mt-0.5">{new Date(purchaseOrder.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
            <div>
              <p className="text-gray-400 font-semibold text-xs">Syarat Bayar</p>
              <p className="text-gray-800 font-medium mt-0.5">{poPaymentTermLabel(purchaseOrder.payment_terms)}</p>
            </div>
            <div>
              <p className="text-gray-400 font-semibold text-xs">Status Bayar</p>
              <p className="mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                  purchaseOrder.payment_status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                  purchaseOrder.payment_status === 'partially_paid' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                  'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {purchaseOrder.payment_status === 'paid' ? 'Lunas' : purchaseOrder.payment_status === 'partially_paid' ? 'Sebagian' : 'Belum Bayar'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-300/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Rincian Barang</h3>
              {isValidated && <span className="text-xs text-emerald-400 font-semibold">✅ Sudah divalidasi Finance</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                    <th className="py-3 px-5">Produk</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap">Dipesan</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap">Diterima</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap">Sisa</th>
                    {isValidated && <>
                      <th className="py-3 px-4 text-center whitespace-nowrap">Diterima ✅</th>
                      <th className="py-3 px-4 text-center whitespace-nowrap">Ditolak ❌</th>
                      <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                    </>}
                    <th className="py-3 px-4 text-right whitespace-nowrap">Harga Unit</th>
                    {isValidated && <th className="py-3 px-4 text-right whitespace-nowrap">Harga Validasi</th>}
                    <th className="py-3 px-4 text-right whitespace-nowrap">Subtotal</th>
                    {isValidated && <th className="py-3 px-4 text-right whitespace-nowrap text-emerald-400">Total Tagihan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/60 text-sm text-gray-700">
                  {purchaseOrder.items.map((item) => {
                    const remaining = item.quantity - item.received_quantity;
                    const actionColor = item.action_taken === 'rejected' ? 'bg-rose-500/10 text-rose-400' : item.action_taken === 'revised' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-500/10 text-emerald-400';
                    const actionText = item.action_taken === 'rejected' ? '❌ Ditolak' : item.action_taken === 'revised' ? '✏️ Direvisi' : '✅ Diterima';
                    return (
                      <tr key={item.id} className="hover:bg-teal-50/60 transition-colors">
                        <td className="py-3.5 px-5">
                          <span className="font-semibold text-gray-800 block">{item.product_name}</span>
                          <span className="text-[10px] text-gray-400 block">{item.product_code}</span>
                          {item.rejected_reason && <span className="text-[10px] text-rose-400 mt-0.5 block italic">"{item.rejected_reason}"</span>}
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-gray-800 whitespace-nowrap">
                          {item.quantity} <span className="text-[10px] text-gray-400">{item.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${item.received_quantity === 0 ? 'bg-gray-100 text-gray-500' : item.received_quantity === item.quantity ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-50 text-orange-600'}`}>
                            {item.received_quantity}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-gray-500">{remaining > 0 ? remaining : 0}</td>
                        {isValidated && <>
                          <td className="py-3.5 px-4 text-center font-bold text-emerald-400">{item.accepted_quantity}</td>
                          <td className="py-3.5 px-4 text-center font-bold text-rose-400">{item.rejected_quantity > 0 ? item.rejected_quantity : '—'}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${actionColor}`}>{actionText}</span>
                          </td>
                        </>}
                        <td className="py-3.5 px-4 text-right font-medium whitespace-nowrap">Rp {fmt(item.unit_price)}</td>
                        {isValidated && <td className="py-3.5 px-4 text-right font-medium text-orange-600 whitespace-nowrap">Rp {fmt(item.validated_unit_price)}</td>}
                        <td className="py-3.5 px-4 text-right font-bold text-gray-900 whitespace-nowrap">Rp {fmt(item.subtotal)}</td>
                        {isValidated && <td className="py-3.5 px-4 text-right font-bold text-emerald-400 whitespace-nowrap">Rp {fmt(item.validated_total_price)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Summary + DP Info + Bill */}
        <div className="space-y-5">
          {/* Cost Summary */}
          <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ringkasan Biaya PO</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-semibold text-gray-800">Rp {fmt(purchaseOrder.subtotal)}</span></div>
              <div className="flex justify-between text-gray-500">
                <span>Ongkir</span>
                {purchaseOrder.is_free_shipping ? (
                  <span className="font-semibold text-emerald-500">Free Ongkir</span>
                ) : (
                  <span className="font-semibold text-gray-800">
                    {Number(purchaseOrder.shipping_cost) > 0
                      ? `Rp ${fmt(purchaseOrder.shipping_cost)}`
                      : 'Diisi saat barang datang'}
                  </span>
                )}
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Grand Total</span>
                <span className="text-base font-extrabold text-emerald-400">Rp {fmt(purchaseOrder.grand_total)}</span>
              </div>
            </div>
          </div>

          {/* DP Info (shown if DP exists) */}
          {hasDp && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-orange-600 uppercase tracking-widest">💳 Down Payment</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Nominal DP</span><span className="font-bold text-orange-600">Rp {fmt(purchaseOrder.dp_paid_amount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tanggal DP</span><span className="text-gray-800">{purchaseOrder.dp_payment_date ? new Date(purchaseOrder.dp_payment_date).toLocaleDateString('id-ID') : '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Dari Akun</span><span className="text-gray-800 text-right">{purchaseOrder.dpCashBankAccount?.account_name ?? '—'}</span></div>
              </div>
            </div>
          )}

          {/* Finance Validation Bill */}
          {isValidated && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">🔍 Tagihan Akhir (Tervalidasi)</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal Validasi</span><span className="font-semibold text-gray-800">Rp {fmt(purchaseOrder.validated_subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Diskon / Pajak / Ongkir</span>
                  <span className="font-semibold text-gray-800">
                    Rp {fmt((Number(purchaseOrder.validated_grand_total ?? 0) - Number(purchaseOrder.validated_subtotal ?? 0)).toString())}
                  </span>
                </div>
                <div className="flex justify-between border-t border-emerald-500/20 pt-2.5"><span className="font-bold text-gray-800">Grand Total Validasi</span><span className="font-bold text-emerald-400">Rp {fmt(purchaseOrder.validated_grand_total)}</span></div>
                {hasDp && <div className="flex justify-between"><span className="text-gray-500">(-) Down Payment</span><span className="font-semibold text-orange-600">-Rp {fmt(purchaseOrder.dp_paid_amount)}</span></div>}
                <div className="flex justify-between border-t border-emerald-500/20 pt-2.5 items-center">
                  <span className="text-base font-extrabold text-gray-900">Sisa Tagihan</span>
                  <span className="text-base font-extrabold text-rose-400">Rp {fmt(purchaseOrder.final_bill_amount)}</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Divalidasi oleh {purchaseOrder.financeValidator?.name ?? '—'} • {purchaseOrder.finance_validated_at ? new Date(purchaseOrder.finance_validated_at).toLocaleDateString('id-ID') : ''}</p>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white border border-gray-300/80 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Catatan Internal</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line bg-teal-50/40 p-3 rounded-xl border border-gray-200 min-h-[48px]">
              {purchaseOrder.notes || 'Tidak ada catatan.'}
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900">Konfirmasi Hapus</h3>
            <p className="text-sm text-gray-500 mt-2">Hapus <span className="font-semibold text-gray-900">{purchaseOrder.po_number}</span>? Tindakan tidak dapat dibatalkan.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300">Batal</button>
              <button onClick={handleDelete} disabled={actionLoading} className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-rose-200/40">{actionLoading ? 'Memproses...' : 'Hapus PO'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900">❌ Tolak Purchase Order</h3>
            <p className="text-sm text-gray-500 mt-1">Berikan alasan penolakan untuk PO <span className="font-semibold text-gray-900">{purchaseOrder.po_number}</span>.</p>
            <div className="mt-5">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Alasan Penolakan *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-rose-500 focus:outline-none resize-none" placeholder="Tuliskan alasan penolakan..." />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setRejectModalOpen(false); setRejectReason(''); }} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300">Batal</button>
              <button onClick={() => {
                if (!rejectReason.trim() || rejectReason.trim().length < 5) { alert('Alasan minimal 5 karakter.'); return; }
                setActionLoading(true);
                router.post(`/purchase-orders/${purchaseOrder.id}/reject`, { reject_reason: rejectReason }, {
                  onFinish: () => { setActionLoading(false); setRejectModalOpen(false); setRejectReason(''); }
                });
              }} disabled={actionLoading} className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-rose-200/40">
                {actionLoading ? 'Memproses...' : 'Tolak PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Goods & Reject/Revision Modal */}
      {receiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">📥 Penerimaan Barang & Cek Kondisi Fisik</h3>
              <p className="text-sm text-gray-500 mt-1">
                Catat barang yang datang untuk PO <span className="font-semibold text-gray-900">{purchaseOrder.po_number}</span>. Masukkan Qty Tiba, Qty Reject/Rusak (jika ada), dan alasan penolakan.
              </p>
            </div>

            <form onSubmit={submitReceipt} className="flex flex-col flex-1 min-h-0">
              {receiveError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs font-semibold mb-4 flex-shrink-0">
                  {receiveError}
                </div>
              )}

              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                {purchaseOrder.items.map((item) => {
                  const remaining = item.quantity - item.received_quantity;
                  if (remaining <= 0) return null;
                  const st = receiveItemStates[item.product_id] || {
                    received_qty: remaining,
                    rejected_qty: 0,
                    rejected_reason: '',
                    validated_unit_price: Number(item.unit_price),
                    action_taken: 'accepted',
                  };

                  const goodQty = Math.max(0, st.received_qty - st.rejected_qty);

                  return (
                    <div key={item.id} className="p-4 rounded-xl border border-gray-300 bg-gray-50 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-sm font-bold text-gray-800 block">{item.product_name}</span>
                          <span className="text-[10px] text-gray-400 block">{item.product_code} • Sisa Pesanan: <span className="text-gray-700 font-semibold">{remaining} {item.unit}</span></span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-500">Harga PO: <span className="font-semibold text-gray-800">Rp {fmt(item.unit_price)}</span></span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Qty Tiba Fisik (Total) *</label>
                          <CurrencyInput
                            hidePrefix
                            min="0"
                            max={remaining}
                            value={st.received_qty}
                            onChange={(v) => updateReceiveItemState(item.product_id, 'received_qty', v)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-300 text-gray-800 text-xs text-right font-bold focus:ring-1 focus:ring-teal-500 focus:outline-none"
                            placeholder="Barang Tiba"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-rose-400 mb-1">Qty Rusak / Reject (Cacet/Pecah)</label>
                          <CurrencyInput
                            hidePrefix
                            min="0"
                            max={st.received_qty}
                            value={st.rejected_qty}
                            onChange={(v) => updateReceiveItemState(item.product_id, 'rejected_qty', v)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-300 text-rose-300 text-xs text-right font-bold focus:ring-1 focus:ring-rose-500 focus:outline-none"
                            placeholder="0 (Jika tidak ada)"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-emerald-400 mb-1">Stok Masuk Gudang (Bagus)</label>
                          <div className="w-full px-3 py-2 rounded-lg bg-gray-50/80 border border-gray-300 text-emerald-400 text-xs text-right font-extrabold">
                            {goodQty} {item.unit}
                          </div>
                        </div>
                      </div>

                      {/* Detail Revisi & Alasan Reject jika ada reject */}
                      {(st.rejected_qty > 0 || st.action_taken !== 'accepted') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-300">
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Harga per Unit Revisi (Rp)</label>
                            <CurrencyInput
                              hidePrefix
                              value={st.validated_unit_price}
                              onChange={(v) => updateReceiveItemState(item.product_id, 'validated_unit_price', v)}
                              className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-300 text-orange-600 text-xs text-right font-bold focus:ring-1 focus:ring-orange-400 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-rose-400 mb-1">Alasan Reject / Rusak *</label>
                            <input
                              type="text"
                              value={st.rejected_reason}
                              onChange={(e) => updateReceiveItemState(item.product_id, 'rejected_reason', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-300 text-gray-800 text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                              placeholder="Misal: Dus penyok, barang pecah..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Ongkir — dibayar ke kurir saat barang datang */}
              <div className="pt-4 border-t border-gray-300 flex-shrink-0 mt-4">
                {purchaseOrder.is_free_shipping ? (
                  <p className="text-xs text-emerald-600 font-semibold">
                    PO ini Free Ongkir — tidak ada biaya kirim yang ditagihkan.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">Ongkir (Rp)</label>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Nominal ongkir yang dibayarkan ke kurir saat barang tiba.
                      </p>
                    </div>
                    <CurrencyInput
                      hidePrefix
                      value={receiveShippingCost}
                      onChange={(v) => setReceiveShippingCost(v)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-300 text-gray-800 text-sm text-right font-mono focus:ring-1 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-300 flex-shrink-0 mt-4">
                <button type="button" onClick={() => setReceiveModalOpen(false)} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300">Batal</button>
                <button type="submit" disabled={actionLoading} className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-200/40 disabled:opacity-50">
                  {actionLoading ? 'Menyimpan...' : '📥 Catat Penerimaan & Update Stok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Down Payment Modal */}
      {dpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900">💳 Bayar Down Payment PO</h3>
            <p className="text-sm text-gray-500 mt-1">Grand Total: <span className="font-bold text-emerald-400">Rp {fmt(purchaseOrder.grand_total)}</span></p>
            <form onSubmit={submitDownPayment} className="space-y-4 mt-5">
              {dpError && <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-400 text-xs font-semibold">{dpError}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nominal Down Payment (Rp) *</label>
                <CurrencyInput value={dpAmount} onChange={(v) => setDpAmount(String(v))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none"
                  placeholder="Contoh: 5000000" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Akun Kas / Bank / Petty Cash *</label>
                <select value={dpAccountId ?? ''} onChange={(e) => setDpAccountId(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none">
                  <option value="">-- Pilih Akun --</option>
                  {cashBankAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {accountTypeIcon[acc.account_type] ?? '💳'} {acc.account_name} ({acc.account_code}) — Saldo: Rp {fmt(acc.current_balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Syarat Pembayaran Pelunasan *</label>
                <select value={dpPaymentTerms} onChange={(e) => setDpPaymentTerms(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 text-sm focus:ring-1 focus:ring-orange-400 focus:outline-none">
                  {PO_PAYMENT_TERMS.map((term) => (
                    <option key={term.value} value={term.value}>{term.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDpModalOpen(false)} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300">Batal</button>
                <button type="submit" disabled={actionLoading} className="px-4 py-2.5 bg-gradient-to-r from-orange-600 to-orange-600 hover:from-orange-600 hover:to-orange-500 text-gray-900 rounded-xl text-sm font-semibold shadow-lg shadow-orange-950/40 disabled:opacity-50">
                  {actionLoading ? 'Memproses...' : '💳 Bayar DP Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finance Validation Modal */}
      {validateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-50 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-gray-50 border border-gray-300 rounded-2xl shadow-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">🔍 Validasi Penerimaan Barang (Finance)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Periksa kondisi barang yang diterima. Untuk setiap SKU, pilih: <span className="text-emerald-400">Terima Full</span>, <span className="text-orange-600">Revisi Qty/Harga</span>, atau <span className="text-rose-400">Tolak (Rusak/Reject)</span>.
              </p>
            </div>

            <form onSubmit={submitValidation} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {validationItems.map((vItem, index) => {
                  const po_item = purchaseOrder.items.find(i => i.id === vItem.item_id);
                  if (!po_item) return null;
                  return (
                    <div key={vItem.item_id} className={`p-4 rounded-xl border ${vItem.action === 'rejected' ? 'bg-rose-500/5 border-rose-500/20' : vItem.action === 'revised' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50/50 border-gray-300'}`}>
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        {/* Item Info */}
                        <div className="md:w-1/3 flex-shrink-0">
                          <p className="font-bold text-gray-800 text-sm">{po_item.product_name}</p>
                          <p className="text-[10px] text-gray-400">{po_item.product_code} • Diterima: <span className="text-gray-700 font-semibold">{po_item.received_quantity} {po_item.unit}</span></p>
                        </div>

                        {/* Action Selector */}
                        <div className="md:w-1/4 flex-shrink-0">
                          <label className="block text-[10px] font-semibold text-gray-400 mb-1">Tindakan</label>
                          <select value={vItem.action} onChange={(e) => updateValidationItem(index, 'action', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none">
                            <option value="accepted">✅ Terima Semua</option>
                            <option value="revised">✏️ Revisi Qty/Harga</option>
                            <option value="rejected">❌ Tolak / Reject</option>
                          </select>
                        </div>

                        {/* Qty Fields (if revised) */}
                        {vItem.action !== 'rejected' && (
                          <div className="flex gap-2 flex-1">
                            <div className="flex-1">
                              <label className="block text-[10px] font-semibold text-gray-400 mb-1">Qty Diterima</label>
                              <CurrencyInput hidePrefix min="0" max={po_item.received_quantity}
                                value={vItem.accepted_quantity}
                                onChange={(v) => updateValidationItem(index, 'accepted_quantity', v)}
                                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs text-right font-bold focus:ring-1 focus:ring-teal-500 focus:outline-none"
                                disabled={vItem.action === 'accepted'}
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] font-semibold text-gray-400 mb-1">Harga/Unit Validasi</label>
                              <CurrencyInput hidePrefix min="0"
                                value={vItem.validated_unit_price}
                                onChange={(v) => updateValidationItem(index, 'validated_unit_price', v)}
                                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs text-right font-bold focus:ring-1 focus:ring-teal-500 focus:outline-none"
                                disabled={vItem.action === 'accepted'}
                              />
                            </div>
                          </div>
                        )}

                        {/* Reason (if revised or rejected) */}
                        {(vItem.action === 'rejected' || vItem.action === 'revised') && (
                          <div className="flex-1">
                            <label className="block text-[10px] font-semibold text-gray-400 mb-1">
                              {vItem.action === 'rejected' ? 'Alasan Penolakan *' : 'Catatan Revisi'}
                            </label>
                            <input type="text"
                              value={vItem.rejected_reason}
                              onChange={(e) => updateValidationItem(index, 'rejected_reason', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                              placeholder={vItem.action === 'rejected' ? 'Rusak / Tidak sesuai spek...' : 'Catatan revisi...'}
                            />
                          </div>
                        )}
                      </div>

                      {/* Preview total per item */}
                      {vItem.action !== 'rejected' && (
                        <div className="mt-2.5 flex justify-end">
                          <span className="text-[11px] text-gray-400">
                            Total: <span className="font-bold text-emerald-400">Rp {(vItem.accepted_quantity * vItem.validated_unit_price).toLocaleString('id-ID')}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Preview Grand Total */}
              <div className="mt-4 pt-4 border-t border-gray-300 flex-shrink-0">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-300 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-400">Grand Total Tagihan (Estimasi)</p>
                    <p className="text-xl font-extrabold text-emerald-400 mt-0.5">
                      Rp {validationItems.reduce((sum, vi) => {
                        if (vi.action === 'rejected') return sum;
                        return sum + (vi.accepted_quantity * vi.validated_unit_price);
                      }, 0).toLocaleString('id-ID')}
                    </p>
                    {hasDp && (
                      <p className="text-xs text-gray-400 mt-0.5">(-) DP: Rp {fmt(purchaseOrder.dp_paid_amount)} → Sisa: <span className="text-rose-400 font-bold">
                        Rp {Math.max(0, validationItems.reduce((sum, vi) => vi.action === 'rejected' ? sum : sum + (vi.accepted_quantity * vi.validated_unit_price), 0) - Number(purchaseOrder.dp_paid_amount)).toLocaleString('id-ID')}
                      </span></p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setValidateModalOpen(false)} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300">Batal</button>
                    <button type="submit" disabled={actionLoading} className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-gray-900 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-950/40 disabled:opacity-50">
                      {actionLoading ? 'Menyimpan...' : '✅ Simpan Validasi & Hitung Tagihan'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
