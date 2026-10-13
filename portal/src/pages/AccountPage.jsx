import React, { useState } from 'react';
import { post } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { ROLE_LABELS, SERVICE_LABELS, STATUS, dateTime, deviceName } from '../lib/format.js';
import { Badge, Empty, Field, useAction } from '../components/ui.jsx';
import { EditDeviceModal } from '../components/DeviceModals.jsx';

// Portal del cliente final: sus equipos (rastreo, nombre, ícono, comandos y alertas se manejan desde el mapa) y su contraseña.
export default function AccountPage() {
  const { me, devices, refresh } = useFleet();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const { busy, error, run, setError } = useAction();
  const [done, setDone] = useState(false);
  const change = () => run(async () => { await post('/api/auth/change-password', form); setForm({ currentPassword: '', newPassword: '' }); setDone(true); });
  return (
    <div className="page">
      <div className="kpis">
        <div><b>{devices.length}</b><small>equipos asignados a ti</small></div>
        <div><b>{devices.filter((d) => d.live.status === 'moving').length}</b><small>en movimiento ahora</small></div>
        <div><b>{me.name}</b><small>{ROLE_LABELS[me.role]} · {me.email}</small></div>
      </div>
      <h4>Mis equipos</h4>
      <div className="table-wrap">
        <table className="table"><thead><tr><th>Equipo</th><th>Estado</th><th>Servicio</th><th /></tr></thead>
          <tbody>{devices.map((d) => (
            <tr key={d.id}>
              <td><b>{deviceName(d)}</b><small className="muted block">{[d.plate, d.imei].filter(Boolean).join(' · ')}</small></td>
              <td><span className="status-pill" style={{ '--c': (STATUS[d.live.status] || STATUS.no_data).color }}>{(STATUS[d.live.status] || STATUS.no_data).label}</span></td>
              <td><Badge tone={d.license?.service === 'active' ? 'green' : d.license?.service === 'grace' ? 'amber' : 'red'}>{SERVICE_LABELS[d.license?.service] || '—'}</Badge>{d.license?.expiresAt && <small className="muted block">vence {dateTime(d.license.expiresAt)}</small>}</td>
              <td className="actions"><a className="btn small" href="#/live" onClick={() => {}}>Ver en el mapa</a><button type="button" className="btn small" onClick={() => setEditing(d)}>Nombre e ícono</button></td>
            </tr>
          ))}</tbody>
        </table>
        {!devices.length && <Empty icon="📍" title="Todavía no tienes equipos asignados">Tu proveedor los asignará a tu cuenta.</Empty>}
      </div>
      <h4>Cambiar mi contraseña</h4>
      <div className="form-grid" style={{ maxWidth: 520 }}>
        <Field label="Contraseña actual"><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => { setForm({ ...form, currentPassword: e.target.value }); setDone(false); setError(''); }} /></Field>
        <Field label="Nueva contraseña (12 o más)"><input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => { setForm({ ...form, newPassword: e.target.value }); setDone(false); }} /></Field>
      </div>
      {error && <p className="form-error">{error}</p>}
      {done && <p className="form-ok">Contraseña cambiada. Las demás sesiones abiertas se cerraron.</p>}
      <div className="toolbar"><button type="button" className="btn primary" disabled={busy || form.newPassword.length < 12 || !form.currentPassword} onClick={change}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button></div>
      {editing && <EditDeviceModal device={editing} me={me} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
