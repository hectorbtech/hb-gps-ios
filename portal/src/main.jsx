import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { api, explain, get, post } from './lib/api.js';
import { FleetProvider, useFleet } from './lib/fleet.jsx';
import { ROLE_LABELS, ago, dateTime } from './lib/format.js';
import { Toasts, Field, useAction } from './components/ui.jsx';
import LivePage from './pages/LivePage.jsx';
import { AlertPreferences } from './components/AlertPreferences.jsx';
import { playAlert, unlockAudio } from './lib/sound.js';
import { refreshWebPush } from './lib/webpush.js';

const ZonesPage = lazy(() => import('./pages/ZonesPage.jsx'));
const EventsPage = lazy(() => import('./pages/EventsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
const HelpPage = lazy(() => import('./pages/HelpPage.jsx'));
const SharePage = lazy(() => import('./pages/SharePage.jsx'));

// Qué puede hacer cada rol (el servidor vuelve a validarlo siempre; esto solo decide qué se muestra).
const NAV = [
  ['live', '🗺️', 'Mapa en vivo', () => true],
  ['zones', '▭', 'Geovallas', (me) => me.role !== 'end_customer'],
  ['routes', '🛣️', 'Rutas seguras', (me) => me.role !== 'end_customer'],
  ['events', '🔔', 'Eventos y alertas', () => true],
  ['reports', '📊', 'Reportes', (me) => me.role !== 'end_customer'],
  ['admin', '⚙️', 'Administración', (me) => ['platform_admin', 'reseller_admin', 'company_admin', 'operator'].includes(me.role)],
  ['account', '👤', 'Mi cuenta', (me) => me.role === 'end_customer'],
  ['help', '❓', 'Ayuda', () => true]
];

// Tres entradas, como antes: /admin (administración de HB), /distribuidor (revendedores) y / (empresas y clientes).
const PATH = window.location.pathname;
const MODE = PATH.startsWith('/admin') ? 'admin' : PATH.startsWith('/distribuidor') ? 'reseller' : 'client';
const HOME = { admin: '/admin', reseller: '/distribuidor', client: '/' };
const PORTAL_TITLE = { admin: 'Administración HB GPS', reseller: 'Portal de distribuidor', client: 'Portal de cliente' };
const homeFor = (role) => (role === 'platform_admin' ? HOME.admin : role === 'reseller_admin' ? HOME.reseller : HOME.client);

function Login({ onDone }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const { busy, error, run } = useAction();
  const submit = (event) => { event.preventDefault(); run(async () => { await post('/api/auth/login', form); onDone(); }); };
  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand-mark">HB</div>
        <p className="eyebrow">HB GPS · {PORTAL_TITLE[MODE]}</p>
        <h1>Tu flota, en tiempo real.</h1>
        <p>Ubicación al segundo, alertas cuando algo se sale de lo normal, rutas seguras y control a distancia.</p>
        <div className="login-points"><span>● Mapa en vivo</span><span>● Geovallas y rutas seguras</span><span>● Historial de recorridos</span></div>
      </section>
      <form className="login-form" onSubmit={submit}>
        <p className="eyebrow">Acceso seguro</p>
        <h2>{PORTAL_TITLE[MODE]}</h2>
        <Field label="Correo"><input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Contraseña"><input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}

// Campana de notificaciones del portal (las que llegan por "Portal y app").
function Bell() {
  const { unread, setUnread, companyId, select } = useFleet();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    const q = companyId ? `&companyId=${companyId}` : '';
    const r = await (await fetch(`/api/notifications?limit=30${q}`, { credentials: 'include' })).json();
    setItems(r.data || []); setUnread(r.unread || 0);
  }, [companyId, setUnread]);
  useEffect(() => { if (open) load().catch(() => undefined); }, [open, load]);
  const readAll = async () => { await post('/api/notifications/read', { all: true, companyId: companyId || undefined }); await load(); };
  return (
    <div className="bell">
      <button type="button" className="icon-btn" onClick={() => setOpen(!open)} aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ''}`}>🔔{unread > 0 && <em>{unread > 99 ? '99+' : unread}</em>}</button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notificaciones">
          <AlertPreferences />
          <header><b>Notificaciones</b>{unread > 0 && <button type="button" className="link-btn" onClick={readAll}>Marcar todas como leídas</button>}</header>
          <ul>{items.map((n) => <li key={n.id} className={n.read_at ? '' : 'unread'}><button type="button" onClick={() => { if (n.device_id) select(n.device_id); window.location.hash = '#/live'; setOpen(false); }}><b>{n.title}</b><span>{n.body}</span><small>{ago(n.created_at)}</small></button></li>)}{!items.length && <li className="muted pad">Sin notificaciones.</li>}</ul>
        </div>
      )}
    </div>
  );
}

const sectionFromHash = () => (window.location.hash.replace(/^#\/?/, '').split('/')[0] || (MODE === 'admin' ? 'admin' : 'live'));

function Shell({ me, onLogout, companies, companyId, setCompanyId, reloadCompanies }) {
  const fleet = useFleet();
  const [section, setSection] = useState(sectionFromHash());
  const [menu, setMenu] = useState(false);
  // Sonido y avisos del navegador: el primer toque desbloquea el audio; el service worker avisa cuando llega un aviso con la pestaña abierta o en segundo plano.
  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    refreshWebPush();
    const onMessage = (event) => {
      if (event.data?.type === 'hbgps-alert') playAlert(event.data.severity);
      if (event.data?.type === 'hbgps-open' && event.data.deviceId) { fleet.select(event.data.deviceId); window.location.hash = '#/live'; }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); navigator.serviceWorker?.removeEventListener('message', onMessage); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => { setSection(sectionFromHash()); setMenu(false); }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  // En el móvil el menú es un panel que tapa el botón ☰: se cierra con la X, tocando fuera, con Esc o al elegir una sección (aunque sea la misma).
  useEffect(() => { if (!menu) return undefined; const on = (event) => { if (event.key === 'Escape') setMenu(false); }; window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, [menu]);
  const items = NAV.filter(([, , , allowed]) => allowed(me));
  const current = items.find(([id]) => id === section) ? section : 'live';
  const needsCompany = (me.role === 'reseller_admin' || me.role === 'platform_admin') && companies.length > 0;
  const summary = fleet.summary;

  return (
    <div className={`shell${menu ? ' menu-open' : ''}${current === 'live' ? ' rail' : ''}`}>
      <aside className="side">
        <div className="side-brand"><span className="brand-mark small">HB</span><div><b>HB GPS</b><small>Centro de control</small></div><button type="button" className="icon-btn side-close" onClick={() => setMenu(false)} aria-label="Cerrar menú">✕</button></div>
        <nav aria-label="Secciones">
          {items.map(([id, icon, label]) => <a key={id} href={`${HOME[MODE]}#/${id}`} className={current === id ? 'on' : ''} title={label} onClick={() => setMenu(false)}><span aria-hidden="true">{icon}</span><em className="lbl">{label}</em></a>)}
        </nav>
        <div className="side-foot">
          <div className="fleet-mini">
            <span><i className="dot" style={{ background: '#16a34a' }} /> {summary.moving || 0} en marcha</span>
            <span><i className="dot" style={{ background: '#f59e0b' }} /> {(summary.idle || 0) + (summary.stopped || 0)} detenidos</span>
            <span><i className="dot" style={{ background: '#6b7280' }} /> {(summary.offline || 0) + (summary.no_data || 0)} sin señal</span>
          </div>
          <div className="me"><span className="avatar">{(me.name || '?').slice(0, 1).toUpperCase()}</span><div><b>{me.name}</b><small>{ROLE_LABELS[me.role] || me.role}</small></div></div>
          <button type="button" className="btn small block" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} aria-hidden="true" />}
      <div className="workspace">
        <header className="topbar">
          <button type="button" className="icon-btn hamburger" onClick={() => setMenu(!menu)} aria-label="Menú" aria-expanded={menu}>☰</button>
          <h1>{items.find(([id]) => id === current)?.[2]}</h1>
          {needsCompany && (
            <label className="company-switch"><span>Empresa</span>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {me.role === 'platform_admin' && <option value="">Todas</option>}
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <Bell />
        </header>
        <main className="content">
          {fleet.connection !== 'live' && fleet.loaded && <div className="callout warn-bar">Sin conexión en vivo: se actualiza cada 15 segundos hasta que vuelva.</div>}
          <Suspense fallback={<div className="loading">Cargando…</div>}>
            {current === 'live' && <LivePage />}
            {current === 'zones' && <ZonesPage key="zones" initialTab="geofences" />}
            {current === 'routes' && <ZonesPage key="routes" initialTab="routes" />}
            {current === 'events' && <EventsPage />}
            {current === 'reports' && <ReportsPage />}
            {current === 'admin' && <AdminPage companies={companies} reloadCompanies={reloadCompanies} />}
            {current === 'account' && <AccountPage />}
            {current === 'help' && <HelpPage />}
          </Suspense>
        </main>
      </div>
      <Toasts toasts={fleet.toasts} onDismiss={fleet.dismissToast} onOpen={(t) => { if (t.deviceId) { fleet.select(t.deviceId); window.location.hash = '#/live'; } }} />
    </div>
  );
}

function App() {
  const [me, setMe] = useState(null); // null = cargando, false = sin sesión
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');

  const load = useCallback(async () => {
    try {
      const profile = (await api('/api/auth/me')).data;
      setMe(profile);
      if (profile.role === 'reseller_admin') {
        const list = await get('/api/reseller/companies');
        setCompanies(list); setCompanyId((current) => current || list[0]?.id || '');
      } else if (profile.role === 'platform_admin') {
        const list = await get('/api/companies');
        setCompanies(list); setCompanyId((current) => current);
      } else { setCompanies([]); setCompanyId(profile.companyId || ''); }
    } catch { setMe(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setMe(false); };

  if (me === null) return <div className="loading full">Cargando…</div>;
  if (me === false) return <Login onDone={() => { setMe(null); load(); }} />;
  // Cada rol vive en su entrada: quien entra por otra se envía a la suya (el servidor valida el rol en cada llamada).
  if (homeFor(me.role) !== HOME[MODE]) { window.location.replace(homeFor(me.role)); return <div className="loading full">Abriendo tu portal…</div>; }
  // Un distribuidor sin empresas asignadas todavía no ve nada: se lo decimos claro en vez de mostrar un mapa vacío.
  if (me.role === 'reseller_admin' && companies.length === 0) return <div className="loading full">Aún no tienes empresas asignadas. Pide a HB GPS que te asigne una.<button type="button" className="btn" onClick={logout}>Cerrar sesión</button></div>;
  return (
    <FleetProvider key={companyId || 'all'} me={me} companyId={me.role === 'reseller_admin' || me.role === 'platform_admin' ? companyId || undefined : undefined}>
      <Shell me={me} onLogout={logout} companies={companies} companyId={companyId} setCompanyId={setCompanyId} reloadCompanies={load} />
    </FleetProvider>
  );
}

function Root() {
  const share = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{20,})$/);
  if (share) return <Suspense fallback={<div className="loading full">Cargando…</div>}><SharePage token={share[1]} /></Suspense>;
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
