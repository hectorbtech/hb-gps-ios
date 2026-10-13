import React, { useEffect, useState } from 'react';
import { explain } from '../lib/api.js';
import { ICONS, STATUS } from '../lib/format.js';

export function Modal({ title, onClose, children, wide = false, footer }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

export const Field = ({ label, hint, children, wide }) => <label className={`field${wide ? ' wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;

export function Badge({ tone = 'gray', children }) { return <span className={`badge ${tone}`}>{children}</span>; }

export function StatusDot({ status }) { return <i className="dot" style={{ background: (STATUS[status] || STATUS.no_data).color }} title={(STATUS[status] || STATUS.no_data).label} />; }
export const DeviceIcon = ({ device }) => <span className="dev-ico" dangerouslySetInnerHTML={{ __html: ICONS[device.iconKey] || '🚗' }} />;

export function Toasts({ toasts, onDismiss, onOpen }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.severity || 'info'}`} role="status">
          <button type="button" className="toast-main" onClick={() => { onOpen?.(toast); onDismiss(toast.id); }}><b>{toast.title}</b><span>{toast.body}</span></button>
          <button type="button" className="icon-btn" onClick={() => onDismiss(toast.id)} aria-label="Cerrar aviso">✕</button>
        </div>
      ))}
    </div>
  );
}

/** Ejecuta una acción mostrando "Guardando…" y el error en español si falla. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true); setError('');
    try { return await fn(); } catch (err) { setError(explain(err)); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

export function Empty({ icon = '📭', title, children }) { return <div className="empty"><span>{icon}</span><b>{title}</b>{children && <p>{children}</p>}</div>; }

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}{count != null && <em>{count}</em>}</button>)}</div>;
}

export function ConfirmButton({ children, onConfirm, message, className = 'btn danger' }) {
  return <button type="button" className={className} onClick={() => { if (window.confirm(message)) onConfirm(); }}>{children}</button>;
}
