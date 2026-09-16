import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      // Le module monetaire est partage avec le serveur plutot que recopie :
      // deux implementations des montants finiraient par diverger, et un
      // ecart entre le total affiche et le total enregistre serait invisible.
      '@domaine': resolve(import.meta.dirname, '../src/domaine'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4173' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
