/// <reference types="vite/client" />
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

const pages = import.meta.glob<{ default: any }>('./Pages/**/*.tsx');

createInertiaApp({
  resolve: async (name) => {
    const loader = pages[`./Pages/${name}.tsx`];
    if (!loader) {
      throw new Error(`Halaman Inertia tidak ditemukan: ./Pages/${name}.tsx`);
    }
    const pageModule = await loader();
    return pageModule.default;
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
