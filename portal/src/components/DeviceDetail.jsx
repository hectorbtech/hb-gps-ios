import React, { useEffect, useState } from 'react';
import { explain, get, post } from '../lib/api.js';
import { ATTRIBUTE_LABELS } from '../lib/places.js';
import { AddressRows, PlaceActions } from './Place.jsx';
import { SERVICE_LABELS, STATUS, SEVERITY, EVENT_LABELS, REJECT_LABELS, ago, cadenceText, compass, precisionText, dateTime, deviceName, duration, km, kph } from '../lib/format.js';
import { Badge, DeviceIcon } from './ui.jsx';
import { CommandsModal, EditDeviceModal, MaintenanceModal, ShareModal } from './DeviceModals.jsx';

const Row = ({ label, children }) => <div className="kv"><span>{label}</span><b>{children ?? '—'}</b></div>;

// Panel con TODO lo que se sabe del GPS seleccionado: estado en vivo, datos del equipo, resumen de hoy, zonas, eventos y acciones.
export default function DeviceDetail({ device, me, follow, onFollow, onHistory, onClose, onChanged, minimized = false, onMinimize }) {
  const [detail, setDetail] = useState(null);
  const [loc, setLoc] = useState(null);
  const [repair, setRepair] = useState({ busy: false, text: '' });
  const [modal, setModal] = useState(null);
  const canCommand = me.role !== 'viewer';
  const canEdit = me.role !== 'viewer';
  const canMaintain = ['platform_admin', 'reseller_admin', 'company_admin', 'operator'].includes(me.role);

  const loadDetail = () => get(`/api/devices/${device.id}`).then(setDetail).catch(() => undefined);
  useEffect(() => { setDetail(null); setLoc(null); setRepair({ busy: false, text: '' }); loadDetail(); const timer = setInterval(loadDetail, 30000); return () => clearInterval(timer); }, [device.id]);
  // La dirección se pide cuando el vehículo se detiene o cambia de lugar de forma notable, no en cada posición.
  const place = device.live.lat != null ? `${device.live.lat.toFixed(3)},${device.live.lon.toFixed(3)}` : null;
  useEffect(() => { if (place) get(`/api/devices/${device.id}/location`).then(setLoc).catch(() => setLoc({ address: null, details: null })); }, [device.id, place]);

  const live = device.live;
  const status = STATUS[live.status] || STATUS.no_data;
  const d = detail || {};
  const service = device.license?.service;
  // Conectado, pero el último punto de ubicación es viejo: el GPS manda datos sin posición nueva (sin satélites, modo ahorro) o con la hora mal.
  const seenMs = live.seenAt ? new Date(live.seenAt).getTime() : null;
  const fixMs = live.at ? new Date(live.at).getTime() : null;
  const staleMin = live.online && seenMs && fixMs ? Math.round((seenMs - fixMs) / 60000) : 0;
  const stale = staleMin >= 20 && live.status !== 'offline';
  const powerCut = live.powerConnected === false && !(live.voltage >= 10); // con 10 V o más hay corriente aunque la bandera diga lo contrario
  const clock = d.clock || device.clock;
  const canClock = me.role !== 'end_customer' && canEdit && ['platform_admin', 'reseller_admin', 'company_admin'].includes(me.role);
  const repairHistory = async () => {
    setRepair({ busy: true, text: '' });
    try { const r = await post(`/api/devices/${device.id}/clock/repair-history`, {}); setRepair({ busy: false, text: `Listo: se corrigió la hora de ${r.moved} posiciones del historial.` }); onChanged?.(); loadDetail(); }
    catch (err) { setRepair({ busy: false, text: explain(err) }); }
  };
  const lp = d.lastPosition;
  const attrs = Object.entries(lp?.attributes || {}).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !k.startsWith('hb'));
  const known = attrs.filter(([k]) => ATTRIBUTE_LABELS[k]);
  const others = attrs.filter(([k]) => !ATTRIBUTE_LABELS[k]);
  const lagMin = lp ? Math.round(lp.lagSeconds / 60) : 0;

  // Minimizado: una barra pequeña que deja el mapa libre y el GPS sigue elegido (con prioridad en el mapa).
  if (minimized) {
    return (
      <aside className="detail mini" aria-label={`Resumen de ${deviceName(device)}`} style={{ '--c': status.color }}>
        <DeviceIcon device={device} />
        <div className="mini-main"><b>{deviceName(device)}</b><small><i className="dot" style={{ background: status.color }} /> {status.label} · {Math.round(live.speedKph)} km/h{live.status === 'offline' && live.at ? ` · ${ago(live.at)}` : ''}</small></div>
        <button type="button" className="icon-btn" onClick={onHistory} title="Historial y ruta" aria-label="Historial y ruta">🕘</button>
        <button type="button" className={`icon-btn${follow ? ' on' : ''}`} onClick={() => onFollow(!follow)} title={follow ? 'Dejar de seguir' : 'Seguir en el mapa'} aria-label="Seguir">◎</button>
        <button type="button" className="icon-btn" onClick={() => onMinimize(false)} title="Mostrar todos los detalles" aria-label="Mostrar detalles">⤢</button>
        <button type="button" className="icon-btn" onClick={onClose} title="Quitar selección (deja de tener prioridad)" aria-label="Quitar selección">✕</button>
      </aside>
    );
  }

  return (
    <aside className="detail" aria-label={`Detalles de ${deviceName(device)}`}>
      <header className="detail-head" style={{ '--c': status.color }}>
        <DeviceIcon device={device} />
        <div><h2>{deviceName(device)}</h2><p>{[device.plate, device.vehicleName, device.model].filter(Boolean).join(' · ') || device.imei}</p></div>
        <button type="button" className="icon-btn" onClick={() => onMinimize(true)} title="Minimizar: el GPS sigue elegido en el mapa" aria-label="Minimizar">—</button>
        <button type="button" className="icon-btn" onClick={onClose} title="Quitar selección (deja de tener prioridad)" aria-label="Quitar selección">✕</button>
      </header>

      <div className="detail-status" style={{ '--c': status.color }}>
        <b>{stale ? `${status.label} · sin ubicación nueva` : status.label}</b>
        <span>{live.status === 'moving' ? (live.statusSince ? `en marcha desde ${dateTime(live.statusSince)} (${ago(live.statusSince)})` : '')
          : live.status === 'offline' ? (live.statusSince ? `sin señal desde ${dateTime(live.statusSince)} (${ago(live.statusSince)})` : '')
          : stale ? `última posición ${dateTime(live.at)} (${ago(live.at)}). El GPS está conectado pero no envía posiciones nuevas, así que puede haberse movido sin avisar.`
          : (live.statusSince ? `sin moverse desde ${dateTime(live.statusSince)} (${ago(live.statusSince)})` : 'sin movimientos registrados todavía')}</span>
        {device.engineState === 'cut' && <Badge tone="red">Motor apagado a distancia</Badge>}
        {service && service !== 'active' && <Badge tone={service === 'grace' ? 'amber' : 'red'}>{SERVICE_LABELS[service]}</Badge>}
      </div>

      {clock?.mode === 'auto' && (
        <div className="callout info">
          <b>Hora del GPS corregida: {Math.abs(clock.offsetHours)} h {clock.offsetHours >= 0 ? 'de atraso' : 'de adelanto'}.</b> Este equipo manda sus posiciones con la hora corrida; se corrige sola para que el último dato, «detenido desde» y el historial sean los reales{clock.since ? ` (desde ${dateTime(clock.since)})` : ''}. Lo que ya estaba guardado antes conserva la hora mala hasta que lo repares.
          {canClock && <div className="btn-row"><button type="button" className="btn small" disabled={repair.busy} onClick={repairHistory}>{repair.busy ? 'Reparando…' : 'Reparar el historial anterior'}</button></div>}
          {repair.text && <small className="block">{repair.text}</small>}
        </div>
      )}

      <div className="speedo"><div><b>{Math.round(live.speedKph)}</b><small>km/h</small></div><div><b>{live.ignition == null ? '—' : live.ignition ? 'Encendido' : 'Apagado'}</b><small>motor</small></div><div className={powerCut ? 'bad' : ''}><b>{live.voltage == null ? '—' : `${live.voltage.toLocaleString('es-DO', { maximumFractionDigits: 1 })} V`}</b><small>{powerCut ? 'sin corriente' : 'voltaje vehículo'}</small></div><div><b>{live.battery == null ? '—' : `${Math.round(live.battery)}%`}</b><small>batería GPS</small></div><div><b>{compass(live.course)}</b><small>{live.course != null ? `${Math.round(live.course)}°` : 'rumbo'}</small></div></div>

      <div className="btn-row">
        <button type="button" className="btn primary" onClick={onHistory}>🕘 Historial y ruta</button>
        <button type="button" className={`btn${follow ? ' on' : ''}`} onClick={() => onFollow(!follow)}>{follow ? '◎ Siguiendo' : '◎ Seguir'}</button>
        {me.role !== 'viewer' && <button type="button" className="btn" onClick={() => setModal('share')}>🔗 Compartir</button>}
        {canCommand && <button type="button" className="btn" onClick={() => setModal('commands')}>📡 Comandos</button>}
        {canEdit && <button type="button" className="btn" onClick={() => setModal('edit')}>✎ Editar</button>}
        {canMaintain && <button type="button" className="btn" onClick={() => setModal('maintenance')}>🛠 Mantenimiento</button>}
      </div>

      <section>
        <h4>Ubicación</h4>
        <AddressRows details={loc?.details} line={loc?.address} loading={!loc && live.lat != null} />
        {live.lat == null && <Row label="Dirección">Sin ubicación todavía</Row>}
        <Row label="Coordenadas">{live.lat != null ? `${live.lat.toFixed(6)}, ${live.lon.toFixed(6)}` : null}</Row>
        <Row label="Último dato del GPS">{live.at ? `${dateTime(live.at)} (${ago(live.at)})` : null}</Row>
        <Row label="Última conexión al servidor">{live.seenAt ? ago(live.seenAt) : null}</Row>
        {live.lat != null && <PlaceActions lat={live.lat} lon={live.lon} line={loc?.address} name={deviceName(device)} />}
      </section>

      <section>
        <h4>Hoy</h4>
        {d.today ? (
          <div className="stats">
            <div><b>{km(d.today.distanceKm)}</b><small>recorridos</small></div><div><b>{kph(d.today.maxSpeedKph)}</b><small>máxima</small></div>
            <div><b>{duration(d.today.movingSeconds)}</b><small>en movimiento</small></div><div><b>{duration(d.today.idleSeconds)}</b><small>ralentí</small></div>
            <div><b>{d.today.trips}</b><small>viajes</small></div><div><b>{d.today.stops}</b><small>paradas</small></div>
          </div>
        ) : <p className="muted">Calculando…</p>}
        <Row label="Odómetro (acumulado)">{km(live.odometerKm, 0)}</Row>
      </section>

      <section>
        <h4>Equipo y asignación</h4>
        <Row label="Vehículo">{[device.vehicleName, device.plate].filter(Boolean).join(' · ')}</Row>
        <Row label="Conductor">{device.driverName}{device.driverPhone ? ` · ${device.driverPhone}` : ''}</Row>
        <Row label="Cliente final">{device.endCustomerName}</Row>
        <Row label="Empresa">{device.companyName}</Row>
        <Row label="Límite de velocidad">{device.speedLimitKph ? kph(device.speedLimitKph) : 'Sin límite'}</Row>
        <Row label="Intervalo de reporte">{device.reportInterval ? `${device.reportInterval.seconds} s${device.reportInterval.explicit ? (device.reportInterval.applied ? ' · enviado al GPS' : ' · pendiente de enviar (el GPS lo recibe al conectarse)') : ' · normal'}${device.reportInterval.reported && device.reportInterval.reported !== device.reportInterval.seconds ? ` · el equipo reporta cada ${device.reportInterval.reported} s` : ''}` : null}</Row>
        <Row label="Alimentación del vehículo">{live.powerConnected == null ? null : live.powerConnected ? 'Conectada' : 'Cortada (usa su batería interna)'}</Row>
        <Row label="Señal celular">{live.rssi == null ? null : `${'▂▄▆█'.slice(0, Math.max(0, Math.min(4, live.rssi)))}${'·'.repeat(4 - Math.max(0, Math.min(4, live.rssi)))} (${live.rssi}/4)`}</Row>
        <Row label="IMEI">{device.imei}</Row>
        <Row label="Modelo / protocolo">{[device.model, device.protocol && device.protocol !== 'auto' ? `${device.protocol.toUpperCase()}${device.protocolDetected ? ' (detectado solo)' : ''}` : 'protocolo por detectar'].filter(Boolean).join(' · ')}</Row>
        <Row label="SIM">{device.simNumber}</Row>
        <Row label="Licencia">{device.license?.plan ? `${device.license.plan === 'plus' ? 'Plus' : 'Basic'} · ${device.license.term === 'lifetime' ? 'vitalicia' : `vence ${dateTime(device.license.expiresAt)}`}` : SERVICE_LABELS[service]}</Row>
        {device.notes && <Row label="Notas">{device.notes}</Row>}
        {device.syncError && <p className="form-error">Traccar: {device.syncError}</p>}
      </section>

      <section>
        <h4>Datos técnicos del GPS</h4>
        {lp ? (
          <>
            <Row label="Hora del dato">{`${dateTime(lp.fixTime)} (${ago(lp.fixTime)})`}</Row>
            <Row label="Llegó al servidor">{lagMin >= 5 ? `${ago(lp.receivedAt)} · ${lagMin >= 120 ? `${Math.round(lagMin / 60)} h` : `${lagMin} min`} después de la hora del GPS` : ago(lp.receivedAt)}</Row>
            <Row label="Señal de satélites">{lp.valid ? 'Con ubicación válida' : 'Sin fix de satélites (ubicación no confiable)'}</Row>
            <Row label="Satélites">{lp.satellites ?? lp.attributes?.sat}</Row>
            <Row label="Precisión del punto">{precisionText(d.live?.quality, d.live?.accuracyM)}</Row>
            <Row label="Último punto descartado">{lp.attributes?.hbRejected ? REJECT_LABELS[lp.attributes.hbRejected] || lp.attributes.hbRejected : null}</Row>
            <Row label="Cada cuánto reporta">{cadenceText(d.cadence)}</Row>
            <Row label="Altitud">{lp.altitude != null ? `${Math.round(lp.altitude)} m` : null}</Row>
            <Row label="Velocidad y rumbo">{`${Math.round(lp.speedKph)} km/h · ${compass(lp.course)}${lp.course != null ? ` (${Math.round(lp.course)}°)` : ''}`}</Row>
            <Row label="Paquetes en 26 h">{d.packets ? `${d.packets.last26h} recibidos · ${d.packets.good} con ubicación válida` : null}</Row>
            {known.filter(([k]) => !['sat', 'ignition'].includes(k)).map(([k, v]) => <Row key={k} label={ATTRIBUTE_LABELS[k][0]}>{ATTRIBUTE_LABELS[k][1](v)}</Row>)}
            {others.length > 0 && <details className="more"><summary>Otros datos que manda el equipo ({others.length})</summary>{others.map(([k, v]) => <Row key={k} label={k}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</Row>)}</details>}
          </>
        ) : <p className="muted">Todavía no ha mandado datos.</p>}
        <Row label="Hora del GPS">{clock?.mode === 'auto' ? `Corregida sola (${clock.offsetHours > 0 ? '+' : ''}${clock.offsetHours} h)` : clock?.mode === 'manual' ? (clock.offsetHours === 0 ? 'Sin corrección (a propósito)' : `Ajuste manual de ${clock.offsetHours > 0 ? '+' : ''}${clock.offsetHours} h`) : 'Normal (se vigila y se corrige sola si se corre)'}</Row>
      </section>

      {(d.geofences?.length > 0 || d.routes?.length > 0) && (
        <section>
          <h4>Zonas y rutas vigilando este GPS</h4>
          <ul className="plain">{d.geofences?.map((g) => <li key={g.id}><span><i className="swatch" style={{ background: g.color }} /> Geovalla · {g.name}</span></li>)}{d.routes?.map((r) => <li key={r.id}><span><i className="swatch" style={{ background: r.color }} /> Ruta · {r.name} <small className="muted">{r.origin_label ? `${r.origin_label} → ${r.destination_label || ''}` : ''}</small></span></li>)}</ul>
        </section>
      )}

      {d.maintenance?.length > 0 && (
        <section><h4>Mantenimiento</h4><ul className="plain">{d.maintenance.map((m) => <li key={m.id}><span>{m.name}</span><small className="muted">cada {m.every_km ? `${m.every_km} km` : ''}{m.every_km && m.every_days ? ' / ' : ''}{m.every_days ? `${m.every_days} d` : ''}</small></li>)}</ul></section>
      )}

      <section>
        <h4>Últimos eventos</h4>
        <ul className="plain events">{(d.recentEvents || []).map((e) => <li key={e.id}><i className="sev" style={{ background: (SEVERITY[e.severity] || SEVERITY.info).color }} /><span><b>{EVENT_LABELS[e.event_type] || e.event_type}</b><br /><small className="muted">{e.message}</small></span><small className="muted">{ago(e.event_time)}</small></li>)}{d.recentEvents?.length === 0 && <li className="muted">Sin eventos.</li>}</ul>
      </section>

      {modal === 'commands' && <CommandsModal device={device} me={me} onClose={() => { setModal(null); loadDetail(); }} />}
      {modal === 'share' && <ShareModal device={device} onClose={() => setModal(null)} />}
      {modal === 'edit' && <EditDeviceModal device={device} me={me} onClose={() => setModal(null)} onSaved={async () => { await onChanged?.(); loadDetail(); }} />}
      {modal === 'maintenance' && <MaintenanceModal device={device} onClose={() => setModal(null)} onChanged={loadDetail} />}
    </aside>
  );
}
