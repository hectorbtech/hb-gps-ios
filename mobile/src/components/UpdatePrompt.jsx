import React, { useRef, useState } from 'react';
import { downloadAndInstall, finishPlayUpdate, startPlayUpdate } from '../lib/update.js';
import { Icon, Modal } from './ui.jsx';

const mb = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');

// Aviso de versión nueva. En la APK directa descarga el archivo con barra de avance y abre el instalador de Android;
// en Google Play la actualiza Google Play (inmediata si es obligatoria, flexible en segundo plano si no).
// Si la versión instalada es menor que la mínima exigida, el aviso no se puede cerrar.
export default function UpdatePrompt({ update, onClose }) {
  const play = update.channel === 'play';
  const [state, setState] = useState({ phase: update.downloaded ? 'ready' : 'ask', percent: 0, error: '' });
  const handle = useRef(null);

  const go = async () => {
    setState({ phase: 'downloading', percent: 0, error: '' });
    try {
      if (play) {
        handle.current = await startPlayUpdate(update, (e) => setState((s) => (e.downloaded ? { ...s, phase: 'ready', percent: 100 } : { ...s, percent: e.percent ?? s.percent })));
        if (handle.current.immediate) setState({ phase: 'installing', percent: 100, error: '' });
      } else {
        await downloadAndInstall(update, (percent) => setState((s) => ({ ...s, percent })));
        setState({ phase: 'installing', percent: 100, error: '' });
      }
    } catch (err) {
      const code = String(err?.message || err?.code || err);
      setState({ phase: 'ask', percent: 0, error: code.includes('INSTALL_PERMISSION_REQUIRED') ? 'Android necesita tu permiso para instalar. Activa «Permitir de esta fuente» en la pantalla que se abrió, vuelve a la app y toca Actualizar otra vez.' : code.includes('DOWNLOAD_FAILED') ? 'No se pudo descargar. Revisa tu internet e inténtalo de nuevo.' : 'No se pudo iniciar la actualización. Inténtalo de nuevo.' });
    }
  };

  return (
    <Modal onClose={update.mandatory ? undefined : onClose}>
      <div className="row"><div className="vic sm t-blue"><Icon name="down" color="#1d4ed8" /></div><div className="flex1"><div className="nm" style={{ fontSize: 19 }}>{update.mandatory ? 'Actualización necesaria' : 'Hay una versión nueva'}</div><div className="sb">{play ? 'HB GPS · se actualiza desde Google Play' : `HB GPS ${update.versionName}${update.sizeBytes ? ` · ${mb(update.sizeBytes)}` : ''} · tienes la ${update.current}`}</div></div></div>
      {update.notes && <div className="callout blue">{update.notes}</div>}
      {update.mandatory && <p className="muted" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45 }}>Esta versión ya no puede conectarse al servicio. Actualiza para seguir usando HB GPS.</p>}
      {state.phase === 'downloading' && <div><div className="lab"><span>Descargando…</span><b>{state.percent >= 0 ? `${state.percent} %` : ''}</b></div><div style={{ height: 8, borderRadius: 4, background: '#e3e8f0', overflow: 'hidden' }}><div style={{ width: `${Math.max(4, state.percent)}%`, height: '100%', background: '#1d4ed8', transition: 'width .2s' }} /></div></div>}
      {state.phase === 'installing' && <div className="callout blue">{play ? 'Google Play está actualizando la app; se reiniciará sola.' : 'Toca «Instalar» en la pantalla de Android. Al terminar, abre HB GPS de nuevo.'}</div>}
      {state.phase === 'ready' && <div className="callout blue">La actualización ya se descargó. Reinicia la app para terminar de instalarla.</div>}
      {state.error && <div className="callout red" role="alert">{state.error}</div>}
      <div className="actions">
        {!update.mandatory && state.phase !== 'downloading' && <button type="button" className="act" onClick={onClose}>Más tarde</button>}
        {state.phase === 'ready'
          ? <button type="button" className="act p" onClick={() => finishPlayUpdate()}>Reiniciar y actualizar</button>
          : <button type="button" className="act p" disabled={state.phase === 'downloading'} onClick={go}>{state.phase === 'downloading' ? 'Descargando…' : state.phase === 'installing' && !play ? 'Instalar otra vez' : 'Actualizar ahora'}</button>}
      </div>
    </Modal>
  );
}
