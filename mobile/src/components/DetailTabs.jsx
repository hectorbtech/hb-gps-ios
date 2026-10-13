import React, { useCallback, useEffect, useState } from 'react';
import { ATTRIBUTE_LABELS } from '@portal/lib/places.js';
import { EVENT_LABELS, ICON_OPTIONS, SERVICE_LABELS, COMMAND_STATUS, REJECT_LABELS, cadenceText, compass, precisionText, dateTime, deviceName, duration, km } from '@portal/lib/format.js';
import { del, explain, get, post, put } from '../lib/api.js';
import { useAddress } from '../lib/address.js';
import { AddressRows, PlaceActions } from './Place.jsx';
import { Icon, Modal, ageLabel } from './ui.jsx';

const Kv = ({ label, children }) => (children == null || children === '' || children === false ? null : <div className="kv"><span>{label}</span><b>{children}</b></div>);
const SEV_COLOR = { critical: '#dc2626', warning: '#f59e0b', info: '#8a96a8' };
const rssiBars = (v) => (v == null ? null : `${'▂▄▆█'.slice(0, Math.max(1, Math.min(4, Math.round(Number(v)))))} (${Math.min(4, Math.round(Number(v)))}/4)`);

// ---------- Resumen
export function SummaryTab({ device, d, onTab, onHistory }) {
  const live = device.live;
  const t = d.today;
  return (
    <>
      {device.driverName && (
        <div className="drow" style={{ padding: '10px 0', borderBottom: '1px solid #eef1f6' }}>
          <div className="vic sm t-blue"><Icon name="user" color="#1d4ed8" /></div>
          <div className="flex1"><div className="nm ell" style={{ fontSize: 15 }}>{device.driverName}</div><div className="sb ell">Conductor{device.driverPhone ? ` · ${device.driverPhone}` : ''}</div></div>
          {device.driverPhone && <a className="chip flat" href={`tel:${device.driverPhone}`}>Llamar</a>}
        </div>
      )}
      <div className="h">Hoy</div>
      {t ? (
        <div className="tiles c3">
          <div className="tile"><b>{km(t.distanceKm)}</b><span>recorridos</span></div>
          <div className="tile"><b>{Math.round(t.maxSpeedKph || 0)} km/h</b><span>máxima</span></div>
          <div className="tile"><b>{duration(t.movingSeconds)}</b><span>en movimiento</span></div>
          <div className="tile"><b>{duration(t.idleSeconds)}</b><span>ralentí</span></div>
          <div className="tile"><b>{t.trips}</b><span>viajes</span></div>
          <div className="tile"><b>{t.stops}</b><span>paradas</span></div>
        </div>
      ) : <p className="muted" style={{ fontWeight: 600 }}>Calculando…</p>}
      <button type="button" className="link" onClick={() => onHistory(device.id)}>Ver el recorrido de hoy</button>
      <Kv label="Odómetro (acumulado)">{live.odometerKm != null ? km(live.odometerKm, 0) : null}</Kv>
      <Kv label="Límite de velocidad">{device.speedLimitKph ? `${device.speedLimitKph} km/h` : 'Sin límite'}</Kv>
      {d.maintenance?.length > 0 && <button type="button" className="link" onClick={() => onTab('maintenance')}>{d.maintenance.length} plan{d.maintenance.length === 1 ? '' : 'es'} de mantenimiento · ver</button>}
      <div className="h">Últimos eventos</div>
      {(d.recentEvents || []).map((e) => (
        <div key={e.id} className="kv" style={{ alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><i style={{ width: 9, height: 9, borderRadius: 5, background: SEV_COLOR[e.severity] || SEV_COLOR.info, marginTop: 6, flex: 'none' }} /><span><b style={{ display: 'block', color: '#0b1f3a', textAlign: 'left' }}>{EVENT_LABELS[e.event_type] || e.event_type}</b>{e.message}</span></span>
          <b style={{ whiteSpace: 'nowrap', color: '#7a879b', fontWeight: 600 }}>{ageLabel(e.event_time)}</b>
        </div>
      ))}
      {d.recentEvents?.length === 0 && <p className="muted" style={{ fontWeight: 600 }}>Sin eventos recientes.</p>}
    </>
  );
}

// ---------- Ubicación
export function LocationTab({ device }) {
  const live = device.live;
  const place = useAddress(live.lat, live.lon, { detail: true });
  if (live.lat == null) return <div className="empty"><b>Sin ubicación todavía</b>Este GPS aún no ha mandado su primera posición.</div>;
  return (
    <>
      <AddressRows details={place.details} line={place.line || live.address} loading={place.loading} />
      <Kv label="Coordenadas">{`${live.lat.toFixed(6)}, ${live.lon.toFixed(6)}`}</Kv>
      <Kv label="Velocidad y rumbo">{`${Math.round(live.speedKph)} km/h · ${compass(live.course)}${live.course != null ? ` (${Math.round(live.course)}°)` : ''}`}</Kv>
      <Kv label="Último dato del GPS">{`${dateTime(live.at)} (${ageLabel(live.at)})`}</Kv>
      <Kv label="Última conexión al servidor">{live.seenAt ? ageLabel(live.seenAt) : null}</Kv>
      <PlaceActions lat={live.lat} lon={live.lon} line={place.line || live.address} name={deviceName(device)} />
    </>
  );
}

// ---------- Equipo: asignación, señal, licencia y datos técnicos
export function DeviceTab({ device, d }) {
  const live = device.live;
  const lp = d.lastPosition;
  const clock = d.clock || device.clock;
  const attrs = Object.entries(lp?.attributes || {}).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !k.startsWith('hb'));
  const known = attrs.filter(([k]) => ATTRIBUTE_LABELS[k] && !['sat', 'ignition'].includes(k));
  const others = attrs.filter(([k]) => !ATTRIBUTE_LABELS[k]);
  const ri = device.reportInterval;
  const lic = device.license;
  const lag = lp ? Math.round(lp.lagSeconds / 60) : 0;
  const powerCut = live.powerConnected === false && !(live.voltage >= 10);
  return (
    <>
      <div className="h" style={{ marginTop: 6 }}>Asignación</div>
      <Kv label="Vehículo">{[device.vehicleName, device.plate].filter(Boolean).join(' · ')}</Kv>
      <Kv label="Tipo">{ICON_OPTIONS.find(([k]) => k === device.iconKey)?.[1]}</Kv>
      <Kv label="Conductor">{[device.driverName, device.driverPhone].filter(Boolean).join(' · ')}</Kv>
      <Kv label="Cliente final">{device.endCustomerName}</Kv>
      <Kv label="Empresa">{device.companyName}</Kv>
      {device.notes && <Kv label="Notas">{device.notes}</Kv>}

      <div className="h">Estado del equipo</div>
      <Kv label="Alimentación del vehículo">{live.powerConnected == null ? null : powerCut ? 'Cortada (usa su batería interna)' : 'Conectada'}</Kv>
      <Kv label="Voltaje del vehículo">{live.voltage != null ? `${Number(live.voltage).toFixed(1)} V` : null}</Kv>
      <Kv label="Batería del GPS">{live.battery != null ? `${Math.round(live.battery)} %` : null}</Kv>
      <Kv label="Señal celular">{rssiBars(live.rssi)}</Kv>
      <Kv label="Motor">{live.ignition == null ? null : live.ignition ? 'Encendido' : 'Apagado'}</Kv>
      {device.engineState === 'cut' && <Kv label="Corte de motor"><span className="c-red">Apagado a distancia</span></Kv>}
      <Kv label="Intervalo de reporte">{ri ? `${ri.seconds} s${ri.explicit ? (ri.applied ? ' · enviado al GPS' : ' · pendiente (el GPS lo recibe al conectarse)') : ' · normal'}` : null}</Kv>
      <Kv label="Hora del GPS">{clock?.mode === 'auto' ? `Corregida sola (${clock.offsetHours > 0 ? '+' : ''}${clock.offsetHours} h)` : clock?.mode === 'manual' ? (clock.offsetHours === 0 ? 'Sin corrección' : `Ajuste manual de ${clock.offsetHours > 0 ? '+' : ''}${clock.offsetHours} h`) : 'Normal'}</Kv>

      <div className="h">Identificación</div>
      <Kv label="IMEI">{device.imei}</Kv>
      <Kv label="Modelo">{device.model}</Kv>
      <Kv label="Protocolo">{device.protocol && device.protocol !== 'auto' ? `${device.protocol.toUpperCase()}${device.protocolDetected ? ' (detectado solo)' : ''}` : 'Por detectar'}</Kv>
      <Kv label="Número de SIM">{device.simNumber}</Kv>

      <div className="h">Servicio</div>
      <Kv label="Estado">{SERVICE_LABELS[lic?.service] || lic?.service}</Kv>
      <Kv label="Plan">{lic?.plan ? (lic.plan === 'plus' ? 'Plus' : 'Basic') : null}</Kv>
      <Kv label="Vigencia">{lic?.term === 'lifetime' ? 'De por vida' : lic?.expiresAt ? `hasta ${dateTime(lic.expiresAt)}` : null}</Kv>

      <div className="h">Datos técnicos</div>
      {lp ? (
        <>
          <Kv label="Hora del dato">{`${dateTime(lp.fixTime)} (${ageLabel(lp.fixTime)})`}</Kv>
          <Kv label="Llegó al servidor">{lag >= 5 ? `${ageLabel(lp.receivedAt)} · ${lag >= 120 ? `${Math.round(lag / 60)} h` : `${lag} min`} después de la hora del GPS` : ageLabel(lp.receivedAt)}</Kv>
          <Kv label="Ubicación">{lp.valid ? 'Válida (con satélites)' : 'Sin fix de satélites: no es confiable'}</Kv>
          <Kv label="Satélites">{lp.satellites ?? lp.attributes?.sat}</Kv>
          <Kv label="Precisión del punto">{precisionText(d.live?.quality, d.live?.accuracyM)}</Kv>
          <Kv label="Último punto descartado">{lp.attributes?.hbRejected ? REJECT_LABELS[lp.attributes.hbRejected] || lp.attributes.hbRejected : null}</Kv>
          <Kv label="Cada cuánto reporta">{cadenceText(d.cadence)}</Kv>
          <Kv label="Altitud">{lp.altitude != null ? `${Math.round(lp.altitude)} m` : null}</Kv>
          <Kv label="Paquetes en 26 h">{d.packets ? `${d.packets.last26h} recibidos · ${d.packets.good} con ubicación válida` : null}</Kv>
          {known.map(([k, v]) => <Kv key={k} label={ATTRIBUTE_LABELS[k][0]}>{ATTRIBUTE_LABELS[k][1](v)}</Kv>)}
          {others.length > 0 && <details style={{ marginTop: 6 }}><summary className="link" style={{ cursor: 'pointer' }}>Otros datos que manda el equipo ({others.length})</summary>{others.map(([k, v]) => <Kv key={k} label={k}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</Kv>)}</details>}
        </>
      ) : <p className="muted" style={{ fontWeight: 600 }}>Todavía no ha mandado datos.</p>}
    </>
  );
}

// ---------- Alertas del GPS (encender o apagar cada una) y zonas que lo vigilan
export function AlertsTab({ device, d, canEdit, say }) {
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { get(`/api/devices/${device.id}/alerts`).then(setRules).catch(() => setRules([])); }, [device.id]);
  const toggle = async (rule) => {
    setBusy(rule.key);
    try { setRules(await put(`/api/devices/${device.id}/alerts`, { alerts: { [rule.key]: { enabled: !rule.enabled } } }).then((r) => r.data)); say(rule.enabled ? 'Alerta apagada' : 'Alerta encendida'); } catch (err) { say(explain(err)); } finally { setBusy(''); }
  };
  return (
    <>
      <p className="muted" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45, margin: '4px 0 8px' }}>Enciende solo las alertas que quieres recibir de este GPS. Una alerta apagada no genera aviso; el recorrido y el historial no cambian.</p>
      {(rules || []).map((r) => (
        <div key={r.key} className="switchrow off" style={{ marginBottom: 8, background: r.enabled ? '#f3f9f4' : 'var(--tile)', borderColor: r.enabled ? '#cfe7d4' : 'var(--line)' }}>
          <button type="button" role="switch" aria-checked={r.enabled} aria-label={r.label} disabled={!canEdit || busy === r.key} className={`sw${r.enabled ? '' : ' off'}`} style={{ background: r.enabled ? '#16a34a' : undefined }} onClick={() => toggle(r)}><i /></button>
          <div><b>{r.label}</b><span>{r.description}{r.enabled && r.params.filter((p) => p.value != null).map((p) => ` · ${p.label.replace(/\s*\(.*\)/, '')}: ${p.value} ${p.unit}`).join('')}</span></div>
        </div>
      ))}
      {rules === null && <p className="muted" style={{ fontWeight: 600 }}>Cargando…</p>}
      {(d.geofences?.length > 0 || d.routes?.length > 0) && (
        <>
          <div className="h">Zonas y rutas que lo vigilan</div>
          {d.geofences?.map((g) => <div key={g.id} className="kv"><span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: g.color, marginRight: 8 }} />Geovalla</span><b>{g.name}</b></div>)}
          {d.routes?.map((r) => <div key={r.id} className="kv"><span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: r.color, marginRight: 8 }} />Ruta segura</span><b>{r.name}{r.origin_label ? ` · ${r.origin_label} → ${r.destination_label || ''}` : ''}</b></div>)}
        </>
      )}
      {d.recentCommands?.length > 0 && (
        <>
          <div className="h">Últimas órdenes</div>
          {d.recentCommands.map((c) => <div key={c.id} className="kv"><span>{dateTime(c.created_at)}</span><b>{c.type === 'engineStop' ? 'Apagar motor' : c.type === 'engineResume' ? 'Restablecer motor' : c.type === 'positionSingle' ? 'Pedir ubicación' : c.type} · {COMMAND_STATUS[c.status] || c.status}</b></div>)}
        </>
      )}
    </>
  );
}

// ---------- Mantenimiento
export function MaintenanceTab({ device, canEdit, say, reload }) {
  const [plans, setPlans] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => get(`/api/devices/${device.id}/maintenance`).then(setPlans).catch(() => setPlans([])), [device.id]);
  useEffect(() => { load(); }, [load]);
  const done = async (id) => { try { await post(`/api/maintenance/${id}/done`, {}); say('Mantenimiento marcado como hecho'); load(); reload?.(); } catch (err) { say(explain(err)); } };
  const remove = async (id) => { try { await del(`/api/maintenance/${id}`); say('Plan quitado'); load(); reload?.(); } catch (err) { say(explain(err)); } };
  const odometer = Number(device.live.odometerKm || 0);
  return (
    <>
      <p className="muted" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45, margin: '4px 0 8px' }}>Odómetro actual: <b>{odometer.toLocaleString('es-DO', { maximumFractionDigits: 0 })} km</b>. Se avisa cuando faltan 200 km o 7 días.</p>
      {(plans || []).map((p) => {
        const late = (p.kmLeft != null && p.kmLeft <= 0) || (p.daysLeft != null && p.daysLeft <= 0);
        return (
          <div key={p.id} className="selcard" style={{ marginTop: 0, marginBottom: 8, background: late ? '#fff5f5' : 'var(--tile)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontWeight: 800 }}>{p.name}</b>{late && <span className="tag red">Vencido</span>}</div>
            <div className="muted" style={{ fontWeight: 600, fontSize: 12.5, marginTop: 2 }}>Cada {p.every_km ? `${p.every_km} km` : ''}{p.every_km && p.every_days ? ' o ' : ''}{p.every_days ? `${p.every_days} días` : ''}{p.kmLeft != null ? ` · faltan ${Math.max(0, Math.round(p.kmLeft))} km` : ''}{p.daysLeft != null ? ` · ${Math.max(0, p.daysLeft)} días` : ''}</div>
            {canEdit && <div className="actions" style={{ marginTop: 8 }}><button type="button" className="act" style={{ height: 38 }} onClick={() => done(p.id)}>Hecho hoy</button><button type="button" className="act" style={{ height: 38 }} onClick={() => remove(p.id)}><Icon name="trash" size={15} />Quitar</button></div>}
          </div>
        );
      })}
      {plans?.length === 0 && <div className="empty"><b>Sin planes de mantenimiento</b>Agrega uno (cambio de aceite, llantas…) y la app te avisa cuando toque.</div>}
      {canEdit && <button type="button" className="act p" style={{ width: '100%', marginTop: 8 }} onClick={() => setAdding(true)}><Icon name="plus" size={17} />Nuevo plan</button>}
      {adding && <PlanForm device={device} onClose={() => setAdding(false)} onDone={() => { setAdding(false); say('Plan agregado'); load(); reload?.(); }} />}
    </>
  );
}

function PlanForm({ device, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', everyKm: '', everyDays: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => { setBusy(true); setError(''); try { await post(`/api/devices/${device.id}/maintenance`, { name: form.name.trim(), everyKm: form.everyKm ? Number(form.everyKm) : null, everyDays: form.everyDays ? Number(form.everyDays) : null }); onDone(); } catch (err) { setError(explain(err)); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19, fontWeight: 800 }}>Nuevo plan de mantenimiento</h2>
      <label><span className="lab">Qué</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cambio de aceite" /></label>
      <div className="row"><label className="flex1"><span className="lab">Cada (km)</span><input className="input" type="number" inputMode="numeric" value={form.everyKm} onChange={(e) => setForm({ ...form, everyKm: e.target.value })} /></label><label className="flex1"><span className="lab">Cada (días)</span><input className="input" type="number" inputMode="numeric" value={form.everyDays} onChange={(e) => setForm({ ...form, everyDays: e.target.value })} /></label></div>
      {error && <div className="callout red" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="act" onClick={onClose}>Cancelar</button><button type="button" className="act p" disabled={busy || form.name.trim().length < 2 || (!form.everyKm && !form.everyDays)} onClick={save}>{busy ? 'Guardando…' : 'Agregar'}</button></div>
    </Modal>
  );
}
