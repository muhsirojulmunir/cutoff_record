import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Head } from '@inertiajs/react';
import AppLayout from '../../Layouts/AppLayout';

interface ChatMessage {
  id: string;
  sender: 'buyer' | 'seller';
  text: string;
  timestamp: string;
  status?: 'sent' | 'received' | 'read';
}

interface BuyerOrder {
  order_sn: string;
  product_name: string;
  variation: string;
  sku: string;
  price: number;
  status: string;
  status_detail?: string;
  carrier: string;
  tracking_number: string | null;
}

interface Conversation {
  id: string;
  channel: 'shopee' | 'tiktok';
  channel_label: string;
  shop_name: string;
  buyer_username: string;
  buyer_name: string;
  unread_count: number;
  last_message: string;
  last_message_time: string;
  status: 'unread' | 'read' | 'resolved';
  order: BuyerOrder;
  notes: string;
  messages: ChatMessage[];
}

interface QuickReply {
  id: number;
  title: string;
  category: string;
  text: string;
}

interface CustomerServiceProps {
  initialConversations: Conversation[];
  quickReplies: QuickReply[];
  channels: {
    shopee: {
      name: string;
      shop_name: string;
      status: string;
      color: string;
    };
    tiktok: {
      name: string;
      shop_name: string;
      status: string;
      color: string;
    };
  };
}

export default function CustomerServiceIndex({
  initialConversations,
  quickReplies,
  channels,
}: CustomerServiceProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConvId, setSelectedConvId] = useState<string>(
    initialConversations[0]?.id || ''
  );
  const [channelFilter, setChannelFilter] = useState<'all' | 'shopee' | 'tiktok'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [showQuickReplyModal, setShowQuickReplyModal] = useState(false);
  const [copiedSn, setCopiedSn] = useState<string | null>(null);
  const [csNoteInput, setCsNoteInput] = useState<string>('');
  const [isSavedNote, setIsSavedNote] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Active selected conversation
  const activeConv = useMemo(() => {
    return conversations.find((c) => c.id === selectedConvId) || conversations[0] || null;
  }, [conversations, selectedConvId]);

  // Sync internal note when active conversation changes
  useEffect(() => {
    if (activeConv) {
      setCsNoteInput(activeConv.notes || '');
      setIsSavedNote(false);
    }
  }, [activeConv?.id]);

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // Channel filter
      if (channelFilter !== 'all' && conv.channel !== channelFilter) {
        return false;
      }
      // Status filter
      if (statusFilter === 'unread' && conv.status !== 'unread') {
        return false;
      }
      if (statusFilter === 'resolved' && conv.status !== 'resolved') {
        return false;
      }
      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchName = conv.buyer_name.toLowerCase().includes(q);
        const matchUser = conv.buyer_username.toLowerCase().includes(q);
        const matchSn = conv.order?.order_sn?.toLowerCase().includes(q);
        const matchMsg = conv.messages.some((m) => m.text.toLowerCase().includes(q));
        if (!matchName && !matchUser && !matchSn && !matchMsg) {
          return false;
        }
      }
      return true;
    });
  }, [conversations, channelFilter, statusFilter, searchQuery]);

  // Unread count metrics
  const shopeeUnread = useMemo(
    () => conversations.filter((c) => c.channel === 'shopee' && c.unread_count > 0).length,
    [conversations]
  );
  const tiktokUnread = useMemo(
    () => conversations.filter((c) => c.channel === 'tiktok' && c.unread_count > 0).length,
    [conversations]
  );

  // Send message handler
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyInput.trim() || !activeConv) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'seller',
      text: replyInput.trim(),
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
      status: 'read',
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConv.id) {
          return {
            ...c,
            last_message: newMsg.text,
            last_message_time: newMsg.timestamp,
            status: 'read',
            unread_count: 0,
            messages: [...c.messages, newMsg],
          };
        }
        return c;
      })
    );

    setReplyInput('');
  };

  // Quick reply select handler
  const handleSelectQuickReply = (text: string) => {
    setReplyInput(text);
    setShowQuickReplyModal(false);
  };

  // Copy order SN
  const handleCopySn = (sn: string) => {
    navigator.clipboard.writeText(sn);
    setCopiedSn(sn);
    setTimeout(() => setCopiedSn(null), 2000);
  };

  // Save internal note
  const handleSaveNote = () => {
    if (!activeConv) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConv.id ? { ...c, notes: csNoteInput } : c))
    );
    setIsSavedNote(true);
    setTimeout(() => setIsSavedNote(false), 2000);
  };

  return (
    <AppLayout>
      <Head title="Customer Service — Omnichannel Shopee & TikTok Shop" />

      <div className="flex h-[calc(100vh-4.25rem)] flex-col bg-slate-100/70 overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.965 4.966 4.966 0 00.73-1.879C3.642 16.586 3 14.412 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">Customer Service Terpadu</h1>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  Live Omnichannel
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Inbox percakapan pelanggan terpadu untuk Shopee Open Platform & TikTok Shop Partner API
              </p>
            </div>
          </div>
        </header>

        {/* 3-Column Main Workspace */}
        <div className="flex flex-1 overflow-hidden">
          {/* ========================================================= */}
          {/* COLUMN 1: Conversation List & Filter (Width: 340px)       */}
          {/* ========================================================= */}
          <aside className="flex w-80 md:w-88 flex-col border-r border-slate-200 bg-white shrink-0">
            {/* Search & Channel Tabs */}
            <div className="border-b border-slate-100 p-3 space-y-2.5">
              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari pembeli, pesan, resi..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:bg-white focus:outline-hidden"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>

              {/* Channel Filter Pills */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setChannelFilter('all')}
                  className={`flex-1 rounded-lg py-1 text-center text-[11px] font-semibold transition-all ${
                    channelFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({conversations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChannelFilter('shopee')}
                  className={`flex-1 rounded-lg py-1 text-center text-[11px] font-semibold transition-all ${
                    channelFilter === 'shopee'
                      ? 'bg-[#EE4D2D] text-white shadow-xs'
                      : 'bg-orange-50 text-[#EE4D2D] hover:bg-orange-100'
                  }`}
                >
                  Shopee
                </button>
                <button
                  type="button"
                  onClick={() => setChannelFilter('tiktok')}
                  className={`flex-1 rounded-lg py-1 text-center text-[11px] font-semibold transition-all ${
                    channelFilter === 'tiktok'
                      ? 'bg-black text-white shadow-xs'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  TikTok
                </button>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-[11px]">
                <span className="text-slate-400 font-medium">Status:</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`cursor-pointer font-semibold ${statusFilter === 'all' ? 'text-slate-900 font-bold underline decoration-slate-900 underline-offset-4' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Semua
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('unread')}
                  className={`cursor-pointer font-semibold ${statusFilter === 'unread' ? 'text-slate-900 font-bold underline decoration-slate-900 underline-offset-4' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Belum Dibalas
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('resolved')}
                  className={`cursor-pointer font-semibold ${statusFilter === 'resolved' ? 'text-slate-900 font-bold underline decoration-slate-900 underline-offset-4' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Selesai
                </button>
              </div>
            </div>

            {/* Conversation List Items */}
            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Tidak ada percakapan yang cocok dengan filter.
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = conv.id === selectedConvId;
                  const isShopee = conv.channel === 'shopee';

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConvId(conv.id)}
                      className={`group flex cursor-pointer items-start gap-3 p-3 transition-colors ${
                        isSelected
                          ? 'border-l-4 border-slate-900 bg-slate-100/90 font-medium'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Avatar with Channel Badge */}
                      <div className="relative shrink-0">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-xs ${
                            isShopee ? 'bg-orange-100 text-[#EE4D2D]' : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {conv.buyer_name.charAt(0)}
                        </div>
                        <span
                          className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-xs ${
                            isShopee ? 'bg-[#EE4D2D]' : 'bg-black'
                          }`}
                          title={`Channel: ${conv.channel_label}`}
                        >
                          {isShopee ? 'S' : 'TT'}
                        </span>
                      </div>

                      {/* Content preview */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {conv.buyer_name}
                          </p>
                          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                            {conv.last_message_time}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">@{conv.buyer_username}</p>
                        <p
                          className={`mt-1 truncate text-xs ${
                            conv.unread_count > 0 ? 'font-semibold text-slate-900' : 'text-slate-500'
                          }`}
                        >
                          {conv.last_message}
                        </p>
                      </div>

                      {/* Unread Pill */}
                      {conv.unread_count > 0 && (
                        <span className="shrink-0 rounded-full bg-[#EE4D2D] px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums shadow-xs">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* ========================================================= */}
          {/* COLUMN 2: Active Chat Room & Reply Input (Flex-1)        */}
          {/* ========================================================= */}
          <main className="flex flex-1 flex-col bg-slate-50/60 overflow-hidden">
            {activeConv ? (
              <>
                {/* Active Chat Header */}
                <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm ${
                          activeConv.channel === 'shopee'
                            ? 'bg-orange-100 text-[#EE4D2D]'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {activeConv.buyer_name.charAt(0)}
                      </div>
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900">{activeConv.buyer_name}</h2>
                        <span className="text-xs text-slate-400">(@{activeConv.buyer_username})</span>
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            activeConv.channel === 'shopee'
                              ? 'bg-orange-100 text-[#EE4D2D]'
                              : 'bg-black text-white'
                          }`}
                        >
                          {activeConv.channel === 'shopee' ? 'Shopee' : 'TikTok Shop'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Toko: <span className="font-semibold text-slate-700">{activeConv.shop_name}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Online
                    </span>
                  </div>
                </header>

                {/* Chat Messages Thread */}
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {/* Date Divider */}
                  <div className="flex items-center justify-center my-2">
                    <span className="rounded-full bg-slate-200/80 px-3 py-0.5 text-[10px] font-semibold text-slate-600">
                      Hari ini, 13 November 2026
                    </span>
                  </div>

                  {/* Order Context Card in Chat (Shows linked order) */}
                  <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-2">
                      <span className="font-bold uppercase tracking-wider text-slate-700">
                        Pesanan Terkait
                      </span>
                      <span className="font-mono text-slate-900 font-semibold">{activeConv.order.order_sn}</span>
                    </div>
                    <div className="mt-2 flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 border border-slate-200">
                        👟
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 leading-snug">
                          {activeConv.order.product_name}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Variasi: <span className="text-slate-700 font-medium">{activeConv.order.variation}</span>
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-xs font-bold text-[#EE4D2D]">
                            Rp {activeConv.order.price.toLocaleString('id-ID')}
                          </span>
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                            {activeConv.order.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message Bubbles */}
                  {activeConv.messages.map((msg) => {
                    const isBuyer = msg.sender === 'buyer';

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isBuyer ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs ${
                            isBuyer
                              ? 'rounded-tl-xs bg-white text-slate-800 border border-slate-200'
                              : 'rounded-tr-xs bg-slate-900 text-white'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                          <span>{msg.timestamp}</span>
                          {!isBuyer && (
                            <span title="Terkirim & Dibaca" className="text-sky-500 font-bold">
                              ✓✓
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Bar & Actions */}
                <div className="border-t border-slate-200 bg-white p-3 space-y-2">
                  {/* Action Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickReplyModal(true)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-3.5 w-3.5 text-amber-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                      <span>Template Pesan</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReplyInput(
                          'Halo kak! Untuk panduan ukuran sepatu Record Shoes: Size 36 (22.5cm), 37 (23cm), 38 (24cm), 39 (24.5cm), 40 (25.5cm) ya kak.'
                        )
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span>📏 Size Chart</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReplyInput(
                          'Pesanan sudah kami terima dan sedang dalam proses quality control serta packing rapi oleh tim gudang ya kak 🙏'
                        )
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span>📦 Info Kirim</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReplyInput(
                          'Bisa tukar ukuran kak jika kebesaran atau kekecilan! Syaratnya label tag masih utuh dan dus sepatu lengkap ya kak.'
                        )
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span>🔄 Kebijakan Retur</span>
                    </button>
                  </div>

                  {/* Message Input Box */}
                  <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={`Tulis balasan untuk @${activeConv.buyer_username}... (Enter untuk kirim)`}
                      className="flex-1 resize-none rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-hidden"
                    />

                    <button
                      type="submit"
                      disabled={!replyInput.trim()}
                      className={`inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer ${
                        replyInput.trim()
                          ? activeConv.channel === 'shopee'
                            ? 'bg-[#EE4D2D] hover:bg-[#d94122]'
                            : 'bg-black hover:bg-slate-800'
                          : 'bg-slate-300 cursor-not-allowed'
                      }`}
                    >
                      <span>Kirim</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-slate-400">
                Pilih percakapan di kolom kiri untuk mulai membalas pesan pembeli.
              </div>
            )}
          </main>

          {/* ========================================================= */}
          {/* COLUMN 3: Context Panel (Buyer Info & Order Details)      */}
          {/* ========================================================= */}
          {activeConv && (
            <aside className="hidden lg:flex w-80 flex-col border-l border-slate-200 bg-white p-4 overflow-y-auto space-y-4 shrink-0">
              {/* Header Box */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Konteks Pelanggan
                </h3>
                <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                      activeConv.channel === 'shopee'
                        ? 'bg-orange-100 text-[#EE4D2D]'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {activeConv.buyer_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">{activeConv.buyer_name}</p>
                    <p className="text-[11px] text-slate-500">@{activeConv.buyer_username}</p>
                    <span
                      className={`mt-1 inline-block rounded px-1.5 py-0.2 text-[9px] font-bold ${
                        activeConv.channel === 'shopee' ? 'bg-orange-100 text-[#EE4D2D]' : 'bg-black text-white'
                      }`}
                    >
                      {activeConv.channel === 'shopee' ? 'Shopee Buyer' : 'TikTok Shop Buyer'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Information Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Rincian Pesanan
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                    {activeConv.order.status}
                  </span>
                </div>

                {/* No. Pesanan */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">No. Pesanan</span>
                  <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                    <span>{activeConv.order.order_sn}</span>
                    <button
                      type="button"
                      onClick={() => handleCopySn(activeConv.order.order_sn)}
                      title="Salin No. Pesanan"
                      className="cursor-pointer rounded px-1 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                    >
                      {copiedSn === activeConv.order.order_sn ? (
                        <span className="text-emerald-600 font-bold">Disalin</span>
                      ) : (
                        'Salin'
                      )}
                    </button>
                  </div>
                </div>

                {/* Product Detail */}
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-slate-900 leading-snug">
                    {activeConv.order.product_name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Variasi: <span className="font-medium text-slate-800">{activeConv.order.variation}</span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    SKU: {activeConv.order.sku}
                  </p>
                </div>

                {/* Price & Shipping */}
                <div className="border-t border-slate-100 pt-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total Belanja</span>
                    <span className="font-bold text-[#EE4D2D]">
                      Rp {activeConv.order.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Ekspedisi</span>
                    <span className="font-semibold text-slate-800">{activeConv.order.carrier}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">No. Resi</span>
                    <span className="font-mono text-slate-700">
                      {activeConv.order.tracking_number || 'Belum terbit'}
                    </span>
                  </div>
                </div>

                {/* Action Link to Orders / CutOff */}
                <div className="pt-2">
                  <a
                    href={`/cut-off?search=${encodeURIComponent(activeConv.order.order_sn)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span>Buka Rincian Order ERP</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Internal Notes for CS */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Catatan Internal CS
                  </span>
                  {isSavedNote && (
                    <span className="text-[10px] font-bold text-emerald-600">Tersimpan!</span>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={csNoteInput}
                  onChange={(e) => setCsNoteInput(e.target.value)}
                  placeholder="Tambahkan catatan tindak lanjut pesanan pembeli ini..."
                  className="w-full resize-none rounded-lg border border-slate-200 p-2 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="w-full cursor-pointer rounded-lg bg-slate-900 py-1 text-center text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  Simpan Catatan
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Quick Reply Modal */}
      {showQuickReplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 font-bold text-xs">
                  ⚡
                </span>
                <h3 className="text-sm font-bold text-slate-900">Template Pesan Cepat (Quick Reply)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickReplyModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {quickReplies.map((qr) => (
                <div
                  key={qr.id}
                  onClick={() => handleSelectQuickReply(qr.text)}
                  className="group flex cursor-pointer flex-col p-3 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-slate-900">
                      {qr.title}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {qr.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{qr.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowQuickReplyModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

