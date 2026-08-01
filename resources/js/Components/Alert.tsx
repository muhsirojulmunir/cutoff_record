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
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl transition-all duration-300 animate-slide-in
        ${type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
        }`}
    >
      <div className="shrink-0">
        {type === 'success' ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium">{message}</p>
      <button
        onClick={() => setVisible(false)}
        className="ml-auto p-0.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
