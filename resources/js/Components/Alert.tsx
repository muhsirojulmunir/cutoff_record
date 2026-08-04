import React, { useEffect, useState, useRef } from 'react';
import { usePage } from '@inertiajs/react';

interface AlertProps {
  message: string | null;
  type?: 'success' | 'error';
}

export default function Alert({ message, type = 'success' }: AlertProps) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const page = usePage();

  const handleDismiss = () => {
    setLeaving(true);
    if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    unmountTimerRef.current = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 500); // 500ms smooth fade out
  };

  useEffect(() => {
    if (message) {
      setMounted(true);
      setLeaving(false);

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);

      // Auto hide setelah 5 detik dengan animasi smooth
      hideTimerRef.current = setTimeout(() => {
        handleDismiss();
      }, 5000);

      return () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      };
    } else {
      setMounted(false);
      setLeaving(false);
    }
  }, [message, type, page.props]);

  if (!mounted || !message) return null;

  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-500 ease-in-out transform max-w-md
        ${leaving ? 'opacity-0 -translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'}
        ${type === 'success'
          ? 'bg-slate-950/95 border-emerald-500/40 text-emerald-200 shadow-emerald-950/30'
          : 'bg-slate-950/95 border-rose-500/40 text-rose-200 shadow-rose-950/30'
        }`}
    >
      <div className="shrink-0 p-1 rounded-xl bg-white/5 border border-white/10">
        {type === 'success' ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-rose-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        )}
      </div>
      <p className="text-xs font-semibold leading-snug tracking-wide">{message}</p>
      <button
        onClick={handleDismiss}
        className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        title="Tutup"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
