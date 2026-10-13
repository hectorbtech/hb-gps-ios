import { api, get, post } from './api.js';

// Avisos del navegador (Firebase Cloud Messaging web). Llegan aunque la pestaña esté en segundo plano o cerrada, también en el celular (Chrome/Edge/Firefox y
// Safari de iPhone instalada en la pantalla de inicio). Requieren HTTPS: en una dirección http:// el navegador no permite service workers ni notificaciones.
const STORED = 'hbgps.webpush.token';

export const isSecure = () => typeof window !== 'undefined' && window.isSecureContext;
export const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Estado para mostrar en pantalla:
 * on | off | denied | unsupported | insecure | install (iPhone: primero «Agregar a pantalla de inicio») | not_configured
 */
export async function webPushStatus() {
  if (!isSecure()) return { state: 'insecure' };
  if (!supported()) return { state: isIphone() && !standalone() ? 'install' : 'unsupported' };
  if (isIphone() && !standalone()) return { state: 'install' };
  let config;
  try { config = await get('/api/web-push/config'); } catch { return { state: 'not_configured' }; }
  if (!config?.enabled) return { state: 'not_configured' };
  if (Notification.permission === 'denied') return { state: 'denied', config };
  const token = localStorage.getItem(STORED);
  return { state: token && Notification.permission === 'granted' ? 'on' : 'off', config };
}

async function messagingFor(config) {
  const [{ initializeApp, getApps }, { getMessaging, getToken, deleteToken, isSupported }] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await isSupported())) throw new Error('unsupported');
  const app = getApps().find((a) => a.name === 'hbgps') || initializeApp(config.firebase, 'hbgps');
  return { messaging: getMessaging(app), getToken, deleteToken };
}

async function register(config) {
  const registration = await navigator.serviceWorker.register('/hbgps-sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const { messaging, getToken } = await messagingFor(config);
  const token = await getToken(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('no_token');
  await post('/api/push-tokens', { platform: 'web', token });
  localStorage.setItem(STORED, token);
  return token;
}

/** Pide permiso al navegador (debe llamarse desde un clic) y registra este navegador para recibir avisos. */
export async function enableWebPush() {
  const status = await webPushStatus();
  if (!['off', 'denied'].includes(status.state)) throw new Error(status.state);
  if (status.state === 'denied') throw new Error('denied');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  return register(status.config);
}

/** Al abrir el portal, si ya estaba activado, renueva el registro en silencio (los navegadores cambian el token de vez en cuando). */
export async function refreshWebPush() {
  if (!localStorage.getItem(STORED) || !isSecure() || !supported() || Notification.permission !== 'granted') return;
  try { const config = await get('/api/web-push/config'); if (config?.enabled) await register(config); } catch { /* se reintenta la próxima vez */ }
}

export async function disableWebPush() {
  const token = localStorage.getItem(STORED);
  localStorage.removeItem(STORED);
  if (token) await api('/api/push-tokens', { method: 'DELETE', body: { token } }).catch(() => undefined);
  try {
    const config = await get('/api/web-push/config');
    if (config?.enabled && token) { const { messaging, deleteToken } = await messagingFor(config); await deleteToken(messaging); }
  } catch { /* ya no recibirá avisos de todos modos: el servidor lo desactivó */ }
}

/** Texto para cada estado (lo que ve la persona). */
export const WEB_PUSH_TEXT = {
  on: 'Activados en este navegador.',
  off: 'Desactivados en este navegador.',
  denied: 'El navegador bloqueó los avisos. Actívalos en el candado de la barra de direcciones → Notificaciones.',
  unsupported: 'Este navegador no admite avisos.',
  insecure: 'Los avisos del navegador necesitan que HB GPS se abra con https:// (dirección segura). Mientras tanto la alerta suena dentro de la página abierta.',
  install: 'En iPhone: toca Compartir → «Agregar a pantalla de inicio», abre HB GPS desde ahí y activa los avisos.',
  not_configured: 'HB GPS todavía no activó los avisos del navegador en el servidor.'
};
