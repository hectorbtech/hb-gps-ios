import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ICONS, STATUS, ago, deviceName, dateTime, duration, speedColor } from '../lib/format.js';
import { bearing, haversine } from '../lib/places.js';

// Mapa (Leaflet + OpenStreetMap). Las capas son componentes hijos que dibujan según el estado y se limpian solas.
const MapContext = createContext(null);
export const useMap = () => useContext(MapContext);

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const metersPerPixel = (map, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();

export function MapView({ children, className = '', onClick, center = [18.7, -70.2], zoom = 8 }) {
  const container = useRef(null);
  const [map, setMap] = useState(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const instance = L.map(container.current, { zoomControl: false, preferCanvas: true, worldCopyJump: true }).setView(center, zoom);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(instance);
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(instance);
    instance.on('click', (event) => clickRef.current?.(event.latlng));
    setMap(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); };
  }, []);

  return (
    <MapContext.Provider value={map}>
      <div className={`map-wrap ${className}`}>
        <div ref={container} className="map-canvas" />
        {map && children}
      </div>
    </MapContext.Provider>
  );
}

// ---- Vehículos en vivo
function vehicleIcon(device, { selected, dim, showLabel, crowded = false }) {
  const status = STATUS[device.live.status] || STATUS.no_data;
  const heading = device.live.course ?? 0;
  const off = device.live.status === 'offline';
  const html = `<div class="veh${crowded && !selected ? ' small' : ''}${off ? ' off' : ''}${selected ? ' sel' : ''}${dim ? ' dim' : ''}${device.live.status === 'moving' ? ' run' : ''}" style="--c:${status.color}">
      ${selected ? '<span class="veh-pulse"></span>' : ''}
      ${device.live.status === 'moving' ? `<span class="veh-arrow" style="transform:rotate(${heading}deg)"></span>` : ''}
      <span class="veh-body">${ICONS[device.iconKey] || '🚗'}</span>
      ${selected || showLabel || off ? `<span class="veh-label${off ? ' off' : ''}">${deviceName(device).replace(/[<>&]/g, '')}${off ? ` · sin señal ${ago(device.live.at)}` : ''}</span>` : ''}
    </div>`;
  const size = selected ? 84 : crowded ? 30 : 46;
  return L.divIcon({ className: 'veh-marker', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Desliza el marcador hasta la posición nueva en vez de teletransportarlo: con un punto cada 10 s se ve al vehículo avanzar por la calle.
// Si la distancia es enorme (el GPS reapareció lejos) se coloca de golpe.
function glide(marker, glides, id, to, ms, onFrame) {
  const running = glides.get(id);
  if (running) cancelAnimationFrame(running);
  const from = marker.getLatLng();
  const meters = haversine([from.lat, from.lng], to);
  if (meters < 0.5) { glides.delete(id); return; }
  if (!ms || meters > 5000) { marker.setLatLng(to); onFrame?.(to); glides.delete(id); return; }
  const startedAt = performance.now();
  const step = (now) => {
    const k = clamp((now - startedAt) / ms, 0, 1);
    const point = [from.lat + (to[0] - from.lat) * k, from.lng + (to[1] - from.lng) * k];
    marker.setLatLng(point);
    onFrame?.(point);
    if (k < 1) glides.set(id, requestAnimationFrame(step)); else glides.delete(id);
  };
  glides.set(id, requestAnimationFrame(step));
}

export function DeviceLayer({ devices, selectedId, onSelect, follow = false, isolate = false, trails = null }) {
  const map = useMap();
  const markers = useRef(new Map());
  const keys = useRef(new Map());
  const glides = useRef(new Map());
  const moved = useRef(new Map());     // deviceId -> { at, lat, lon }: cuándo llegó el último punto distinto (para saber cuánto tardar en deslizar)
  const lines = useRef(new Map());     // deviceId -> estela dibujada
  const halo = useRef(null);           // círculo de precisión del GPS elegido
  const fitted = useRef(false);
  const lastSelected = useRef(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  useEffect(() => {
    if (!map) return;
    const seen = new Set();
    const crowded = devices.length > 25; // con muchos GPS los marcadores se hacen pequeños y el elegido destaca
    for (const device of devices) {
      if (device.live.lat == null) continue;
      seen.add(device.id);
      const selected = device.id === selectedId;
      const dim = Boolean(selectedId) && !selected && isolate;
      const showLabel = map.getZoom() >= 13;
      const key = [device.live.status, device.live.status === 'offline' ? Math.floor(Date.now() / 60000) : '', Math.round((device.live.course ?? 0) / 10), selected, dim, showLabel, crowded, deviceName(device), device.iconKey].join('|');
      const latlng = [device.live.lat, device.live.lon];
      let marker = markers.current.get(device.id);
      if (!marker) {
        marker = L.marker(latlng, { icon: vehicleIcon(device, { selected, dim, showLabel, crowded }), riseOnHover: true, keyboard: false }).addTo(map);
        marker.on('click', () => onSelect?.(device.id));
        markers.current.set(device.id, marker);
        keys.current.set(device.id, key);
        moved.current.set(device.id, { at: Date.now(), lat: latlng[0], lon: latlng[1] });
      } else {
        const last = moved.current.get(device.id);
        if (!last || last.lat !== latlng[0] || last.lon !== latlng[1]) {
          const now = Date.now();
          const ms = last && device.live.status === 'moving' ? clamp(now - last.at, 700, 12000) : last ? 600 : 0; // tarda lo que tardó en llegar el punto: el movimiento es continuo
          moved.current.set(device.id, { at: now, lat: latlng[0], lon: latlng[1] });
          glide(marker, glides.current, device.id, latlng, ms, selected && followRef.current ? (point) => map.panTo(point, { animate: false }) : null);
        }
        if (keys.current.get(device.id) !== key) { marker.setIcon(vehicleIcon(device, { selected, dim, showLabel, crowded })); keys.current.set(device.id, key); }
      }
      marker.setZIndexOffset(selected ? 10000 : device.live.status === 'moving' ? 500 : 0);

      // Estela: por dónde ha ido hace un momento. Se dibuja para los que van en marcha y para el elegido.
      const trail = trails?.get(device.id);
      const wantTrail = trail && trail.length >= 2 && (device.live.status === 'moving' || selected);
      let line = lines.current.get(device.id);
      if (wantTrail) {
        const path = trail.map((p) => [p[0], p[1]]);
        const color = (STATUS[device.live.status] || STATUS.no_data).color;
        if (!line) { line = L.polyline(path, { color, weight: selected ? 5 : 3.5, opacity: 0.8, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map); lines.current.set(device.id, line); }
        else { line.setLatLngs(path); line.setStyle({ color, weight: selected ? 5 : 3.5 }); }
      } else if (line) { line.remove(); lines.current.delete(device.id); }
    }
    for (const [id, marker] of markers.current) if (!seen.has(id)) { marker.remove(); markers.current.delete(id); keys.current.delete(id); moved.current.delete(id); const line = lines.current.get(id); if (line) { line.remove(); lines.current.delete(id); } }

    const withPosition = devices.filter((d) => d.live.lat != null);
    if (!fitted.current && withPosition.length && !selectedId) {
      fitted.current = true;
      const bounds = L.latLngBounds(withPosition.map((d) => [d.live.lat, d.live.lon]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
    // Al elegir un GPS el mapa lo enfoca de inmediato; con "seguir" lo mantiene al centro mientras se mueve (el seguimiento va cuadro a cuadro con el deslizamiento).
    const selected = devices.find((d) => d.id === selectedId);
    if (selected?.live.lat != null) {
      const target = [selected.live.lat, selected.live.lon];
      if (lastSelected.current !== selectedId) { map.flyTo(target, Math.max(map.getZoom(), 16), { duration: 0.8 }); lastSelected.current = selectedId; } // al elegir un GPS el mapa lo acerca para ver su ubicación directa; los demás siguen en el mapa
    }
    if (!selectedId) lastSelected.current = null;

    // Precisión: si el GPS no está seguro de dónde está (pocos satélites), se muestra el círculo de incertidumbre.
    if (halo.current) { halo.current.remove(); halo.current = null; }
    if (selected?.live.lat != null && Number(selected.live.accuracyM) >= 30) halo.current = L.circle([selected.live.lat, selected.live.lon], { radius: Number(selected.live.accuracyM), color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.1, interactive: false }).addTo(map);
  }, [map, devices, selectedId, follow, isolate, onSelect, trails]);

  // Al activar «seguir» el mapa se centra de inmediato en el vehículo.
  useEffect(() => {
    if (!map || !follow) return;
    const marker = markers.current.get(selectedId);
    if (marker) map.panTo(marker.getLatLng(), { animate: true, duration: 0.5 });
  }, [map, follow, selectedId]);

  useEffect(() => () => {
    for (const id of glides.current.values()) cancelAnimationFrame(id);
    for (const marker of markers.current.values()) marker.remove();
    for (const line of lines.current.values()) line.remove();
    halo.current?.remove();
    markers.current.clear(); lines.current.clear(); glides.current.clear();
  }, []);
  return null;
}

export function FitButton({ devices }) {
  const map = useMap();
  const fit = () => {
    const pts = devices.filter((d) => d.live.lat != null).map((d) => [d.live.lat, d.live.lon]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
  };
  return <button type="button" className="map-btn" title="Ver toda la flota" onClick={fit}>⤢ Toda la flota</button>;
}

// ---- Geovallas y rutas guardadas
export function ZonesLayer({ geofences = [], routes = [], onPick, highlightId }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return undefined;
    const group = L.layerGroup().addTo(map);
    const corridors = [];
    for (const g of geofences) {
      if (!g.enabled) continue;
      const style = { color: g.color, weight: g.id === highlightId ? 4 : 2, fillColor: g.color, fillOpacity: g.id === highlightId ? 0.25 : 0.12, dashArray: g.id === highlightId ? null : '6 4' };
      const layer = g.shape.type === 'circle' ? L.circle(g.shape.center, { ...style, radius: g.shape.radiusM }) : L.polygon(g.shape.points, style);
      layer.bindTooltip(g.name, { sticky: true });
      layer.on('click', (event) => { L.DomEvent.stopPropagation(event); onPick?.({ kind: 'geofence', item: g }); });
      layer.addTo(group);
    }
    for (const r of routes) {
      if (!r.enabled || !r.path?.length) continue;
      const corridor = L.polyline(r.path, { color: r.color, weight: 10, opacity: 0.18, lineCap: 'round', lineJoin: 'round' }).addTo(group);
      corridors.push({ layer: corridor, r });
      const line = L.polyline(r.path, { color: r.color, weight: r.id === highlightId ? 5 : 3, opacity: 0.9 }).addTo(group);
      line.bindTooltip(`${r.name}${r.originLabel ? ` · ${r.originLabel} → ${r.destinationLabel || ''}` : ''}`, { sticky: true });
      line.on('click', (event) => { L.DomEvent.stopPropagation(event); onPick?.({ kind: 'route', item: r }); });
      L.circleMarker(r.path[0], { radius: 5, color: '#fff', weight: 2, fillColor: r.color, fillOpacity: 1 }).addTo(group);
      L.circleMarker(r.path.at(-1), { radius: 5, color: '#fff', weight: 2, fillColor: '#111827', fillOpacity: 1 }).addTo(group);
    }
    // El corredor seguro se dibuja con su ancho real en metros (se recalcula al hacer zoom).
    const fit = () => { for (const { layer, r } of corridors) layer.setStyle({ weight: Math.max(6, (r.bufferM * 2) / metersPerPixel(map, r.path[0][0])) }); };
    fit();
    map.on('zoomend', fit);
    return () => { map.off('zoomend', fit); group.remove(); };
  }, [map, geofences, routes, highlightId, onPick]);
  return null;
}

// ---- Borrador que se está dibujando (geovalla o ruta)
export function DraftLayer({ draft }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !draft) return undefined;
    const group = L.layerGroup().addTo(map);
    const color = draft.color || '#2563eb';
    if (draft.type === 'circle' && draft.center) {
      L.circle(draft.center, { color, weight: 3, fillColor: color, fillOpacity: 0.2, radius: draft.radiusM || 300 }).addTo(group);
      L.circleMarker(draft.center, { radius: 5, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(group);
    }
    if (draft.type === 'polygon' && draft.points?.length) {
      if (draft.points.length >= 3) L.polygon(draft.points, { color, weight: 3, fillColor: color, fillOpacity: 0.2 }).addTo(group);
      else L.polyline(draft.points, { color, weight: 3, dashArray: '6 4' }).addTo(group);
      draft.points.forEach((p) => L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(group));
    }
    let corridor;
    if (draft.type === 'route') {
      if (draft.path?.length >= 2) {
        corridor = L.polyline(draft.path, { color, weight: 10, opacity: 0.2, lineCap: 'round' }).addTo(group);
        L.polyline(draft.path, { color, weight: 4 }).addTo(group);
      }
      (draft.waypoints || []).forEach((p, i) => L.marker(p, { icon: L.divIcon({ className: 'wp-marker', html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(group));
    }
    const fit = () => { if (corridor && draft.path?.length) corridor.setStyle({ weight: Math.max(6, ((draft.bufferM || 300) * 2) / metersPerPixel(map, draft.path[0][0])) }); };
    fit();
    map.on('zoomend', fit);
    return () => { map.off('zoomend', fit); group.remove(); };
  }, [map, draft]);
  return null;
}

export function FitTo({ bounds, token }) {
  const map = useMap();
  useEffect(() => { if (map && bounds?.length) map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 16 }); }, [map, token]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ---- Historial: recorrido coloreado por velocidad con flechas de dirección, paradas numeradas y marcador de reproducción
const stopIcon = (n, selected) => L.divIcon({ className: `stop-marker${selected ? ' sel' : ''}`, html: `<span>P${n}</span>`, iconSize: selected ? [34, 34] : [28, 28], iconAnchor: selected ? [17, 17] : [14, 14] });
const arrowIcon = (deg) => L.divIcon({ className: 'dir-arrow', html: `<span style="transform:rotate(${Math.round(deg)}deg)">▲</span>`, iconSize: [16, 16], iconAnchor: [8, 8] });

export function HistoryLayer({ points, stops = [], index, onFit = true, device, selection, onPickStop, cursorRef }) {
  const map = useMap();
  const marker = useRef(null);
  const stopMarkers = useRef([]);
  const pickRef = useRef(onPickStop);
  pickRef.current = onPickStop;

  useEffect(() => {
    if (!map || !points?.length) return undefined;
    const group = L.layerGroup().addTo(map);
    let segment = [[points[0][1], points[0][2]]];
    let color = speedColor(points[0][3]);
    for (let i = 1; i < points.length; i += 1) {
      const c = speedColor(points[i][3]);
      segment.push([points[i][1], points[i][2]]);
      if (c !== color || i === points.length - 1) { L.polyline(segment, { color, weight: 5, opacity: 0.9 }).addTo(group); segment = [[points[i][1], points[i][2]]]; color = c; }
    }
    // Flechas que muestran hacia dónde iba el vehículo: una cada cierta distancia, solo donde estaba en marcha.
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += haversine([points[i - 1][1], points[i - 1][2]], [points[i][1], points[i][2]]);
    const gap = Math.max(120, total / 36);
    let since = gap / 2;
    for (let i = 1; i < points.length; i += 1) {
      const a = [points[i - 1][1], points[i - 1][2]]; const b = [points[i][1], points[i][2]];
      const d = haversine(a, b);
      since += d;
      if (since >= gap && d > 8 && points[i][3] >= 4) { since = 0; L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon: arrowIcon(bearing(a, b)), interactive: false, keyboard: false }).addTo(group); }
    }
    L.circleMarker([points[0][1], points[0][2]], { radius: 8, color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }).bindTooltip(`Inicio · ${dateTime(points[0][0] * 1000)}`).addTo(group);
    const last = points.at(-1);
    L.circleMarker([last[1], last[2]], { radius: 8, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }).bindTooltip(`Fin · ${dateTime(last[0] * 1000)}`).addTo(group);
    stopMarkers.current = stops.map((stop, i) => {
      const m = L.marker([stop.lat, stop.lon], { icon: stopIcon(i + 1, false), zIndexOffset: 500 })
        .bindTooltip(`Parada ${i + 1} · ${duration(stop.durationSeconds)} · ${dateTime(stop.startAt)}${stop.ignitionState === 'on' ? ' · motor encendido' : stop.ignitionState === 'off' ? ' · motor apagado' : ''}`).addTo(group);
      m.on('click', () => pickRef.current?.(i));
      return m;
    });
    if (onFit) map.fitBounds(L.latLngBounds(points.map((p) => [p[1], p[2]])), { padding: [60, 60] });
    return () => { group.remove(); stopMarkers.current = []; marker.current?.remove(); marker.current = null; };
  }, [map, points, stops, onFit]);

  // La parada elegida se agranda y el mapa se acerca a ella.
  useEffect(() => {
    stopMarkers.current.forEach((m, i) => m.setIcon(stopIcon(i + 1, selection?.kind === 'stop' && selection.i === i)));
  }, [selection, stops, points]);

  // El marcador lo mueve quien reproduce (cursorRef): cada cuadro de la animación pone al vehículo en su lugar EXACTO entre dos puntos, con su rumbo.
  // Aquí solo se crea y se coloca al inicio del recorrido o cuando cambian los datos.
  useEffect(() => {
    if (!map || !points?.length) return undefined;
    const p = points[Math.min(points.length - 1, Math.max(0, index || 0))];
    const icon = L.divIcon({ className: 'veh-marker', html: `<div class="veh sel run" style="--c:#2563eb"><span class="veh-pulse"></span><span class="veh-arrow" style="transform:rotate(0deg)"></span><span class="veh-body">${ICONS[device?.iconKey] || '🚗'}</span></div>`, iconSize: [84, 84], iconAnchor: [42, 42] });
    if (!marker.current) marker.current = L.marker([p[1], p[2]], { icon, zIndexOffset: 20000, interactive: false }).addTo(map);
    else marker.current.setLatLng([p[1], p[2]]);
    if (cursorRef) {
      cursorRef.current = (lat, lon, heading) => {
        if (!marker.current) return;
        marker.current.setLatLng([lat, lon]);
        const arrow = marker.current.getElement()?.querySelector('.veh-arrow');
        if (arrow && Number.isFinite(heading)) arrow.style.transform = `rotate(${Math.round(heading)}deg)`;
      };
    }
    return () => { if (cursorRef) cursorRef.current = null; };
  }, [map, points, stops, device, cursorRef]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
