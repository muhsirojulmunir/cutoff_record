import React from 'react';
import { Link } from '@inertiajs/react';

interface LinkItem {
  url: string | null;
  label: string;
  active: boolean;
}

interface PaginationProps {
  links: LinkItem[];
}

export default function Pagination({ links }: PaginationProps) {
  // Don't show pagination if there is only 1 page
  if (links.length <= 3) return null;

  return (
    <div className="flex flex-wrap gap-1 items-center justify-center sm:justify-end mt-4">
      {links.map((link, key) => {
        const cleanLabel = link.label
          .replace('&laquo;', '«')
          .replace('&raquo;', '»')
          .replace('Previous', 'Sebelumnya')
          .replace('Next', 'Berikutnya');

        if (link.url === null) {
          return (
            <div
              key={key}
              className="px-3 py-1.5 text-xs text-slate-600 bg-slate-900/40 rounded-lg border border-slate-800/80 cursor-not-allowed select-none"
            >
              {cleanLabel}
            </div>
          );
        }

        return (
          <Link
            key={key}
            href={link.url}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-all duration-150
              ${link.active
                ? 'bg-violet-600 border-violet-500 text-white font-semibold'
                : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
          >
            {cleanLabel}
          </Link>
        );
      })}
    </div>
  );
}
