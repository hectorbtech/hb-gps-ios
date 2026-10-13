import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = (name) => path.resolve(here, 'node_modules', name);
// @capacitor-firebase/messaging solo se instala al compilar la app de iPhone (choca con @capacitor/push-notifications en Android):
// si no esta, se usa un sustituto vacio para que el desarrollo, la web y Android compilen igual.
const hasFirebaseMessaging = fs.existsSync(path.resolve(here, 'node_modules', '@capacitor-firebase', 'messaging'));

// La app reutiliza del portal el mapa, los formatos y los textos de error (mismo repositorio); React y Leaflet salen de una sola copia.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      ...(hasFirebaseMessaging ? [] : [{ find: '@capacitor-firebase/messaging', replacement: path.resolve(here, 'src/lib/firebase-messaging-stub.js') }]),
      { find: '@portal', replacement: path.resolve(here, '../portal/src') },
      { find: /^react$/, replacement: mod('react') },
      { find: /^react-dom$/, replacement: mod('react-dom') },
      { find: /^react\/jsx-runtime$/, replacement: mod('react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: mod('react/jsx-dev-runtime.js') },
      { find: /^leaflet$/, replacement: mod('leaflet') },
      { find: /^leaflet\/dist\/leaflet\.css$/, replacement: mod('leaflet/dist/leaflet.css') }
    ],
    dedupe: ['react', 'react-dom', 'leaflet']
  },
  server: { port: 5192, host: '127.0.0.1', fs: { allow: [path.resolve(here, '..')] }, proxy: { '/api': 'http://localhost:8780' } },
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 900 }
});
