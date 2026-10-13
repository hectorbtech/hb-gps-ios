import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { del, get, getFull, post, put, qs } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { EVENT_LABELS, SEVERITY, ago, dateTime, deviceName, localInput } from '../lib/format.js';
import { Badge, Empty, Field, Modal, Tabs, useAction } from '../components/ui.jsx';

const ALERT_TYPES = ['overspeed', 'geofenceEnter', 'geofenceExit', 'routeDeviation', 'ignitionOn', 'ignitionOff', 'deviceOffline', 'idleLong', 'lowBattery', 'powerCut', 'powerRestored', 'lowVoltage', 'sos', 'tow', 'maintenanceDue', 'harshBraking', 'harshAcceleration'];
const CHANNELS = [['in_app', 'Portal y app'], ['whatsapp', 'WhatsApp'], ['email', 'Correo']];
const RANGES = [['24h', 'Últimas 24 h', 24], ['7d', '7 días', 24 * 7], ['30d', '30 días', 24 * 30]];

function EventsTable() {
  const { devices, events: live, companyId, me } = useFleet();
  const [filters, setFilters] = useState({ severity: '', type: '', deviceId: '', range: '24h' });
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const canAck = me.role !== 'viewer';

  const fetchRows = useCallback(async (before) => {
    const hours = RANGES.find((r) => r[0] === filters.range)[2];
    const params = { companyId, severity: filters.severity, type: filters.type, deviceId: filters.deviceId, from: new Date(Date.now() - hours * 3600_000).toISOString(), to: new Date().toISOString(), limit: 100, before };
    return (await getFull(`/api/events${qs(params)}`)).data;
  }, [filters, companyId]);

  const reload = useCallback(async () => {
    setBusy(true);
    try { const data = await fetchRows(); setRows(data); setMore(data.length === 100); } finally { setBusy(false); }
  }, [fetchRows]);
  useEffect(() => { reload().catch(() => undefined); }, [reload, live.length]); // llega un evento en vivo → se refresca la lista

  const loadMore = async () => { const data = await fetchRows(rows.at(-1)?.event_time); setRows((r) => [...r, ...data]); setMore(data.length === 100); };
  const ack = async (id) => { await post(`/api/events/${id}/ack`, {}); setRows((r) => r.map((e) => (e.id === id ? { ...e, ack_at: new Date().toISOString() } : e))); };
  const set = (key) => (event) => setFilters((f) => ({ ...f, [key]: event.target.value }));

  return (
    <>
      <div className="filters">
        <label>Gravedad<select value={filters.severity} onChange={set('severity')}><option value="">Todas</option>{Object.entries(SEVERITY).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}</select></label>
        <label>Tipo<select value={filters.type} onChange={set('type')}><option value="">Todos</option>{Object.entries(EVENT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>GPS<select value={filters.deviceId} onChange={set('deviceId')}><option value="">Todos</option>{devices.map((d) => <option key={d.id} value={d.id}>{deviceName(d)}</option>)}</select></label>
        <label>Periodo<select value={filters.range} onChange={set('range')}>{RANGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Cuándo</th><th>GPS</th><th>Qué pasó</th><th>Gravedad</th><th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.severity === 'critical' && !e.ack_at ? 'row-critical' : ''}>
                <td title={dateTime(e.event_time)}>{ago(e.event_time)}<small className="muted block">{dateTime(e.event_time)}</small></td>
                <td>{e.device_name}</td>
                <td><b>{EVENT_LABELS[e.event_type] || e.event_type}</b><small className="muted block">{e.message}</small></td>
                <td><Badge tone={e.severity === 'critical' ? 'red' : e.severity === 'warning' ? 'amber' : 'blue'}>{(SEVERITY[e.severity] || SEVERITY.info).label}</Badge></td>
                <td className="actions">
                  {e.latitude != null && <a className="btn small" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`}>Ver lugar</a>}
                  {canAck && e.severity !== 'info' && (e.ack_at ? <small className="muted">Atendido</small> : <button type="button" className="btn small" onClick={() => ack(e.id)}>Atender</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !busy && <Empty icon="✅" title="Sin eventos en este periodo" />}
      </div>
      {more && <div className="center"><button type="button" className="btn" onClick={loadMore}>Cargar más</button></div>}
    </>
  );
}

function AlertForm({ rule, devices, canWrite, onClose, onSaved, companyId }) {
  const { me } = useFleet();
  const [form, setForm] = useState(() => rule ? { name: rule.name, eventType: rule.event_type, deviceId: rule.device_id || (me.role === 'end_customer' ? devices[0]?.id || '' : ''), channels: rule.channels || ['in_app'], whatsappPhone: rule.whatsapp_phone || '', emails: (rule.config?.emails || []).join(', '), thresholdKph: rule.config?.thresholdKph || '', minutes: rule.config?.minutes || '', enabled: rule.enabled } : { name: '', eventType: 'overspeed', deviceId: me.role === 'end_customer' ? devices[0]?.id || '' : '', channels: ['in_app'], whatsappPhone: '', emails: '', thresholdKph: '', minutes: '', enabled: true });
  const { busy, error, run } = useAction();
  const toggle = (id) => setForm((f) => ({ ...f, channels: f.channels.includes(id) ? f.channels.filter((c) => c !== id) : [...f.channels, id] }));
  const save = () => run(async () => {
    const config = {};
    if (form.thresholdKph) config.thresholdKph = Number(form.thresholdKph);
    if (form.minutes) config.minutes = Number(form.minutes);
    if (form.channels.includes('email') && form.emails.trim()) config.emails = form.emails.split(/[,\s]+/).filter(Boolean);
    const body = { name: form.name.trim(), eventType: form.eventType, deviceId: form.deviceId || null, channels: form.channels, whatsappPhone: form.channels.includes('whatsapp') ? form.whatsappPhone : undefined, enabled: form.enabled, config, companyId: companyId || undefined };
    if (rule) await put(`/api/alerts/${rule.id}`, body); else await post('/api/alerts', body);
    await onSaved();
  });
  return (
    <Modal title={rule ? 'Editar alerta' : 'Nueva alerta'} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn primary" disabled={busy || form.name.trim().length < 2 || !form.channels.length} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="form-grid">
        <Field label="Nombre" wide><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej.: Exceso de velocidad en camiones" /></Field>
        <Field label="Cuando ocurra"><select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>{ALERT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABELS[t] || t}</option>)}</select></Field>
        <Field label="En qué GPS"><select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>{me.role !== 'end_customer' && <option value="">Todos los GPS</option>}{devices.map((d) => <option key={d.id} value={d.id}>{deviceName(d)}</option>)}</select></Field>
        {form.eventType === 'overspeed' && <Field label="Velocidad (km/h)" hint="Vacío = límite del GPS o de la empresa."><input type="number" min="10" max="250" value={form.thresholdKph} onChange={(e) => setForm({ ...form, thresholdKph: e.target.value })} /></Field>}
        {['idleLong', 'deviceOffline'].includes(form.eventType) && <Field label="Minutos" hint="Cuánto tiempo antes de avisar."><input type="number" min="1" max="1440" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></Field>}
      </div>
      <fieldset className="action-box"><legend>Avisar por</legend>
        <div className="check-row">{CHANNELS.map(([id, label]) => <label key={id} className="check"><input type="checkbox" checked={form.channels.includes(id)} onChange={() => toggle(id)} /> {label}</label>)}</div>
        {form.channels.includes('whatsapp') && <Field label="WhatsApp (con código de país)"><input value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} placeholder="18095550123" /></Field>}
        {form.channels.includes('email') && <Field label="Correos (coma)" hint="Vacío = administradores de la empresa."><input value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} /></Field>}
      </fieldset>
      <label className="check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Alerta activa</label>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function Alerts() {
  const { devices, me, companyId } = useFleet();
  const [rules, setRules] = useState([]);
  const [editing, setEditing] = useState(null);
  const canWrite = me.role !== 'viewer';
  const load = useCallback(() => get(`/api/alerts${qs({ companyId })}`).then(setRules), [companyId]);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const remove = async (rule) => { if (!window.confirm(`¿Eliminar la alerta «${rule.name}»?`)) return; await del(`/api/alerts/${rule.id}`); load(); };
  return (
    <>
      <p className="hint">Los eventos importantes (SOS, corte de energía, desvíos de ruta, exceso de velocidad) ya avisan en el portal automáticamente. Aquí agregas avisos extra por WhatsApp o correo, o para un GPS en particular.</p>
      {canWrite && <button type="button" className="btn primary" onClick={() => setEditing({})}>+ Nueva alerta</button>}
      <ul className="cards">
        {rules.map((r) => (
          <li key={r.id} className="card-row">
            <div><b>{r.name}</b><small className="muted block">{EVENT_LABELS[r.event_type] || r.event_type} · {r.device_name || 'todos los GPS'} · {r.channels.map((c) => CHANNELS.find(([id]) => id === c)?.[1]).join(', ')}</small></div>
            <div className="row-actions">{!r.enabled && <Badge>Pausada</Badge>}{canWrite && <><button type="button" className="btn small" onClick={() => setEditing(r)}>Editar</button><button type="button" className="btn small danger" onClick={() => remove(r)}>Eliminar</button></>}</div>
          </li>
        ))}
        {!rules.length && <Empty icon="🔕" title="Sin alertas personalizadas" />}
      </ul>
      {editing && <AlertForm rule={editing.id ? editing : null} devices={devices} canWrite={canWrite} companyId={companyId} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </>
  );
}

export default function EventsPage() {
  const [tab, setTab] = useState('events');
  return (
    <div className="page">
      <Tabs value={tab} onChange={setTab} tabs={[['events', 'Historial de eventos'], ['alerts', 'Alertas personalizadas']]} />
      {tab === 'events' ? <EventsTable /> : <Alerts />}
    </div>
  );
}
