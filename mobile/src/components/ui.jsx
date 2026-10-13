import React, { useEffect, useRef, useState } from 'react';
import { ICONS } from '@portal/lib/format.js';

// Iconos de trazo (los del diseño aprobado).
const PATHS = {
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  bell: 'M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c0-4 4-6 8-6s8 2 8 6',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5',
  back: 'M15 5l-7 7 7 7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  power: 'M12 3v8M6.5 6.5a8 8 0 1011 0',
  share: 'M18 2a3 3 0 100 6 3 3 0 000-6zM6 9a3 3 0 100 6 3 3 0 000-6zM18 16a3 3 0 100 6 3 3 0 000-6zM8.7 10.7l6.6-4.4M8.7 13.3l6.6 4.4',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  locate: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM12 4a8 8 0 100 16 8 8 0 000-16zM12 1v3M12 20v3M1 12h3M20 12h3',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  chevron: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  route: 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 17h6a3 3 0 000-6h-2a3 3 0 010-6h6',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  finger: 'M12 11c0 3-1 5-2.5 7M8 8a5 5 0 019 2c0 3-.5 5.5-1.5 7.5M5 12a7 7 0 0113-3M5 15c0-1 0-2 .5-3M12 15c0 2-.5 3.5-1 5',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z'
};
export function Icon({ name, size = 22, color = 'currentColor', fill = false, stroke = 2 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={fill ? 'none' : color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name] || ''} /></svg>;
}

// Estado → colores del diseño (verde en marcha, ámbar detenido, gris sin señal).
export const TONE = {
  moving: { tile: 't-green', ink: 'c-green', dot: '#16a34a', label: 'En movimiento' },
  idle: { tile: 't-amber', ink: 'c-amber', dot: '#f59e0b', label: 'Ralentí' },
  stopped: { tile: 't-amber', ink: 'c-amber', dot: '#f59e0b', label: 'Detenido' },
  offline: { tile: 't-gray', ink: 'c-gray', dot: '#8a96a8', label: 'Sin señal' },
  no_data: { tile: 't-gray', ink: 'c-gray', dot: '#cbd5e1', label: 'Sin datos aún' }
};
export const groupOf = (status) => (status === 'moving' ? 'moving' : status === 'idle' || status === 'stopped' ? 'stopped' : 'offline');

export function VehicleIcon({ device, size = 'md' }) {
  const tone = TONE[device.live.status] || TONE.no_data;
  return <div className={`vic ${size === 'sm' ? 'sm' : ''} ${tone.tile}`} dangerouslySetInnerHTML={{ __html: ICONS[device.iconKey] || ICONS.car }} />;
}

export function Chip({ on, dot, children, onClick, count, flat }) {
  return <button type="button" className={`chip${on ? ' on' : ''}${flat ? ' flat' : ''}`} onClick={onClick}>{dot && <i style={{ background: dot }} />}{children}{count != null && <em>{count}</em>}</button>;
}

export function Toast({ message, onDone }) {
  useEffect(() => { if (!message) return undefined; const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [message, onDone]);
  return message ? <div className="toast" role="status">{message}</div> : null;
}

export function useToast() {
  const [message, setMessage] = useState('');
  const show = useRef((text) => setMessage(text)).current;
  return [message, show, () => setMessage('')];
}

export function Modal({ children, onClose }) {
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" role="dialog" aria-modal="true"><div className="grab" style={{ alignSelf: 'center' }} />{children}</div>
    </div>
  );
}

export const ageLabel = (iso) => {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `hace ${Math.floor(s / 86400)} d`;
};
