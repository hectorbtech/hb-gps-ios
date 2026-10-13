import React, { useEffect, useState } from 'react';
import { get, put, qs } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { Badge, Field, useAction } from './ui.jsx';

// Números de WhatsApp que reciben los avisos. Los GPS con plan Plus incluyen una bolsa de mensajes; sin plan Plus los avisos siguen por el portal y la app.
const LEVELS = [['critical', 'Solo las críticas (SOS, corte de energía, desvío de ruta, remolque)'], ['warning', 'Críticas y advertencias (recomendado)'], ['all', 'Todo, incluido encendido, apagado y en línea']];
const parsePhones = (text) => text.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
const showPhone = (p) => (String(p).length === 11 && String(p).startsWith('1') ? `${p.slice(1, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : `+${p}`);

function PlatformNotice({ platform }) {
  if (!platform) return null;
  if (!platform.configured) return <p className="hint warn">HB GPS todavía no conectó su WhatsApp: los avisos seguirán llegando por el portal y la app.</p>;
  if (!platform.templatesApproved) return <p className="hint">WhatsApp está conectado; falta que Meta apruebe las plantillas de mensaje. Los avisos empezarán a salir solos cuando estén aprobadas.</p>;
  return null;
}

/** Números de la empresa: aplican a todos sus GPS con plan Plus, salvo los que tengan su propio número. */
export function CompanyWhatsapp({ companyId }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const [level, setLevel] = useState('warning');
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => { get(`/api/company-whatsapp${qs({ companyId })}`).then((s) => { setState(s); setText(s.phones.map(showPhone).join('\n')); setLevel(s.level); setConsent(Boolean(s.consentAt)); }).catch(() => setState({ phones: [] })); }, [companyId]);
  if (!state) return null;
  const save = () => run(async () => { const r = await put('/api/company-whatsapp', { companyId: companyId || undefined, phones: parsePhones(text), level, consent }); setState(r); setText(r.phones.map(showPhone).join('\n')); setSaved(true); });
  return (
    <div className="editor" style={{ maxWidth: 640, marginTop: 18 }}>
      <h3>Avisos por WhatsApp</h3>
      <p className="hint">Los GPS con <b>plan Plus</b> incluyen una bolsa de mensajes de WhatsApp. Las alertas que tengas encendidas llegan solas a estos números. Cada aviso gasta un mensaje de la bolsa del GPS.</p>
      <PlatformNotice platform={state.platform} />
      <Field label="Números de WhatsApp (uno por línea)" hint="10 dígitos = República Dominicana. Para otro país escribe el código, por ejemplo +34 600 111 222. Máximo 5."><textarea rows={3} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} placeholder="809 555 0100" /></Field>
      <Field label="Qué avisos mandar"><select value={level} onChange={(e) => { setLevel(e.target.value); setSaved(false); }}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      {parsePhones(text).length > 0 && !state.consentAt && <label className="check"><input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setSaved(false); }} /> Confirmo que las personas de estos números aceptaron recibir avisos de HB GPS por WhatsApp.</label>}
      {state.consentAt && <p className="hint">Consentimiento registrado por {state.consentBy} el {dateTime(state.consentAt)}.</p>}
      {error && <p className="form-error">{error}</p>}{saved && <p className="form-ok">Guardado.</p>}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar números'}</button></div>
    </div>
  );
}

/** WhatsApp de un GPS: usa el número de la empresa o uno propio (por ejemplo el del dueño del vehículo). */
export function DeviceWhatsapp({ device }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const [level, setLevel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const apply = (s) => { setState(s); setText(s.phones.map(showPhone).join('\n')); setLevel(s.level || ''); setEnabled(s.enabled); setConsent(Boolean(s.consentAt)); };
  useEffect(() => { get(`/api/devices/${device.id}/whatsapp`).then(apply).catch(() => setState(null)); }, [device.id]);
  if (!state) return null;
  const save = () => run(async () => { apply(await put(`/api/devices/${device.id}/whatsapp`, { enabled, phones: parsePhones(text), level: level || null, consent })); setSaved(true); });
  const inheritedHint = state.inherited.phones.length ? `Si lo dejas vacío se usan los de la empresa (${state.inherited.phones.map(showPhone).join(', ')}).` : 'Si lo dejas vacío no se envía a nadie, porque la empresa tampoco dejó números.';
  return (
    <div className="wide alert-box">
      <span className="plan-title">Avisos por WhatsApp</span>
      {!state.eligible ? (
        <small className="muted block">Este GPS no tiene el plan Plus vigente, que es el que incluye mensajes de WhatsApp. Los avisos le llegan por el portal y la app. {state.plan === 'plus' ? 'Su acceso a WhatsApp venció: renueva el plan.' : ''}</small>
      ) : (
        <>
          <small className="muted block">Plan Plus: quedan <b>{state.remaining}</b> de {state.included} mensajes{state.accessExpiresAt ? ` (hasta el ${dateTime(state.accessExpiresAt)})` : ''}. Las alertas encendidas de este GPS llegan solas.</small>
          <PlatformNotice platform={state.platform} />
          <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }} /> Mandar los avisos de este GPS por WhatsApp</label>
          <Field label="Número propio de este GPS (uno por línea)" hint={inheritedHint}><textarea rows={2} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} placeholder="809 555 0100" /></Field>
          <Field label="Qué avisos mandar"><select value={level} onChange={(e) => { setLevel(e.target.value); setSaved(false); }}><option value="">Igual que la empresa ({LEVELS.find(([v]) => v === state.inherited.level)?.[1]?.split(' (')[0]})</option>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {parsePhones(text).length > 0 && !state.consentAt && <label className="check"><input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setSaved(false); }} /> Confirmo que esta persona aceptó recibir avisos de HB GPS por WhatsApp.</label>}
          {error && <p className="form-error">{error}</p>}{saved && <p className="form-ok">Guardado.</p>}
          <div className="row-actions"><button type="button" className="btn small primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar WhatsApp'}</button><Badge tone="gray">{state.remaining} mensajes</Badge></div>
        </>
      )}
    </div>
  );
}
