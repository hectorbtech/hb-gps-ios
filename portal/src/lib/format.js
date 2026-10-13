export const STATUS = {
  moving: { label: 'En movimiento', color: '#16a34a', order: 0 },
  idle: { label: 'Detenido, motor encendido', color: '#f59e0b', order: 1 },
  stopped: { label: 'Detenido', color: '#2563eb', order: 2 },
  offline: { label: 'Sin señal', color: '#9ca3af', order: 3 },
  no_data: { label: 'Sin datos aún', color: '#cbd5e1', order: 4 }
};
// Íconos del mapa: emoji o un dibujo propio cuando no existe emoji (cuatrimoto). Son textos fijos, nunca datos del usuario.
const draw = (body) => `<svg class="ico-svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  car: '🚗', suv: '🚙', van: '🚐', canter: '🛻', truck: '🚚', bus: '🚌', motorcycle: '🏍️', scooter: '🛵',
  atv: draw('<rect x="8.5" y="5" width="7" height="14" rx="2.2"/><rect x="3.5" y="4" width="3.6" height="5.6" rx="1.2"/><rect x="16.9" y="4" width="3.6" height="5.6" rx="1.2"/><rect x="3.5" y="14.4" width="3.6" height="5.6" rx="1.2"/><rect x="16.9" y="14.4" width="3.6" height="5.6" rx="1.2"/><path d="M10 9h4M12 9v4"/>'),
  ebike: '<span class="ico-ebike">🚲<i>⚡</i></span>', boat: '🛥️', equipment: '⚙️', personal: '📍'
};
export const ICON_OPTIONS = [['car', 'Carro'], ['suv', 'SUV / Jeepeta'], ['van', 'Camioneta'], ['canter', 'Camión liviano (Canter)'], ['truck', 'Camión'], ['bus', 'Autobús'], ['motorcycle', 'Motor'], ['scooter', 'Motoconcho / motoneta'], ['atv', 'Cuatrimoto (4 ruedas)'], ['ebike', 'Bicicleta eléctrica'], ['boat', 'Yate o lancha'], ['equipment', 'Equipo o maquinaria'], ['personal', 'Objeto personal']];
export const SEVERITY = { critical: { label: 'Crítica', color: '#dc2626' }, warning: { label: 'Aviso', color: '#d97706' }, info: { label: 'Informativa', color: '#2563eb' } };
export const EVENT_LABELS = {
  deviceOnline: 'GPS en línea', deviceOffline: 'GPS sin señal', ignitionOn: 'Encendido', ignitionOff: 'Apagado', geofenceEnter: 'Entró a geovalla', geofenceExit: 'Salió de geovalla',
  overspeed: 'Exceso de velocidad', routeStarted: 'Inició ruta', routeDeviation: 'Desvío de ruta', routeReturn: 'Volvió a la ruta', routeCompleted: 'Completó ruta',
  idleLong: 'Ralentí prolongado', lowBattery: 'Batería baja', powerCut: 'Corte de energía', sos: 'SOS', tow: 'Posible remolque', harshAcceleration: 'Aceleración brusca',
  harshBraking: 'Frenada brusca', harshCornering: 'Curva brusca', maintenanceDue: 'Mantenimiento', engineCut: 'Motor apagado', engineResume: 'Motor restablecido', commandFailed: 'Falló comando', powerRestored: 'Energía restablecida', lowVoltage: 'Voltaje bajo del vehículo', clockCorrected: 'Hora del GPS corregida'
};
export const COMMAND_STATUS = { queued: 'En cola', waiting_safe_speed: 'Esperando velocidad segura', sent: 'Enviado', failed: 'Falló', cancelled: 'Cancelado', expired: 'Caducó' };
export const ROLE_LABELS = { platform_admin: 'Administrador de plataforma', reseller_admin: 'Distribuidor', company_admin: 'Administrador de empresa', operator: 'Operador', viewer: 'Solo lectura', end_customer: 'Cliente final' };
export const SERVICE_LABELS = { active: 'Vigente', grace: 'En gracia (renovación)', expired: 'Vencida', unlicensed: 'Sin licencia', blocked: 'Cuenta suspendida' };

export const km = (value, digits = 1) => `${Number(value || 0).toLocaleString('es-DO', { maximumFractionDigits: digits, minimumFractionDigits: digits })} km`;
export const kph = (value) => `${Math.round(Number(value || 0))} km/h`;
export const dateTime = (value) => (value ? new Date(value).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const timeOnly = (value) => (value ? new Date(value).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export function ago(value, now = Date.now()) {
  if (!value) return 'nunca';
  const s = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (s < 10) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `hace ${Math.floor(s / 86400)} d`;
}
export function duration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
export const compass = (deg) => (deg == null ? '—' : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]);
export const deviceName = (d) => d?.name || d?.imei || 'GPS';
export const localInput = (date) => { const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
export const startOfDay = (offsetDays = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offsetDays); return d; };
export const speedColor = (v) => (v >= 80 ? '#dc2626' : v >= 40 ? '#f59e0b' : '#16a34a');

// Calidad de la ubicación que reporta el GPS y cada cuánto manda datos (para saber por qué un recorrido se ve exacto o a saltos).
const QUALITY_LABELS = { good: 'Buena', fair: 'Regular', approx: 'Aproximada (pocos satélites)', poor: 'Mala' };
export const REJECT_LABELS = { jump: 'salto imposible del GPS', few_satellites: 'muy pocos satélites', bad_hdop: 'precisión muy mala', bad_accuracy: 'precisión muy mala', invalid: 'sin fix de satélites', poor: 'mala calidad' };
export function precisionText(quality, accuracyM) {
  if (!quality) return null;
  return `${QUALITY_LABELS[quality] || quality}${Number.isFinite(Number(accuracyM)) && accuracyM !== null ? ` · alrededor de ${Math.round(accuracyM)} m` : ''}`;
}
export function cadenceText(cadence) {
  if (!cadence || cadence.allS == null) return null;
  const moving = cadence.movingS;
  if (moving == null) return `cada ${cadence.allS} s`;
  return `cada ${moving} s en marcha${moving > 30 ? ' · lento: el recorrido en vivo se verá a saltos (baja el intervalo de reporte)' : ''}`;
}
