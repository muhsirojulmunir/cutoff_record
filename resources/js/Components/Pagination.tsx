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
    <div className="flex flex-wrap gap-1.5 items-center justify-center sm:justify-end mt-5">
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
              className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-teal-50/60 rounded-xl border border-gray-200 cursor-not-allowed select-none"
            >
              {cleanLabel}
            </div>
          );
        }

        return (
          <Link
            key={key}
            href={link.url}
            className={`px-3 py-1.5 text-xs rounded-xl border transition-all duration-200
              ${link.active
                ? 'bg-gradient-to-r from-teal-600 to-cyan-600 border-teal-500/50 text-white font-semibold shadow-md shadow-teal-500/20 scale-[1.02]'
                : 'bg-gray-50/60 border-gray-300/80 text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-100'
              }`}
          >
            {cleanLabel}
          </Link>
        );
      })}
    </div>
  );
}
