import React, { useEffect, useMemo, useRef, useState } from 'react';

interface SkuOption {
  id: number;
  sku: string;
  name: string;
  stock?: number;
}

interface Props {
  value: string;
  onChange: (sku: string) => void;
  options: SkuOption[];
  placeholder?: string;
  className?: string;
  /** Tandai merah bila SKU yang diketik tidak ada di daftar. */
  invalid?: boolean;
  id?: string;
  autoFocus?: boolean;
  /** Berapa banyak hasil yang ditampilkan sekaligus. */
  maxResults?: number;
}

/**
 * Pencari SKU untuk daftar produk yang banyak.
 *
 * Dibuat menggantikan dropdown dan datalist: dropdown menyulitkan bila
 * produknya ribuan, sedangkan datalist ikut memunculkan nama produk dan
 * tampilannya berbeda-beda antar peramban. Di sini hanya SKU yang tampil,
 * bisa diketik, ditempel, disalin, dan dipilih lewat papan ketik.
 */
export default function SkuSearchInput({
  value,
  onChange,
  options,
  placeholder = 'Ketik / tempel SKU',
  className = '',
  invalid = false,
  id,
  autoFocus,
  maxResults = 50,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const keyword = value.trim().toLowerCase();

  const matches = useMemo(() => {
    if (keyword === '') return options.slice(0, maxResults);

    // SKU yang diawali kata kunci didahulukan agar hasil paling relevan di atas.
    const startsWith: SkuOption[] = [];
    const contains: SkuOption[] = [];

    for (const option of options) {
      const sku = option.sku.toLowerCase();
      if (sku.startsWith(keyword)) startsWith.push(option);
      else if (sku.includes(keyword) || option.name.toLowerCase().includes(keyword)) contains.push(option);
    }

    return [...startsWith, ...contains].slice(0, maxResults);
  }, [options, keyword, maxResults]);

  const exactMatch = useMemo(
    () => options.find((o) => o.sku.trim().toLowerCase() === keyword),
    [options, keyword],
  );

  useEffect(() => {
    setHighlight(0);
  }, [keyword]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  /** Jaga agar baris yang disorot tetap terlihat saat digeser dengan panah. */
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function pick(option: SkuOption) {
    onChange(option.sku);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((prev) => Math.min(prev + 1, matches.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === 'Enter' && open && matches[highlight]) {
      e.preventDefault();
      pick(matches[highlight]);
      return;
    }

    if (e.key === 'Escape') setOpen(false);
  }

  async function copySku() {
    if (value.trim() === '') return;

    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Peramban lama tanpa izin clipboard: teksnya tetap bisa disalin manual.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${className} ${invalid ? 'border-rose-300 bg-rose-50 text-rose-700' : ''} pr-9`}
      />

      {/* Salin SKU — berguna saat menyalin ke dokumen atau chat */}
      {value.trim() !== '' && (
        <button
          type="button"
          onClick={copySku}
          title={copied ? 'Tersalin' : 'Salin SKU'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-all"
        >
          {copied ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 text-teal-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
          )}
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-300 rounded-xl shadow-xl overflow-hidden">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400">
              SKU tidak ditemukan{keyword !== '' ? ` untuk "${value.trim()}"` : ''}.
            </p>
          ) : (
            <ul ref={listRef} className="max-h-56 overflow-y-auto sidebar-scroll py-1">
              {matches.map((option, index) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => pick(option)}
                    title={option.name}
                    className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                      index === highlight ? 'bg-teal-50 text-teal-800' : 'text-gray-800 hover:bg-gray-50'
                    } ${exactMatch?.id === option.id ? 'font-bold' : ''}`}
                  >
                    {option.sku}
                    {option.stock !== undefined && (
                      <span className="float-right text-[10px] text-gray-400">stok {option.stock}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {matches.length >= maxResults && (
            <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">
              Menampilkan {maxResults} teratas — ketik lebih spesifik untuk mempersempit.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
