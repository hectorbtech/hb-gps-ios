import React, { useEffect, useState } from 'react';
import { explain } from '../lib/api.js';
import { playAlert, saveSoundPrefs, soundPrefs } from '../lib/sound.js';
import { WEB_PUSH_TEXT, disableWebPush, enableWebPush, webPushStatus } from '../lib/webpush.js';

// Cómo quiere cada persona enterarse: sonido dentro del portal y avisos del navegador (con la pestaña en segundo plano o cerrada). Se guarda en este navegador.
export function AlertPreferences() {
  const [prefs, setPrefs] = useState(soundPrefs);
  const [push, setPush] = useState({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const refresh = () => webPushStatus().then(setPush).catch(() => setPush({ state: 'unsupported' }));
  useEffect(() => { if (open) refresh(); }, [open]);
  const change = (patch) => setPrefs(saveSoundPrefs(patch));
  const toggle = async () => {
    setBusy(true); setError('');
    try { if (push.state === 'on') await disableWebPush(); else await enableWebPush(); } catch (err) { setError(WEB_PUSH_TEXT[err?.message] || explain(err)); }
    await refresh(); setBusy(false);
  };
  return (
    <div className="alert-prefs">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '▾' : '▸'} Sonido y avisos del navegador</button>
      {open && (
        <div className="prefs-body">
          <label className="check"><input type="checkbox" checked={prefs.enabled} onChange={(e) => change({ enabled: e.target.checked })} /> Hacer sonar las alertas</label>
          <label className="field"><span>Cuáles suenan</span>
            <select value={prefs.level} onChange={(e) => change({ level: e.target.value })} disabled={!prefs.enabled}>
              <option value="critical">Solo las críticas (SOS, corte de energía, desvío)</option>
              <option value="warning">Críticas y advertencias</option>
              <option value="all">Todas</option>
            </select>
          </label>
          <label className="field"><span>Volumen</span><input type="range" min="0.1" max="1" step="0.1" value={prefs.volume} onChange={(e) => change({ volume: Number(e.target.value) })} disabled={!prefs.enabled} /></label>
          <div className="row-actions"><button type="button" className="btn small" onClick={() => playAlert('critical', { force: true })}>🔊 Probar sirena</button><button type="button" className="btn small" onClick={() => playAlert('warning', { force: true })}>Probar aviso</button></div>
          <hr />
          <b>Avisos del navegador</b>
          <p className="hint">Llegan aunque esta pestaña esté en segundo plano o cerrada, también en el celular. {push.state === 'loading' ? 'Revisando…' : WEB_PUSH_TEXT[push.state]}</p>
          {['on', 'off'].includes(push.state) && <div className="row-actions"><button type="button" className={`btn small${push.state === 'on' ? '' : ' primary'}`} disabled={busy} onClick={toggle}>{busy ? 'Un momento…' : push.state === 'on' ? 'Desactivar en este navegador' : '🔔 Activar avisos en este navegador'}</button></div>}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
