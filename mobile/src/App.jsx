import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { FleetProvider, useFleet } from './lib/fleet.jsx';
import { isNative } from './lib/api.js';
import { onNotificationTap } from './lib/notify.js';
import { registerPush } from './lib/push.js';
import { checkUpdate } from './lib/update.js';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import { Icon } from './components/ui.jsx';
import Login from './screens/Login.jsx';
import MapScreen from './screens/MapScreen.jsx';
import ListScreen from './screens/ListScreen.jsx';
import AlertsScreen from './screens/AlertsScreen.jsx';
import AccountScreen from './screens/AccountScreen.jsx';
import DetailScreen from './screens/DetailScreen.jsx';
import HistoryScreen from './screens/HistoryScreen.jsx';
import CommandsScreen from './screens/CommandsScreen.jsx';
import RoutesScreen from './screens/RoutesScreen.jsx';

function Splash({ children }) {
  return <div className="splash"><div className="logo">HB</div>{children}</div>;
}

function Shell() {
  const { banner, dismissBanner, unread } = useFleet();
  const [tab, setTab] = useState('map');
  const [selectedId, setSelectedId] = useState(null);
  const [stack, setStack] = useState([]); // pantallas encima: { type, id }
  const [update, setUpdate] = useState(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const push = useCallback((layer) => setStack((s) => [...s, layer]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const pick = useCallback((id) => { setSelectedId(id); setTab('map'); setStack([]); }, []);

  // Botón «atrás» de Android: cierra la pantalla de encima; si no hay, vuelve al mapa; en el mapa sale de la app.
  useEffect(() => {
    if (!isNative) return undefined;
    const sub = CapApp.addListener('backButton', () => {
      if (stackRef.current.length) pop();
      else if (tabRef.current !== 'map') setTab('map');
      else if (selectedId) setSelectedId(null);
      else CapApp.minimizeApp();
    });
    return () => { sub.then((s) => s.remove()).catch(() => undefined); };
  }, [pop, selectedId]);

  // Al abrir: buscar una APK nueva y dejar este teléfono registrado para recibir los avisos push de la cuenta.
  useEffect(() => {
    if (!isNative) return undefined;
    const timer = setTimeout(() => { checkUpdate().then((u) => u.available && setUpdate(u)).catch(() => undefined); registerPush((data) => { if (data.deviceId) pick(data.deviceId); else setTab('alerts'); }); }, 2500);
    return () => clearTimeout(timer);
  }, [pick]);

  // Tocar un aviso del teléfono abre el GPS de esa alerta.
  useEffect(() => onNotificationTap((extra) => { if (extra.deviceId) pick(extra.deviceId); else setTab('alerts'); }), [pick]);

  const top = stack.at(-1);
  const goDevice = (id) => push({ type: 'detail', id });
  const common = { onDetail: goDevice, onHistory: (id) => push({ type: 'history', id }), onCommands: (id) => push({ type: 'commands', id }), onShare: (id) => push({ type: 'detail', id, share: true }) };

  return (
    <div className="app">
      {tab === 'map' && <MapScreen selectedId={selectedId} onSelect={setSelectedId} onAlerts={() => setTab('alerts')} {...common} />}
      {tab === 'list' && <ListScreen selectedId={selectedId} onPick={pick} {...common} />}
      {tab === 'alerts' && <AlertsScreen onPick={pick} />}
      {tab === 'account' && <AccountScreen onRoutes={() => push({ type: 'routes' })} onUpdate={setUpdate} />}

      {top?.type === 'detail' && <DetailScreen id={top.id} autoShare={top.share} onBack={pop} onHistory={common.onHistory} onCommands={common.onCommands} onShowOnMap={pick} />}
      {top?.type === 'history' && <HistoryScreen id={top.id} onBack={pop} />}
      {top?.type === 'commands' && <CommandsScreen id={top.id} onBack={pop} />}
      {top?.type === 'routes' && <RoutesScreen onBack={pop} />}

      {!top && (
        <nav className="nav" aria-label="Secciones">
          {[['map', 'Mapa', 'map'], ['list', 'Equipos', 'list'], ['alerts', 'Alertas', 'bell'], ['account', 'Cuenta', 'user']].map(([id, label, icon]) => (
            <button key={id} type="button" className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
              <Icon name={icon} size={24} />{label}{id === 'alerts' && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </nav>
      )}

      {update && <UpdatePrompt update={update} onClose={() => setUpdate(null)} />}

      {banner && (
        <button type="button" className="banner" onClick={() => { dismissBanner(); if (banner.deviceId) pick(banner.deviceId); else setTab('alerts'); }}>
          <div className="logo">HB</div>
          <div className="flex1"><b>{banner.title}</b><p>{banner.body}</p></div>
        </button>
      )}
    </div>
  );
}

function Gate() {
  const { status, me, retry } = useAuth();
  if (status === 'loading') return <Splash><p>Abriendo HB GPS…</p></Splash>;
  if (status === 'offline') return <Splash><p>No hay conexión con el servidor. Revisa tu internet y vuelve a intentar.</p><button type="button" onClick={retry}>Reintentar</button></Splash>;
  if (status === 'out') return <Login />;
  if (status === 'locked') return <Login locked />;
  return <FleetProvider me={me}><Shell /></FleetProvider>;
}

export default function App() {
  return <AuthProvider><Gate /></AuthProvider>;
}
