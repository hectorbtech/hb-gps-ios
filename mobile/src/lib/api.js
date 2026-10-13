import { Capacitor } from '@capacitor/core';
import { ApiError, explain as baseExplain } from '@portal/lib/api.js';
import { store } from './storage.js';

export { ApiError };
export const explain = (error) => (error?.code === 'HB_GPS_NO_CONNECTION' ? 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.' : error?.code === 'HB_GPS_AUTH_REQUIRED' ? 'Tu sesión venció. Entra de nuevo.' : baseExplain(error));
// Servidor de HB GPS (IP del relay, sin dominio). Va fijo en la app: el cliente no lo ve ni lo cambia; si cambia, se publica una APK nueva.
export const DEFAULT_SERVER = 'https://hectorgps.com';
export const isNative = Capacitor.isNativePlatform();

const state = { base: isNative ? DEFAULT_SERVER : '', token: null, onUnauthorized: null };

export async function initApi() {
  if (isNative) { state.base = DEFAULT_SERVER; store.set('server', null); }
  state.token = await store.get('token');
}
export const getServerBase = () => state.base;
export const hasToken = () => Boolean(state.token);
export const setUnauthorizedHandler = (fn) => { state.onUnauthorized = fn; };
export async function setToken(token) { state.token = token || null; await store.set('token', token || null); }

const headers = (extra = {}) => ({ ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...extra });

export async function request(path, { method = 'GET', body, raw = false, signal } = {}) {
  let response;
  try {
    response = await fetch(`${state.base}${path}`, { method, signal, headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('HB_GPS_NO_CONNECTION', 0);
  }
  if (raw) return response;
  if (response.status === 204) return { data: null };
  const json = await response.json().catch(() => ({}));
  if (response.status === 401 && state.token && !path.startsWith('/api/auth/login')) state.onUnauthorized?.();
  if (!response.ok) throw new ApiError(json.error || `HTTP_${response.status}`, response.status, json.details);
  return json;
}
export const get = (path, opts) => request(path, opts).then((r) => r.data);
export const getFull = (path, opts) => request(path, opts);
export const post = (path, body) => request(path, { method: 'POST', body: body ?? {} });
export const put = (path, body) => request(path, { method: 'PUT', body });
export const patch = (path, body) => request(path, { method: 'PATCH', body });
export const del = (path, body) => request(path, { method: 'DELETE', body });
export const qs = (params) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const s = q.toString(); return s ? `?${s}` : ''; };

// Flujo en vivo (SSE) con el token en la cabecera: EventSource no permite cabeceras, así que se lee el flujo con fetch.
export function openStream(path, onEvent, { onOpen, onClose } = {}) {
  const controller = new AbortController();
  (async () => {
    try {
      const response = await fetch(`${state.base}${path}`, { headers: headers({ Accept: 'text/event-stream' }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`HTTP_${response.status}`);
      onOpen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, '');
          let type = 'message';
          const data = [];
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
          }
          if (data.length) { try { onEvent(type, JSON.parse(data.join('\n'))); } catch { /* latido o mensaje ajeno */ } }
        }
      }
    } catch (err) { if (err?.name === 'AbortError') return; }
    if (!controller.signal.aborted) onClose?.();
  })();
  return () => controller.abort();
}
