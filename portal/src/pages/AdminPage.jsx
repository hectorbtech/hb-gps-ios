import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { del, explain, get, getFull, patch, post, put, qs } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { ROLE_LABELS, SERVICE_LABELS, STATUS, dateTime, deviceName } from '../lib/format.js';
import { Badge, Empty, Field, Modal, Tabs, useAction } from '../components/ui.jsx';
import { EditDeviceModal } from '../components/DeviceModals.jsx';
import { CompanyWhatsapp } from '../components/WhatsappBox.jsx';
import { FirebaseAdmin, WhatsappAdmin } from './PlatformMessaging.jsx';
import PlanPicker, { PLAN_NAMES, planIncludes, planName } from '../components/PlanPicker.jsx';

const ADMINS = ['platform_admin', 'reseller_admin', 'company_admin'];
// El protocolo se lee solo del equipo cuando se conecta; elegirlo a mano ya no hace falta.
const PROTOCOLS = [['auto', 'Detectar automáticamente (recomendado)'], ['gt06', 'GT06 / Concox'], ['h02', 'MiCODUS H02'], ['jt808', 'MiCODUS JT808']];
const PROTOCOL_NOTE = 'El protocolo lo detecta el servidor al conectarse el equipo (y se guarda solo). Si el GPS ya se conectó antes, se usa el que se vio.';
const RENEWAL_STATUS = { issued: 'Por confirmar', paid: 'Pagada', invoiced: 'Facturada (pendiente de pago)', declined: 'No renovar', cancelled: 'Cancelada', expired: 'Vencida', accepted: 'Aceptada' };
const VEHICLE_TYPES = [['car', 'Carro'], ['truck', 'Camión'], ['motorcycle', 'Motor'], ['van', 'Camioneta'], ['bus', 'Autobús'], ['boat', 'Yate o lancha'], ['equipment', 'Equipo'], ['vehicle', 'Otro']];

// Formulario genérico a partir de una lista de campos.
function FormModal({ title, fields, initial = {}, submitLabel = 'Guardar', onClose, onSubmit, note }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? f.default ?? ''])));
  const { busy, error, run } = useAction();
  const passwordShort = (f) => f.type === 'password' && String(form[f.key] ?? '') !== '' && String(form[f.key]).length < 12;
  const ready = fields.every((f) => (!f.required || String(form[f.key] ?? '').trim() !== '') && !passwordShort(f));
  const submit = () => run(async () => {
    const body = {};
    for (const f of fields) {
      if (f.type === 'plan') { const [planCode, term] = String(form[f.key] || '').split(':'); if (planCode && term) { body.planCode = planCode; body.term = term; body.allowPending = Boolean(form.allowPending); } continue; }
      const v = form[f.key]; if (v === '' || v == null) continue; body[f.key] = f.type === 'number' ? Number(v) : f.type === 'checkbox' ? Boolean(v) : typeof v === 'string' ? v.trim() : v;
    }
    await onSubmit(body); onClose();
  });
  return (
    <Modal title={title} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn primary" disabled={busy || !ready} onClick={submit}>{busy ? 'Guardando…' : submitLabel}</button></>}>
      {note && <p className="hint">{note}</p>}
      <div className="form-grid">
        {fields.map((f) => (f.type === 'plan' ? (
          <div key={f.key} className="wide"><span className="plan-title">{f.label}</span><PlanPicker companyId={f.companyId} value={form[f.key]} allowPending={form.allowPending} onChange={({ plan, allowPending }) => setForm({ ...form, [f.key]: plan, allowPending })} /></div>
        ) : (
          <Field key={f.key} label={f.label} hint={f.hint} wide={f.wide}>
            {f.type === 'select' ? <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}><option value="">{f.empty || 'Elegir…'}</option>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : f.type === 'checkbox' ? <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                : <input type={f.type || 'text'} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} autoComplete={f.type === 'password' ? 'new-password' : 'off'} min={f.min} />}
            {passwordShort(f) && <small className="bad">Faltan {12 - String(form[f.key]).length} caracteres (mínimo 12).</small>}
          </Field>
        )))}
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function Table({ columns, rows, empty = 'Sin registros', onRow }) {
  return (
    <div className="table-wrap">
      <table className="table"><thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.id || i} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(row) : undefined}>{columns.map((c) => <td key={c.label}>{c.render(row)}</td>)}</tr>)}</tbody>
      </table>
      {!rows.length && <Empty icon="📭" title={empty} />}
    </div>
  );
}

function useList(path, params, enabled = true) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { if (!enabled) { setRows([]); setLoading(false); return; } setLoading(true); try { setRows(await get(`${path}${qs(params)}`)); } catch { setRows([]); } finally { setLoading(false); } }, [path, JSON.stringify(params), enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { rows, loading, reload: load };
}

// ---------- Secciones
function Overview({ companyId }) {
  const [data, setData] = useState(null);
  const { summary } = useFleet();
  useEffect(() => { get(`/api/dashboard${qs({ companyId })}`).then(setData).catch(() => undefined); }, [companyId]);
  if (!data) return <p className="muted">Cargando…</p>;
  const card = (value, label, tone) => <div className={tone || ''}><b>{value}</b><small>{label}</small></div>;
  return (
    <div className="kpis">
      {card(data.devices, 'GPS registrados')}{card(summary.moving || 0, 'en movimiento ahora', 'good')}{card(data.online, 'con señal')}{card(data.pending, 'por instalar')}
      {card(data.alerts_24h, 'alertas en 24 h', data.alerts_24h ? 'warn' : '')}{card(data.critical_open, 'críticas sin atender', data.critical_open ? 'bad' : '')}{data.companies > 0 && card(data.companies, 'empresas activas')}
    </div>
  );
}

function Devices({ me, companyId, companies }) {
  const fleet = useFleet();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [licensing, setLicensing] = useState(null);
  const [interval_, setInterval_] = useState(false);
  const canCreate = ADMINS.includes(me.role);
  const { rows: customers } = useList('/api/end-customers', { companyId }, canCreate && Boolean(companyId || me.companyId));
  const { rows: vehicles } = useList('/api/vehicles', { companyId }, canCreate && Boolean(companyId || me.companyId));
  const rows = fleet.devices;
  const service = (d) => { const s = d.license?.service; return <Badge tone={s === 'active' ? 'green' : s === 'grace' ? 'amber' : 'red'}>{SERVICE_LABELS[s] || s}</Badge>; };
  return (
    <>
      {canCreate && <div className="toolbar"><button type="button" className="btn primary" onClick={() => setCreating(true)}>+ Registrar GPS</button><button type="button" className="btn" onClick={() => setInterval_(true)}>⏱ Intervalo de toda la flota</button><span className="muted">El GPS debe estar configurado para enviar a la dirección del servidor (ver README).</span></div>}
      <Table columns={[
        { label: 'GPS', render: (d) => <><b>{deviceName(d)}</b><small className="muted block">{d.imei}</small></> },
        { label: 'Estado', render: (d) => <span className="status-pill" style={{ '--c': (STATUS[d.live.status] || STATUS.no_data).color }}>{(STATUS[d.live.status] || STATUS.no_data).label}</span> },
        { label: 'Vehículo / conductor', render: (d) => <>{[d.vehicleName, d.plate].filter(Boolean).join(' · ') || '—'}<small className="muted block">{d.driverName || ''}</small></> },
        { label: 'Cliente final', render: (d) => d.endCustomerName || '—' },
        { label: 'Licencia', render: (d) => <>{d.license?.pending ? <Badge tone="amber">Plan pendiente de créditos</Badge> : service(d)}<small className="muted block">{d.license?.pending ? `${planName(d.license.pending.plan, d.license.pending.term)} · se activa al recargar` : d.license?.plan ? `${d.license.plan === 'plus' ? 'Plus' : 'Basic'} · ${d.license.term === 'lifetime' ? 'vitalicia' : d.license.expiresAt ? `vence ${dateTime(d.license.expiresAt)}` : ''}` : ''}</small></> },
        { label: '', render: (d) => <span className="actions"><button type="button" className="btn small" onClick={() => setEditing(d)}>Editar</button>{canCreate && !d.license?.plan && <button type="button" className="btn small primary" onClick={() => setLicensing(d)}>Activar licencia</button>}</span> }
      ]} rows={rows} empty="Aún no hay GPS registrados" />
      {editing && <EditDeviceModal device={editing} me={me} onClose={() => setEditing(null)} onSaved={fleet.refresh} />}
      {creating && <FormModal title="Registrar GPS" onClose={() => setCreating(false)} submitLabel="Registrar" note={me.role === 'platform_admin' ? 'Al registrarlo se crea también en Traccar para que empiece a recibir datos. Para meter GPS a tu inventario sin plan, usa Administración → Inventario.' : 'Al registrarlo eliges su plan y se descuentan los créditos. Se crea también en Traccar para que empiece a recibir datos.'}
        fields={[{ key: 'imei', label: 'IMEI (número del equipo)', required: true, wide: true }, { key: 'protocol', label: 'Protocolo', type: 'select', options: PROTOCOLS, default: 'auto', hint: PROTOCOL_NOTE }, { key: 'model', label: 'Modelo' }, { key: 'simNumber', label: 'Número de SIM' }, { key: 'vehicleId', label: 'Vehículo', type: 'select', options: vehicles.map((v) => [v.id, `${v.name}${v.plate ? ` · ${v.plate}` : ''}`]), empty: 'Sin vehículo' }, { key: 'endCustomerId', label: 'Cliente final', type: 'select', options: customers.map((c) => [c.id, c.name]), empty: 'Sin cliente final' }, ...(me.role === 'platform_admin' ? [] : [{ key: 'plan', type: 'plan', label: 'Plan del GPS (se descuenta de tus créditos)', required: true, companyId }])]}
        onSubmit={async (body) => { await post('/api/devices', { ...body, companyId: companyId || undefined }); await fleet.refresh(); }} />}
      {interval_ && <FormModal title="Intervalo de reporte de la flota" onClose={() => setInterval_(false)} submitLabel="Guardar y enviar" note="Cada cuántos segundos manda posición cada GPS. Lo normal es 10. Se envía a todos los GPS que no tengan uno propio (los apagados lo reciben al conectarse). Menos segundos = mapa más fino, pero más datos y batería."
        fields={[{ key: 'seconds', label: 'Segundos (5 a 3600)', type: 'number', required: true, min: 5, default: 10 }]}
        onSubmit={async (body) => { await put('/api/report-interval', { seconds: body.seconds, companyId: companyId || undefined, applyToAll: true }); await fleet.refresh(); }} />}
      {licensing && <FormModal title={`Activar licencia · ${deviceName(licensing)}`} onClose={() => setLicensing(null)} submitLabel="Activar" note={licensing.companyIsPrimary ? 'Es un GPS de tu empresa principal: no se descuentan créditos.' : 'Se descuentan créditos de la empresa según el plan elegido. Las licencias vitalicias nunca vencen.'}
        fields={[{ key: 'planCode', label: 'Plan', type: 'select', required: true, default: 'basic', options: [['basic', 'Basic'], ['plus', 'Plus (incluye WhatsApp)']] }, { key: 'term', label: 'Duración', type: 'select', required: true, default: 'annual', options: [['annual', 'Anual'], ['lifetime', 'Vitalicia']] }]}
        onSubmit={async (body) => { await post('/api/licenses', { ...body, deviceId: licensing.id }); await fleet.refresh(); }} />}
    </>
  );
}

function Vehicles({ me, companyId }) {
  const enabled = Boolean(companyId || me.companyId);
  const { rows, reload } = useList('/api/vehicles', { companyId }, enabled);
  const { rows: drivers } = useList('/api/drivers', { companyId }, enabled && me.role !== 'end_customer');
  const [creating, setCreating] = useState(false);
  const canCreate = ADMINS.includes(me.role);
  return (
    <>
      {canCreate && <div className="toolbar"><button type="button" className="btn primary" onClick={() => setCreating(true)}>+ Nuevo vehículo</button></div>}
      <Table columns={[{ label: 'Vehículo', render: (v) => <b>{v.name}</b> }, { label: 'Placa', render: (v) => v.plate || '—' }, { label: 'Tipo', render: (v) => VEHICLE_TYPES.find(([id]) => id === v.vehicle_type)?.[1] || v.vehicle_type }, { label: 'Marca / modelo', render: (v) => [v.make, v.model, v.year].filter(Boolean).join(' ') || '—' }, { label: 'Conductor', render: (v) => v.driver_name || '—' }]} rows={rows} empty="Sin vehículos" />
      {creating && <FormModal title="Nuevo vehículo" onClose={() => setCreating(false)}
        fields={[{ key: 'name', label: 'Nombre', required: true, wide: true }, { key: 'plate', label: 'Placa' }, { key: 'vehicleType', label: 'Tipo', type: 'select', options: VEHICLE_TYPES, default: 'car' }, { key: 'make', label: 'Marca' }, { key: 'model', label: 'Modelo' }, { key: 'year', label: 'Año', type: 'number' }, { key: 'driverId', label: 'Conductor', type: 'select', options: drivers.map((d) => [d.id, d.name]), empty: 'Sin conductor' }]}
        onSubmit={async (body) => { await post('/api/vehicles', { ...body, companyId: companyId || undefined }); await reload(); }} />}
    </>
  );
}

function Drivers({ me, companyId }) {
  const { rows, reload } = useList('/api/drivers', { companyId }, Boolean(companyId || me.companyId));
  const [editing, setEditing] = useState(null);
  const fields = [{ key: 'name', label: 'Nombre', required: true, wide: true }, { key: 'phone', label: 'Teléfono' }, { key: 'document', label: 'Cédula' }, { key: 'licenseNumber', label: 'Licencia de conducir' }, { key: 'licenseExpiresAt', label: 'Vence', type: 'date' }];
  const expiring = (d) => d.license_expires_at && new Date(d.license_expires_at) < new Date(Date.now() + 30 * 86400_000);
  return (
    <>
      <div className="toolbar"><button type="button" className="btn primary" onClick={() => setEditing({})}>+ Nuevo conductor</button></div>
      <Table columns={[{ label: 'Conductor', render: (d) => <><b>{d.name}</b>{!d.active && <Badge>Inactivo</Badge>}</> }, { label: 'Teléfono', render: (d) => d.phone || '—' }, { label: 'Licencia', render: (d) => <>{d.license_number || '—'}{expiring(d) && <Badge tone="amber">Por vencer</Badge>}</> }, { label: 'Vehículos', render: (d) => d.vehicles }, { label: '', render: (d) => <button type="button" className="btn small" onClick={() => setEditing(d)}>Editar</button> }]} rows={rows} empty="Sin conductores" />
      {editing && <FormModal title={editing.id ? 'Editar conductor' : 'Nuevo conductor'} onClose={() => setEditing(null)} fields={fields}
        initial={editing.id ? { name: editing.name, phone: editing.phone, licenseNumber: editing.license_number, licenseExpiresAt: editing.license_expires_at?.slice(0, 10) } : {}}
        onSubmit={async (body) => { if (editing.id) await patch(`/api/drivers/${editing.id}`, body); else await post('/api/drivers', { ...body, companyId: companyId || undefined }); await reload(); }} />}
    </>
  );
}

function Customers({ me, companyId }) {
  const { rows, reload } = useList('/api/end-customers', { companyId }, true);
  const [creating, setCreating] = useState(false);
  const [access, setAccess] = useState(null);
  const canCreate = Boolean(companyId || me.companyId);
  return (
    <>
      <div className="toolbar"><button type="button" className="btn primary" disabled={!canCreate} onClick={() => setCreating(true)}>+ Nuevo cliente final</button><span className="muted">{canCreate ? 'Los clientes finales solo ven sus propios GPS.' : 'Mostrando los clientes de todas las empresas. Elige una empresa arriba para crear uno.'}</span></div>
      <Table columns={[{ label: 'Cliente', render: (c) => <b>{c.name}</b> }, ...(canCreate ? [] : [{ label: 'Empresa', render: (c) => c.company_name }]), { label: 'Contacto', render: (c) => [c.phone, c.email].filter(Boolean).join(' · ') || '—' }, { label: 'GPS', render: (c) => c.devices }, { label: '', render: (c) => <button type="button" className="btn small" onClick={() => setAccess(c)}>Crear acceso al portal</button> }]} rows={rows} empty="Sin clientes finales" />
      {creating && <FormModal title="Nuevo cliente final" onClose={() => setCreating(false)} fields={[{ key: 'name', label: 'Nombre', required: true, wide: true }, { key: 'document', label: 'Documento' }, { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo', type: 'email' }]} onSubmit={async (body) => { await post('/api/end-customers', { ...body, companyId: companyId || undefined }); await reload(); }} />}
      {access && <FormModal title={`Acceso al portal · ${access.name}`} onClose={() => setAccess(null)} submitLabel="Crear acceso" note="Se crea un usuario que solo ve los GPS de este cliente. La contraseña debe tener al menos 12 caracteres."
        fields={[{ key: 'email', label: 'Correo', type: 'email', required: true, default: access.email || '' }, { key: 'password', label: 'Contraseña inicial', type: 'password', required: true }]}
        onSubmit={async (body) => { await post(`/api/end-customers/${access.id}/access`, body); }} />}
    </>
  );
}

function Users({ me, companyId, companies }) {
  const { rows, reload } = useList('/api/users', { companyId }, true);
  const { rows: customers } = useList('/api/end-customers', { companyId }, Boolean(companyId || me.companyId));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const roles = me.role === 'platform_admin' ? Object.keys(ROLE_LABELS) : me.role === 'reseller_admin' ? ['company_admin', 'operator', 'viewer', 'end_customer'] : ['operator', 'viewer', 'end_customer'];
  return (
    <>
      <div className="toolbar"><button type="button" className="btn primary" onClick={() => setCreating(true)}>+ Nuevo usuario</button></div>
      <Table columns={[{ label: 'Usuario', render: (u) => <><b>{u.name}</b><small className="muted block">{u.email}</small></> }, { label: 'Rol', render: (u) => ROLE_LABELS[u.role] || u.role }, { label: 'Empresa', render: (u) => u.company_name || '—' }, { label: 'Último acceso', render: (u) => (u.last_login_at ? dateTime(u.last_login_at) : 'Nunca') }, { label: 'Estado', render: (u) => <Badge tone={u.active ? 'green' : 'gray'}>{u.active ? 'Activo' : 'Desactivado'}</Badge> }, { label: '', render: (u) => u.id !== me.userId && <button type="button" className="btn small" onClick={() => setEditing(u)}>Editar</button> }]} rows={rows} empty="Sin usuarios" />
      {creating && <FormModal title="Nuevo usuario" onClose={() => setCreating(false)} note="Contraseña de al menos 12 caracteres."
        fields={[{ key: 'name', label: 'Nombre', required: true, wide: true }, { key: 'email', label: 'Correo', type: 'email', required: true }, { key: 'password', label: 'Contraseña inicial', type: 'password', required: true }, { key: 'role', label: 'Rol', type: 'select', required: true, options: roles.map((r) => [r, ROLE_LABELS[r]]), default: 'operator' }, ...(me.role !== 'company_admin' && companies.length ? [{ key: 'companyId', label: 'Empresa', type: 'select', required: true, options: companies.map((c) => [c.id, c.name]), default: companyId }] : []), { key: 'endCustomerId', label: 'Cliente final (solo rol cliente final)', type: 'select', options: customers.map((c) => [c.id, c.name]), empty: '—' }]}
        onSubmit={async (body) => { await post('/api/users', { ...body, companyId: body.companyId || companyId || me.companyId }); await reload(); }} />}
      {editing && <FormModal title={`Editar · ${editing.name}`} onClose={() => setEditing(null)} note="Desactivar o cambiar la contraseña cierra sus sesiones abiertas."
        fields={[{ key: 'role', label: 'Rol', type: 'select', options: roles.map((r) => [r, ROLE_LABELS[r]]), default: editing.role }, { key: 'active', label: 'Activo', type: 'checkbox', default: editing.active }, { key: 'password', label: 'Nueva contraseña (opcional)', type: 'password', wide: true }]}
        initial={{ role: editing.role, active: editing.active }}
        onSubmit={async (body) => { await patch(`/api/users/${editing.id}`, { ...body, active: Boolean(body.active) }); await reload(); }} />}
    </>
  );
}

function Licenses({ me, companyId }) {
  const enabled = Boolean(companyId || me.companyId);
  const [credits, setCredits] = useState(null);
  const { rows: licenses } = useList('/api/licenses', { companyId }, enabled);
  const { rows: catalog } = useList('/api/license-catalog', {}, true);
  const { rows: documents, reload: reloadDocuments } = useList('/api/billing/documents', { companyId }, enabled);
  const { rows: pendings, reload: reloadPendings } = useList('/api/pending-licenses', { companyId }, enabled);
  const [granting, setGranting] = useState(false);
  const [busyDoc, setBusyDoc] = useState('');
  const act = async (id, path, message) => { if (message && !window.confirm(message)) return; setBusyDoc(id); try { await post(`/api/billing/documents/${id}/${path}`, {}); } catch (error) { window.alert(explain(error)); } finally { setBusyDoc(''); load(); reloadDocuments(); } };
  const load = useCallback(() => { if (enabled) get(`/api/credits${qs({ companyId })}`).then(setCredits).catch(() => undefined); }, [companyId, enabled]);
  useEffect(() => { load(); }, [load]);
  const targetCompany = companyId || me.companyId;
  return (
    <>
      <div className="kpis">
        <div className={credits && Number(credits.wallet.balance) < 0 ? 'bad' : ''}><b>{credits ? Number(credits.wallet.balance).toLocaleString('es-DO') : '—'}</b><small>{credits && Number(credits.wallet.balance) < 0 ? 'créditos (en negativo: cúbrelos con tu próxima compra)' : 'créditos disponibles'}</small></div>
        <div><b>{licenses.filter((l) => l.status === 'active').length}</b><small>licencias vigentes</small></div>
      </div>
      {me.role === 'platform_admin' && targetCompany && <div className="toolbar"><button type="button" className="btn primary" onClick={() => setGranting(true)}>+ Cargar créditos</button></div>}
      {pendings.length > 0 && (
        <>
          <h4>GPS con plan pendiente de créditos</h4>
          <p className="hint">Estos GPS ya están registrados, pero su plan se cobrará apenas haya créditos. Para activarlos, recarga créditos; se activan solos, en orden.</p>
          <Table columns={[{ label: 'GPS', render: (p) => <><b>{p.device_name}</b><small className="muted block">{p.imei}{me.role === 'platform_admin' ? ` · ${p.company_name}` : ''}</small></> }, { label: 'Plan', render: (p) => planName(p.plan_code, p.term) }, { label: 'Cuesta', render: (p) => `${p.credits_needed} créditos` }, { label: 'Saldo', render: (p) => <span className={Number(p.balance) < Number(p.credits_needed) ? 'bad' : ''}>{Number(p.balance).toLocaleString('es-DO')}</span> }, { label: 'Pedido', render: (p) => <small>{p.requested_by || ''} · {dateTime(p.created_at)}</small> }, { label: '', render: (p) => <button type="button" className="btn small" onClick={async () => { if (window.confirm('¿Cancelar este plan pendiente? El GPS seguirá registrado sin plan.')) { await del(`/api/pending-licenses/${p.id}`); reloadPendings(); } }}>Cancelar</button> }]} rows={pendings} />
        </>
      )}
      <h4>Renovaciones</h4>
      <p className="hint">Cuando vence una licencia anual se emite una renovación con 5 días de plazo: puedes confirmarla (si tu cliente ya te dijo que sí), declinarla, o dejar que se cobre sola al terminar el plazo con tus créditos. Si no alcanzan, se factura o se deja en negativo según tu plan.</p>
      <Table columns={[{ label: 'Documento', render: (d) => <><b>{d.document_number}</b><small className="muted block">{dateTime(d.created_at)}</small></> }, { label: 'Créditos', render: (d) => d.credits_due }, { label: 'Estado', render: (d) => (d.status === 'issued' ? <><Badge tone="amber">Por confirmar</Badge><small className="muted block">se cobra solo el {dateTime(d.due_at)}</small></> : <Badge tone={d.status === 'paid' ? 'green' : d.status === 'invoiced' ? 'blue' : 'gray'}>{RENEWAL_STATUS[d.status] || d.status}</Badge>) }, { label: '', render: (d) => <span className="actions">{d.status === 'issued' && <><button type="button" className="btn small primary" disabled={busyDoc === d.id} onClick={() => act(d.id, 'confirm')}>Confirmar renovación</button><button type="button" className="btn small" disabled={busyDoc === d.id} onClick={() => act(d.id, 'decline', '¿No renovar este GPS? Al vencer quedará sin servicios avanzados.')}>No renovar</button></>}{d.status === 'invoiced' && me.role === 'platform_admin' && <button type="button" className="btn small" disabled={busyDoc === d.id} onClick={() => act(d.id, 'invoice-paid')}>Marcar factura pagada</button>}</span> }]} rows={documents} empty="Sin renovaciones" />
      <h4>Licencias</h4>
      <Table columns={[{ label: 'GPS', render: (l) => <><b>{l.vehicle_name || l.model || l.imei}</b><small className="muted block">{l.imei}</small></> }, { label: 'Plan', render: (l) => planName(l.plan_code, l.term) }, { label: 'Vence', render: (l) => (l.expires_at ? dateTime(l.expires_at) : 'Nunca') }, { label: 'Estado', render: (l) => <Badge tone={l.status === 'active' ? 'green' : 'amber'}>{l.status}</Badge> }]} rows={licenses} empty="Sin licencias" />
      <h4>Planes y costo en créditos</h4>
      <Table columns={[{ label: 'Plan', render: (c) => planName(c.plan_code, c.term) }, { label: 'Créditos', render: (c) => c.credits }, { label: 'WhatsApp incluido', render: (c) => (c.whatsapp_messages ? `${c.whatsapp_messages} mensajes` : '—') }]} rows={catalog.map((c, i) => ({ ...c, id: i }))} />
      <h4>Movimientos de créditos</h4>
      <Table columns={[{ label: 'Fecha', render: (t) => dateTime(t.created_at) }, { label: 'Detalle', render: (t) => t.description || t.type }, { label: 'Créditos', render: (t) => <b className={Number(t.amount) < 0 ? 'bad' : 'good'}>{Number(t.amount) > 0 ? '+' : ''}{t.amount}</b> }, { label: 'Saldo', render: (t) => t.balance_after }]} rows={credits?.transactions || []} empty="Sin movimientos" />
      {granting && <FormModal title="Cargar créditos" onClose={() => setGranting(false)} submitLabel="Cargar" fields={[{ key: 'credits', label: 'Créditos', type: 'number', required: true, min: 0 }, { key: 'description', label: 'Motivo', required: true, wide: true, default: 'Compra de créditos' }]} onSubmit={async (body) => { await post(`/api/companies/${targetCompany}/credits`, body); load(); }} />}
    </>
  );
}

function CompanySettings({ me, companyId }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ endCustomerEngineCut: false, speedLimitKph: '' });
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  useEffect(() => { get(`/api/company-settings${qs({ companyId })}`).then((s) => { setSettings(s); setForm({ endCustomerEngineCut: s.endCustomerEngineCut, speedLimitKph: s.speedLimitKph ?? '' }); }).catch(() => undefined); }, [companyId]);
  if (!settings) return <p className="muted">Cargando…</p>;
  const save = () => run(async () => { await put('/api/company-settings', { companyId: companyId || undefined, endCustomerEngineCut: form.endCustomerEngineCut, speedLimitKph: form.speedLimitKph === '' ? null : Number(form.speedLimitKph) }); setSaved(true); });
  return (
    <div className="editor" style={{ maxWidth: 640 }}>
      <h3>Ajustes de {settings.name}</h3>
      <label className="check danger-check"><input type="checkbox" checked={form.endCustomerEngineCut} onChange={(e) => { setForm({ ...form, endCustomerEngineCut: e.target.checked }); setSaved(false); }} /> <b>Mis clientes finales pueden apagar el motor de sus propios vehículos</b><small>Solo en sus equipos, con motivo y su contraseña, y con la misma protección de velocidad (no se corta a un vehículo que va rápido). Si lo dejas apagado, solo tu empresa puede hacerlo.</small></label>
      <Field label="Límite de velocidad por defecto (km/h)" hint="Avisa cuando un GPS sin límite propio lo supera. Vacío = sin límite."><input type="number" min="10" max="250" value={form.speedLimitKph} onChange={(e) => { setForm({ ...form, speedLimitKph: e.target.value }); setSaved(false); }} /></Field>
      <p className="hint">Renovaciones sin crédito suficiente: <b>{settings.renewalFallback === 'negative_credit' ? 'se dejan en crédito negativo' : 'se emite una factura'}</b> (lo configura HB GPS).</p>
      {error && <p className="form-error">{error}</p>}{saved && <p className="form-ok">Guardado.</p>}
      <div className="row-actions"><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      <CompanyWhatsapp companyId={companyId} />
    </div>
  );
}

function Audit({ companyId }) {
  const { rows } = useList('/api/audit', { companyId }, true);
  return <Table columns={[{ label: 'Fecha', render: (a) => dateTime(a.created_at) }, { label: 'Quién', render: (a) => a.actor || '—' }, { label: 'Qué', render: (a) => `${a.entity_type} · ${a.action}` }, { label: 'Detalle', render: (a) => <small className="muted">{a.payload && Object.keys(a.payload).length ? JSON.stringify(a.payload).slice(0, 160) : ''}</small> }]} rows={rows} empty="Sin actividad registrada" />;
}

function Companies({ me, reload, companies }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const { rows, reload: reloadRows } = useList('/api/companies', {}, true);
  const platform = me.role === 'platform_admin';
  return (
    <>
      <div className="toolbar"><button type="button" className="btn primary" onClick={() => setCreating(true)}>+ Nueva empresa</button></div>
      <Table columns={[{ label: 'Empresa', render: (c) => <><b>{c.name}</b>{c.is_primary && <Badge tone="blue">Mi empresa principal</Badge>}<small className="muted block">{c.email || c.phone || ''}</small></> }, { label: 'Estado', render: (c) => <Badge tone={c.status === 'active' ? 'green' : c.status === 'trial' ? 'blue' : 'red'}>{c.status}</Badge> }, { label: 'GPS', render: (c) => c.devices }, { label: 'Créditos', render: (c) => Number(c.credits).toLocaleString('es-DO') }, { label: 'Usuarios máx.', render: (c) => c.max_employee_users }, { label: '', render: (c) => <button type="button" className="btn small" onClick={() => setEditing(c)}>Editar</button> }]} rows={rows} empty="Sin empresas" />
      {creating && <FormModal title="Nueva empresa" onClose={() => setCreating(false)} fields={[{ key: 'name', label: 'Nombre comercial', required: true, wide: true }, { key: 'legalName', label: 'Razón social' }, { key: 'taxId', label: 'RNC' }, { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo', type: 'email' }]} onSubmit={async (body) => { await post('/api/companies', body); await reloadRows(); await reload?.(); }} />}
      {editing && <FormModal title={`Editar · ${editing.name}`} onClose={() => setEditing(null)}
        fields={[{ key: 'name', label: 'Nombre', required: true, wide: true }, { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo', type: 'email' }, ...(platform ? [{ key: 'status', label: 'Estado', type: 'select', options: [['trial', 'Prueba'], ['active', 'Activa'], ['suspended', 'Suspendida'], ['cancelled', 'Cancelada']] }, { key: 'maxEmployeeUsers', label: 'Máximo de usuarios', type: 'number', min: 1 }, { key: 'isPrimary', label: 'Es mi empresa principal', type: 'checkbox', hint: 'La empresa propia del dueño de la plataforma: aparece como filtro «Mi empresa» en el mapa. Solo puede haber una.' }, { key: 'renewalFallback', label: 'Renovación sin créditos suficientes', type: 'select', options: [['invoice', 'Emitir una factura (renueva y queda por cobrar)'], ['negative_credit', 'Dejar el crédito en negativo']], hint: 'La licencia se renueva igual; esto define cómo se cobra.' }] : []), { key: 'speedLimitKph', label: 'Límite de velocidad de la empresa (km/h)', type: 'number', min: 10, hint: 'Aplica a los GPS sin límite propio.' }]}
        initial={{ name: editing.name, phone: editing.phone, email: editing.email, status: editing.status, maxEmployeeUsers: editing.max_employee_users, speedLimitKph: editing.settings?.speedLimitKph, renewalFallback: editing.settings?.renewalFallback || 'invoice', isPrimary: editing.is_primary }}
        onSubmit={async ({ speedLimitKph, renewalFallback, ...rest }) => { await patch(`/api/companies/${editing.id}`, { ...rest, isPrimary: Boolean(rest.isPrimary), settings: { ...(speedLimitKph ? { speedLimitKph } : {}), ...(renewalFallback ? { renewalFallback } : {}) } }); await reloadRows(); await reload?.(); }} />}
    </>
  );
}

function Resellers() {
  const { rows, reload } = useList('/api/resellers', {}, true);
  const [creating, setCreating] = useState(false);
  const [userFor, setUserFor] = useState(null);
  return (
    <>
      <div className="toolbar"><button type="button" className="btn primary" onClick={() => setCreating(true)}>+ Nuevo distribuidor</button></div>
      <Table columns={[{ label: 'Distribuidor', render: (r) => <><b>{r.name}</b><small className="muted block">{r.email || r.phone || ''}</small></> }, { label: 'Empresas', render: (r) => r.companies }, { label: '', render: (r) => <button type="button" className="btn small" onClick={() => setUserFor(r)}>Crear usuario</button> }]} rows={rows} empty="Sin distribuidores" />
      {creating && <FormModal title="Nuevo distribuidor" onClose={() => setCreating(false)} fields={[{ key: 'name', label: 'Nombre', required: true, wide: true }, { key: 'taxId', label: 'RNC' }, { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo', type: 'email' }]} onSubmit={async (body) => { await post('/api/resellers', body); await reload(); }} />}
      {userFor && <FormModal title={`Usuario de ${userFor.name}`} onClose={() => setUserFor(null)} fields={[{ key: 'name', label: 'Nombre', required: true }, { key: 'email', label: 'Correo', type: 'email', required: true }, { key: 'password', label: 'Contraseña inicial (12+)', type: 'password', required: true }]} onSubmit={async (body) => { await post('/api/users', { ...body, role: 'reseller_admin', resellerId: userFor.id }); }} />}
    </>
  );
}

function Inventory({ companies }) {
  const [data, setData] = useState({ rows: [], inventoryCompanyId: null });
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(null);
  const load = useCallback(async () => { const r = await getFull('/api/inventory/devices'); setData({ rows: r.data, inventoryCompanyId: r.inventoryCompanyId }); }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const { rows: discovered } = useList('/api/discovered-devices', {}, true);
  const { rows: seen, reload: reloadSeen } = useList('/api/unknown-devices', {}, true);
  const [prefill, setPrefill] = useState(null);
  const free = data.rows.filter((d) => d.in_inventory).length;
  const rows = data.rows.filter((d) => (filter === 'all' || (filter === 'free' ? d.in_inventory : !d.in_inventory))
    && (!query.trim() || [d.imei, d.model, d.display_name, d.company_name, d.end_customer_name, d.sim_number].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())));
  const giveBack = async (d) => { if (!window.confirm(`¿Devolver ${d.imei} al inventario? Dejará de pertenecer a ${d.company_name} (se quita su vehículo y cliente final).`)) return; try { await patch(`/api/devices/${d.id}/ownership`, { companyId: data.inventoryCompanyId }); } catch (error) { window.alert(explain(error)); } load(); };
  return (
    <>
      <div className="toolbar"><button type="button" className="btn primary" onClick={() => setAdding(true)}>+ Ingresar GPS al inventario</button><span className="muted">Aquí están todos tus GPS: los que siguen sin dueño y los que ya asignaste a una empresa.</span></div>
      <div className="filters">
        <div className="chips">
          {[['all', 'Todos', data.rows.length], ['free', 'Sin asignar', free], ['assigned', 'Asignados a empresas', data.rows.length - free]].map(([id, label, n]) => <button type="button" key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>{label}<em>{n}</em></button>)}
        </div>
        <label>Buscar<input type="search" placeholder="IMEI, empresa, cliente, modelo…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
      <Table columns={[
        { label: 'IMEI', render: (d) => <><b>{d.imei}</b>{d.display_name && <small className="muted block">{d.display_name}</small>}</> },
        { label: 'Modelo', render: (d) => <>{d.model || '—'}<small className="muted block">{d.protocol === 'auto' ? 'protocolo por detectar' : d.protocol}</small></> },
        { label: 'Pertenece a', render: (d) => (d.in_inventory ? <Badge tone="gray">En inventario · sin asignar</Badge> : <><b>{d.company_name}</b>{d.end_customer_name && <small className="muted block">Cliente final: {d.end_customer_name}</small>}</>) },
        { label: 'Licencia', render: (d) => (d.plan_code ? <>{d.plan_code === 'plus' ? 'Plus' : 'Basic'}<small className="muted block">{d.license_term === 'lifetime' ? 'vitalicia' : d.license_expires_at ? `vence ${dateTime(d.license_expires_at)}` : ''}</small></> : <span className="muted">Sin licencia</span>) },
        { label: 'Conexión', render: (d) => (d.last_seen_at ? <><Badge tone={d.online ? 'green' : 'gray'}>{d.online ? 'En línea' : 'Sin señal'}</Badge><small className="muted block">{dateTime(d.last_seen_at)}</small></> : <span className="muted">Nunca conectó</span>) },
        { label: 'Traccar', render: (d) => (d.traccar_sync_error ? <Badge tone="red">{d.traccar_sync_error}</Badge> : <Badge tone="green">Listo</Badge>) },
        { label: '', render: (d) => <span className="actions"><button type="button" className="btn small" onClick={() => setMoving(d)}>{d.in_inventory ? 'Asignar a empresa' : 'Reasignar'}</button>{!d.in_inventory && <button type="button" className="btn small" onClick={() => giveBack(d)}>Devolver al inventario</button>}</span> }
      ]} rows={rows} empty="Sin GPS con ese filtro" />
      {seen.length > 0 && (
        <>
          <h4>GPS detectados que todavía no están registrados</h4>
          <p className="muted">Se conectaron al servidor y el sistema ya leyó su IMEI y protocolo. Regístralo con un clic; si no es tuyo, ignóralo.</p>
          <Table columns={[
            { label: 'IMEI', render: (d) => <b>{d.imei}</b> },
            { label: 'Protocolo', render: (d) => <Badge tone="blue">{(d.protocol || '?').toUpperCase()}</Badge> },
            { label: 'Última conexión', render: (d) => <>{dateTime(d.last_seen_at)}<small className="muted block">{d.hits} conexión(es){d.remote_ip ? ` · IP ${d.remote_ip}` : ''}</small></> },
            { label: '', render: (d) => <span className="actions"><button type="button" className="btn small primary" onClick={() => { setPrefill(d); setAdding(true); }}>Registrar en inventario</button><button type="button" className="btn small" onClick={async () => { await del(`/api/unknown-devices/${d.imei}`); reloadSeen(); }}>Ignorar</button></span> }
          ]} rows={seen.map((d) => ({ ...d, id: d.imei }))} />
        </>
      )}
      {discovered.length > 0 && <><h4>GPS que se conectaron pero no están registrados</h4><Table columns={[{ label: 'IMEI', render: (d) => d.imei }, { label: 'Estado en Traccar', render: (d) => d.status }, { label: 'Último dato', render: (d) => (d.lastUpdate ? dateTime(d.lastUpdate) : '—') }]} rows={discovered.map((d) => ({ ...d, id: d.traccarId }))} /></>}
      {adding && <FormModal title="Ingresar GPS" onClose={() => { setAdding(false); setPrefill(null); }} initial={prefill ? { imei: prefill.imei, protocol: PROTOCOLS.some(([v]) => v === prefill.protocol) ? prefill.protocol : 'auto' } : {}} note={prefill ? 'Este GPS ya se conectó: IMEI y protocolo vienen de lo que el servidor leyó.' : undefined} fields={[{ key: 'imei', label: 'IMEI', required: true, wide: true }, { key: 'protocol', label: 'Protocolo', type: 'select', options: PROTOCOLS, default: 'auto', hint: PROTOCOL_NOTE }, { key: 'model', label: 'Modelo' }, { key: 'simNumber', label: 'SIM' }]} onSubmit={async (body) => { await post('/api/inventory/devices', body); setPrefill(null); await load(); reloadSeen(); }} />}
      {moving && <FormModal title={`${moving.in_inventory ? 'Asignar' : 'Reasignar'} ${moving.imei}`} onClose={() => setMoving(null)} submitLabel={moving.in_inventory ? 'Asignar' : 'Reasignar'} note={moving.in_inventory ? undefined : `Hoy pertenece a ${moving.company_name}. Al reasignarlo se quita su vehículo y cliente final actuales.`} fields={[{ key: 'companyId', label: 'Empresa', type: 'select', required: true, default: moving.in_inventory ? '' : moving.company_id, options: companies.map((c) => [c.id, c.name]) }]} onSubmit={async (body) => { await patch(`/api/devices/${moving.id}/ownership`, body); await load(); }} />}
    </>
  );
}

// Planes de licencia POR GPS. Cada GPS que se asigna a un cliente final (o que una empresa registra por su cuenta) toma uno de estos planes
// y su costo en créditos se descuenta de la empresa dueña. No hay precio mensual ni límite de GPS por empresa: el plan se paga por cada GPS.
function Plans() {
  const { rows, reload } = useList('/api/license-catalog', {}, true);
  const [editing, setEditing] = useState(null);
  const order = ['basic:annual', 'basic:lifetime', 'plus:annual', 'plus:lifetime'];
  const sorted = [...rows].sort((x, y) => order.indexOf(`${x.plan_code}:${x.term}`) - order.indexOf(`${y.plan_code}:${y.term}`));
  return (
    <>
      <div className="callout">
        <b>Cómo funcionan los planes</b>
        <ol className="how">
          <li>Tú ingresas GPS a tu inventario (solo IMEI, protocolo, modelo y SIM) y se los asignas a una tienda o revendedor. No cuesta nada todavía.</li>
          <li>Cuando la tienda <b>asigna el GPS a un cliente final</b> —o <b>registra un GPS por su cuenta</b>— elige uno de estos planes y se le descuenta su costo en <b>créditos</b>.</li>
          <li>Si no tiene créditos suficientes, el registro se rechaza o queda <b>pendiente</b> hasta que le recargues. Al recargar, se activa solo.</li>
          <li>Los planes de 1 año se renuevan cada año: se avisa con 5 días, y si nadie responde se cobra de sus créditos (o se factura / queda en negativo, según la empresa).</li>
        </ol>
      </div>
      <Table columns={[{ label: 'Plan', render: (p) => <b>{planName(p.plan_code, p.term)}</b> }, { label: 'Cuesta', render: (p) => <>{Number(p.credits).toLocaleString('es-DO')} {Number(p.credits) === 1 ? 'crédito' : 'créditos'}</> }, { label: 'Dura', render: (p) => (p.term === 'lifetime' ? 'Para siempre' : '1 año, renovable') }, { label: 'Incluye', render: (p) => <small>{planIncludes(p)}</small> }, { label: '', render: (p) => <button type="button" className="btn small" onClick={() => setEditing(p)}>Cambiar costo</button> }]} rows={sorted.map((p) => ({ ...p, id: `${p.plan_code}:${p.term}` }))} />
      <p className="hint">Un crédito parte de US$5 (ajústalo cambiando el costo de cada plan). Cargar créditos a una empresa: Administración → Licencias y créditos.</p>
      {editing && <FormModal title={`Costo · ${planName(editing.plan_code, editing.term)}`} onClose={() => setEditing(null)} fields={[{ key: 'credits', label: 'Créditos que cuesta', type: 'number', required: true, min: 0, default: editing.credits }, ...(editing.plan_code === 'plus' ? [{ key: 'whatsappMessages', label: 'Mensajes de WhatsApp incluidos', type: 'number', default: editing.whatsapp_messages }, { key: 'whatsappMonths', label: 'Meses de WhatsApp', type: 'number', default: editing.whatsapp_months }] : [])]}
        onSubmit={async (body) => { await put('/api/license-catalog', { planCode: editing.plan_code, term: editing.term, credits: body.credits, whatsappMessages: body.whatsappMessages ?? editing.whatsapp_messages ?? 0, whatsappMonths: body.whatsappMonths ?? editing.whatsapp_months ?? 0 }); await reload(); }} />}
    </>
  );
}

export default function AdminPage({ companies = [], reloadCompanies }) {
  const { me, companyId } = useFleet();
  const isPlatform = me.role === 'platform_admin';
  const isAdmin = ADMINS.includes(me.role);
  const sections = useMemo(() => [
    ['overview', 'Resumen', true], ['devices', 'GPS', true], ['vehicles', 'Vehículos', true], ['drivers', 'Conductores', true],
    ['customers', 'Clientes finales', isAdmin], ['users', 'Usuarios', isAdmin], ['licenses', 'Licencias y créditos', isAdmin], ['settings', 'Ajustes', isAdmin && !isPlatform], ['audit', 'Auditoría', isAdmin],
    ['companies', 'Empresas', isPlatform || me.role === 'reseller_admin'], ['resellers', 'Distribuidores', isPlatform], ['inventory', 'Inventario', isPlatform], ['plans', 'Planes de licencia', isPlatform], ['whatsapp', 'WhatsApp', isPlatform], ['browser', 'Avisos del navegador', isPlatform]
  ].filter(([, , allowed]) => allowed).map(([id, label]) => [id, label]), [isAdmin, isPlatform, me.role]);
  const [tab, setTab] = useState('overview');
  const needsCompany = ['vehicles', 'drivers', 'licenses', 'settings'].includes(tab) && !companyId && !me.companyId;

  return (
    <div className="page">
      <Tabs value={tab} onChange={setTab} tabs={sections} />
      {needsCompany ? <Empty icon="🏢" title="Elige una empresa">Selecciona la empresa en la parte superior para ver esta sección.</Empty> : (
        <>
          {tab === 'overview' && <Overview companyId={companyId} />}
          {tab === 'devices' && <Devices me={me} companyId={companyId} companies={companies} />}
          {tab === 'vehicles' && <Vehicles me={me} companyId={companyId} />}
          {tab === 'drivers' && <Drivers me={me} companyId={companyId} />}
          {tab === 'customers' && <Customers me={me} companyId={companyId} />}
          {tab === 'users' && <Users me={me} companyId={companyId} companies={companies} />}
          {tab === 'licenses' && <Licenses me={me} companyId={companyId} />}
          {tab === 'settings' && <CompanySettings me={me} companyId={companyId} />}
          {tab === 'audit' && <Audit companyId={companyId} />}
          {tab === 'companies' && <Companies me={me} reload={reloadCompanies} companies={companies} />}
          {tab === 'resellers' && <Resellers />}
          {tab === 'inventory' && <Inventory companies={companies} />}
          {tab === 'plans' && <Plans />}
          {tab === 'whatsapp' && <WhatsappAdmin />}
          {tab === 'browser' && <FirebaseAdmin />}
        </>
      )}
    </div>
  );
}
