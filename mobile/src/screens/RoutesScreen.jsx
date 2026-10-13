import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DraftLayer, FitTo, MapView, ZonesLayer } from '@portal/components/map.jsx';
import { deviceName, km } from '@portal/lib/format.js';
import { haversine } from '@portal/lib/places.js';
import { del, explain, get, post, put, qs } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { Chip, Icon, Toast, useToast } from '../components/ui.jsx';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2'];
const CHANNELS = [['in_app', 'App'], ['whatsapp', 'WhatsApp'], ['email', 'Correo']];
const emptyAction = { notify: ['in_app'], whatsappPhone: '', emails: '', command: false };
const toApiAction = (a) => ({ notify: a.notify, whatsappPhone: a.notify.includes('whatsapp') ? a.whatsappPhone || undefined : undefined, emails: a.notify.includes('email') && a.emails ? a.emails.split(/[,\s]+/).filter(Boolean) : undefined, command: a.command ? { type: 'engineStop' } : null });
const fromApiAction = (a = {}) => ({ notify: a.notify?.length ? a.notify : ['in_app'], whatsappPhone: a.whatsappPhone || '', emails: (a.emails || []).join(', '), command: Boolean(a.command?.type) });
const pathLength = (path) => path.reduce((sum, p, i) => (i ? sum + haversine(path[i - 1], p) : 0), 0);
const newRoute = (companyId) => ({ name: '', originLabel: '', destinationLabel: '', waypoints: [], path: [], bufferM: 300, deviationPoints: 3, color: COLORS[1], enabled: true, allDevices: false, deviceIds: [], startsAt: '', endsAt: '', onDeviation: { ...emptyAction }, companyId });

export default function RoutesScreen({ onBack }) {
  const { devices, companyId, me } = useFleet();
  const [routes, setRoutes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [focus, setFocus] = useState({ bounds: null, token: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState([]);
  const [toast, say, clear] = useToast();
  const canCommand = ['platform_admin', 'reseller_admin', 'company_admin'].includes(me.role);
  const cid = companyId || me.companyId || undefined;

  const load = useCallback(() => get(`/api/routes${qs({ companyId: cid })}`).then(setRoutes).catch((err) => say(explain(err))), [cid, say]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (draft?.id) get(`/api/routes/${draft.id}/status`).then(setStatus).catch(() => setStatus([])); else setStatus([]); }, [draft?.id]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const path = draft ? (draft.path?.length >= 2 ? draft.path : draft.waypoints) : [];
  const length = path?.length >= 2 ? pathLength(path) : 0;
  const valid = draft && draft.name.trim().length >= 2 && length >= 200;
  const mapDraft = useMemo(() => (draft ? { type: 'route', color: draft.color, path: draft.path?.length >= 2 ? draft.path : draft.waypoints, waypoints: draft.waypoints, bufferM: draft.bufferM } : null), [draft]);

  const edit = (r) => { setNotice(''); setError(''); setDraft({ id: r.id, companyId: r.companyId, name: r.name, originLabel: r.originLabel || '', destinationLabel: r.destinationLabel || '', waypoints: [r.path[0], r.path.at(-1)], path: r.path, bufferM: r.bufferM, deviationPoints: r.deviationPoints, color: r.color, enabled: r.enabled, allDevices: r.allDevices, deviceIds: r.deviceIds || [], startsAt: r.startsAt ? r.startsAt.slice(0, 16) : '', endsAt: r.endsAt ? r.endsAt.slice(0, 16) : '', onDeviation: fromApiAction(r.onDeviation) }); setFocus((f) => ({ bounds: r.path, token: f.token + 1 })); };
  const trace = async () => {
    setBusy(true); setError('');
    try { const r = (await post('/api/routing/plan', { waypoints: draft.waypoints })).data; set({ path: r.path }); setNotice(r.source === 'osrm' ? `Trazado por carretera: ${km(r.distanceM / 1000)}${r.durationS ? ` · ${Math.round(r.durationS / 60)} min aprox.` : ''}.` : 'El servicio de rutas no respondió: se usa la línea recta entre tus puntos. Agrega más puntos siguiendo la carretera.'); } catch (err) { setError(explain(err)); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = { name: draft.name.trim(), path, bufferM: Number(draft.bufferM), deviationPoints: Number(draft.deviationPoints), originLabel: draft.originLabel || undefined, destinationLabel: draft.destinationLabel || undefined, color: draft.color, enabled: draft.enabled, allDevices: draft.allDevices, deviceIds: draft.deviceIds, startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null, endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null, onDeviation: toApiAction(draft.onDeviation), companyId: draft.companyId || cid };
      if (draft.id) await put(`/api/routes/${draft.id}`, body); else await post('/api/routes', body);
      say('Ruta guardada'); setDraft(null); load();
    } catch (err) { setError(explain(err)); } finally { setBusy(false); }
  };
  const remove = async () => { if (!window.confirm(`¿Eliminar la ruta «${draft.name}»?`)) return; try { await del(`/api/routes/${draft.id}`); say('Ruta eliminada'); setDraft(null); load(); } catch (err) { setError(explain(err)); } };
  const toggleDevice = (id) => set({ deviceIds: draft.deviceIds.includes(id) ? draft.deviceIds.filter((x) => x !== id) : [...draft.deviceIds, id] });
  const toggleNotify = (id) => set({ onDeviation: { ...draft.onDeviation, notify: draft.onDeviation.notify.includes(id) ? draft.onDeviation.notify.filter((c) => c !== id) : [...draft.onDeviation.notify, id] } });

  if (!draft) {
    return (
      <section className="screen full" aria-label="Rutas seguras">
        <div className="head"><div className="row"><button type="button" className="iconbtn" style={{ width: 44, height: 44, borderRadius: 14, background: '#fff', border: '1px solid var(--line2)' }} aria-label="Volver" onClick={onBack}><Icon name="back" stroke={2.2} /></button><div className="flex1"><h1 style={{ fontSize: 20 }}>Rutas seguras</h1><div className="sb">Avisa si un vehículo se sale de su trayecto</div></div></div></div>
        <div className="scroll" style={{ padding: 16, paddingBottom: 100 }}>
          {routes.map((r) => (
            <button key={r.id} type="button" className="cmd" onClick={() => edit(r)}>
              <i style={{ width: 12, height: 40, borderRadius: 6, background: r.color, flex: 'none' }} />
              <div className="flex1"><b>{r.name}</b><small>{km(r.lengthM / 1000)} · ±{r.bufferM} m{r.originLabel ? ` · ${r.originLabel} → ${r.destinationLabel || ''}` : ''}{r.onDeviation?.command ? ' · apaga motor' : ''}</small></div>
              <span className={`tag ${r.enabled ? 'green' : 'gray'}`}>{r.enabled ? 'Activa' : 'Pausada'}</span>
            </button>
          ))}
          {!routes.length && <div className="empty"><b>Sin rutas seguras</b>Marca el trayecto de un viaje y recibe un aviso si el vehículo se desvía.</div>}
        </div>
        <div className="fixed2"><button type="button" className="act p" onClick={() => { setNotice(''); setError(''); setDraft(newRoute(cid)); }}><Icon name="plus" size={18} />Nueva ruta segura</button></div>
        <Toast message={toast} onDone={clear} />
      </section>
    );
  }

  return (
    <section className="screen full" aria-label={draft.id ? 'Editar ruta segura' : 'Nueva ruta segura'} style={{ background: '#e9eee6' }}>
      <div className="rmap" style={{ position: 'absolute', inset: 0, bottom: '52%', height: 'auto' }}>
        <MapView center={[18.5, -70.3]} zoom={8} onClick={(ll) => set({ waypoints: [...draft.waypoints, [ll.lat, ll.lng]], path: [] })}>
          <ZonesLayer routes={routes.filter((r) => r.id !== draft.id)} />
          <DraftLayer draft={mapDraft} />
          {focus.bounds && <FitTo bounds={focus.bounds} token={focus.token} />}
        </MapView>
      </div>
      <button type="button" className="backbtn" aria-label="Volver a la lista" onClick={() => setDraft(null)}><Icon name="back" stroke={2.2} /></button>
      <button type="button" className="toprt" disabled={draft.waypoints.length < 2 || busy} onClick={trace}><Icon name="route" size={18} color="#fff" />Trazar por carretera</button>
      <div className="hint-pill">Toca el mapa para marcar puntos · {draft.waypoints.length} punto{draft.waypoints.length === 1 ? '' : 's'} · {km(length / 1000, 0)}</div>

      <div className="rsheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '48%', marginTop: 0 }}>
        <div className="grab" style={{ margin: '0 auto' }} />
        <div className="form" style={{ marginTop: 12 }}>
          <label><span className="lab">Nombre</span><input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej.: Barahona a Pedernales" /></label>
          <div className="row"><label className="flex1"><span className="lab">Origen</span><input className="input" value={draft.originLabel} onChange={(e) => set({ originLabel: e.target.value })} placeholder="Barahona" /></label><label className="flex1"><span className="lab">Destino</span><input className="input" value={draft.destinationLabel} onChange={(e) => set({ destinationLabel: e.target.value })} placeholder="Pedernales" /></label></div>
          <div className="actions">
            <button type="button" className="act" disabled={!draft.waypoints.length} onClick={() => set({ waypoints: draft.waypoints.slice(0, -1), path: [] })}>↶ Quitar último</button>
            <button type="button" className="act" disabled={!draft.waypoints.length} onClick={() => { set({ waypoints: [], path: [] }); setNotice(''); }}>Borrar puntos</button>
          </div>
          {notice && <div className="callout blue">{notice}</div>}
          <div><div className="lab"><span>Ancho permitido a cada lado</span><b>{draft.bufferM} m</b></div><input className="slider" type="range" min="50" max="2000" step="25" value={draft.bufferM} onChange={(e) => set({ bufferM: Number(e.target.value) })} aria-label="Ancho permitido" /></div>
          <div><div className="lab"><span>Avisar tras posiciones seguidas fuera</span><b>{draft.deviationPoints}</b></div><input className="slider" type="range" min="1" max="10" value={draft.deviationPoints} onChange={(e) => set({ deviationPoints: Number(e.target.value) })} aria-label="Posiciones seguidas fuera" /></div>
          <div><div className="lab"><span>Color en el mapa</span></div><div className="pick">{COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => set({ color: c })} style={{ width: 34, height: 34, borderRadius: 17, background: c, border: draft.color === c ? '3px solid #0b1f3a' : '3px solid #fff', boxShadow: '0 0 0 1px #d5dce8' }} />)}</div></div>
          <div><div className="lab"><span>GPS que vigila</span></div>
            <div className="pick"><Chip on={draft.allDevices} onClick={() => set({ allDevices: !draft.allDevices })}>Todos</Chip>{!draft.allDevices && devices.map((d) => <Chip key={d.id} on={draft.deviceIds.includes(d.id)} onClick={() => toggleDevice(d.id)}>{deviceName(d)}</Chip>)}</div></div>
          <div><div className="lab"><span>Si se SALE de la ruta</span></div><div className="pick">{CHANNELS.map(([id, label]) => <Chip key={id} on={draft.onDeviation.notify.includes(id)} onClick={() => toggleNotify(id)}>{label}</Chip>)}</div></div>
          {draft.onDeviation.notify.includes('whatsapp') && <label><span className="lab">WhatsApp (con código de país)</span><input className="input" inputMode="tel" value={draft.onDeviation.whatsappPhone} onChange={(e) => set({ onDeviation: { ...draft.onDeviation, whatsappPhone: e.target.value } })} placeholder="18095550123" /></label>}
          {draft.onDeviation.notify.includes('email') && <label><span className="lab">Correos (coma)</span><input className="input" inputMode="email" value={draft.onDeviation.emails} onChange={(e) => set({ onDeviation: { ...draft.onDeviation, emails: e.target.value } })} placeholder="Vacío = administradores" /></label>}
          {canCommand && (
            <div className={`switchrow${draft.onDeviation.command ? '' : ' off'}`}>
              <button type="button" role="switch" aria-checked={draft.onDeviation.command} aria-label="Apagar el motor si se sale de la ruta" className={`sw${draft.onDeviation.command ? '' : ' off'}`} onClick={() => set({ onDeviation: { ...draft.onDeviation, command: !draft.onDeviation.command } })}><i /></button>
              <div><b>Apagar el motor si se sale de la ruta</b><span>Se envía cuando el vehículo está a velocidad segura. Queda registrado quién lo configuró.</span></div>
            </div>
          )}
          <label className="row" style={{ gap: 10, fontWeight: 700, fontSize: 14 }}><input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ width: 20, height: 20 }} />Ruta activa</label>
          {status.length > 0 && <div><div className="lab"><span>Estado de los GPS ahora</span></div>{status.map((s) => <div key={s.id} className="kv"><span>{s.name}</span><b className={s.phase === 'off' ? 'c-red' : s.phase === 'on' ? 'c-green' : ''}>{s.phase === 'off' ? 'Fuera de ruta' : s.phase === 'on' ? 'En la ruta' : s.phase === 'done' ? 'Completó' : 'Sin iniciar'}</b></div>)}</div>}
          {error && <div className="callout red" role="alert">{error}</div>}
        </div>
      </div>
      <div className="fixed2">
        {draft.id ? <button type="button" className="act" onClick={remove}><Icon name="trash" size={17} />Eliminar</button> : <button type="button" className="act" onClick={() => setDraft(null)}>Cancelar</button>}
        <button type="button" className="act p" style={{ flex: 2 }} disabled={!valid || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar ruta'}</button>
      </div>
      <Toast message={toast} onDone={clear} />
    </section>
  );
}
