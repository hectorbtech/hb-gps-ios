import { DeviceWhatsapp } from './WhatsappBox.jsx';
import React, { useEffect, useState } from 'react';
import { ApiError, api, del, explain, get, patch, post, put } from '../lib/api.js';
import PlanPicker from './PlanPicker.jsx';
import { COMMAND_STATUS, ICON_OPTIONS, dateTime } from '../lib/format.js';
import { Badge, Field, Modal, useAction } from './ui.jsx';

// ---- Comandos al equipo
export function CommandsModal({ device, me, onClose }) {
  const [types, setTypes] = useState([]);
  const [history, setHistory] = useState([]);
  const [type, setType] = useState('positionSingle');
  const [frequency, setFrequency] = useState(60);
  const [done, setDone] = useState(null);
  const [declaration, setDeclaration] = useState('');
  const [mode, setMode] = useState('now'); // vehículo en movimiento: apagar ya, o esperar a que se detenga
  const { busy, error, run } = useAction();
  const moving = Number(device.live?.speedKph || 0) > 5;
  const customer = me.role === 'end_customer';
  const load = () => get(`/api/devices/${device.id}/commands`).then(setHistory).catch(() => undefined);
  useEffect(() => { api(`/api/command-types?deviceId=${device.id}`).then((r) => { setTypes(r.data); setDeclaration(r.declaration || ''); }).catch(() => undefined); load(); }, [device.id]);
  const spec = types.find((t) => t.type === type);
  const critical = Boolean(spec?.critical);

  const send = () => run(async () => {
    const body = { type, declaration: critical ? true : undefined, immediate: type === 'engineStop' && moving && mode === 'now' ? true : undefined, attributes: type === 'positionPeriodic' ? { frequency: Number(frequency) } : undefined };
    const result = await post(`/api/devices/${device.id}/commands`, body);
    setDone(result);
    load();
    setTimeout(load, 5000); // la respuesta del equipo (por ejemplo la ubicación) llega unos segundos después
  });
  const cancel = (id) => run(async () => { await del(`/api/commands/${id}`); load(); });

  return (
    <Modal title={`Comandos · ${device.name}`} onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Orden" wide>
          <select value={type} onChange={(e) => { setType(e.target.value); setDone(null); }}>
            {types.map((t) => <option key={t.type} value={t.type} disabled={!t.allowed}>{t.label}{t.critical ? ' · crítica' : ''}{!t.allowed ? ' (sin permiso)' : ''}</option>)}
          </select>
        </Field>
        {type === 'positionPeriodic' && <Field label="Reportar cada (segundos)" hint="Menos segundos = mapa más fino, pero más datos y batería. Mínimo 10."><input type="number" min="10" max="86400" value={frequency} onChange={(e) => setFrequency(e.target.value)} /></Field>}
        {critical && (
          <>
            <div className="callout danger wide">
              <b>{type === 'engineStop' ? 'Apagar el motor a distancia' : 'Restablecer el motor'}</b>
              {type === 'engineStop' && <p>{declaration}</p>}
              {type === 'engineStop' && !customer && <p>Queda registrado quién lo pidió, cuándo y a qué velocidad iba el vehículo.</p>}
              {type === 'engineResume' && <p>Se enviará la orden para que el vehículo pueda volver a arrancar.</p>}
            </div>
            {type === 'engineStop' && moving && (
              <div className="wide mode-pick">
                <p className="warn"><b>El vehículo va en movimiento ({Math.round(device.live.speedKph)} km/h).</b></p>
                <label className="check"><input type="radio" name="cutmode" checked={mode === 'now'} onChange={() => setMode('now')} /> <span><b>Apagar ahora</b> aunque vaya en movimiento (por ejemplo, para detener un robo que estás siguiendo). Puede perder dirección asistida y frenos asistidos.</span></label>
                <label className="check"><input type="radio" name="cutmode" checked={mode === 'safe'} onChange={() => setMode('safe')} /> <span><b>Apagar cuando se detenga</b> o baje de la velocidad segura (más seguro; puede tardar).</span></label>
              </div>
            )}
          </>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {done && <p className="form-ok">{done.status === 'waiting_safe_speed' ? 'Orden en espera: se enviará cuando el vehículo esté a velocidad segura.' : done.status === 'sent' ? 'Orden enviada al equipo.' : `Estado: ${COMMAND_STATUS[done.status] || done.status}`}</p>}
      <div className="row-actions"><button type="button" className={critical ? 'btn danger' : 'btn primary'} disabled={busy} onClick={send}>{busy ? 'Enviando…' : critical ? (type === 'engineStop' ? 'Aceptar y apagar el motor' : 'Aceptar y restablecer el motor') : 'Enviar orden'}</button></div>
      <h4>Historial de órdenes</h4>
      <table className="table compact"><thead><tr><th>Fecha</th><th>Orden</th><th>Origen</th><th>Estado</th><th /></tr></thead>
        <tbody>{history.map((c) => (
          <tr key={c.id}><td>{dateTime(c.created_at)}</td><td>{types.find((t) => t.type === c.type)?.label || c.type}</td><td>{c.source === 'manual' ? c.requested_by : c.source === 'route' ? 'Regla de ruta' : 'Regla de geovalla'}</td>
            <td><Badge tone={c.status === 'sent' ? 'green' : c.status === 'failed' ? 'red' : 'amber'}>{COMMAND_STATUS[c.status] || c.status}</Badge>{c.last_error && <small className="muted"> {c.last_error.startsWith('HB_GPS_') ? explain(new ApiError(c.last_error, 0)) : c.last_error}</small>}{c.result_text && <small className="block">Respuesta del GPS: {c.result_text}</small>}</td>
            <td>{['queued', 'waiting_safe_speed'].includes(c.status) && <button type="button" className="btn small" onClick={() => cancel(c.id)}>Cancelar</button>}</td></tr>
        ))}{!history.length && <tr><td colSpan="5" className="muted">Todavía no hay órdenes.</td></tr>}</tbody></table>
    </Modal>
  );
}

// ---- Compartir ubicación
export function ShareModal({ device, onClose }) {
  const [links, setLinks] = useState([]);
  const [hours, setHours] = useState(24);
  const [history, setHistory] = useState(false);
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState(null);
  const { busy, error, run } = useAction();
  const load = () => get(`/api/devices/${device.id}/share`).then(setLinks).catch(() => undefined);
  useEffect(() => { load(); }, [device.id]);
  const create = () => run(async () => { const r = await post(`/api/devices/${device.id}/share`, { expiresInHours: Number(hours), allowHistory: history, label: label || undefined }); setCreated(r); load(); });
  const revoke = (id) => run(async () => { await del(`/api/share/${id}`); load(); });
  return (
    <Modal title={`Compartir ubicación · ${device.name}`} onClose={onClose}>
      <p className="muted">Quien reciba el enlace ve la ubicación en vivo de este equipo, sin entrar a tu cuenta y sin ver su IMEI. Caduca solo y puedes revocarlo.</p>
      <div className="form-grid">
        <Field label="Vigencia"><select value={hours} onChange={(e) => setHours(e.target.value)}><option value="1">1 hora</option><option value="4">4 horas</option><option value="24">24 horas</option><option value="72">3 días</option><option value="168">7 días</option><option value="720">30 días</option></select></Field>
        <Field label="Nombre del enlace"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej.: Cliente Ferretería Sosa" /></Field>
        <label className="check wide"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Mostrar también el recorrido de las últimas 2 horas</label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy} onClick={create}>Crear enlace</button></div>
      {created && <div className="callout"><b>Enlace listo (cópialo ahora; no se vuelve a mostrar):</b><input readOnly value={created.url} onFocus={(e) => e.target.select()} /><button type="button" className="btn small" onClick={() => navigator.clipboard?.writeText(created.url)}>Copiar</button></div>}
      <h4>Enlaces activos</h4>
      <ul className="plain">{links.map((l) => <li key={l.id}><span>{l.label || 'Sin nombre'} · vence {dateTime(l.expires_at)}{l.allow_history ? ' · con recorrido' : ''}</span><button type="button" className="btn small danger" onClick={() => revoke(l.id)}>Revocar</button></li>)}{!links.length && <li className="muted">No hay enlaces activos.</li>}</ul>
    </Modal>
  );
}

// ---- Editar equipo
export function EditDeviceModal({ device, me, onClose, onSaved }) {
  const [form, setForm] = useState({ displayName: device.displayName || '', model: device.model || '', simNumber: device.simNumber || '', iconKey: device.iconKey || 'car', notes: device.notes || '', reportInterval: device.reportInterval?.own ?? '' });
  const [alerts, setAlerts] = useState(null);
  const [clock, setClock] = useState({ manual: device.clock?.mode === 'manual', hours: device.clock?.mode === 'manual' ? String(device.clock.offsetHours) : '0' });
  const [assign, setAssign] = useState({ vehicleId: device.vehicleId || '', driverId: '', endCustomerId: device.endCustomerId || '' });
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plan, setPlan] = useState({ plan: '', allowPending: false, free: false });
  const { busy, error, run } = useAction();
  const canAssign = ['platform_admin', 'reseller_admin', 'company_admin'].includes(me.role);
  useEffect(() => { get(`/api/devices/${device.id}/alerts`).then(setAlerts).catch(() => setAlerts([])); }, [device.id]);
  const setAlert = (key, patchValue) => setAlerts((list) => list.map((a) => (a.key === key ? { ...a, ...patchValue } : a)));
  const setParam = (key, param, value) => setAlerts((list) => list.map((a) => (a.key === key ? { ...a, params: a.params.map((p) => (p.key === param ? { ...p, value } : p)) } : a)));
  const basic = !canAssign; // cliente final y operador: solo nombre, ícono, notas y alertas
  const canClock = canAssign;
  useEffect(() => {
    if (!canAssign) return;
    const q = `?companyId=${device.companyId}`;
    Promise.all([get(`/api/vehicles${q}`), get(`/api/drivers${q}`), get(`/api/end-customers${q}`)]).then(([v, d, c]) => { setVehicles(v); setDrivers(d); setCustomers(c); }).catch(() => undefined);
  }, [device.companyId, canAssign]);
  // Al darlo a un cliente final, el GPS necesita un plan (se cobra de los créditos de la empresa): si aún no lo tiene, se elige aquí.
  const needsPlan = canAssign && Boolean(assign.endCustomerId) && assign.endCustomerId !== device.endCustomerId && !device.license?.plan && !device.license?.pending;
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const save = () => run(async () => {
    if (basic) await patch(`/api/devices/${device.id}/basic`, { displayName: form.displayName || undefined, iconKey: form.iconKey, notes: form.notes || null });
    else {
      await patch(`/api/devices/${device.id}`, { displayName: form.displayName || null, model: form.model || null, simNumber: form.simNumber || null, iconKey: form.iconKey, notes: form.notes || null });
      const interval = form.reportInterval === '' ? null : Number(form.reportInterval);
      if (interval !== (device.reportInterval?.own ?? null)) await put(`/api/devices/${device.id}/report-interval`, { seconds: interval });
    }
    if (alerts?.length) {
      const body = {};
      for (const a of alerts) {
        body[a.key] = { enabled: a.enabled };
        for (const p of a.params) body[a.key][p.key] = p.value === '' || p.value === null || p.value === undefined ? null : Number(p.value);
      }
      await put(`/api/devices/${device.id}/alerts`, { alerts: body });
    }
    if (canClock) {
      const hours = clock.manual ? Number(clock.hours || 0) : null;
      const before = device.clock?.mode === 'manual' ? device.clock.offsetHours : null;
      if (hours !== before) await put(`/api/devices/${device.id}/clock`, { hours });
    }
    if (canAssign) {
      const [planCode, term] = needsPlan ? plan.plan.split(':') : [];
      await patch(`/api/devices/${device.id}/assignment`, { vehicleId: assign.vehicleId || null, endCustomerId: assign.endCustomerId || null, driverId: assign.driverId || undefined, ...(needsPlan ? { planCode, term, allowPending: plan.allowPending, free: plan.free || undefined } : {}) });
    }
    await onSaved?.();
    onClose();
  });
  return (
    <Modal title={`Editar · ${device.name}`} onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn primary" disabled={busy || (needsPlan && !plan.plan)} onClick={save} >{busy ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="form-grid">
        <Field label="Nombre en el mapa"><input value={form.displayName} onChange={set('displayName')} placeholder="Ej.: Camión 12 — Pedro" /></Field>
        <Field label="Tipo de activo"><select value={form.iconKey} onChange={set('iconKey')}>{ICON_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
        {!basic && <Field label="Modelo del GPS"><input value={form.model} onChange={set('model')} /></Field>}
        {!basic && <Field label="Número de SIM"><input value={form.simNumber} onChange={set('simNumber')} /></Field>}
        {!basic && <Field label="Intervalo de reporte (segundos)" hint={`Cada cuántos segundos manda su posición el GPS. Se envía al equipo al guardar. Vacío = ${device.reportInterval?.source === 'company' ? 'el de la empresa' : 'el normal'} (${device.reportInterval?.seconds ?? 10} s). Menos segundos = mapa más fino, pero más datos y batería.`}><input type="number" min="5" max="3600" value={form.reportInterval} onChange={set('reportInterval')} placeholder={String(device.reportInterval?.seconds ?? 10)} /></Field>}
        <Field label="Notas" wide><textarea rows="2" value={form.notes} onChange={set('notes')} /></Field>
        {canClock && (
          <div className="wide clock-box">
            <span className="plan-title">Hora del GPS</span>
            <label className="check"><input type="radio" name="clockmode" checked={!clock.manual} onChange={() => setClock({ ...clock, manual: false })} /> <span><b>Automática (recomendado).</b> Si el equipo manda la hora corrida (por ejemplo 8 horas atrás), se detecta y se corrige sola.</span></label>
            <label className="check"><input type="radio" name="clockmode" checked={clock.manual} onChange={() => setClock({ ...clock, manual: true })} /> <span><b>Manual:</b> sumar horas a la hora que manda el equipo (0 = no corregir nunca).</span></label>
            {clock.manual && <Field label="Horas a sumar (−14 a 14)"><input type="number" step="0.5" min="-14" max="14" value={clock.hours} onChange={(e) => setClock({ ...clock, hours: e.target.value })} /></Field>}
          </div>
        )}
        <div className="wide alert-box">
          <span className="plan-title">Alertas de este GPS</span>
          <small className="muted block">Enciende solo las que quieres recibir. Una alerta apagada no genera aviso ni evento; el recorrido y el historial no cambian.</small>
          {!alerts && <p className="muted">Cargando alertas…</p>}
          <ul className="alert-list">{(alerts || []).map((a) => (
            <li key={a.key} className={a.enabled ? 'on' : ''}>
              <label className="switch"><input type="checkbox" checked={a.enabled} onChange={(e) => setAlert(a.key, { enabled: e.target.checked })} aria-label={a.label} /><span className="slider" /></label>
              <div className="alert-main"><b>{a.label}</b><small className="muted">{a.description}</small></div>
              {a.params.map((p) => <label key={p.key} className="alert-param">{p.label}<input type="number" min={p.min} max={p.max} value={p.value ?? ''} placeholder={a.key === 'overspeed' ? 'Sin límite' : ''} disabled={!a.enabled} onChange={(e) => setParam(a.key, p.key, e.target.value)} /></label>)}
            </li>
          ))}</ul>
        </div>
        <DeviceWhatsapp device={device} />
        {canAssign && (
          <>
            <Field label="Vehículo"><select value={assign.vehicleId} onChange={(e) => setAssign({ ...assign, vehicleId: e.target.value })}><option value="">Sin vehículo</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` · ${v.plate}` : ''}</option>)}</select></Field>
            <Field label="Conductor (del vehículo)"><select value={assign.driverId} onChange={(e) => setAssign({ ...assign, driverId: e.target.value })}><option value="">No cambiar</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Cliente final" wide><select value={assign.endCustomerId} onChange={(e) => setAssign({ ...assign, endCustomerId: e.target.value })}><option value="">Sin cliente final</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            {needsPlan && <div className="wide"><span className="plan-title">Plan del GPS para este cliente final {device.companyIsPrimary ? '(tu empresa principal: sin cargo)' : `(se descuenta de los créditos de ${device.companyName || 'la empresa'})`}</span><PlanPicker companyId={device.companyId} value={plan.plan} allowPending={plan.allowPending} free={plan.free} primary={device.companyIsPrimary} canWaive={me.role === 'platform_admin'} onChange={setPlan} /></div>}
          </>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

// ---- Mantenimiento
export function MaintenanceModal({ device, onClose, onChanged }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ name: '', everyKm: '', everyDays: '' });
  const { busy, error, run } = useAction();
  const load = () => get(`/api/devices/${device.id}/maintenance`).then(setPlans).catch(() => undefined);
  useEffect(() => { load(); }, [device.id]);
  const add = () => run(async () => { await post(`/api/devices/${device.id}/maintenance`, { name: form.name, everyKm: form.everyKm ? Number(form.everyKm) : null, everyDays: form.everyDays ? Number(form.everyDays) : null }); setForm({ name: '', everyKm: '', everyDays: '' }); load(); onChanged?.(); });
  const done = (id) => run(async () => { await post(`/api/maintenance/${id}/done`, {}); load(); onChanged?.(); });
  const remove = (id) => run(async () => { await del(`/api/maintenance/${id}`); load(); onChanged?.(); });
  return (
    <Modal title={`Mantenimiento · ${device.name}`} onClose={onClose}>
      <p className="muted">Odómetro actual: <b>{Number(device.live.odometerKm || 0).toLocaleString('es-DO')} km</b>. Se avisa cuando falten 200 km o 7 días.</p>
      <ul className="plain">{plans.map((p) => <li key={p.id}><span><b>{p.name}</b> · cada {p.every_km ? `${p.every_km} km` : ''}{p.every_km && p.every_days ? ' o ' : ''}{p.every_days ? `${p.every_days} días` : ''}<br /><small className="muted">{p.kmLeft != null ? `Faltan ${Math.max(0, Math.round(p.kmLeft))} km` : ''}{p.kmLeft != null && p.daysLeft != null ? ' · ' : ''}{p.daysLeft != null ? `${p.daysLeft} días` : ''}</small></span><span><button type="button" className="btn small" onClick={() => done(p.id)}>Hecho hoy</button> <button type="button" className="btn small danger" onClick={() => remove(p.id)}>Quitar</button></span></li>)}{!plans.length && <li className="muted">Sin planes de mantenimiento.</li>}</ul>
      <h4>Nuevo plan</h4>
      <div className="form-grid">
        <Field label="Qué" wide><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cambio de aceite" /></Field>
        <Field label="Cada (km)"><input type="number" value={form.everyKm} onChange={(e) => setForm({ ...form, everyKm: e.target.value })} /></Field>
        <Field label="Cada (días)"><input type="number" value={form.everyDays} onChange={(e) => setForm({ ...form, everyDays: e.target.value })} /></Field>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy || form.name.length < 2 || (!form.everyKm && !form.everyDays)} onClick={add}>Agregar</button></div>
    </Modal>
  );
}
