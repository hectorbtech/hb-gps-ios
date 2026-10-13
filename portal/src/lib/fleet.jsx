import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { get } from './api.js';
import { playAlert } from './sound.js';

// Estado de la flota en vivo. Se carga una vez (/api/fleet) y el flujo en vivo (SSE) lo mantiene al día:
// cada posición, evento y notificación llega al instante. Si el flujo se cae, se consulta cada 15 s hasta que vuelva.
const FleetContext = createContext(null);
export const useFleet = () => useContext(FleetContext);

const statusOf = (live) => {
  if (live.lat == null) return 'no_data';
  if (!live.online) return 'offline';
  if (live.moving) return 'moving';
  return live.ignition ? 'idle' : 'stopped';
};

export function FleetProvider({ me, companyId, children }) {
  const [devices, setDevices] = useState(() => new Map());
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState('connecting');
  const [events, setEvents] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [tick, setTick] = useState(0);
  const timers = useRef({});
  // Estela de cada GPS: sus últimos puntos recibidos (en vivo) para dibujar por dónde va. Vive fuera del estado de React: se actualiza con cada posición sin repintar todo.
  const trails = useRef(new Map());
  const TRAIL_MAX = 150;
  const pushTrail = (deviceId, lat, lon, at) => {
    const list = trails.current.get(deviceId) || [];
    const last = list.at(-1);
    if (last && last[0] === lat && last[1] === lon) return;
    list.push([lat, lon, at ? Date.parse(at) || Date.now() : Date.now()]);
    if (list.length > TRAIL_MAX) list.splice(0, list.length - TRAIL_MAX);
    trails.current.set(deviceId, list);
  };
  /** Rellena la estela con lo ya recorrido (historial reciente) al elegir un GPS; lo que llegó en vivo después se conserva. */
  const seedTrail = useCallback((deviceId, points) => {
    if (!points?.length) return;
    const live = trails.current.get(deviceId) || [];
    const lastSeed = points.at(-1)[2];
    const merged = [...points, ...live.filter((p) => p[2] > lastSeed)];
    trails.current.set(deviceId, merged.slice(-TRAIL_MAX * 2));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = crypto.randomUUID();
    setToasts((list) => [...list.slice(-3), { id, ...toast }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), toast.severity === 'critical' ? 15000 : 7000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const loadFleet = useCallback(async () => {
    const data = await get(`/api/fleet${companyId ? `?companyId=${companyId}` : ''}`);
    setDevices(new Map(data.devices.map((d) => [d.id, d])));
    setLoaded(true);
  }, [companyId]);

  const loadUnread = useCallback(async () => {
    try { const r = await (await fetch(`/api/notifications?limit=1${companyId ? `&companyId=${companyId}` : ''}`, { credentials: 'include' })).json(); setUnread(r.unread || 0); } catch { /* se reintenta luego */ }
  }, [companyId]);

  useEffect(() => {
    let closed = false;
    let source;
    const startPolling = () => { clearInterval(timers.current.poll); timers.current.poll = setInterval(() => loadFleet().catch(() => undefined), 15000); };
    const stopPolling = () => clearInterval(timers.current.poll);
    setLoaded(false);
    loadFleet().catch(() => undefined);
    loadUnread();
    source = new EventSource(`/api/stream${companyId ? `?companyId=${companyId}` : ''}`, { withCredentials: true });
    source.onopen = () => { if (closed) return; setConnection('live'); stopPolling(); loadFleet().catch(() => undefined); };
    source.onerror = () => { if (closed) return; setConnection('reconnecting'); startPolling(); };
    source.addEventListener('position', (message) => {
      const p = JSON.parse(message.data);
      if (p.lat != null && p.online !== false) pushTrail(p.deviceId, p.lat, p.lon, p.at);
      setDevices((current) => {
        const device = current.get(p.deviceId);
        if (!device) return current;
        const live = { ...device.live, lat: p.lat, lon: p.lon, speedKph: p.speedKph ?? device.live.speedKph, course: p.course ?? device.live.course, ignition: p.ignition ?? device.live.ignition, moving: p.moving, online: p.online, at: p.at ?? device.live.at, seenAt: new Date().toISOString(), battery: p.battery ?? device.live.battery, accuracyM: p.accuracyM ?? device.live.accuracyM, quality: p.quality ?? device.live.quality, odometerKm: p.odometerKm ?? device.live.odometerKm, statusSince: p.statusSince ?? device.live.statusSince };
        live.status = statusOf(live);
        const next = new Map(current);
        next.set(p.deviceId, { ...device, live });
        return next;
      });
    });
    source.addEventListener('event', (message) => {
      const e = JSON.parse(message.data);
      setEvents((list) => [e, ...list].slice(0, 100));
      if (e.severity !== 'info') pushToast({ title: e.deviceName, body: e.message, severity: e.severity, deviceId: e.deviceId });
      playAlert(e.severity); // suena según lo que el usuario eligió (sirena crítica, dos tonos advertencia)
    });
    // Alimentación del equipo (voltaje, corriente del vehículo, señal): llega aparte de la posición.
    source.addEventListener('device', (message) => {
      const p = JSON.parse(message.data);
      setDevices((current) => {
        const device = current.get(p.deviceId);
        if (!device) return current;
        const next = new Map(current);
        next.set(p.deviceId, { ...device, live: { ...device.live, voltage: p.voltage ?? device.live.voltage, powerConnected: p.powerConnected ?? device.live.powerConnected, rssi: p.rssi ?? device.live.rssi } });
        return next;
      });
    });
    source.addEventListener('notification', () => setUnread((n) => n + 1));
    source.addEventListener('command', (message) => {
      const c = JSON.parse(message.data);
      if (c.result) pushToast({ title: 'Respuesta del GPS', body: String(c.result).slice(0, 180), severity: 'info', deviceId: c.deviceId });
      if (['sent', 'failed', 'waiting_safe_speed'].includes(c.status) && !c.result) pushToast({ title: 'Comando', body: `${c.type}: ${c.status === 'sent' ? 'enviado al equipo' : c.status === 'failed' ? `falló (${c.lastError || ''})` : 'esperando velocidad segura'}`, severity: c.status === 'failed' ? 'warning' : 'info', deviceId: c.deviceId });
      setDevices((current) => { const d = current.get(c.deviceId); if (!d || !['engineStop', 'engineResume'].includes(c.type) || c.status !== 'sent') return current; const next = new Map(current); next.set(c.deviceId, { ...d, engineState: c.type === 'engineStop' ? 'cut' : 'normal' }); return next; });
    });
    const clock = setInterval(() => setTick((t) => t + 1), 15000); // refresca los "hace X min"
    return () => { closed = true; source.close(); stopPolling(); clearInterval(clock); };
  }, [companyId, loadFleet, loadUnread, pushToast]);

  const list = useMemo(() => [...devices.values()], [devices]);
  const summary = useMemo(() => list.reduce((acc, d) => ({ ...acc, [d.live.status]: (acc[d.live.status] || 0) + 1 }), { total: list.length }), [list]);
  const refresh = useCallback(() => Promise.all([loadFleet(), loadUnread()]), [loadFleet, loadUnread]);

  const value = { me, companyId, devices: list, byId: devices, summary, loaded, connection, events, toasts, dismissToast, pushToast, unread, setUnread, selectedId, select: setSelectedId, refresh, tick, trails: trails.current, seedTrail };
  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}
