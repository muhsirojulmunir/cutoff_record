import React, { useEffect, useState } from 'react';

interface AlertProps {
  message: string | null;
  type?: 'success' | 'error';
}

export default function Alert({ message, type = 'success' }: AlertProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 5000); // Auto hide after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-xl transition-all duration-300 animate-slide-in max-w-md
        ${type === 'success'
          ? 'bg-slate-900 border-emerald-500/50 text-emerald-200'
          : 'bg-slate-900 border-rose-500/50 text-rose-200'
        }`}
    >
      <div className="shrink-0">
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
      <p className="text-xs font-semibold leading-snug">{message}</p>
      <button
        onClick={() => setVisible(false)}
        className="ml-auto p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
