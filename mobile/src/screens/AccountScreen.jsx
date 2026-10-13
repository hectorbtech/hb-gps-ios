import React, { useEffect, useState } from 'react';
import { ROLE_LABELS } from '@portal/lib/format.js';
import { explain, isNative, post } from '../lib/api.js';
import { appVersion, checkUpdate, isIos } from '../lib/update.js';
import { useAuth } from '../lib/auth.jsx';
import { useFleet } from '../lib/fleet.jsx';
import { setupNotifications } from '../lib/notify.js';
import { Icon, Modal, Toast, useToast } from '../components/ui.jsx';

const CAN_MANAGE_ROUTES = new Set(['platform_admin', 'reseller_admin', 'company_admin', 'operator']);

export default function AccountScreen({ onRoutes, onUpdate }) {
  const { me, signOut, bio, enableBiometric, disableBiometric, refreshBio } = useAuth();
  const { companies, companyId, setCompanyId, needsCompany, connection } = useFleet();
  const [toast, say, clear] = useToast();
  const [pwd, setPwd] = useState(false);
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [bioPassword, setBioPassword] = useState(null);
  useEffect(() => { appVersion().then((v) => setVersion(v.version)).catch(() => undefined); }, []);
  const company = companies.find((c) => c.id === (companyId || me.companyId));

  const toggleBiometric = async () => {
    if (bio.enabled) { await disableBiometric(); await refreshBio(); say('Entrada con huella desactivada'); } else setBioPassword('');
  };

  return (
    <section className="screen" aria-label="Cuenta">
      <div className="head"><h1>Cuenta</h1></div>
      <div className="scroll" style={{ paddingBottom: 24 }}>
        <div className="row" style={{ padding: '18px 16px 0' }}>
          <div className="avatar">{(me.name || '?').slice(0, 1).toUpperCase()}</div>
          <div className="flex1"><div className="nm ell">{me.name}</div><div className="sb ell">{me.email}</div><div className="sb">{ROLE_LABELS[me.role] || me.role}{company ? ` · ${company.name}` : ''}</div></div>
        </div>

        {(needsCompany || companies.length > 1) && me.role !== 'company_admin' && me.role !== 'operator' && me.role !== 'viewer' && (
          <div className="card"><label className="crow"><div className="grow">Empresa<small>Los GPS y alertas que ves</small></div>
            <select className="select" style={{ flex: '0 0 55%' }} value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Empresa">{!needsCompany && <option value="">Todas</option>}{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
        )}

        <div className="card">
          {CAN_MANAGE_ROUTES.has(me.role) && <button type="button" className="crow" onClick={onRoutes}><Icon name="route" /><div className="grow">Rutas seguras<small>Avisa si un vehículo se sale de su trayecto</small></div><Icon name="chevron" size={18} color="#8a96a8" /></button>}
          {isNative && (
            <button type="button" className="crow" onClick={toggleBiometric} disabled={!bio.available}><Icon name="finger" stroke={1.8} /><div className="grow">Entrar con huella o rostro<small>{!bio.available ? 'Este teléfono no tiene huella o rostro configurados' : bio.enabled ? 'Activado: la app te la pide al abrir' : 'Desactivado'}</small></div><span className={`tag ${bio.enabled ? 'green' : 'gray'}`}>{bio.enabled ? 'Sí' : 'No'}</span></button>
          )}
          {isNative && <button type="button" className="crow" onClick={async () => { await setupNotifications(); say('Avisos del teléfono revisados'); }}><Icon name="bell" /><div className="grow">Avisos en el teléfono<small>Alertas aunque la app esté en segundo plano</small></div><Icon name="chevron" size={18} color="#8a96a8" /></button>}
          <button type="button" className="crow" onClick={() => setPwd(true)}><Icon name="shield" /><div className="grow">Cambiar contraseña</div><Icon name="chevron" size={18} color="#8a96a8" /></button>
          {isNative && !isIos && <button type="button" className="crow" disabled={checking} onClick={async () => { setChecking(true); try { const u = await checkUpdate(); if (u.available) onUpdate(u); else say('Tienes la versión más reciente'); } catch { say('No se pudo buscar la actualización'); } finally { setChecking(false); } }}><Icon name="down" /><div className="grow">Buscar actualización<small>Versión instalada {version || '—'}</small></div><Icon name="chevron" size={18} color="#8a96a8" /></button>}
        </div>

        <div className="card"><button type="button" className="crow c-red" onClick={() => signOut(true)}><Icon name="logout" /><div className="grow">Cerrar sesión</div></button></div>
        <p className="faint" style={{ textAlign: 'center', fontWeight: 600, fontSize: 12, marginTop: 18 }}>HB GPS{version ? ` · versión ${version}` : ''}</p>
      </div>

      {pwd && <PasswordForm onClose={() => setPwd(false)} onDone={() => { setPwd(false); say('Contraseña cambiada'); }} />}
      {bioPassword !== null && (
        <Modal onClose={() => setBioPassword(null)}>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Activar huella o rostro</h2>
          <p className="muted" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45 }}>Escribe tu contraseña una vez. Se guarda cifrada en el teléfono y solo se usa después de verificar tu huella.</p>
          <input className="input" type="password" autoComplete="current-password" value={bioPassword} onChange={(e) => setBioPassword(e.target.value)} placeholder="Tu contraseña" aria-label="Tu contraseña" />
          <div className="actions"><button type="button" className="act" onClick={() => setBioPassword(null)}>Cancelar</button><button type="button" className="act p" disabled={bioPassword.length < 8} onClick={async () => { try { await post('/api/auth/login', { email: me.email, password: bioPassword }); await enableBiometric(me.email, bioPassword); await refreshBio(); setBioPassword(null); say('Entrada con huella activada'); } catch (err) { say(explain(err)); } }}>Activar</button></div>
        </Modal>
      )}
      <Toast message={toast} onDone={clear} />
    </section>
  );
}

function PasswordForm({ onClose, onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => { setBusy(true); setError(''); try { await post('/api/auth/change-password', { currentPassword: current, newPassword: next }); onDone(); } catch (err) { setError(explain(err)); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose}>
      <h2 style={{ fontSize: 19, fontWeight: 800 }}>Cambiar contraseña</h2>
      <input className="input" type="password" autoComplete="current-password" placeholder="Contraseña actual" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Contraseña actual" />
      <input className="input" type="password" autoComplete="new-password" placeholder="Nueva contraseña (mínimo 12 caracteres)" value={next} onChange={(e) => setNext(e.target.value)} aria-label="Nueva contraseña" />
      {error && <div className="callout red" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="act" onClick={onClose}>Cancelar</button><button type="button" className="act p" disabled={busy || current.length < 8 || next.length < 12} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </Modal>
  );
}
