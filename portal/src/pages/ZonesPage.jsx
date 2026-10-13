import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { del, explain, get, post, put } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { deviceName, km } from '../lib/format.js';
import { DeviceLayer, DraftLayer, FitTo, MapView, ZonesLayer } from '../components/map.jsx';
import { Empty, Field, Tabs, useAction } from '../components/ui.jsx';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];
const CHANNELS = [['in_app', 'Portal y app'], ['whatsapp', 'WhatsApp'], ['email', 'Correo']];
const emptyAction = { notify: ['in_app'], whatsappPhone: '', emails: '', command: false };
const toApiAction = (a) => ({ notify: a.notify, whatsappPhone: a.notify.includes('whatsapp') ? a.whatsappPhone || undefined : undefined, emails: a.notify.includes('email') && a.emails ? a.emails.split(/[,\s]+/).filter(Boolean) : undefined, command: a.command ? { type: 'engineStop' } : null });
const fromApiAction = (a = {}) => ({ notify: a.notify || [], whatsappPhone: a.whatsappPhone || '', emails: (a.emails || []).join(', '), command: Boolean(a.command?.type) });
const mapDistance = (a, b) => { const R = 6371008.8; const rad = (d) => (d * Math.PI) / 180; return 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2)); };
const pathLength = (path) => path.slice(1).reduce((sum, p, i) => sum + mapDistance(path[i], p), 0);

function ActionConfig({ title, hint, value, onChange, canCommand, commandLabel }) {
  const toggle = (id) => onChange({ ...value, notify: value.notify.includes(id) ? value.notify.filter((c) => c !== id) : [...value.notify, id] });
  return (
    <fieldset className="action-box">
      <legend>{title}</legend>
      {hint && <small className="muted">{hint}</small>}
      <div className="check-row">{CHANNELS.map(([id, label]) => <label key={id} className="check"><input type="checkbox" checked={value.notify.includes(id)} onChange={() => toggle(id)} /> {label}</label>)}</div>
      {value.notify.includes('whatsapp') && <Field label="WhatsApp (con código de país)"><input value={value.whatsappPhone} onChange={(e) => onChange({ ...value, whatsappPhone: e.target.value })} placeholder="18095550123" /></Field>}
      {value.notify.includes('email') && <Field label="Correos (separados por coma)" hint="Vacío = administradores de la empresa."><input value={value.emails} onChange={(e) => onChange({ ...value, emails: e.target.value })} /></Field>}
      {canCommand && (
        <label className={`check danger-check${value.command ? ' on' : ''}`}>
          <input type="checkbox" checked={value.command} onChange={(e) => onChange({ ...value, command: e.target.checked })} /> <b>{commandLabel}</b>
          <small>Se envía solo si el vehículo va a menos de 15 km/h; si va más rápido espera a que baje la velocidad. Queda registrado en el historial de comandos.</small>
        </label>
      )}
    </fieldset>
  );
}

function DevicePicker({ devices, all, ids, onChange, allLabel }) {
  return (
    <fieldset className="action-box">
      <legend>Qué GPS vigila</legend>
      <label className="check"><input type="checkbox" checked={all} onChange={(e) => onChange({ all: e.target.checked, ids })} /> {allLabel}</label>
      {!all && <div className="pick-list">{devices.map((d) => <label key={d.id} className="check"><input type="checkbox" checked={ids.includes(d.id)} onChange={(e) => onChange({ all, ids: e.target.checked ? [...ids, d.id] : ids.filter((i) => i !== d.id) })} /> {deviceName(d)}{d.plate ? ` · ${d.plate}` : ''}</label>)}</div>}
    </fieldset>
  );
}

// ---------------- Geovallas ----------------
function GeofenceEditor({ draft, setDraft, devices, canCommand, onSaved, onCancel }) {
  const { busy, error, run, setError } = useAction();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim().length >= 2 && (draft.type === 'circle' ? Boolean(draft.center) : draft.points.length >= 3);
  const save = () => run(async () => {
    const shape = draft.type === 'circle' ? { type: 'circle', center: draft.center, radiusM: Number(draft.radiusM) } : { type: 'polygon', points: draft.points };
    const body = { name: draft.name.trim(), shape, color: draft.color, enabled: draft.enabled, allDevices: draft.allDevices, deviceIds: draft.deviceIds, speedLimitKph: draft.speedLimitKph ? Number(draft.speedLimitKph) : null, onEnter: toApiAction(draft.onEnter), onExit: toApiAction(draft.onExit), companyId: draft.companyId };
    if (draft.id) await put(`/api/geofences/${draft.id}`, body); else await post('/api/geofences', body);
    await onSaved();
  });
  return (
    <div className="editor">
      <h3>{draft.id ? 'Editar geovalla' : 'Nueva geovalla'}</h3>
      <Field label="Nombre"><input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej.: Almacén Barahona" /></Field>
      <div className="seg"><button type="button" className={draft.type === 'circle' ? 'on' : ''} onClick={() => set({ type: 'circle' })}>● Círculo</button><button type="button" className={draft.type === 'polygon' ? 'on' : ''} onClick={() => set({ type: 'polygon' })}>⬠ Polígono</button></div>
      <p className="hint">{draft.type === 'circle' ? (draft.center ? 'Toca otro punto del mapa para mover el centro.' : 'Toca el mapa para colocar el centro.') : `Toca el mapa para agregar puntos (${draft.points.length}). Mínimo 3.`}</p>
      {draft.type === 'circle' ? <Field label={`Radio: ${Number(draft.radiusM).toLocaleString('es-DO')} m`}><input type="range" min="50" max="20000" step="50" value={draft.radiusM} onChange={(e) => set({ radiusM: Number(e.target.value) })} /></Field>
        : <div className="btn-row"><button type="button" className="btn small" disabled={!draft.points.length} onClick={() => set({ points: draft.points.slice(0, -1) })}>↶ Quitar último</button><button type="button" className="btn small" disabled={!draft.points.length} onClick={() => set({ points: [] })}>Borrar todo</button></div>}
      <div className="color-row">{COLORS.map((c) => <button type="button" key={c} className={`color${draft.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => set({ color: c })} />)}</div>
      <Field label="Límite de velocidad dentro (km/h)" hint="Opcional: avisa si se supera mientras está dentro de la zona."><input type="number" min="5" max="250" value={draft.speedLimitKph} onChange={(e) => set({ speedLimitKph: e.target.value })} /></Field>
      <DevicePicker devices={devices} all={draft.allDevices} ids={draft.deviceIds} onChange={({ all, ids }) => set({ allDevices: all, deviceIds: ids })} allLabel="Todos los GPS de la empresa" />
      <ActionConfig title="Al ENTRAR" value={draft.onEnter} onChange={(onEnter) => set({ onEnter })} canCommand={canCommand} commandLabel="Apagar el motor al entrar" />
      <ActionConfig title="Al SALIR" hint="Útil para vehículos que no deben abandonar una zona." value={draft.onExit} onChange={(onExit) => set({ onExit })} canCommand={canCommand} commandLabel="Apagar el motor al salir" />
      <label className="check"><input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Geovalla activa</label>
      {error && <p className="form-error">{error}</p>}
      <div className="row-actions"><button type="button" className="btn" onClick={onCancel}>Cancelar</button><button type="button" className="btn primary" disabled={!valid || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </div>
  );
}

// ---------------- Rutas seguras ----------------
function RouteEditor({ draft, setDraft, devices, canCommand, onSaved, onCancel }) {
  const { busy, error, run, setError } = useAction();
  const [notice, setNotice] = useState('');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const path = draft.path?.length >= 2 ? draft.path : draft.waypoints;
  const length = path?.length >= 2 ? pathLength(path) : 0;
  const valid = draft.name.trim().length >= 2 && length >= 200;

  const trace = () => run(async () => {
    const r = await post('/api/routing/plan', { waypoints: draft.waypoints });
    set({ path: r.path });
    setNotice(r.source === 'osrm' ? `Trazado por carretera: ${km(r.distanceM / 1000)}${r.durationS ? ` · ${Math.round(r.durationS / 60)} min aprox.` : ''}.` : 'El servicio de rutas no respondió: se usa la línea recta entre tus puntos. Agrega más puntos siguiendo la carretera.');
  });
  const save = () => run(async () => {
    const body = { name: draft.name.trim(), path, bufferM: Number(draft.bufferM), deviationPoints: Number(draft.deviationPoints), originLabel: draft.originLabel || undefined, destinationLabel: draft.destinationLabel || undefined, color: draft.color, enabled: draft.enabled, allDevices: draft.allDevices, deviceIds: draft.deviceIds, startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null, endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null, onDeviation: toApiAction(draft.onDeviation), companyId: draft.companyId };
    if (draft.id) await put(`/api/routes/${draft.id}`, body); else await post('/api/routes', body);
    await onSaved();
  });
  return (
    <div className="editor">
      <h3>{draft.id ? 'Editar ruta segura' : 'Nueva ruta segura'}</h3>
      <p className="hint">Marca el origen, los puntos intermedios y el destino tocando el mapa. Luego pulsa «Trazar por carretera». Si el vehículo se sale del corredor, se avisa.</p>
      <Field label="Nombre"><input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej.: Barahona → Pedernales" /></Field>
      <div className="form-grid"><Field label="Origen"><input value={draft.originLabel} onChange={(e) => set({ originLabel: e.target.value })} placeholder="Barahona" /></Field><Field label="Destino"><input value={draft.destinationLabel} onChange={(e) => set({ destinationLabel: e.target.value })} placeholder="Pedernales" /></Field></div>
      <div className="btn-row">
        <button type="button" className="btn small" disabled={!draft.waypoints.length} onClick={() => set({ waypoints: draft.waypoints.slice(0, -1), path: [] })}>↶ Quitar último punto</button>
        <button type="button" className="btn small" disabled={!draft.waypoints.length} onClick={() => { set({ waypoints: [], path: [] }); setNotice(''); }}>Borrar</button>
        <button type="button" className="btn small primary" disabled={draft.waypoints.length < 2 || busy} onClick={trace}>🛣 Trazar por carretera</button>
      </div>
      {notice && <p className="hint">{notice}</p>}
      <p className="muted">Puntos: {draft.waypoints.length} · Longitud: <b>{km(length / 1000)}</b></p>
      <Field label={`Ancho permitido a cada lado: ${draft.bufferM} m`} hint="Si se aleja más que esto de la ruta, es un desvío."><input type="range" min="50" max="2000" step="25" value={draft.bufferM} onChange={(e) => set({ bufferM: Number(e.target.value) })} /></Field>
      <Field label={`Avisar tras ${draft.deviationPoints} posiciones seguidas fuera`} hint="Más posiciones = menos falsas alarmas por ruido del GPS."><input type="range" min="1" max="10" value={draft.deviationPoints} onChange={(e) => set({ deviationPoints: Number(e.target.value) })} /></Field>
      <div className="color-row">{COLORS.map((c) => <button type="button" key={c} className={`color${draft.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => set({ color: c })} />)}</div>
      <DevicePicker devices={devices} all={draft.allDevices} ids={draft.deviceIds} onChange={({ all, ids }) => set({ allDevices: all, deviceIds: ids })} allLabel="Todos los GPS de la empresa" />
      <div className="form-grid"><Field label="Vigente desde (opcional)"><input type="datetime-local" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field><Field label="Hasta (opcional)"><input type="datetime-local" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></Field></div>
      <ActionConfig title="Si se SALE de la ruta" value={draft.onDeviation} onChange={(onDeviation) => set({ onDeviation })} canCommand={canCommand} commandLabel="Apagar el motor si se sale de la ruta" />
      <label className="check"><input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Ruta activa</label>
      {error && <p className="form-error">{error}</p>}
      <div className="row-actions"><button type="button" className="btn" onClick={onCancel}>Cancelar</button><button type="button" className="btn primary" disabled={!valid || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar ruta'}</button></div>
    </div>
  );
}

const newGeofence = (companyId) => ({ type: 'circle', name: '', center: null, radiusM: 500, points: [], color: COLORS[0], enabled: true, allDevices: true, deviceIds: [], speedLimitKph: '', onEnter: { ...emptyAction }, onExit: { ...emptyAction, notify: ['in_app'] }, companyId });
const newRoute = (companyId) => ({ name: '', originLabel: '', destinationLabel: '', waypoints: [], path: [], bufferM: 300, deviationPoints: 3, color: COLORS[1], enabled: true, allDevices: false, deviceIds: [], startsAt: '', endsAt: '', onDeviation: { ...emptyAction }, companyId });

export default function ZonesPage({ initialTab = 'geofences' }) {
  const { devices, me, companyId } = useFleet();
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState({ geofences: [], routes: [] });
  const [draft, setDraft] = useState(null);
  const [focus, setFocus] = useState({ bounds: null, token: 0 });
  const [routeStatus, setRouteStatus] = useState([]);
  const canWrite = ['platform_admin', 'reseller_admin', 'company_admin', 'operator'].includes(me.role);
  const canCommand = ['platform_admin', 'reseller_admin', 'company_admin'].includes(me.role);
  const targetCompany = companyId || me.companyId || undefined;

  const load = useCallback(async () => {
    const q = companyId ? `?companyId=${companyId}` : '';
    const [geofences, routes] = await Promise.all([get(`/api/geofences${q}`), get(`/api/routes${q}`)]);
    setData({ geofences, routes });
  }, [companyId]);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => { setDraft(null); }, [tab]);

  const mapClick = useCallback((latlng) => {
    setDraft((d) => {
      if (!d) return d;
      const point = [Number(latlng.lat.toFixed(6)), Number(latlng.lng.toFixed(6))];
      if (d.waypoints) return { ...d, waypoints: [...d.waypoints, point], path: [] };
      if (d.type === 'circle') return { ...d, center: point };
      return { ...d, points: [...d.points, point] };
    });
  }, []);

  const editGeofence = (g) => { setDraft({ id: g.id, companyId: g.companyId, name: g.name, type: g.shape.type, center: g.shape.center || null, radiusM: g.shape.radiusM || 500, points: g.shape.points || [], color: g.color, enabled: g.enabled, allDevices: g.allDevices, deviceIds: g.deviceIds, speedLimitKph: g.speedLimitKph || '', onEnter: fromApiAction(g.onEnter), onExit: fromApiAction(g.onExit) }); setFocus((f) => ({ bounds: g.shape.type === 'circle' ? [g.shape.center] : g.shape.points, token: f.token + 1 })); };
  const editRoute = (r) => { setDraft({ id: r.id, companyId: r.companyId, name: r.name, originLabel: r.originLabel || '', destinationLabel: r.destinationLabel || '', waypoints: [r.path[0], r.path.at(-1)], path: r.path, bufferM: r.bufferM, deviationPoints: r.deviationPoints, color: r.color, enabled: r.enabled, allDevices: r.allDevices, deviceIds: r.deviceIds, startsAt: r.startsAt ? r.startsAt.slice(0, 16) : '', endsAt: r.endsAt ? r.endsAt.slice(0, 16) : '', onDeviation: fromApiAction(r.onDeviation) }); setFocus((f) => ({ bounds: r.path, token: f.token + 1 })); };
  const remove = async (kind, item) => { if (!window.confirm(`¿Eliminar «${item.name}»?`)) return; await del(`/api/${kind}/${item.id}`); if (draft?.id === item.id) setDraft(null); await load(); };
  useEffect(() => { if (tab === 'routes' && draft?.id) get(`/api/routes/${draft.id}/status`).then(setRouteStatus).catch(() => setRouteStatus([])); else setRouteStatus([]); }, [tab, draft?.id]);

  const draftLayer = useMemo(() => {
    if (!draft) return null;
    if (draft.waypoints) return { type: 'route', color: draft.color, path: draft.path?.length >= 2 ? draft.path : draft.waypoints, waypoints: draft.waypoints, bufferM: draft.bufferM };
    return { type: draft.type, color: draft.color, center: draft.center, radiusM: draft.radiusM, points: draft.points };
  }, [draft]);
  const pickZone = useCallback(({ kind, item }) => {
    if (!canWrite) return;
    if (kind === 'geofence') { setTab('geofences'); setTimeout(() => editGeofence(item), 0); } else { setTab('routes'); setTimeout(() => editRoute(item), 0); }
  }, [canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = tab === 'geofences' ? data.geofences : data.routes;
  return (
    <div className="zones">
      <section className="zones-side">
        <Tabs value={tab} onChange={setTab} tabs={[['geofences', '▭ Geovallas', data.geofences.length], ['routes', '🛣 Rutas seguras', data.routes.length]]} />
        {!draft && (
          <>
            {canWrite && <button type="button" className="btn primary block" onClick={() => setDraft(tab === 'geofences' ? newGeofence(targetCompany) : newRoute(targetCompany))}>+ {tab === 'geofences' ? 'Nueva geovalla' : 'Nueva ruta segura'}</button>}
            <p className="hint">{tab === 'geofences' ? 'Una geovalla avisa cuando un GPS entra o sale de una zona, y puede apagar el motor.' : 'Una ruta segura es un corredor alrededor de un trayecto (por ejemplo Barahona → Pedernales). Si el vehículo se sale, te avisa.'}</p>
            <ul className="zone-list">
              {items.map((item) => (
                <li key={item.id}><button type="button" className="zone-row" onClick={() => (tab === 'geofences' ? editGeofence(item) : editRoute(item))}><i className="swatch" style={{ background: item.color }} /><span><b>{item.name}</b><small>{tab === 'routes' ? `${km(item.lengthM / 1000)} · ±${item.bufferM} m${item.originLabel ? ` · ${item.originLabel} → ${item.destinationLabel || ''}` : ''}` : item.shape.type === 'circle' ? `Círculo de ${item.shape.radiusM} m` : `Polígono de ${item.shape.points.length} puntos`}{!item.enabled ? ' · pausada' : ''}{(item.onEnter?.command || item.onExit?.command || item.onDeviation?.command) ? ' · apaga motor' : ''}</small></span></button>{canWrite && <button type="button" className="icon-btn" onClick={() => remove(tab, item)} aria-label={`Eliminar ${item.name}`}>🗑</button>}</li>
              ))}
              {items.length === 0 && <Empty icon={tab === 'geofences' ? '▭' : '🛣'} title={tab === 'geofences' ? 'Sin geovallas' : 'Sin rutas seguras'} />}
            </ul>
          </>
        )}
        {draft && tab === 'geofences' && <GeofenceEditor draft={draft} setDraft={setDraft} devices={devices} canCommand={canCommand} onSaved={async () => { await load(); setDraft(null); }} onCancel={() => setDraft(null)} />}
        {draft && tab === 'routes' && <RouteEditor draft={draft} setDraft={setDraft} devices={devices} canCommand={canCommand} onSaved={async () => { await load(); setDraft(null); }} onCancel={() => setDraft(null)} />}
        {tab === 'routes' && draft?.id && routeStatus.length > 0 && (
          <div className="route-status"><h4>Ahora mismo</h4><ul className="plain">{routeStatus.map((s) => <li key={s.id}><span>{s.name}</span><b className={s.phase === 'off' ? 'bad' : s.phase === 'on' ? 'good' : 'muted'}>{s.phase === 'off' ? '⚠ Fuera de ruta' : s.phase === 'on' ? '✔ En ruta' : s.phase === 'done' ? 'Completó' : 'Sin iniciar'}</b></li>)}</ul></div>
        )}
      </section>
      <section className="map-area">
        <MapView onClick={draft ? mapClick : undefined}>
          <DeviceLayer devices={devices} selectedId={null} />
          <ZonesLayer geofences={draft && tab === 'geofences' ? data.geofences.filter((g) => g.id !== draft.id) : data.geofences} routes={draft && tab === 'routes' ? data.routes.filter((r) => r.id !== draft.id) : data.routes} highlightId={draft?.id} onPick={draft ? undefined : pickZone} />
          {draft && <DraftLayer draft={draftLayer} />}
          {focus.bounds && <FitTo bounds={focus.bounds} token={focus.token} />}
        </MapView>
      </section>
    </div>
  );
}
