import React, { useCallback, useEffect, useState } from 'react';
import { COMMAND_STATUS, dateTime, deviceName } from '@portal/lib/format.js';
import { ApiError, del, explain, get, getFull, post } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { Icon, Modal, Toast, useToast } from '../components/ui.jsx';

const TONE_OF = { sent: 'green', failed: 'red', cancelled: 'gray', expired: 'gray' };

export default function CommandsScreen({ id, onBack }) {
  const { byId, refresh } = useFleet();
  const device = byId.get(id);
  const [types, setTypes] = useState([]);
  const [declaration, setDeclaration] = useState('');
  const [history, setHistory] = useState([]);
  const [modal, setModal] = useState(null); // { type }
  const [toast, say, clear] = useToast();

  const loadHistory = useCallback(() => get(`/api/devices/${id}/commands`).then(setHistory).catch(() => undefined), [id]);
  useEffect(() => {
    getFull(`/api/command-types?deviceId=${id}`).then((r) => { setTypes(r.data); setDeclaration(r.declaration || ''); }).catch(() => undefined);
    loadHistory();
    const timer = setInterval(loadHistory, 8000);
    return () => clearInterval(timer);
  }, [id, loadHistory]);
  if (!device) return null;

  const cancel = async (cid) => { try { await del(`/api/commands/${cid}`); loadHistory(); } catch (err) { say(explain(err)); } };
  const direct = async (type) => {
    try { await post(`/api/devices/${id}/commands`, { type }); say('Orden enviada al equipo'); loadHistory(); setTimeout(loadHistory, 5000); } catch (err) { say(explain(err)); }
  };
  const open = (t) => { if (t.critical || t.type === 'positionPeriodic') setModal({ type: t.type, label: t.label }); else direct(t.type); };

  return (
    <section className="screen full" aria-label="Comandos" style={{ background: '#fff' }}>
      <div className="head">
        <div className="row"><button type="button" className="iconbtn" style={{ width: 44, height: 44, borderRadius: 14, background: '#fff', border: '1px solid var(--line2)' }} aria-label="Volver" onClick={onBack}><Icon name="back" stroke={2.2} /></button><div className="flex1"><h1 style={{ fontSize: 20 }}>Comandos</h1><div className="sb ell">{deviceName(device)}{device.plate ? ` · ${device.plate}` : ''}</div></div></div>
      </div>
      <div className="scroll" style={{ padding: 16, paddingBottom: 'calc(var(--safe-b) + 24px)' }}>
        {types.map((t) => (
          <button key={t.type} type="button" className="cmd" disabled={!t.allowed} onClick={() => open(t)} style={t.critical ? { borderColor: t.type === 'engineStop' ? '#f5c2c2' : 'var(--line)', background: t.type === 'engineStop' ? 'var(--red-soft)' : '#fff' } : undefined}>
            <Icon name={t.type === 'positionSingle' ? 'pin' : t.type === 'positionPeriodic' ? 'clock' : 'power'} color={t.critical ? '#dc2626' : '#1d4ed8'} />
            <div className="flex1"><b>{t.label}</b><small>{t.critical ? 'Acción grave: queda registrada con tu usuario y hora' : !t.allowed ? 'Sin permiso con tu rol' : 'Se envía al equipo'}</small></div>
            <Icon name="chevron" size={18} color="#8a96a8" />
          </button>
        ))}
        {!types.length && <p className="muted" style={{ fontWeight: 600 }}>Este equipo no admite órdenes todavía.</p>}

        <div className="h">Órdenes recientes</div>
        {history.map((c) => (
          <div key={c.id} className="kv" style={{ display: 'block' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ textAlign: 'left' }}>{types.find((t) => t.type === c.type)?.label || c.type}</b><span className={`tag ${TONE_OF[c.status] || 'amber'}`}>{COMMAND_STATUS[c.status] || c.status}</span></div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{dateTime(c.created_at)} · {c.source === 'manual' ? c.requested_by : c.source === 'route' ? 'Regla de ruta' : 'Regla de geovalla'}</div>
            {c.last_error && <div className="c-red" style={{ fontSize: 12.5 }}>{c.last_error.startsWith('HB_GPS_') ? explain(new ApiError(c.last_error, 0)) : c.last_error}</div>}
            {c.result_text && <div style={{ fontSize: 12.5, marginTop: 2 }}>Respuesta del GPS: {c.result_text}</div>}
            {['queued', 'waiting_safe_speed'].includes(c.status) && <button type="button" className="ok" onClick={() => cancel(c.id)}>Cancelar orden</button>}
          </div>
        ))}
        {!history.length && <p className="muted" style={{ fontWeight: 600 }}>Todavía no hay órdenes.</p>}
      </div>

      {modal && (modal.type === 'engineStop' || modal.type === 'engineResume')
        ? <EngineSheet type={modal.type} device={device} declaration={declaration} onClose={() => setModal(null)} onDone={(text) => { setModal(null); say(text); loadHistory(); refresh(); setTimeout(loadHistory, 5000); }} />
        : modal && <FrequencySheet device={device} onClose={() => setModal(null)} onDone={(text) => { setModal(null); say(text); loadHistory(); }} />}
      <Toast message={toast} onDone={clear} />
    </section>
  );
}

// Apagar o restablecer el motor: la hoja del diseño. En movimiento se elige «ahora» o «cuando se detenga»; el cliente final acepta la declaración y el personal confirma con su contraseña.
function EngineSheet({ type, device, declaration, onClose, onDone }) {
  const stop = type === 'engineStop';
  const speed = Number(device.live?.speedKph || 0);
  const moving = stop && speed > 5;
  const [mode, setMode] = useState('safe');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const warning = declaration || 'Declaro que soy el propietario o responsable de este vehículo y solicito apagar su motor a distancia bajo mi propia responsabilidad. Entiendo que apagarlo en movimiento puede causar pérdida de potencia, de dirección asistida y de frenos asistidos, con riesgo de accidente.';

  // Sin contraseña ni motivo: aceptar la advertencia basta (queda registrada con el usuario, la hora y la velocidad del vehículo).
  const send = async () => {
    setBusy(true); setError('');
    try {
      const r = await post(`/api/devices/${device.id}/commands`, { type, declaration: true, immediate: stop && moving && mode === 'now' ? true : undefined });
      const status = r.data?.status;
      onDone(status === 'waiting_safe_speed' ? 'Orden en espera: se enviará cuando el vehículo esté a velocidad segura.' : status === 'sent' ? (stop ? 'Orden enviada: el motor se apagará.' : 'Orden enviada: el motor queda restablecido.') : `Estado: ${COMMAND_STATUS[status] || status}`);
    } catch (err) { setError(explain(err)); } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="row">
        <div className="vic sm t-gray" style={{ background: '#fee2e2' }}><Icon name="power" color="#dc2626" /></div>
        <div className="flex1"><div className="nm" style={{ fontSize: 19 }}>{stop ? 'Apagar el motor a distancia' : 'Restablecer el motor'}</div><div className="sb">{deviceName(device)}{device.plate ? ` · ${device.plate}` : ''}</div></div>
      </div>
      {moving && <div className="callout">El vehículo va en movimiento: <b>{Math.round(speed)} km/h</b>.</div>}
      {moving && (
        <>
          <button type="button" className={`opt${mode === 'now' ? ' on' : ''}`} onClick={() => setMode('now')}><i className="rad" /><div><b>Apagar ahora</b><span>Aunque vaya en movimiento, por ejemplo para detener un robo que estás siguiendo. Puede perder dirección y frenos asistidos.</span></div></button>
          <button type="button" className={`opt${mode === 'safe' ? ' on' : ''}`} onClick={() => setMode('safe')}><i className="rad" /><div><b>Apagar cuando se detenga</b><span>Más seguro. Se envía solo cuando el vehículo baje de la velocidad segura.</span></div></button>
        </>
      )}
      {!stop && <p className="muted" style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.45 }}>Se enviará la orden para que el vehículo pueda volver a arrancar.</p>}
      {stop && !moving && <p className="muted" style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.45 }}>El vehículo está detenido. Se enviará la orden para que no pueda arrancar.</p>}
      <div className="small-print">{stop ? warning : 'Al continuar aceptas que esta orden queda registrada con tu usuario, la fecha y la hora.'}</div>
      {error && <div className="callout red" role="alert">{error}</div>}
      <button type="button" className="act danger" style={{ flex: 'none', height: 54, borderRadius: 16, fontSize: 16, fontWeight: 800 }} disabled={busy} onClick={send}>{busy ? 'Enviando…' : stop ? 'Aceptar y apagar el motor' : 'Aceptar y restablecer el motor'}</button>
      <button type="button" className="act" style={{ flex: 'none', height: 46, border: 0, background: 'transparent' }} onClick={onClose}>Cancelar</button>
    </Modal>
  );
}

function FrequencySheet({ device, onClose, onDone }) {
  const [seconds, setSeconds] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => { setBusy(true); setError(''); try { await post(`/api/devices/${device.id}/commands`, { type: 'positionPeriodic', attributes: { frequency: Number(seconds) } }); onDone('Orden enviada al equipo'); } catch (err) { setError(explain(err)); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19, fontWeight: 800 }}>Reportar cada…</h2>
      <p className="muted" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45 }}>Menos segundos = mapa más fino, pero más datos y batería. Mínimo 10.</p>
      <input className="input" type="number" inputMode="numeric" min="10" max="86400" value={seconds} onChange={(e) => setSeconds(e.target.value)} aria-label="Segundos entre reportes" />
      {error && <div className="callout red" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="act" onClick={onClose}>Cancelar</button><button type="button" className="act p" disabled={busy || Number(seconds) < 10} onClick={send}>{busy ? 'Enviando…' : 'Enviar orden'}</button></div>
    </Modal>
  );
}
