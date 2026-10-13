import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { del, explain, get, post, put } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { Badge, Field, Modal, useAction } from '../components/ui.jsx';

// Administración de la plataforma: WhatsApp Business (plantillas aprobadas por Meta) y Firebase web (avisos con sonido en el navegador).
const STATUS = { draft: ['gray', 'Borrador'], pending: ['amber', 'En revisión de Meta'], approved: ['green', 'Aprobada'], rejected: ['red', 'Rechazada'], paused: ['amber', 'Pausada'], disabled: ['red', 'Desactivada'] };
const SEVERITY_LABELS = [['critical', 'Alertas críticas (SOS, corte de energía, desvío de ruta, remolque)'], ['warning', 'Advertencias (exceso de velocidad, sin señal, geovalla, batería baja)'], ['info', 'Información (encendido, apagado, en línea, rutas)']];
const slug = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const metaDetail = (err) => (err?.details?.problems?.length ? err.details.problems.join(' ') : err?.details?.detail ? `${explain(err)} — ${err.details.detail}` : explain(err));

function Section({ title, children, note }) {
  return <section className="editor" style={{ maxWidth: 920, marginBottom: 18 }}><h3>{title}</h3>{note && <p className="hint">{note}</p>}{children}</section>;
}

function Connection({ data, reload }) {
  const c = data.config;
  const [form, setForm] = useState({ phoneNumberId: c.phoneNumberId || '', wabaId: c.wabaId || '', accessToken: '', language: c.language || 'es', enabled: c.enabled });
  const [check, setCheck] = useState(c.lastCheck);
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const set = (patch) => { setForm({ ...form, ...patch }); setSaved(false); };
  const save = () => run(async () => { await put('/api/platform/whatsapp', { ...form, accessToken: form.accessToken || undefined }); setForm((f) => ({ ...f, accessToken: '' })); setSaved(true); await reload(); });
  const test = () => run(async () => { setCheck(await post('/api/platform/whatsapp/test-connection', {})); });
  return (
    <Section title="1. Conexión con WhatsApp Business" note="Datos de la Cloud API de Meta (developers.facebook.com → tu app → WhatsApp → Configuración de la API). El token debe ser permanente (usuario del sistema), no el temporal de 24 horas.">
      <div className="form-grid">
        <Field label="Identificador del número de teléfono (Phone number ID)"><input value={form.phoneNumberId} onChange={(e) => set({ phoneNumberId: e.target.value })} inputMode="numeric" placeholder="Solo números" /></Field>
        <Field label="Identificador de la cuenta de WhatsApp Business (WABA ID)" hint="Hace falta para crear y consultar plantillas."><input value={form.wabaId} onChange={(e) => set({ wabaId: e.target.value })} inputMode="numeric" placeholder="Solo números" /></Field>
        <Field label="Token de acceso permanente" hint={c.tokenSet ? `Guardado ${c.tokenHint}${c.tokenSource === 'env' ? ' (viene de la configuración del servidor)' : ''}. Déjalo vacío para conservarlo.` : 'Aún no hay token.'}><input type="password" autoComplete="off" value={form.accessToken} onChange={(e) => set({ accessToken: e.target.value })} placeholder={c.tokenSet ? '••••••••' : 'EAAG…'} /></Field>
        <Field label="Idioma de las plantillas"><select value={form.language} onChange={(e) => set({ language: e.target.value })}><option value="es">Español (es)</option><option value="es_MX">Español México (es_MX)</option><option value="en_US">Inglés (en_US)</option></select></Field>
      </div>
      <label className="check"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enviar avisos por WhatsApp (si lo apagas, los avisos siguen por la app y el portal)</label>
      {error && <p className="form-error">{error}</p>}{saved && <p className="form-ok">Guardado.</p>}
      {check && <p className="hint">Última prueba ({dateTime(check.at)}): número <b>{check.displayPhone || '—'}</b> · nombre verificado <b>{check.verifiedName || '—'}</b> · calidad <b>{check.quality || '—'}</b> · límite diario <b>{check.tier || '—'}</b></p>}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy || !form.phoneNumberId} onClick={save}>{busy ? 'Un momento…' : 'Guardar'}</button><button type="button" className="btn" disabled={busy || !c.configured} onClick={test}>Probar conexión</button></div>
    </Section>
  );
}

function TemplateEditor({ template, fields, defaults, onClose, onSaved }) {
  const isNew = !template;
  const [form, setForm] = useState(template ? { ...template } : { key: '', name: '', language: defaults.language, label: '', body: 'Hola, tu vehículo {{1}} reportó: {{2}}. Gracias por usar HB GPS.', footer: '', variables: ['device', 'event'] });
  const { busy, error, run } = useAction();
  const count = useMemo(() => { const found = [...form.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])); return found.length ? Math.max(...found) : 0; }, [form.body]);
  const variables = Array.from({ length: count }, (_, i) => form.variables[i] || 'device');
  const fieldInfo = Object.fromEntries(fields.map((f) => [f.key, f]));
  const preview = form.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => fieldInfo[variables[Number(n) - 1]]?.example || '…');
  const locked = template && ['approved', 'pending'].includes(template.status);
  const save = () => run(async () => {
    const key = isNew ? slug(form.label) : form.key;
    const name = isNew && !form.name ? `hbgps_${slug(form.label)}` : form.name;
    await put(`/api/platform/whatsapp/templates/${key}`, { name, language: form.language, label: form.label, body: form.body, footer: form.footer || null, variables });
    await onSaved();
    onClose();
  });
  return (
    <Modal title={isNew ? 'Nueva plantilla' : `Plantilla · ${template.label}`} onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn primary" disabled={busy || locked || !form.label} onClick={save}>{busy ? 'Guardando…' : 'Guardar borrador'}</button></>}>
      {locked && <p className="hint">Esta plantilla está {template.status === 'approved' ? 'aprobada' : 'en revisión'}: Meta no permite cambiar el texto. Crea otra con otro nombre si necesitas un texto distinto.</p>}
      <div className="form-grid">
        <Field label="Nombre para reconocerla"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} disabled={locked} /></Field>
        <Field label="Nombre técnico en Meta" hint="Minúsculas, números y guion bajo. No se puede repetir."><input value={form.name} placeholder={`hbgps_${slug(form.label || 'mi_plantilla')}`} onChange={(e) => setForm({ ...form, name: slug(e.target.value) })} disabled={locked || !isNew} /></Field>
        <Field label="Texto del mensaje" wide hint="Escribe {{1}}, {{2}}… donde irá cada dato. No puede empezar ni terminar con un hueco, y los huecos no pueden ir pegados."><textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} disabled={locked} /></Field>
        {variables.map((v, i) => (
          <Field key={i} label={`Hueco {{${i + 1}}} se llena con`}><select value={v} disabled={locked} onChange={(e) => { const next = [...variables]; next[i] = e.target.value; setForm({ ...form, variables: next }); }}>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
        ))}
        <Field label="Pie (opcional)" wide><input value={form.footer || ''} maxLength={60} onChange={(e) => setForm({ ...form, footer: e.target.value })} disabled={locked} /></Field>
      </div>
      <h4>Así se verá</h4>
      <pre className="wa-preview">{preview}</pre>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function Templates({ data, reload }) {
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  const ready = data.config.configured && data.config.wabaId;
  const submit = (t) => run(async () => { try { await post(`/api/platform/whatsapp/templates/${t.key}/submit`, {}); setMsg(`«${t.label}» se envió a Meta. La revisión puede tardar de minutos a un par de días; usa «Actualizar estados».`); } catch (err) { setMsg(''); throw Object.assign(new Error(metaDetail(err)), {}); } await reload(); });
  const sync = () => run(async () => { const r = await post('/api/platform/whatsapp/sync', {}); setMsg(`Se consultaron ${r.remote} plantillas en Meta y se actualizaron ${r.updated}.`); await reload(); });
  const remove = (t) => run(async () => { if (!window.confirm(`¿Eliminar la plantilla «${t.label}»? También se borra de Meta.`)) return; await del(`/api/platform/whatsapp/templates/${t.key}`); await reload(); });
  return (
    <Section title="2. Plantillas de mensaje" note="Meta solo deja escribirle a alguien que no te ha escrito en las últimas 24 horas con plantillas que ellos aprobaron. HB GPS trae tres plantillas generales (una por gravedad) con huecos que se llenan con el vehículo, el evento, la hora y el enlace al mapa; así sirven para todas las alertas.">
      <div className="table-wrap"><table className="table"><thead><tr><th>Plantilla</th><th>Nombre en Meta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {data.templates.map((t) => (
          <tr key={t.key}>
            <td><b>{t.label}</b><br /><small className="muted">{t.variables.length} datos · {t.language}</small>{t.rejectedReason && <><br /><small className="warn">Motivo del rechazo: {t.rejectedReason}</small></>}{t.lastError && <><br /><small className="warn">{t.lastError}</small></>}</td>
            <td><code>{t.name}</code></td>
            <td><Badge tone={STATUS[t.status]?.[0] || 'gray'}>{STATUS[t.status]?.[1] || t.status}</Badge></td>
            <td><div className="row-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn small" onClick={() => setEditing(t)}>{['approved', 'pending'].includes(t.status) ? 'Ver' : 'Editar'}</button>
              {['draft', 'rejected'].includes(t.status) && <button type="button" className="btn small primary" disabled={busy || !ready} title={ready ? '' : 'Primero guarda la conexión con el WABA ID'} onClick={() => submit(t)}>Enviar a Meta</button>}
              {!t.builtin && <button type="button" className="btn small danger" disabled={busy} onClick={() => remove(t)}>Eliminar</button>}
            </div></td>
          </tr>
        ))}
      </tbody></table></div>
      {msg && <p className="form-ok">{msg}</p>}{error && <p className="form-error">{error}</p>}
      <div className="row-actions"><button type="button" className="btn" disabled={busy || !ready} onClick={sync}>↻ Actualizar estados desde Meta</button><button type="button" className="btn" onClick={() => setEditing('new')}>＋ Nueva plantilla</button></div>
      {editing && <TemplateEditor template={editing === 'new' ? null : editing} fields={data.fields} defaults={{ language: data.config.language }} onClose={() => setEditing(null)} onSaved={reload} />}
    </Section>
  );
}

function Mapping({ data, reload }) {
  const [map, setMap] = useState(data.config.mapping);
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState('');
  const approved = data.templates.filter((t) => t.status === 'approved').length;
  const save = () => run(async () => { await put('/api/platform/whatsapp/mapping', map); setSaved(true); await reload(); });
  const send = () => run(async () => { setResult(''); try { await post('/api/platform/whatsapp/test-message', { to: phone }); setResult('Mensaje de prueba enviado. Revisa el WhatsApp de ese número.'); } catch (err) { throw new Error(metaDetail(err)); } });
  return (
    <Section title="3. Qué plantilla se usa en cada caso" note={approved ? 'Cada aviso sale por la plantilla de su gravedad, solo si ya está aprobada.' : 'Todavía no hay plantillas aprobadas: mientras tanto los avisos solo llegan por WhatsApp a quien haya escrito en las últimas 24 horas.'}>
      {SEVERITY_LABELS.map(([severity, label]) => (
        <Field key={severity} label={label}><select value={map[severity]} onChange={(e) => { setMap({ ...map, [severity]: e.target.value }); setSaved(false); }}>{data.templates.map((t) => <option key={t.key} value={t.key}>{t.label}{t.status === 'approved' ? '' : ` (${STATUS[t.status]?.[1] || t.status})`}</option>)}</select></Field>
      ))}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy} onClick={save}>Guardar</button>{saved && <span className="form-ok">Guardado.</span>}</div>
      <h4>Enviar un mensaje de prueba</h4>
      <div className="form-grid"><Field label="Número de WhatsApp (con código de país; 10 dígitos = República Dominicana)"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809 555 0100" inputMode="tel" /></Field></div>
      <div className="row-actions"><button type="button" className="btn" disabled={busy || !phone || !approved} onClick={send}>Enviar prueba</button></div>
      {result && <p className="form-ok">{result}</p>}{error && <p className="form-error">{error}</p>}
    </Section>
  );
}

function Queue() {
  const [data, setData] = useState(null);
  const load = useCallback(() => get('/api/platform/whatsapp/queue').then(setData).catch(() => setData({ last7d: {}, recent: [] })), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const n = data.last7d;
  return (
    <Section title="4. Avisos de los últimos 7 días">
      <p className="hint">Enviados <b>{n.sent || 0}</b> · en cola <b>{(n.queued || 0) + (n.sending || 0)}</b> · reintentando <b>{n.failed || 0}</b> · cancelados <b>{n.cancelled || 0}</b>. Cada GPS con plan Plus tiene su bolsa de mensajes; un aviso que no sale no la gasta.</p>
      {data.recent.length > 0 && <div className="table-wrap"><table className="table"><thead><tr><th>Hora</th><th>GPS</th><th>Número</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>
        {data.recent.map((r) => <tr key={r.id}><td>{dateTime(r.created_at)}</td><td>{r.display_name || '—'}</td><td>{r.recipient}</td><td><Badge tone={r.status === 'sent' ? 'green' : r.status === 'cancelled' ? 'red' : 'amber'}>{r.status}</Badge></td><td><small className="muted">{r.last_error || (r.provider_response?.template ? `plantilla ${r.provider_response.template}` : '')}</small></td></tr>)}
      </tbody></table></div>}
      <div className="row-actions"><button type="button" className="btn small" onClick={load}>↻ Actualizar</button></div>
    </Section>
  );
}

function FirebaseWeb() {
  const [state, setState] = useState(null);
  const [form, setForm] = useState({ apiKey: '', projectId: '', messagingSenderId: '', appId: '', vapidKey: '', authDomain: '' });
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const load = useCallback(() => get('/api/platform/firebase-web').then((s) => { setState(s); setForm((f) => ({ ...f, apiKey: s.apiKey || '', projectId: s.projectId || '', messagingSenderId: s.messagingSenderId || '', appId: s.appId || '', authDomain: s.authDomain || '' })); }).catch(() => setState({})), []);
  useEffect(() => { load(); }, [load]);
  if (!state) return null;
  const set = (patch) => { setForm({ ...form, ...patch }); setSaved(false); };
  const save = () => run(async () => { await put('/api/platform/firebase-web', form); setSaved(true); setForm((f) => ({ ...f, vapidKey: '' })); await load(); });
  const clear = () => run(async () => { if (!window.confirm('¿Quitar la configuración de Firebase web? Los navegadores dejarán de recibir avisos.')) return; await del('/api/platform/firebase-web'); setForm({ apiKey: '', projectId: '', messagingSenderId: '', appId: '', vapidKey: '', authDomain: '' }); await load(); });
  return (
    <Section title="Avisos con sonido en el navegador (Firebase web)" note="Firebase Console → Configuración del proyecto → Tus apps → agrega una app «Web» y copia estos datos. La clave VAPID está en Cloud Messaging → Certificados push web → Generar par de claves. La llave de servicio (la misma de la app) ya está en el servidor.">
      <p className="hint">Estado: {state.configured ? <Badge tone="green">Configurado</Badge> : <Badge tone="gray">Sin configurar</Badge>} · llave de servicio en el servidor: {state.serviceAccount ? <Badge tone="green">Lista</Badge> : <Badge tone="red">Falta</Badge>}</p>
      <div className="form-grid">
        <Field label="apiKey"><input value={form.apiKey} onChange={(e) => set({ apiKey: e.target.value })} autoComplete="off" /></Field>
        <Field label="projectId"><input value={form.projectId} onChange={(e) => set({ projectId: e.target.value })} /></Field>
        <Field label="messagingSenderId"><input value={form.messagingSenderId} onChange={(e) => set({ messagingSenderId: e.target.value })} inputMode="numeric" /></Field>
        <Field label="appId"><input value={form.appId} onChange={(e) => set({ appId: e.target.value })} /></Field>
        <Field label="authDomain (opcional)"><input value={form.authDomain} onChange={(e) => set({ authDomain: e.target.value })} /></Field>
        <Field label="Clave pública VAPID" hint={state.vapidKey ? `Guardada ${state.vapidKey}. Pégala de nuevo solo si la cambias.` : ''}><input value={form.vapidKey} onChange={(e) => set({ vapidKey: e.target.value })} autoComplete="off" /></Field>
      </div>
      <p className="hint">Los avisos del navegador solo funcionan con HTTPS (dirección https://). Mientras el portal se abra por http://, la alerta suena dentro de la página abierta pero no llega con la pestaña cerrada.</p>
      {error && <p className="form-error">{error}</p>}{saved && <p className="form-ok">Guardado.</p>}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy || !form.vapidKey && !state.configured} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>{state.configured && <button type="button" className="btn danger" disabled={busy} onClick={clear}>Quitar</button>}</div>
    </Section>
  );
}

export function WhatsappAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => { try { setData(await get('/api/platform/whatsapp')); } catch (err) { setError(explain(err)); } }, []);
  useEffect(() => { reload(); }, [reload]);
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;
  return (
    <div>
      <Connection key={data.config.updatedAt || 'new'} data={data} reload={reload} />
      <Templates data={data} reload={reload} />
      <Mapping key={JSON.stringify(data.config.mapping)} data={data} reload={reload} />
      <Queue />
    </div>
  );
}

export function FirebaseAdmin() { return <div><FirebaseWeb /></div>; }
