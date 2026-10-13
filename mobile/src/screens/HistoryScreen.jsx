import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FitTo, HistoryLayer, MapView } from '@portal/components/map.jsx';
import { dateTime, deviceName, duration, km, kph, localInput, startOfDay } from '@portal/lib/format.js';
import { nearestIndex } from '@portal/lib/places.js';
import { createPlacer, runPlayback } from '@portal/lib/playback.js';
import { explain, get, qs, request } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { useAddress } from '../lib/address.js';
import { AddressRows, PlaceActions } from '../components/Place.jsx';
import { Icon, Toast, useToast } from '../components/ui.jsx';

const PRESETS = [['Hoy', () => [startOfDay(0), new Date()]], ['Ayer', () => [startOfDay(-1), startOfDay(0)]], ['24 h', () => [new Date(Date.now() - 86400000), new Date()]], ['7 días', () => [startOfDay(-6), new Date()]]];
const SPEEDS = [1, 4, 16, 64, 256];
const IGNITION = { on: 'Motor encendido todo el tiempo', off: 'Motor apagado todo el tiempo', mixed: 'El motor se encendió o apagó durante la parada' };
const hm = (v) => new Date(v).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
const key4 = (lat, lon) => `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;

export default function HistoryScreen({ id, onBack }) {
  const { byId } = useFleet();
  const device = byId.get(id);
  const lastFix = device?.live.at ? new Date(device.live.at) : null;
  const lostSignal = Boolean(lastFix) && device?.live.status === 'offline';
  const [preset, setPreset] = useState(lostSignal && lastFix < startOfDay(0) ? 'loss' : 'Hoy');
  const [range, setRange] = useState(() => (lostSignal && lastFix < startOfDay(0) ? [new Date(lastFix.getTime() - 6 * 3600_000), new Date(lastFix.getTime() + 5 * 60_000)] : PRESETS[0][1]()));
  const [custom, setCustom] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [multiplier, setMultiplier] = useState(16);
  const [alertStop, setAlertStop] = useState(null);
  const [selection, setSelection] = useState(null);
  const [focus, setFocus] = useState({ bounds: null, token: 0 });
  const [, setAddrVersion] = useState(0);
  const [toast, say, clear] = useToast();
  const timeRef = useRef(0);
  const indexRef = useRef(0);
  const addresses = useRef(new Map());
  indexRef.current = index;
  const cursorRef = useRef(null); // el reproductor mueve el marcador directo, cuadro a cuadro
  const placeAt = useMemo(() => createPlacer(cursorRef), []);

  const load = useCallback(async (from, to) => {
    setBusy(true); setError(''); setPlaying(false); setAlertStop(null); setSelection(null);
    try {
      const result = await get(`/api/devices/${id}/history${qs({ from: from.toISOString(), to: to.toISOString(), maxPoints: 2500 })}`);
      setData(result); setIndex(0); timeRef.current = result.points[0]?.[0] ?? 0;
      setTimeout(() => placeAt(result.points, 0, timeRef.current), 80);
    } catch (err) { setError(explain(err)); setData(null); } finally { setBusy(false); }
  }, [id, placeAt]);
  useEffect(() => { load(...range); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Direcciones de cada viaje y parada, una por una (el servidor las guarda para no repetirlas).
  useEffect(() => {
    if (!data) return undefined;
    let cancelled = false;
    const targets = [...data.stops.map((s) => [s.lat, s.lon]), ...data.trips.flatMap((t) => [t.from, t.to])];
    (async () => {
      for (const [lat, lon] of targets) {
        const k = key4(lat, lon);
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

  // Reproducción continua: el vehículo se desliza entre los puntos guardados, salta los huecos largos y avisa en cada parada sin esperar.
  useEffect(() => {
    if (!playing || !points.length) return undefined;
    return runPlayback({ points, stopsSec, multiplier, timeRef, indexRef, onIndex: setIndex, onStop: setAlertStop, onEnd: () => setPlaying(false), place: placeAt });
  }, [playing, multiplier, data, placeAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al elegir una parada o un viaje: el vehículo se pone ahí, el mapa se acerca y se pausa.
  useEffect(() => {
    if (!data || !selection) return;
    setPlaying(false);
    const item = selection.kind === 'stop' ? data.stops[selection.i] : data.trips[selection.i];
    if (!item) return;
    const idx = points.length ? nearestIndex(points, Date.parse(item.startAt) / 1000) : 0;
    setIndex(idx); timeRef.current = points[idx]?.[0] ?? timeRef.current; placeAt(points, idx, timeRef.current);
    setFocus((f) => ({ bounds: selection.kind === 'stop' ? [[item.lat, item.lon]] : [item.from, item.to], token: f.token + 1 }));
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!device) return null;
  const current = points[Math.min(index, points.length - 1)];
  const alertData = alertStop != null ? data?.stops?.[alertStop] : null;
  const apply = (label, from, to) => { setPreset(label); setCustom(false); setRange([from, to]); load(from, to); };

  const downloadCsv = async () => {
    try {
      const response = await request(`/api/devices/${id}/history${qs({ from: range[0].toISOString(), to: range[1].toISOString(), format: 'csv' })}`, { raw: true });
      if (!response.ok) throw new Error('csv');
      const text = await response.text();
      const name = `historial-${(device.plate || device.imei || 'gps').replace(/[^A-Za-z0-9_-]/g, '')}-${range[0].toISOString().slice(0, 10)}.csv`;
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: 'Recorrido', url: file.uri, dialogTitle: 'Guardar o enviar el recorrido' });
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
        Object.assign(document.createElement('a'), { href: url, download: name }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch { say('No se pudo descargar el recorrido'); }
  };

  return (
    <section className="screen full" aria-label="Historial y reproducción" style={{ background: '#e9eee6' }}>
      <div className="hmap" style={{ position: 'absolute', inset: 0, bottom: '58%' }}>
        <MapView center={[18.7, -70.2]} zoom={8}>
          <HistoryLayer points={points} stops={data?.stops || []} index={index} device={device} selection={selection} cursorRef={cursorRef} onPickStop={(i) => setSelection({ kind: 'stop', i })} />
          {focus.bounds && <FitTo bounds={focus.bounds} token={focus.token} />}
        </MapView>
      </div>
      <button type="button" className="backbtn" aria-label="Volver" onClick={onBack}><Icon name="back" stroke={2.2} /></button>
      <div className="title-pill ell">{deviceName(device)} · Historial</div>
      <div className="legend" aria-label="Colores por velocidad"><div><i style={{ background: '#16a34a' }} />&lt; 40</div><div><i style={{ background: '#f59e0b' }} />40–80</div><div><i style={{ background: '#dc2626' }} />&gt; 80 km/h</div></div>

      <div className="hsheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', marginTop: 0 }}>
        <div className="grab" />
        <div className="chips" style={{ marginTop: -2 }}>
          {lostSignal && <button type="button" className={`chip flat${preset === 'loss' ? ' on' : ''}`} onClick={() => apply('loss', new Date(lastFix.getTime() - 6 * 3600_000), new Date(lastFix.getTime() + 5 * 60_000))}>Antes de perder la señal</button>}
          {PRESETS.map(([label, fn]) => <button key={label} type="button" className={`chip flat${preset === label ? ' on' : ''}`} onClick={() => { const [a, b] = fn(); apply(label, a, b); }}>{label}</button>)}
          <button type="button" className={`chip flat${custom ? ' on' : ''}`} onClick={() => { setCustom(true); setPreset('custom'); }}>Elegir fechas</button>
        </div>
        <div className="body">
          {custom && (
            <div className="form" style={{ marginBottom: 12 }}>
              <label><span className="lab">Desde</span><input className="input" type="datetime-local" value={localInput(range[0])} onChange={(e) => e.target.value && setRange([new Date(e.target.value), range[1]])} /></label>
              <label><span className="lab">Hasta</span><input className="input" type="datetime-local" value={localInput(range[1])} onChange={(e) => e.target.value && setRange([range[0], new Date(e.target.value)])} /></label>
              <button type="button" className="act p" disabled={busy} onClick={() => load(...range)}>{busy ? 'Cargando…' : 'Ver recorrido'}</button>
            </div>
          )}
          {busy && <p className="muted" style={{ fontWeight: 700 }}>Cargando recorrido…</p>}
          {error && <div className="callout red" role="alert">{error}</div>}
          {data?.limited && <div className="callout" style={{ marginBottom: 10 }}>Sin licencia vigente: solo se muestran las últimas 24 h.</div>}
          {data && !busy && points.length === 0 && <div className="empty"><b>Sin posiciones</b>No hay recorrido en ese rango.</div>}
          {points.length > 0 && (
            <>
              {alertData && <div className="stop-alert" role="status" style={{ marginBottom: 10 }}><span>⏸ Parada {alertStop + 1} · {duration(alertData.durationSeconds)}</span><small>{IGNITION[alertData.ignitionState] || ''}{addrOf(alertData.lat, alertData.lon) ? ` · ${addrOf(alertData.lat, alertData.lon)}` : ''}</small></div>}
              <div className="player">
                <button type="button" className="play" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={() => { if (index >= points.length - 1) { setIndex(0); timeRef.current = points[0][0]; placeAt(points, 0, timeRef.current); } setPlaying((p) => !p); }}><Icon name={playing ? 'pause' : 'play'} size={20} fill stroke={0} /></button>
                <div className="track">
                  <input type="range" min="0" max={points.length - 1} value={index} aria-label="Posición en el recorrido" onChange={(e) => { const v = Number(e.target.value); setIndex(v); timeRef.current = points[v][0]; placeAt(points, v, timeRef.current); }} />
                  <div className="meta"><span>{hm(points[0][0] * 1000)}</span><span className="ell">{current ? `${hm(current[0] * 1000)} · ${Math.round(current[3])} km/h${current[5] == null ? '' : current[5] ? ' · motor ON' : ' · motor OFF'}` : ''}</span><span>{hm(points.at(-1)[0] * 1000)}</span></div>
                </div>
                <button type="button" className="speedbtn" aria-label="Velocidad de reproducción" onClick={() => setMultiplier((m) => SPEEDS[(SPEEDS.indexOf(m) + 1) % SPEEDS.length])}>×{multiplier}</button>
              </div>
              <div className="tiles c3" style={{ marginTop: 14 }}>
                <div className="tile"><b>{km(data.totals.distanceKm)}</b><span>recorridos</span></div>
                <div className="tile"><b>{kph(data.totals.maxSpeedKph)}</b><span>máxima</span></div>
                <div className="tile"><b>{kph(data.totals.avgMovingSpeedKph)}</b><span>promedio en marcha</span></div>
                <div className="tile"><b>{duration(data.totals.movingSeconds)}</b><span>en movimiento</span></div>
                <div className="tile"><b>{duration(data.totals.idleSeconds)}</b><span>ralentí</span></div>
                <div className="tile"><b>{data.trips.length} / {data.stops.length}</b><span>viajes / paradas</span></div>
              </div>

              {selection && <SelectionCard data={data} selection={selection} onClose={() => setSelection(null)} onSelect={setSelection} addrOf={addrOf} />}

              <div className="h">Viajes</div>
              {data.trips.map((t, i) => (
                <button key={i} type="button" className={`trip${selection?.kind === 'trip' && selection.i === i ? ' sel' : ''}`} onClick={() => setSelection({ kind: 'trip', i })}>
                  <div><b>{hm(t.startAt)} → {hm(t.endAt)}</b><br /><span>{km(t.distanceKm)} · {duration(t.durationSeconds)} · máx. {kph(t.maxSpeedKph)}</span>{addrOf(t.to[0], t.to[1]) && <><br /><span>Llegó a {addrOf(t.to[0], t.to[1])}</span></>}</div>
                  <Icon name="chevron" size={18} color="#5b6b82" />
                </button>
              ))}
              {!data.trips.length && <p className="muted" style={{ fontWeight: 600 }}>Sin viajes en el rango.</p>}
              <div className="h">Paradas</div>
              {data.stops.map((s, i) => (
                <button key={i} type="button" className={`trip${selection?.kind === 'stop' && selection.i === i ? ' sel' : ''}`} onClick={() => setSelection({ kind: 'stop', i })}>
                  <div><b><span className="stop-n">P{i + 1}</span>{hm(s.startAt)} · {duration(s.durationSeconds)}</b><br /><span>{s.ignitionState === 'on' ? 'Motor encendido' : s.ignitionState === 'off' ? 'Motor apagado' : 'Motor mixto'}{addrOf(s.lat, s.lon) ? ` · ${addrOf(s.lat, s.lon)}` : ''}</span></div>
                  <Icon name="chevron" size={18} color="#5b6b82" />
                </button>
              ))}
              {!data.stops.length && <p className="muted" style={{ fontWeight: 600 }}>Sin paradas largas.</p>}
              <p className="faint" style={{ fontWeight: 600, fontSize: 11.5, marginTop: 10 }}>Mostrando {points.length} de {data.totalPoints} posiciones (el archivo trae todas). La reproducción no espera en las paradas: avisa y sigue.</p>
            </>
          )}
        </div>
        <div className="fixedbar" style={{ position: 'absolute' }}><button type="button" className="act" style={{ height: 48 }} onClick={downloadCsv} disabled={!points.length}><Icon name="down" size={18} />Descargar recorrido (CSV)</button></div>
      </div>
      <Toast message={toast} onDone={clear} />
    </section>
  );
}

const Kv = ({ label, children }) => (children ? <div className="kv"><span>{label}</span><b>{children}</b></div> : null);

// Todos los datos de la parada o del viaje elegido.
function SelectionCard({ data, selection, onClose, onSelect, addrOf }) {
  const stop = selection.kind === 'stop' ? data.stops[selection.i] : null;
  const trip = selection.kind === 'trip' ? data.trips[selection.i] : null;
  const place = useAddress(stop?.lat, stop?.lon, { detail: Boolean(stop) });
  const near = (iso, ms) => (other) => Math.abs(Date.parse(other) - Date.parse(iso)) <= ms;
  const cameFrom = stop ? data.trips.findIndex((t) => near(stop.startAt, 150_000)(t.endAt)) : -1;
  const leavesTo = stop ? data.trips.findIndex((t) => near(stop.endAt, 150_000)(t.startAt)) : -1;
  return (
    <div className="selcard">
      <header><span>{stop ? `Parada ${selection.i + 1}` : `Viaje ${selection.i + 1}`}</span><button type="button" className="iconbtn" aria-label="Cerrar detalle" onClick={onClose}><Icon name="close" size={18} /></button></header>
      {stop && (
        <>
          <Kv label="Llegó">{dateTime(stop.startAt)}</Kv>
          <Kv label="Salió">{dateTime(stop.endAt)}</Kv>
          <Kv label="Duración">{duration(stop.durationSeconds)}</Kv>
          <Kv label="Motor">{IGNITION[stop.ignitionState] || (stop.ignitionOn ? 'Encendido' : 'Apagado')}{stop.ignitionState === 'mixed' ? ` · encendido ${duration(stop.ignitionOnSeconds)} de ${duration(stop.durationSeconds)}` : ''}</Kv>
          <Kv label="Posiciones recibidas">{stop.fixes}</Kv>
          <Kv label="Coordenadas">{`${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}`}</Kv>
          {cameFrom >= 0 && <button type="button" className="link" onClick={() => onSelect({ kind: 'trip', i: cameFrom })}>Llegó en el viaje {cameFrom + 1} · {km(data.trips[cameFrom].distanceKm)}</button>}
          {leavesTo >= 0 && <button type="button" className="link" onClick={() => onSelect({ kind: 'trip', i: leavesTo })}>Salió en el viaje {leavesTo + 1} · {km(data.trips[leavesTo].distanceKm)}</button>}
          <div className="h" style={{ margin: '10px 0 2px' }}>Dónde fue</div>
          <AddressRows details={place.details} line={place.line} loading={place.loading} />
          <PlaceActions lat={stop.lat} lon={stop.lon} line={place.line} name={`Parada de ${duration(stop.durationSeconds)}`} />
        </>
      )}
      {trip && (
        <>
          <Kv label="Salida">{dateTime(trip.startAt)}</Kv>
          <Kv label="Llegada">{dateTime(trip.endAt)}</Kv>
          <Kv label="Distancia">{km(trip.distanceKm)}</Kv>
          <Kv label="Duración">{duration(trip.durationSeconds)}</Kv>
          <Kv label="Velocidad máxima">{kph(trip.maxSpeedKph)}</Kv>
          <Kv label="Salió de">{addrOf(trip.from[0], trip.from[1]) || 'Buscando dirección…'}</Kv>
          <Kv label="Llegó a">{addrOf(trip.to[0], trip.to[1]) || 'Buscando dirección…'}</Kv>
        </>
      )}
    </div>
  );
}
