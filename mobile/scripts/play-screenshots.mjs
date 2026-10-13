// Capturas para la ficha de Google Play (telefono 1080 x 2106 por defecto; tabletas y escritorio con VIEW y OUT) con datos de demostracion.
// Requiere la API de pruebas (node hb-gps/api/dev-local.mjs, puerto 8780), los simuladores de GPS en marcha y la app (npm run dev, puerto 5192).
// Uso: node scripts/play-screenshots.mjs   → store/play-assets/capturas/*.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// VIEW=anchoxalto@escala (por defecto 400x780@2.7 = telefono) y OUT=carpeta de salida dentro de store/play-assets.
const [vw, vh, vs] = (process.env.VIEW || '400x780@2.7').split(/[x@]/).map(Number);
const outDir = path.resolve(here, '../store/play-assets', process.env.OUT || 'capturas');
fs.mkdirSync(outDir, { recursive: true });
const APP = process.env.APP_URL || 'http://127.0.0.1:5192/';
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hbgps-shots-'));
const browser = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=es-DO', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let list = [];
for (let i = 0; i < 40 && !list.length; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); list = list.filter((t) => t.type === 'page'); } catch { /* aun arrancando */ } if (!list.length) await sleep(500); }
if (!list.length) throw new Error('No arranco el navegador');
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const waiting = new Map();
ws.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.data, 'base64')); console.log('captura', name); };
// Pulsa el primer elemento visible que coincida con el selector y (opcional) contenga el texto.
const click = (selector, text = '') => evaluate(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !${JSON.stringify(text)} || e.textContent.includes(${JSON.stringify(text)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(text)})); const el = els[0]; if (!el) return false; el.click(); return true; })()`);
const setValue = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
// Espera (hasta 60 s) a que exista un elemento: el servidor de desarrollo en frio tarda en compilar y las esperas fijas dejaban capturas en blanco.
const waitFor = async (selector, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true; await sleep(500); } throw new Error('no aparecio ' + selector); };
const step = async (label, fn) => { try { await fn(); } catch (error) { console.log('AVISO', label, error.message); } };

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: vs, mobile: vw < 900 });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
await send('Page.navigate', { url: APP });
await waitFor('#correo');
await sleep(1500);

await step('login', async () => { await shot('00-entrar'); await setValue('#correo', 'demo@hbgps.local'); await setValue('#clave', 'Clave-Demo-2026!'); await sleep(300); await click('button[type=submit]'); });
await waitFor('nav .tab'); // ya entro
await sleep(9000); // mapa, posiciones y baldosas
await step('mapa', async () => { await click('button.fab', 'Ver todos'); await sleep(7000); await shot('01-mapa-flota'); });
await step('seleccion', async () => { await click('button.drow'); }); // abre la lista de resultados si hay buscador; si no, no pasa nada
await step('lista', async () => { await click('nav .tab', 'Equipos'); await sleep(1500); await shot('02-equipos'); });
await step('seleccion mapa', async () => { await click('button.drow'); await sleep(10000); await shot('03-mapa-resumen'); });
await step('detalle', async () => { await click('button.act.p', 'Detalles'); await sleep(2500); await shot('04-detalle'); });
await step('detalle equipo', async () => { await click('[role=tab]', 'Alertas'); await sleep(1200); await shot('05-detalle-alertas'); });
await step('historial', async () => { await click('button.act.p', 'Historial'); await sleep(1500); await click('button.chip', 'Hoy'); await sleep(4000); await shot('06-historial'); await click('button.play'); await sleep(2500); await shot('06b-historial-reproduccion'); });
await step('volver', async () => { await click('button.backbtn'); await sleep(1200); });
await step('comandos', async () => { await click('button.act', 'Comandos'); await sleep(2000); await shot('07-comandos'); await click('button[aria-label=Volver]'); await sleep(800); });
await step('volver 2', async () => { await click('button.backbtn'); await sleep(1000); });
await step('alertas', async () => { await click('nav .tab', 'Alertas'); await sleep(2000); await shot('08-alertas'); });
await step('cuenta', async () => { await click('nav .tab', 'Cuenta'); await sleep(1500); await shot('09-cuenta'); });

ws.close(); browser.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* temporal */ }
console.log('Listo →', outDir);
process.exit(0);
