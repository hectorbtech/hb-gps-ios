import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api se reenvía a la API local (npm run dev). Para otra URL: VITE_API_PROXY=http://host:8780
export default defineConfig({
  plugins: [react()],
  server: { port: 5191, proxy: { '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:8780', changeOrigin: true } } },
  build: { sourcemap: false, rollupOptions: { output: { manualChunks: (id) => (id.includes('leaflet') ? 'map' : undefined) } } }
});
