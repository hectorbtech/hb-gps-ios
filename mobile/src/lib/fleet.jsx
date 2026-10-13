import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { get, getFull, isNative, openStream, qs } from './api.js';
import { notifyAlert, setupNotifications } from './notify.js';
import { store } from './storage.js';

// Flota en vivo de la app: una foto completa al entrar y el flujo en vivo (SSE) la mantiene al día. Si el flujo se cae,
// se consulta cada 15 s y se reintenta solo; al volver a abrir la app se refresca todo.
const FleetContext = createContext(null);
export const useFleet = () => useContext(FleetContext);

const statusOf = (live) => {
  if (live.lat == null) return 'no_data';
  if (!live.online) return 'offline';
  if (live.moving) return 'moving';
  return live.ignition ? 'idle' : 'stopped';
};

export function FleetProvider({ me, children }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyIdState] = useState(me.companyId || '');
  const [devices, setDevices] = useState(() => new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [events, setEvents] = useState([]);
  const [banner, setBanner] = useState(null);
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  const timers = useRef({});
  // Estela de cada GPS: sus últimos puntos recibidos en vivo, para dibujar por dónde va (fuera del estado de React: no repinta todo con cada punto).
  const trails = useRef(new Map());
  const pushTrail = (deviceId, lat, lon, at) => {
    const list = trails.current.get(deviceId) || [];
    const last = list.at(-1);
    if (last && last[0] === lat && last[1] === lon) return;
    list.push([lat, lon, at ? Date.parse(at) || Date.now() : Date.now()]);
    if (list.length > 150) list.splice(0, list.length - 150);
    trails.current.set(deviceId, list);
  };
  /** Rellena la estela con lo ya recorrido (historial reciente) al elegir un GPS; lo que llegó en vivo después se conserva. */
  const seedTrail = useCallback((deviceId, points) => {
    if (!points?.length) return;
    const live = trails.current.get(deviceId) || [];
    const lastSeed = points.at(-1)[2];
    trails.current.set(deviceId, [...points, ...live.filter((p) => p[2] > lastSeed)].slice(-300));
  }, []);
  const needsCompany = me.role === 'reseller_admin';

  const setCompanyId = useCallback((id) => { setCompanyIdState(id); store.set('company', id || null); }, []);

  useEffect(() => {
    if (me.role === 'end_customer') return;
    (async () => {
      try {
        const list = await get('/api/companies');
        setCompanies(list);
        const saved = await store.get('company');
        if (!me.companyId) setCompanyIdState(list.some((c) => c.id === saved) ? saved : needsCompany ? list[0]?.id || '' : '');
      } catch { /* la lista de empresas es opcional */ }
    })();
  }, [me, needsCompany]);

  const loadFleet = useCallback(async () => {
    if (needsCompany && !companyId) return;
    try {
      const data = await get(`/api/fleet${qs({ companyId })}`);
      setDevices(new Map(data.devices.map((d) => [d.id, d])));
      setLoaded(true); setError('');
    } catch (err) { setError(err?.code || 'error'); setLoaded(true); }
  }, [companyId, needsCompany]);

  const loadUnread = useCallback(async () => {
    try { const r = await getFull(`/api/notifications${qs({ limit: 1, companyId })}`); setUnread(r.unread || 0); } catch { /* se reintenta */ }
  }, [companyId]);

  const showAlert = useCallback((e) => {
    setBanner({ id: e.id || String(Date.now()), title: e.deviceName || 'GPS', body: e.message, severity: e.severity, deviceId: e.deviceId });
    clearTimeout(timers.current.banner);
    timers.current.banner = setTimeout(() => setBanner(null), e.severity === 'critical' ? 12000 : 6000);
  }, []);

  useEffect(() => {
    setupNotifications();
    let closed = false;
    let stop = () => undefined;
    const stopPolling = () => clearInterval(timers.current.poll);
    const startPolling = () => { stopPolling(); timers.current.poll = setInterval(() => loadFleet(), 15000); };
    const connect = () => {
      stop();
      stop = openStream(`/api/stream${qs({ companyId })}`, (type, p) => {
        if (type === 'position') {
          if (p.lat != null && p.online !== false) pushTrail(p.deviceId, p.lat, p.lon, p.at);
          setDevices((current) => {
            const device = current.get(p.deviceId);
            if (!device) return current;
            const live = { ...device.live, lat: p.lat, lon: p.lon, speedKph: p.speedKph ?? device.live.speedKph, course: p.course ?? device.live.course, ignition: p.ignition ?? device.live.ignition, moving: p.moving, online: p.online, at: p.at ?? device.live.at, seenAt: new Date().toISOString(), battery: p.battery ?? device.live.battery, accuracyM: p.accuracyM ?? device.live.accuracyM, quality: p.quality ?? device.live.quality, odometerKm: p.odometerKm ?? device.live.odometerKm, statusSince: p.statusSince ?? device.live.statusSince };
            live.status = statusOf(live);
            const next = new Map(current); next.set(p.deviceId, { ...device, live }); return next;
          });
        } else if (type === 'device') {
          setDevices((current) => {
            const device = current.get(p.deviceId);
            if (!device) return current;
            const next = new Map(current); next.set(p.deviceId, { ...device, live: { ...device.live, voltage: p.voltage ?? device.live.voltage, powerConnected: p.powerConnected ?? device.live.powerConnected, rssi: p.rssi ?? device.live.rssi } }); return next;
          });
        } else if (type === 'event') {
          setEvents((list) => [p, ...list].slice(0, 100));
          if (p.severity !== 'info') {
            setUnread((n) => n + 1);
            showAlert(p);
            if (document.visibilityState !== 'visible') notifyAlert(p.deviceName || 'GPS', p.message, { deviceId: p.deviceId });
          }
        } else if (type === 'notification') setUnread((n) => n + 1);
        else if (type === 'command') {
          setDevices((current) => { const d = current.get(p.deviceId); if (!d || !['engineStop', 'engineResume'].includes(p.type) || p.status !== 'sent') return current; const next = new Map(current); next.set(p.deviceId, { ...d, engineState: p.type === 'engineStop' ? 'cut' : 'normal' }); return next; });
        }
      }, {
        onOpen: () => { if (closed) return; setConnection('live'); stopPolling(); loadFleet(); },
        onClose: () => { if (closed) return; setConnection('reconnecting'); startPolling(); clearTimeout(timers.current.retry); timers.current.retry = setTimeout(connect, 5000); }
      });
    };
    if (!(needsCompany && !companyId)) {
      setLoaded(false); loadFleet(); loadUnread(); connect();
    }
    const clock = setInterval(() => setTick((t) => t + 1), 15000);
    const resume = isNative ? CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive && !closed) { loadFleet(); loadUnread(); connect(); } }) : null;
    return () => { closed = true; stop(); stopPolling(); clearInterval(clock); clearTimeout(timers.current.retry); resume?.then((s) => s.remove()).catch(() => undefined); };
  }, [companyId, needsCompany, loadFleet, loadUnread, showAlert]);

  const list = useMemo(() => [...devices.values()], [devices]);
  const summary = useMemo(() => list.reduce((acc, d) => ({ ...acc, [d.live.status]: (acc[d.live.status] || 0) + 1 }), { total: list.length }), [list]);
  const refresh = useCallback(() => Promise.all([loadFleet(), loadUnread()]), [loadFleet, loadUnread]);

  const value = { me, companies, companyId, setCompanyId, needsCompany, devices: list, byId: devices, summary, loaded, error, connection, events, banner, dismissBanner: () => setBanner(null), unread, setUnread, tick, refresh, trails: trails.current, seedTrail };
  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}
