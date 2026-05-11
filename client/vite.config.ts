import react from '@vitejs/plugin-react'
import os from 'os'
import path from 'path'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

// Vérifier si on est en mode développement
const isDev = process.env.NODE_ENV !== 'production'

// Détecter l'IP locale IPv4 (non interne) pour HMR si VITE_HMR_HOST non défini
function getLocalExternalIP(): string | undefined {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    const addrs = nets[name]
    if (!addrs) continue
    for (const net of addrs) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
}

const HMR_HOST = process.env.VITE_HMR_HOST || getLocalExternalIP() || 'localhost'
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:3000'
const WS_BACKEND_URL = BACKEND_URL.replace(/^http/, 'ws')

export default defineConfig({
  base: isDev ? '/' : './',
  plugins: [
    react({
      babel: { configFile: './babel.config.js' }
    }),
    ...(isDev ? [mkcert()] : [])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: isDev,
    minify: !isDev ? 'esbuild' : false,
    target: ['es2015', 'chrome60', 'firefox60', 'safari12', 'edge79'],
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['wouter'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          utils: ['axios', 'zod', 'date-fns']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: (isDev ? true : false) as any,
    hmr: {
      host: HMR_HOST,
      protocol: isDev ? 'wss' : 'ws',
      port: 5173
    },
    cors: true,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: WS_BACKEND_URL,
        ws: true,
        changeOrigin: true
      }
    }
  },
  clearScreen: false
})
