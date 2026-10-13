import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { DeviceLayer, MapView } from '@portal/components/map.jsx';
import { ICON_OPTIONS, SERVICE_LABELS, compass, dateTime, deviceName } from '@portal/lib/format.js';
import { explain, get, patch, post } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { Icon, Modal, TONE, Toast, ageLabel, useToast } from '../components/ui.jsx';
import { AlertsTab, DeviceTab, LocationTab, MaintenanceTab, SummaryTab } from '../components/DetailTabs.jsx';

export default function DetailScreen({ id, autoShare, onBack, onHistory, onCommands, onShowOnMap }) {
  const { byId, me, refresh, tick } = useFleet();
  const device = byId.get(id);
  const [detail, setDetail] = useState(null);
  const [modal, setModal] = useState(autoShare ? 'share' : null);
  const [repair, setRepair] = useState('');
  const [tab, setTab] = useState('summary');
  const [mini, setMini] = useState(false); // detalle minimizado: solo se ve el mapa y una barra
  const [toast, say, clear] = useToast();
  void tick;

  const reloadDetail = () => get(`/api/devices/${id}`).then(setDetail).catch(() => undefined);
  useEffect(() => {
    let alive = true;
    const load = () => get(`/api/devices/${id}`).then((d) => alive && setDetail(d)).catch(() => undefined);
    load();
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [id]);
  const live = device?.live;
  if (!device) return <section className="screen full"><button type="button" className="backbtn" aria-label="Volver" onClick={onBack}><Icon name="back" stroke={2.2} /></button><div className="empty" style={{ marginTop: 120 }}><b>Este GPS ya no está disponible</b></div></section>;

  const tone = TONE[live.status] || TONE.no_data;
  const d = detail || {};
  const seenMs = live.seenAt ? new Date(live.seenAt).getTime() : null;
  const fixMs = live.at ? new Date(live.at).getTime() : null;
  const staleMin = live.online && seenMs && fixMs ? Math.round((seenMs - fixMs) / 60000) : 0;
  const stale = staleMin >= 20 && live.status !== 'offline';
  const clock = d.clock || device.clock;
  const canEdit = me.role !== 'viewer';
  const canMaintain = ['platform_admin', 'reseller_admin', 'company_admin', 'operator'].includes(me.role);
  const canClock = ['platform_admin', 'reseller_admin', 'company_admin'].includes(me.role);
  const service = device.license?.service;
  const pill = { moving: ['#e6f6ec', '#15803d'], idle: ['#fef3dc', '#b45309'], stopped: ['#fef3dc', '#b45309'], offline: ['#eef0f4', '#6b7788'], no_data: ['#eef0f4', '#6b7788'] }[live.status] || ['#eef0f4', '#6b7788'];

  const since = live.status === 'moving' ? (live.statusSince ? `desde ${dateTime(live.statusSince)}` : '')
    : live.status === 'offline' ? (live.statusSince ? `desde ${dateTime(live.statusSince)} (${ageLabel(live.statusSince)})` : '')
    : stale ? `última posición ${dateTime(live.at)} (${ageLabel(live.at)}); el GPS está conectado pero no envía posiciones nuevas`
    : (live.statusSince ? `quieto desde ${dateTime(live.statusSince)}` : '');

  const repairHistory = async () => {
    setRepair('Reparando…');
    try { const r = await post(`/api/devices/${id}/clock/repair-history`, {}); setRepair(`Listo: se corrigió la hora de ${r.data?.moved ?? 0} posiciones.`); refresh(); } catch (err) { setRepair(explain(err)); }
  };

  return (
    <section className="screen full" aria-label={`Detalle de ${deviceName(device)}`}>
      <div className={`dmap${mini ? ' big' : ''}`}>
        <MapView center={live.lat != null ? [live.lat, live.lon] : [18.7, -70.2]} zoom={live.lat != null ? 16 : 8}><DeviceLayer devices={[device]} selectedId={device.id} /></MapView>
      </div>
      <button type="button" className="backbtn" aria-label="Volver" onClick={onBack}><Icon name="back" stroke={2.2} /></button>

      {mini && (
        <div className="dmini">
          <div className="flex1"><div className="nm ell">{deviceName(device)}</div><div className="sb ell">{tone.label}{live.status === 'moving' ? ` · ${Math.round(live.speedKph)} km/h` : stale ? ' · sin ubicación nueva' : ''}</div></div>
          <button type="button" className="act p" style={{ flex: 'none', width: 104 }} onClick={() => setMini(false)}>Detalles</button>
        </div>
      )}
      {!mini && (<>
      <div className="dsheet scroll" style={{ paddingBottom: 'calc(var(--safe-b) + 96px)' }}>
        <button type="button" className="grab" aria-label="Minimizar el detalle para ver solo el mapa" onClick={() => setMini(true)} style={{ margin: '0 auto', border: 0, padding: 0, height: 5, display: 'block' }} />
        <div className="row" style={{ marginTop: 14 }}>
          <div className="flex1"><div className="nm ell" style={{ fontSize: 20 }}>{deviceName(device)}</div><div className="sb ell">{[device.plate, device.driverName, device.model].filter(Boolean).join(' · ') || device.imei}</div></div>
          <button type="button" className="iconbtn" style={{ width: 42, height: 42, border: '1px solid var(--line2)', background: '#fff', borderRadius: 13 }} aria-label="Minimizar: ver solo el mapa" onClick={() => setMini(true)}><Icon name="map" size={19} color="#0b1f3a" /></button>
          {canEdit && <button type="button" className="iconbtn" style={{ width: 42, height: 42, border: '1px solid var(--line2)', background: '#fff', borderRadius: 13 }} aria-label="Editar nombre e ícono" onClick={() => setModal('edit')}><Icon name="edit" size={19} color="#0b1f3a" /></button>}
        </div>

        <div className="status-pill" style={{ marginTop: 12, background: pill[0], color: pill[1] }}>
          <i style={{ background: tone.dot }} /><span>{live.status === 'idle' ? 'Detenido, motor encendido' : tone.label}{stale ? ' · sin ubicación nueva' : ''}</span><small>{since}</small>
          {device.engineState === 'cut' && <span className="tag red">Motor apagado a distancia</span>}
          {service && service !== 'active' && <span className={`tag ${service === 'grace' ? 'amber' : 'red'}`}>{SERVICE_LABELS[service]}</span>}
        </div>

        {clock?.mode === 'auto' && (
          <div className="callout blue" style={{ marginTop: 10 }}>
            Hora del GPS corregida: {Math.abs(clock.offsetHours)} h de {clock.offsetHours >= 0 ? 'atraso' : 'adelanto'}. Se corrige sola para que el último dato y el tiempo detenido sean reales.
            {canClock && <div><button type="button" className="link" onClick={repairHistory}>Reparar el historial anterior</button></div>}
            {repair && <div style={{ fontWeight: 600, marginTop: 4 }}>{repair}</div>}
          </div>
        )}

        <div className="tiles c5" style={{ marginTop: 12 }}>
          <div className="tile"><b>{Math.round(live.speedKph)}</b><span>km/h</span></div>
          <div className="tile"><b>{live.ignition == null ? '—' : live.ignition ? 'Encend.' : 'Apagado'}</b><span>motor</span></div>
          <div className="tile"><b>{live.voltage != null ? `${Number(live.voltage).toFixed(1)} V` : '—'}</b><span>vehículo</span></div>
          <div className="tile"><b>{live.battery != null ? `${Math.round(live.battery)}%` : '—'}</b><span>batería GPS</span></div>
          <div className="tile"><b>{compass(live.course)}</b><span>rumbo</span></div>
        </div>

        <div className="chips" role="tablist" aria-label="Secciones del detalle" style={{ marginTop: 14 }}>
          {[['summary', 'Resumen'], ['location', 'Ubicación'], ['device', 'Equipo'], ['alerts', 'Alertas'], ['maintenance', 'Mantenimiento']].map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip flat${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
        </div>
        {tab === 'summary' && <SummaryTab device={device} d={d} onTab={setTab} onHistory={onHistory} />}
        {tab === 'location' && <><LocationTab device={device} /><button type="button" className="link" onClick={() => onShowOnMap(device.id)}>Ver en el mapa grande</button></>}
        {tab === 'device' && <DeviceTab device={device} d={d} />}
        {tab === 'alerts' && <AlertsTab device={device} d={d} canEdit={canEdit} say={say} />}
        {tab === 'maintenance' && <MaintenanceTab device={device} canEdit={canMaintain} say={say} reload={reloadDetail} />}
      </div>

      <div className="fixedbar">
        <button type="button" className="act p" onClick={() => onHistory(device.id)}><Icon name="clock" size={17} />Historial</button>
        {me.role !== 'viewer' && <button type="button" className="act" onClick={() => setModal('share')}><Icon name="share" size={17} />Compartir</button>}
        {me.role !== 'viewer' && <button type="button" className="act" onClick={() => onCommands(device.id)}><Icon name="power" size={17} />Comandos</button>}
      </div>
      </>)}

      {modal === 'edit' && <EditForm device={device} onClose={() => setModal(null)} onDone={() => { setModal(null); say('Guardado'); refresh(); }} />}
      {modal === 'share' && <ShareForm device={device} onClose={() => setModal(null)} />}
      <Toast message={toast} onDone={clear} />
    </section>
  );
}

function EditForm({ device, onClose, onDone }) {
  const [name, setName] = useState(device.displayName || device.name || '');
  const [iconKey, setIconKey] = useState(device.iconKey || 'car');
  const [notes, setNotes] = useState(device.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => { setBusy(true); setError(''); try { await patch(`/api/devices/${device.id}/basic`, { displayName: name.trim(), iconKey, notes: notes.trim() || null }); onDone(); } catch (err) { setError(explain(err)); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19, fontWeight: 800 }}>Nombre e ícono</h2>
      <label><span className="lab">Nombre en el mapa</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label><span className="lab">Tipo de activo</span><select className="input" value={iconKey} onChange={(e) => setIconKey(e.target.value)}>{ICON_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label><span className="lab">Notas</span><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {error && <div className="callout red" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="act" onClick={onClose}>Cancelar</button><button type="button" className="act p" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </Modal>
  );
}

const DURATIONS = [[1, '1 hora'], [8, '8 horas'], [24, '24 horas'], [24 * 7, '7 días']];
function ShareForm({ device, onClose }) {
  const [hours, setHours] = useState(24);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin portapapeles */ } };
  const create = async () => {
    setBusy(true); setError('');
    try { const r = await post(`/api/devices/${device.id}/share`, { label: deviceName(device), expiresInHours: hours, allowHistory: history }); setLink(r.data.url); } catch (err) { setError(explain(err)); } finally { setBusy(false); }
  };
  const send = async () => {
    const text = `Sigue ${deviceName(device)} en vivo: ${link}`;
    if (Capacitor.isNativePlatform()) { try { await Share.share({ title: 'Ubicación en vivo', text, dialogTitle: 'Enviar enlace' }); } catch { /* cancelado */ } } else { await navigator.clipboard.writeText(text).catch(() => undefined); }
  };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19, fontWeight: 800 }}>Compartir ubicación en vivo</h2>
      {!link ? (
        <>
          <p className="muted" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45 }}>Crea un enlace para que otra persona vea dónde está este GPS sin entrar a tu cuenta. No muestra el IMEI ni datos de tu empresa y se puede revocar.</p>
          <div><span className="lab">Cuánto tiempo estará activo</span><div className="pick">{DURATIONS.map(([h, label]) => <button key={h} type="button" className={`chip${hours === h ? ' on' : ''}`} onClick={() => setHours(h)}>{label}</button>)}</div></div>
          <label className="row" style={{ gap: 10, fontWeight: 700, fontSize: 14 }}><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} style={{ width: 20, height: 20 }} />Dejar ver también el recorrido de hoy</label>
          {error && <div className="callout red" role="alert">{error}</div>}
          <div className="actions"><button type="button" className="act" onClick={onClose}>Cancelar</button><button type="button" className="act p" disabled={busy} onClick={create}>{busy ? 'Creando…' : 'Crear enlace'}</button></div>
        </>
      ) : (
        <>
          <div className="callout blue">Enlace listo. Quien lo reciba verá este GPS en vivo hasta que venza o lo revoques.</div>
          <div className="actions"><button type="button" className="act" onClick={onClose}>Cerrar</button><button type="button" className="act" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button><button type="button" className="act p" onClick={send}>Enviar enlace</button></div>
        </>
      )}
    </Modal>
  );
}
