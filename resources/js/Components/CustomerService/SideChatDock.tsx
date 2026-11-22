import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, usePage } from '@inertiajs/react';

export interface SideChatMessage {
  id: string;
  sender: 'buyer' | 'seller';
  text: string;
  timestamp: string;
}

export interface SideChatOrder {
  order_sn: string;
  product_name: string;
  variation: string;
  sku: string;
  price: number;
  status: string;
}

export interface SideChatConversation {
  id: string;
  channel: 'shopee' | 'tiktok';
  channel_label: string;
  shop_name: string;
  buyer_username: string;
  buyer_name: string;
  unread_count: number;
  last_message: string;
  last_message_time: string;
  group: 'unread' | 'auto' | 'manual';
  order: SideChatOrder;
  messages: SideChatMessage[];
}

export interface SideChatProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function SideChatDock({ isOpen: controlledIsOpen, onClose }: SideChatProps = {}) {
  const { url } = usePage();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const [conversations, setConversations] = useState<SideChatConversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | 'shopee' | 'tiktok'>('all');
  const [tab, setTab] = useState<'today' | 'all'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  
  // Accordion toggle states
  const [openUnread, setOpenUnread] = useState(true);
  const [openAuto, setOpenAuto] = useState(false);
  const [openManual, setOpenManual] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Total unread count
  const totalUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread_count > 0 ? 1 : 0), 0);
  }, [conversations]);

  // Channel unread counts
  const shopeeCount = useMemo(() => {
    return conversations.filter((c) => c.channel === 'shopee').length;
  }, [conversations]);

  const tiktokCount = useMemo(() => {
    return conversations.filter((c) => c.channel === 'tiktok').length;
  }, [conversations]);

  // Listen to custom event from topbar header button
  useEffect(() => {
    const handleToggle = () => {
      if (onClose && controlledIsOpen !== undefined) {
        if (controlledIsOpen) onClose();
      } else {
        setInternalIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('toggle-side-chat-dock', handleToggle);
    return () => window.removeEventListener('toggle-side-chat-dock', handleToggle);
  }, [controlledIsOpen, onClose]);

  // Mapper helper
  const mapApiConversations = (rawList: any[]): SideChatConversation[] => {
    return rawList.map((c: any) => ({
      id: String(c.id),
      channel: c.channel === 'tiktok' ? 'tiktok' : 'shopee',
      channel_label: c.channel_label || (c.channel === 'shopee' ? 'Shopee' : 'TikTok Shop'),
      shop_name: c.shop_name || (c.channel === 'shopee' ? 'Record Shoes Official Shop' : 'Record Shoes Official TikTok'),
      buyer_username: c.buyer_username || 'buyer',
      buyer_name: c.buyer_name || c.buyer_username || 'Pembeli',
      unread_count: Number(c.unread_count || 0),
      last_message: c.last_message || '',
      last_message_time: c.last_message_time || '',
      group: (c.unread_count > 0 ? 'unread' : (c.status === 'resolved' ? 'auto' : 'manual')) as 'unread' | 'auto' | 'manual',
      order: c.order || {
        order_sn: '-',
        product_name: '-',
        variation: '-',
        sku: '-',
        price: 0,
        status: '-',
      },
      messages: Array.isArray(c.messages)
        ? c.messages.map((m: any) => ({
            id: String(m.id),
            sender: m.sender === 'buyer' ? 'buyer' : 'seller',
            text: m.text || '',
            timestamp: m.timestamp || '',
          }))
        : [],
    }));
  };

  // 1. Listen to instant broadcast from CustomerService Index.tsx
  useEffect(() => {
    const handleSyncFromPage = (e: any) => {
      if (Array.isArray(e.detail)) {
        const mapped = mapApiConversations(e.detail);
        setConversations(mapped);
        setIsLoaded(true);
      }
    };
    window.addEventListener('cs-conversations-updated', handleSyncFromPage as any);
    return () => window.removeEventListener('cs-conversations-updated', handleSyncFromPage as any);
  }, []);

  // 2. Listen to active conversation selection broadcast from main page
  useEffect(() => {
    const handleActiveChanged = (e: any) => {
      if (e.detail !== undefined) {
        setSelectedConvId(e.detail ? String(e.detail) : null);
      }
    };
    window.addEventListener('cs-active-conversation-changed', handleActiveChanged as any);
    return () => window.removeEventListener('cs-active-conversation-changed', handleActiveChanged as any);
  }, []);

  // 3. Poll live conversations from API
  useEffect(() => {
    let isMounted = true;
    const fetchLive = () => {
      fetch('/customer-service/poll', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted) return;
          if (data?.conversations && Array.isArray(data.conversations)) {
            const mapped = mapApiConversations(data.conversations);
            setConversations(mapped);
            setIsLoaded(true);

            // Broadcast unread count
            const unreadCount = mapped.reduce((acc, c) => acc + (c.unread_count > 0 ? 1 : 0), 0);
            window.dispatchEvent(new CustomEvent('cs-unread-count-updated', { detail: unreadCount }));
          }
        })
        .catch(() => {});
    };

    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Active selected conversation in mini chat view
  const activeConv = useMemo(() => {
    if (!selectedConvId) return null;
    return conversations.find((c) => c.id === selectedConvId) || null;
  }, [conversations, selectedConvId]);

  // Auto scroll in mini chat
  useEffect(() => {
    if (activeConv) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConv?.messages.length]);

  // Filtered list
  const filteredList = useMemo(() => {
    return conversations.filter((c) => {
      if (channelFilter !== 'all' && c.channel !== channelFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchName = (c.buyer_name || '').toLowerCase().includes(q);
        const matchUser = (c.buyer_username || '').toLowerCase().includes(q);
        const matchSn = c.order?.order_sn ? c.order.order_sn.toLowerCase().includes(q) : false;
        const matchMsg = (c.last_message || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchSn && !matchMsg) return false;
      }
      return true;
    });
  }, [conversations, channelFilter, searchQuery]);

  // Groups
  const unreadItems = useMemo(
    () => filteredList.filter((c) => c.group === 'unread' || c.unread_count > 0),
    [filteredList]
  );
  const autoItems = useMemo(
    () => filteredList.filter((c) => c.group === 'auto'),
    [filteredList]
  );
  const manualItems = useMemo(
    () =>
      filteredList.filter(
        (c) =>
          c.group === 'manual' ||
          (c.group !== 'unread' && c.group !== 'auto' && (c.unread_count === 0 || !c.unread_count))
      ),
    [filteredList]
  );

  // Send message from mini chat view
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !activeConv) return;

    const textToSend = replyText.trim();
    const tempId = `sc-msg-${Date.now()}`;
    const newMsg: SideChatMessage = {
      id: tempId,
      sender: 'seller',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConv.id) {
          return {
            ...c,
            unread_count: 0,
            group: 'manual',
            last_message: textToSend,
            last_message_time: 'Baru saja',
            messages: [...c.messages, newMsg],
          };
        }
        return c;
      })
    );

    setReplyText('');

    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
      await fetch('/customer-service/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
        },
        body: JSON.stringify({
          conversation_id: activeConv.id,
          text: textToSend,
        }),
      });
      window.dispatchEvent(new CustomEvent('cs-message-sent', { detail: activeConv.id }));
    } catch {}
  };

  const handleSelectConv = (convId: string) => {
    setSelectedConvId(convId);
    window.dispatchEvent(new CustomEvent('cs-select-conversation', { detail: convId }));

    // Mark as read locally and dispatch to server
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
    );

    try {
      const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
      fetch(`/customer-service/${convId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
        },
      }).catch(() => {});
    } catch {}
  };

  return (
    <>
      {/* Slide-out Drawer Panel (Positioned adjacent to Right Rail Dock on desktop) */}
      {isOpen && (
        <>
          {/* Subtle mobile backdrop */}
          <div
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-2xs md:hidden"
          />

          <div
            className="fixed inset-y-0 right-0 md:right-14 z-50 flex w-full max-w-[340px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out sm:w-[340px]"
            style={{ animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {/* ========================================================= */}
            {/* MODE 1: Conversation List View (Default)                  */}
            {/* ========================================================= */}
            {!activeConv ? (
              <div className="flex h-full flex-col overflow-hidden">
                {/* Header Bar (Directly modeled after Gambar 2) */}
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-3 bg-white">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black tracking-tight text-[#EE4D2D]">Chat</span>
                    
                    {/* Dropdown Trigger */}
                    <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/70 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      <span className="truncate max-w-[85px]">Chat Pembeli</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-400">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Webchat Link */}
                    <Link
                      href="/customer-service"
                      onClick={handleClose}
                      className="flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                      title="Buka Halaman Customer Service Penuh"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      <span>Webchat</span>
                    </Link>

                    <span className="text-slate-300">|</span>

                    {/* Collapse Button (» like Gambar 2) */}
                    <button
                      type="button"
                      onClick={handleClose}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Tutup Panel Chat"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
              <div className="p-2.5 border-b border-slate-100 bg-white">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama atau pesan..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-800 focus:bg-white focus:outline-hidden"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>

                {/* PR USER: Solusi Tampilan Shopee + TikTok Terpadu (Clean & Anti AI-Slop) */}
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setChannelFilter('all')}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] font-bold transition-all cursor-pointer ${
                      channelFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua ({conversations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelFilter('shopee')}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] font-bold transition-all cursor-pointer ${
                      channelFilter === 'shopee'
                        ? 'bg-orange-50 text-[#EE4D2D] border border-orange-200'
                        : 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-[#EE4D2D]'
                    }`}
                  >
                    Shopee ({shopeeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelFilter('tiktok')}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] font-bold transition-all cursor-pointer ${
                      channelFilter === 'tiktok'
                        ? 'bg-slate-100 text-slate-900 border border-slate-300'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    TikTok ({tiktokCount})
                  </button>
                </div>
              </div>

              {/* Tabs: Chat Hari Ini & Semua Chat (Sesuai Gambar 2) */}
              <div className="flex border-b border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setTab('today')}
                  className={`flex-1 py-2 text-center text-xs font-bold transition-all cursor-pointer ${
                    tab === 'today'
                      ? 'border-b-2 border-[#EE4D2D] text-[#EE4D2D]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Chat Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => setTab('all')}
                  className={`flex-1 py-2 text-center text-xs font-bold transition-all cursor-pointer ${
                    tab === 'all'
                      ? 'border-b-2 border-[#EE4D2D] text-[#EE4D2D]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Chat
                </button>
              </div>

              {/* Accordion Group List (Persis Struktur Gambar 2) */}
              <div className="flex-1 divide-y divide-slate-100 overflow-y-auto bg-white">
                {/* 1. Accordion: Belum Dibalas */}
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenUnread(!openUnread)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">{openUnread ? '▼' : '▶'}</span>
                      <span>Belum Dibalas ({unreadItems.length})</span>
                    </div>
                    {unreadItems.length > 0 && (
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                    )}
                  </button>

                  {openUnread && (
                    <div className="divide-y divide-slate-50">
                      {unreadItems.length === 0 ? (
                        <p className="px-5 py-3 text-[11px] text-slate-400">Tidak ada chat belum dibalas.</p>
                      ) : (
                        unreadItems.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectConv(c.id)}
                            className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors bg-orange-50/20"
                          >
                            {/* Avatar with Channel Badge */}
                            <div className="relative shrink-0">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                                {c.buyer_name.charAt(0)}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white shadow-2xs ${
                                  c.channel === 'shopee' ? 'bg-[#EE4D2D]' : 'bg-black'
                                }`}
                              >
                                {c.channel === 'shopee' ? 'S' : 'T'}
                              </span>
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="truncate text-xs font-bold text-slate-900">
                                  {c.buyer_username}
                                </span>
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  {c.last_message_time}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-800 leading-tight">
                                {c.last_message}
                              </p>
                            </div>

                            {/* Unread dot badge */}
                            {c.unread_count > 0 && (
                              <span className="shrink-0 mt-1 h-2 w-2 rounded-full bg-rose-600" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Accordion: Dibalas Otomatis */}
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenAuto(!openAuto)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">{openAuto ? '▼' : '▶'}</span>
                      <span>Dibalas Otomatis ({autoItems.length})</span>
                    </div>
                  </button>

                  {openAuto && (
                    <div className="divide-y divide-slate-50">
                      {autoItems.length === 0 ? (
                        <p className="px-5 py-3 text-[11px] text-slate-400">Tidak ada chat dibalas otomatis.</p>
                      ) : (
                        autoItems.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectConv(c.id)}
                            className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                          >
                            <div className="relative shrink-0">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                                {c.buyer_name.charAt(0)}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white ${
                                  c.channel === 'shopee' ? 'bg-[#EE4D2D]' : 'bg-black'
                                }`}
                              >
                                {c.channel === 'shopee' ? 'S' : 'T'}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="truncate text-xs font-semibold text-slate-800">
                                  {c.buyer_username}
                                </span>
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  {c.last_message_time}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500 leading-tight">
                                {c.last_message}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Accordion: Dibalas Manual */}
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenManual(!openManual)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">{openManual ? '▼' : '▶'}</span>
                      <span>Dibalas Manual ({manualItems.length})</span>
                    </div>
                  </button>

                  {openManual && (
                    <div className="divide-y divide-slate-50">
                      {manualItems.length === 0 ? (
                        <p className="px-5 py-3 text-[11px] text-slate-400">Tidak ada chat dibalas manual.</p>
                      ) : (
                        manualItems.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectConv(c.id)}
                            className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                          >
                            <div className="relative shrink-0">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                                {c.buyer_name.charAt(0)}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white ${
                                  c.channel === 'shopee' ? 'bg-[#EE4D2D]' : 'bg-black'
                                }`}
                              >
                                {c.channel === 'shopee' ? 'S' : 'T'}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="truncate text-xs font-semibold text-slate-800">
                                  {c.buyer_username}
                                </span>
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  {c.last_message_time}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500 leading-tight">
                                {c.last_message}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* MODE 2: Mini Conversation View (Chat Langsung di Drawer)  */
            /* ========================================================= */
            <div className="flex h-full flex-col overflow-hidden bg-slate-50/50">
              {/* Mini Header */}
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  <span>Daftar Chat</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      activeConv.channel === 'shopee'
                        ? 'bg-orange-100 text-[#EE4D2D]'
                        : 'bg-black text-white'
                    }`}
                  >
                    {activeConv.channel === 'shopee' ? 'Shopee' : 'TikTok'}
                  </span>
                  <Link
                    href="/customer-service"
                    onClick={handleClose}
                    className="text-xs font-bold text-sky-600 hover:underline"
                    title="Buka Halaman Customer Service Penuh"
                  >
                    Webchat ↗
                  </Link>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Buyer Context Strip */}
              <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 shrink-0">
                  {activeConv.buyer_name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900 leading-none">
                    {activeConv.buyer_name}
                  </p>
                  <p className="truncate text-[10px] text-slate-500 mt-0.5 leading-none">
                    @{activeConv.buyer_username} · {activeConv.shop_name}
                  </p>
                </div>
              </div>

              {/* Order Context Card */}
              {activeConv.order && (
                <div className="border-b border-slate-200 bg-amber-50/40 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                    <a
                      href={
                        activeConv.channel === 'shopee'
                          ? `/shopee-orders?search=${encodeURIComponent(activeConv.order.order_sn)}`
                          : `/tiktok-orders?search=${encodeURIComponent(activeConv.order.order_sn)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sky-700 hover:underline"
                    >
                      Pesanan: {activeConv.order.order_sn} ↗
                    </a>
                    <span className="rounded bg-amber-100 px-1 text-amber-800 font-bold">
                      {activeConv.order.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-semibold text-slate-800 text-[11px]">
                    {activeConv.order.product_name}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">{activeConv.order.variation}</span>
                    <span className="font-bold text-[#EE4D2D]">
                      Rp {activeConv.order.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              )}

              {/* Message Thread */}
              <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                {activeConv.messages.map((m) => {
                  const isBuyer = m.sender === 'buyer';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isBuyer ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-snug shadow-2xs ${
                          isBuyer
                            ? 'rounded-tl-xs bg-white text-slate-800 border border-slate-200'
                            : 'rounded-tr-xs bg-slate-900 text-white'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                      <span className="mt-0.5 text-[9px] text-slate-400">{m.timestamp}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Mini Quick Reply Chips */}
              <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-1.5 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setReplyText('Halo kak! Variasi dan ukuran ini ready stok ya 😊')}
                  className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  ⚡ Stok Ready
                </button>
                <button
                  type="button"
                  onClick={() => setReplyText('Size Chart: 36 (22.5cm), 37 (23cm), 38 (24cm), 39 (24.5cm), 40 (25.5cm).')}
                  className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  📏 Size Chart
                </button>
                <button
                  type="button"
                  onClick={() => setReplyText('Bisa tukar ukuran jika kebesaran/kekecilan kak! Label dan dus harus lengkap.')}
                  className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  🔄 Retur/Size
                </button>
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="border-t border-slate-200 bg-white p-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Tulis balasan..."
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:bg-white focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim()}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer ${
                      replyText.trim()
                        ? activeConv.channel === 'shopee'
                          ? 'bg-[#EE4D2D] hover:bg-[#d94122]'
                          : 'bg-black hover:bg-slate-800'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                  >
                    Kirim
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        </>
      )}
    </>
  );
}

