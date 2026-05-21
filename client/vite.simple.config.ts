import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Racine absolue : obligatoire pour Cloudflare Pages + routes SPA (/superadmin/*).
  // base: './' casse les assets sur les sous-chemins (./assets → /superadmin/assets → index.html).
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: {
          vendor: ['react', 'react-dom', 'wouter', 'zustand'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', 'lucide-react', 'framer-motion'],
          maps: ['leaflet', 'react-leaflet-markercluster', 'maplibre-gl'],
          charts: ['recharts'],
          utils: ['axios', 'zod', 'date-fns']
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    'process.env': {}
  }
});
