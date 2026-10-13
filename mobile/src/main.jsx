import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import '@fontsource-variable/manrope';
import 'leaflet/dist/leaflet.css';
import './styles/map.css';
import './styles/app.css';
import App from './App.jsx';
import { isNative } from './lib/api.js';

if (isNative) {
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
}
createRoot(document.getElementById('root')).render(<App />);
if (isNative) setTimeout(() => SplashScreen.hide().catch(() => undefined), 300);
