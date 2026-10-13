import React, { useState } from 'react';
import { explain } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Icon } from '../components/ui.jsx';

// Pantalla de entrada del diseño: tu flota en tiempo real, correo, contraseña y huella o rostro.
export default function Login({ locked = false }) {
  const { signIn, signInWithBiometric, unlock, bio, lastEmail, signOut } = useAuth();
  const [email, setEmail] = useState(lastEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(bio.available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);

  const attempt = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { if (err?.code !== 'ERR_BIOMETRIC' && !/cancel/i.test(err?.message || '')) setError(explain(err)); } finally { setBusy(false); }
  };
  const submit = (e) => { e.preventDefault(); attempt(() => signIn(email.trim(), password, { remember: remember && bio.available })); };

  return (
    <div className="login">
      <svg className="deco" viewBox="0 0 390 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <g fill="none" stroke="#1b3a66" strokeWidth="2" strokeLinecap="round"><path d="M-10 300 C60 260 110 210 190 200 S320 120 400 70" /><path d="M-10 360 C70 330 150 300 230 290 S340 230 400 190" /><path d="M40 -10 L80 120 L60 260 L110 430" /><path d="M200 -10 L230 90 L300 160 L330 300" /></g>
        <path d="M-10 300 C60 260 110 210 190 200 S320 120 400 70" fill="none" stroke="#2f63d8" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
        <circle cx="228" cy="196" r="9" fill="#16a34a" /><circle cx="228" cy="196" r="18" fill="#16a34a" opacity=".25" />
      </svg>
      <div className="brand"><div className="logo">HB</div><div>HB GPS</div></div>
      <div className="hero"><h1>Tu flota,<br />en tiempo real.</h1><p>Ubicación al segundo, alertas cuando algo se sale de lo normal y control a distancia.</p></div>

      {locked ? (
        <div style={{ position: 'relative', marginTop: 'auto', paddingTop: 26, display: 'grid', gap: 14 }}>
          {error && <div className="err" role="alert">{error}</div>}
          <button type="button" className="btn-main" disabled={busy} onClick={() => attempt(unlock)}>{busy ? 'Verificando…' : 'Desbloquear con huella o rostro'}</button>
          <button type="button" className="btn-ghost" onClick={() => signOut(true)}>Entrar con otra cuenta</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="err" role="alert">{error}</div>}
          <div><label className="lbl" htmlFor="correo">Correo</label><input id="correo" className="inp" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" required /></div>
          <div><label className="lbl" htmlFor="clave">Contraseña</label><input id="clave" className="inp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" required minLength={8} /></div>
          {bio.available && !bio.enabled && <label className="check-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Entrar la próxima vez con huella o rostro</label>}
          <button type="submit" className="btn-main" disabled={busy || !email || password.length < 8}>{busy ? 'Entrando…' : 'Entrar'}</button>
          {bio.available && bio.enabled && <button type="button" className="btn-ghost" disabled={busy} onClick={() => attempt(signInWithBiometric)}><Icon name="finger" size={22} stroke={1.8} />Entrar con huella o rostro</button>}
          <div className="foot">Portal de cliente · <button type="button" onClick={() => setForgot(true)}>¿Olvidaste tu contraseña?</button></div>
          {forgot && <div className="foot" style={{ color: '#c9d4e8' }}>Pide a tu administrador que restablezca tu contraseña desde el portal, o escribe a soporte.</div>}
        </form>
      )}
    </div>
  );
}
