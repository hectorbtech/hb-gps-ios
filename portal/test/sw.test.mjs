import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// El service worker se prueba con un `self` de mentira: recibe el aviso de Firebase (solo datos), avisa a las pestañas y muestra la notificación del sistema solo si ninguna está a la vista.
function load(windows) {
  const handlers = {}; const shown = []; const messages = []; const opened = [];
  const self = {
    location: { origin: 'https://gps.test' },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {}, clients: { claim: () => {}, matchAll: async () => windows.map((w) => ({ ...w, postMessage: (m) => messages.push(m), focus: async () => {} })), openWindow: async (url) => opened.push(url) },
    registration: { showNotification: async (title, options) => shown.push({ title, options }) }
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/hbgps-sw.js', import.meta.url), 'utf8'), { self, URL, console });
  const push = async (payload) => { const waits = []; handlers.push({ data: { json: () => payload }, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  return { push, shown, messages, opened, handlers };
}

test('aviso con la pestaña oculta: notificación del sistema y señal para que suene', async () => {
  const sw = load([{ visibilityState: 'hidden', focused: false, url: 'https://gps.test/' }]);
  await sw.push({ data: { title: 'Camión 12', body: 'SOS presionado', severity: 'critical', deviceId: 'd1', tag: 'hbgps-d1', url: '/#/live' }, from: '1234' });
  assert.equal(sw.shown.length, 1);
  assert.deepEqual([sw.shown[0].title, sw.shown[0].options.body, sw.shown[0].options.requireInteraction, sw.shown[0].options.silent], ['Camión 12', 'SOS presionado', true, false]);
  assert.deepEqual(JSON.parse(JSON.stringify(sw.messages[0])), { type: 'hbgps-alert', severity: 'critical', title: 'Camión 12', body: 'SOS presionado', deviceId: 'd1' });
});

test('con la pestaña a la vista no se duplica la notificación; sin ninguna pestaña abierta se muestra igual', async () => {
  const visible = load([{ visibilityState: 'visible', focused: true, url: 'https://gps.test/' }]);
  await visible.push({ data: { title: 'A', body: 'b', severity: 'warning' } });
  assert.equal(visible.shown.length, 0);
  assert.equal(visible.messages.length, 1);
  const closed = load([]);
  await closed.push({ data: { title: 'A', body: 'b', severity: 'warning' } });
  assert.equal(closed.shown.length, 1);
  assert.equal(closed.shown[0].options.requireInteraction, false);
});

test('tocar la notificación abre HB GPS si no había pestaña', async () => {
  const sw = load([]);
  const waits = [];
  sw.handlers.notificationclick({ notification: { close() {}, data: { url: '/#/live' } }, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(sw.opened, ['/#/live']);
});
