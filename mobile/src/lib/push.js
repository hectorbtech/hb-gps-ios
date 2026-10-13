import { Capacitor, registerPlugin } from '@capacitor/core';
import { del, post } from './api.js';
import { store } from './storage.js';

// Avisos push (Firebase): la pantalla del teléfono se enciende con la alerta aunque la app esté cerrada.
// El plugin solo existe en la APK cuando se compiló con el archivo de Firebase (google-services.json); sin él, todo esto se salta sin errores.
const Push = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications') ? registerPlugin('PushNotifications') : null;
let listening = false;
const isIos = Capacitor.getPlatform() === 'ios';

// iPhone: se usa @capacitor-firebase/messaging para obtener el token FCM (el servidor envia por Firebase; un token de APNs no sirve).
// En iPhone el plugin de Capacitor para push se retira al compilar (ver scripts/ios-prepare.mjs) para que no choque con este.
async function registerPushIos(onTap) {
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    let status = await FirebaseMessaging.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') status = await FirebaseMessaging.requestPermissions();
    if (status.receive !== 'granted') return false;
    const save = async (value) => { try { await post('/api/push-tokens', { platform: 'ios', token: value }); await store.set('pushToken', value); } catch { /* se reintenta al abrir */ } };
    if (!listening) {
      listening = true;
      FirebaseMessaging.addListener('tokenReceived', (event) => { if (event.token) save(event.token); });
      FirebaseMessaging.addListener('notificationActionPerformed', (event) => onTap?.(event.notification?.data || {}));
    }
    const { token } = await FirebaseMessaging.getToken();
    if (token) await save(token);
    return Boolean(token);
  } catch { return false; }
}

export async function registerPush(onTap) {
  if (isIos) return registerPushIos(onTap);
  if (!Push) return false;
  try {
    let status = await Push.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') status = await Push.requestPermissions();
    if (status.receive !== 'granted') return false;
    if (!listening) {
      listening = true;
      Push.addListener('registration', async (token) => { try { await post('/api/push-tokens', { platform: 'android', token: token.value }); await store.set('pushToken', token.value); } catch { /* se reintenta al abrir */ } });
      Push.addListener('pushNotificationActionPerformed', (event) => onTap?.(event.notification?.data || {}));
    }
    await Push.createChannel?.({ id: 'alerts', name: 'Alertas de los GPS', description: 'Desvíos de ruta, cortes de energía, exceso de velocidad y más', importance: 5, visibility: 1, vibration: true });
    await Push.register();
    return true;
  } catch { return false; }
}

/** Al cerrar sesión este teléfono deja de recibir los avisos de la cuenta. */
export async function unregisterPush() {
  const token = await store.get('pushToken');
  if (!token) return;
  try { await del('/api/push-tokens', { token }); } catch { /* sin red: el servidor lo desactiva cuando Firebase lo rechace */ }
  if (isIos) { try { const { FirebaseMessaging } = await import('@capacitor-firebase/messaging'); await FirebaseMessaging.deleteToken(); } catch { /* sin plugin o sin red */ } }
  await store.set('pushToken', null);
}
