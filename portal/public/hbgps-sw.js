// Service worker de HB GPS: recibe los avisos (Firebase Cloud Messaging) aunque la pestaña esté en segundo plano o cerrada.
// - Muestra la notificación del sistema (con el sonido y la vibración del navegador/teléfono).
// - Avisa a las pestañas abiertas para que hagan sonar la alerta de HB GPS (el sonido propio solo existe con una pestaña abierta).
// El servidor manda solo datos (title, body, severity, tag, url): aquí se decide cómo mostrarlos.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const d = payload.data || payload.notification || payload || {};
  const title = d.title || 'HB GPS';
  const body = d.body || '';
  const severity = d.severity || 'warning';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'hbgps-alert', severity, title, body, deviceId: d.deviceId || null });
    // Con la pestaña a la vista el portal ya muestra el aviso y suena; fuera de ella, notificación del sistema.
    if (windows.some((client) => client.visibilityState === 'visible' && client.focused)) return;
    await self.registration.showNotification(title, {
      body, tag: d.tag || 'hbgps', renotify: true, requireInteraction: severity === 'critical', silent: false,
      icon: '/icon-192.png', badge: '/icon-192.png', vibrate: severity === 'critical' ? [300, 120, 300, 120, 300] : [200, 100, 200],
      data: { url: d.url || '/', deviceId: d.deviceId || null }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) { await open.focus(); open.postMessage({ type: 'hbgps-open', deviceId: event.notification.data && event.notification.data.deviceId }); return; }
    await self.clients.openWindow(target);
  })());
});
