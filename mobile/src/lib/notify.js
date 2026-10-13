import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './api.js';

let ready = false;
let counter = Math.floor(Date.now() / 1000) % 1_000_000;

// Avisos del teléfono (barra de notificaciones) para alertas importantes mientras la app está abierta o en segundo plano.
export async function setupNotifications() {
  if (!isNative || ready) return;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({ id: 'alerts', name: 'Alertas de los GPS', description: 'Desvíos de ruta, cortes de energía, exceso de velocidad y más', importance: 5, visibility: 1, vibration: true });
    ready = true;
  } catch { /* sin permiso: las alertas se ven dentro de la app */ }
}

export async function notifyAlert(title, body, extra = {}) {
  if (!isNative || !ready) return;
  try { counter += 1; await LocalNotifications.schedule({ notifications: [{ id: counter, title, body, channelId: 'alerts', extra }] }); } catch { /* ignorado */ }
}

export function onNotificationTap(handler) {
  if (!isNative) return () => undefined;
  const sub = LocalNotifications.addListener('localNotificationActionPerformed', (event) => handler(event.notification?.extra || {}));
  return () => { sub.then((s) => s.remove()).catch(() => undefined); };
}
