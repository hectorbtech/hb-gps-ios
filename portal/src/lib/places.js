// Ayudas para ubicaciones: enlaces a otros mapas, textos para copiar y cálculos de rumbo y distancia.
export const mapLinks = (lat, lon, line = '', name = '') => {
  const ll = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  const share = encodeURIComponent(`${name ? `${name}: ` : ''}${line ? `${line} · ` : ''}https://www.google.com/maps?q=${ll}`);
  return {
    google: `https://www.google.com/maps?q=${ll}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    osm: `https://www.openstreetmap.org/?mlat=${Number(lat).toFixed(6)}&mlon=${Number(lon).toFixed(6)}#map=18/${Number(lat).toFixed(6)}/${Number(lon).toFixed(6)}`,
    whatsapp: `https://wa.me/?text=${share}`
  };
};

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch { return false; }
  }
}

const rad = (deg) => (deg * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = rad(b[0] - a[0]); const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Índice del punto del recorrido más cercano a una hora (segundos Unix). Los puntos vienen ordenados por hora. */
export function nearestIndex(points, seconds) {
  let lo = 0; let hi = points.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid][0] < seconds) lo = mid + 1; else hi = mid; }
  if (lo > 0 && Math.abs(points[lo - 1][0] - seconds) <= Math.abs(points[lo][0] - seconds)) return lo - 1;
  return lo;
}

/** Nombres claros para lo que reporta el equipo; lo que no esté aquí se muestra tal cual en «otros datos». */
export const ATTRIBUTE_LABELS = {
  sat: ['Satélites', (v) => `${v}`], hdop: ['Precisión del GPS (HDOP)', (v) => `${v} ${Number(v) <= 2 ? '(muy buena)' : Number(v) <= 5 ? '(buena)' : '(regular)'}`],
  rssi: ['Señal celular', (v) => `${v}/4`], power: ['Voltaje del vehículo', (v) => `${v} V`], externalVoltage: ['Voltaje del vehículo', (v) => `${v} V`], adc1: ['Entrada analógica 1', (v) => `${v} V`],
  batteryLevel: ['Batería del GPS', (v) => `${v} %`], battery: ['Batería del GPS (voltaje)', (v) => `${v} V`], charge: ['Cargando / con corriente', (v) => (v ? 'Sí' : 'No')],
  ignition: ['Motor encendido', (v) => (v ? 'Sí' : 'No')], motion: ['En movimiento (según el equipo)', (v) => (v ? 'Sí' : 'No')], alarm: ['Alarma reportada', (v) => `${v}`],
  odometer: ['Odómetro del equipo', (v) => `${(Number(v) / 1000).toLocaleString('es-DO', { maximumFractionDigits: 1 })} km`], totalDistance: ['Distancia total del equipo', (v) => `${(Number(v) / 1000).toLocaleString('es-DO', { maximumFractionDigits: 1 })} km`],
  distance: ['Distancia desde el punto anterior', (v) => `${Math.round(Number(v))} m`], hours: ['Horas de motor', (v) => `${(Number(v) / 3600000).toLocaleString('es-DO', { maximumFractionDigits: 1 })} h`],
  status: ['Estado reportado', (v) => `${v}`], archive: ['Dato guardado por el equipo', (v) => (v ? 'Sí (llegó con retraso)' : 'No')], blocked: ['Bloqueado', (v) => (v ? 'Sí' : 'No')],
  event: ['Evento del equipo', (v) => `${v}`], type: ['Tipo de paquete', (v) => `${v}`], mcc: ['Código de país (red celular)', (v) => `${v}`], mnc: ['Código de red celular', (v) => `${v}`],
  lac: ['Área de la torre (LAC)', (v) => `${v}`], cid: ['Torre celular (CID)', (v) => `${v}`], gsm: ['Señal GSM', (v) => `${v}`], temp1: ['Temperatura 1', (v) => `${v} °C`], fuel: ['Combustible', (v) => `${v}`],
  rpm: ['Revoluciones (RPM)', (v) => `${v}`], obdSpeed: ['Velocidad por OBD', (v) => `${v} km/h`], coolantTemp: ['Temperatura del motor', (v) => `${v} °C`], throttle: ['Acelerador', (v) => `${v} %`]
};
