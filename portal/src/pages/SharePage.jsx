import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ICONS, ago, compass, kph } from '../lib/format.js';

// Página pública para ver un vehículo en vivo con un enlace temporal (sin iniciar sesión). Solo muestra la posición actual
// y, si quien compartió lo permitió, las últimas 2 horas de recorrido.
export default function SharePage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const container = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const trail = useRef(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/public/share/${token}`, { cache: 'no-store' });
        if (response.status === 404) { if (!stop) setError('Este enlace venció o ya no está disponible.'); return; }
        if (!response.ok) throw new Error('retry');
        const json = await response.json();
        if (!stop) { setData(json.data); setError(''); }
      } catch { /* se reintenta en el próximo ciclo */ }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { stop = true; clearInterval(timer); };
  }, [token]);

  useEffect(() => {
    if (!container.current || map.current) return undefined;
    map.current = L.map(container.current, { zoomControl: true }).setView([18.7, -70.2], 8);
    L.tileLayer(import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!data || !map.current || data.live.lat == null) return;
    const latlng = [data.live.lat, data.live.lon];
    const icon = L.divIcon({ className: 'veh-marker', html: `<div class="veh sel" style="--c:${data.live.moving ? '#16a34a' : '#f59e0b'}"><span class="veh-pulse"></span><span class="veh-body">${ICONS[data.iconKey] || '🚗'}</span></div>`, iconSize: [46, 46], iconAnchor: [23, 23] });
    if (!marker.current) { marker.current = L.marker(latlng, { icon }).addTo(map.current); map.current.setView(latlng, 15); } else { marker.current.setLatLng(latlng); marker.current.setIcon(icon); map.current.panTo(latlng); }
    if (trail.current) trail.current.remove();
    if (data.trail?.length > 1) trail.current = L.polyline(data.trail, { color: '#2563eb', weight: 4, opacity: 0.7 }).addTo(map.current);
  }, [data]);

  if (error) return <div className="loading full">{error}</div>;
  return (
    <div className="share-page">
      <header className="share-head">
        <span className="brand-mark small">HB</span>
        <div><b>{data?.label || data?.name || 'Ubicación compartida'}</b><small>{data ? `${data.company} · ${data.plate || data.name}` : 'Cargando…'}</small></div>
        {data && <div className="share-state"><b>{data.live.lat == null ? 'Sin ubicación' : data.live.moving ? `En movimiento · ${kph(data.live.speedKph)}` : 'Detenido'}</b><small>{data.live.at ? `Actualizado ${ago(data.live.at)}` : ''}{data.live.course != null && data.live.moving ? ` · rumbo ${compass(data.live.course)}` : ''}</small></div>}
      </header>
      <div ref={container} className="share-map" />
    </div>
  );
}
