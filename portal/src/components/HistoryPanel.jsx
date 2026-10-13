import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, explain, get, qs } from '../lib/api.js';
import { dateTime, deviceName, duration, km, kph, localInput, startOfDay, timeOnly, ago } from '../lib/format.js';
import { nearestIndex } from '../lib/places.js';
import { createPlacer, runPlayback } from '../lib/playback.js';
import { AddressRows, PlaceActions, useAddress } from './Place.jsx';

const PRESETS = [['Hoy', () => [startOfDay(0), new Date()]], ['Ayer', () => [startOfDay(-1), startOfDay(0)]], ['Últimas 24 h', () => [new Date(Date.now() - 86400000), new Date()]], ['7 días', () => [startOfDay(-6), new Date()]]];
const SPEEDS = [1, 4, 16, 64, 256];
const IGNITION = { on: 'Encendido todo el tiempo', off: 'Apagado todo el tiempo', mixed: 'Se encendió o apagó durante la parada' };
const key4 = (lat, lon) => `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;

// Historial de un GPS: recorrido con flechas de dirección, viajes y paradas con su dirección, y reproducción que no se detiene en las paradas.
export default function HistoryPanel({ device, onData, index, onIndex, selection, onSelection, onClose, onFocus, cursorRef }) {
  // Un GPS que dejó de reportar abre su historial en las horas anteriores a su último dato (para ver dónde falló), no en «hoy» vacío.
  const lastFix = device.live.at ? new Date(device.live.at) : null;
  const lostSignal = Boolean(lastFix) && device.live.status === 'offline';
  const beforeLoss = () => [new Date(lastFix.getTime() - 6 * 3600_000), new Date(lastFix.getTime() + 5 * 60_000)];
  const [range, setRange] = useState(() => (lostSignal && lastFix < startOfDay(0) ? beforeLoss() : PRESETS[0][1]()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [multiplier, setMultiplier] = useState(16);
  const [alertStop, setAlertStop] = useState(null);
  const [, setAddrVersion] = useState(0);
  const timeRef = useRef(0);
  const indexRef = useRef(0);
  const addresses = useRef(new Map());
  const cardRef = useRef(null);
  const urgent = useRef(false); // la dirección de la parada elegida pasa por delante de las demás
  indexRef.current = index;
  const placeAt = useMemo(() => createPlacer(cursorRef), [cursorRef]); // coloca el vehículo en su lugar exacto del recorrido (entre dos puntos guardados)

  const load = useCallback(async (from, to) => {
    setBusy(true); setError(''); setPlaying(false); setAlertStop(null); onSelection(null);
    try {
      const result = (await api(`/api/devices/${device.id}/history${qs({ from: from.toISOString(), to: to.toISOString(), maxPoints: 2500 })}`)).data;
      setData(result);
      onData({ points: result.points, stops: result.stops });
      onIndex(0);
      timeRef.current = result.points[0]?.[0] ?? 0;
      setTimeout(() => placeAt(result.points, 0, timeRef.current), 80);
    } catch (err) { setError(explain(err)); setData(null); onData(null); } finally { setBusy(false); }
  }, [device.id, onData, onIndex, onSelection, placeAt]);

  useEffect(() => { load(...range); return () => onData(null); }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Direcciones de cada parada y de la salida y llegada de cada viaje: se piden una por una (el servidor las guarda para no repetirlas).
  useEffect(() => {
    if (!data) return undefined;
    let cancelled = false;
    const targets = [...data.stops.map((s) => [s.lat, s.lon]), ...data.trips.flatMap((t) => [t.from, t.to])];
    (async () => {
      for (const [lat, lon] of targets) {
        const k = key4(lat, lon);
        while (urgent.current && !cancelled) await new Promise((r) => setTimeout(r, 300));
        if (cancelled) return;
        if (addresses.current.has(k)) continue;
        try { const r = await get(`/api/geocode?lat=${lat}&lon=${lon}`); addresses.current.set(k, r.address || null); } catch { addresses.current.set(k, null); }
        setAddrVersion((v) => v + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [data]);
  const addrOf = (lat, lon) => addresses.current.get(key4(lat, lon));

  const points = data?.points || [];
  const stopsSec = (data?.stops || []).map((s) => [Date.parse(s.startAt) / 1000, Date.parse(s.endAt) / 1000]);

  // Reproducción continua: el tiempo virtual avanza `multiplier` veces más rápido que el real; el vehículo se desliza entre los puntos, salta los huecos largos y avisa en cada parada sin esperar.
  useEffect(() => {
    if (!playing || !points.length) return undefined;
    return runPlayback({ points, stopsSec, multiplier, timeRef, indexRef, onIndex, onStop: setAlertStop, onEnd: () => setPlaying(false), place: placeAt });
  }, [playing, multiplier, data, onIndex, placeAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al elegir una parada o un viaje: el vehículo se pone en ese lugar, el mapa se acerca y la reproducción se pausa.
  useEffect(() => {
    if (!data || !selection) return;
    setPlaying(false);
    const item = selection.kind === 'stop' ? data.stops[selection.i] : data.trips[selection.i];
    if (!item) return;
    const seconds = Date.parse(item.startAt) / 1000;
    const idx = points.length ? nearestIndex(points, seconds) : 0;
    onIndex(idx);
    timeRef.current = points[idx]?.[0] ?? timeRef.current;
    placeAt(points, idx, timeRef.current);
    onFocus(selection.kind === 'stop' ? [[item.lat, item.lon]] : [item.from, item.to]);
    setTimeout(() => cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = points[Math.min(index, points.length - 1)];
  const apply = (from, to) => { setRange([from, to]); load(from, to); };
  const csvUrl = `/api/devices/${device.id}/history${qs({ from: range[0].toISOString(), to: range[1].toISOString(), format: 'csv' })}`;
  const stopName = (i) => `Parada ${i + 1}`;
  const alert = alertStop != null ? data?.stops?.[alertStop] : null;

  return (
    <section className="history" aria-label="Historial de ruta">
      <header><div><b>Historial · {deviceName(device)}</b>{lostSignal && <small className="muted"> Sin señal desde {ago(device.live.at)}.</small>}{data?.limited && <small className="warn"> Sin licencia vigente: solo se muestran las últimas 24 h.</small>}</div><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar historial">✕</button></header>
      <div className="presets">{lostSignal && <button type="button" className="chip on" onClick={() => { const [a, b] = beforeLoss(); apply(a, b); }}>Antes de perder la señal</button>}{PRESETS.map(([label, fn]) => <button type="button" className="chip" key={label} onClick={() => { const [a, b] = fn(); apply(a, b); }}>{label}</button>)}</div>
      <div className="range">
        <label>Desde<input type="datetime-local" value={localInput(range[0])} onChange={(e) => setRange([new Date(e.target.value), range[1]])} /></label>
        <label>Hasta<input type="datetime-local" value={localInput(range[1])} onChange={(e) => setRange([range[0], new Date(e.target.value)])} /></label>
        <button type="button" className="btn primary" disabled={busy} onClick={() => load(...range)}>{busy ? 'Cargando…' : 'Ver'}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {data && points.length === 0 && <p className="muted">No hay posiciones en ese rango.</p>}
      {points.length > 0 && (
        <>
          {alert && <div className="stop-alert" role="status"><b>⏸ {stopName(alertStop)} · {duration(alert.durationSeconds)}</b><span>{IGNITION[alert.ignitionState] || ''}</span><small>{addrOf(alert.lat, alert.lon) || ''}</small></div>}
          <div className="player">
            <button type="button" className="btn primary round" onClick={() => { if (index >= points.length - 1) { onIndex(0); timeRef.current = points[0][0]; placeAt(points, 0, timeRef.current); } setPlaying((p) => !p); }} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? '❚❚' : '▶'}</button>
            <input type="range" min="0" max={points.length - 1} value={index} onChange={(e) => { const i = Number(e.target.value); onIndex(i); timeRef.current = points[i][0]; placeAt(points, i, timeRef.current); }} aria-label="Posición en el recorrido" />
            <select value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))} aria-label="Velocidad de reproducción">{SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}</select>
          </div>
          {current && <div className="now"><b>{timeOnly(current[0] * 1000)}</b><span>{kph(current[3])}</span><span>{current[5] == null ? '' : current[5] ? 'motor encendido' : 'motor apagado'}</span></div>}
          <small className="muted">La reproducción no espera en las paradas: avisa y sigue. Las flechas del mapa muestran el sentido del recorrido.</small>
          <div className="stats">
            <div><b>{km(data.totals.distanceKm)}</b><small>recorridos</small></div><div><b>{kph(data.totals.maxSpeedKph)}</b><small>máxima</small></div>
            <div><b>{kph(data.totals.avgMovingSpeedKph)}</b><small>promedio en marcha</small></div><div><b>{duration(data.totals.movingSeconds)}</b><small>en movimiento</small></div>
            <div><b>{duration(data.totals.idleSeconds)}</b><small>ralentí</small></div><div><b>{data.trips.length} / {data.stops.length}</b><small>viajes / paradas</small></div>
          </div>

          {selection && <SelectionCard ref={cardRef} data={data} selection={selection} addrOf={addrOf} onBusy={(busy) => { urgent.current = busy; }} onClose={() => onSelection(null)} onSelect={onSelection} />}

          <h4>Viajes</h4>
          <ul className="plain clickable">{data.trips.map((t, i) => (
            <li key={i} className={selection?.kind === 'trip' && selection.i === i ? 'sel' : ''}><button type="button" onClick={() => onSelection({ kind: 'trip', i })}><span><b>Viaje {i + 1} · {timeOnly(t.startAt)} → {timeOnly(t.endAt)}</b><br /><small className="muted">{km(t.distanceKm)} · {duration(t.durationSeconds)} · máx. {kph(t.maxSpeedKph)}</small><br /><small className="addr">{addrOf(t.from[0], t.from[1]) ?? '…'} <i>→</i> {addrOf(t.to[0], t.to[1]) ?? '…'}</small></span></button></li>
          ))}{!data.trips.length && <li className="muted">Sin viajes en el rango.</li>}</ul>
          <h4>Paradas</h4>
          <ul className="plain clickable">{data.stops.map((s, i) => (
            <li key={i} className={selection?.kind === 'stop' && selection.i === i ? 'sel' : ''}><button type="button" onClick={() => onSelection({ kind: 'stop', i })}><span><b><span className="stop-n">P{i + 1}</span> {timeOnly(s.startAt)} · {duration(s.durationSeconds)}</b><br /><small className="muted">{s.ignitionState === 'on' ? 'motor encendido' : s.ignitionState === 'off' ? 'motor apagado' : 'motor encendido a ratos'}</small><br /><small className="addr">{addrOf(s.lat, s.lon) ?? 'Buscando dirección…'}</small></span></button></li>
          ))}{!data.stops.length && <li className="muted">Sin paradas largas.</li>}</ul>
          <a className="btn" href={csvUrl} download>⬇ Descargar CSV completo</a>
          <small className="muted">Mostrando {points.length} de {data.totalPoints} posiciones guardadas (se simplifica para dibujar rápido; el CSV trae todas).</small>
        </>
      )}
    </section>
  );
}

const Kv = ({ label, children }) => (children ? <div className="kv"><span>{label}</span><b>{children}</b></div> : null);

// Todos los datos de la parada o del viaje elegido.
const SelectionCard = React.forwardRef(function SelectionCard({ data, selection, addrOf, onBusy, onClose, onSelect }, ref) {
  const stop = selection.kind === 'stop' ? data.stops[selection.i] : null;
  const trip = selection.kind === 'trip' ? data.trips[selection.i] : null;
  const place = useAddress(stop?.lat, stop?.lon, { detail: Boolean(stop) });
  useEffect(() => { onBusy?.(place.loading && Boolean(stop)); return () => onBusy?.(false); }, [place.loading, Boolean(stop)]); // eslint-disable-line react-hooks/exhaustive-deps
  const near = (iso, ms) => (other) => Math.abs(Date.parse(other) - Date.parse(iso)) <= ms;
  const cameFrom = stop ? data.trips.findIndex((t) => near(stop.startAt, 150_000)(t.endAt)) : -1;
  const leavesTo = stop ? data.trips.findIndex((t) => near(stop.endAt, 150_000)(t.startAt)) : -1;
  return (
    <div className="sel-card" ref={ref}>
      <header><b>{stop ? `Parada ${selection.i + 1}` : `Viaje ${selection.i + 1}`}</b><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar detalle">✕</button></header>
      {stop && (
        <>
          <Kv label="Llegó">{dateTime(stop.startAt)}</Kv>
          <Kv label="Salió">{dateTime(stop.endAt)}</Kv>
          <Kv label="Duración">{duration(stop.durationSeconds)}</Kv>
          <Kv label="Motor">{IGNITION[stop.ignitionState] || (stop.ignitionOn ? 'Encendido' : 'Apagado')}{stop.ignitionState === 'mixed' ? ` · encendido ${duration(stop.ignitionOnSeconds)} de ${duration(stop.durationSeconds)}` : ''}</Kv>
          <Kv label="Posiciones recibidas">{stop.fixes}</Kv>
          <Kv label="Coordenadas">{`${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}`}</Kv>
          {cameFrom >= 0 && <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'trip', i: cameFrom })}>Llegó en el viaje {cameFrom + 1} · {km(data.trips[cameFrom].distanceKm)} · {duration(data.trips[cameFrom].durationSeconds)}</button>}
          {leavesTo >= 0 && <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'trip', i: leavesTo })}>Salió en el viaje {leavesTo + 1} · {km(data.trips[leavesTo].distanceKm)} · {duration(data.trips[leavesTo].durationSeconds)}</button>}
          <h5>Dónde fue</h5>
          <AddressRows details={place.details} line={place.line} loading={place.loading} />
          <PlaceActions lat={stop.lat} lon={stop.lon} line={place.line} name={`Parada de ${duration(stop.durationSeconds)}`} />
        </>
      )}
      {trip && (
        <>
          <Kv label="Salida">{dateTime(trip.startAt)}</Kv>
          <Kv label="Llegada">{dateTime(trip.endAt)}</Kv>
          <Kv label="Duración">{duration(trip.durationSeconds)}</Kv>
          <Kv label="Distancia">{km(trip.distanceKm)}</Kv>
          <Kv label="Velocidad máxima">{kph(trip.maxSpeedKph)}</Kv>
          <Kv label="Velocidad promedio">{kph(trip.avgSpeedKph)}</Kv>
          <Kv label="Salió de">{addrOf(trip.from[0], trip.from[1]) || `${trip.from[0].toFixed(5)}, ${trip.from[1].toFixed(5)}`}</Kv>
          <Kv label="Llegó a">{addrOf(trip.to[0], trip.to[1]) || `${trip.to[0].toFixed(5)}, ${trip.to[1].toFixed(5)}`}</Kv>
          <PlaceActions lat={trip.to[0]} lon={trip.to[1]} line={addrOf(trip.to[0], trip.to[1])} name="Llegada del viaje" />
        </>
      )}
    </div>
  );
});
